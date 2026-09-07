import { EntityStore, type EntityId } from '../entity/entity-store';
import { ComponentBitset } from '../entity/component';
import { EntityQuery } from '../entity/query';
import type { SimulationEventLog } from '../events';
import type { ActorIdentityLifecycle } from '../identity/actor-identity';
import type { Kernel } from '../kernel/kernel';
import { LocomotionStore, LocomotionSystem } from '../locomotion';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { CarryJobExecutor } from '../operations/carry-executor';
import { ActionSystem, type PrisonerRouteContextResolver } from './action-system';
import type { AdmissionRequest } from './classification';
import { ClassificationEarlyWarningSystem } from './classification-early-warning-system';
import { ClassificationReviewSystem } from './classification-review-system';
import { rateCellSharing, type CellSharingView } from './cell-sharing';
import type { DisciplinaryEvidenceSource } from './disciplinary-record';
import {
  ACTION_PHASES,
  classificationGroupIdFromIndex,
  CurrentActionComponent,
  PositionComponent,
  PrisonerColdState,
  PrisonerRecordComponent,
  SubstitutionRecordComponent,
} from './components';
import { PrisonerDischargeSystem } from './discharge-system';
import { DEFAULT_ACCOMMODATION_POLICY, firstAvailableAccommodationTarget, type AccommodationPolicy, IntakeSystem, type IntakeContrabandIntroducer } from './intake-system';
import {
  releasePrisoner,
  type PrisonerGangReleasePort,
  type PrisonerReleaseSurfaces,
  type PrisonerContrabandReleasePort,
} from './release';
import { NeedsComponent } from './needs';
import { NeedsDecaySystem } from './needs-system';
import { combineRegimeOverrides, DEFAULT_REGIME_SCHEDULES, HIGH_RISK_REGIME, type PrisonerRegimeOverrideResolver, type RegimeSchedule } from './regime';
import { residentsWithoutExistingPlace, RoomInstanceRegistry } from './room-instance-registry';
import { DEFAULT_SANCTION_POLICY, SanctionSystem, SOLITARY_SANCTION_ROOM_CATALOG_ID, type SanctionPolicy } from './sanction-system';

const PRISONER_COMPONENT_ID = 0;

/**
 * Why an admission the player asked for was not carried out (#261 step 4).
 *
 * Two reasons, and both are conditions the runtime can state about itself
 * before it allocates anything -- not a guess about what intake will decide.
 *
 * - `no-accommodation`: no room instance exists that any classification
 *   group's accommodation target names. See
 *   `IntakeSystem.hasAccommodationTarget` for why this and not "the arrival's
 *   own target" and why the refusal is worth more than the admission.
 * - `population-full`: `EntityStore` has no index left, so `spawn()` would
 *   throw out of the kernel's tick.
 */
export const ADMIT_PRISONER_REFUSAL_REASONS = ['no-accommodation', 'population-full'] as const;
export type AdmitPrisonerRefusalReason = (typeof ADMIT_PRISONER_REFUSAL_REASONS)[number];

/** `requestAdmission`'s answer: the entity that now exists, or why none does. Shaped like `ZoneRoomOutcome`, for the same reason -- a command handler returns `void`, so the outcome has to be a value the caller can put on the refusal route. */
export type AdmitPrisonerOutcome =
  | { readonly kind: 'admitted'; readonly entityId: EntityId }
  | { readonly kind: 'refused'; readonly reason: AdmitPrisonerRefusalReason };

/**
 * What `relocateExcessResidentsOf` did, resident by resident: who now lives
 * somewhere their bed exists, and who could not be moved and is therefore
 * still occupying a place that is not there.
 *
 * Two arrays rather than a `'relocated' | 'no-vacancy'` verdict, because this
 * call has no all-or-nothing outcome to report (see the method) and because
 * *which* residents moved is the only thing a reader can check against the
 * money: `stranded` is precisely the set
 * `RoomInstanceRegistry.residentIdsWithExistingPlace` will still be leaving
 * out of the day's grant. Both are ascending by entity id, and `stranded`
 * empty is the ordinary case for any prison with a spare furnished bed.
 *
 * **`relocated` is what the player is told about and `stranded` is not**, and
 * that asymmetry is a gap rather than a decision. ADR 0076 decision A(i)'s
 * notice reaches the player once per entry in `relocated`
 * (`SimulationEventLog.recordResidentRelocated`); the owner has approved no
 * wording for a resident left sleeping in a room with no bed in it, and this
 * repository does not write player-facing copy. So a stranded resident is
 * still silent -- visible in the room's own occupancy readout and in the
 * income A(ii) withholds, and nowhere else.
 *
 * Nothing on the wire and nothing in a snapshot: the caller is a command
 * dispatch, and the state this reports is already carried by residency and
 * cold-state accommodation.
 */
export interface ExcessRelocationOutcome {
  readonly relocated: readonly ExcessResidentRelocation[];
  readonly stranded: readonly EntityId[];
}

/**
 * One resident who moved, and the instance they moved **into**.
 *
 * **`relocated` was `readonly EntityId[]` until the notice ADR 0076 owed was
 * built, and this is the re-reading that PR #637 said its own weakest claim
 * would need.** That claim was that a per-resident split is the right *shape*
 * and not merely the convenient one, resting on there being no consumer for an
 * all-or-nothing verdict -- and it named the condition that would settle it:
 * *"If that notice wants one verdict per removal rather than a per-resident
 * split, `{relocated, stranded}` is at the wrong grain."*
 *
 * The wording the owner approved is **"{name} had nowhere to sleep and moved
 * to {room}."** It names one prisoner and one room, so the grain was right and
 * the *fields* were short by one: an entity id says who moved and cannot say
 * where to, and the destination is knowable only here, inside the walk that
 * chose it. Reading it back off `coldState` afterwards would have been a
 * second answer to a question this method already had.
 */
export interface ExcessResidentRelocation {
  readonly entityId: EntityId;
  /** The room instance they now live in -- `findBestAvailable`'s choice, not a re-derivation of it. */
  readonly toInstanceId: string;
}

