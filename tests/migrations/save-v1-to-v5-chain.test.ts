import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { decodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from '../../src/persistence/entity-codec';
import {
  migrateSaveEnvelopeV1ToV2,
  migrateSaveEnvelopeV2ToV3,
  migrateSaveEnvelopeV3ToV4,
  migrateSaveEnvelopeV4ToV5,
} from '../../src/persistence/save-migrations';
import {
  SAVE_SCHEMA_VERSION,
  decodeSaveEnvelope,
  type SaveEnvelopeV1,
} from '../../src/persistence/save-schema';
import type { JsonValue } from '../../src/shared/json';
import freshPrisonFixture from '../fixtures/persistence/save-v1-fresh-prison.json';
import inProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

/**
 * The whole V1 -> V5 chain, asserted **against the checked-in V1 fixture at
 * every link** rather than against whatever the previous step produced.
 *
 * The per-step files already exist and each is thorough about the field its
 * own step reshapes. What this file adds is the property none of them can
 * state, because of how they are written: `save-v2-to-v3.test.ts` builds its
 * V2 input by calling `migrateSaveEnvelopeV1ToV2` on a fixture and then
 * asserts `result.value.payload.world` equals `v2.payload.world` — both sides
 * of that comparison are downstream of the step that produced them, so it
 * guards V2 -> V5 and is structurally blind to anything V1 -> V2 does to
 * `world`. A comparison of a migration's output against the same migration's
 * output proves the four later steps carry a field; it cannot prove the first
 * one did.
 *
 * That blindness was measured rather than argued. Rewriting
 * `migrateSaveEnvelopeV1ToV2`'s one line to
 *
 * ```ts
 * world: { ...payload.world, ownedChunks: [], parcels: [] },
 * ```
 *
 * — a schema-valid V2 payload in which the player has lost every owned chunk
 * and every parcel the prison was ever sold — left all 2,345 tests in the
 * suite passing. The same edit applied to `migrateSaveEnvelopeV4ToV5` fails
 * three. `world` was the only carried section with that asymmetry: `kernel`
 * and `construction` are already compared against the raw fixture in
 * `save-v1-to-v2.test.ts`, and the checksum cannot substitute for either
 * comparison, because every step recomputes it over whatever payload the step
 * chose to emit.
 *
 * Two fixtures, and the difference matters here: `save-v1-fresh-prison.json`
 * has no `parcels`/`ownedParcels` keys at all, so only the in-progress one can
 * witness a dropped parcel. Neither is edited by anything in this file —
 * `git diff -- tests/fixtures/` staying empty is part of the migration
 * contract.
 */

const V1_FIXTURES = [
  { name: 'fresh prison (no entities section)', fixture: freshPrisonFixture },
  { name: 'in-progress prison (entities, parcels and owned parcels)', fixture: inProgressFixture },
];

/** The four steps, named so a failure says which link broke rather than "the chain". */
const CHAIN = [
  { toVersion: 2, step: (input: unknown) => migrateSaveEnvelopeV1ToV2(input as SaveEnvelopeV1) as unknown },
  { toVersion: 3, step: (input: unknown) => migrateSaveEnvelopeV2ToV3(input as never) as unknown },
  { toVersion: 4, step: (input: unknown) => migrateSaveEnvelopeV3ToV4(input as never) as unknown },
  { toVersion: 5, step: (input: unknown) => migrateSaveEnvelopeV4ToV5(input as never) as unknown },
] as const;

interface CarriedPayload {
  readonly kernel: unknown;
  readonly world: unknown;
  readonly construction: unknown;
  readonly entities?: unknown;
}

interface CarriedEnvelope {
  readonly saveSchemaVersion: number;
  readonly gameVersion: string;
  readonly prisonId: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly checksum: string;
  readonly payload: CarriedPayload;
}

function asEnvelope(value: unknown): CarriedEnvelope {
  return value as CarriedEnvelope;
}

/** A structured clone through JSON — how a save actually reaches `decodeSaveEnvelope` from storage. */
function throughStorage<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe('the V1 -> V5 chain carries every V1 field, link by link', () => {
  for (const { name, fixture } of V1_FIXTURES) {
    /**
     * The point of asserting *after every step* rather than only at V5: a
     * chain-wide comparison says a field was lost, a per-link one says where.
     */
    it(`carries the "${name}" fixture's kernel, world and construction across all four steps`, () => {
      const before = JSON.stringify(fixture);
      let current: unknown = fixture;

      for (const { toVersion, step } of CHAIN) {
        current = step(current);
        const payload = asEnvelope(current).payload;

        expect(asEnvelope(current).saveSchemaVersion, `step -> V${toVersion} must declare V${toVersion}`).toBe(toVersion);
        // Compared against the *fixture*, never against the previous step's
        // output — see this file's header for why that distinction is the
        // whole reason it exists.
        expect(payload.kernel, `kernel must survive -> V${toVersion}`).toEqual(fixture.payload.kernel);
        expect(payload.world, `world must survive -> V${toVersion}`).toEqual(fixture.payload.world);
        expect(payload.construction, `construction must survive -> V${toVersion}`).toEqual(fixture.payload.construction);
      }

      // No step mutates the object it was handed, at any link.
      expect(JSON.stringify(fixture)).toBe(before);
    });

    it(`decodes the "${name}" fixture straight to V${SAVE_SCHEMA_VERSION} with the same three sections intact`, () => {
      // The chain as a player meets it: one `decodeSaveEnvelope` call on a
      // save written by the first release.
      const result = decodeSaveEnvelope(fixture);
      expect(result).toMatchObject({ ok: true, migrated: true });
      if (!result.ok) return;

      expect(result.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(result.value.payload.kernel).toEqual(fixture.payload.kernel);
      expect(result.value.payload.world).toEqual(fixture.payload.world);
      expect(result.value.payload.construction).toEqual(fixture.payload.construction);

      // Metadata is untouched by every step (each spreads `...metadata`).
      expect(result.value.gameVersion).toBe(fixture.gameVersion);
      expect(result.value.prisonId).toBe(fixture.prisonId);
      expect(result.value.revision).toBe(fixture.revision);
      expect(result.value.createdAt).toBe(fixture.createdAt);
      expect(result.value.updatedAt).toBe(fixture.updatedAt);

      // Self-consistent at the end of the chain, and a V5 save from then on.
      expect(result.value.checksum).toBe(computeSaveChecksum(result.value.payload as unknown as JsonValue));
      expect(decodeSaveEnvelope(throughStorage(result.value))).toMatchObject({ ok: true, migrated: false });
    });

    /**
     * V1 could hold exactly four payload sections. The three later ones
     * (`simulation`, `identity`, and V5's `objects` inside `simulation`) are
     * absent rather than empty, on the reasoning `migrateSaveEnvelopeV2ToV3`
     * states: an empty section asserts "this prison had none", an absent one
     * says "this save does not know". Asserted on the exact key set, so a
     * future step that fabricated one is caught by name.
     */
    it(`invents no section for the "${name}" fixture, at any link in the chain`, () => {
      const expectedKeys = Object.keys(fixture.payload).sort();
      let current: unknown = fixture;

      for (const { toVersion, step } of CHAIN) {
        current = step(current);
        expect(Object.keys(asEnvelope(current).payload).sort(), `payload keys at V${toVersion}`).toEqual(expectedKeys);
      }

      const result = decodeSaveEnvelope(fixture);
      if (!result.ok) throw new Error('the fixture must migrate for this test to be meaningful');
      expect(Object.keys(result.value.payload).sort()).toEqual(expectedKeys);
    });
  }

  /**
   * `world` is the section this file was written for; these are the two
   * specific losses the measured coverage gap admitted, named individually so
   * a failure reads as "the prison lost its land" rather than as a deep-equal
   * diff.
   */
  it('keeps the in-progress prison’s owned chunks, parcels and owned parcels all the way to V5', () => {
    const v1World = inProgressFixture.payload.world;
    expect(v1World.ownedChunks.length).toBeGreaterThan(0);
    expect(v1World.parcels.length).toBeGreaterThan(0);
    expect(v1World.ownedParcels.length).toBeGreaterThan(0);

    const result = decodeSaveEnvelope(inProgressFixture);
    if (!result.ok) throw new Error('the fixture must migrate for this test to be meaningful');

    const world = result.value.payload.world;
    expect(world.chunkSize).toBe(v1World.chunkSize);
    expect(world.chunks).toEqual(v1World.chunks);
    expect(world.ownedChunks).toEqual(v1World.ownedChunks);
    expect(world.parcels).toEqual(v1World.parcels);
    expect(world.ownedParcels).toEqual(v1World.ownedParcels);
  });

  /**
   * The one V1 section the chain genuinely rewrites (#50, V1 -> V2). Asserted
   * here as the *end-to-end* property — decode the V1 fixture, decode the
   * ledger back, get the V1 liveness — rather than re-testing the encoder,
   * which `save-v1-to-v2.test.ts` already owns.
   */
  it('reshapes the entity ledger without changing which entities are alive', () => {
    const v1Entities = inProgressFixture.payload.entities;
    const result = decodeSaveEnvelope(inProgressFixture);
    if (!result.ok) throw new Error('the fixture must migrate for this test to be meaningful');
    if (result.value.payload.entities === undefined) throw new Error('the migrated payload must carry an entities section');

    // Cast for the same reason `save-v1-to-v2.test.ts`'s `entitiesOf` casts:
    // crossing the `DeepReadonly`/JSON boundary widens the codec's
    // `RunLength` 2-tuples back to `readonly number[]`. The schema has
    // already validated them as pairs at this point.
    const decoded = decodeEntityStoreSnapshot(result.value.payload.entities as unknown as EncodedEntityStoreSnapshot);
    expect(decoded.capacity).toBe(v1Entities.capacity);
    expect(decoded.nextAvailableIndex).toBe(v1Entities.nextAvailableIndex);
    expect(decoded.maxActiveIndex).toBe(v1Entities.maxActiveIndex);
    expect(decoded.freeCount).toBe(v1Entities.freeCount);
    expect(Array.from(decoded.generations)).toEqual(v1Entities.generations);
    expect(Array.from(decoded.alive)).toEqual(v1Entities.alive);
  });

  /**
   * Every step recomputes the checksum over the payload it emitted, so the
   * stored value can never disagree with the payload at any version — which
   * is also precisely why the checksum cannot stand in for the field-by-field
   * comparisons above.
   */
  it('emits a self-consistent checksum at every link, and a different one only where the payload changed', () => {
    let current: unknown = inProgressFixture;
    const checksums: string[] = [asEnvelope(current).checksum];

    for (const { toVersion, step } of CHAIN) {
      current = step(current);
      const envelope = asEnvelope(current);
      expect(envelope.checksum, `V${toVersion} checksum must cover its own payload`).toBe(
        computeSaveChecksum(envelope.payload as unknown as JsonValue),
      );
      checksums.push(envelope.checksum);
    }

    // V1 -> V2 is the only step that rewrites this fixture's payload, so it is
    // the only link whose checksum may move.
    expect(checksums[0]).not.toBe(checksums[1]);
    expect(new Set(checksums.slice(1)).size).toBe(1);
  });
});
