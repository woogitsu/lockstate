import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import {
  migrateSaveEnvelopeV1ToV2,
  migrateSaveEnvelopeV2ToV3,
  migrateSaveEnvelopeV3ToV4,
} from '../../src/persistence/save-migrations';
import {
  SAVE_SCHEMA_VERSION,
  createSaveEnvelope,
  decodeSaveEnvelope,
  type SaveEnvelopeV1,
  type SaveEnvelopeV3,
} from '../../src/persistence/save-schema';
import { NEED_IDS, NEED_MAX, NEED_MAX_SCALED, NEED_SCALE, type NeedId } from '../../src/simulation/prisoners/needs';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import type { JsonValue } from '../../src/shared/json';
import freshPrisonFixture from '../fixtures/persistence/save-v1-fresh-prison.json';
import inProgressFixture from '../fixtures/persistence/save-v1-in-progress.json';

/**
 * Save-schema V3 -> V4 (#259): need levels stop being whole 0-255 levels and
 * become those levels scaled by `NEED_SCALE`.
 *
 * This is the first migration in the chain that rewrites the *simulation*
 * section rather than carrying it across, because it is the first where a
 * field changed **meaning** rather than shape. `hunger: 200` is a
 * nearly-satisfied prisoner in a V3 save and a starving one read as V4, and
 * nothing in the value distinguishes the two -- so the version is what
 * distinguishes them, and this step is what converts.
 *
 * ## Where the V3 saves under test come from
 *
 * Two provenances, deliberately, because they cover different halves:
 *
 * - **The checked-in V1 fixtures, walked forward by the frozen V1->V2 and
 *   V2->V3 steps.** Those saves carry no `simulation` section at all, which is
 *   the case this migration must leave completely alone. Same construction as
 *   `save-v2-to-v3.test.ts` uses, and for the same reason: `git diff --
 *   tests/fixtures/` stays empty.
 * - **A real captured session whose need arrays are rewritten to whole
 *   levels.** A V3 payload and a V4 payload differ in *nothing* but those six
 *   arrays' units, so a current capture with whole-level needs is exactly the
 *   byte shape a V3 build wrote -- and the levels are chosen here by hand, so
 *   the expected output is not computed by the code under test.
 */

/** A structured clone through JSON — how a save actually reaches `decodeSaveEnvelope` from storage. */
function throughStorage<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function v3EnvelopeFromV1(fixture: unknown): SaveEnvelopeV3 {
  return migrateSaveEnvelopeV2ToV3(migrateSaveEnvelopeV1ToV2(fixture as SaveEnvelopeV1));
}

/** The whole-level values a V3 save holds for the one prisoner below — chosen, not derived. */
const V3_LEVELS: Readonly<Record<NeedId, number>> = {
  hunger: 200,
  sleep: 137,
  hygiene: 0,
  bladder: NEED_MAX,
  safety: 1,
  recreation: 254,
};

/**
 * A genuine V3 envelope holding one prisoner, built by capturing a real
 * session and replacing the (scaled) need arrays with whole-level ones.
 */
