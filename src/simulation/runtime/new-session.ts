import { defaultContrabandRegistry } from '../../content/contraband-catalog';
import {
  ConfiscationLedger,
  ContrabandRegistry,
  IntelligenceLedger,
  IntelligenceSystem,
  InformantRegistry,
  SearchSystem,
  type CategoryConcealmentResolver,
  type SearchPolicyDefinition,
  type SearchTarget,
  type TargetLocationResolver,
} from '../contraband';
import {
  ConstructionSystem,
} from '../construction';
import {
  GangRegistry,
  IncidentLog,
  IncidentResponseSystem,
  IncidentTriggerSystem,
  SectorRiskTracker,
  TunnelRegistry,
  type SectorOccupantResolver,
  type SectorRiskSampler,
} from '../incidents';
import { ProcurementSystem, StateIncomeSystem, Treasury } from '../economy';
import { RefusalLog } from '../refusals';
import { createSessionCommandHandler } from './session-commands';
import { ACTOR_IDENTITY_RNG_STREAM, ActorIdentityRegistry } from '../identity';
import { Kernel } from '../kernel';
import { NavigationSystem, type NavigationSystemOptions } from '../navigation';
import { Container, ContainerMaterialsProvider, ContainerRegistry, JobBoard, JobSystem, JobWorkerPool, UtilityNetwork } from '../operations';
import { NEED_MAX, PrisonerJobWorkerAdapter, PrisonerOperationsRuntime } from '../prisoners';
import { TopologyManager } from '../rooms/topology';
import { RoomZoningService } from '../rooms/zoning';
import { deriveXoshiroState } from '../rng/seed';
import { NamedRngStreams } from '../rng/streams';
import { DeploymentSystem, GuardRoster, PatrolSystem, SecuritySectorRegistry, type DeploymentSchedule } from '../security';
import { chunkCoordinate, tileCoordinate, type ChunkPosition, type TilePosition } from '../world/coordinates';
import { SparseWorld } from '../world/sparse-world';

/** Well-known container id every session's `ConstructionSystem` draws build materials from -- session/scenario setup deposits into it (directly, or via delivery jobs from other containers) to make construction orders actually wait for and consume real materials (issue #25). */
export const CONSTRUCTION_MATERIALS_CONTAINER_ID = 'construction-materials';

/** Prisoner intake's one intentional RNG use (see `src/simulation/prisoners/classification.ts`); pre-registered on every session's Kernel so `IntakeSystem` can claim it. */
export const PRISONER_CLASSIFICATION_RNG_STREAM = 'prisoners.classification';

/** `SearchSystem`'s detection checks -- kept separate from `CONTRABAND_INTELLIGENCE_RNG_STREAM` so a tip's draw can never perturb a search's draw (issue #27: "one subsystem's draws cannot perturb another"). */
export const CONTRABAND_DETECTION_RNG_STREAM = 'contraband.detection';
/** `reportInformantTip`'s confidence-jitter draw -- a manual hook call, not a per-tick system, but still claims its own named stream up front so it's available whenever a session/scenario calls it. */
export const CONTRABAND_INTELLIGENCE_RNG_STREAM = 'contraband.intelligence';

/**
 * Directional defaults, not a committed performance contract -- see
 * `docs/adr/0007-navigation-work-budgets-and-flow-fields.md` and
 * `docs/BENCHMARKING.md`'s "no hard timing threshold" policy. Candidate
 * values stay candidates until repeated benchmark evidence backs them.
 */
export const DEFAULT_NAVIGATION_SYSTEM_OPTIONS: NavigationSystemOptions = {
  workBudgetPerTick: 2_000,
  agingIntervalTicks: 20,
  flowFieldActivationThreshold: 8,
};

