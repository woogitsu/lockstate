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
import { WORLD_SNAPSHOT_VERSION } from '../simulation/world/sparse-world';
import { MigrationChain, type MigrationError, type MigrationErrorCode } from './migration';
import { zodVersionSchema } from './zod-version-schema';
import { computeSaveChecksum } from './checksum';
import type { EncodedEntityStoreSnapshot } from './entity-codec';
import { migrateSaveEnvelopeV1ToV2, migrateSaveEnvelopeV2ToV3 } from './save-migrations';
import type { KernelSnapshot } from '../simulation/kernel/kernel';
import type { WorldSnapshotV1 } from '../simulation/world/sparse-world';
import type { ConstructionSnapshot } from '../simulation/construction/system';
import type { EncodedSessionSystems } from '../simulation/runtime/session-systems';
import { ACTOR_IDENTITY_SNAPSHOT_VERSION, ACTOR_KINDS, type ActorIdentitySnapshot } from '../simulation/identity/actor-identity';

/** The version every newly written save carries. Older versions are still readable via `saveMigrationChain`. */
export const SAVE_SCHEMA_VERSION = 3 as const;

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

const queuedCommandSchema = z
  .object({
    id: identifierSchema,
    sequence: sequenceSchema,
    executeAtTick: tickSchema,
    payload: jsonValueSchema,
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
    chunkSize: z.number().int().positive(),
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

const entityStoreSnapshotV1Schema = z
  .object({
    capacity: z.number().int().min(0),
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
// are: the simulation may not depend on `src/persistence`, and this schema is
// frozen historical shape once V4 exists.
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

const needLevelsSchema = z.array(byteSchema);

const prisonerComponentsSchema = z
  .object({
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
        hunger: needLevelsSchema,
        sleep: needLevelsSchema,
        hygiene: needLevelsSchema,
        bladder: needLevelsSchema,
        safety: needLevelsSchema,
        recreation: needLevelsSchema,
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

const roomInstanceSchema = z
  .object({
    instanceId: z.string().min(1),
    roomCatalogId: z.string().min(1),
    anchorTile: tilePositionSchema,
    capacity: z.number().int().min(0),
    objectCapabilities: z.array(z.string().min(1)),
  })
  .strict();

const prisonersSectionSchema = z
  .object({
    components: prisonerComponentsSchema,
    coldState: z
      .object({
        accommodationInstanceId: z.array(z.tuple([entityIdSchema, z.string().min(1)])),
        currentActionTargetInstanceId: z.array(z.tuple([entityIdSchema, z.string().min(1)])),
      })
      .strict(),
    roomInstanceDefinitions: z.array(roomInstanceSchema),
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
    costMultiplier: z.number(),
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

const sessionSystemsV3Schema = z
  .object({
    prisoners: prisonersSectionSchema,
    operations: operationsSectionSchema,
    navigation: navigationSectionSchema,
    security: securitySectionSchema,
    contraband: contrabandSectionSchema,
    incidents: incidentsSectionSchema,
  })
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

/** Historical V1 payload shape, retained so V1 saves can still be validated and migrated. */
export type SavePayloadV1 = DeepReadonly<z.infer<typeof savePayloadV1Schema>>;
/** Historical V2 payload shape. Only the migration chain and `migrateSaveEnvelopeV2ToV3` should name this. */
export type SavePayloadV2 = DeepReadonly<z.infer<typeof savePayloadV2Schema>>;
export type SavePayloadV3 = DeepReadonly<z.infer<typeof savePayloadV3Schema>>;
/** The payload shape newly written saves use. Prefer this over the versioned alias at call sites that just mean "a save payload". */
export type SavePayload = SavePayloadV3;

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
  .object({ ...saveEnvelopeMetadataShape(SAVE_SCHEMA_VERSION), payload: savePayloadV3Schema })
  .strict();

const saveEnvelopeV3Schema = withOrderedTimestamps(saveEnvelopeV3ObjectSchema);

/** Validates only the envelope's own fields; `payload` is validated separately by `savePayloadV3Schema`. */
const saveEnvelopeMetadataV3Schema = withOrderedTimestamps(
  z.object(saveEnvelopeMetadataShape(SAVE_SCHEMA_VERSION)).strict(),
);

/** Historical V1 envelope shape. Only the migration chain and `migrateSaveEnvelopeV1ToV2` should name this. */
export type SaveEnvelopeV1 = DeepReadonly<z.infer<typeof saveEnvelopeV1ObjectSchema>>;
/** Historical V2 envelope shape. Only the migration chain and the two migrations that touch it should name this. */
export type SaveEnvelopeV2 = DeepReadonly<z.infer<typeof saveEnvelopeV2ObjectSchema>>;
export type SaveEnvelopeV3 = DeepReadonly<z.infer<typeof saveEnvelopeV3ObjectSchema>>;
/**
 * The envelope shape newly written saves use. Call sites that simply mean "a
 * save envelope" use this alias, so the next version bump does not sweep a
 * rename through the repository the way bumping to V2 did.
 */
export type SaveEnvelope = SaveEnvelopeV3;

// --- Migration chain ---
// Every historical version registers its schema once and is never edited;
// each Vn -> Vn+1 transformation registers exactly one step. `MigrationChain`
// itself is additionally exercised end-to-end (multi-hop walking, per-step
// validation, immutability) against synthetic versions in
// tests/unit/persistence-migration.test.ts.
export const saveMigrationChain = new MigrationChain(SAVE_SCHEMA_VERSION);
saveMigrationChain.registerSchema(zodVersionSchema(1, saveEnvelopeV1Schema));
saveMigrationChain.registerSchema(zodVersionSchema(2, saveEnvelopeV2Schema));
saveMigrationChain.registerSchema(zodVersionSchema(SAVE_SCHEMA_VERSION, saveEnvelopeV3Schema));
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
  // Shallow: the payload's interior is already detached from live runtime
  // state (Zod's parse returns a fresh value), and deep-freezing a
  // multi-megabyte payload would reintroduce exactly the per-node walk this
  // change exists to remove.
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
  // an untrusted caller still holds a mutable reference to.
  return { ok: true, value: markTrusted(migrationResult.value), migrated: migrationResult.stepsApplied > 0 };
}

export interface CreateSaveEnvelopeInput {
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
 * are validated separately by `saveEnvelopeMetadataV2Schema`, which does not
 * re-walk the payload it was just handed; the composed result is then marked
 * trusted so `PrisonSaveRepository.save` does not walk it a third time (#49).
 *
 * Throws (Zod) on an invalid payload or invalid envelope metadata, exactly as
 * before — validity is still proven, just not proven repeatedly.
 */
export function createSaveEnvelope(input: CreateSaveEnvelopeInput): TrustedSaveEnvelope {
  const payload = savePayloadV3Schema.parse({
    kernel: input.kernel,
    world: input.world,
    construction: input.construction,
    ...(input.entities === undefined ? {} : { entities: input.entities }),
    ...(input.simulation === undefined ? {} : { simulation: input.simulation }),
    ...(input.identity === undefined ? {} : { identity: input.identity }),
  });

  const metadata = saveEnvelopeMetadataV3Schema.parse({
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