export interface PrisonerOperationsRuntimeOptions {
  readonly capacity: number;
  readonly navigation: NavigationSystem;
  /**
   * Where `PrisonerDischargeSystem` says that a sentence ended (issue #507).
   *
   * Required rather than optional, and it is the one option here that is a
   * *sink* rather than a capability: a runtime handed no log discharges
   * prisoners silently, and every fixture that steps this runtime past a
   * sentence end would then be asserting against a prison that cannot say so.
   * The two constructors in the repository -- `createNewSimulationRuntime`
   * (`src/simulation/runtime/new-session.ts`) and
   * `tests/helpers/prisoner-fixture.ts` -- each pass the session's own log.
   */
  readonly events: SimulationEventLog;
  readonly regimeSchedules?: readonly RegimeSchedule[];
  /**
   * What an open incident imposes on one prisoner's day in place of the
   * schedule above (`createRiotRegimeOverride` in
   * `src/simulation/incidents/riot-regime.ts`, ADR 0057).
   *
   * A port rather than the `IncidentLog` itself, for the reason
   * `disciplinaryEvidence` below is a port: the log is session-level state that
   * spans this runtime and the guard roster, and owning it here would misfile
   * it. Omitted, no prisoner is ever overridden and every one of them runs
   * their classification group's timetable — which is what a fixture with no
   * incident pipeline wants, and what this runtime did before ADR 0057.
   */
  readonly regimeOverride?: PrisonerRegimeOverrideResolver;
  readonly accommodationPolicy?: AccommodationPolicy;
  readonly routeContextResolver?: PrisonerRouteContextResolver;
  /**
   * Actor-identity minting (`src/simulation/identity/`). The registry is
   * *not* owned here: it spans prisoners and staff, which live in two
   * separate `EntityStore`s, so it belongs to the session. Passing it in
   * only tells `IntakeSystem` to name an arrival at reception. Omitted, no
   * prisoner is named and no draw is made.
   */
  readonly identity?: ActorIdentityLifecycle;
  /** Overrides the stream identity draws from. Defaults to `ACTOR_IDENTITY_RNG_STREAM`; a session must have registered whichever name is used. */
  readonly identityRngStreamName?: string;
  /**
   * Already-recorded incident and confiscation evidence, read by
   * `ClassificationReviewSystem` (ADR 0032) and, since ADR 0090, by
   * `ClassificationEarlyWarningSystem` too -- both fold the same evidence, one
   * on a slower and unbounded schedule and one on a faster schedule capped at
   * `Medium`. Omitted, both still run and still move a tier -- clean-conduct
   * credit needs no evidence to accrue -- so a test or scenario that wires no
   * incident pipeline behaves sensibly rather than throwing.
   *
   * A port rather than the two registries, because `IncidentLog` and
   * `ConfiscationLedger` are session-level: they span this runtime and the
   * guard roster, exactly as `ActorIdentityRegistry` does, and owning them here
   * would misfile them.
   */
  readonly disciplinaryEvidence?: DisciplinaryEvidenceSource;
  /**
   * Gang membership (`src/simulation/incidents/gangs.ts`), for the one thing
   * this runtime has to tell it: a prisoner who has left the prison is not in a
   * gang any more.
   *
   * Not owned here, for the reason `identity` above is not owned here -- it is
   * session state that outlives the prisoner slice -- and optional for the same
   * reason too: a fixture that stands up prisoners alone has no gangs, and an
   * absent registry holds no membership to leak. See
   * `PrisonerReleaseSurfaces`.
   */
  readonly gangs?: PrisonerGangReleasePort;
  /**
   * The job board's executor (`src/simulation/operations/carry-executor.ts`),
   * and since [ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) a
   * collaborator of `ActionSystem` rather than only a release surface: a carry
   * is an action, so this runtime is what drives one.
   *
   * Same ownership and optionality as `gangs`: the board is session state that
   * spans prisoners and haulage, and a fixture standing up the prisoner slice
   * alone genuinely has none -- in which case `action.carry` is never a
   * candidate and every such fixture behaves exactly as it did before the
   * decision.
   *
   * **This option used to be `jobWorkers`, the haulage labour pool.** ADR 0093
   * decision 4 retired `JobWorkerPool` because both of its sets are derivable,
   * and a departing carrier's job is now *ended* rather than the worker being
   * dropped from a set -- see `PrisonerCarryReleasePort`.
   */
  readonly carryJobs?: CarryJobExecutor;
  /**
   * The contraband ground truth (`src/simulation/contraband/item.ts`). Same
   * ownership and optionality as `gangs`: it is session state, and a prisoner
   * who has left the prison is not concealing anything inside it any more
   * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)).
   */
  readonly contraband?: PrisonerContrabandReleasePort;
  /**
   * What an arrival brings in with them, called by `IntakeSystem` at the
   * classification stage. Absent, intake introduces nothing and draws nothing.
   *
   * **Two systems hold this port since ADR 0080, not one**, and the sentence
   * above is kept because it is still the whole of what happens to most
   * prisoners. `ClassificationReviewSystem` takes the same port and asks the
   * same question at the one review that raises somebody *into* tier 3 --
   * which is the only way the fifth entry of the `2 + tier` eligible band ever
   * gets a producer, `classifyPrisoner` at `priorIncidents: 0` being unable to
   * score 3 ([#677](https://github.com/matmaxalez/lockstate/issues/677)).
   * Absent, neither introduces anything and neither draws.
   */
  readonly contrabandIntroducer?: IntakeContrabandIntroducer;
  /** The named stream `contrabandIntroducer` draws from. Only read when one is supplied. */
  readonly contrabandRngStreamName?: string;
  /**
   * How long a solitary sanction runs (issue #80,
   * [ADR 0067](../../../docs/adr/0067-what-an-assault-costs-its-instigator.md)).
   * Defaults to
   * `DEFAULT_SANCTION_POLICY`, the same directional-default shape
   * `accommodationPolicy` above and `IncidentResponsePolicy` elsewhere use.
   */
  readonly sanctionPolicy?: SanctionPolicy;
}

/**
 * Composes issue #24's prisoner lifecycle slice (needs, intake, regime-
 * driven utility-AI action selection) the same way `NavigationSystem`
 * composes issue #22's navigation scheduling: one object owning the
 * `EntityStore`-backed state and the `Kernel`-registrable systems that
 * operate on it. `registerOn(kernel)` wires every one of them; nothing
 * here spawns a prisoner or a room instance on its own -- that is real
 * session/scenario setup, not implicit default content.
 */