export interface SimulationRuntime {
  readonly kernel: Kernel;
  readonly world: SparseWorld;
  readonly construction: ConstructionSystem;
  /**
   * The prison's money, what it has bought, and what the state pays for
   * running the place (#96, #89, #29).
   *
   * `treasury` holds a balance; `procurement` spends from it and delivers
   * later; `stateIncome` credits it once per in-game day, per occupied place,
   * which is ADR 0017 decision 3's primary income line on the basis decision 6
   * settles. It pays nothing in a session today, and that is a room problem
   * rather than an economy or a population one: `AdmitPrisoner` and the Intake
   * panel put a prisoner in the prison (#261 step 4), and a zoned room is still
   * registered with `capacity: 0`, so there is no occupied *place* for it to
   * pay for. Measured on this tree: a zoned cell, one admitted prisoner and
   * 2,500 ticks leave the balance at 25,000 and
   * `stateIncomeAccruedTodayMinorUnits` at 0. `StateIncomeSystem` says so at
   * length.
   */
  readonly treasury: Treasury;
  readonly procurement: ProcurementSystem;
  readonly stateIncome: StateIncomeSystem;
  /**
   * What the simulation last refused, and how many times (#261).
   *
   * Session state rather than system state, because three routes write to
   * it: `ConstructionSystem` refuses a wall on ground the player does not
   * own, `ProcurementSystem` refuses a purchase the treasury cannot cover,
   * `RoomZoningService` refuses a rectangle that overlaps a room -- and all
   * three reach the player as one alert down one channel.
   *
   * **Not in the session snapshot, deliberately.** See `RefusalLog`'s own
   * comment and `docs/HUD_PROJECTIONS.md` gap 33: this is a notice about an
   * action the player just took, not a condition of the prison, so a restored
   * session starts with none rather than re-raising an alert about a wall
   * that failed before the save.
   */
  readonly refusals: RefusalLog;
  /**
   * Names for prisoners and staff (ADR 0015). Session-owned rather than
   * owned by either population, because it spans both `EntityStore`s --
   * `prisoners` and `securityGuards` each hand out id `0`, so `(kind,
   * entityId)` is the only workable key.
   */
  readonly actorIdentity: ActorIdentityRegistry;
  readonly topology: TopologyManager;
  /**
   * The `ZoneRoom` consumer (#261). Owns no tick work, so it is a service on
   * the runtime rather than a registered system -- like `treasury`, and
   * unlike `construction`.
   *
   * It writes into two things this runtime already holds -- the world's
   * zoning plane and `prisoners.roomInstances` -- so it is constructed after
   * both and holds no state of its own beyond the bounded refusal window
   * documented on `recentRefusals`.
   */
  readonly roomZoning: RoomZoningService;
  readonly navigation: NavigationSystem;
  readonly prisoners: PrisonerOperationsRuntime;
  readonly containers: ContainerRegistry;
  readonly jobs: JobBoard;
  readonly jobWorkers: JobWorkerPool;
  readonly jobSystem: JobSystem;
  readonly electricity: UtilityNetwork;
  readonly water: UtilityNetwork;
  readonly securitySectors: SecuritySectorRegistry;
  readonly securityGuards: GuardRoster;
  /** Mutable and empty until session/scenario setup pushes entries -- the same "no fabricated content" convention `containers`/`jobs`/`electricity`/`water` follow. `DeploymentSystem` reads this array live, so pushing into it after construction is how a scenario adds staffing requirements. */
  readonly securitySchedules: DeploymentSchedule[];
  readonly deploymentSystem: DeploymentSystem;
  readonly patrolSystem: PatrolSystem;
  readonly contraband: ContrabandRegistry;
  readonly intelligence: IntelligenceLedger;
  readonly informants: InformantRegistry;
  readonly confiscations: ConfiscationLedger;
  /** Mutable and empty until session/scenario setup pushes entries -- same convention as `securitySchedules`. `SearchSystem` reads this array live. */
  readonly searchPolicies: SearchPolicyDefinition[];
  readonly searchSystem: SearchSystem;
  /** `'container'`-holder search targets (the `'delivery'` scope) have no inherent position -- `Container` itself carries none. Empty until session/scenario registers a real delivery-bay tile per container id; `locateSearchTarget` (the default `TargetLocationResolver` wired into `searchSystem`) reads this map for `'container'` targets only. */
  readonly searchContainerLocations: Map<string, TilePosition>;
  readonly incidents: IncidentLog;
  readonly sectorRisk: SectorRiskTracker;
  readonly gangs: GangRegistry;
  readonly tunnels: TunnelRegistry;
  /** Mutable and empty until session/scenario setup pushes sector ids -- `IncidentTriggerSystem` reads this array live, same convention as `securitySchedules`/`searchPolicies`. */
  readonly incidentSectorIds: string[];
  readonly incidentTriggerSystem: IncidentTriggerSystem;
  readonly incidentResponseSystem: IncidentResponseSystem;
}

/**
 * Exported because two documentation claims are stated in terms of it -- the
 * "population-shaped, never capacity-shaped" rule in `session-systems.ts` and
 * the same rule in `docs/PERSISTENCE.md` both quote a byte figure derived from
 * this number, and both had drifted (#169). The figure is pinned in
 * `tests/unit/session-component-payload-size.test.ts`, which needs the real
 * value rather than a copy of it.
 */
