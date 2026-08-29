import { EntityStore, type EntityId } from '../entity/entity-store';
import { ComponentBitset } from '../entity/component';
import { EntityQuery } from '../entity/query';
import type { ActorIdentityLifecycle } from '../identity/actor-identity';
import type { Kernel } from '../kernel/kernel';
import { LocomotionStore, LocomotionSystem } from '../locomotion';
import type { NavigationSystem } from '../navigation/navigation-system';
import { ActionSystem, type PrisonerRouteContextResolver } from './action-system';
import type { ClassificationInput } from './classification';
import { ClassificationReviewSystem } from './classification-review-system';
import type { DisciplinaryEvidenceSource } from './disciplinary-record';
import { ACTION_PHASES, CurrentActionComponent, PositionComponent, PrisonerColdState, PrisonerRecordComponent } from './components';
import { PrisonerDischargeSystem } from './discharge-system';
import { DEFAULT_ACCOMMODATION_POLICY, type AccommodationPolicy, IntakeSystem } from './intake-system';
import {
  releasePrisoner,
  type PrisonerGangReleasePort,
  type PrisonerReleaseSurfaces,
  type PrisonerWorkerReleasePort,
} from './release';
import { NeedsComponent } from './needs';
import { NeedsDecaySystem } from './needs-system';
import { DEFAULT_REGIME_SCHEDULES, type PrisonerRegimeOverrideResolver, type RegimeSchedule } from './regime';
import { RoomInstanceRegistry } from './room-instance-registry';

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

export interface PrisonerOperationsRuntimeOptions {
  readonly capacity: number;
  readonly navigation: NavigationSystem;
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
   * `ClassificationReviewSystem` (ADR 0032). Omitted, the review still runs and
   * still moves a tier -- clean-conduct credit needs no evidence to accrue --
   * so a test or scenario that wires no incident pipeline behaves sensibly
   * rather than throwing.
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
   * The haulage labour pool (`src/simulation/operations/job-system.ts`). Same
   * ownership and optionality as `gangs`: `JobWorkerPool` is session state,
   * `JobSystem` will hand a job to any registered worker, and a departed
   * prisoner left in it is a job assigned to a slot somebody else now occupies.
   */
  readonly jobWorkers?: PrisonerWorkerReleasePort;
}

/**
 * Composes issue #24's prisoner lifecycle slice (needs, intake, regime-
 * driven utility-AI action selection) the same way `NavigationSystem`
 * composes issue #22's navigation scheduling: one object owning the
 * `EntityStore`-backed state and the `Kernel`-registrable systems that
 * operate on it. `registerOn(kernel)` wires all four systems; nothing
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
  public readonly dischargeSystem: PrisonerDischargeSystem;

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
    );
    this.needsDecaySystem = new NeedsDecaySystem(this.entityStore, this.query, this.needs);
    this.classificationReviewSystem = new ClassificationReviewSystem(
      this.entityStore,
      this.query,
      this.records,
      options.disciplinaryEvidence,
    );
    this.actionSystem = new ActionSystem(
      this.entityStore,
      this.query,
      this.records,
      this.needs,
      this.currentAction,
      this.position,
      this.coldState,
      this.roomInstances,
      options.navigation,
      this.locomotion,
      options.regimeSchedules ?? DEFAULT_REGIME_SCHEDULES,
      options.routeContextResolver,
      options.regimeOverride,
    );
    this.locomotionSystem = new LocomotionSystem('prisoners.locomotion', (ticks, tick) =>
      this.locomotion.advance(
        ticks,
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
      ...(options.jobWorkers !== undefined ? { jobWorkers: options.jobWorkers } : {}),
      locomotion: this.locomotion,
    };
    this.dischargeSystem = new PrisonerDischargeSystem(this.entityStore, this.query, this.records, this.releaseSurfaces);
  }

  public registerOn(kernel: Kernel): void {
    kernel.registerSystem(this.intakeSystem);
    kernel.registerSystem(this.classificationReviewSystem);
    kernel.registerSystem(this.needsDecaySystem);
    kernel.registerSystem(this.dischargeSystem);
    kernel.registerSystem(this.actionSystem);
    kernel.registerSystem(this.locomotionSystem);
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
  public releasePrisoner(entityId: EntityId): boolean {
    return releasePrisoner(this.releaseSurfaces, entityId);
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

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
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
  public requestAdmission(input: ClassificationInput, originTile: { readonly x: number; readonly y: number }): AdmitPrisonerOutcome {
    if (!this.intakeSystem.hasAccommodationTarget()) return { kind: 'refused', reason: 'no-accommodation' };
    if (!this.entityStore.canSpawn) return { kind: 'refused', reason: 'population-full' };
    return { kind: 'admitted', entityId: this.admitPrisoner(input, originTile) };
  }

  /** Allocates a new prisoner entity and submits it to intake. Accommodation, classification and action selection happen over subsequent scheduled ticks -- there is no synchronous "spawn fully processed" shortcut. Unguarded: `requestAdmission` is what a player's command reaches. */
  public admitPrisoner(input: ClassificationInput, originTile: { readonly x: number; readonly y: number }): EntityId {
    const entityId = this.entityStore.spawn();
    const index = this.entityStore.getIndex(entityId);
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
    this.bitset.add(index, PRISONER_COMPONENT_ID);
    this.position.tileX[index] = originTile.x;
    this.position.tileY[index] = originTile.y;
    this.intakeSystem.submitIntake(entityId, input);
    return entityId;
  }
}
