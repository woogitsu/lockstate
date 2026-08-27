import { defaultContrabandRegistry } from '../../content/contraband-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
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
  DoorConstructionService,
} from '../construction';
import {
  DEFAULT_INCIDENT_RESPONSE_POLICY,
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
import { StaffHiringService } from '../staff';
import { createSessionCommandHandler } from './session-commands';
import { ACTOR_IDENTITY_RNG_STREAM, ActorIdentityRegistry } from '../identity';
import { Kernel } from '../kernel';
import { NavigationSystem, type NavigationSystemOptions } from '../navigation';
import { Container, ContainerMaterialsProvider, ContainerRegistry, JobBoard, JobSystem, JobWorkerPool, UtilityNetwork } from '../operations';
import { NEED_IDS, NEED_MAX, PrisonerJobWorkerAdapter, PrisonerOperationsRuntime, type DisciplinaryEvidenceSource } from '../prisoners';
import { ObjectPlacementService, PlacedObjectRegistry, RoomCapacityResolver } from '../objects';
import { TopologyManager } from '../rooms/topology';
import { RoomZoningService } from '../rooms/zoning';
import { deriveXoshiroState } from '../rng/seed';
import { NamedRngStreams } from '../rng/streams';
import {
  applyDefaultSecuritySector,
  countSectorOccupants,
  DeploymentSystem,
  GuardReleaseService,
  GuardRoster,
  PatrolSystem,
  resolveSectorOccupants,
  SecuritySectorRegistry,
  type DeploymentSchedule,
} from '../security';
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
  /**
   * The u32 this session's named RNG streams were derived from
   * (`deriveXoshiroState(masterSeed, name)`), recorded so the session can say
   * *which run this is* (issue #412).
   *
   * On the runtime rather than on the `SessionController` deliberately: the
   * authoritative simulation is what a save is captured from (AGENTS.md
   * boundary 5), so a restored session reports the seed **its bundle** was
   * written at, not the seed whichever host happened to be configured with.
   * `captureSessionSnapshot` reads it from here and
   * `restoreSimulationRuntime` feeds it back, so it survives a round trip
   * instead of being re-supplied by the caller.
   *
   * It is not the only thing the seed does any more: since #415 it is also
   * what a stream the bundle omits is re-seeded from, which is why #412 stopped
   * being inert. See ADR 0038.
   */
  readonly masterSeed: number;
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
   * settles. **It pays**, since ADR 0028 phase 1 gave a room a capacity derived
   * from the objects standing in it: measured on this tree, a prison with one
   * zoned cell, one plank bought, one bed placed and one prisoner admitted
   * holds 24,935 after the purchase and 25,235 at tick 2,400 -- the first time
   * the balance moves upward from anything but a refund. `StateIncomeSystem`
   * carries the whole trace, and it says at length what this comment used to
   * say instead: that the line paid nothing because a zoned room was registered
   * with `capacity: 0`.
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
  /**
   * Everything standing in the prison, the rule that turns it into a room's
   * capacity, and the `PlaceObject` consumer (ADR 0028 phase 1).
   *
   * Session state, like `roomZoning` and `treasury`: `placedObjects` is
   * snapshotted (as `simulation.objects`), and the other two hold no state at
   * all -- `roomCapacity` recomputes from the registry and `objectPlacement`
   * keeps only a bounded window of refusals for diagnosis, which is
   * deliberately not saved for the reason `RefusalLog` is not.
   */
  readonly placedObjects: PlacedObjectRegistry;
  readonly roomCapacity: RoomCapacityResolver;
  readonly objectPlacement: ObjectPlacementService;
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
  /**
   * The `HireStaff` consumer (ADR 0025). Owns no tick work and no state of its
   * own, so it is a service on the runtime rather than a registered system --
   * like `roomZoning` and `treasury`, and unlike `deploymentSystem`.
   *
   * It is what finally gives `GuardRoster.hire` a caller in `src/`. Before it,
   * every call in the repository was in a test, so the four systems below that
   * read the roster iterated an empty collection in every session a player
   * could start.
   */
  readonly staffHiring: StaffHiringService;
  /**
   * Releases a guard from whatever is holding it -- a search job, an incident
   * response, or a deployment (ADR 0034, answering ADR 0033's open question 3).
   *
   * The consumer of `ReleaseGuardAssignment`, and it is a session-level service
   * rather than a system for `RoomZoningService`'s and `StaffHiringService`'s
   * reason: it performs no per-tick work, so it has nothing for `update` to do.
   * It is constructed after both `'on-search'` claimants because it reads both of
   * them live -- the claim view cannot be captured, for the reason ADR 0033
   * decision 4 gives.
   */
  readonly guardRelease: GuardReleaseService;
  /**
   * `DeploymentSystem` reads this array live, so pushing into it after
   * construction is how a scenario -- or `applyDefaultSecuritySector` -- adds a
   * staffing requirement.
   *
   * **Not empty for a new session since ADR 0036**: it carries the default
   * sector's one-guard-all-day requirement. It has to, and that is the half of
   * issue #396 the issue itself does not name:
   * `DeploymentSystem.requiredGuardCountFor` answers `0` for a sector with no
   * schedule, so a sector registered into an empty schedule list leaves
   * deployment exactly as inert as no sector at all.
   */
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
  /**
   * `IncidentTriggerSystem` reads this array live, same convention as
   * `securitySchedules`/`searchPolicies`.
   *
   * **Not empty for a new session since ADR 0036**: it carries the default
   * sector's id, for `securitySchedules`' reason. A watched sector is the third
   * of the three empty collections issue #396's one-line `grep` stands for --
   * the trigger system samples only the ids it is handed, so a registered,
   * staffed sector that nothing watches still opens no incident.
   */
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

  /*
   * The two evidence logs, constructed here rather than beside the systems that
   * write them, because `PrisonerOperationsRuntime` now reads them.
   *
   * ADR 0032 makes a prisoner's disciplinary record a *derivation* over these
   * two, so `ClassificationReviewSystem` has to be handed them at
   * construction -- and both are bare constructors with no dependencies, so
   * hoisting them costs nothing and inverts no arrow. `IncidentTriggerSystem`,
   * `IncidentResponseSystem` and `SearchSystem` are still handed the same
   * instances further down; they are the writers, this is the reader.
   *
   * `all()`, never `drain()`: see `DisciplinaryEvidenceSource`. Draining would
   * force the record to become accumulated persisted state, which is the save
   * bump ADR 0032 decision 1 declines to take.
   */
  const incidents = new IncidentLog();
  const confiscations = new ConfiscationLedger();
  const disciplinaryEvidence: DisciplinaryEvidenceSource = {
    incidents: () => incidents.all(),
    confiscations: () => confiscations.all(),
  };

  const prisoners = new PrisonerOperationsRuntime({
    capacity: DEFAULT_PRISONER_CAPACITY,
    navigation,
    identity: actorIdentity,
    disciplinaryEvidence,
  });

  /*
   * ADR 0028 phase 1's three collaborators, and the knot between two of them.
   *
   * `placedObjects` is the registry of everything standing in the prison;
   * `roomCapacity` derives a room instance's two capacities and its capability
   * list from the objects inside its rectangle; `objectPlacement` (below,
   * after `construction`) validates a `PlaceObject` command and mints its
   * construction order. All three start empty, the same "no fabricated default
   * content" convention every registry here follows -- a fresh prison has no
   * objects until an order for one finishes.
   *
   * The knot: `ObjectPlacementService` needs `ConstructionSystem` to submit an
   * order and to read which tiles orders in flight have claimed, and
   * `ConstructionSystem` needs the service to hand a completed object order to.
   * It is tied with a forwarding sink rather than by making either side
   * optional at its own layer, so the *arrow* stays one-way in both files: the
   * construction system knows only `ObjectPlacementSink`, and the placement
   * service knows only `ObjectOrderSink`. The forwarder's `?? false` is
   * unreachable in this function -- nothing steps the kernel between the two
   * statements -- and answering `false` rather than throwing is what makes that
   * true rather than merely likely.
   */
  const placedObjects = new PlacedObjectRegistry();
  const roomCapacity = new RoomCapacityResolver(world, prisoners.roomInstances, placedObjects);
  let objectPlacement: ObjectPlacementService | undefined;

  // Issue #261's `ZoneRoom` consumer. No default room is zoned here -- the
  // same "no fabricated default content" convention every registry below
  // follows -- so a fresh prison still has no rooms until a `ZoneRoom`
  // command arrives. It is handed the capacity resolver because a newly zoned
  // rectangle has to count the objects already standing in it (ADR 0028
  // decision 2).
  const roomZoning = new RoomZoningService(world, prisoners.roomInstances, defaultRoomContentRegistry, roomCapacity);

  // Issue #25's job/inventory substrate. Starts empty -- no default stock,
  // no default containers beyond the one construction draws from, no
  // registered workers -- exactly like navigation/prisoners wire real
  // infrastructure without fabricating default content.
  const containers = new ContainerRegistry();
  const constructionMaterials = new Container(CONSTRUCTION_MATERIALS_CONTAINER_ID);
  containers.register(constructionMaterials);
  /*
   * What makes a completed `door-wooden` order a door rather than a plank spent
   * on nothing.
   *
   * `docs/NAVIGATION.md` recorded the missing wiring as two facts, not one:
   * `edgeNumericIdFor` answered `0` for the row, *and* "`ConstructionSystem` is
   * constructed with a `SparseWorld` and a materials provider and holds no
   * `DoorRegistry` at all, so a completed order registers nothing whatever the
   * category says". This line is the second fact, and it can only be stated
   * here: `ConstructionSystem` knows a `DoorPlacementSink`, the service knows a
   * `DoorRegistry`, and the composition root is the only thing that holds both.
   *
   * `navigation.doors` rather than a registry of this module's own, for the
   * reason `securitySectors` is handed the same one below: it is the only door
   * mutation entry point #21/#22 expose, so a door built here is a door the
   * router, the caches and `doorsSnapshot` all see. A second registry would be
   * a parallel door model that saves nothing and routes nobody.
   */
  const doorConstruction = new DoorConstructionService(navigation.doors);
  const construction = new ConstructionSystem(
    world,
    new ContainerMaterialsProvider(constructionMaterials),
    {
      onOrderCompleted: (objectId, anchor) => objectPlacement?.onOrderCompleted(objectId, anchor) ?? false,
      onOrderReverted: (objectId, anchor) => objectPlacement?.onOrderReverted(objectId, anchor) ?? false,
    },
    doorConstruction,
  );
  objectPlacement = new ObjectPlacementService(
    world,
    prisoners.roomInstances,
    placedObjects,
    roomCapacity,
    construction,
  );

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

  /*
   * Issue #26's security substrate. No hired guards until a `HireStaff` command
   * arrives -- the same "no fabricated default content" convention as
   * `containers`/`jobs`/`electricity`/`water` above -- but, since
   * [ADR 0036](../../../docs/adr/0036-a-derived-default-security-sector.md),
   * **one sector and one deployment requirement**, derived from the world by
   * `applyDefaultSecuritySector` further down this function.
   *
   * That is a deliberate exception to the convention above and it is worth
   * being explicit about, because the convention is what caused issue #396:
   * "no fabricated default content" is right about *content* and was silently
   * also deciding *reachability*. `securitySectors.register` had one caller in
   * all of `src/` -- the restore path -- so the four systems that read this
   * registry were no-ops in every session a player could start, and the whole
   * security and incident tier was measured only in scenarios and restored
   * saves. A derived sector is not authored content: it is a function of the
   * world, carries no authored geometry, and is re-derived rather than
   * persisted.
   *
   * `securitySectors` cascades onto the navigation system's own `DoorRegistry`
   * -- the only door mutation entry point #21/#22 expose -- so sector
   * control-state changes are never a parallel/bypassing door model.
   */
  const securitySectors = new SecuritySectorRegistry(navigation.doors);
  /*
   * `kernel.rng`, never the local `rng` binding above.
   *
   * The two are the same object for a new session -- `rng` is what the kernel
   * was constructed with -- and they stop being the same object the moment a
   * session is restored. `Kernel.restoreState` **replaces** the instance
   * (`this._rng = new NamedRngStreams(snapshot.rngStates)`), so a closure that
   * captured `rng` here kept drawing from a `NamedRngStreams` that no snapshot
   * observes and no restore rebuilds, while every registered system drew from
   * the new one through `SimulationContext.rng`.
   *
   * That was a real divergence in *persisted* state and not a cosmetic one.
   * `hire` mints a name, and prisoner and guard names share the
   * `identity.actor-name` stream: a guard hired after a load took a name from
   * a stream still at its seeded start position, left the kernel's stream
   * un-advanced, and so also changed the name the *next prisoner* was given.
   * Both land in `SessionSnapshotBundle.identity`, which is a replay break
   * under [ADR 0009](../../../docs/adr/0009-challenge-verification-strategy.md).
   *
   * `Kernel.rng` is a getter and this resolver runs per `hire`, so reading
   * through it is not a workaround -- it is the accessor that exists for
   * exactly this, and it follows a replaced instance where a captured
   * reference cannot. Anything else this function hands the session RNG to
   * must be written the same way, and `tests/determinism/session-restore-rng-ownership.test.ts`
   * is the guard.
   */
  const securityGuards = new GuardRoster(DEFAULT_GUARD_CAPACITY, actorIdentity, () => kernel.rng.get(ACTOR_IDENTITY_RNG_STREAM));
  // ADR 0025's `HireStaff` consumer. It fabricates nobody -- the roster is
  // still empty until a command arrives, the same convention as every registry
  // above -- and it holds no state, so nothing here joins the save.
  const staffHiring = new StaffHiringService(securityGuards, treasury);
  const securitySchedules: DeploymentSchedule[] = [];
  /*
   * The fifth argument is the constructor's own default, restated (and skipped)
   * only so the sixth can be supplied: how many prisoners each sector holds, so
   * its authored requirement scales with the population it is guarding
   * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
   * decision 3). It is the same occupancy rule the risk sampler divides by --
   * one definition of "who is in this sector", read two ways -- and it counts
   * rather than listing, because the requirement needs a number.
   */
  const deploymentSystem = new DeploymentSystem(
    securitySectors,
    securityGuards,
    navigation,
    securitySchedules,
    undefined,
    (sectorId) => {
      const sector = securitySectors.getDefinition(sectorId);
      return sector === undefined ? 0 : countSectorOccupants(sector, world, prisoners);
    },
  );
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

  // Issue #28's incident pipeline: no gangs, no tunnels and no incidents until
  // a session/scenario registers them -- same "no fabricated default content"
  // convention as everything above. **One sector is watched**, and it is the
  // exception `applyDefaultSecuritySector` below is entirely about (ADR 0036):
  // an empty `incidentSectorIds` is what made `IncidentTriggerSystem` sample
  // nothing in every session a player could start.
  // The default risk sampler derives real inputs from the systems already
  // constructed (deployment coverage shortfall, prisoner needs deficits,
  // contraband intelligence pressure) rather than a parallel state model;
  // a scenario can pass richer sampling by constructing its own
  // IncidentTriggerSystem, exactly like #27's TargetLocationResolver seam.
  const sectorRisk = new SectorRiskTracker();
  const gangs = new GangRegistry();
  const tunnels = new TunnelRegistry();
  const incidentSectorIds: string[] = [];

  /*
   * The registration issue #396 found missing, and the two beside it that the
   * issue's own `grep` does not reach
   * ([ADR 0036](../../../docs/adr/0036-a-derived-default-security-sector.md),
   * answering [ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)
   * decision 9).
   *
   * Here rather than beside `securitySectors` above because it needs all three
   * of the collections it fills, and `incidentSectorIds` is the last of them to
   * exist. Nothing between the two points reads any of them: the systems that
   * do are constructed below and hold references, and the kernel has not been
   * stepped.
   *
   * **Here, in the one function that says how a session is assembled**, and that
   * is the point rather than a convenience. `restoreSimulationRuntime` builds
   * its session through this function, so a restored session derives the same
   * sector a live one does without having to know that it did -- and a future
   * entry point cannot forget to call it, which is exactly how the tier went
   * dark in the first place.
   *
   * There is exactly one other call site, at the end of
   * `restoreSessionSystems`: the payload clears and refills two of the three
   * collections filled here, so the derivation is re-applied afterwards.
   * `applyDefaultSecuritySector` is idempotent and leaves anything already
   * present alone, for that reason.
   */
  applyDefaultSecuritySector({ world, sectors: securitySectors, schedules: securitySchedules, watchedSectorIds: incidentSectorIds });

  /*
   * Who is in a sector, per
   * [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md): the
   * derived default sector is the prison, so its occupants are every prisoner
   * standing on owned land; any other registered sector keeps the post-tile
   * rule, because nothing but the derivation knows another sector's area. The
   * rule and the reasons are in `src/simulation/security/sector-occupancy.ts`;
   * this is the wiring, and deliberately holds none of the rule itself.
   */
  const resolveOccupants: SectorOccupantResolver = (sectorId) => {
    const sector = securitySectors.getDefinition(sectorId);
    return sector === undefined ? [] : resolveSectorOccupants(sector, world, prisoners);
  };

  const sampleSectorRisk: SectorRiskSampler = (sectorId, tick) => {
    const coverage = deploymentSystem.getCoverageReport(tick).find((entry) => entry.sectorId === sectorId);
    const staffingShortfall = coverage === undefined || coverage.required === 0 ? 0 : coverage.shortage / coverage.required;

    /*
     * Every need, not `safety` alone (ADR 0048 decision 2).
     *
     * `action.sleep` restores `safety` at 0.2 a tick against a decay of 0.01,
     * so the old single-need term read ~0 for anybody with a bed and ~1 for
     * anybody without one -- it measured homelessness, and it measured nothing
     * else. The mean over `NEED_IDS` reads what the prison actually withholds:
     * hunger with no canteen and no cell to eat in, `bladder` with no toilet,
     * `hygiene` with no shower room, `recreation` with no yard.
     *
     * `NEED_IDS` in its declared order, which is the iteration discipline
     * `NeedsComponent` uses everywhere; the sum is over floats, so the order is
     * load-bearing for bit-reproducibility rather than merely tidy.
     */
    const occupants = resolveOccupants(sectorId);
    let needsPressure = 0;
    if (occupants.length > 0) {
      let deficitSum = 0;
      for (const entityId of occupants) {
        const index = prisoners.entityStore.getIndex(entityId);
        let occupantDeficit = 0;
        for (const needId of NEED_IDS) occupantDeficit += (NEED_MAX - prisoners.needs.get(index, needId)) / NEED_MAX;
        deficitSum += occupantDeficit / NEED_IDS.length;
      }
      needsPressure = deficitSum / occupants.length;
    }

    let contrabandPressure = 0;
    for (const record of intelligence.forTarget('sector', sectorId)) contrabandPressure = Math.max(contrabandPressure, record.confidence);

    return { needsPressure, staffingShortfall, contrabandPressure };
  };

  const incidentTriggerSystem = new IncidentTriggerSystem(incidents, sectorRisk, gangs, incidentSectorIds, sampleSectorRisk, resolveOccupants);

  // The policy and the route-context resolver are the constructor's own
  // defaults, restated (and skipped) only so the seventh argument can be
  // supplied: the live view of which guards `SearchSystem` is holding on the
  // shared `'on-search'` phase, which is what lets a restored session hand
  // back the responders a save interrupted without disturbing a search job
  // (issue #352). `undefined` takes the emergency-override resolver the
  // constructor documents at length; naming it here would copy that default
  // into a second place.
  const incidentResponseSystem = new IncidentResponseSystem(
    incidents,
    securitySectors,
    securityGuards,
    navigation,
    DEFAULT_INCIDENT_RESPONSE_POLICY,
    undefined,
    () => searchSystem.claimedGuardIds(),
  );

  // After both `'on-search'` claimants, because it reads each of them live: a
  // captured claim view would be exactly the mistake ADR 0033 decision 4
  // measured, one command later.
  const guardRelease = new GuardReleaseService(securityGuards, searchSystem, incidentResponseSystem);

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
  kernel.setCommandHandler(
    createSessionCommandHandler(construction, procurement, roomZoning, staffHiring, prisoners, objectPlacement, guardRelease, refusals),
  );

  return {
    masterSeed,
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
    placedObjects,
    roomCapacity,
    objectPlacement,
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
    staffHiring,
    securitySchedules,
    deploymentSystem,
    patrolSystem,
    contraband,
    intelligence,
    informants,
    confiscations,
    searchPolicies,
    guardRelease,
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
