import { z } from 'zod';
import type { JsonValue } from '../shared/json';
import {
  type DeepReadonly,
  identifierSchema,
  jsonValueSchema,
  sequenceSchema,
  tickSchema,
  uint32Schema,
} from '../simulation/protocol/types';
import { MAX_PURCHASE_QUANTITY } from '../simulation/economy';
import { NEED_MAX_SCALED } from '../simulation/prisoners/needs';
import { WORLD_CHUNK_SIZE_LIMIT } from '../simulation/world/coordinates';
import { WORLD_SNAPSHOT_VERSION } from '../simulation/world/sparse-world';
import { MINIMUM_DOOR_COST_MULTIPLIER } from '../simulation/navigation/door';
import { MigrationChain, type MigrationError, type MigrationErrorCode } from './migration';
import { zodVersionSchema } from './zod-version-schema';
import { computeSaveChecksum } from './checksum';
import type { EncodedEntityStoreSnapshot } from './entity-codec';
import {
  migrateSaveEnvelopeV1ToV2,
  migrateSaveEnvelopeV2ToV3,
  migrateSaveEnvelopeV3ToV4,
  migrateSaveEnvelopeV4ToV5,
} from './save-migrations';
import type { KernelSnapshot } from '../simulation/kernel/kernel';
import type { WorldSnapshotV1 } from '../simulation/world/sparse-world';
import type { ConstructionSnapshot } from '../simulation/construction/system';
import type { EncodedSessionSystems } from '../simulation/runtime/session-systems';
import { MAX_ZONE_DIMENSION_TILES } from '../simulation/rooms/zoning';
import { ACTOR_IDENTITY_SNAPSHOT_VERSION, ACTOR_KINDS, type ActorIdentitySnapshot } from '../simulation/identity/actor-identity';

/** The version every newly written save carries. Older versions are still readable via `saveMigrationChain`. */
export const SAVE_SCHEMA_VERSION = 5 as const;

// --- Kernel / RNG ---

const rngWordsSchema = z.tuple([uint32Schema, uint32Schema, uint32Schema, uint32Schema]);

const namedRngStreamStateSchema = z
  .object({
    name: z.string().min(1),
    state: z
      .object({
        algorithm: z.literal('xoshiro128**'),
        version: z.literal(1),
        words: rngWordsSchema,
      })
      .strict(),
  })
  .strict();

/**
 * `jsonValueSchema` is `z.custom`, so it validates by *predicate* and returns
 * its input **by reference** -- unlike every `z.object`/`z.array`/primitive
 * node, which Zod rebuilds. That made a parsed payload's interior alias its
 * input at exactly the `jsonValue` fields, which contradicted the detachment
 * `markTrusted` relies on (issue #106).
 *
 * The clone lives here rather than inside `jsonValueSchema` deliberately. That
 * schema also types `versionedPayloadSchema.data`, which carries an entire
 * session snapshot across the worker boundary on every snapshot and restore,
 * where `postMessage` has already structured-cloned it -- cloning there would
 * cost 0.8-81 ms per message to detach a value nobody aliases. A queued
 * command payload is the *pending queue*, not bulk state: 908 B of a 42 KiB
 * save, 28.8 KiB of a 2.88 MiB one, and 0.01-0.27 ms to copy
 * (`tests/perf/persistence-decode-aliasing.perf.ts`).
 *
 * One line, and it closes both trust entry points -- `createSaveEnvelope` and
 * `decodeSaveEnvelope` -- across all three payload versions and the V1 -> V2 ->
 * V3 migration chain, because `kernelSnapshotSchema` is shared by all of them.
 */
const detachedJsonValueSchema = jsonValueSchema.transform((value) => structuredClone(value) as JsonValue);

const queuedCommandSchema = z
  .object({
    id: identifierSchema,
    sequence: sequenceSchema,
    executeAtTick: tickSchema,
    payload: detachedJsonValueSchema,
  })
  .strict();

const kernelSnapshotSchema = z
  .object({
    tick: tickSchema,
    expectedSequence: sequenceSchema,
    rngStates: z.array(namedRngStreamStateSchema),
    commands: z.array(queuedCommandSchema),
  })
  .strict();

// --- World ---
// Structural validation only. Semantic decoding (RLE-length-vs-chunk-size
// consistency, duplicate-chunk detection, parcel/ownership cross-checks) is
// already implemented by `SparseWorld.fromSnapshot` and is not duplicated
// here; the save boundary rejects malformed shapes before that step runs.

const chunkPositionSchema = z.object({ x: z.number().int(), y: z.number().int() }).strict();

const terrainRleSchema = z.array(z.tuple([z.number().int().min(0).max(255), z.number().int().positive()]));

const serializedChunkStateSchema = z
  .object({
    x: z.number().int(),
    y: z.number().int(),
    lifecycle: z.enum(['metadata-only', 'loaded']),
    geometryRevision: z.number().int().min(0),
    contentRevision: z.number().int().min(0),
    dirty: z.boolean(),
    terrain: terrainRleSchema.optional(),
    topEdge: terrainRleSchema.optional(),
    leftEdge: terrainRleSchema.optional(),
    zoning: terrainRleSchema.optional(),
  })
  .strict();

const serializedParcelSchema = z
  .object({
    id: z.string().min(1),
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    basePrice: z.number(),
    name: z.string().optional(),
  })
  .strict();

const worldSnapshotSchema = z
  .object({
    version: z.literal(WORLD_SNAPSHOT_VERSION),
    /**
     * Bounded, not merely positive, because `SparseWorld` allocates from this
     * number: four `chunkSize * chunkSize` byte planes per loaded chunk. The
     * limit is `WORLD_CHUNK_SIZE_LIMIT` (ADR 0004's largest benchmarked size),
     * and the same limit is enforced by `coordinates.chunkSize()` inside
     * `SparseWorld.fromSnapshot`, so neither gate is decorative -- this one
     * rejects the value before a restore is ever attempted, that one rejects
     * it before the first allocation.
     */
    chunkSize: z.number().int().positive().max(WORLD_CHUNK_SIZE_LIMIT),
    ownedChunks: z.array(chunkPositionSchema),
    chunks: z.array(serializedChunkStateSchema),
    parcels: z.array(serializedParcelSchema).optional(),
    ownedParcels: z.array(z.string()).optional(),
  })
  .strict();

// --- Construction ("pending work") ---

const buildOrderMaterialSchema = z.object({ itemId: z.string().min(1), quantity: z.number().int().min(0) }).strict();

const buildOrderSchema = z
  .object({
    id: z.string().min(1),
    definitionId: z.string().min(1),
    location: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
    /**
     * Which tile edge the order occupies (#74). `'north'`/`'west'` are the two
     * edge slots `SparseWorld` stores; see
     * `src/simulation/construction/build-order.ts`.
     *
     * Optional, and **not** a version bump. The schema is `.strict()`, so a
     * key it does not name is rejected outright — an order carrying an edge
     * could not be saved at all until this line existed. Because it is
     * optional it is equally valid in the V1 and V2 payload shapes above: an
     * older save simply never has it and resolves to the documented default,
     * so no migration step is needed and none is added.
     */
    edge: z.enum(['north', 'west']).optional(),
    state: z.enum([
      'planned',
      'approved',
      'materials-pending',
      'assigned',
      'in-progress',
      'completed',
      'cancelled',
      'failed',
    ]),
    progress: z.number().min(0),
    materialsAllocated: z.array(buildOrderMaterialSchema),
    assignedWorkerId: z.string().optional(),
    failReason: z.string().optional(),
  })
  .strict();

const constructionSnapshotSchema = z
  .object({
    orders: z.array(buildOrderSchema),
    undoStack: z.array(z.array(z.string())),
    redoStack: z.array(z.array(z.string())),
    /**
     * The build gesture that is still open (#108) -- the top of the undo
     * history, which `ConstructionSystem` keeps in a buffer until the next
     * gesture arrives. Before these two keys existed the newest gesture was
     * absent from every save, so the first undo after a load cancelled the
     * previous gesture instead of the newest one.
     *
     * Optional, and **not** a version bump, on exactly the same reasoning as
     * `edge` above. The schema is `.strict()`, so the keys had to be named
     * here for a snapshot carrying them to be saved at all; because they are
     * optional they are equally valid in the V1 and V2 payload shapes below,
     * so no migration step is needed and none is added. A save written
     * before the fix simply has neither key, and `ConstructionSystem.restore`
     * reads an absent buffer as "no gesture is open" -- which is the state
     * every restore assumed unconditionally until now, so an older save
     * loads exactly as it did before.
     */
    currentTransaction: z.array(z.string()).optional(),
    currentTransactionId: z.string().optional(),
  })
  .strict();