export const DEFAULT_PRISONER_CAPACITY = 5_000;
/** Realistic guard headcounts are tens, not thousands (see `tests/unit/security-scale.test.ts`) -- generous headroom, not a scale target. */
const DEFAULT_GUARD_CAPACITY = 500;

export interface SimulationRuntimeOptions {
  /**
   * A pre-built world to wire the system graph around, instead of the
   * default single-owned-chunk starter world -- used by
   * `restoreSimulationRuntime` (`restore-session.ts`) to rebuild a session
   * around a world deserialized from a save. The system graph, kernel
   * construction and RNG stream registration are identical either way, so
   * a restored session is wired exactly like a fresh one.
   */
  readonly world?: SparseWorld;
  /** Chunks to mark loaded for navigation. Defaults to the world's own owned chunks, or the starter chunk for a fresh world. */
  readonly loadedChunks?: readonly ChunkPosition[];
}

/**
 * Creates the deterministic authoritative state for a new prison session.
 * Phaser and all browser-facing code receive only derived projections.
 * `masterSeed` seeds every named RNG stream this runtime's systems claim
 * via `deriveXoshiroState` -- pass the same seed to reproduce an identical
 * session deterministically.
 */
export function createNewSimulationRuntime(masterSeed: number = 0, options: SimulationRuntimeOptions = {}): SimulationRuntime {
  const initialChunk = {
    x: chunkCoordinate(0),
    y: chunkCoordinate(0),
  };

  let world: SparseWorld;
  if (options.world !== undefined) {
    world = options.world;
  } else {
    world = new SparseWorld(32);
    world.load(initialChunk);
    world.setOwned(initialChunk, true);
  }

  const topology = new TopologyManager(world);
  const navigation = new NavigationSystem(world, DEFAULT_NAVIGATION_SYSTEM_OPTIONS);
  navigation.setLoadedChunks(options.loadedChunks ?? (options.world === undefined ? [initialChunk] : world.snapshot().ownedChunks.map((position) => ({ x: chunkCoordinate(position.x), y: chunkCoordinate(position.y) }))));

  const rng = new NamedRngStreams([
    { name: PRISONER_CLASSIFICATION_RNG_STREAM, state: deriveXoshiroState(masterSeed, PRISONER_CLASSIFICATION_RNG_STREAM) },
    { name: CONTRABAND_DETECTION_RNG_STREAM, state: deriveXoshiroState(masterSeed, CONTRABAND_DETECTION_RNG_STREAM) },
    { name: CONTRABAND_INTELLIGENCE_RNG_STREAM, state: deriveXoshiroState(masterSeed, CONTRABAND_INTELLIGENCE_RNG_STREAM) },
    { name: ACTOR_IDENTITY_RNG_STREAM, state: deriveXoshiroState(masterSeed, ACTOR_IDENTITY_RNG_STREAM) },
  ]);
  const kernel = new Kernel(0, 0, rng);

  // ADR 0015's session wiring: the registry is constructed here, minted from
  // by `IntakeSystem` at reception and by `GuardRoster.hire`, and snapshotted
  // as its own session-level save field (#70). Its own draws come from
  // `identity.actor-name` alone, so naming an arrival can never shift the
  // sequence `prisoners.classification` hands the arrival after them.
  const actorIdentity = new ActorIdentityRegistry();

  const prisoners = new PrisonerOperationsRuntime({ capacity: DEFAULT_PRISONER_CAPACITY, navigation, identity: actorIdentity });

  // Issue #261's `ZoneRoom` consumer. No default room is zoned here -- the
  // same "no fabricated default content" convention every registry below
  // follows -- so a fresh prison still has no rooms until a `ZoneRoom`
  // command arrives.
  const roomZoning = new RoomZoningService(world, prisoners.roomInstances);

  // Issue #25's job/inventory substrate. Starts empty -- no default stock,
  // no default containers beyond the one construction draws from, no
  // registered workers -- exactly like navigation/prisoners wire real
  // infrastructure without fabricating default content.
  const containers = new ContainerRegistry();
  const constructionMaterials = new Container(CONSTRUCTION_MATERIALS_CONTAINER_ID);
  containers.register(constructionMaterials);
  const construction = new ConstructionSystem(world, new ContainerMaterialsProvider(constructionMaterials));

  // Issue #96's money-first resource model, and the half of its loop that
  // exists (#89). A purchase spends now and delivers later; the delivery
  // lands in the container construction draws from.
  //
  // **Directly, and that is scaffolding.** #96 describes the materials
  // arriving at `room.delivery-bay` and being carried to the site. No session
  // instantiates that room: a `ZoneRoom` command can zone one since #261, and
  // nothing in the application sends that command (`room.delivery-bay` is
  // still content with no reader, #141)
  // -- so there is no bay to deliver to, and inventing one would mean
  // deciding where a new prison's bay sits and when a carry job is raised.
  // Recorded on #96 rather than left to be discovered from the absence.
  const treasury = new Treasury();
  const procurement = new ProcurementSystem(treasury, constructionMaterials);

  // ADR 0017 decision 3's income line, on decision 6's basis: the state pays
  // per prisoner-day, accrued per occupied place, at the end of each in-game
  // day (#29). It reads `prisoners.roomInstances` -- an occupied place is an
  // occupancy slot there -- so it is constructed after the prisoner runtime,
  // and it holds no state of its own, which is why nothing new enters the save.
  const stateIncome = new StateIncomeSystem(treasury, prisoners.roomInstances);

  // Issue #261's route out for a command the simulation accepts and then
  // refuses on its content. Empty for a new session and for a restored one
  // alike -- it is not snapshotted.
  const refusals = new RefusalLog();

  const jobs = new JobBoard();
  const jobWorkers = new JobWorkerPool();
  const jobWorkerAdapter = new PrisonerJobWorkerAdapter(prisoners);
  const jobSystem = new JobSystem(jobs, containers, jobWorkers, jobWorkerAdapter, navigation);

  // Empty until a session/scenario places real generators/consumers --
  // same "no fabricated default content" convention as `containers`/`jobs`.
  const electricity = new UtilityNetwork('electricity');
  const water = new UtilityNetwork('water');

  // Issue #26's security substrate: no sectors, no hired guards and no
  // deployment schedules until a session/scenario registers them (the same
  // "no fabricated default content" convention as `containers`/`jobs`/
  // `electricity`/`water` above). `securitySectors` cascades onto the
  // navigation system's own `DoorRegistry` -- the only door mutation entry
  // point #21/#22 expose -- so sector control-state changes are never a
  // parallel/bypassing door model.
  const securitySectors = new SecuritySectorRegistry(navigation.doors);
  const securityGuards = new GuardRoster(DEFAULT_GUARD_CAPACITY, actorIdentity, () => rng.get(ACTOR_IDENTITY_RNG_STREAM));
  const securitySchedules: DeploymentSchedule[] = [];
  const deploymentSystem = new DeploymentSystem(securitySectors, securityGuards, navigation, securitySchedules);
  const patrolSystem = new PatrolSystem(securitySectors, securityGuards, navigation);

  // Issue #27's contraband/intelligence/search substrate: no contraband
  // instances, no intelligence, no informants and no search policies until
  // a session/scenario introduces them -- same "no fabricated default
  // content" convention as everything above. `locateSearchTarget` resolves
  // a search target's tile from the *real* registries already constructed
  // above (prisoner positions, room-instance anchors, guard tiles) rather
  // than a parallel location model; `'container'` targets (the `'delivery'`
  // scope) fall back to `searchContainerLocations`, since `Container`
  // itself carries no position.
  const contraband = new ContrabandRegistry();
  const intelligence = new IntelligenceLedger();
  const informants = new InformantRegistry();
  const confiscations = new ConfiscationLedger();
  const searchPolicies: SearchPolicyDefinition[] = [];
  const searchContainerLocations = new Map<string, TilePosition>();
  const intelligenceSystem = new IntelligenceSystem(intelligence);

  const categoryConcealment: CategoryConcealmentResolver = (categoryId) => {
    const category = defaultContrabandRegistry.getById(categoryId);
    if (category === undefined) throw new RangeError(`Unknown contraband category id "${categoryId}".`);
    return category.baseConcealment;
  };

  const locateSearchTarget: TargetLocationResolver = (target: SearchTarget) => {
    if (target.holderKind === 'prisoner') {
      const index = prisoners.entityStore.getIndex(Number(target.holderId));
      return { x: tileCoordinate(prisoners.position.tileX[index]!), y: tileCoordinate(prisoners.position.tileY[index]!) };
    }
    if (target.holderKind === 'staff') {
      return securityGuards.getTile(Number(target.holderId));
    }
    if (target.holderKind === 'cell') {
      const room = prisoners.roomInstances.getById(target.holderId);
      if (room === undefined) throw new RangeError(`Unknown cell/room instance id "${target.holderId}" for a search target.`);
      return room.anchorTile;
    }
    const location = searchContainerLocations.get(target.holderId);
    if (location === undefined) throw new RangeError(`No known location for container "${target.holderId}" -- register one in \`searchContainerLocations\` before ordering a delivery search.`);
    return location;
  };

  const searchSystem = new SearchSystem(securityGuards, navigation, contraband, intelligence, confiscations, searchPolicies, categoryConcealment, locateSearchTarget);

  // Issue #28's incident pipeline: no sectors watched, no gangs, no
  // tunnels and no incidents until a session/scenario registers them --
  // same "no fabricated default content" convention as everything above.
  // The default risk sampler derives real inputs from the systems already
  // constructed (deployment coverage shortfall, prisoner needs deficits,
  // contraband intelligence pressure) rather than a parallel state model;
  // a scenario can pass richer sampling by constructing its own
  // IncidentTriggerSystem, exactly like #27's TargetLocationResolver seam.
  const incidents = new IncidentLog();
  const sectorRisk = new SectorRiskTracker();
  const gangs = new GangRegistry();
  const tunnels = new TunnelRegistry();
  const incidentSectorIds: string[] = [];

  const resolveSectorOccupants: SectorOccupantResolver = (sectorId) => {
    const sector = securitySectors.getDefinition(sectorId);
    if (sector === undefined) return [];
    // Occupancy by the sector's own post tile: prisoners standing on it.
    // A richer sector-membership model is scenario knowledge (see docs/INCIDENTS.md).
    const occupants: number[] = [];
    for (let index = 0; index <= prisoners.entityStore.maxActiveIndex; index += 1) {
      if (!prisoners.entityStore.isIndexAlive(index)) continue;
      if (prisoners.position.tileX[index] === sector.postTile.x && prisoners.position.tileY[index] === sector.postTile.y) {
        occupants.push(prisoners.entityStore.getIdByIndex(index));
      }
    }
    return occupants.sort((a, b) => a - b);
  };

  const sampleSectorRisk: SectorRiskSampler = (sectorId, tick) => {
    const coverage = deploymentSystem.getCoverageReport(tick).find((entry) => entry.sectorId === sectorId);
    const staffingShortfall = coverage === undefined || coverage.required === 0 ? 0 : coverage.shortage / coverage.required;

    const occupants = resolveSectorOccupants(sectorId);
    let needsPressure = 0;
    if (occupants.length > 0) {
      let deficitSum = 0;
      for (const entityId of occupants) {
        const index = prisoners.entityStore.getIndex(entityId);
        deficitSum += (NEED_MAX - prisoners.needs.get(index, 'safety')) / NEED_MAX;
      }
      needsPressure = deficitSum / occupants.length;
    }

    let contrabandPressure = 0;
    for (const record of intelligence.forTarget('sector', sectorId)) contrabandPressure = Math.max(contrabandPressure, record.confidence);

    return { needsPressure, staffingShortfall, contrabandPressure };
  };

  const incidentTriggerSystem = new IncidentTriggerSystem(incidents, sectorRisk, gangs, incidentSectorIds, sampleSectorRisk, resolveSectorOccupants);
  const incidentResponseSystem = new IncidentResponseSystem(incidents, securitySectors, securityGuards, navigation);

  kernel.registerSystem(construction);
  kernel.registerSystem(procurement);
  kernel.registerSystem(stateIncome);
  kernel.registerSystem(navigation);
  prisoners.registerOn(kernel);
  kernel.registerSystem(jobSystem);
  kernel.registerSystem(intelligenceSystem);
  kernel.registerSystem(deploymentSystem);
  kernel.registerSystem(patrolSystem);
  kernel.registerSystem(incidentTriggerSystem);
  kernel.registerSystem(searchSystem);
  kernel.registerSystem(incidentResponseSystem);
  kernel.setCommandHandler(createSessionCommandHandler(construction, procurement, roomZoning, prisoners, refusals));

  return {
    kernel,
    world,
    construction,
    treasury,
    procurement,
    stateIncome,
    refusals,
    actorIdentity,
    topology,
    roomZoning,
    navigation,
    prisoners,
    containers,
    jobs,
    jobWorkers,
    jobSystem,
    electricity,
    water,
    securitySectors,
    securityGuards,
    securitySchedules,
    deploymentSystem,
    patrolSystem,
    contraband,
    intelligence,
    informants,
    confiscations,
    searchPolicies,
    searchSystem,
    searchContainerLocations,
    incidents,
    sectorRisk,
    gangs,
    tunnels,
    incidentSectorIds,
    incidentTriggerSystem,
    incidentResponseSystem,
  };
}
