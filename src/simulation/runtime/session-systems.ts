import type { ProcurementSnapshot, TreasurySnapshot } from '../economy';
import type { ConfiscationEvent } from '../contraband/confiscation';
import type { InformantRecord } from '../contraband/informants';
import type { IntelligenceLedger } from '../contraband/intelligence';
import type { ContrabandRegistry } from '../contraband/item';
import type { SearchPolicyDefinition } from '../contraband/search-policy';
import type { SearchSystem } from '../contraband/search-system';
import { decodeEntityStoreSnapshot, encodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from '../entity/entity-codec';
import type { TunnelRecord } from '../incidents/escape';
import type { GangRegistry } from '../incidents/gangs';
import type { IncidentLog } from '../incidents/incident';
import type { IncidentResponseSystem } from '../incidents/response-system';
import type { SectorRiskTracker } from '../incidents/sector-risk';
import type { IncidentTriggerSystem } from '../incidents/trigger-system';
import type { DoorDefinition } from '../navigation/door';
import { Container } from '../operations/inventory';
import type { CarryItemJob } from '../operations/job';
import type { UtilityNetwork } from '../operations/utility-network';
import {
  CurrentActionComponent,
  PositionComponent,
  PrisonerColdState,
  PrisonerRecordComponent,
} from '../prisoners/components';
import { NEED_IDS, NeedsComponent, type NeedId } from '../prisoners/needs';
import type { PlacedObject } from '../objects';
import { applyDefaultSecuritySector } from '../security/default-sector';
import type { DeploymentSchedule } from '../security/deployment-schedule';
import type { GuardRecord, GuardRoster } from '../security/guard-roster';
import type { SecuritySectorDefinition } from '../security/sector';
import { tileCoordinate, type TilePosition } from '../world/coordinates';
import type { SimulationRuntime } from './new-session';

/**
 * The simulation systems a save carries beyond kernel/world/construction
 * (issue #70), and the JSON-safe encoding they travel in.
 *
 * Every subsystem below already owned a `getSnapshot`/`loadSnapshot` pair
 * before this module existed; what was missing was a payload to put them in.
 * This file is therefore deliberately *wiring plus encoding*, not new
 * serialization logic — it reads the subsystems' own snapshot contracts and
 * only converts what is not already JSON (typed arrays, `Map` values) into a
 * form the worker protocol's `jsonValue` payload and the save schema accept.
 *
 * Two rules govern everything here, both from `docs/DETERMINISM.md`:
 *
 * 1. **Canonical order, never `Map`/`Set` iteration order.** Every subsystem
 *    snapshot method already emits sorted entries; where this module reads a
 *    registry directly (doors, sector definitions, room instances, the
 *    runtime's mutable configuration arrays) it sorts explicitly.
 * 2. **Population-shaped, never capacity-shaped.** `DEFAULT_PRISONER_CAPACITY`
 *    is 5,000 slots; writing eighteen per-prisoner component arrays at that
 *    allocation would cost **~298 KiB (305,332 bytes) in every save even for a
 *    prison with no prisoners at all** — the exact mistake #50 removed from
 *    the entity ledger. See `encodePrisonerComponents` for what is written
 *    instead.
 *
 *    That figure is the JSON size of the encoded shape at 5,000 slots with
 *    every array at its constructor default (needs at `NEED_MAX_SCALED` =
 *    51,000, `actionIndex` at its `-1` sentinel, the rest zero), measured
 *    rather than derived — the encoded arrays are `readonly number[]`, so the
 *    cost is digit widths and not element sizes. A populated mid-game prison,
 *    where three of the arrays hold seven-digit tick stamps, measures ~425 KiB
 *    at the same capacity. `docs/PERSISTENCE.md` states the same two figures
 *    for the same claims; this comment once said ~300 KiB for the first, which
 *    was neither figure (#169).
 *
 *    Both numbers moved with save-schema V4 (#259): needs are stored scaled by
 *    `NEED_SCALE`, five digits rather than three, across 30,000 elements at
 *    this capacity. The pre-V4 figures were ~240 KiB (245,332 bytes) and
 *    ~337 KiB.
 */

// --- Prisoner components -----------------------------------------------

/**
 * Per-prisoner component state, written across the store's **allocated
 * prefix** (`maxActiveIndex + 1` slots) rather than its full capacity.
 *
 * Why the allocated prefix and not only the live indices: nothing clears a
 * component array when an entity is destroyed, so a freed index inside the
 * prefix keeps whatever its previous occupant left there until it is
 * recycled. Writing those slots is what makes a restored session's arrays
 * *identical* to a continuous one's rather than merely equivalent. Slots
 * *above* the prefix were never allocated and hold exactly their component
 * constructor defaults, which `decodePrisonerComponents` reproduces, so the
 * prefix costs nothing for them.
 *
 * Until #111 that residue was also future behaviour: `admitPrisoner` reset
 * five of the eighteen arrays, so recycling a freed index handed the next
 * prisoner the previous one's needs, classification and action state. It now
 * resets all eighteen, so a dead slot's contents can no longer become a live
 * prisoner's starting state. Whether the payload could therefore shrink to
 * the live indices only is a save-format change and a decision of its own;
 * writing the prefix is correct either way, and is what this codec does.
 *
 * Why plain arrays and not run-length encoding (which `entities` uses):
 * needs levels, positions and tick stamps differ per prisoner, so RLE would
 * spend two numbers per prisoner where a plain array spends one. Measured
 * against the x-large tier's 3,000 prisoners, RLE was larger overall — it
 * only wins for the handful of uniform arrays (`intakeStage`, `riskTier`),
 * and loses on the twelve that are not. `entities` is the opposite case: its
 * three arrays are uniform runs by construction, which is why RLE is right
 * there and wrong here.
 */
export interface EncodedPrisonerComponents {
  /** Slots written: `entityStore.maxActiveIndex + 1`. Every array below has exactly this length. */
  readonly activeLength: number;
  readonly sentenceLengthTicks: readonly number[];
  readonly priorIncidentsAtIntake: readonly number[];
  readonly sentenceEndTick: readonly number[];
  readonly riskTier: readonly number[];
  readonly classificationGroupIndex: readonly number[];
  readonly intakeStage: readonly number[];
  /**
   * Keyed by need id rather than positional, so reordering `NEED_IDS` cannot
   * silently swap two needs' levels in an existing save.
   *
   * Values are in `NeedsComponent`'s **stored units** (`level * NEED_SCALE`),
   * not whole 0-255 levels, so a restore recovers the sub-level remainder a
   * mid-interval save was holding. That change of units is what makes this a
   * V4 payload rather than a V3 one; see `docs/PERSISTENCE.md`.
   */
  readonly needs: { readonly [Need in NeedId]: readonly number[] };
  readonly actionIndex: readonly number[];
  readonly actionPhase: readonly number[];
  readonly phaseStartedAtTick: readonly number[];
  readonly needFulfilledLastTick: readonly number[];
  readonly tileX: readonly number[];
  readonly tileY: readonly number[];
}

export interface EncodedPrisonerColdState {
  readonly accommodationInstanceId: readonly (readonly [number, string])[];
  readonly currentActionTargetInstanceId: readonly (readonly [number, string])[];
}

export interface EncodedPrisoners {
  readonly components: EncodedPrisonerComponents;
  readonly coldState: EncodedPrisonerColdState;
  /**
   * Room-instance *definitions*, not only occupancy.
   * `RoomInstanceRegistry.getSnapshot` deliberately carries occupancy alone,
   * on the documented assumption that session/scenario setup re-registers the
   * instances first. A save has no scenario to re-register them: without the
   * definitions, `loadSnapshot` throws on the first occupied cell. So the
   * definitions are part of the payload, and the assumption that made them
   * excludable no longer holds once a save is the thing doing the restoring.
   */
  readonly roomInstanceDefinitions: readonly PersistedRoomInstance[];
  readonly roomInstanceOccupancy: readonly (readonly [string, readonly number[]])[];
}

/**
 * A room instance as the save carries it: identity, anchor and the rectangle.
 *
 * **Not `RoomInstance`**, and the difference is the whole of ADR 0028 decision
 * 6's removal half. `residentCapacity`, `concurrentUseCapacity` and
 * `objectCapabilities` are pure functions of (placed objects, room bounds, the
 * two catalogues), and a persisted derived value can disagree with the state
 * that produced it -- so they are recomputed on restore by
 * `RoomCapacityResolver.resolveAll` instead of being carried. A payload that
 * carried them would also make `snapshot() -> restore() -> run N ticks` land on
 * the same state by *agreement* rather than by construction.
 *
 * `width`/`height` are optional here because they are optional in the schema:
 * a V4 save recorded no rectangle and the migration invents none.
 */
export interface PersistedRoomInstance {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  readonly anchorTile: TilePosition;
  readonly width?: number;
  readonly height?: number;
}

// --- Operations ---------------------------------------------------------

export interface EncodedUtilityNetwork {
  readonly type: 'electricity' | 'water';
  readonly nodes: readonly { readonly id: string; readonly kind: 'producer' | 'consumer'; readonly capacityOrDemand: number }[];
  readonly connections: readonly (readonly [string, string])[];
  readonly failedNodeIds: readonly string[];
}

export interface EncodedOperations {
  /** `[containerId, [[itemId, quantity, reserved], ...]]`. Container *ids* are carried too: a restored session has only the construction container until this registers the rest. */
  readonly containers: readonly (readonly [string, readonly (readonly [string, number, number])[]])[];
  readonly jobs: readonly CarryItemJob[];
  readonly jobWorkers: { readonly workers: readonly number[]; readonly busy: readonly number[] };
  readonly electricity: EncodedUtilityNetwork;
  readonly water: EncodedUtilityNetwork;
}

// --- Navigation ---------------------------------------------------------

export interface EncodedNavigation {
  /**
   * Doors are authoritative placed state, not a cache: nothing derives them
   * from `SparseWorld` (the world's edge planes say a boundary exists; the
   * registry says whether it is a gated opening), and their lock state is
   * gameplay. Each door is written at its **baseline** state — the state
   * `SecuritySectorRegistry` restores it to on `'normal'` — so a save taken
   * during a lockdown can be lifted out of it. The live state is reproduced
   * by re-applying the sector control states after registration.
   */
  readonly doors: readonly DoorDefinition[];
}

// --- Security -----------------------------------------------------------

export interface EncodedSecurity {
  /** Static sector definitions, carried for the same reason room-instance definitions are: a save is the only thing re-establishing them. */
  readonly sectorDefinitions: readonly SecuritySectorDefinition[];
  readonly sectorControlStates: readonly (readonly [string, 'normal' | 'restricted' | 'lockdown'])[];
  readonly guards: {
    readonly entityStore: EncodedEntityStoreSnapshot;
    readonly records: readonly (readonly [number, GuardRecord])[];
  };
  readonly schedules: readonly DeploymentSchedule[];
  readonly deployment: { readonly metrics: { readonly deploymentFailures: number } };
  readonly patrol: { readonly metrics: { readonly loopsCompletedOnTime: number; readonly loopsCompletedLate: number; readonly loopsMissed: number } };
}

// --- Contraband ---------------------------------------------------------

export interface EncodedContraband {
  readonly items: ReturnType<ContrabandRegistry['getSnapshot']>;
  readonly intelligence: ReturnType<IntelligenceLedger['getSnapshot']>;
  readonly informants: readonly InformantRecord[];
  readonly confiscations: readonly ConfiscationEvent[];
  readonly searchPolicies: readonly SearchPolicyDefinition[];
  readonly searchContainerLocations: readonly (readonly [string, { readonly x: number; readonly y: number }])[];
  readonly search: ReturnType<SearchSystem['getSnapshot']>;
}

// --- Incidents ----------------------------------------------------------

export interface EncodedIncidents {
  readonly log: ReturnType<IncidentLog['getSnapshot']>;
  readonly sectorRisk: ReturnType<SectorRiskTracker['getSnapshot']>;
  readonly gangs: ReturnType<GangRegistry['getSnapshot']>;
  readonly tunnels: readonly TunnelRecord[];
  readonly watchedSectorIds: readonly string[];
  readonly trigger: ReturnType<IncidentTriggerSystem['getSnapshot']>;
  readonly response: ReturnType<IncidentResponseSystem['getSnapshot']>;
}

/**
 * Everything a session snapshot carries beyond the four fields V2 had. One
 * key per subsystem family, so a future version can extend one family
 * without reshaping the rest.
 */
export interface EncodedSessionSystems {
  readonly prisoners: EncodedPrisoners;
  readonly operations: EncodedOperations;
  readonly navigation: EncodedNavigation;
  readonly security: EncodedSecurity;
  readonly contraband: EncodedContraband;
  readonly incidents: EncodedIncidents;
  /**
   * The treasury balance and the deliveries in flight (#96, #89).
   *
   * **Optional, for the same reason `SessionSnapshotBundle.simulation` is.**
   * A save written before the economy existed carries no economy, and a
   * required field would make every one of them unrestorable. Absent restores
   * a treasury at its starting balance with nothing in flight, which is what
   * a prison that predates money actually had.
   *
   * A pending delivery is carried rather than dropped because dropping it
   * would take the player's money and never deliver: `purchase` spends
   * immediately and the goods arrive later, so a save taken in between holds
   * the only record that the money bought anything.
   */
  readonly economy?: EncodedEconomy;
  /**
   * Everything standing in the prison
   * ([ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
   * decision 6).
   *
   * **Optional, and absence means "no object has been placed"** -- which is
   * what every save written before V5 meant, because no such build could place
   * one. That is why the V4 -> V5 migration adds no section and needs no step:
   * it is the optional-field pattern `docs/PERSISTENCE.md` describes, exactly.
   *
   * A section beside `economy` rather than a field on `prisoners`: an object is
   * not prisoner state, it stands in a room whether or not anyone lives there,
   * and `door-wooden`'s existence is the reminder that an object need not
   * belong to a room at all. Nesting it under a room instance was rejected
   * outright by decision 1 -- deleting a room would then delete its furniture
   * from the save with no record it existed.
   *
   * Note what is **not** here: no capacity, no capability, no room id. All
   * three are derived at restore, which is the same removal that took
   * `capacity` off a room instance.
   */
  readonly objects?: EncodedObjects;
}

export interface EncodedObjects {
  /** Ascending `(anchorTile.y, anchorTile.x)`, never by `placedObjectId` -- see `PlacedObjectRegistry`. */
  readonly placedObjects: readonly PlacedObject[];
}

export interface EncodedEconomy {
  readonly treasury: TreasurySnapshot;
  readonly procurement: ProcurementSnapshot;
}

// --- Prisoner component codec ------------------------------------------

function sliceOf(values: ArrayLike<number>, length: number): number[] {
  const result: number[] = new Array<number>(length);
  for (let index = 0; index < length; index += 1) result[index] = values[index]!;
  return result;
}

export function encodePrisonerComponents(prisoners: SimulationRuntime['prisoners']): EncodedPrisonerComponents {
  const activeLength = Math.max(0, prisoners.entityStore.maxActiveIndex + 1);
  const needs: Partial<Record<NeedId, readonly number[]>> = {};
  for (const needId of NEED_IDS) needs[needId] = sliceOf(prisoners.needs.levels[needId], activeLength);

  return {
    activeLength,
    sentenceLengthTicks: sliceOf(prisoners.records.sentenceLengthTicks, activeLength),
    priorIncidentsAtIntake: sliceOf(prisoners.records.priorIncidentsAtIntake, activeLength),
    sentenceEndTick: sliceOf(prisoners.records.sentenceEndTick, activeLength),
    riskTier: sliceOf(prisoners.records.riskTier, activeLength),
    classificationGroupIndex: sliceOf(prisoners.records.classificationGroupIndex, activeLength),
    intakeStage: sliceOf(prisoners.records.intakeStage, activeLength),
    needs: needs as { readonly [Need in NeedId]: readonly number[] },
    actionIndex: sliceOf(prisoners.currentAction.actionIndex, activeLength),
    actionPhase: sliceOf(prisoners.currentAction.phase, activeLength),
    phaseStartedAtTick: sliceOf(prisoners.currentAction.phaseStartedAtTick, activeLength),
    needFulfilledLastTick: sliceOf(prisoners.currentAction.needFulfilledLastTick, activeLength),
    tileX: sliceOf(prisoners.position.tileX, activeLength),
    tileY: sliceOf(prisoners.position.tileY, activeLength),
  };
}

/**
 * Rebuilds the full-capacity component snapshots
 * `PrisonerOperationsRuntime.loadSnapshot` expects.
 *
 * Slots above `activeLength` are filled by constructing a fresh component of
 * the same capacity and overwriting only the written prefix, so an
 * unallocated slot restores to exactly the value it holds in a never-saved
 * session (`intakeStage: 'queued'`, `actionIndex: -1`, every need at
 * `NEED_MAX`, which the array holds as `NEED_MAX_SCALED`) rather than to
 * zero.
 */
export function decodePrisonerComponents(
  encoded: EncodedPrisonerComponents,
  capacity: number,
): {
  records: ReturnType<PrisonerRecordComponent['getSnapshot']>;
  needs: ReturnType<NeedsComponent['getSnapshot']>;
  currentAction: ReturnType<CurrentActionComponent['getSnapshot']>;
  position: ReturnType<PositionComponent['getSnapshot']>;
} {
  const length = encoded.activeLength;
  if (!Number.isInteger(length) || length < 0 || length > capacity) {
    throw new RangeError(`Prisoner component snapshot covers ${length} slots, which is outside a capacity of ${capacity}.`);
  }

  const records = new PrisonerRecordComponent(capacity).getSnapshot();
  records.sentenceLengthTicks.set(encoded.sentenceLengthTicks);
  records.priorIncidentsAtIntake.set(encoded.priorIncidentsAtIntake);
  records.sentenceEndTick.set(encoded.sentenceEndTick);
  records.riskTier.set(encoded.riskTier);
  records.classificationGroupIndex.set(encoded.classificationGroupIndex);
  records.intakeStage.set(encoded.intakeStage);

  const needs = new NeedsComponent(capacity).getSnapshot();
  for (const needId of NEED_IDS) needs[needId].set(encoded.needs[needId]);

  const currentAction = new CurrentActionComponent(capacity).getSnapshot();
  currentAction.actionIndex.set(encoded.actionIndex);
  currentAction.phase.set(encoded.actionPhase);
  currentAction.phaseStartedAtTick.set(encoded.phaseStartedAtTick);
  currentAction.needFulfilledLastTick.set(encoded.needFulfilledLastTick);

  const position = new PositionComponent(capacity).getSnapshot();
  position.tileX.set(encoded.tileX);
  position.tileY.set(encoded.tileY);

  return { records, needs, currentAction, position };
}

// --- Capture ------------------------------------------------------------

function utilitySnapshot(network: UtilityNetwork): EncodedUtilityNetwork {
  const snapshot = network.getSnapshot();
  return {
    type: snapshot.type,
    nodes: snapshot.nodes.map((node) => ({ id: node.id, kind: node.kind, capacityOrDemand: node.capacityOrDemand })),
    connections: snapshot.connections.map(([a, b]) => [a, b] as const),
    failedNodeIds: [...snapshot.failedNodeIds],
  };
}

function guardsSnapshot(roster: GuardRoster): EncodedSecurity['guards'] {
  const snapshot = roster.getSnapshot();
  return {
    entityStore: encodeEntityStoreSnapshot(snapshot.entityStore),
    records: snapshot.records.map(([id, record]) => [id, { ...record }] as const),
  };
}

/**
 * Every door at the state `SecuritySectorRegistry` would restore it to on
 * `'normal'` — its baseline, not necessarily its state right now.
 *
 * `setControlState` computes each transition from the baseline, never from
 * the just-prior state, so a door saved mid-lockdown must be written at its
 * baseline or the lockdown becomes permanent (restoring the live `'locked'`
 * state would make `'locked'` the new baseline). Reconstructing the baseline
 * from the live state is impossible — `'restricted'` maps both `'open'` and
 * `'closed'` onto `'closed'`, and `'lockdown'` maps everything onto
 * `'locked'` — so the registry exposes it directly
 * (`getBaselineDoorStates`). Ungoverned doors have no baseline and are
 * written at their live state, which for them *is* authoritative.
 */
function doorsSnapshot(runtime: SimulationRuntime): readonly DoorDefinition[] {
  const baseline = new Map(runtime.securitySectors.getBaselineDoorStates());
  return [...runtime.navigation.doors.all()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((door) => ({ ...door, state: baseline.get(door.id) ?? door.state }));
}

function roomInstanceDefinitions(runtime: SimulationRuntime): readonly PersistedRoomInstance[] {
  // `getSnapshot()` emits one entry per *registered* instance (occupancy is
  // seeded on `register`), so its keys are the complete, already-sorted
  // instance-id list -- no second enumeration path is needed.
  return runtime.prisoners.roomInstances
    .getSnapshot()
    .map(([instanceId]) => {
      const instance = runtime.prisoners.roomInstances.getById(instanceId);
      if (instance === undefined) throw new Error(`Invariant violated: room instance "${instanceId}" has occupancy but no definition.`);
      // Field by field rather than a spread, and deliberately: a spread would
      // carry the three derived fields into the payload, where
      // `roomInstanceSchemaV5` is `.strict()` and would reject them -- so the
      // shape is stated once, here, and the schema checks it.
      return {
        instanceId: instance.instanceId,
        roomCatalogId: instance.roomCatalogId,
        anchorTile: { ...instance.anchorTile },
        // Spread rather than an explicit `undefined`, for the reason
        // `ConstructionSnapshot` spreads its open gesture: a key holding
        // `undefined` reaches `computeSaveChecksum` but does not survive the
        // JSON round trip into storage, so the reloaded payload would hash
        // differently from the one that was checksummed.
        ...(instance.width === undefined ? {} : { width: instance.width }),
        ...(instance.height === undefined ? {} : { height: instance.height }),
      };
    });
}

function sortedTileEntries(map: ReadonlyMap<string, TilePosition>): readonly (readonly [string, { readonly x: number; readonly y: number }])[] {
  return [...map.keys()].sort().map((key) => [key, { x: map.get(key)!.x, y: map.get(key)!.y }] as const);
}

/**
 * Deletes keys whose value is `undefined`, recursively.
 *
 * Several subsystem snapshots spread a record that declares an optional field
 * as `field: T | undefined`, so the key is *present* with an `undefined`
 * value. That is not JSON: `isJsonValue` rejects it (the worker protocol
 * declares its `structured-clone` payload as `jsonValue`, so such a bundle
 * would be refused at the message boundary), `canonicalJson` throws on it,
 * and — worst of the three — a `JSON.stringify`/`parse` round trip silently
 * drops the key, so an envelope checksummed before the round trip would no
 * longer match itself after it. Pruning once, here, makes the encoded form
 * identical in and out of storage.
 */
function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry: unknown) => pruneUndefined(entry)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) continue;
      result[key] = pruneUndefined(entry);
    }
    return result as T;
  }
  return value;
}