// --- Entities ---
// Entity-ID liveness only; see entity-codec.ts for why per-component state
// is still excluded.
//
// V1 wrote the store's three parallel arrays at its full allocated
// `capacity`. This schema is frozen historical shape: it exists only so the
// migration chain can validate a save written by an older build before
// upgrading it, and must never be edited to match new code.
//
// The `capacity` bound below is the one edit that is *not* "matching new
// code", on the same footing as #102's `chunkSize` cap: it narrows what
// counts as a valid save at a version, for a field that sizes allocations,
// and it removes only values no writer produced. See the field's own comment.

const entityStoreSnapshotV1Schema = z
  .object({
    /**
     * Bounded at the same `0xf_ffff` `entityStoreSnapshotV2Schema` uses just
     * below, and for the same reason `chunkSize` is bounded
     * above: **this number sizes allocations,
     * before anything has checked it.** `upgradeEntityLiveness`
     * (`save-migrations.ts`) builds a `Uint16Array` + `Uint8Array` +
     * `Uint32Array` straight from it -- 7 bytes per slot -- and V1's schema
     * never required the three arrays to be `capacity` long, so an *empty*
     * array set reaches that allocation. `decodeSaveEnvelope` runs the whole
     * migration chain **before** verifying the checksum, so the checksum is
     * no obstacle either (it is an integrity check, not a signature).
     * Measured on the shipped `save-v1-in-progress.json` with only this field
     * changed: `capacity: 10000000` allocated +70.0 MB from a 1,566-byte
     * envelope and was refused only afterwards; `capacity: 4294967295` threw
     * `RangeError: Array buffer allocation failed` **out of**
     * `decodeSaveEnvelope`, which aborted `PrisonSaveRepository.loadCurrent`'s
     * recovery walk before it could reach the older good generation.
     *
     * `0xf_ffff` is `INDEX_MASK` (`simulation/entity/entity-store.ts:13`), the
     * ceiling `EntityStore`'s own constructor enforces at `:83`, so this is
     * not a number invented for a schema. **It narrows nothing that was
     * loadable**: V2's identical bound already refused every such save one
     * step later, as `migration-produced-invalid-output` -- above `0xf_ffff` a
     * refusal was already certain, and all this moves is *when* (before the
     * allocation instead of after) and the label on it.
     *
     * The widest capacity any writer in this repository produces is
     * `DEFAULT_PRISONER_CAPACITY`, 5,000 (`runtime/new-session.ts:244,326`);
     * a sweep of every numeric and symbolic `capacity` assignment in `src/`
     * and `tests/` finds nothing above it, and both checked-in V1 fixtures
     * carry 8. ADR 0038 §1 classifies this as a *value* the build cannot
     * interpret -- refused -- rather than an absence to be honoured, so it is
     * not a compatibility change and needs no version bump.
     */
    capacity: z.number().int().min(0).max(0xf_ffff),
    nextAvailableIndex: z.number().int().min(0),
    maxActiveIndex: z.number().int().min(-1),
    freeCount: z.number().int().min(0),
    generations: z.array(z.number().int().min(0).max(0xffff)),
    freeIndices: z.array(z.number().int().min(0).max(0xffff_ffff)),
    alive: z.array(z.union([z.literal(0), z.literal(1)])),
  })
  .strict();

/**
 * V2 (#50): population-shaped rather than capacity-shaped. `generations` and
 * `alive` are `[value, length]` run arrays; `freeIndices` carries exactly the
 * live free-list prefix, so `freeCount` is `freeIndices.length` and no longer
 * has its own field to disagree with. See `entity-codec.ts` for why.
 */
const entityLivenessRunSchema = <Value extends z.ZodTypeAny>(value: Value) =>
  z.tuple([value, z.number().int().positive()]);

const entityStoreSnapshotV2Schema = z
  .object({
    capacity: z.number().int().min(0).max(0xf_ffff),
    nextAvailableIndex: z.number().int().min(0),
    maxActiveIndex: z.number().int().min(-1),
    generations: z.array(entityLivenessRunSchema(z.number().int().min(0).max(0xffff))),
    freeIndices: z.array(z.number().int().min(0)),
    alive: z.array(entityLivenessRunSchema(z.union([z.literal(0), z.literal(1)]))),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Cross-field consistency the field schemas cannot express. Checked here
    // rather than left to `decodeEntityStoreSnapshot` so a malformed save is
    // rejected at the save boundary with an `invalid-shape` error, instead of
    // throwing out of a restore half-way through rebuilding the store.
    const total = (runs: readonly (readonly [number, number])[]): number =>
      runs.reduce((sum, [, length]) => sum + length, 0);

    for (const field of ['generations', 'alive'] as const) {
      const covered = total(value[field]);
      if (covered !== value.capacity) {
        ctx.addIssue({ code: 'custom', message: `Runs cover ${covered} slots but capacity is ${value.capacity}.`, path: [field] });
      }
    }
    if (value.nextAvailableIndex > value.capacity) {
      ctx.addIssue({ code: 'custom', message: 'nextAvailableIndex must not exceed capacity.', path: ['nextAvailableIndex'] });
    }
    if (value.maxActiveIndex >= value.capacity) {
      ctx.addIssue({ code: 'custom', message: 'maxActiveIndex must be below capacity.', path: ['maxActiveIndex'] });
    }
    if (value.freeIndices.length > value.capacity) {
      ctx.addIssue({ code: 'custom', message: 'The free list must not be longer than capacity.', path: ['freeIndices'] });
    }
    for (const [position, index] of value.freeIndices.entries()) {
      if (index >= value.capacity) {
        ctx.addIssue({ code: 'custom', message: `Free-list entry ${index} is outside capacity ${value.capacity}.`, path: ['freeIndices', position] });
      }
    }
  });

// --- Simulation systems (V3, issue #70) ---
//
// The mirror of `EncodedSessionSystems`
// (`src/simulation/runtime/session-systems.ts`). Two separate declarations on
// purpose, exactly like `SessionSnapshotBundle` and `SavePayload` already
// are: the simulation may not depend on `src/persistence`, and a version's
// schema here is frozen historical shape once the next version exists —
// which V3's now is, since #259 added V4.
//
// Structural validation only, and deliberately permissive about *values* —
// semantic rules (a free-list entry inside capacity, a legal incident
// transition, a room instance that exists) belong to the subsystems that own
// them and are enforced by their own `loadSnapshot`. What this layer must
// catch is a shape a restore would misread rather than reject.

const tilePositionSchema = z.object({ x: z.number().int(), y: z.number().int() }).strict();
/** Packed `EntityId`s: index and generation in one non-negative integer. */
const entityIdSchema = z.number().int().min(0);
const byteSchema = z.number().int().min(0).max(255);

/**
 * Need levels are stored *scaled* by the simulation since V4 (issue #259):
 * `NeedsComponent` keeps `level * NEED_SCALE` so a decay step smaller than
 * one whole level is not rounded away, and the payload carries those stored
 * units verbatim so a restore is exact down to the sub-level remainder.
 *
 * The bound is therefore per-version, and every schema below that depends on
 * it is a factory rather than a constant: V3 is frozen at whole levels
 * (`0..255`) and must stay that way for the migration chain to validate a
 * V3 save, while V4 admits the scaled range. Nothing else about the shape
 * differs between the two versions.
 */
const NEED_LEVEL_MAX_V3 = 255;
const NEED_LEVEL_MAX_V4 = NEED_MAX_SCALED;

const needLevelsSchemaFor = (needLevelMax: number) => z.array(z.number().int().min(0).max(needLevelMax));