export class PrisonerOperationsRuntime {
  public readonly entityStore: EntityStore;
  public readonly roomInstances = new RoomInstanceRegistry();
  public readonly records: PrisonerRecordComponent;
  public readonly needs: NeedsComponent;
  public readonly currentAction: CurrentActionComponent;
  public readonly position: PositionComponent;
  /**
   * How often each prisoner has been served worse than they asked for
   * (issue #435). Written by `actionSystem`, which is the only thing that
   * knows a first choice was refused; public because reading it is the whole
   * point of it existing, and because it is the per-prisoner half of
   * `ActionMetrics`' two substitution totals.
   *
   * No save carries it -- see `SubstitutionRecordComponent` for why the
   * counters are cleared by a restore rather than migrated through one.
   */
  public readonly substitutions: SubstitutionRecordComponent;
  /**
   * Where a walking prisoner is *within* the tile `position` holds for it
   * ([ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)).
   *
   * Keyed by component index, which is what `PositionComponent` is addressed
   * by and what `LocomotionSystem` writes back through. Public because the
   * render publication reads it beside `position`
   * (`src/simulation/worker/render-actors-keyframe.ts`); nothing outside this
   * runtime writes it.
   */
  public readonly locomotion = new LocomotionStore();
  private readonly locomotionSystem: LocomotionSystem;
  public readonly coldState = new PrisonerColdState();

  /**
   * The accommodation policy `intakeSystem` below is running, resolved once
   * here rather than defaulted twice.
   *
   * Public because a *reader* of the prison needs the same answer the stage
   * gets: `projectStatusCounts` scopes the status strip's
   * `accommodationCapacity` by it, so the denominator the player sees and the
   * rooms intake will actually fill are one authored fact. Defaulting again at
   * the reader would be a second copy that a session passing its own policy
   * would silently disagree with.
   */
  public readonly accommodationPolicy: AccommodationPolicy;

  public readonly intakeSystem: IntakeSystem;
  public readonly needsDecaySystem: NeedsDecaySystem;
  public readonly actionSystem: ActionSystem;
  public readonly classificationReviewSystem: ClassificationReviewSystem;
  /** ADR 0090, issue #788: the faster, capped-lower companion that keeps `Medium` from being skipped. See its own docblock for why it is a second system rather than a change to `classificationReviewSystem`. */
  public readonly classificationEarlyWarningSystem: ClassificationEarlyWarningSystem;
  public readonly dischargeSystem: PrisonerDischargeSystem;
  public readonly sanctionSystem: SanctionSystem;

  /**
   * How many prisoners `admitPrisoner` has allocated this session, counting
   * every admission whatever became of it afterwards -- served their
   * sentence, escaped, or still inside. Issue #506: the roster projection
   * carries only the *live* population, and a live count of zero cannot say
   * whether nobody has ever been admitted or whether everybody has since
   * left -- which is exactly the false empty-roster sentence the Regime panel
   * kept showing after a batch of sentences all ended within the same window
   * (ADR 0050, "What this does not decide"). **That sentence read "Nobody has
   * been admitted yet" when this counter was written and reads "No prisoners
   * yet. Build a cell with a bed to take somebody in." since the owner's
   * ruling of 2026-09-03** -- the wording moved, the two states this counter
   * tells apart did not, and the new wording is false of the emptied-out
   * prison for one more reason than the old one was: the cell it tells the
   * player to build is already standing. This is the
   * fact that tells the two states apart: `projectPrisonerRoster`'s
   * `everAdmitted` is `admittedCount > 0`, read at every departure door --
   * `PrisonerDischargeSystem`'s scheduled release and `releasePrisoner`'s
   * unguarded one (an escape, ADR 0061 decision 5) both only ever remove
   * from a population this counter already added to, so neither exit path
   * needs a matching decrement here.
   *
   * Observability only, and **not persisted** -- the same standing shape
   * `PrisonerDischargeSystem.dischargedCount` and `IntakeMetrics` already
   * have (see `dischargedCount`'s own comment, and
   * `docs/HUD_PROJECTIONS.md` gap 33). Safe to reset on restore because
   * nothing reads it back into simulation state: this runtime's behaviour
   * depends on `entityStore`'s liveness, never on this counter. The one
   * case this resets wrongly is a save whose prison was populated and then
   * fully emptied *before* the save was taken -- a session restored from it
   * shows that empty-roster sentence once more, for exactly as long as
   * it takes to admit and discharge again. That is the same window gap 33
   * already names for every other session-scoped metric here, not a new
   * one.
   */
  public admittedCount = 0;

  /** Issue #80's solitary-sanction term. Not a constructor parameter default read twice: `imposeSolitarySanction` and `sanctionSystem` both need the one policy, so it is resolved once here. */
  private readonly sanctionPolicy: SanctionPolicy;

  /**
   * Every store a departing prisoner has to be dropped from, assembled once
   * here from what this runtime owns plus the session-level collaborators it
   * was handed. One object, built in one place, so `releasePrisoner` and
   * `PrisonerDischargeSystem` cannot be looking at two different lists.
   */
  private readonly releaseSurfaces: PrisonerReleaseSurfaces;

  private readonly bitset: ComponentBitset;
  private readonly query: EntityQuery;

