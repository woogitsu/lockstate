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
import type { RoomInstance } from '../prisoners/room-instance-registry';
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
 *    allocation would cost ~300 KiB in every save regardless of how many
 *    prisoners exist — the exact mistake #50 removed from the entity ledger.
 *    See `encodePrisonerComponents` for what is written instead.
 */

// --- Prisoner components -----------------------------------------------

/**
 * Per-prisoner component state, written across the store's **allocated
 * prefix** (`maxActiveIndex + 1` slots) rather than its full capacity.
 *
 * Why the allocated prefix and not only the live indices: `admitPrisoner`
 * does not reset every component field when a freed index is recycled (it
 * sets position, sentence length, prior incidents and intake stage; needs,
 * risk tier, classification group and action state carry over). A dead slot's
 * residue is therefore *readable state* in a continuous run, so dropping it
 * would make a restored session diverge the moment an index was recycled.
 * Writing the prefix keeps the restore exact while still costing nothing for
 * slots that were never allocated — those hold exactly their component
 * constructor defaults, which `decodePrisonerComponents` reproduces.
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
  /** Keyed by need id rather than positional, so reordering `NEED_IDS` cannot silently swap two needs' levels in an existing save. */
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
  readonly roomInstanceDefinitions: readonly RoomInstance[];
  readonly roomInstanceOccupancy: readonly (readonly [string, readonly number[]])[];
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
 * `NEED_MAX`) rather than to zero.
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

function roomInstanceDefinitions(runtime: SimulationRuntime): readonly RoomInstance[] {
  // `getSnapshot()` emits one entry per *registered* instance (occupancy is
  // seeded on `register`), so its keys are the complete, already-sorted
  // instance-id list -- no second enumeration path is needed.
  return runtime.prisoners.roomInstances
    .getSnapshot()
    .map(([instanceId]) => {
      const instance = runtime.prisoners.roomInstances.getById(instanceId);
      if (instance === undefined) throw new Error(`Invariant violated: room instance "${instanceId}" has occupancy but no definition.`);
      return { ...instance, objectCapabilities: [...instance.objectCapabilities] };
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
  for (const sector of systems.security.sectorDefinitions) runtime.securitySectors.register({ ...sector });
  runtime.securitySectors.loadSnapshot(systems.security.sectorControlStates);

  // 2. Definitions that other snapshots reference by id.
  for (const instance of systems.prisoners.roomInstanceDefinitions) runtime.prisoners.roomInstances.register({ ...instance });
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
}