/** Reads every persisted subsystem's own snapshot contract. Never touches renderer state, and never mutates the runtime. */
export function captureSessionSystems(runtime: SimulationRuntime): EncodedSessionSystems {
  const coldState = runtime.prisoners.coldState.getSnapshot();

  return pruneUndefined({
    prisoners: {
      components: encodePrisonerComponents(runtime.prisoners),
      coldState: {
        accommodationInstanceId: coldState.accommodationInstanceId.map(([id, value]) => [id, value] as const),
        currentActionTargetInstanceId: coldState.currentActionTargetInstanceId.map(([id, value]) => [id, value] as const),
      },
      roomInstanceDefinitions: roomInstanceDefinitions(runtime),
      roomInstanceOccupancy: runtime.prisoners.roomInstances.getSnapshot().map(([id, occupants]) => [id, [...occupants]] as const),
    },
    operations: {
      containers: runtime.containers.getSnapshot().map(([id, stock]) => [id, stock.map((entry) => [entry[0], entry[1], entry[2]] as const)] as const),
      jobs: runtime.jobs.getSnapshot().map((job) => ({ ...job })),
      jobWorkers: { ...runtime.jobWorkers.getSnapshot() },
      electricity: utilitySnapshot(runtime.electricity),
      water: utilitySnapshot(runtime.water),
    },
    navigation: { doors: doorsSnapshot(runtime) },
    security: {
      sectorDefinitions: runtime.securitySectors.all().map((sector) => ({ ...sector })),
      sectorControlStates: runtime.securitySectors.getSnapshot().map(([id, state]) => [id, state] as const),
      guards: guardsSnapshot(runtime.securityGuards),
      // Canonical order: a schedule list is scenario-authored and read by
      // `findSchedule`'s first match, so it is sorted by sector id rather
      // than left in push order.
      schedules: [...runtime.securitySchedules].sort((a, b) => (a.sectorId < b.sectorId ? -1 : a.sectorId > b.sectorId ? 1 : 0)),
      deployment: { metrics: runtime.deploymentSystem.getMetrics() },
      patrol: { metrics: runtime.patrolSystem.getMetrics() },
    },
    contraband: {
      items: runtime.contraband.getSnapshot(),
      intelligence: runtime.intelligence.getSnapshot(),
      informants: runtime.informants.getSnapshot(),
      confiscations: runtime.confiscations.getSnapshot(),
      searchPolicies: [...runtime.searchPolicies].sort((a, b) => (a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0)),
      searchContainerLocations: sortedTileEntries(runtime.searchContainerLocations),
      search: runtime.searchSystem.getSnapshot(),
    },
    economy: {
      treasury: runtime.treasury.snapshot(),
      procurement: runtime.procurement.snapshot(),
    },
    // Emitted unconditionally by a live capture, empty array and all: a session
    // that has placed nothing writes `{ placedObjects: [] }`, which says "this
    // prison has none", where an *absent* section says "this save does not
    // know". The optionality exists for the migration, which genuinely does not
    // know -- the same distinction `migrateSaveEnvelopeV2ToV3` draws for the
    // `simulation` section itself.
    objects: { placedObjects: runtime.placedObjects.getSnapshot() },
    incidents: {
      log: runtime.incidents.getSnapshot(),
      sectorRisk: runtime.sectorRisk.getSnapshot(),
      gangs: runtime.gangs.getSnapshot(),
      tunnels: runtime.tunnels.getSnapshot(),
      // `IncidentTriggerSystem.update` sorts this itself before sampling, so
      // sorting it here changes nothing about play and removes push order
      // from the payload.
      watchedSectorIds: [...runtime.incidentSectorIds].sort(),
      trigger: runtime.incidentTriggerSystem.getSnapshot(),
      response: runtime.incidentResponseSystem.getSnapshot(),
    },
  });
}