function v3EnvelopeWithPrisoner(): { readonly envelope: SaveEnvelopeV3; readonly activeLength: number } {
  const runtime = createNewSimulationRuntime(0x5ca1e);
  runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 240_000, priorIncidents: 1 }, { x: 2, y: 2 });
  for (let tick = 0; tick < 40; tick += 1) runtime.kernel.step();

  const bundle = captureSessionSnapshot(runtime);
  if (bundle.simulation === undefined) throw new Error('a captured session with a prisoner must carry a simulation section');

  const components = bundle.simulation.prisoners.components;
  const activeLength = components.activeLength;
  expect(activeLength).toBeGreaterThan(0);

  const wholeLevelNeeds = Object.fromEntries(
    NEED_IDS.map((needId) => [needId, new Array<number>(activeLength).fill(V3_LEVELS[needId])]),
  ) as unknown as Record<NeedId, readonly number[]>;

  /*
   * The capture is a *current* one, so two things about it are newer than V3
   * and have to be undone here for this to be a genuine V3 payload. Undone
   * rather than tolerated, because the point of building the input from a real
   * session is that it is the byte shape an older build wrote -- and
   * `sessionSystemsV3Schema` is `.strict()`, so an `objects` key or a room
   * instance carrying a rectangle instead of a `capacity` would be rejected by
   * the very schema this test is walking a save forward from.
   *
   *   - `objects` did not exist before V5 and is dropped, and `alerts` did
 *     not exist until the owner's decisions of 2026-09-01 on ADR 0084 (the
 *     alerts log survives a reload) put it beside `objects` under the same
 *     optional-field rule -- so it is dropped for the same reason and by the
 *     same sentence.
   *   - a room instance carried an authored `capacity` and
   *     `objectCapabilities` and no rectangle, so each row is rewritten into
   *     that shape. `0` and `[]` are not chosen here: they are what
   *     `RoomZoningService` wrote unconditionally for every instance any V3 or
   *     V4 build could produce, which is the same fact
   *     `migrateSaveEnvelopeV4ToV5` relies on in the other direction.
   */
  const { objects: _objects, alerts: _alerts, regimeSchedules: _regimeSchedules, roomFilth: _roomFilth, ...simulationWithoutObjects } = bundle.simulation;
  const payload = {
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    simulation: {
      ...simulationWithoutObjects,
      prisoners: {
        ...bundle.simulation.prisoners,
        components: { ...components, needs: wholeLevelNeeds },
        roomInstanceDefinitions: bundle.simulation.prisoners.roomInstanceDefinitions.map((instance) => ({
          instanceId: instance.instanceId,
          roomCatalogId: instance.roomCatalogId,
          anchorTile: instance.anchorTile,
          capacity: 0,
          objectCapabilities: [],
        })),
      },
    },
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  };

  return {
    activeLength,
    envelope: {
      saveSchemaVersion: 3,
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'v3-prison',
      revision: 4,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
      checksum: computeSaveChecksum(payload as unknown as JsonValue),
      payload,
    } as unknown as SaveEnvelopeV3,
  };
}