  public constructor(options: PrisonerOperationsRuntimeOptions) {
    this.entityStore = new EntityStore(options.capacity);
    this.bitset = new ComponentBitset(options.capacity);
    this.query = new EntityQuery(this.entityStore, this.bitset);
    this.query.mask.require(PRISONER_COMPONENT_ID);

    this.records = new PrisonerRecordComponent(options.capacity);
    this.needs = new NeedsComponent(options.capacity);
    this.currentAction = new CurrentActionComponent(options.capacity);
    this.position = new PositionComponent(options.capacity);
    this.substitutions = new SubstitutionRecordComponent(options.capacity);

    this.accommodationPolicy = options.accommodationPolicy ?? DEFAULT_ACCOMMODATION_POLICY;
    this.intakeSystem = new IntakeSystem(
      this.entityStore,
      this.query,
      this.records,
      this.coldState,
      this.roomInstances,
      this.accommodationPolicy,
      undefined,
      options.identity,
      options.identityRngStreamName,
      options.contrabandIntroducer,
      options.contrabandRngStreamName,
    );
    this.needsDecaySystem = new NeedsDecaySystem(this.entityStore, this.query, this.needs);
    this.classificationReviewSystem = new ClassificationReviewSystem(
      this.entityStore,
      this.query,
      this.records,
      options.disciplinaryEvidence,
      options.contrabandIntroducer,
      options.contrabandRngStreamName,
    );
    this.classificationEarlyWarningSystem = new ClassificationEarlyWarningSystem(this.entityStore, this.query, this.records, options.disciplinaryEvidence);
    this.sanctionPolicy = options.sanctionPolicy ?? DEFAULT_SANCTION_POLICY;
    this.sanctionSystem = new SanctionSystem(this.entityStore, this.query, this.records, this.coldState, this.roomInstances, this.accommodationPolicy);
    this.actionSystem = new ActionSystem(
      this.entityStore,
      this.query,
      this.records,
      this.needs,
      this.currentAction,
      this.position,
      this.substitutions,
      this.coldState,
      this.roomInstances,
      options.navigation,
      this.locomotion,
      options.regimeSchedules ?? DEFAULT_REGIME_SCHEDULES,
      options.routeContextResolver,
      // The caller's override (a live riot, ADR 0057) tried first, and this
      // runtime's own solitary-sanction override underneath it -- see
      // `combineRegimeOverrides` for why a riot in progress wins over a
      // standing sanction rather than the two fighting over one prisoner's
      // day. Built here rather than accepted as an option: it is a pure
      // function of `this.records`, which is not exposed for a caller to
      // build one from itself, and it must not read the clock
      // (`PrisonerRegimeOverrideResolver`'s own contract).
      combineRegimeOverrides(options.regimeOverride, (entityId) => (this.isServingSolitarySanction(entityId) ? HIGH_RISK_REGIME : undefined)),
      options.carryJobs,
    );
    this.locomotionSystem = new LocomotionSystem('prisoners.locomotion', (ticks, tick) =>
      this.locomotion.advance(
        ticks,
        /*
         * **The route is re-validated at the edge, not trusted from when it
         * was planned** (the ADR *When a route stops being valid*).
         *
         * `options.navigation` is the same `NavigationSystem` the route was
         * asked of, and `canTraverseEdge` is two chunk-cell reads and a `Map`
         * lookup against the world as it stands on *this* tick -- no graph, no
         * cache, no queue, and no replanning triggered from here. A walker
         * whose next edge has been closed under it simply stops, and
         * `ActionSystem.continueTravelling` picks that up at its next
         * reconsideration exactly as it already picks up a canteen that was
         * un-zoned mid-journey. That is what keeps the re-validation off
         * AGENTS.md boundary 9's budgeted pathfinding path: the only actors
         * that replan are the ones a new wall actually stopped.
         *
         * The context is `ActionSystem`'s, deliberately: the door this walker
         * is about to cross must be judged against the same clearance the
         * router judged it against when the route was planned, and
         * `routeContextFor` is the one expression that says what that is.
         */
        (index, from, to) => options.navigation.canTraverseEdge(from, to, this.actionSystem.routeContextFor(index)),
        (index, tile) => {
          this.position.tileX[index] = tile.x;
          this.position.tileY[index] = tile.y;
        },
        (indices) => this.actionSystem.onWalksArrived(indices, tick),
      ),
    );

    this.releaseSurfaces = {
      entityStore: this.entityStore,
      bitset: this.bitset,
      coldState: this.coldState,
      roomInstances: this.roomInstances,
      navigation: options.navigation,
      // `exactOptionalPropertyTypes` is on, so an absent collaborator has to be
      // an absent *key*: spreading a conditional is what keeps
      // `identity: undefined` from being a different thing to "no identity
      // registry", which is the distinction `PrisonerReleaseSurfaces` relies on.
      ...(options.identity !== undefined ? { identity: options.identity } : {}),
      ...(options.gangs !== undefined ? { gangs: options.gangs } : {}),
      // The port is this runtime's own `ActionSystem`, which is the one thing
      // that knows how a carry ends. Supplied only where a board exists, so an
      // absent board stays an absent key rather than a port that can do
      // nothing (`PrisonerReleaseSurfaces`' four optional entries).
      ...(options.carryJobs !== undefined ? { carry: this.actionSystem } : {}),
      locomotion: this.locomotion,
      ...(options.contraband !== undefined ? { contraband: options.contraband } : {}),
    };
    this.dischargeSystem = new PrisonerDischargeSystem(this.entityStore, this.query, this.records, this.releaseSurfaces, options.events);
  }

  public registerOn(kernel: Kernel): void {
    kernel.registerSystem(this.intakeSystem);
    kernel.registerSystem(this.classificationEarlyWarningSystem);
    kernel.registerSystem(this.classificationReviewSystem);
    kernel.registerSystem(this.needsDecaySystem);
    kernel.registerSystem(this.dischargeSystem);
    kernel.registerSystem(this.actionSystem);
    kernel.registerSystem(this.locomotionSystem);
    kernel.registerSystem(this.sanctionSystem);
  }

  /**
   * Whether `entityId` is currently *physically confined* under a solitary
   * sanction (issue #80) -- both a live sanction (`solitarySanctionEndTick`
   * non-zero) **and** actually housed in `room.solitary-cell` right now.
   *
   * **Both conditions, and the second is not redundant.** A sanction is
   * recorded the instant an assault it names an instigator for closes, but
   * `SanctionSystem` can only *enforce* it once a solitary cell is free --
   * see its class comment. Reading only the flag would restrict a prisoner's
   * day for a sanction their prison has no way to carry out, which is a
   * consequence this simulation cannot make true: nothing about a general
   * cell changes when someone next to it is sanctioned, and applying
   * `HIGH_RISK_REGIME` anyway would be a punishment the player-visible world
   * gives no account of. **A sanction a prison never built a
   * `room.solitary-cell` for is real -- it is recorded and it will lift on
   * schedule -- and it costs nothing, honestly, because there is nowhere to
   * carry it out.** That is the same shape `SanctionSystem`'s own
   * never-relocated-before-the-term-ends branch already accepts, read here
   * from the other side.
   *
   * A pure read of state (the sanction field, `PrisonerColdState`'s
   * accommodation and the room registry's catalog id), never a comparison
   * against the current tick -- the regime override this feeds may not read
   * the clock (see the constructor), so both halves of "currently confined"
   * have to be answerable from state alone, and both are: whether the
   * sanction still stands is `SanctionSystem.update`'s to lift, and where the
   * prisoner is housed is what the room registry already answers for every
   * other reader.
   *
   * `false` for an id that names nobody living, so a stale reference cannot
   * force a regime schedule for an entity this runtime no longer holds.
   */
  public isServingSolitarySanction(entityId: EntityId): boolean {
    if (!this.entityStore.isAlive(entityId)) return false;
    if (this.records.solitarySanctionEndTick[this.entityStore.getIndex(entityId)]! === 0) return false;
    const instanceId = this.coldState.getAccommodation(entityId);
    if (instanceId === undefined) return false;
    return this.roomInstances.getById(instanceId)?.roomCatalogId === SOLITARY_SANCTION_ROOM_CATALOG_ID;
  }

