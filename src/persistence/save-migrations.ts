import { computeSaveChecksum } from './checksum';
import { encodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from './entity-codec';
import type { JsonValue } from '../shared/json';
import type { SaveEnvelopeV1, SaveEnvelopeV2, SaveEnvelopeV3, SavePayloadV1 } from './save-schema';

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
 * written, at its declared version, before any migration runs -- so a corrupt
 * V1 save is rejected before this function is ever reached, and this function
 * only ever re-checksums a payload already proven intact.
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
 * self-consistent by construction. As with V1 -> V2, `decodeSaveEnvelope` has
 * already verified the stored checksum against the payload as written, at V2,
 * before this function runs.
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