describe('save-schema V3 -> V4 migration', () => {
  it('rescales every need level by NEED_SCALE, and touches nothing else', () => {
    const { envelope, activeLength } = v3EnvelopeWithPrisoner();
    const v4 = migrateSaveEnvelopeV3ToV4(envelope);

    expect(v4.saveSchemaVersion).toBe(4);
    const migratedNeeds = v4.payload.simulation!.prisoners.components.needs;
    for (const needId of NEED_IDS) {
      expect(migratedNeeds[needId], needId).toEqual(new Array<number>(activeLength).fill(V3_LEVELS[needId] * NEED_SCALE));
    }

    // Everything outside the six need arrays crosses untouched.
    expect(v4.payload.kernel).toEqual(envelope.payload.kernel);
    expect(v4.payload.world).toEqual(envelope.payload.world);
    expect(v4.payload.construction).toEqual(envelope.payload.construction);
    expect(v4.payload.entities).toEqual(envelope.payload.entities);
    expect(v4.payload.identity).toEqual(envelope.payload.identity);
    const { needs: _v3Needs, ...v3Rest } = envelope.payload.simulation!.prisoners.components;
    const { needs: _v4Needs, ...v4Rest } = v4.payload.simulation!.prisoners.components;
    expect(v4Rest).toEqual(v3Rest);
    expect(v4.payload.simulation!.security).toEqual(envelope.payload.simulation!.security);
    expect(v4.payload.simulation!.incidents).toEqual(envelope.payload.simulation!.incidents);
  });

  it('leaves a full-level need at the stored maximum rather than overflowing past it', () => {
    // `bladder` is at `NEED_MAX` in the fixture above, which is the boundary
    // case: 255 * 200 must land exactly on `NEED_MAX_SCALED`, the largest
    // value V4's schema and `Uint16Array` accept.
    const { envelope } = v3EnvelopeWithPrisoner();
    const v4 = migrateSaveEnvelopeV3ToV4(envelope);
    for (const level of v4.payload.simulation!.prisoners.components.needs.bladder) {
      expect(level).toBe(NEED_MAX_SCALED);
    }
  });

  it('carries a V3 prisoner through a full decode at their real levels, not at 1/200th of them', () => {
    // The consequence if this step were skipped: every prisoner in every
    // existing save would load two hundred times more depleted than they were.
    const { envelope } = v3EnvelopeWithPrisoner();
    const result = decodeSaveEnvelope(throughStorage(envelope));
    expect(result).toMatchObject({ ok: true, migrated: true });
    if (!result.ok) return;

    const { runtime } = restoreSimulationRuntime(result.value.payload as unknown as SessionSnapshotBundle);
    const index = 0;
    for (const needId of NEED_IDS) {
      expect(runtime.prisoners.needs.get(index, needId), needId).toBe(V3_LEVELS[needId]);
    }
  });

  it('re-checksums the migrated save so it decodes again as a current-version one', () => {
    const { envelope } = v3EnvelopeWithPrisoner();
    const migrated = decodeSaveEnvelope(throughStorage(envelope));
    if (!migrated.ok) throw new Error('the V3 save must migrate for this test to be meaningful');

    const again = decodeSaveEnvelope(throughStorage(migrated.value));
    expect(again).toMatchObject({ ok: true, migrated: false });
    if (!again.ok) return;
    expect(again.value).toStrictEqual(migrated.value);
    expect(migrated.value.checksum).toBe(computeSaveChecksum(migrated.value.payload as unknown as JsonValue));
  });

  it('rejects a corrupt V3 save at the version it was written, before the rescale runs', () => {
    const { envelope } = v3EnvelopeWithPrisoner();
    const tampered = JSON.parse(JSON.stringify(envelope)) as { payload: { kernel: { tick: number } } };
    tampered.payload.kernel.tick += 1;
    expect(decodeSaveEnvelope(tampered)).toMatchObject({ ok: false, error: { code: 'checksum-mismatch', atVersion: 3 } });
  });

  it('rejects a V3 save whose need levels are outside the whole-level range, at V3', () => {
    // A save carrying already-scaled levels but declaring version 3 would be
    // migrated a second time and land at 200x its real values. V3's frozen
    // bound is what stops it, and it stops it at V3 rather than at V4.
    const { envelope } = v3EnvelopeWithPrisoner();
    const broken = JSON.parse(JSON.stringify(envelope)) as {
      payload: { simulation: { prisoners: { components: { needs: Record<string, number[]> } } } };
    };
    broken.payload.simulation.prisoners.components.needs.hunger = broken.payload.simulation.prisoners.components.needs.hunger!.map(
      () => NEED_MAX_SCALED,
    );
    expect(decodeSaveEnvelope(broken)).toMatchObject({ ok: false, error: { code: 'invalid-shape', atVersion: 3 } });
  });

  it('rejects a current-version save whose need levels exceed the scaled maximum', () => {
    const runtime = createNewSimulationRuntime(0x5ca1e);
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 240_000, priorIncidents: 1 }, { x: 2, y: 2 });
    const bundle = captureSessionSnapshot(runtime);
    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'v4-prison',
      revision: 1,
      createdAt: 1,
      updatedAt: 2,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
    expect(envelope.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);

    const broken = JSON.parse(JSON.stringify(envelope)) as {
      payload: { simulation: { prisoners: { components: { needs: Record<string, number[]> } } } };
    };
    broken.payload.simulation.prisoners.components.needs.hunger = broken.payload.simulation.prisoners.components.needs.hunger!.map(
      () => NEED_MAX_SCALED + 1,
    );
    expect(decodeSaveEnvelope(broken)).toMatchObject({ ok: false, error: { code: 'invalid-shape', atVersion: SAVE_SCHEMA_VERSION } });
  });

  for (const { name, fixture } of [
    { name: 'fresh prison (no entities section)', fixture: freshPrisonFixture },
    { name: 'in-progress prison (entities section present)', fixture: inProgressFixture },
  ]) {
    it(`leaves a V3 "${name}" save with no simulation section absent, rather than fabricating one`, () => {
      const v3 = v3EnvelopeFromV1(fixture);
      const v4 = migrateSaveEnvelopeV3ToV4(v3);

      expect('simulation' in v4.payload).toBe(false);
      expect(v4.payload).toEqual(v3.payload);
      // Nothing changed, so the recomputed checksum must equal the stored one.
      expect(v4.checksum).toBe(v3.checksum);
    });

    it(`walks a checked-in V1 "${name}" fixture all the way to V4 in one decode, unmodified`, () => {
      const before = JSON.stringify(fixture);
      const result = decodeSaveEnvelope(fixture);
      expect(result).toMatchObject({ ok: true, migrated: true });
      if (!result.ok) return;

      expect(result.value.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(JSON.stringify(fixture)).toBe(before);
    });
  }

  it('never mutates the envelope it was handed', () => {
    const { envelope } = v3EnvelopeWithPrisoner();
    const before = JSON.stringify(envelope);
    migrateSaveEnvelopeV3ToV4(envelope);
    expect(JSON.stringify(envelope)).toBe(before);
  });
});