  /**
   * Imposes (or extends) a solitary sanction on `entityId`, ending at
   * `max(the sanction's current end tick, tick) + sanctionPolicy.solitaryTermTicks`
   * (issue #80). Called from `IncidentResponseSystem`'s `onAssaultAdjudicated`
   * port the moment an assault this prisoner instigated
   * (`IncidentRecord.instigatorId`) reaches a terminal state.
   *
   * `max(existing, tick)` rather than a plain overwrite: a prisoner already
   * serving a sanction who earns a second one has their term extended forward
   * from whichever end is later, not reset to a shorter one measured from
   * `tick` alone -- the same non-decreasing shape `PrisonerDischargeSystem`
   * relies on for `sentenceEndTick` never running backwards.
   *
   * Silently does nothing for an id that names nobody living. An instigator
   * named by a terminal incident record is, ordinarily, exactly the prisoner
   * this runtime still holds; the guard is defensive against the one path
   * that could disagree -- a save restored between the incident opening and
   * closing with a build that has since freed the same index -- rather than a
   * case this runtime's own tests can produce.
   */
  public imposeSolitarySanction(entityId: EntityId, tick: number): void {
    if (!this.entityStore.isAlive(entityId)) return;
    const index = this.entityStore.getIndex(entityId);
    const currentEnd = this.records.solitarySanctionEndTick[index]!;
    this.records.solitarySanctionEndTick[index] = Math.max(currentEnd, tick) + this.sanctionPolicy.solitaryTermTicks;
  }

  /** `CellSharingView` for one resident, read at the index the caller already has -- the same shape `SanctionSystem.sharingViewOf` and `IntakeSystem`'s own private helper build, extracted here because `relocateResidentsOutOf` is a third caller of the identical read. */
  private sharingViewOf(entityId: EntityId, index: number): CellSharingView {
    return { entityId, riskTier: this.records.riskTier[index]! };
  }

  /** Living occupants of `instanceId` as `CellSharingView`s, ascending by entity id (`occupantsOf`'s own order) -- the view `rateCellSharing` compares a candidate placement's current occupants against. */
  private sharingViewsOf(occupants: readonly EntityId[]): readonly CellSharingView[] {
    const views: CellSharingView[] = [];
    for (const occupant of occupants) {
      if (!this.entityStore.isAlive(occupant)) continue;
      views.push(this.sharingViewOf(occupant, this.entityStore.getIndex(occupant)));
    }
    return views;
  }

  /**
   * Moves every **resident** of every instance named in `instanceIds` into
   * other suitable accommodation, so the caller can then remove those
   * instances without stranding anybody (issue #478).
   *
   * `RoomZoningService.unzone` is the one caller: an occupied room used to be
   * refused, permanently, for as long as the resident stayed sentenced --
   * there was no command that moved a prisoner out of accommodation, so a
   * cell zoned in the wrong place and then filled by an ordinary admission
   * could never be un-zoned again. This is the fix, and it is built entirely
   * out of the target-selection this runtime already had two callers for:
   * `IntakeSystem`'s `accommodation-assignment` stage houses a fresh arrival
   * this same way, and `SanctionSystem` releases a sanctioned prisoner back
   * to ordinary housing this same way. A relocation is that same "where does
   * this classification group live" question, asked one more time, for a
   * resident whose room is about to stop existing rather than one who just
   * arrived or whose sanction just ended.
   *
   * **All-or-nothing, and that is the answer to "what happens when there is
   * nowhere to put them".** Residents are visited in ascending entity-id
   * order (`docs/DETERMINISM.md`'s canonical order), ahead of any tile
   * being cleared or any instance being unregistered. Each is offered
   * exactly the one target `firstAvailableAccommodationTarget` says their
   * *current* classification group prefers -- the same rule
   * `IntakeSystem.resolveExistingTarget`'s own comment gives for not falling
   * back onto a second room type merely because the first is full, so this
   * does not quietly move a high-risk prisoner into general population for
   * one relocation's convenience. The moment one resident has nowhere to go,
   * every relocation this call already made is undone, in the same terms it
   * was made -- released from where it just placed them, re-assigned to the
   * instance it took them from, cold state pointed back -- so a refused
   * un-zoning leaves residency exactly as it found it, and the caller sees
   * one clean `'no-vacancy'` rather than a partially emptied room.
   *
   * **`excludeInstanceIds` is every instance in `instanceIds`, not only the
   * one a resident is currently being moved out of.** A rectangle can cover
   * several occupied rooms at once, and without this a resident of one could
   * be "relocated" into a neighbour this very call is also about to
   * unregister -- which would either strand them a second time or make
   * `RoomInstanceRegistry.unregister`'s own claim-count guard refuse the
   * removal it was trying to permit. `findBestAvailable`'s `excludeInstanceIds`
   * parameter (issue #478) is exactly this exclusion, and it is a membership
   * test only: nothing here iterates the set, so no `Map`/`Set` insertion
   * order can decide an outcome.
   *
   * **Determinism.** No RNG stream is read, no clock is read, and the one
   * candidate-ordering choice -- `findBestAvailable`'s -- is the same pure,
   * total-order scan `IntakeSystem` and `SanctionSystem` already rely on.
   * The only new ordering this method introduces is the ascending-entity-id
   * visit order over the residents being displaced, which is a sort by a
   * scalar id and therefore total.
   *
   * Answers `'relocated'` when every resident named by `instanceIds` now
   * lives somewhere else (or there were none to move), and `'no-vacancy'`
   * when at least one had nowhere to go and nothing was changed.
   */
  public relocateResidentsOutOf(instanceIds: readonly string[]): 'relocated' | 'no-vacancy' {
    const excluded = new Set(instanceIds);

    const pending: Array<{ readonly entityId: EntityId; readonly fromInstanceId: string }> = [];
    for (const instanceId of instanceIds) {
      for (const entityId of this.roomInstances.occupantsOf(instanceId)) pending.push({ entityId, fromInstanceId: instanceId });
    }
    // A resident can hold at most one residency claim, so no id above can
    // repeat across two different `instanceId`s -- the sort below is total.
    pending.sort((a, b) => a.entityId - b.entityId);

    const moved: Array<{ readonly entityId: EntityId; readonly fromInstanceId: string; readonly toInstanceId: string }> = [];
    for (const { entityId, fromInstanceId } of pending) {
      const index = this.entityStore.getIndex(entityId);
      const groupId = classificationGroupIdFromIndex(this.records.classificationGroupIndex[index]!);
      const target = firstAvailableAccommodationTarget(this.accommodationPolicy, this.roomInstances, groupId);
      const arrival = this.sharingViewOf(entityId, index);
      const instance =
        target === undefined
          ? undefined
          : this.roomInstances.findBestAvailable(
              target.roomCatalogId,
              (occupants) => rateCellSharing(arrival, this.sharingViewsOf(occupants)),
              target.requiredObjectCapability,
              excluded,
            );

      if (instance === undefined) {
        // Undo every relocation this call already made, in reverse of
        // nothing in particular -- the moves are to disjoint destinations,
        // so the order they are unwound in cannot matter, only that each one
        // is unwound exactly once.
        for (const done of moved) {
          this.roomInstances.release(done.toInstanceId, done.entityId);
          this.roomInstances.assign(done.fromInstanceId, done.entityId);
          this.coldState.setAccommodation(done.entityId, done.fromInstanceId);
        }
        return 'no-vacancy';
      }

      this.roomInstances.release(fromInstanceId, entityId);
      this.roomInstances.assign(instance.instanceId, entityId);
      this.coldState.setAccommodation(entityId, instance.instanceId);
      moved.push({ entityId, fromInstanceId, toInstanceId: instance.instanceId });
    }

    return 'relocated';
  }