const prisonerComponentsSchemaFor = (needLevelMax: number) =>
  z.object({
    activeLength: z.number().int().min(0).max(0xf_ffff),
    sentenceLengthTicks: z.array(uint32Schema),
    priorIncidentsAtIntake: z.array(byteSchema),
    sentenceEndTick: z.array(uint32Schema),
    riskTier: z.array(byteSchema),
    classificationGroupIndex: z.array(byteSchema),
    intakeStage: z.array(byteSchema),
    // Named, not positional: reordering `NEED_IDS` in the simulation must not
    // silently reinterpret an existing save's levels as a different need.
    needs: z
      .object({
        hunger: needLevelsSchemaFor(needLevelMax),
        sleep: needLevelsSchemaFor(needLevelMax),
        hygiene: needLevelsSchemaFor(needLevelMax),
        bladder: needLevelsSchemaFor(needLevelMax),
        safety: needLevelsSchemaFor(needLevelMax),
        recreation: needLevelsSchemaFor(needLevelMax),
      })
      .strict(),
    actionIndex: z.array(z.number().int().min(-0x8000).max(0x7fff)),
    actionPhase: z.array(byteSchema),
    phaseStartedAtTick: z.array(uint32Schema),
    needFulfilledLastTick: z.array(uint32Schema),
    tileX: z.array(z.number().int()),
    tileY: z.array(z.number().int()),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Every component array describes the same entity slots, so a length
    // disagreement means the save is internally inconsistent. Caught here
    // rather than in the decoder, so it surfaces as `invalid-shape` at the
    // save boundary instead of throwing part-way through a restore.
    const check = (field: string, values: readonly unknown[]): void => {
      if (values.length !== value.activeLength) {
        ctx.addIssue({ code: 'custom', message: `Covers ${values.length} slots but activeLength is ${value.activeLength}.`, path: [field] });
      }
    };
    check('sentenceLengthTicks', value.sentenceLengthTicks);
    check('priorIncidentsAtIntake', value.priorIncidentsAtIntake);
    check('sentenceEndTick', value.sentenceEndTick);
    check('riskTier', value.riskTier);
    check('classificationGroupIndex', value.classificationGroupIndex);
    check('intakeStage', value.intakeStage);
    check('actionIndex', value.actionIndex);
    check('actionPhase', value.actionPhase);
    check('phaseStartedAtTick', value.phaseStartedAtTick);
    check('needFulfilledLastTick', value.needFulfilledLastTick);
    check('tileX', value.tileX);
    check('tileY', value.tileY);
    for (const [needId, levels] of Object.entries(value.needs)) check(`needs.${needId}`, levels);
  });

/**
 * Frozen V1-V4 room-instance shape: an anchor tile, an authored capacity and an
 * authored capability list, with no rectangle.
 *
 * Never edited. Every V4 save on disk carries exactly this, and -- because
 * `RoomZoningService` was the only thing in `src/` that ever registered an
 * instance and it registered `capacity: 0` with `objectCapabilities: []`
 * unconditionally -- every one of those rows holds `0` and `[]`. That is the
 * fact `migrateSaveEnvelopeV4ToV5` rests on, and it is re-verified rather than
 * remembered: `tests/migrations/save-v4-to-v5.test.ts` reads it off a real
 * captured session.
 */
const roomInstanceSchemaV4 = z
  .object({
    instanceId: z.string().min(1),
    roomCatalogId: z.string().min(1),
    anchorTile: tilePositionSchema,
    capacity: z.number().int().min(0),
    objectCapabilities: z.array(z.string().min(1)),
  })
  .strict();

/**
 * V5's room-instance shape: identity, anchor and the **rectangle**, with both
 * derived fields gone.
 *
 * `capacity` and `objectCapabilities` are not here, and that removal is what
 * forces V5 ([ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * decision 6). Both are now pure functions of (placed objects, room bounds, the
 * object and room catalogues), and a persisted derived value can disagree with
 * the state that produced it -- so they are recomputed at restore, which makes
 * `snapshot() -> restore() -> run N ticks` land on the same state by
 * construction rather than by agreement. `capacity` was a *required* field
 * here, so removing it changes the shape, which is the condition
 * `docs/PERSISTENCE.md` names for a version bump.
 *
 * `width`/`height` are **optional**, and that is a decision rather than
 * caution: a V4 row genuinely does not record the rectangle and there is no
 * honest default -- `1x1` asserts a room the player did not zone, `64x64`
 * asserts one that overlaps its neighbours. An instance with no rectangle
 * contains no objects and therefore resolves to zero capacity, which is
 * precisely the pre-object-placement behaviour and so not a regression.
 *
 * Bounded at `MAX_ZONE_DIMENSION_TILES` on both sides, which is the bound
 * `RoomZoningService.zone` refuses `invalid-area` above, so a hand-edited save
 * cannot describe a room the command could not have created.
 */
const roomInstanceSchemaV5 = z
  .object({
    instanceId: z.string().min(1),
    roomCatalogId: z.string().min(1),
    anchorTile: tilePositionSchema,
    width: z.number().int().min(1).max(MAX_ZONE_DIMENSION_TILES).optional(),
    height: z.number().int().min(1).max(MAX_ZONE_DIMENSION_TILES).optional(),
  })
  .strict();

/**
 * One placed object (ADR 0028 decision 1): four fields, and no capacity or
 * capability of its own.
 *
 * Those come from `src/content/object-catalog.ts` at read time, by `objectId`,
 * exactly as a room instance's definition comes from the room catalogue. A row
 * that carried its own footprint or capabilities could disagree with the
 * content the build ships.
 *
 * `placedObjectId` is carried even though it is derivable from `anchorTile`
 * (`placedObjectIdFor`), for the reason a room instance id is: it is a
 * reproducible-from-state value that other state may reference by name, and a
 * save that omitted it would make the restore path the authority on an
 * identifier rather than the record. `PlacedObjectRegistry.loadSnapshot`
 * re-derives it anyway, so the two can never disagree.
 *
 * `orientation` is bounded at `0..3` and nothing in the application writes
 * anything but `0` yet -- see `ObjectOrientation` for why the field is declared
 * before its producer exists. Carrying the full range now is what makes adding
 * the rotate control a change to the producer alone.
 */