// --- Restore ------------------------------------------------------------

/**
 * Applies an encoded systems snapshot onto a freshly wired runtime.
 *
 * Order matters and is enforced here rather than left to the caller:
 *
 * 1. **Doors, then sectors, then control states.** `SecuritySectorRegistry`
 *    captures each governed door's baseline state at `register` time, so the
 *    doors must already be registered *at their baseline* before a sector is;
 *    re-applying the control state afterwards is what puts a locked-down
 *    prison back into lockdown.
 * 2. **Room instances and containers before the snapshots that reference
 *    them.** `RoomInstanceRegistry.loadSnapshot` throws on an unknown
 *    instance id and `ContainerRegistry.loadSnapshot` on an unknown container
 *    id — correctly, since both are guarding against a corrupt save rather
 *    than against a missing definition.
 * 3. **Entity liveness before components.** `PrisonerOperationsRuntime`
 *    re-derives its query bitset from restored liveness, so the store must be
 *    part of the same `loadSnapshot` call — which is why the caller hands the
 *    already-decoded `EntityStoreSnapshot` in rather than loading it first.
 */
export function restoreSessionSystems(
  runtime: SimulationRuntime,
  systems: EncodedSessionSystems,
  entityStore: ReturnType<typeof decodeEntityStoreSnapshot>,
): void {
  // 1. Navigation doors at baseline, then sectors (which snapshot that
  //    baseline), then the control states that cascade onto the doors.
  for (const door of systems.navigation.doors) runtime.navigation.doors.register({ ...door });
  /*
   *    **A sector the runtime already holds is skipped, not re-registered.**
   *
   *    `SecuritySectorRegistry.register` throws on a duplicate id, and since
   *    [ADR 0036](../../../docs/adr/0036-a-derived-default-security-sector.md)
   *    the runtime this function is handed already holds one sector: the derived
   *    default, registered by `createNewSimulationRuntime`, which
   *    `restoreSimulationRuntime` builds the session with. Without this guard a
   *    save written by any session at all would fail to load.
   *
   *    Skipping is the right resolution rather than the convenient one.
   *    `SecuritySectorRegistry`'s own contract is that a sector's static
   *    definition is *"assumed re-registered identically by session/scenario
   *    setup before `loadSnapshot` runs"* -- only the mutable control state is
   *    part of the snapshot. The default sector is a pure function of the
   *    world, the world is restored before this runs and handed into the same
   *    wiring a live session uses, so what the payload carries for it and what
   *    the runtime derived are the same definition; the payload's copy is
   *    redundant rather than authoritative, exactly as room geometry and
   *    navigation caches are (`restore-session.ts`'s `RestoredScope`).
   *    `tests/integration/security-default-sector.test.ts` pins that they are
   *    identical across a real round trip rather than trusting it.
   *
   *    Nothing is lost for a *scenario* sector: the guard only fires for an id
   *    already present, and nothing but the default is registered before this
   *    point.
   */
  for (const sector of systems.security.sectorDefinitions) {
    if (runtime.securitySectors.getDefinition(sector.id) !== undefined) continue;
    runtime.securitySectors.register({ ...sector });
  }
  runtime.securitySectors.loadSnapshot(systems.security.sectorControlStates);

  // 2. Definitions that other snapshots reference by id.
  //
  //    A room instance is registered with **zero derived capacity**, because
  //    the payload no longer carries any (ADR 0028 decision 6): the three
  //    fields are recomputed a few lines below, from the objects placed in the
  //    same step. Registering zeroes first and resolving after is what makes
  //    the restore order stated rather than implicit -- and it has to be this
  //    way round, because a capacity is a fact about the objects inside a
  //    rectangle and the rectangle has to exist first.
  for (const instance of systems.prisoners.roomInstanceDefinitions) {
    runtime.prisoners.roomInstances.register({
      ...instance,
      anchorTile: { ...instance.anchorTile },
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
  }

  //    The objects, then the capacities they imply. **Before step 3**, which is
  //    the ordering constraint decision 6 names: prisoner occupancy is loaded
  //    there, and `RoomInstanceRegistry.loadSnapshot` refills occupant sets
  //    without consulting a capacity -- but `IntakeSystem`'s first scheduled
  //    tick after the restore reads one, and an instance whose capacity had not
  //    been resolved yet would look full and refuse an arrival that a live
  //    session would have housed.
  //
  //    An absent section leaves the registry empty, which is what a pre-V5 save
  //    means. `resolveAll` still runs: with no objects it writes the zeroes
  //    that are already there, which is the value a V4 save carried and is why
  //    the migration can drop the field knowing what it was.
  if (systems.objects !== undefined) {
    runtime.placedObjects.loadSnapshot(systems.objects.placedObjects.map((object) => ({ ...object, anchorTile: { ...object.anchorTile } })));
  }
  runtime.roomCapacity.resolveAll();
  for (const [containerId] of systems.operations.containers) {
    if (runtime.containers.getById(containerId) === undefined) runtime.containers.register(new Container(containerId));
  }

  // 3. Prisoners: liveness, components and occupancy in one call, so the
  //    runtime's own bitset re-derivation and in-flight travel reset run.
  const components = decodePrisonerComponents(systems.prisoners.components, entityStore.capacity);
  runtime.prisoners.loadSnapshot({
    entityStore,
    records: components.records,
    needs: components.needs,
    currentAction: components.currentAction,
    position: components.position,
    coldState: {
      accommodationInstanceId: systems.prisoners.coldState.accommodationInstanceId.map(([id, value]) => [id, value] as [number, string]),
      currentActionTargetInstanceId: systems.prisoners.coldState.currentActionTargetInstanceId.map(([id, value]) => [id, value] as [number, string]),
    },
    roomInstanceOccupancy: systems.prisoners.roomInstanceOccupancy.map(([id, occupants]) => [id, [...occupants]] as const),
  });

  // 4. Operations.
  runtime.containers.loadSnapshot(systems.operations.containers);
  runtime.jobs.loadSnapshot(systems.operations.jobs.map((job) => ({ ...job })));
  runtime.jobWorkers.loadSnapshot(systems.operations.jobWorkers);
  runtime.electricity.loadSnapshot(systems.operations.electricity);
  runtime.water.loadSnapshot(systems.operations.water);

  // 5. Security staffing. Schedules are read live off the runtime's own
  //    array, so restoring means refilling that array, not replacing it.
  runtime.securityGuards.loadSnapshot({
    entityStore: decodeEntityStoreSnapshot(systems.security.guards.entityStore),
    records: systems.security.guards.records.map(([id, record]) => [id, { ...record }] as const),
  });
  runtime.securitySchedules.length = 0;
  runtime.securitySchedules.push(...systems.security.schedules.map((schedule) => ({ ...schedule })));
  runtime.deploymentSystem.loadSnapshot(systems.security.deployment);
  runtime.patrolSystem.loadSnapshot(systems.security.patrol);

  // 5b. Money and deliveries in flight (#96).
  //
  //     Absent on every save written before the economy existed, and on those
  //     the runtime keeps the treasury `createNewSimulationRuntime` gave it --
  //     a starting balance and nothing in flight, which is what a prison that
  //     predates money had. Restoring nothing is the correct answer, not a
  //     fallback that papers over missing data.
  if (systems.economy !== undefined) {
    runtime.treasury.restore(systems.economy.treasury);
    runtime.procurement.restore(systems.economy.procurement);
  }

  // 6. Contraband, intelligence and searches.
  runtime.contraband.loadSnapshot(systems.contraband.items);
  runtime.intelligence.loadSnapshot(systems.contraband.intelligence);
  runtime.informants.loadSnapshot(systems.contraband.informants);
  runtime.confiscations.loadSnapshot(systems.contraband.confiscations);
  runtime.searchPolicies.length = 0;
  runtime.searchPolicies.push(...systems.contraband.searchPolicies.map((policy) => ({ ...policy })));
  runtime.searchContainerLocations.clear();
  for (const [containerId, position] of systems.contraband.searchContainerLocations) {
    runtime.searchContainerLocations.set(containerId, { x: tileCoordinate(position.x), y: tileCoordinate(position.y) });
  }
  runtime.searchSystem.loadSnapshot(systems.contraband.search);

  // 7. Incidents.
  runtime.incidents.loadSnapshot(systems.incidents.log);
  runtime.sectorRisk.loadSnapshot(systems.incidents.sectorRisk);
  runtime.gangs.loadSnapshot(systems.incidents.gangs);
  runtime.tunnels.loadSnapshot(systems.incidents.tunnels);
  runtime.incidentSectorIds.length = 0;
  runtime.incidentSectorIds.push(...systems.incidents.watchedSectorIds);
  runtime.incidentTriggerSystem.loadSnapshot(systems.incidents.trigger);
  runtime.incidentResponseSystem.loadSnapshot(systems.incidents.response);

  /*
   * 8. The derived default sector, re-applied after the payload
   *    ([ADR 0036](../../../docs/adr/0036-a-derived-default-security-sector.md)).
   *
   *    `createNewSimulationRuntime` already derived it, and steps 1, 5 and 7
   *    above have just overwritten two of the three collections it filled:
   *    `securitySchedules` and `incidentSectorIds` are both cleared and refilled
   *    from the payload, because `DeploymentSystem` and `IncidentTriggerSystem`
   *    read those arrays live and restoring means refilling the array rather
   *    than replacing it. A save written *before* this ADR carries both of them
   *    empty, so without this line loading such a save would strip the sector's
   *    staffing requirement and its place on the incident watch list, and the
   *    tier would go dark again on exactly the saves players already have.
   *
   *    So it runs last, and `applyDefaultSecuritySector` is idempotent and
   *    payload-wins: a save that carries a schedule or a watch entry for this
   *    sector keeps its own, and one that carries neither gets the derived pair.
   *    This is the whole of what makes ADR 0036 need **no save-schema bump and
   *    no migration** -- `SAVE_SCHEMA_VERSION` stays 5 and no persisted field is
   *    added, because derived state is recomputed rather than carried.
   */
  applyDefaultSecuritySector({
    world: runtime.world,
    sectors: runtime.securitySectors,
    schedules: runtime.securitySchedules,
    watchedSectorIds: runtime.incidentSectorIds,
  });
}