  /**
   * Moves the residents of `instanceIds` who hold **no place that currently
   * exists** into accommodation that does, so a room whose furniture was taken
   * away stops housing more people than it can sleep
   * ([ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
   * decision A(i)).
   *
   * `ObjectPlacementService` is the one caller, on both routes that can take a
   * standing object out of a room -- the `RemoveObject` press and the `Undo`
   * of a completed object order -- because both drop a `residentCapacity` and
   * ADR 0028 decision 2 leaves the occupants where they are. That decision is
   * not withdrawn and this does not withdraw it: nobody is put on the street,
   * and a resident with nowhere to go stays exactly where ADR 0028 left them.
   * What changes is that "there is a free bed one cell over" now moves them
   * into it instead of leaving a prison that has quietly stopped making sense.
   *
   * ## The two ways this differs from `relocateResidentsOutOf`, and why
   *
   * **It moves the excess, not everybody.** `relocateResidentsOutOf` empties
   * whole instances because `unzone` is about to unregister them; here the
   * room goes on existing and goes on housing whoever it can still sleep. The
   * split is `residentsWithoutExistingPlace`, which is by construction the
   * complement of the set `StateIncomeSystem` pays for
   * (`residentIdsWithExistingPlace`, decision A(ii)) -- so the residents this
   * tries to move are exactly the residents the state has stopped paying for,
   * and a room losing one of two beds moves one resident rather than two.
   *
   * **It is best-effort, where the sibling is all-or-nothing.** The sibling
   * rolls every move back on the first resident with nowhere to go, because
   * its caller can still *refuse* -- a partially emptied room would be an
   * `unzone` that half happened. No caller here can refuse: ADR 0076 records
   * "refusing the removal while a resident depends on the object" as **not
   * taken**, for #478's reason, so the object is gone by the time this is
   * asked. Rolling a successful move back would then put a resident into a
   * bedless room deliberately, to preserve an atomicity nobody reads, and
   * would cost the prison the income A(ii) withholds for exactly that state.
   * So each resident is moved if there is somewhere for them and left where
   * ADR 0028 put them if there is not, and the caller is told which happened
   * to whom.
   *
   * ## What it shares with the sibling, deliberately
   *
   * The target rule is identical and is not restated: one call to
   * `firstAvailableAccommodationTarget` for the resident's *own* classification
   * group, then `findBestAvailable` rating each candidate by
   * `rateCellSharing` -- the same question `IntakeSystem` asks for an arrival
   * and `SanctionSystem` asks for a prisoner leaving solitary. A resident is
   * never offered a second room type because the first is full, so a
   * high-risk prisoner is not quietly moved into general population to spare
   * the caller an unhoused entity.
   *
   * **`findBestAvailable` is given no exclusion set, where the sibling gives
   * it every instance it was handed, and the difference is the difference
   * between the two callers.** `unzone` is about to *unregister* those
   * instances, so relocating into one would strand the resident a second
   * time; nothing is unregistered here, so there is nothing to exclude. The
   * room the excess is being taken out of cannot be chosen anyway -- it reads
   * occupancy at or above its capacity, which is what made these residents
   * excess in the first place, and `findBestAvailable` skips exactly that.
   *
   * **An exclusion set was written here first and taken out again**, and this
   * is what mutation testing is for: emptying it changed nothing any test
   * could see, and nothing any test *could* have seen for a call naming one
   * instance. It was also latently wrong for a call naming two -- an
   * under-capacity instance in `instanceIds` is a perfectly good destination
   * for another's excess, and excluding it would refuse a move the prison can
   * make. The honest fix is to delete the line rather than to write a test
   * that pins a redundancy, which is the reasoning
   * `residentsWithExistingPlace`'s own comment records for its deleted fast
   * path.
   *
   * **Determinism.** No RNG stream and no clock, exactly as the sibling reads
   * neither. The visit order is ascending entity id over a set selected by an
   * ascending-entity-id partition, so both the *who* and the *in what order*
   * are functions of the prison rather than of its history, and a restored
   * save folds the same way (`docs/DETERMINISM.md`).
   */
  public relocateExcessResidentsOf(instanceIds: readonly string[]): ExcessRelocationOutcome {
    const pending: Array<{ readonly entityId: EntityId; readonly fromInstanceId: string }> = [];
    for (const instanceId of instanceIds) {
      const instance = this.roomInstances.getById(instanceId);
      if (instance === undefined) continue;
      for (const entityId of residentsWithoutExistingPlace(this.roomInstances.occupantsOf(instanceId), instance.residentCapacity)) {
        pending.push({ entityId, fromInstanceId: instanceId });
      }
    }
    // One residency claim per resident, so no id repeats across two
    // `instanceId`s and the sort is total -- the sibling's argument, unchanged.
    pending.sort((a, b) => a.entityId - b.entityId);

    const relocated: ExcessResidentRelocation[] = [];
    const stranded: EntityId[] = [];
    for (const { entityId, fromInstanceId } of pending) {
      const index = this.entityStore.getIndex(entityId);
      const groupId = classificationGroupIdFromIndex(this.records.classificationGroupIndex[index]!);
      const target = firstAvailableAccommodationTarget(this.accommodationPolicy, this.roomInstances, groupId);
      const arrival = this.sharingViewOf(entityId, index);
      const instance =
        target === undefined
          ? undefined
          : this.roomInstances.findBestAvailable(
              target.roomCatalogId,
              (occupants) => rateCellSharing(arrival, this.sharingViewsOf(occupants)),
              target.requiredObjectCapability,
            );

      if (instance === undefined) {
        // ADR 0028 decision 2's state, now reached only when the prison really
        // has nowhere else -- and the branch decision A(ii) is unconditional
        // for, because this resident goes on occupying a place that is not
        // there and the state goes on declining to pay for it.
        stranded.push(entityId);
        continue;
      }

      this.roomInstances.release(fromInstanceId, entityId);
      this.roomInstances.assign(instance.instanceId, entityId);
      this.coldState.setAccommodation(entityId, instance.instanceId);
      relocated.push({ entityId, toInstanceId: instance.instanceId });
    }

    return { relocated, stranded };
  }

