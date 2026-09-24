import { defaultContrabandRegistry } from '../../content/contraband-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import {
  ConfiscationLedger,
  ContrabandRegistry,
  IntelligenceLedger,
  IntelligenceSystem,
  InformantRegistry,
  SearchSystem,
  SectorSearchDutySystem,
  applyDefaultSearchPolicies,
  introduceContrabandOnIntake,
  type CategoryConcealmentResolver,
  type CategoryNameKeyResolver,
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
  applyDefaultGangs,
  createRiotRegimeOverride,
  defaultGangIdForArrival,
  recordGrudgeFromAdjudicatedAssault,
  type PrisonerFlashpointSampler,
  type SectorOccupantResolver,
  type SectorRiskSampler,
} from '../incidents';
import { InsolvencyRungSystem, JustInTimeMaterialsService, LabourCreditSystem, LoanBook, PayrollSystem, ProcurementSystem, StateIncomeSystem, Treasury, TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, type LoanTerms } from '../economy';
import { SimulationEventLog } from '../events';
import { createIntakeHousedNotice } from '../events/intake-housed-notice';
import { createResidentRelocationNotice } from '../events/resident-relocation-notice';
import { RefusalLog, materialsFundingSupersessionKey } from '../refusals';
import { StaffDismissalService, StaffHiringService } from '../staff';
import { createSessionCommandHandler } from './session-commands';
import { ACTOR_IDENTITY_RNG_STREAM, ActorIdentityRegistry } from '../identity';
import { Kernel } from '../kernel';
import { NavigationSystem, type NavigationSystemOptions } from '../navigation';
import { CarryJobExecutor, Container, ContainerMaterialsProvider, ContainerRegistry, DeliveryBayCarryRoute, DeliveryGateCapacity, JobBoard, UtilityNetwork } from '../operations';
import {
  NEED_IDS,
  NEED_MAX,
  DAY_LENGTH_TICKS,
  ACTION_PHASES,
  DEFAULT_ACTIONS,
  PRISONER_SENTENCE_RNG_STREAM,
  PrisonerOperationsRuntime,
  SafetyCoverageSystem,
  classificationGroupIdFromIndex,
  findRegimeSchedule,
  resolveActiveRegimeBlock,
  type DisciplinaryEvidenceSource,
} from '../prisoners';
import { ObjectPlacementService, PlacedObjectRegistry, RoomCapacityResolver } from '../objects';
import { WorkOutputSystem } from '../prisoners/work-output';
import { RoomNeedsClearedNoticeSystem } from '../rooms/room-needs-cleared-notice';
import { TopologyManager } from '../rooms/topology';
import { RoomZoningService } from '../rooms/zoning';
import { deriveXoshiroState } from '../rng/seed';
import { NamedRngStreams } from '../rng/streams';
import {
  applyDefaultSecuritySector,
  countSectorOccupants,
  createGuardLocomotionSystem,
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

/** Prisoner intake's screening-variance draw (see `src/simulation/prisoners/classification.ts`); pre-registered on every session's Kernel so `IntakeSystem` can claim it. */
export const PRISONER_CLASSIFICATION_RNG_STREAM = 'prisoners.classification';

/** `SearchSystem`'s detection checks -- kept separate from `CONTRABAND_INTELLIGENCE_RNG_STREAM` so a tip's draw can never perturb a search's draw (issue #27: "one subsystem's draws cannot perturb another"). */
export const CONTRABAND_DETECTION_RNG_STREAM = 'contraband.detection';
/** `reportInformantTip`'s confidence-jitter draw -- a manual hook call, not a per-tick system, but still claims its own named stream up front so it's available whenever a session/scenario calls it. */
export const CONTRABAND_INTELLIGENCE_RNG_STREAM = 'contraband.intelligence';
/**
 * `introduceContrabandOnIntake`'s two draws -- whether an arrival is concealing
 * something, and what.
 *
 * Its own stream rather than either of the two above, for the reason those two
 * are separate from each other: issue #27's *"one subsystem's draws cannot
 * perturb another"*. Admitting a prisoner must not shift the sequence a search
 * checks concealment against, or a player's intake decisions would silently
 * re-roll every future detection.
 *
 * **A fifth stream is a save-compatibility question and it is answered rather
 * than assumed** (#415, #479). `Kernel.restoreState` *merges* the payload's
 * streams over the ones the runtime factory derived, so a bundle written before
 * this stream existed restores with the state
 * `deriveXoshiroState(masterSeed, 'contraband.introduction')` gives it --
 * identical on every client loading that bundle, because the seed is in the
 * bundle (ADR 0038 §2 and §4). No save-schema field is added, no version is
 * bumped, and `tests/determinism/save-rng-stream-compatibility.test.ts` pins
 * the whole set by name.
 */
export const CONTRABAND_INTRODUCTION_RNG_STREAM = 'contraband.introduction';

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
  /**
   * What the build queue could not buy for itself, and what it bought (#627).
   *
   * On the runtime rather than reachable only through `construction` because
   * it is the observable half of ADR 0017 decision 2 -- *"a purchase that
   * cannot be afforded must be refusable"* -- for purchases nobody pressed a
   * button for. `ConstructionSystem` is handed it as an opaque
   * `ConstructionProcurementSink` and can read nothing back off it; the
   * projection layer and the save-independent tests read it here.
   */
  readonly justInTimeMaterials: JustInTimeMaterialsService;
  readonly stateIncome: StateIncomeSystem;
  readonly labourCredit: LabourCreditSystem;
  /**
   * ADR 0075 decision 2's loan book, or `undefined` when no terms were
   * supplied — which is every session `src/` builds today. See
   * `SimulationRuntimeOptions.loanTerms`.
   */
  readonly loans: LoanBook | undefined;
  /**
   * Wages, once per in-game day, for everyone on the roster
   * ([ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
   * step 3).
   *
   * The counterweight to `stateIncome` and the first debit in the prison a
   * player cannot decline: `ProcurementSystem` and `StaffHiringService` both
   * spend only when asked and both refuse when they cannot. It is the reason
   * ADR 0017 decision 8's *"insolvency is a state, not a loss condition"* is
   * reachable at all -- and it carries the arrears when a day's bill cannot be
   * met, which is the only state in this runtime that says the prison owes
   * somebody something.
   */
  readonly payroll: PayrollSystem;
  /**
   * The one-off notice at the moment the treasury crosses the deliveries or
   * the construction rung ([ADR 0087](../../../docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md)
   * decision 2's amendment, issue #767). On the runtime for the same reason
   * `payroll` is: a test that wants to drive a session past a rung without
   * standing up a whole worker reaches it here rather than only through
   * `kernel.systemExecutionOrder`.
   */
  readonly insolvencyRungs: InsolvencyRungSystem;
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
   * What the prison has just done, for `simulation/event` to carry (#507), and
   * which of it a player has already read
   * ([ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md),
   * the owner's decisions of 2026-09-01).
   *
   * **Snapshotted, since 2026-09-01, and `refusals` above is not.** This read
   * *"Not snapshotted, for the reason `refusals` above is not"*, and the rest
   * of that sentence is kept because it is still the best short account of how
   * the two differ: *"The two logs are siblings in every respect except shape
   * -- one holds the latest of a level, this holds a bounded queue of
   * occurrences -- and the difference is a property of the channels they leave
   * by, not of the sessions they belong to."* What the owner decided is that
   * the queue of occurrences is a **log a player scrolls back through** and
   * should survive a reload, while nobody has ruled on the refusal; so the
   * siblings part is now false of persistence and true of everything else.
   * `SimulationEventLog` states it in full, including why a restored record
   * rebuilds the list without announcing anything.
   */
  readonly events: SimulationEventLog;
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
  /**
   * What a carry job does to stock, and no longer a registered system
   * ([ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) decision 4).
   *
   * **`jobWorkers` and `jobSystem` are gone from this surface.**
   * `JobWorkerPool` is retired because both of its sets are derivable --
   * *registered* is *in a `work` block and idle*, which the regime decides
   * each cycle, and *busy* is *named by an active job's `assignedWorkerId`*,
   * which the board holds. `JobSystem` stopped being a `SystemRegistration`
   * because `prisoners.actions` drives a carry now: it is the one authority
   * that moves a prisoner.
   */
  readonly carryJobs: CarryJobExecutor;
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
   * The `DismissStaff` consumer (issue #533, the owner's decision on issue #535
   * decision 4). A session-level service for `staffHiring`'s and
   * `guardRelease`'s reason: no tick work, no state of its own.
   *
   * It is what finally gives the staff roster a way *out*. `staffHiring` above
   * says it is "what finally gives `GuardRoster.hire` a caller in `src/`"; this
   * is the counterpart sentence, and until it existed a hire was a standing
   * payroll line no command could end.
   *
   * Constructed after `guardRelease` because it delegates to it: taking a claim
   * apart is that service's job and ADR 0034 argues at length why doing it any
   * other way corrupts the claimant's own bookkeeping.
   */
  readonly staffDismissal: StaffDismissalService;
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
  /**
   * The reader that turns guard coverage into the `safety` need (issue #588).
   *
   * Exposed on the runtime for the reason `deploymentSystem` is: the status
   * strip reads its census (`Covered N / Understaffed N / Unguarded N`) through
   * `src/simulation/worker/status-counts.ts`, and a test measuring what
   * coverage does to a prisoner's `safety` needs the system rather than the
   * kernel it is registered on.
   */
  readonly safetyCoverage: SafetyCoverageSystem;
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
  /**
   * Terms for [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
   * decision 2's loan book. Omitted everywhere in `src/`: no magnitude for any
   * of the three has been chosen, and choosing one is #29's under ADR 0017
   * decision 5. Supplying them is how the pricing measurement in
   * `docs/research/2026-08-30-pricing-the-way-out.md` opens a facility on a
   * real session.
   */
  readonly loanTerms?: LoanTerms;
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
    /**
     * Intake's *other* draw: how long an admission that named no sentence holds
     * its prisoner for (#535 decision 5, `src/simulation/prisoners/sentence.ts`).
     *
     * **Its own stream and not `PRISONER_CLASSIFICATION_RNG_STREAM`**, which is
     * the sixth registration this session makes and the reason worth writing down.
     * The two draws are made at the same stage, one line apart, for the same
     * prisoner -- so sharing a stream would have looked economical. It would also
     * have shifted `prisoners.classification` by one draw per admission, changing
     * every risk tier every seed has ever produced, in a game whose challenge
     * verification is deterministic replay (ADR 0009). Isolation is what
     * `docs/DETERMINISM.md` asks these streams for and this is the case it asks
     * for it in.
     *
     * **This paragraph used to end *"with the drawn range entirely below
     * `LONG_SENTENCE_THRESHOLD_TICKS`, adding this stream leaves every
     * classification outcome of every existing seed bit-identical"*, and the
     * owner's 2026-08-30 ruling on
     * [#593](https://github.com/matmaxalez/lockstate/issues/593)
     * ([ADR 0079](../../../docs/adr/0079-a-sentence-long-enough-to-be-a-history.md))
     * spent that property deliberately.** The range is 14 to 90 in-game days,
     * so the seven drawable lengths at 84 days and up cross the 200,000-tick
     * threshold and change the tier they score. Marked rather than overwritten,
     * because the *reason for the separate stream* is untouched by it and is
     * the durable half: a shared stream would have shifted
     * `prisoners.classification` by one draw per admission, which is a
     * different and much larger break than a threshold the range now crosses on
     * purpose.
     *
     * Adding it is **not** a save-format change (ADR 0038 §2, #415): a bundle that
     * predates it restores with the stream seeded from its own `masterSeed`, which
     * is the state a new session would have given it, and
     * `tests/determinism/save-rng-stream-compatibility.test.ts` had to be extended
     * by hand before this line could ship -- which is that file working exactly as
     * its own comment says it should.
     */
    { name: PRISONER_SENTENCE_RNG_STREAM, state: deriveXoshiroState(masterSeed, PRISONER_SENTENCE_RNG_STREAM) },
    { name: CONTRABAND_DETECTION_RNG_STREAM, state: deriveXoshiroState(masterSeed, CONTRABAND_DETECTION_RNG_STREAM) },
    { name: CONTRABAND_INTELLIGENCE_RNG_STREAM, state: deriveXoshiroState(masterSeed, CONTRABAND_INTELLIGENCE_RNG_STREAM) },
    { name: CONTRABAND_INTRODUCTION_RNG_STREAM, state: deriveXoshiroState(masterSeed, CONTRABAND_INTRODUCTION_RNG_STREAM) },
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

  /*
   * Two more session-level stores hoisted above `prisoners` for the same reason
   * the two evidence logs are, and the reason is #441's release path.
   *
   * `GangRegistry` records which prisoner belongs to which gang and the job
   * board records which prisoner is on which errand; both are keyed by
   * prisoner `EntityId`, and both have to forget a prisoner who has left the
   * prison, or a recycled index eventually inherits a gang and an errand
   * (ADR 0026 question 2, answered in ADR 0050 decision 2). `GangRegistry`'s
   * writer is still further down -- `IncidentTriggerSystem` reads the gangs --
   * and this changes no arrow: every constructor below is bare, exactly as
   * `incidents` and `confiscations` above are, so hoisting them costs nothing.
   *
   * **The second of the two used to be `JobWorkerPool`, hoisted for exactly
   * this reason, and [ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md)
   * decision 4 retired it.** What is hoisted in its place is the job substrate
   * itself, and it has to come up here for a stronger reason than the release
   * path: `PrisonerOperationsRuntime` constructs `ActionSystem`, and since a
   * carry is an action the executor is one of its collaborators. The three
   * lines below used to sit two hundred lines further down, next to
   * `ConstructionSystem`'s materials provider, and the comment they carried
   * about starting empty is kept with them.
   *
   * Issue #25's job/inventory substrate. Starts empty -- no default stock, no
   * default containers beyond the one construction draws from -- exactly like
   * navigation/prisoners wire real infrastructure without fabricating default
   * content.
   */
  const gangs = new GangRegistry();
  const containers = new ContainerRegistry();
  const constructionMaterials = new Container(CONSTRUCTION_MATERIALS_CONTAINER_ID);
  containers.register(constructionMaterials);
  const jobs = new JobBoard();
  const carryJobs = new CarryJobExecutor(jobs, containers);

  /*
   * The contraband ground truth, hoisted to here for the same reason `gangs`
   * and the job substrate are and with the same consequence for the arrows: it is a
   * bare constructor with no dependencies, and `PrisonerOperationsRuntime` now
   * needs it twice over
   * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)).
   * Once because intake introduces into it, and once because a prisoner who
   * leaves the prison takes what they were concealing with them. The rest of
   * #27's substrate -- the intelligence ledger, the informants, the search
   * policies and the search system -- is still constructed further down beside
   * the systems that read it.
   *
   * **It is still empty here.** Nothing in this function puts an item in it;
   * the first item any session holds is put there by an `AdmitPrisoner` command
   * the player sent, which is the distinction the "no fabricated default
   * content" note further down is about.
   */
  const contraband = new ContrabandRegistry();

  /*
   * Issue #507's route out for what the prison did when nothing went wrong --
   * the third of ADR 0003 decision 2's families to get a producer.
   *
   * **This said it is "empty for a new session and for a restored one alike,
   * exactly like `refusals` below", and half of that is no longer true.** It is
   * empty for a new session; a restored one comes back holding what the save
   * carried, which is the owner's decision of 2026-09-01 on ADR 0084 --
   * `restoreSessionSystems` loads it, and this line only ever builds the empty
   * one a fresh runtime starts from. The reason the old sentence gave is kept
   * because it is still why a restored record is not *announced*: an event says
   * something happened *now*, so replaying one from before a save onto the
   * events band would be a statement about a tick the player is not looking at.
   * `refusals` below is unchanged and is still empty on a restore.
   *
   * Constructed this far up because `PrisonerOperationsRuntime` needs it in the
   * very next statement -- `PrisonerDischargeSystem` is one of its two
   * producers -- while `refusals` is only needed at the command handler, six
   * hundred lines below.
   */
  const events = new SimulationEventLog();

  const prisoners = new PrisonerOperationsRuntime({
    capacity: DEFAULT_PRISONER_CAPACITY,
    navigation,
    events,
    identity: actorIdentity,
    /*
     * Issue #966 site 3: what the player is told once a queued arrival gets a
     * bed. Composed here rather than handed the raw registry and catalog,
     * exactly as `createResidentRelocationNotice` below is for the identical
     * reason -- `actorIdentity` is the same registry that adapter reads from,
     * typed narrower here (`ActorIdentitySource`) than `identity:
     * actorIdentity` above (`ActorIdentityLifecycle`) because this port only
     * ever reads a name back, never mints or releases one.
     */
    housedNotice: createIntakeHousedNotice({ identity: actorIdentity, rooms: defaultRoomContentRegistry, events }),
    disciplinaryEvidence,
    /*
     * The riot's effect on its participants' day
     * ([ADR 0057](../../../docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md)).
     * It reads the log this call already takes `disciplinaryEvidence` over, and
     * is the second reason `incidents` is constructed above this statement
     * rather than beside the systems that write it.
     *
     * A closure over the log rather than a value, for the reason the sentence
     * above `disciplinaryEvidence` gives about `all()` versus `drain()`: the
     * answer has to be the log's *current* contents on the tick it is asked,
     * and `ActionSystem` asks on every reconsideration cycle. It holds no state
     * of its own, so nothing here has to be snapshotted -- see
     * `createRiotRegimeOverride`.
     */
    regimeOverride: createRiotRegimeOverride(incidents),
    gangs,
    carryJobs,
    contraband,
    /*
     * How contraband gets into the prison (ADR 0061 decision 1). The rule is in
     * `src/simulation/contraband/introduction.ts` and none of it is here: this
     * is the wiring, and it supplies the two things the rule cannot reach on
     * its own -- the registry to introduce into, and the authored catalogue to
     * choose from. Deciding *what* an arrival brings in the composition root
     * would be the mistake `projection-catalog.ts` names about itself, one
     * module over.
     */
    contrabandIntroducer: {
      introduce: (entityId, riskTier, tick, introductionRng) => {
        introduceContrabandOnIntake(contraband, defaultContrabandRegistry.all(), entityId, riskTier, tick, introductionRng);
      },
    },
    contrabandRngStreamName: CONTRABAND_INTRODUCTION_RNG_STREAM,
    /*
     * Who joins a gang
     * ([ADR 0103](../../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
     * decision 6), on the same terms as the introduction above: the rule is in
     * `src/simulation/incidents/default-gangs.ts` and none of it is here.
     *
     * `defaultGangIdForArrival` answers `undefined` for everybody who is not
     * `high-risk` at intake, so most prisons assign nobody at this seam. That
     * is the decision as accepted and **not** a bug to route around here:
     * ADR 0103's own Context 15 shows the population that becomes `high-risk`
     * becomes so at `ClassificationReviewSystem`'s review rather than at the
     * gate, and whether membership should also be assigned there is its **Open
     * Question 5**, which the owner has not answered. Adding the second write
     * site would be answering it in implementation code.
     *
     * **The owner answered it on 2026-09-09: assign at the review site too.**
     * The paragraph above is kept because it is the reason this seam was left
     * alone for a day, and its last sentence is exactly right about why —
     * which is the point. The second site is not added *here*: this closure is
     * handed unchanged to `ClassificationReviewSystem` as well, inside
     * `PrisonerOperationsRuntime`, so the rule still lives in one place and
     * two callers ask it.
     */
    gangAssigner: {
      assign: (entityId, classificationGroupId) => {
        const gangId = defaultGangIdForArrival(gangs, entityId, classificationGroupId);
        if (gangId !== undefined) gangs.addMember(gangId, entityId);
      },
    },
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
  // decision 2), and the prisoner runtime itself as its `ResidentRelocationPort`
  // (issue #478): `PrisonerOperationsRuntime.relocateResidentsOutOf` is what
  // lets `unzone` relocate an occupied room's residents instead of refusing
  // it for the life of the session.
  const roomZoning = new RoomZoningService(world, prisoners.roomInstances, defaultRoomContentRegistry, roomCapacity, prisoners);

  // The job/inventory substrate is constructed above `prisoners`, which needs
  // it: see the note there.
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
  /*
   * Issue #96's money-first resource model, and the half of its loop that
   * exists (#89). A purchase spends now and delivers later; the delivery
   * lands in the container construction draws from.
   *
   * **Directly only where the player has not built the route.** #96 describes
   * the materials arriving at `room.delivery-bay` and being carried to the
   * site, and since
   * [ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) that is what
   * happens: `deliveryCarryRoute` is constructed further down this same
   * function and handed to `ProcurementSystem`, so a delivery lands in a
   * *furnished* bay's own container and a prisoner in a `work` block carries it
   * to a *furnished* storeroom. The direct deposit is the fallback for a prison
   * with neither room, which is decision 2's graceful fallback and is still
   * `docs/OPERATIONS.md`'s second no-teleport exception there.
   *
   * **This paragraph asserted the feature's absence and is corrected rather
   * than overwritten** (`docs/AGENT_WORKFLOW.md` §4: mark both directions). It
   * read: *"**Directly, and that is scaffolding.** ... No session instantiates
   * that room: a `ZoneRoom` command can zone one since #261, and nothing in the
   * application sends that command (`room.delivery-bay` is still content with
   * no reader, #141) -- so there is no bay to deliver to, and inventing one
   * would mean deciding where a new prison's bay sits and when a carry job is
   * raised."* The Rooms panel sends `ZoneRoom` for any id in the room
   * catalogue, so the "nothing in the application sends that command" clause
   * was a statement about a *new* session rather than about the application;
   * and the two questions it declined to answer are answered by ADR 0093
   * decision 2 -- the bay's anchor tile, and the tick a delivery comes due.
   * Zoned, furnished and watched through the shipped panels on 2026-09-03:
   * `docs/research/2026-09-03-does-the-errand-walk.md`.
   *
   * **Constructed before `ConstructionSystem` rather than after it**, which is
   * where these two lines used to sit. `JustInTimeMaterialsService` is the
   * construction system's fifth constructor argument (issue #627), so it has to
   * exist first, and it needs the procurement system, which needs the treasury.
   * Nothing between the old position and this one reads either, so the move
   * changes no behaviour -- and the alternative, the late-bound closure
   * `objectPlacement` uses a few lines down, buys nothing here because there is
   * no cycle to break: procurement does not know construction.
   *
   * `JustInTimeMaterialsService` is ADR 0017 decision 7 -- *"materials are
   * just-in-time by default; holding is permitted, never required"* -- made
   * true rather than merely written down. It is handed the same
   * `constructionMaterials` container `ContainerMaterialsProvider` draws from,
   * because the deficit it computes is against exactly the stock the next
   * allocation attempt will see; a second container would have it buying
   * against a shelf nobody builds from.
   */
  // Issue #261's route out for a command the simulation accepts and then
  // refuses on its content. Empty for a new session and for a restored one
  // alike -- it is not snapshotted. (That is still true of *this* log. The
  // events log beside it stopped being unsnapshotted on 2026-09-01, ADR 0084;
  // the owner ruled on that one and not on this one.)
  //
  // **Constructed here rather than below `stateIncome`, which is where it used
  // to sit** (#640): the construction system's sixth argument withdraws a
  // standing materials shortfall on the scheduled tick, so this has to exist
  // before that system does. It takes no arguments and nothing between the old
  // position and this one reads it, so the move changes no behaviour -- the
  // same reasoning the treasury/procurement pair below carries for its own
  // move under #627.
  const refusals = new RefusalLog();

  const treasury = new Treasury();
  /*
   * #703 ruling A: the negative balance is a **standing** facility every prison
   * has, not something a drawdown opens
   * ([ADR 0083](../../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
   * §2). See `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` for the magnitude and the
   * sweep behind it.
   *
   * **Here rather than in the `Treasury` constructor**, and the placement is
   * what makes the restore path free. `restoreSimulationRuntime` builds its
   * runtime through this function (`restore-session.ts`), and
   * `Treasury.restore` writes the balance and never touches the floor — so a
   * restored session gets this facility on exactly the same line a new one
   * does, and nothing has to be persisted or migrated for it.
   * `TreasurySnapshot` is still `{ balanceMinorUnits }`, which is why
   * `SAVE_SCHEMA_VERSION` does not move
   * (`docs/PERSISTENCE.md`, ADR 0083 §(e)).
   *
   * **What this does not do, stated because a reader will look for it.** It
   * does not tell the player. A standing overdraft nobody is told about is a
   * hidden feature, and the copy that would explain it is the owner's under
   * `AGENTS.md`'s fourth exclusion — so the funds chip renders the minus
   * `Intl.NumberFormat` gives it, with no tone and no badge, and no sentence
   * has been authored here.
   */
  treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
  /*
   * ADR 0017 decision 4's physical route, and the first thing in a session a
   * player can start that puts a job on the board
   * ([ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) decision 2).
   *
   * It reads the room registry the player's own `ZoneRoom` commands write, so
   * it is live rather than configured: zone a `room.delivery-bay` and a
   * `room.storage-room` and deliveries start walking; zone neither and the
   * direct deposit continues unchanged. The bay's container is derived from the
   * bay's instance id and the storeroom is bound to the container construction
   * already draws from, so **nothing about either binding is persisted** and
   * `ContainerMaterialsProvider` and `ConstructionSystem` are untouched.
   */
  const deliveryCarryRoute = new DeliveryBayCarryRoute(prisoners.roomInstances, containers, jobs, CONSTRUCTION_MATERIALS_CONTAINER_ID);
  const procurement = new ProcurementSystem(
    treasury, constructionMaterials, deliveryCarryRoute,
    new DeliveryGateCapacity(prisoners.roomInstances, placedObjects, containers, jobs),
  );
  /*
   * The treasury is the third argument since #703 ruling 12: an order is funded
   * whole or not at all, so the service has to ask whether the *order's* cost is
   * affordable before it buys the first of its lines. It reads `canAfford` and
   * never spends -- `ProcurementSystem` is still the only thing here that does.
   */
  const justInTimeMaterials = new JustInTimeMaterialsService(procurement, constructionMaterials, treasury);
  const construction = new ConstructionSystem(
    world,
    new ContainerMaterialsProvider(constructionMaterials),
    {
      onOrderCompleted: (objectId, anchor) => objectPlacement?.onOrderCompleted(objectId, anchor) ?? false,
      onOrderReverted: (objectId, anchor) => objectPlacement?.onOrderReverted(objectId, anchor) ?? false,
    },
    doorConstruction,
    justInTimeMaterials,
    /*
     * The scheduled pass's report, and the one thing a session does with it:
     * **withdraw a shortfall that has stopped being true** (#640).
     *
     * `reportMaterialsFunding` is deliberately NOT called here, and the
     * asymmetry is the decision rather than an omission. That function both
     * withdraws and records; recording on every scheduled tick would call
     * `RefusalLog.record`, which increments `sequence` monotonically -- and
     * `sequence` is the alert row's identity on the main thread
     * (`src/ui/simulation-alerts.ts`, `id: ${REFUSAL_ROW_PREFIX}${sequence}`).
     * A queue that genuinely cannot be paid for would then mint a new alert
     * row every scheduled tick and drive `refusals.count` up without bound,
     * for a condition that has not changed.
     *
     * **What this leaves undone, stated rather than left to be discovered:** a
     * shortfall that *arises* on a scheduled tick with no press -- payroll
     * draining the treasury under a standing queue -- is still silent. Whether
     * a refusal here is an event caused by a press or a condition of the
     * prison is a decision that outgrew this change; it is filed as its own
     * issue and is not settled here. Making `RefusalLog.record` idempotent
     * under an unchanged key is the shape that would settle it, and it changes
     * that class's core contract, so it needs an ADR and not a line in a
     * composition root.
     *
     * The queue's *read model* has no such gap: `projectBuildQueue` recomputes
     * `materialsFunding` from `JustInTimeMaterialsService.lastReport`, which
     * every pass rewrites, so the Build panel's own line follows the scheduled
     * tick in both directions whatever the alert band is doing.
     */
    (report) => {
      if (report !== undefined && report.unfunded.length === 0) {
        refusals.supersede(materialsFundingSupersessionKey());
      }
    },
    /*
     * ADR 0116, the owner's ruling of 2026-09-16: a finished build order is an
     * event, graded `'info'`, routed to the log alone, and counted rather than
     * repeated.
     *
     * **The whole of what a session does with it is append it.** There is no
     * predicate here of the kind the report callback above needs, because
     * `ConstructionSystem` already decided the only question there is -- an
     * order reached `workRequired` -- and re-deciding it here would be the
     * second, weaker copy that callback's own comment warns about.
     *
     * **This is where the decision lives that the system deliberately does not
     * hold**: whether a completion is worth saying, and on which surface. The
     * system hands out the fact; the answer is `SimulationEventLog`, which is
     * the alerts channel, and `EVENT_PRESENTATION` in `src/ui/simulation-events.ts`
     * is where `'info'` and `'log-only'` are stated. A bare `ConstructionSystem`
     * -- a test, a determinism scenario -- passes nothing here and stays silent.
     */
    (tick) => events.recordBuildOrderCompleted(tick),
  );
  objectPlacement = new ObjectPlacementService(
    world,
    prisoners.roomInstances,
    placedObjects,
    roomCapacity,
    construction,
    defaultRoomContentRegistry,
    // ADR 0076 decision A(i), and the second wiring of the same idea `roomZoning`
    // above takes: a removal that drops a room's `residentCapacity` below its
    // occupancy relocates the residents it can no longer sleep, through
    // `PrisonerOperationsRuntime.relocateExcessResidentsOf`. The catalog is
    // named explicitly only because it sits between the two -- it is the same
    // default the parameter already had.
    prisoners,
    /*
     * And what the player is told about it, which ADR 0076's Status reserved
     * to the owner and PR #637 shipped relocation without: *"a prisoner who
     * changes cell unasked is something the player should be told, flagged
     * rather than decided"*. The wording was approved on 2026-08-30 and lives
     * in `src/content/default-locale-en.ts`; nothing in the simulation holds a
     * sentence.
     *
     * This is the only place that holds all four things one needs -- the
     * identity registry, the room catalog, the events channel and the tick --
     * which is why the adapter is composed here rather than in either module
     * it sits between.
     */
    createResidentRelocationNotice({
      identity: actorIdentity,
      roomInstances: prisoners.roomInstances,
      rooms: defaultRoomContentRegistry,
      events,
      // `kernel.tick`, read at announcement time, for the reason
      // `ResidentRelocationNoticeSources.tick` gives: the `Undo` route is
      // handed no tick and threading one to it would edit the construction
      // system to serve a notice.
      tick: () => kernel.tick,
    }),
    /*
     * And what the player is told when a *standing* object is taken away
     * ([#945](https://github.com/matmaxalez/lockstate/issues/945)): the log
     * itself, not an adapter, because `RemovedObjectNoticePort` is one method
     * taking a tick and `SimulationEventLog` satisfies it as written. The
     * relocation notice above needs an adapter only because its sentence names
     * a prisoner and a room, which `src/simulation/objects/` does not know
     * about; this one names neither and carries no figure.
     *
     * **Passed to the service rather than recorded in the command handler**,
     * which is where the other nine command successes are answered. A removal
     * can raise the relocation sentence above as well, and the events band
     * discards an `'info'` that an arriving `'warning'` displaces
     * (`admitToEventBand`) -- so the two have to be recorded in severity order
     * or the prisoner who moved is never named on screen. That ordering only
     * exists inside `remove`. See `RemovedObjectNoticePort`.
     */
    events,
  );

  // ADR 0017 decision 3's income line, on decision 6's basis: the state pays
  // per prisoner-day, accrued per occupied place, at the end of each in-game
  // day (#29). It reads `prisoners.roomInstances` -- an occupied place is an
  // occupancy slot there -- so it is constructed after the prisoner runtime,
  // and it holds no state of its own, which is why nothing new enters the save.
  //
  // The whole `prisoners` runtime rather than the registry alone, since
  // [ADR 0064](../../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md):
  // what a place pays depends on how many of its occupant's six needs the
  // prison is leaving unmet, so the income line reads `needs` and `entityStore`
  // beside the residency claims. `PrisonerOperationsRuntime` satisfies
  // `PrisonerDayGrantSource` structurally, the same way it already satisfies
  // both of `projectStatusStrip`'s source shapes.
  /*
   * ADR 0075 decision 2's loan book, and it exists only when somebody supplies
   * terms.
   *
   * `undefined` is the shipped case: the diversion percentage, the fee and the
   * maximum duration are #29's under ADR 0017 decision 5, none of them has
   * been chosen, and a default here would be a magnitude wired in as though it
   * had been. With no book, `StateIncomeSystem` credits exactly what it
   * credited before and `Treasury`'s overdraft floor stays at 0, so a session
   * that does not opt in is byte-identical to one on `main`.
   */
  const loans = options.loanTerms === undefined ? undefined : new LoanBook(treasury, options.loanTerms);
  const stateIncome = new StateIncomeSystem(treasury, prisoners, loans, { ledger: prisoners.roomFilth, rooms: prisoners.roomInstances });

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
  /*
   * ADR 0042 step 3's recurring debit: every employee's authored
   * `wageBand.minPerDay`, billed at the end of every in-game day, out of the
   * income the same tick has just credited. Constructed here because
   * `GuardRoster` is the only staff store there is and this is where it exists;
   * registered below at order 130, immediately after `economy.state-income`.
   */
  /*
   * `prisoners.roomInstances` since ADR 0096 decision 2 (2026-09-10) — the
   * same registry `InsolvencyRungSystem` below and the `'deliveries'` press
   * in `session-commands.ts` already read `totalResidentCapacity` off, live,
   * so a fresh, unfurnished prison's payday gets the same starter reserve on
   * `'wages'` that a press already gets on `'deliveries'`/`'hiring'`.
   */
  const payroll = new PayrollSystem(treasury, securityGuards, events, prisoners.roomInstances);
  const eligibleForWork = (tick: number) => prisoners.roomInstances.residentIdsWithExistingPlace().filter((entityId) => {
    const index = prisoners.entityStore.getIndex(entityId);
    const groupId = classificationGroupIdFromIndex(prisoners.records.classificationGroupIndex[index]!);
    const block = resolveActiveRegimeBlock(findRegimeSchedule(prisoners.regimes.all(), groupId), tick);
    return block.allowedCategories.includes('work') || block.allowedCategories.includes('education');
  });
  const workingPrisoners = (tick: number) => eligibleForWork(tick).filter((entityId) => {
    const index = prisoners.entityStore.getIndex(entityId);
    if (prisoners.currentAction.phase[index] !== ACTION_PHASES.indexOf('performing')) return false;
    const action = DEFAULT_ACTIONS[prisoners.currentAction.actionIndex[index]!];
    return action?.target.kind === 'room-catalog-id' && (action.category === 'work' || action.category === 'education');
  });
  const hasFurnishedWorkRoom = () => DEFAULT_ACTIONS.some((action) =>
    (action.category === 'work' || action.category === 'education') &&
    action.target.kind === 'room-catalog-id' &&
    prisoners.roomInstances.allByRoomCatalogId(action.target.roomCatalogId).some((instance) =>
      action.requiredObjectCapability === undefined || instance.objectCapabilities.includes(action.requiredObjectCapability),
    ),
  );
  const labourCredit = new LabourCreditSystem(
    treasury, workingPrisoners, loans, eligibleForWork, hasFurnishedWorkRoom,
    (idle, tick) => events.recordLabourBlockIdle(idle, tick),
    (tick) => prisoners.regimes.all().some((schedule) => schedule.blocks.some((block) =>
      (block.allowedCategories.includes('work') || block.allowedCategories.includes('education')) &&
      block.endTickOfDay === (tick % DAY_LENGTH_TICKS) + 1,
    )),
  );
  const workOutput = new WorkOutputSystem(
    prisoners.workOutput,
    (tick) => eligibleForWork(tick).flatMap((entityId) => {
      const index = prisoners.entityStore.getIndex(entityId);
      if (prisoners.currentAction.phase[index] !== ACTION_PHASES.indexOf('performing')) return [];
      const action = DEFAULT_ACTIONS[prisoners.currentAction.actionIndex[index]!];
      const kind = action?.id === 'action.kitchen-work' ? 'kitchen' : action?.id === 'action.laundry-work' ? 'laundry' : undefined;
      const instanceId = prisoners.coldState.getActionTarget(entityId);
      const instance = instanceId === undefined ? undefined : prisoners.roomInstances.getById(instanceId);
      if (kind === undefined || instance === undefined || instance.width === undefined || instance.height === undefined) return [];
      const objects = placedObjects.inRect({ x: instance.anchorTile.x, y: instance.anchorTile.y, width: instance.width, height: instance.height });
      if (kind === 'kitchen' && (!objects.some((object) => object.objectId === 'object.stove') || !objects.some((object) => object.objectId === 'object.fridge'))) return [];
      if (kind === 'laundry' && !objects.some((object) => object.objectId === 'object.washing-machine')) return [];
      return [{ entityId, instanceId: instance.instanceId, kind }];
    }),
    () => prisoners.roomInstances.residentIdsWithExistingPlace(),
  );
  /*
   * The owner's ruling of 2026-09-01 on issue #767 (ADR 0087 decision 2's
   * amendment): the one-off notice at the moment the treasury crosses the
   * deliveries or the construction rung, beside the standing `PrisonCondition`
   * a status-counts publication already carries for both. Registered right
   * after `payroll` for the reason its own class comment gives -- nothing
   * that spends treasury money runs later than order 130 in this session.
   *
   * `prisoners.roomInstances` is the third argument the owner's ruling on
   * #771 added to `rungFloorMinorUnits`: this system reads
   * `totalResidentCapacity` off the same registry `createSessionCommandHandler`
   * reads it from, live on every tick, so a fresh session's crossing notice
   * uses the shallower starter floor exactly as long as the treasury's own
   * `spend` calls do -- see `InsolvencyRungSystem`'s own class comment,
   * "The starter rung".
   */
  const insolvencyRungs = new InsolvencyRungSystem(treasury, events, prisoners.roomInstances);
  /*
   * Issue #1006 finding 3: the alerts column's confirmation that a repaired
   * room stopped being short of anything the Rooms panel checks for. Reads
   * live `world` edges and `navigation.doors` for the same reason
   * `hud/room-list`'s own projection wiring does
   * (`src/simulation/worker/projection-catalog.ts`) -- "`navigation.doors` is
   * the registry the router, the caches and `doorsSnapshot` all read ...
   * so the panel's answer and the walk's answer cannot disagree" -- and this
   * system's own answer must not disagree with either.
   */
  const roomNeedsClearedNotice = new RoomNeedsClearedNoticeSystem(
    prisoners,
    placedObjects,
    world,
    navigation.doors,
    navigation,
    events,
  );
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
  /**
   * Walks a guard's tile between the one it left and the one it is travelling
   * to, instead of `continueDeploymentTravel`/`continueLeg` applying the
   * resolved route in one step (ADR 0088, answering ADR 0059 open question 4
   * for guards the way ADR 0059 answered it for prisoners). Registered
   * alongside `deploymentSystem`/`patrolSystem` below, at order 201 (one past
   * the prisoner instance's 200, so the two do not collide -- see
   * `LocomotionSystem`'s own header) -- before both 270 and 280, so a walk
   * that finishes on tick *n* is visible to whichever of them owns it on that
   * same tick, exactly as the prisoner instance is ordered against
   * `ActionSystem`.
   */
  const guardLocomotionSystem = createGuardLocomotionSystem(securityGuards, navigation, deploymentSystem, patrolSystem);

  /*
   * Issue #27's contraband/intelligence/search substrate.
   *
   * **This comment used to read "no contraband instances, no intelligence, no
   * informants and no search policies until a session/scenario introduces
   * them", and two thirds of that is still true.** It is marked in both
   * directions rather than overwritten, because the sentence was the stated
   * reason the whole substrate ran over an empty set for ever, and the reason
   * it stopped being true is a decision rather than a drift
   * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)):
   *
   * - **Contraband instances**: introduced by `IntakeSystem` on the arrivals
   *   the player admits, and by nothing else. A session that admits nobody
   *   still holds none, so the convention this comment names is intact -- what
   *   changed is that "a session introduces them" now has a producer inside
   *   `src/` instead of waiting for a scenario format that does not exist.
   * - **Intelligence**: this bullet read *"written by `contraband.observation`
   *   below, as decaying sector-scoped suspicion derived from those
   *   instances ... the something is now here"*, and **it is false** -- marked
   *   in both directions rather than overwritten, because it is the claim a
   *   reader would otherwise take on trust. There is no `contraband.observation`
   *   system in this repository: `grep -rn "observation" src/` finds the
   *   `IntelligenceSourceType` member of that name, its label, a staff skill id
   *   and prose -- no `SystemRegistration`, and `grep -rn "\.report(" src/`
   *   finds exactly one line, inside `reportInformantTip`, which itself has no
   *   caller at all. `IntelligenceSystem` below decays a ledger nothing writes to. So
   *   [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md) open
   *   question 5's *"the term is structurally zero until something calls"* is
   *   still open, `DEFAULT_SECTOR_RISK_POLICY.contrabandPressureWeight` is
   *   still structurally zero -- which `src/simulation/incidents/sector-risk.ts`
   *   says in its own docblock -- and every search below runs with an
   *   `intelligenceConfidenceBonus` term of 0.
   * - **Search policies are no longer empty**
   *   ([ADR 0073](../../../docs/adr/0073-who-orders-a-contraband-search.md)
   *   Part 1, issue #552), and this is the second deliberate exception to the
   *   convention above rather than a drift. `SearchSystem.findPolicy` *throws*
   *   on an empty list, so "no fabricated default content" was not leaving a
   *   subsystem inert here; it was leaving a documented public method unable to
   *   be called at all. The four are directional defaults in
   *   `default-search-policies.ts`, applied by the same idempotent,
   *   payload-wins function the derived sector uses, for the same reason: a
   *   save written before them gains them on load with no migration.
   * - **Informants are still empty**, and still for the original reason.
   *   Recruiting an informant is a relationship model (#39) -- a content
   *   decision with no producer, and fabricating one would be exactly what this
   *   convention forbids.
   *
   * `locateSearchTarget` resolves a search target's tile from the *real*
   * registries already constructed above (prisoner positions, room-instance
   * anchors, guard tiles) rather than a parallel location model; `'container'`
   * targets (the `'delivery'` scope) fall back to `searchContainerLocations`,
   * since `Container` itself carries no position -- and that fallback is why
   * ADR 0061 decision 1 could not take the delivery route it was clearly built
   * for: nothing registers a location for the container a purchase lands in,
   * because #141's delivery bay does not exist to have one.
   */
  const intelligence = new IntelligenceLedger();
  const informants = new InformantRegistry();
  const searchPolicies: SearchPolicyDefinition[] = [];
  /*
   * The four policies, before anything can order a search
   * ([ADR 0073](../../../docs/adr/0073-who-orders-a-contraband-search.md)
   * Part 1). Here rather than in the array literal above so that this call and
   * the one at the end of `restoreSessionSystems` are visibly the same call:
   * `applyDefaultSearchPolicies` fills only the scopes the list lacks, so a
   * restored payload's own policies win and a scenario's do too.
   */
  applyDefaultSearchPolicies(searchPolicies);
  const searchContainerLocations = new Map<string, TilePosition>();
  const intelligenceSystem = new IntelligenceSystem(intelligence);

  const categoryConcealment: CategoryConcealmentResolver = (categoryId) => {
    const category = defaultContrabandRegistry.getById(categoryId);
    if (category === undefined) throw new RangeError(`Unknown contraband category id "${categoryId}".`);
    return category.baseConcealment;
  };

  /*
   * What a found item is *called*, for the sentence the alerts list says about
   * it (#703 ruling 13). The same registry the concealment lookup above reads,
   * so the two cannot disagree about which categories exist, and the catalog's
   * own `nameKey` rather than a key derived from the id -- the catalog owns that
   * mapping and `soleDiscoveredContrabandNameKey` gives the argument.
   *
   * `undefined` rather than a throw for an unknown id, which is *not* the call
   * the line above makes and the difference is which way each failure points: a
   * concealment this session cannot answer would make the detection draw a lie,
   * while a name it cannot answer costs only the sentence. Unreachable from
   * here either way -- the concealment lookup runs first, on the same id, for
   * the same item.
   */
  const categoryNameKey: CategoryNameKeyResolver = (categoryId) => defaultContrabandRegistry.getById(categoryId)?.nameKey;

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

  const searchSystem = new SearchSystem(securityGuards, navigation, contraband, intelligence, confiscations, searchPolicies, categoryConcealment, categoryNameKey, locateSearchTarget, events);

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
  const defaultSector = applyDefaultSecuritySector({ world, sectors: securitySectors, schedules: securitySchedules, watchedSectorIds: incidentSectorIds });

  /*
   * The two gangs every prison has, on the sector it just derived
   * ([ADR 0103](../../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
   * decision 1).
   *
   * **Here, immediately after the sector, because a gang with no territory is
   * structurally inert.** ADR 0103 Context 2 is the finding:
   * `tryOpenRetaliation` walks the *sector's claimants* first and only then
   * filters grudges to those a claimant holds, so a gang that claims nothing is
   * never selected as `offended` and can hold a grudge for ever without acting
   * on it. Seeding one would be authored content that provably does nothing.
   *
   * `defaultSector.id` rather than `DEFAULT_SECURITY_SECTOR_ID` spelled a
   * second time: the derivation is payload-wins and answers with whichever
   * definition is now in the registry, so the gangs claim the sector that
   * exists rather than the one this line assumed.
   *
   * The same second call site as the line above -- `restoreSessionSystems`
   * re-applies both, because `GangRegistry.loadSnapshot` clears every
   * definition and every save that exists was written before this change.
   * `applyDefaultGangs` is idempotent and payload-wins for that reason.
   */
  applyDefaultGangs(gangs, defaultSector.id);

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

  /*
   * The producer `SearchSystem.submitOrder` never had
   * ([ADR 0073](../../../docs/adr/0073-who-orders-a-contraband-search.md)
   * Part 2 Option A, issue #552): a staffed sector orders a rotating sweep of
   * its own occupants on a cadence, and a *spare* guard walks it.
   *
   * Constructed here rather than beside `searchSystem` above because it needs
   * `resolveOccupants`, which needs the sector registry the derivation fills --
   * the same ordering constraint `applyDefaultSecuritySector` has. It is handed
   * `resolveSectorOccupants`'s answer through that resolver rather than reading
   * positions itself, so ADR 0048's containment rule stays in the one module
   * that owns it.
   */
  const sectorSearchDuty = new SectorSearchDutySystem(
    securitySectors,
    securityGuards,
    searchSystem,
    searchPolicies,
    (sector) => resolveOccupants(sector.id),
  );

  /*
   * **Coverage provisions the `safety` need** (issue #588, the owner's ruling
   * on issue #599). The wiring and none of the rule: which prisoners a sector
   * holds is `resolveOccupants` above -- ADR 0048 decision 1's containment
   * rule, in the module that owns it -- and what that sector's coverage is
   * comes from `DeploymentSystem.getCoverageReport` through
   * `resolveSectorCoverageState`, which is the Staff panel's own three-rung
   * ladder. `SafetyCoverageSystem` argues the mechanic and the ordering.
   *
   * Constructed here for `sectorSearchDuty`'s reason: it needs
   * `resolveOccupants`, which needs the sector registry the derivation fills.
   */
  const safetyCoverage = new SafetyCoverageSystem(deploymentSystem, resolveOccupants, prisoners.entityStore, prisoners.needs);

  /**
   * One prisoner's mean unmet-need deficit over `NEED_IDS`, 0-1.
   *
   * Extracted because two samplers now need it and they must not disagree:
   * `sampleSectorRisk` averages it across a sector
   * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
   * decision 2) and `sampleFlashpoints` reads it per prisoner
   * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)
   * decision 3). Two copies of this loop is how the mean and the individual
   * would come to be measured on different terms, which is exactly the
   * distinction both ADRs turn on.
   *
   * `NEED_IDS` in its declared order, which is the iteration discipline
   * `NeedsComponent` uses everywhere; the sum is over floats, so the order is
   * load-bearing for bit-reproducibility rather than merely tidy.
   */
  const needDeficitOf = (entityId: number): number => {
    const index = prisoners.entityStore.getIndex(entityId);
    let deficit = 0;
    for (const needId of NEED_IDS) deficit += (NEED_MAX - prisoners.needs.get(index, needId)) / NEED_MAX;
    return deficit / NEED_IDS.length;
  };

  /** The worst authored `severity` among what this prisoner is concealing, scaled to 0-1; 0 for a prisoner carrying nothing. */
  const contrabandSeverityOf = (entityId: number): number => {
    let worst = 0;
    for (const item of contraband.byHolder('prisoner', String(entityId))) {
      const category = defaultContrabandRegistry.getById(item.categoryId);
      if (category !== undefined && category.severity > worst) worst = category.severity;
    }
    return worst / 10;
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
      for (const entityId of occupants) deficitSum += needDeficitOf(entityId);
      needsPressure = deficitSum / occupants.length;
    }

    let contrabandPressure = 0;
    for (const record of intelligence.forTarget('sector', sectorId)) contrabandPressure = Math.max(contrabandPressure, record.confidence);

    // The current game has one authored gate post in its default sector. A
    // delayed queue amplifies that sector's sustained incident risk; it does
    // not turn a candidate outside into a prisoner or an occupied place.
    const intakeQueuePressure = sectorId === defaultSector.id ? Math.min(1, prisoners.delayedIntakeCount / 4) : 0;
    return { needsPressure, staffingShortfall, contrabandPressure, intakeQueuePressure };
  };

  /*
   * Each occupant's own pressures, for ADR 0061's two producers.
   *
   * The wiring, and deliberately none of the rule: every weight, threshold and
   * comparison lives in `src/simulation/incidents/flashpoint.ts`, and what
   * happens here is reading four numbers out of the registries that already
   * hold them. `sentenceRemaining` is guarded against a zero-length sentence
   * rather than assumed away, so an arrival whose length is not settled yet
   * cannot divide by zero and score `NaN` -- which compares false against every
   * threshold and would have made the bug invisible instead of loud.
   *
   * **The sentence saying when that happens was wrong, and #535 decision 5 has
   * made it right.** It read "`sentenceLengthTicks` is 0 in every slot until
   * the classification stage writes one"; what that stage wrote was
   * `sentenceEndTick`, and `submitIntake` had already written a length at the
   * dispatch tick -- so the only slots reading 0 were slots nobody had ever
   * been admitted into. Since that decision an admission that leaves its length
   * to the simulation does read 0 from the dispatch tick until the
   * `classification` stage draws one, about fifteen ticks later. The guard now
   * covers the window the comment always claimed for it, and both directions
   * are recorded rather than the first overwritten.
   *
   * Ascending entity id, because `resolveOccupants` answers in that order and
   * this maps over it.
   */
  const sampleFlashpoints: PrisonerFlashpointSampler = (sectorId, tick) =>
    resolveOccupants(sectorId).map((entityId) => {
      const index = prisoners.entityStore.getIndex(entityId);
      const sentenceLengthTicks = prisoners.records.sentenceLengthTicks[index]!;
      const sentenceRemaining =
        sentenceLengthTicks <= 0 ? 0 : Math.max(0, Math.min(1, (prisoners.records.sentenceEndTick[index]! - tick) / sentenceLengthTicks));
      return {
        entityId,
        needDeficit: needDeficitOf(entityId),
        contrabandSeverity: contrabandSeverityOf(entityId),
        sentenceRemaining,
        riskTier: prisoners.records.riskTier[index]!,
      };
    });

  const incidentTriggerSystem = new IncidentTriggerSystem(
    incidents,
    sectorRisk,
    gangs,
    incidentSectorIds,
    sampleSectorRisk,
    resolveOccupants,
    events,
    undefined,
    undefined,
    undefined,
    sampleFlashpoints,
  );


  // The policy and the route-context resolver are the constructor's own
  // defaults, restated (and skipped) only so the eighth argument can be
  // supplied -- **the seventh until #555 put the required `events` sink ahead
  // of them**, and the ordinal is corrected rather than dropped because it is
  // the only thing that says why two arguments are being restated at all:
  // the live view of which guards `SearchSystem` is holding on the
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
    events,
    DEFAULT_INCIDENT_RESPONSE_POLICY,
    undefined,
    () => searchSystem.claimedGuardIds(),
    /*
     * A prisoner who got out is gone (ADR 0061 decision 5). `releasePrisoner`
     * is the one door into a departure -- the same one `PrisonerDischargeSystem`
     * uses for a sentence that ended -- so an escape frees the same bed, drops
     * the same name and the same gang membership, and takes the same contraband
     * out of the prison as any other way of leaving. Nothing about *why* they
     * left is recorded on the prisoner, because ADR 0050 decision 4 and #31 own
     * that: the incident log is where the reason lives, and it keeps it.
     *
     * **The name is read before the release and answered back, and the order
     * is load-bearing (#683).** `releasePrisoner` calls
     * `identity.release('prisoner', entityId)`, so after it returns there is
     * nobody left to ask -- and the sentence the prison now says about an
     * escape names the escapee. This callback is the only place that holds
     * both the registry and the departure, which is why the port answers with
     * the name instead of the response system resolving one.
     *
     * A refused release answers `undefined` and the prison says nothing: the
     * incident record still reads `escaped: true` for a participant who was
     * not a live prisoner, and announcing a loss the prison did not take would
     * be the promise-the-code-does-not-keep case rather than a tidier branch.
     */
    (entityId, tick) => {
      const name = actorIdentity.getName('prisoner', entityId);
      if (!prisoners.releasePrisoner(entityId, tick)) return undefined;
      return name === undefined ? {} : { name: { givenName: name.givenName, familyName: name.familyName } };
    },
    /*
     * Issue #80, ADR 00XX (number not yet assigned): the assault's instigator
     * -- not both participants -- is sanctioned to a term in solitary
     * confinement the moment the incident closes. `imposeSolitarySanction`
     * is the one write; `SanctionSystem` (registered by
     * `PrisonerOperationsRuntime.registerOn`) is what carries it out.
     *
     * **TWO CONSUMERS OF ONE ADJUDICATION SINCE
     * [ADR 0103](../../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md),
     * and the port carries the record rather than the instigator for that
     * reason** -- a directional grudge needs the second participant, which the
     * old `(entityId, tick)` signature could not name (ADR 0103 Context 13
     * point 3). `incident.instigatorId` is non-`undefined` on every call:
     * `adjudicateAssaultIfAny` narrows to an `'assault'` that carries one
     * before it calls, and that narrowing is stated in the port's own
     * docblock.
     *
     * Two calls in one callback rather than two ports, because the
     * *adjudication* is one event and this is the composition root's job:
     * `IncidentResponseSystem` announces that an assault ended, and what the
     * prison does about it -- a sanction, a grudge -- is decided here. Neither
     * call reads the other's result.
     */
    (incident, tick) => {
      prisoners.imposeSolitarySanction(incident.instigatorId!, tick);
      /*
       * The owner's ruling of 2026-09-08: *"A grudge forms from an adjudicated
       * assault between members of different gangs -- one the player was
       * actually shown."* The rule, the direction and the weight are all in
       * `default-gangs.ts`; this is the wiring, and the weight is that
       * module's default rather than a second number written here.
       *
       * **Silent for everything that is not a cross-gang assault**, which
       * today is most of them: `recordGrudgeFromAdjudicatedAssault` writes
       * nothing unless both participants are in gangs and the two differ.
       */
      recordGrudgeFromAdjudicatedAssault(gangs, incident);
    },
    /*
     * Issue #589, the owner's ruling of 2026-09-17: an incident that ran its
     * course leaves the people caught in it injured, and the flag it sets is
     * what sends them to an infirmary. `markInjured` is the one write;
     * `ActionSystem` (registered by `PrisonerOperationsRuntime.registerOn`) is
     * what carries them there and clears it.
     *
     * One call rather than the two the adjudication callback above makes,
     * because one thing happens: nothing else in this session reads an injury.
     * The tick is passed through unused by the current consumer and kept in the
     * port's signature for the reason the two ports above keep theirs -- a
     * consumer that wants to know *when* should not be the change that widens
     * a signature.
     */
    (entityId) => {
      prisoners.markInjured(entityId);
    },
  );

  // After both `'on-search'` claimants, because it reads each of them live: a
  // captured claim view would be exactly the mistake ADR 0033 decision 4
  // measured, one command later.
  const guardRelease = new GuardReleaseService(securityGuards, searchSystem, incidentResponseSystem, navigation);
  /*
   * Issue #533's consumer. Every optional surface is supplied here and none is
   * omitted, which is the point of naming them one by one rather than passing
   * the runtime: `StaffDismissalSurfaces` makes the list visible and cannot make
   * it complete, so the session is where a store that exists gets connected and
   * `tests/unit/staff-dismissal-completeness.test.ts` is what notices one that
   * did not.
   *
   * `navigation` is the one a reader should check first. Before this, nothing
   * in `src/` had ever cancelled a *guard's* route -- `cancelRequest` had
   * exactly one caller, `releasePrisoner` -- so a dismissal that left it out
   * would have stranded one navigation request per travelling guard dismissed,
   * for the life of the save.
   */
  const staffDismissal = new StaffDismissalService({
    roster: securityGuards,
    claims: guardRelease,
    navigation,
    identity: actorIdentity,
    contraband,
  });

  kernel.registerSystem(construction);
  kernel.registerSystem(procurement);
  kernel.registerSystem(stateIncome);
  kernel.registerSystem(payroll);
  kernel.registerSystem(labourCredit);
  kernel.registerSystem(workOutput);
  kernel.registerSystem(insolvencyRungs);
  kernel.registerSystem(roomNeedsClearedNotice);
  kernel.registerSystem(navigation);
  prisoners.registerOn(kernel);
  kernel.registerSystem(intelligenceSystem);
  kernel.registerSystem(guardLocomotionSystem);
  kernel.registerSystem(deploymentSystem);
  kernel.registerSystem(safetyCoverage);
  kernel.registerSystem(patrolSystem);
  kernel.registerSystem(incidentTriggerSystem);
  kernel.registerSystem(sectorSearchDuty);
  kernel.registerSystem(searchSystem);
  kernel.registerSystem(incidentResponseSystem);
  kernel.setCommandHandler(
    createSessionCommandHandler(construction, procurement, roomZoning, staffHiring, prisoners, objectPlacement, guardRelease, staffDismissal, refusals, events),
  );

  return {
    masterSeed,
    kernel,
    world,
    construction,
    treasury,
    procurement,
    justInTimeMaterials,
    stateIncome,
    labourCredit,
    loans,
    payroll,
    insolvencyRungs,
    refusals,
    events,
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
    carryJobs,
    electricity,
    water,
    securitySectors,
    securityGuards,
    staffHiring,
    securitySchedules,
    deploymentSystem,
    safetyCoverage,
    patrolSystem,
    contraband,
    intelligence,
    informants,
    confiscations,
    searchPolicies,
    guardRelease,
    staffDismissal,
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