const placedObjectSchema = z
  .object({
    placedObjectId: z.string().min(1),
    objectId: z.string().min(1),
    anchorTile: tilePositionSchema,
    orientation: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();

/**
 * V5's optional objects section.
 *
 * Optional, and absence means "no object has been placed" -- which is what
 * every V4 build meant, because no V4 build could place one. So the V4 -> V5
 * migration adds no objects section and invents nothing, the same reasoning
 * `migrateSaveEnvelopeV2ToV3` gives for its two optional sections. The key
 * still has to be *declared*, because every object in this schema is
 * `.strict()`.
 *
 * It sits inside `simulation` beside `economy` rather than at the top of the
 * payload beside `identity`, which is a narrower reading of ADR 0028 decision
 * 6's "a new optional payload section" than that sentence suggests, and is
 * chosen for two reasons. `economy` is the precedent -- an optional subsystem
 * section added inside `simulation` with no version bump of its own -- and the
 * restore *ordering* constraint decision 6 names (objects and room bounds in
 * place before the first `findAvailable*`) is satisfied for free there:
 * `restoreSessionSystems` registers room instances and places objects in its
 * step 2, before any prisoner state arrives in step 3.
 */
const objectsSectionSchema = z
  .object({
    placedObjects: z.array(placedObjectSchema),
  })
  .strict();

const prisonersSectionSchemaFor = <RoomInstance extends z.ZodTypeAny>(
  needLevelMax: number,
  roomInstance: RoomInstance,
) =>
  z.object({
    components: prisonerComponentsSchemaFor(needLevelMax),
    coldState: z
      .object({
        accommodationInstanceId: z.array(z.tuple([entityIdSchema, z.string().min(1)])),
        currentActionTargetInstanceId: z.array(z.tuple([entityIdSchema, z.string().min(1)])),
      })
      .strict(),
    roomInstanceDefinitions: z.array(roomInstance),
    roomInstanceOccupancy: z.array(z.tuple([z.string().min(1), z.array(entityIdSchema)])),
  })
  .strict();

const utilityNetworkSchema = z
  .object({
    type: z.enum(['electricity', 'water']),
    nodes: z.array(
      z.object({ id: z.string().min(1), kind: z.enum(['producer', 'consumer']), capacityOrDemand: z.number() }).strict(),
    ),
    connections: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
    failedNodeIds: z.array(z.string().min(1)),
  })
  .strict();

const carryItemJobSchema = z
  .object({
    id: z.string().min(1),
    priority: z.number(),
    itemId: z.string().min(1),
    quantity: z.number().int(),
    sourceContainerId: z.string().min(1),
    sourceTile: tilePositionSchema,
    destinationContainerId: z.string().min(1),
    destinationTile: tilePositionSchema,
    createdAtTick: tickSchema,
    state: z.enum(['available', 'reserved', 'assigned', 'travelling', 'performing', 'completed', 'failed', 'cancelled']),
    leg: z.enum(['pickup', 'dropoff']),
    assignedWorkerId: entityIdSchema.optional(),
    pathRequestId: z.string().min(1).optional(),
    failReason: z.string().optional(),
  })
  .strict();

const operationsSectionSchema = z
  .object({
    containers: z.array(
      z.tuple([z.string().min(1), z.array(z.tuple([z.string().min(1), z.number().int().min(0), z.number().int().min(0)]))]),
    ),
    jobs: z.array(carryItemJobSchema),
    jobWorkers: z.object({ workers: z.array(entityIdSchema), busy: z.array(entityIdSchema) }).strict(),
    electricity: utilityNetworkSchema,
    water: utilityNetworkSchema,
  })
  .strict();

const doorDefinitionSchema = z
  .object({
    id: z.string().min(1),
    position: tilePositionSchema,
    side: z.enum(['left', 'top']),
    state: z.enum(['open', 'closed', 'locked']),
    requiredSecurityClearance: z.number().int().min(0),
    requiredPermission: z.string().min(1).optional(),
    /**
     * Bounded, like `requiredSecurityClearance` above and unlike the bare
     * `z.number()` this was: a save is the one boundary an authored door cost
     * can cross, and a multiplier below a plain step makes
     * `boundedLocalSearch`'s heuristic inadmissible (see
     * `MINIMUM_DOOR_COST_MULTIPLIER`). Shared with the historical V3/V4
     * shapes deliberately: no build of this game has ever written a value
     * below `1` -- the only producers are `createGradedDoor` and
     * `BuildableDefinition.placesDoor`, both `1` -- so the tightening
     * rejects no save that exists, and leaving the historical leaf loose
     * would let a migrated payload deliver the value `DoorRegistry.register`
     * now throws on.
     */
    costMultiplier: z.number().min(MINIMUM_DOOR_COST_MULTIPLIER),
  })
  .strict();

const navigationSectionSchema = z.object({ doors: z.array(doorDefinitionSchema) }).strict();

const securitySectorDefinitionSchema = z
  .object({
    id: z.string().min(1),
    gradeId: z.string().min(1),
    doorIds: z.array(z.string().min(1)),
    postTile: tilePositionSchema,
    patrolRoute: z.array(tilePositionSchema).optional(),
    expectedPatrolLoopTicks: z.number().int().min(0).optional(),
  })
  .strict();

const guardRecordSchema = z
  .object({
    staffRoleId: z.string().min(1),
    tileX: z.number().int(),
    tileY: z.number().int(),
    sectorId: z.string().min(1).optional(),
    deploymentPhase: z.enum(['unassigned', 'travelling', 'on-post', 'on-search']),
    pathRequestId: z.string().min(1).optional(),
    patrolWaypointIndex: z.number().int().min(-1).optional(),
    patrolLoopStartedAtTick: tickSchema.optional(),
  })
  .strict();

const deploymentScheduleSchema = z
  .object({
    sectorId: z.string().min(1),
    blocks: z.array(
      z
        .object({
          startTickOfDay: z.number().int().min(0),
          endTickOfDay: z.number().int().min(0),
          requiredGuardCount: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();

const securitySectionSchema = z
  .object({
    sectorDefinitions: z.array(securitySectorDefinitionSchema),
    sectorControlStates: z.array(z.tuple([z.string().min(1), z.enum(['normal', 'restricted', 'lockdown'])])),
    guards: z
      .object({
        // The same population-shaped ledger `entities` uses (#50): the guard
        // roster is `EntityStore`-backed too, and a capacity-shaped roster
        // would cost 500 padded slots for a prison with twelve guards.
        entityStore: entityStoreSnapshotV2Schema,
        records: z.array(z.tuple([entityIdSchema, guardRecordSchema])),
      })
      .strict(),
    schedules: z.array(deploymentScheduleSchema),
    deployment: z.object({ metrics: z.object({ deploymentFailures: z.number().int().min(0) }).strict() }).strict(),
    patrol: z
      .object({
        metrics: z
          .object({
            loopsCompletedOnTime: z.number().int().min(0),
            loopsCompletedLate: z.number().int().min(0),
            loopsMissed: z.number().int().min(0),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const contrabandHolderSchema = z.object({ kind: z.enum(['prisoner', 'staff', 'cell', 'container']), id: z.string().min(1) }).strict();
const contrabandProvenanceSchema = z
  .object({
    sourceType: z.enum(['delivery', 'visit', 'staff', 'prisoner', 'room-object']),
    sourceId: z.string().min(1),
    introducedAtTick: tickSchema,
  })
  .strict();

const searchTargetSchema = z.object({ holderKind: z.enum(['prisoner', 'staff', 'cell', 'container']), holderId: z.string().min(1) }).strict();
const searchScopeSchema = z.enum(['person', 'cell', 'sector', 'delivery']);

const contrabandSectionSchema = z
  .object({
    items: z.array(
      z.tuple([
        z.string().min(1),
        z
          .object({
            categoryId: z.string().min(1),
            provenance: contrabandProvenanceSchema,
            holder: contrabandHolderSchema,
            state: z.enum(['concealed', 'confiscated']),
            movementLog: z.array(z.object({ holder: contrabandHolderSchema, atTick: tickSchema }).strict()),
          })
          .strict(),
      ]),
    ),
    intelligence: z.array(
      z.tuple([
        z.string().min(1),
        z
          .object({
            targetKind: z.enum(['prisoner', 'staff', 'cell', 'sector']),
            targetId: z.string().min(1),
            categoryHint: z.string().min(1).optional(),
            confidence: z.number(),
            sourceType: z.enum(['informant', 'observation', 'search-residue']),
            createdAtTick: tickSchema,
          })
          .strict(),
      ]),
    ),
    /**
     * `IntelligenceLedger`'s allocation counter (ADR 0012 category 1, #431's
     * neighbour rather than #431 itself).
     *
     * **Optional, and `SAVE_SCHEMA_VERSION` is not bumped**, on ADR 0038 §1's
     * three conditions, each checked rather than assumed: the field is
     * optional; absence has exactly one meaning -- the counter is derived from
     * the maximum surviving id suffix, which is what every build did before
     * this key existed, so an older save restores exactly as it did; and no
     * existing field changed meaning. It is the same pattern `masterSeed`
     * (§4), `entities`, `simulation` and `identity` already use, and it
     * carries §4's one stated cost too: this section is `.strict()`, so an
     * *older* build reading a save that carries this key refuses it as
     * `invalid-shape` where a bump would have said `unsupported-version` --
     * the label on a refusal both builds make either way.
     *
     * It cannot be folded into the `intelligence` array above, which is keyed
     * by the ids that *survive*. `IntelligenceLedger.decayAll` deletes expired
     * records, so the surviving maximum is a lower bound on what has been
     * minted; a continuous run and a run restored from the same save minted
     * `intel.4` and `intel.3` respectively before this field existed.
     *
     * `contrabandSectionSchema` is shared by the V3, V4 and V5 session-systems
     * shapes, so -- exactly as `currentTransaction` above -- the key is
     * equally valid in all three and no migration step has to add it.
     */
    intelligenceSequence: z.number().int().min(0).optional(),
    informants: z.array(
      z.object({ holderKind: z.enum(['prisoner', 'staff']), holderId: z.string().min(1), reliability: z.number() }).strict(),
    ),
    confiscations: z.array(
      z
        .object({
          itemId: z.string().min(1),
          categoryId: z.string().min(1),
          provenance: contrabandProvenanceSchema,
          foundAtHolder: contrabandHolderSchema,
          searchOrderId: z.string().min(1),
          foundByGuardId: entityIdSchema,
          tick: tickSchema,
        })
        .strict(),
    ),
    searchPolicies: z.array(
      z
        .object({
          scope: searchScopeSchema,
          requiredGuardCount: z.number().int().min(0),
          dwellTicksPerTarget: z.number().int().min(0),
          baseDetectionProbability: z.number(),
          concealmentPenaltyPerPoint: z.number(),
          intelligenceConfidenceBonus: z.number(),
        })
        .strict(),
    ),
    searchContainerLocations: z.array(z.tuple([z.string().min(1), tilePositionSchema])),
    search: z
      .object({
        queue: z.array(z.object({ id: z.string().min(1), scope: searchScopeSchema, targets: z.array(searchTargetSchema) }).strict()),
        active: z.array(
          z.tuple([
            z.string().min(1),
            z
              .object({
                scope: searchScopeSchema,
                targets: z.array(searchTargetSchema),
                guardIds: z.array(entityIdSchema),
                currentTargetIndex: z.number().int().min(0),
              })
              .strict(),
          ]),
        ),
        metrics: z
          .object({
            itemsDiscovered: z.number().int().min(0),
            itemsMissed: z.number().int().min(0),
            searchesCompleted: z.number().int().min(0),
            searchesCancelled: z.number().int().min(0),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const incidentStateSchema = z.enum(['active', 'notified', 'responding', 'resolved', 'lapsed']);

const incidentsSectionSchema = z
  .object({
    log: z.array(
      z.tuple([
        z.string().min(1),
        z
          .object({
            type: z.enum(['assault', 'escape-attempt', 'riot', 'gang-retaliation']),
            sectorId: z.string().min(1),
            participantIds: z.array(entityIdSchema),
            severity: z.number(),
            causeFactors: z.array(z.object({ kind: z.string().min(1), value: z.number() }).strict()),
            state: incidentStateSchema,
            timeline: z.array(z.object({ state: incidentStateSchema, atTick: tickSchema }).strict()),
            startedAtTick: tickSchema,
            outcome: z
              .object({
                injuredEntityIds: z.array(entityIdSchema),
                propertyDamage: z.number(),
                escaped: z.boolean(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      ]),
    ),
    sectorRisk: z.array(
      z.tuple([
        z.string().min(1),
        z.object({ latestScore: z.number(), consecutiveHotSamples: z.number().int().min(0) }).strict(),
      ]),
    ),
    gangs: z
      .object({
        definitions: z.array(z.object({ id: z.string().min(1), territorySectorIds: z.array(z.string().min(1)) }).strict()),
        members: z.array(z.tuple([entityIdSchema, z.string().min(1)])),
        reputation: z.array(z.tuple([z.string().min(1), z.number()])),
        grudges: z.array(z.tuple([z.string().min(1), z.string().min(1), z.number()])),
      })
      .strict(),
    tunnels: z.array(
      z
        .object({ id: z.string().min(1), startTile: tilePositionSchema, targetTile: tilePositionSchema, progress: z.number() })
        .strict(),
    ),
    watchedSectorIds: z.array(z.string().min(1)),
    trigger: z
      .object({
        metrics: z
          .object({
            incidentsTriggered: z.number().int().min(0),
            riotsTriggered: z.number().int().min(0),
            retaliationsTriggered: z.number().int().min(0),
          })
          .strict(),
        sequence: z.number().int().min(0),
      })
      .strict(),
    response: z
      .object({
        metrics: z
          .object({
            incidentsResolved: z.number().int().min(0),
            incidentsLapsed: z.number().int().min(0),
            respondersDispatched: z.number().int().min(0),
            routeFailures: z.number().int().min(0),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

// --- Actor identity (V3, issue #75 / ADR 0015) ---
//
// A **session-level** section, deliberately not nested under
// `simulation.prisoners` or `simulation.security`: `ActorIdentityRegistry`
// spans both `EntityStore`s, which each hand out id `0`, so `kind` is the
// half of the key that disambiguates them and filing the section under
// either population would misplace the other half.
//
// `version` is the registry's own snapshot version and is independent of
// `SAVE_SCHEMA_VERSION` -- the registry may revise its shape without a save
// bump, and vice versa, which is the same separation ADR 0003 gives the
// worker snapshot. Pinned to a literal here so a future registry version
// arriving in a V3 envelope is rejected as `invalid-shape` rather than being
// half-read.
//
// `poolId` is validated as a string and nothing more. `loadSnapshot`
// deliberately tolerates a `poolId` that disagrees with the configured pool,
// so that replacing the placeholder name pool renames nobody; a schema check
// against the current pool would undo exactly that guarantee.

const actorIdentitySnapshotSchema = z
  .object({
    version: z.literal(ACTOR_IDENTITY_SNAPSHOT_VERSION),
    poolId: z.string().min(1),
    entries: z.array(
      z
        .object({
          kind: z.enum(ACTOR_KINDS),
          entityId: entityIdSchema,
          givenName: z.string().min(1),
          familyName: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * How many deliveries a save may carry in flight.
 *
 * Not a gameplay limit -- nothing in the simulation enforces it, and a player
 * cannot reach it: at the cheapest price a delivery costs 40 and the starting
 * balance buys 625 of them, one purchase at a time. It bounds what a *decoder*
 * will accept from a file, which is the #102 shape: a save is untrusted input
 * and an unbounded array in it is an allocation an attacker chooses.
 */
const MAX_PENDING_DELIVERIES = 4_096;

/**
 * Money and the deliveries it has bought (#96, #89).
 *
 * The persistence layer's mirror of `EncodedEconomy`
 * (`src/simulation/runtime/session-systems.ts`). Deliberately a separate
 * declaration, like every other section here: the worker must not depend on
 * `src/persistence`, and this schema evolves under its own version contract.
 *
 * **Bounded, because these are client-writable numbers.** A save is a file the
 * player's browser produced and could have edited, and the same reasoning that
 * bounds the trusted tier's columns (#105 finding 4, #191) applies to a
 * balance and a delivery queue: `nonnegative().int()` on the money, a
 * `max` on the queue so a hand-edited save cannot ask the runtime to hold
 * a million pending deliveries, and `safe()` so an arithmetic overflow cannot
 * be smuggled in as a starting condition.
 */
const economySectionSchema = z
  .object({
    treasury: z
      .object({ balanceMinorUnits: z.number().int().nonnegative().safe() })
      .strict(),
    procurement: z
      .object({
        pending: z
          .array(
            z
              .object({
                orderId: identifierSchema,
                itemId: identifierSchema,
                quantity: z.number().int().positive().max(MAX_PURCHASE_QUANTITY),
                arrivesAtTick: z.number().int().nonnegative().safe(),
                paidMinorUnits: z.number().int().nonnegative().safe(),
              })
              .strict(),
          )
          .max(MAX_PENDING_DELIVERIES),
      })
      .strict(),
    /**
     * What the prison owes its staff
     * ([ADR 0049](../../docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md),
     * [ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
     * step 3), in the same minor units as the balance beside it.
     *
     * **Optional, absent means nothing is owed, and `SAVE_SCHEMA_VERSION`
     * stays at 5.** The condition `docs/PERSISTENCE.md` sets for that is that
     * absence be unambiguous, and here it is a fact about the corpus rather
     * than a convention: no build that could write a V5 save had a recurring
     * charge, so no such save can be hiding a real debt behind a missing key.
     * The cost of not bumping is the one that section records -- an *older*
     * build reading a save that carries this key refuses it as `invalid-shape`
     * where a V6 would have said `unsupported-version`.
     *
     * **`nonnegative()` here is the same invariant the balance above carries,
     * and it points the other way.** A negative balance is what a debt would be
     * if the treasury could overdraw; it cannot, deliberately, because
     * ADR 0017 decision 8's ladder ends in *"staff unpaid"* and a treasury that
     * overdrew would pay them. So the money the prison holds and the money it
     * owes are two non-negative integers rather than one signed one, and this
     * is the second.
     *
     * `.safe()` for the reason the fields above carry it: a save is a file the
     * player's browser produced and could have edited, and
     * `PayrollSystem.update` saturates rather than throwing if it is handed a
     * figure one day short of the safe range.
     *
     * **Proven rather than asserted.** `tests/integration/economy-payroll-save.test.ts`
     * decodes a real V5 save with this key removed and a real V4 save written
     * before the field existed, restores both to zero arrears, and refuses a
     * hand-edited save carrying a negative one behind a valid checksum.
     */
    payroll: z
      .object({ unpaidWagesMinorUnits: z.number().int().nonnegative().safe() })
      .strict()
      .optional(),
  })
  .strict();

/**
 * The shared shape of the `simulation` section, parameterised by the two things
 * that differ between versions: the need-level bound (V3 vs V4) and the
 * room-instance row (V4 vs V5).
 *
 * A factory over both axes rather than three copies of several hundred lines,
 * which is what `docs/PERSISTENCE.md`'s "Adding a V5 later" step 1 asks for:
 * the historical version is frozen by the arguments it is instantiated with,
 * and the shapes cannot drift apart in any other respect. Generic in the
 * room-instance schema rather than taking a `z.ZodTypeAny`, so the inferred
 * payload type keeps the row's real shape instead of widening to `any`.
 */
const sessionSystemsShapeFor = <RoomInstance extends z.ZodTypeAny>(
  needLevelMax: number,
  roomInstance: RoomInstance,
) =>
  ({
    prisoners: prisonersSectionSchemaFor(needLevelMax, roomInstance),
    operations: operationsSectionSchema,
    navigation: navigationSectionSchema,
    security: securitySectionSchema,
    contraband: contrabandSectionSchema,
    incidents: incidentsSectionSchema,
    economy: economySectionSchema.optional(),
  }) as const;

/** Frozen historical shape: whole-level needs, as every V3 save on disk carries them. */
const sessionSystemsV3Schema = z.object(sessionSystemsShapeFor(NEED_LEVEL_MAX_V3, roomInstanceSchemaV4)).strict();
/** Frozen historical shape: scaled needs (#259), authored room capacity, no objects section. */
const sessionSystemsV4Schema = z.object(sessionSystemsShapeFor(NEED_LEVEL_MAX_V4, roomInstanceSchemaV4)).strict();
/** Current shape: room instances carry their rectangle and no derived fields, and placed objects have a section (ADR 0028). */
const sessionSystemsV5Schema = z
  .object({ ...sessionSystemsShapeFor(NEED_LEVEL_MAX_V4, roomInstanceSchemaV5), objects: objectsSectionSchema.optional() })
  .strict();

// --- Envelope ---

const savePayloadV1Schema = z
  .object({
    kernel: kernelSnapshotSchema,
    world: worldSnapshotSchema,
    construction: constructionSnapshotSchema,
    entities: entityStoreSnapshotV1Schema.optional(),
  })
  .strict();

const savePayloadV2Schema = z
  .object({
    kernel: kernelSnapshotSchema,
    world: worldSnapshotSchema,
    construction: constructionSnapshotSchema,
    entities: entityStoreSnapshotV2Schema.optional(),
  })
  .strict();

/**
 * V3 (#70): the payload gains `simulation`, carrying every subsystem that
 * holds authoritative state. `kernel`, `world`, `construction` and `entities`
 * are byte-identical to V2 — the section was added beside them rather than
 * folded into them, so the V2 -> V3 migration rewrites nothing.
 *
 * `simulation` is optional for the same reason `entities` is: a save written
 * by a V2 build genuinely does not contain it, and a migrated save must stay
 * honest about that rather than fabricate an empty prison's worth of state.
 */
const savePayloadV3Schema = z
  .object({
    kernel: kernelSnapshotSchema,
    world: worldSnapshotSchema,
    construction: constructionSnapshotSchema,
    entities: entityStoreSnapshotV2Schema.optional(),
    simulation: sessionSystemsV3Schema.optional(),
    identity: actorIdentitySnapshotSchema.optional(),
  })
  .strict();

/**
 * V4 (#259): `simulation.prisoners.components.needs` changes **units**.
 *
 * The simulation now stores a need level scaled by `NEED_SCALE` rather than
 * as a whole 0-255 level, because at whole-level resolution the decay step
 * rounded to zero for five of the six needs and they never moved at all.
 * The payload carries the stored units, so the same array means something
 * different than it did in V3 -- a V3 `hunger` of `200` and a V4 `hunger` of
 * `200` are not the same prisoner.
 *
 * That is why this is a version bump and not the optional-field pattern the
 * "Adding an optional field without a version bump" section in
 * `docs/PERSISTENCE.md` describes: the reader cannot tell the two apart from
 * the value, so absence-means-the-old-default does not apply and an existing
 * field changed meaning. `migrateSaveEnvelopeV3ToV4` is what resolves it, by
 * rescaling every level exactly once.
 *
 * Everything outside that one field is byte-identical to V3.
 */
const savePayloadV4Schema = z
  .object({
    kernel: kernelSnapshotSchema,
    world: worldSnapshotSchema,
    construction: constructionSnapshotSchema,
    entities: entityStoreSnapshotV2Schema.optional(),
    simulation: sessionSystemsV4Schema.optional(),
    identity: actorIdentitySnapshotSchema.optional(),
  })
  .strict();

/**
 * V5 (ADR 0028 phase 1): a room instance carries its **rectangle** and stops
 * carrying its capacity, and placed objects get a section.
 *
 * Three changes and only one of them would have needed a bump on its own:
 *
 * - **The objects section is the optional-field pattern exactly.** Absence
 *   means "no object has been placed", which is what every V4 build meant, so
 *   no migration step is needed and none is added.
 * - **`width`/`height` fail the "absence is unambiguous" condition.** A V4 room
 *   instance genuinely does not record its rectangle and there is no honest
 *   default, so the field is optional *at V5* and absence keeps its own
 *   meaning: this room's rectangle was not recorded, so nothing can be
 *   attributed to it.
 * - **The removal of `capacity` crosses the line V4 itself crossed.** It was a
 *   *required* field, so dropping it changes the shape.
 *
 * The migration is total and lossless because of a fact rather than an
 * argument: `RoomZoningService` is the only thing in `src/` that has ever
 * registered an instance, and it registered `capacity: 0` and
 * `objectCapabilities: []` unconditionally -- so `migrateSaveEnvelopeV4ToV5`
 * drops both fields knowing exactly what they were, and the recomputed values
 * equal the dropped ones.
 *
 * Everything outside `simulation` is byte-identical to V4.
 *
 * **V5 gained one more optional field after it shipped**: `masterSeed` (#412),
 * under the same "adding an optional field without a version bump" rule the
 * objects section is an instance of. A V5 save written before it exists is
 * still a valid V5 save and still loads; see the field's own comment for the
 * fact that makes its absence unambiguous.
 */
const savePayloadV5Schema = z
  .object({
    /**
     * The u32 the session's named RNG streams were derived from (#412,
     * ADR 0038 §4). Added to V5 rather than bumping to V6, because it is the
     * optional-field pattern this file already documents at `:69-92` of
     * `docs/PERSISTENCE.md` and applies to `objects` immediately above:
     * optional, and absence means 0 unambiguously -- production has never
     * supplied another value, so every save written before this field existed
     * was written at seed 0. There is nothing for a migration step to do, so
     * none is added rather than one fabricating a value the save does not
     * record.
     *
     * `uint32Schema` and not `masterSeedSchema` from `services/challenges`:
     * they are the same range, and `src/persistence` does not depend on
     * `src/services`. `deriveXoshiroState` refuses anything outside it.
     *
     * The cost, recorded because "no bump is needed" is true and "no bump
     * costs nothing" is not: `.strict()` means an **older** build reading a
     * save that carries this key refuses it as `invalid-shape` where a V6 bump
     * would have said `unsupported-version`. Both builds refuse it; only the
     * label differs.
     */
    masterSeed: uint32Schema.optional(),
    kernel: kernelSnapshotSchema,
    world: worldSnapshotSchema,
    construction: constructionSnapshotSchema,
    entities: entityStoreSnapshotV2Schema.optional(),
    simulation: sessionSystemsV5Schema.optional(),
    identity: actorIdentitySnapshotSchema.optional(),
  })
  .strict();

/** Historical V1 payload shape, retained so V1 saves can still be validated and migrated. */
export type SavePayloadV1 = DeepReadonly<z.infer<typeof savePayloadV1Schema>>;
/** Historical V2 payload shape. Only the migration chain and `migrateSaveEnvelopeV2ToV3` should name this. */
export type SavePayloadV2 = DeepReadonly<z.infer<typeof savePayloadV2Schema>>;
/** Historical V3 payload shape. Only the migration chain and `migrateSaveEnvelopeV3ToV4` should name this. */
export type SavePayloadV3 = DeepReadonly<z.infer<typeof savePayloadV3Schema>>;
/** Historical V4 payload shape. Only the migration chain and `migrateSaveEnvelopeV4ToV5` should name this. */
export type SavePayloadV4 = DeepReadonly<z.infer<typeof savePayloadV4Schema>>;
export type SavePayloadV5 = DeepReadonly<z.infer<typeof savePayloadV5Schema>>;
/** The payload shape newly written saves use. Prefer this over the versioned alias at call sites that just mean "a save payload". */
export type SavePayload = SavePayloadV5;

/**
 * The envelope's own fields, without `payload`. Kept separate so the two
 * halves of an envelope can be validated independently: composing a save
 * in-process already knows its payload is schema-valid (it just parsed it),
 * and re-walking a multi-megabyte payload only to check seven scalar
 * metadata fields was measured as roughly a third of a save (#49).
 *
 * Parameterised by version because every historical envelope schema pins its
 * own `saveSchemaVersion` literal; only the version field differs between
 * them, so the remaining six rules cannot drift apart across versions.
 */
function saveEnvelopeMetadataShape<Version extends number>(version: Version) {
  return {
    saveSchemaVersion: z.literal(version),
    gameVersion: identifierSchema,
    prisonId: identifierSchema,
    revision: z.number().int().min(0),
    createdAt: z.number().int().min(0),
    updatedAt: z.number().int().min(0),
    checksum: z.string().regex(/^[0-9a-f]{16}$/),
  } as const;
}

function withOrderedTimestamps<T extends { readonly createdAt: number; readonly updatedAt: number }>(
  schema: z.ZodType<T>,
): z.ZodType<T> {
  return schema.superRefine((value, ctx) => {
    if (value.updatedAt < value.createdAt) {
      ctx.addIssue({ code: 'custom', message: 'updatedAt must not precede createdAt.', path: ['updatedAt'] });
    }
  });
}

const saveEnvelopeV1ObjectSchema = z
  .object({ ...saveEnvelopeMetadataShape(1), payload: savePayloadV1Schema })
  .strict();

const saveEnvelopeV1Schema = withOrderedTimestamps(saveEnvelopeV1ObjectSchema);

const saveEnvelopeV2ObjectSchema = z
  .object({ ...saveEnvelopeMetadataShape(2), payload: savePayloadV2Schema })
  .strict();

const saveEnvelopeV2Schema = withOrderedTimestamps(saveEnvelopeV2ObjectSchema);

const saveEnvelopeV3ObjectSchema = z
  .object({ ...saveEnvelopeMetadataShape(3), payload: savePayloadV3Schema })
  .strict();

const saveEnvelopeV3Schema = withOrderedTimestamps(saveEnvelopeV3ObjectSchema);

const saveEnvelopeV4ObjectSchema = z
  .object({ ...saveEnvelopeMetadataShape(4), payload: savePayloadV4Schema })
  .strict();

const saveEnvelopeV4Schema = withOrderedTimestamps(saveEnvelopeV4ObjectSchema);

const saveEnvelopeV5ObjectSchema = z
  .object({ ...saveEnvelopeMetadataShape(SAVE_SCHEMA_VERSION), payload: savePayloadV5Schema })
  .strict();

const saveEnvelopeV5Schema = withOrderedTimestamps(saveEnvelopeV5ObjectSchema);

/** Validates only the envelope's own fields; `payload` is validated separately by `savePayloadV5Schema`. */
const saveEnvelopeMetadataV5Schema = withOrderedTimestamps(
  z.object(saveEnvelopeMetadataShape(SAVE_SCHEMA_VERSION)).strict(),
);

/** Historical V1 envelope shape. Only the migration chain and `migrateSaveEnvelopeV1ToV2` should name this. */
export type SaveEnvelopeV1 = DeepReadonly<z.infer<typeof saveEnvelopeV1ObjectSchema>>;
/** Historical V2 envelope shape. Only the migration chain and the two migrations that touch it should name this. */
export type SaveEnvelopeV2 = DeepReadonly<z.infer<typeof saveEnvelopeV2ObjectSchema>>;
/** Historical V3 envelope shape. Only the migration chain and the two migrations that touch it should name this. */
export type SaveEnvelopeV3 = DeepReadonly<z.infer<typeof saveEnvelopeV3ObjectSchema>>;
/** Historical V4 envelope shape. Only the migration chain and `migrateSaveEnvelopeV4ToV5` should name this. */
export type SaveEnvelopeV4 = DeepReadonly<z.infer<typeof saveEnvelopeV4ObjectSchema>>;
export type SaveEnvelopeV5 = DeepReadonly<z.infer<typeof saveEnvelopeV5ObjectSchema>>;
/**
 * The envelope shape newly written saves use. Call sites that simply mean "a
 * save envelope" use this alias, so the next version bump does not sweep a
 * rename through the repository the way bumping to V2 did.
 */
export type SaveEnvelope = SaveEnvelopeV5;

// --- Migration chain ---
// Every historical version registers its schema once and is never edited;
// each Vn -> Vn+1 transformation registers exactly one step. `MigrationChain`
// itself is additionally exercised end-to-end (multi-hop walking, per-step
// validation, immutability) against synthetic versions in
// tests/unit/persistence-migration.test.ts.
export const saveMigrationChain = new MigrationChain(SAVE_SCHEMA_VERSION);
saveMigrationChain.registerSchema(zodVersionSchema(1, saveEnvelopeV1Schema));
saveMigrationChain.registerSchema(zodVersionSchema(2, saveEnvelopeV2Schema));
saveMigrationChain.registerSchema(zodVersionSchema(3, saveEnvelopeV3Schema));
saveMigrationChain.registerSchema(zodVersionSchema(4, saveEnvelopeV4Schema));
saveMigrationChain.registerSchema(zodVersionSchema(SAVE_SCHEMA_VERSION, saveEnvelopeV5Schema));
saveMigrationChain.registerMigration({
  fromVersion: 1,
  toVersion: 2,
  migrate: (input) => migrateSaveEnvelopeV1ToV2(input as SaveEnvelopeV1),
});
saveMigrationChain.registerMigration({
  fromVersion: 2,
  toVersion: 3,
  migrate: (input) => migrateSaveEnvelopeV2ToV3(input as SaveEnvelopeV2),
});
saveMigrationChain.registerMigration({
  fromVersion: 3,
  toVersion: 4,
  migrate: (input) => migrateSaveEnvelopeV3ToV4(input as SaveEnvelopeV3),
});
saveMigrationChain.registerMigration({
  fromVersion: 4,
  toVersion: 5,
  migrate: (input) => migrateSaveEnvelopeV4ToV5(input as SaveEnvelopeV4),
});

export type SaveDecodeErrorCode = MigrationErrorCode | 'checksum-mismatch';

export interface SaveDecodeError extends Omit<MigrationError, 'code'> {
  readonly code: SaveDecodeErrorCode;
}

export type SaveDecodeResult =
  | { readonly ok: true; readonly value: TrustedSaveEnvelope; readonly migrated: boolean }
  | { readonly ok: false; readonly error: SaveDecodeError };

// --- Trusted envelopes (#49) ---
//
// Validating a save payload is the dominant cost of saving (Zod, not I/O:
// `JSON.stringify` is ~2% of a save). The payload used to be walked three
// times per save -- once by `savePayloadV1Schema`, again by the envelope
// schema that nests it, and a third time by `PrisonSaveRepository.save`
// re-decoding an envelope this same process had just built and checksummed.
//
// That third walk is nonetheless a real correctness boundary for envelopes of
// unknown provenance (imports, restored files, anything read back from
// storage), so it is not removed -- it is made conditional on *provenance*,
// which is established here and nowhere else:
//
//   * `TrustedSaveEnvelope` is a branded type whose brand key is a
//     module-private `unique symbol`. No other module can name it, so no
//     other module can produce that type except by receiving one from this
//     module's `createSaveEnvelope`/`decodeSaveEnvelope`. Trust is therefore
//     carried by the type, not by a boolean a caller could wrongly pass.
//
//   * The brand is backed at runtime by `trustedEnvelopes`, a module-private
//     `WeakSet` keyed on object identity. A caller who defeats the type with
//     `as TrustedSaveEnvelope` still fails the runtime membership check and
//     gets full validation: the type is the contract, the WeakSet is what
//     makes it unforgeable, and the failure mode is "validate anyway".
//
//   * Membership is identity-based, so every ordinary way a value can leave
//     this process and come back -- JSON round trip, structured clone (the
//     IndexedDB write path), a spread that rewrites a field -- yields a
//     *different* object that is not in the set and is fully validated. The
//     trusted path cannot be entered by accident from untrusted input.
//
//   * A trusted envelope is shallow-frozen, so its checksum, its version and
//     its `payload` reference cannot be swapped after this module vouched for
//     them.

declare const trustedSaveEnvelopeBrand: unique symbol;

/**
 * A current-version `SaveEnvelope` whose payload **this process** has already
 * validated and checksum-verified: either freshly composed by
 * `createSaveEnvelope`, or decoded (and, for an older save, migrated) from an
 * untrusted source by `decodeSaveEnvelope`. Only this module can produce one;
 * see the note above for why that cannot be forged.
 */
export type TrustedSaveEnvelope = SaveEnvelope & {
  readonly [trustedSaveEnvelopeBrand]: 'validated-in-process';
};

const trustedEnvelopes = new WeakSet<object>();

function markTrusted(envelope: SaveEnvelope): TrustedSaveEnvelope {
  // Shallow, and the payload's interior really is detached from live runtime
  // state -- which this comment asserted long before it was true.
  //
  // The original wording ("Zod's parse returns a fresh value") is right for
  // every `z.object`/`z.array`/`z.tuple`/primitive node and wrong for a
  // `z.custom` one, which validates by predicate and passes its input through
  // by reference. In this schema the only such field was
  // `payload.kernel.commands[].payload`, so a parsed payload aliased its input
  // at exactly that point: `decodeSaveEnvelope` shared it with the caller's
  // object, and `createSaveEnvelope` shared it with the **live kernel**,
  // because `Kernel.snapshot()` shallow-copies each queued command (`{ ...c }`)
  // and hands over the object the command queue still holds. Either alias let a
  // later mutation leave `checksum` describing a payload that no longer
  // existed. Issue #106 established all of that by execution, and #105 reached
  // the same mechanism from the SQL side.
  //
  // `detachedJsonValueSchema` (see its own comment) now clones that one field,
  // so the sentence above is a property of the code rather than a claim about
  // it. `tests/unit/persistence-save-schema-aliasing.test.ts` pins the
  // detachment from both entry points; reverting the schema fails those tests,
  // which is what stops this comment and the code drifting apart again.
  //
  // What is still **not** guaranteed, and never was: an envelope's interior is
  // not immutable to whoever holds the envelope. Detachment is about the
  // *caller's* objects and the live simulation; it is not a deep freeze, which
  // #49 rejected on cost. So `checksum` remains a statement about the payload
  // at the moment this module vouched for it, not a lock on its present
  // contents -- the module doc above says exactly that, and
  // `tests/unit/persistence-save-schema.test.ts` pins that narrower promise.
  //
  // Freezing stays shallow: deep-freezing a multi-megabyte payload would
  // reintroduce exactly the per-node walk #49 exists to remove.
  const frozen = Object.freeze(envelope);
  trustedEnvelopes.add(frozen);
  return frozen as TrustedSaveEnvelope;
}

/** True only for an envelope object this process itself validated. Identity-based; a copy of a trusted envelope is not trusted. */
export function isTrustedSaveEnvelope(envelope: SaveEnvelope): envelope is TrustedSaveEnvelope {
  return trustedEnvelopes.has(envelope);
}

/**
 * The write-path validation gate. An envelope this process vouched for is
 * accepted as-is; anything else -- including a value merely *typed* as
 * trusted -- is fully decoded (schema, migration and checksum) exactly as
 * before.
 */
export function decodeSaveEnvelopeUnlessTrusted(envelope: SaveEnvelope): SaveDecodeResult {
  if (isTrustedSaveEnvelope(envelope)) return { ok: true, value: envelope, migrated: false };
  return decodeSaveEnvelope(envelope);
}

function extractDeclaredVersion(input: unknown): number | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>).saveSchemaVersion;
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/**
 * Validates, migrates and checksum-verifies an arbitrary value into the
 * current `SaveEnvelope` contract. Unknown or future versions, structural
 * corruption and checksum mismatches each fail with a distinct, actionable
 * error code.
 */
export function decodeSaveEnvelope(input: unknown): SaveDecodeResult {
  const declaredVersion = extractDeclaredVersion(input);
  if (declaredVersion === undefined) {
    return {
      ok: false,
      error: { code: 'invalid-shape', message: 'Save envelope is missing a numeric saveSchemaVersion.' },
    };
  }

  const migrationResult = saveMigrationChain.migrate<SaveEnvelope>(input, declaredVersion);
  if (!migrationResult.ok) return { ok: false, error: migrationResult.error };

  // The checksum covers the payload, and a migration may rewrite the payload
  // (V1 -> V2 re-encodes entity liveness, #50). So it is verified against the
  // payload it was actually computed over: the save exactly as written, at
  // the version it declared, before any step ran. Verifying it after
  // migration instead would either report every older save as corrupt, or --
  // if the migration recomputed it first -- report every older save as intact
  // whether or not it was. `declaredValue` is the chain's own parsed value,
  // not the caller's object, so this reads validated data.
  const asWritten = migrationResult.declaredValue as { readonly checksum: string; readonly payload: JsonValue };
  if (asWritten.checksum !== computeSaveChecksum(asWritten.payload)) {
    return {
      ok: false,
      error: {
        code: 'checksum-mismatch',
        message: 'Save checksum does not match its payload; the save is corrupt.',
        atVersion: declaredVersion,
      },
    };
  }

  // `envelope` is the migration chain's own freshly parsed value, never the
  // caller's object, so marking it trusted cannot hand out trust for a value
  // an untrusted caller still holds a mutable reference to. That now holds for
  // the whole payload including the `jsonValue` fields, which used to be the
  // exception -- see `detachedJsonValueSchema` and `markTrusted` (issue #106).
  return { ok: true, value: markTrusted(migrationResult.value), migrated: migrationResult.stepsApplied > 0 };
}

export interface CreateSaveEnvelopeInput {
  /**
   * The seed the captured session's RNG streams were derived from (#412),
   * taken from the bundle the authoritative simulation handed back rather than
   * from whatever seed the composing host was configured with -- those differ
   * the moment a session is loaded rather than created.
   *
   * Optional so a caller that genuinely has no seed to report (a payload
   * composed by hand in a test, the migration path) writes a save shaped
   * exactly like every save written before the field existed, instead of
   * asserting a 0 it does not know.
   */
  readonly masterSeed?: number;
  readonly gameVersion: string;
  readonly prisonId: string;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly kernel: KernelSnapshot;
  readonly world: WorldSnapshotV1;
  readonly construction: ConstructionSnapshot;
  /**
   * Already-encoded entity liveness (`encodeEntityStoreSnapshot`), matching
   * the other three fields, which are JSON-safe snapshots too. A caller
   * holding a live `EntityStoreSnapshot` encodes it first; the session
   * controller already receives this form over the worker protocol, so
   * accepting it here removes a re-encode (and the cast that hid it).
   */
  readonly entities?: EncodedEntityStoreSnapshot;
  /**
   * The rest of the simulation (#70), already encoded by
   * `captureSessionSystems`. Optional so a caller that genuinely has no
   * subsystem state -- the migration path, and tests that compose a payload
   * by hand -- is not forced to fabricate one.
   */
  readonly simulation?: EncodedSessionSystems;
  /** Prisoner and staff names (ADR 0015). Session-level, since the registry spans both entity stores. */
  readonly identity?: ActorIdentitySnapshot;
}

/**
 * Composes a fresh, checksummed, schema-valid current-version envelope from
 * live runtime snapshots.
 *
 * The payload is validated **exactly once** here. The envelope's own fields
 * are validated separately by `saveEnvelopeMetadataV5Schema`, which does not
 * re-walk the payload it was just handed; the composed result is then marked
 * trusted so `PrisonSaveRepository.save` does not walk it a third time (#49).
 *
 * Throws (Zod) on an invalid payload or invalid envelope metadata, exactly as
 * before — validity is still proven, just not proven repeatedly.
 */
export function createSaveEnvelope(input: CreateSaveEnvelopeInput): TrustedSaveEnvelope {
  const payload = savePayloadV5Schema.parse({
    ...(input.masterSeed === undefined ? {} : { masterSeed: input.masterSeed }),
    kernel: input.kernel,
    world: input.world,
    construction: input.construction,
    ...(input.entities === undefined ? {} : { entities: input.entities }),
    ...(input.simulation === undefined ? {} : { simulation: input.simulation }),
    ...(input.identity === undefined ? {} : { identity: input.identity }),
  });

  const metadata = saveEnvelopeMetadataV5Schema.parse({
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    gameVersion: input.gameVersion,
    prisonId: input.prisonId,
    revision: input.revision,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    checksum: computeSaveChecksum(payload as JsonValue),
  });

  return markTrusted({ ...metadata, payload } as SaveEnvelope);
}