  /**
   * Removes one prisoner from the prison, giving back everything they hold
   * (#441, ADR 0050). Answers `false` for an id that names no living prisoner.
   *
   * The unguarded counterpart of `PrisonerDischargeSystem`, in the same
   * relationship `admitPrisoner` has to `requestAdmission`: the system decides
   * *whose* sentence has ended, this carries a departure out whatever the
   * reason. It exists as a public method because a scenario, a test, or a later
   * transfer/parole path needs one door into release rather than its own copy
   * of the teardown -- which is precisely how #111 happened one layer down.
   */
  public releasePrisoner(entityId: EntityId, atTick = 0): boolean {
    return releasePrisoner(this.releaseSurfaces, entityId, atTick);
  }

  /**
   * Snapshots the dynamic prisoner state this issue owns: entity
   * allocation, records, needs, current-action state, position, cold
   * accommodation/target metadata and room-instance occupancy. Does not
   * include `NavigationSystem`'s own pending path-request queue or
   * caches -- an in-flight route request is re-issued on the next
   * reconsideration cycle after a restore rather than being carried
   * across it, a deliberate, bounded scope decision (see
   * docs/adr/0007-navigation-work-budgets-and-flow-fields.md's caching
   * layer, which is likewise not part of any save today).
   */
  public getSnapshot() {
    return {
      entityStore: this.entityStore.getSnapshot(),
      records: this.records.getSnapshot(),
      needs: this.needs.getSnapshot(),
      currentAction: this.currentAction.getSnapshot(),
      position: this.position.getSnapshot(),
      coldState: this.coldState.getSnapshot(),
      roomInstanceOccupancy: this.roomInstances.getSnapshot(),
    };
  }

