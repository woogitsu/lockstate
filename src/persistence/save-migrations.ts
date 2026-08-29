import { computeSaveChecksum } from './checksum';
import { encodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from './entity-codec';
import type { JsonValue } from '../shared/json';
import { NEED_IDS, NEED_MAX_SCALED, NEED_SCALE } from '../simulation/prisoners/needs';
import type {
  SaveEnvelopeV1,
  SaveEnvelopeV2,
  SaveEnvelopeV3,
  SaveEnvelopeV4,
  SaveEnvelopeV5,
  SavePayloadV1,
  SavePayloadV3,
  SavePayloadV4,
} from './save-schema';

/**
 * Forward migrations between save-schema versions.
 *
 * Kept out of `save-schema.ts` so that file stays the *shape* authority
 * (every version's Zod schema, registered once and never edited) while this
 * file holds the one-way transformations between those shapes. Only
 * `import type` crosses back to `save-schema.ts`, so there is no runtime
 * import cycle.
 */

type EncodedEntityStoreSnapshotV1 = NonNullable<SavePayloadV1['entities']>;

/**
 * Re-encodes V1's capacity-shaped liveness arrays into V2's population-shaped
 * form by routing them through the *same* encoder a live store uses, so a
 * migrated save and a freshly captured one converge on one encoding rather
 * than two that could drift.
 *
 * V1's schema constrained the three arrays only to be numeric, never to be
 * exactly `capacity` long, so they are normalised here (truncated or
 * zero-padded to `capacity`) before encoding. A V1 save produced by this
 * codebase always had `capacity`-long arrays and a `freeCount` within them,
 * so for every real save this normalisation is the identity.
 */
function upgradeEntityLiveness(v1: EncodedEntityStoreSnapshotV1): EncodedEntityStoreSnapshot {
  const capacity = v1.capacity;

  const generations = new Uint16Array(capacity);
  generations.set(v1.generations.slice(0, capacity));

  const alive = new Uint8Array(capacity);
  alive.set(v1.alive.slice(0, capacity));

  // `freeCount` is dropped in V2 (it is `freeIndices.length` there), so an
  // inconsistent V1 pair is resolved to the entries that actually exist.
  const freeCount = Math.max(0, Math.min(v1.freeCount, v1.freeIndices.length, capacity));
  const freeIndices = new Uint32Array(capacity);
  freeIndices.set(v1.freeIndices.slice(0, freeCount));

  return encodeEntityStoreSnapshot({
    capacity,
    nextAvailableIndex: v1.nextAvailableIndex,
    maxActiveIndex: v1.maxActiveIndex,
    freeCount,
    generations,
    freeIndices,
    alive,
  });
}

/**
 * V1 -> V2: the entity-liveness ledger stops being written at the store's
 * allocated capacity and starts being written at its population (#50).
 * Everything else in the envelope is carried across unchanged.
 *
 * **The checksum is recomputed**, because it covers the payload and the
 * payload changed. That does not weaken corruption detection:
 * `decodeSaveEnvelope` verifies the *stored* checksum against the payload as
 * written, at its declared version. It does so *after* running the whole
 * migration chain, not before -- so this function is reached with a corrupt
 * V1 save, and the value it produces is discarded a moment later when the
 * as-written comparison fails. What matters for corruption detection is
 * which bytes are compared, not when: the comparison never sees this
 * function's output.
 *
 * Pure: builds new objects and never mutates `input`.
 */
export function migrateSaveEnvelopeV1ToV2(input: SaveEnvelopeV1): SaveEnvelopeV2 {
  const { saveSchemaVersion: _version, checksum: _checksum, payload, ...metadata } = input;

  const migratedPayload = {
    kernel: payload.kernel,
    world: payload.world,
    construction: payload.construction,
    ...(payload.entities === undefined ? {} : { entities: upgradeEntityLiveness(payload.entities) }),
  };

  return {
    saveSchemaVersion: 2,
    ...metadata,
    checksum: computeSaveChecksum(migratedPayload as unknown as JsonValue),
    payload: migratedPayload,
  } as SaveEnvelopeV2;
}

/**
 * V2 -> V3: the payload gains a `simulation` section carrying the twenty-odd
 * subsystems that hold authoritative state and were never persisted (#70).
 *
 * V3 also adds a session-level `identity` section (ADR 0015): the names
 * prisoners and staff are known by.
 *
 * **The payload crosses unchanged.** Both sections were added *beside*
 * `kernel`/`world`/`construction`/`entities` rather than folded into them,
 * and both are optional, so there is nothing in a V2 save to reshape — and
 * nothing this function may invent. A save written by a V2 build genuinely
 * does not contain that prison's prisoners, guards, incidents, contraband or
 * names; fabricating an empty section would assert the opposite (an empty
 * section says "this prison has none", an absent one says "this save does not
 * know"). `restoreSimulationRuntime` treats an absent section exactly as V2
 * behaved — those subsystems rebuild empty, and every roster row simply
 * projects no name — and `RestoredScope` is what tells the player which of
 * the two happened.
 *
 * The checksum is recomputed for the same reason V1 -> V2 recomputes it: a
 * migrated envelope must be indistinguishable from a natively-written one.
 * Since the payload is unchanged the recomputed value necessarily equals the
 * stored one, which is a property worth a test rather than a reason to skip
 * the call — skipping it would make this the one step whose output was not
 * self-consistent by construction. As with V1 -> V2, `decodeSaveEnvelope`
 * verifies the stored checksum against the payload as written, at V2 -- but
 * only after the whole chain has run, so this function's output is never the
 * value that comparison examines.
 *
 * Pure: builds new objects and never mutates `input`.
 */
export function migrateSaveEnvelopeV2ToV3(input: SaveEnvelopeV2): SaveEnvelopeV3 {
  const { saveSchemaVersion: _version, checksum: _checksum, payload, ...metadata } = input;

  const migratedPayload = {
    kernel: payload.kernel,
    world: payload.world,
    construction: payload.construction,
    ...(payload.entities === undefined ? {} : { entities: payload.entities }),
  };

  return {
    saveSchemaVersion: 3,
    ...metadata,
    checksum: computeSaveChecksum(migratedPayload as unknown as JsonValue),
    payload: migratedPayload,
  } as SaveEnvelopeV3;
}

/** V3's whole-level needs section, the only part of the payload V3 -> V4 reshapes. */
type NeedLevelsV3 = NonNullable<SavePayloadV3['simulation']>['prisoners']['components']['needs'];

/**
 * Rescales one prisoner's-worth of whole-level needs into the stored units
 * `NeedsComponent` uses from V4 on.
 *
 * The mapping is `level * NEED_SCALE`, which is exact and total: a V3 level
 * is a whole number in `0..255` by that version's own schema, so every
 * product is a whole number in `0..NEED_MAX_SCALED` and lands inside V4's
 * bound. It is also the *only* honest mapping -- a V3 save recorded whole
 * levels, so the sub-level remainder V4 can express is genuinely unknown for
 * it, and zero is what "this prisoner is exactly at level N" means.
 *
 * Driven off `NEED_IDS` rather than the six literal keys, so a seventh need
 * is carried with no second edit. `Math.min` cannot fire for any save the
 * chain actually reaches this function with -- V3's schema has already
 * rejected a level above 255 -- and is kept as the one line that would have
 * to be reconsidered if `NEED_LEVEL_MAX_V3` were ever widened.
 */
function upgradeNeedLevels(needs: NeedLevelsV3): Record<string, readonly number[]> {
  const rescaled: Record<string, readonly number[]> = {};
  for (const needId of NEED_IDS) {
    rescaled[needId] = needs[needId].map((level) => Math.min(NEED_MAX_SCALED, level * NEED_SCALE));
  }
  return rescaled;
}

/**
 * V3 -> V4: need levels stop being whole 0-255 levels and start being those
 * levels scaled by `NEED_SCALE` (#259).
 *
 * This is the first migration in this file that rewrites the *simulation*
 * section rather than carrying it across, and the reason is that the field
 * changed meaning rather than shape: `hunger: 200` is a different prisoner
 * in V3 than in V4, and nothing in the value says which version wrote it.
 * Leaving it alone would load every V3 prisoner at 1/200th of their real
 * levels -- effectively starving the whole prison on first load.
 *
 * Nothing else in the payload is touched. `simulation` stays optional and an
 * absent section stays absent: a V3 save written by a build with no
 * subsystem state genuinely has none, and this function may no more invent
 * one than `migrateSaveEnvelopeV2ToV3` may.
 *
 * The checksum is recomputed for the reason V1 -> V2 recomputes it, and with
 * the same guarantee: `decodeSaveEnvelope` compares the *stored* checksum
 * against the payload as written, at its declared version, only after the
 * whole chain has run -- so this function's output is never the value that
 * comparison examines.
 *
 * Pure: builds new objects and never mutates `input`.
 */
export function migrateSaveEnvelopeV3ToV4(input: SaveEnvelopeV3): SaveEnvelopeV4 {
  const { saveSchemaVersion: _version, checksum: _checksum, payload, ...metadata } = input;

  const simulation =
    payload.simulation === undefined
      ? undefined
      : {
          ...payload.simulation,
          prisoners: {
            ...payload.simulation.prisoners,
            components: {
              ...payload.simulation.prisoners.components,
              needs: upgradeNeedLevels(payload.simulation.prisoners.components.needs),
            },
          },
        };

  const migratedPayload = {
    kernel: payload.kernel,
    world: payload.world,
    construction: payload.construction,
    ...(payload.entities === undefined ? {} : { entities: payload.entities }),
    ...(simulation === undefined ? {} : { simulation }),
    ...(payload.identity === undefined ? {} : { identity: payload.identity }),
  };

  return {
    saveSchemaVersion: 4,
    ...metadata,
    checksum: computeSaveChecksum(migratedPayload as unknown as JsonValue),
    payload: migratedPayload,
  } as SaveEnvelopeV4;
}

/** V4's room-instance rows, the only part of the payload V4 -> V5 reshapes. */
type RoomInstancesV4 = NonNullable<SavePayloadV4['simulation']>['prisoners']['roomInstanceDefinitions'];

/** V5's rows: identity, anchor, and an optional rectangle a V4 save cannot supply. */
type RoomInstancesV5 = readonly {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  readonly anchorTile: { readonly x: number; readonly y: number };
}[];

/**
 * Drops `capacity` and `objectCapabilities` from every room-instance row, and
 * adds no rectangle.
 *
 * **It invents nothing, and that rests on a fact rather than on an argument.**
 * `RoomZoningService` is the only thing in `src/` that has ever registered a
 * room instance, and it registered `capacity: 0` with `objectCapabilities: []`
 * unconditionally -- so every row any shipped build has ever written holds
 * exactly those two values. Dropping them therefore loses nothing that can be
 * missed: `RoomCapacityResolver` recomputes both at restore from the placed
 * objects (of which a V4 save has none) and the rectangle (which a V4 row does
 * not record), and lands on `0` and `[]` -- the values that were dropped.
 * `tests/migrations/save-v4-to-v5.test.ts` re-verifies the premise off a real
 * captured session rather than trusting this paragraph.
 *
 * **No `width`/`height` is fabricated *here*, and that is still right.** They
 * are optional at V5 precisely so that this step does not have to choose:
 * `1x1` would assert a room the player did not zone and `64x64` one that
 * overlaps its neighbours, and either is the invented-consequence defect.
 *
 * **What follows from that is no longer "so a migrated room has no rectangle"**
 * (issue #559,
 * [ADR 0074](../../docs/adr/0074-what-a-restored-room-that-recorded-no-rectangle-is.md)).
 * The payload's *world* section carries the zoning plane, and
 * `RoomZoningService.zone` painted the room type over every tile of the
 * rectangle when the player designated it -- so the rectangle survives in the
 * save even though the row does not carry it, and `restoreSessionSystems`
 * reads it back (`src/simulation/rooms/bounds-recovery.ts`). Nothing about
 * that belongs here: a migration writes a conclusion into the file, and the
 * restored session can derive this one from what it was handed, which is
 * [ADR 0033](../../docs/adr/0033-releasing-an-interrupted-incident-response-at-runtime.md)'s
 * distinction and the reason ADR 0030 decision 3's premise failed (#391).
 *
 * **Two sentences here claimed the hard case was unreachable in practice, and
 * both were false.** They read: *"An instance with no rectangle is attributed
 * no objects, so its capacity stays 0 -- which is what it was"*, and *"the hard
 * case is unreachable in practice for a player's save: while `ZoneRoom` had no
 * producer no save could contain a room instance at all, and the producer
 * arrived in the same release train as this migration."*
 *
 * The first stopped being true when #554 gave an objectless room a ceiling
 * derived from its own ground: an instance with no rectangle then answered
 * `Infinity` for a capability-free action rather than 0, which is #559.
 *
 * The second was never true. `84e1c61` shipped the Rooms tab that zones a room
 * at 2026-08-25 16:59 and `6cededc` moved the schema to V5 at 20:08 the same
 * day, with **twelve tagged releases in between** (v0.0.49 .. v0.0.61) and
 * `room.yard` in the catalogue throughout.
 * `tests/fixtures/persistence/save-v4-yard.json` is a save v0.0.61 actually
 * wrote, captured from that build in a detached worktree, and it holds a zoned
 * yard.
 */
function dropDerivedRoomFields(instances: RoomInstancesV4): RoomInstancesV5 {
  return instances.map((instance) => ({
    instanceId: instance.instanceId,
    roomCatalogId: instance.roomCatalogId,
    anchorTile: { x: instance.anchorTile.x, y: instance.anchorTile.y },
  }));
}

/**
 * V4 -> V5: a room instance stops carrying its capacity and its capability list,
 * and placed objects gain a section
 * ([ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * decision 6).
 *
 * Two of the three V5 changes need nothing here. The `objects` section is
 * optional and **absent means "no object has been placed"**, which is exactly
 * what every V4 build meant because no V4 build could place one -- so no
 * section is added, on the same reasoning `migrateSaveEnvelopeV2ToV3` gives for
 * declining to fabricate a `simulation` section. `width`/`height` are optional
 * and stay absent, for the reason `dropDerivedRoomFields` states.
 *
 * What is done is the removal, and it is done by rebuilding each row rather
 * than by deleting keys from it: `roomInstanceSchemaV5` is `.strict()`, so a
 * carried-over `capacity` would fail validation at the end of the chain rather
 * than being ignored.
 *
 * `simulation` stays optional and an absent section stays absent -- a V4 save
 * written by a build with no subsystem state genuinely has none, and this
 * function may no more invent one than the two steps before it may.
 *
 * The checksum is recomputed for the reason V1 -> V2 recomputes it, and with the
 * same guarantee: `decodeSaveEnvelope` compares the *stored* checksum against
 * the payload as written, at its declared version, only after the whole chain
 * has run -- so this function's output is never the value that comparison
 * examines.
 *
 * Pure: builds new objects and never mutates `input`.
 */
export function migrateSaveEnvelopeV4ToV5(input: SaveEnvelopeV4): SaveEnvelopeV5 {
  const { saveSchemaVersion: _version, checksum: _checksum, payload, ...metadata } = input;

  const simulation =
    payload.simulation === undefined
      ? undefined
      : {
          ...payload.simulation,
          prisoners: {
            ...payload.simulation.prisoners,
            roomInstanceDefinitions: dropDerivedRoomFields(payload.simulation.prisoners.roomInstanceDefinitions),
          },
        };

  const migratedPayload = {
    kernel: payload.kernel,
    world: payload.world,
    construction: payload.construction,
    ...(payload.entities === undefined ? {} : { entities: payload.entities }),
    ...(simulation === undefined ? {} : { simulation }),
    ...(payload.identity === undefined ? {} : { identity: payload.identity }),
  };

  return {
    saveSchemaVersion: 5,
    ...metadata,
    checksum: computeSaveChecksum(migratedPayload as unknown as JsonValue),
    payload: migratedPayload,
  } as SaveEnvelopeV5;
}