  /**
   * `atTick` is the kernel tick the restored session resumes at, and its only
   * use is stamping `ActionMetrics.substitutionsCountedSinceTick` -- nothing
   * about the restore itself depends on it, which is why it defaults, in the
   * same shape and for the same reason `releasePrisoner` above takes an
   * `atTick = 0`. `restoreSessionSystems` passes the real one; a fixture that
   * round-trips a snapshot without one gets a window that says it opened at 0,
   * which is what a fixture with no clock means.
   */
  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>, atTick = 0): void {
    this.entityStore.loadSnapshot(snapshot.entityStore);
    this.records.loadSnapshot(snapshot.records);
    this.needs.loadSnapshot(snapshot.needs);
    this.currentAction.loadSnapshot(snapshot.currentAction);
    this.position.loadSnapshot(snapshot.position);
    this.coldState.loadSnapshot(snapshot.coldState);
    this.roomInstances.loadSnapshot(snapshot.roomInstanceOccupancy);

    // Re-derive the query bitset from restored entity liveness -- the bitset
    // itself isn't part of the snapshot (it's a pure function of "is this
    // index alive," which EntityStore's own snapshot already captures).
    for (let index = 0; index <= this.entityStore.maxActiveIndex; index += 1) {
      if (this.entityStore.isIndexAlive(index)) this.bitset.add(index, PRISONER_COMPONENT_ID);
      else this.bitset.remove(index, PRISONER_COMPONENT_ID);
    }

    // A walk is the second half of the transient travel state the block below
    // drops, and it is dropped for the same reason: it names waypoints from a
    // route a rebuilt `NavigationSystem` no longer holds, and a restored
    // prisoner is re-planned from the tile the snapshot carried rather than
    // resumed mid-leg. Clearing the headings with it is what stops a recycled
    // component index from inheriting the way its previous occupant faced.
    this.locomotion.clear();

    // Any entity mid-`'travelling'` referenced a path request in the
    // *previous* NavigationSystem instance's queue -- a fresh one (per this
    // method's own snapshot-scope doc) never received it and would never
    // resolve it, leaving that entity stuck forever. Drop back to 'idle' so
    // the next reconsideration cycle re-selects and re-requests instead.
    const travellingPhase = ACTION_PHASES.indexOf('travelling');
    const idlePhase = ACTION_PHASES.indexOf('idle');
    for (let index = 0; index <= this.entityStore.maxActiveIndex; index += 1) {
      if (!this.entityStore.isIndexAlive(index)) continue;
      if (this.currentAction.phase[index] !== travellingPhase) continue;
      this.currentAction.phase[index] = idlePhase;
      const entityId = this.entityStore.getIdByIndex(index);
      this.coldState.setActionTarget(entityId, undefined);
      this.coldState.setPathRequestId(entityId, undefined);
    }

    // Concurrent-use claims are derived, not persisted (ADR 0029), so they are
    // rebuilt here from the phase and action target the snapshot did carry.
    // **Order is load-bearing and this is the last step for a reason**: the
    // registry's `loadSnapshot` above cleared every claim, and the loop above
    // has just dropped every `travelling` prisoner to `idle` and cleared their
    // target -- so this scan sees exactly the prisoners who are genuinely still
    // performing, and cannot reinstate a claim for a journey that no longer
    // exists.
    this.actionSystem.reinstateUseClaims();

    // **After the components, because it clears rather than reads them.** A
    // save carries no substitution history (issue #435 puts a save-schema
    // change out of scope, and `SubstitutionRecordComponent` says why that is
    // the right answer rather than only the permitted one), so a restore opens
    // a fresh counting window instead of resuming one. Left alone, the counts
    // this runtime happened to be holding would survive into a population
    // re-indexed from somebody else's save -- #111's shape, one component
    // further out.
    this.actionSystem.reopenSubstitutionWindow(atTick);
  }

  /**
   * The guarded admission a player's `AdmitPrisoner` command reaches (#261
   * step 4), as opposed to `admitPrisoner` below, which is the unguarded
   * allocation a scenario or a test drives directly.
   *
   * Two things separate them, and both are about the boundary rather than
   * about the simulation:
   *
   * 1. **It cannot throw into `Kernel.step()`.** `admitPrisoner` calls
   *    `EntityStore.spawn`, which throws when the store is exhausted. A
   *    command handler that throws unwinds the tick loop, so the boundary
   *    answers `population-full` instead.
   * 2. **It refuses an admission that is certain to end in a terminal
   *    `'failed'`.** With no room instance of any accommodation target,
   *    `IntakeSystem` marks the arrival `'failed'` -- and no branch of
   *    `IntakeSystem.update` matches that stage, so the record never
   *    recovers, not even once a room is zoned (measured). Allocating in that
   *    state hands the player an inert record while the status strip counts it
   *    as a prisoner, which is a worse answer than saying no. See
   *    `IntakeSystem.hasAccommodationTarget` for the full line between "not
   *    yet" and "never".
   *
   *    This used to add "Nothing releases a prisoner either (#31)" and call
   *    the record *permanent* and *undeletable*. Since #441 it is neither: the
   *    sentence such an arrival is serving ends, and
   *    `PrisonerDischargeSystem` releases them. The refusal is kept because a
   *    prisoner who does nothing for the length of their sentence is still not
   *    what the player asked for.
   *
   * What it deliberately does **not** do is pre-empt any other outcome. A
   * zoned cell with no bed in it makes the admission *succeed* here and then
   * wait at `accommodation-assignment` for as long as it takes -- a retryable
   * state the simulation already models and counts
   * (`IntakeMetrics.accommodationBacklogTicks`), and the state ADR 0023
   * describes for a room whose occupancy no object supplies. Refusing that
   * too would be this boundary deciding a product question the ADRs have not
   * settled.
   *
   * Deterministic: it reads registry contents and store occupancy, draws
   * nothing, and calls `admitPrisoner` unchanged -- so identity and
   * classification still come from `identity.actor-name` and
   * `prisoners.classification` at the intake stages that own them.
   */
  public requestAdmission(input: AdmissionRequest, originTile: { readonly x: number; readonly y: number }): AdmitPrisonerOutcome {
    if (!this.intakeSystem.hasAccommodationTarget()) return { kind: 'refused', reason: 'no-accommodation' };
    if (!this.entityStore.canSpawn) return { kind: 'refused', reason: 'population-full' };
    return { kind: 'admitted', entityId: this.admitPrisoner(input, originTile) };
  }

  /** Allocates a new prisoner entity and submits it to intake. Accommodation, classification and action selection happen over subsequent scheduled ticks -- there is no synchronous "spawn fully processed" shortcut. Unguarded: `requestAdmission` is what a player's command reaches. */
  public admitPrisoner(input: AdmissionRequest, originTile: { readonly x: number; readonly y: number }): EntityId {
    const entityId = this.entityStore.spawn();
    const index = this.entityStore.getIndex(entityId);
    // Counted at the one door every admission passes through, before
    // anything below can throw or refuse -- see `admittedCount`'s own
    // comment for why this is the fact `everAdmitted` reads instead of a
    // release-side tally.
    this.admittedCount += 1;
    // `EntityStore.spawn` recycles freed indices, and nothing clears a
    // component array when an entity is destroyed, so an index can arrive
    // here still holding the previous occupant's needs, classification and
    // action plan (#111). Every index-keyed component is reset to the values
    // a never-occupied slot holds, so an admission into a recycled index is
    // indistinguishable from one into a fresh index.
    //
    // Only the index-keyed SoA components need this. `coldState` and the
    // actor-identity registry key off `EntityId`, whose generation `destroy`
    // bumps, so the new occupant's lookups miss rather than inherit.
    //
    // **This is still not the release path, and the release path now exists.**
    // The sentence here used to end "dropping a destroyed prisoner's cold
    // state, room occupancy, gang membership and component bit is still
    // unimplemented (#31)"; #441 implemented it, in `releasePrisoner` below.
    // The division of labour is unchanged and is the point: defaults are
    // stated once and applied when an index is *allocated*, so release has
    // nothing to reset and cannot state a second, drifting copy of them.
    this.records.reset(index);
    this.needs.reset(index);
    this.currentAction.reset(index);
    this.position.reset(index);
    this.substitutions.reset(index);
    this.bitset.add(index, PRISONER_COMPONENT_ID);
    this.position.tileX[index] = originTile.x;
    this.position.tileY[index] = originTile.y;
    this.intakeSystem.submitIntake(entityId, input);
    return entityId;
  }
}
