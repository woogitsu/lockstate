import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityStore } from '../entity/entity-store';
import { EntityQuery } from '../entity/query';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteContext } from '../navigation/route-context';
import { tileCoordinate, type TilePosition } from '../world/coordinates';
import { DEFAULT_ACTIONS, type ActionDefinition } from './actions';
import {
  ACTION_PHASES,
  actionIndexOf,
  classificationGroupIdFromIndex,
  type CurrentActionComponent,
  intakeStageIndex,
  type PositionComponent,
  type PrisonerColdState,
  type PrisonerRecordComponent,
} from './components';
import type { NeedsComponent } from './needs';
import { findRegimeSchedule, resolveActiveRegimeBlock, type PrisonerRegimeOverrideResolver, type RegimeSchedule } from './regime';
import type { RoomInstance, RoomInstanceRegistry } from './room-instance-registry';
import { isActionCategoryAllowed, needUrgency, rankActions, scoreAction } from './utility-ai';

function phaseIndex(phase: (typeof ACTION_PHASES)[number]): number {
  return ACTION_PHASES.indexOf(phase);
}

/**
 * One prisoner and how badly they want what they are about to ask for -- the
 * shape both reordered passes of `ActionSystem.update` sort.
 *
 * `urgency` is `needUrgency` for a prisoner still choosing and
 * `committedActionUrgency` for one already walking somewhere; the two are the
 * same `scoreAction` reading of the same needs, so the two passes cannot
 * disagree about what urgent means.
 */
interface UrgencyRanked {
  readonly entityId: number;
  /** The prisoner's live storage index, and the total order the urgency tie breaks by. */
  readonly index: number;
  readonly urgency: number;
}

/**
 * One idle prisoner's answer to "what do you want, and how badly", computed
 * before any of them is allowed to act on it.
 *
 * Every field is a pure function of that prisoner's own state, the room
 * instances and the tick -- **nothing here reads a use claim, a position or
 * another prisoner** -- which is what makes it safe to compute the whole
 * population's plans, reorder them, and only then execute them. See
 * `ActionSystem.update` for the argument in full.
 */
interface PlannedSelection extends UrgencyRanked {
  readonly classificationGroupId: string;
  /** `rankActions`' output for the active regime block: what this prisoner wants, best first. */
  readonly candidates: readonly ActionDefinition[];
}

/**
 * **Descending need urgency, ties broken by ascending entity index.** The
 * contended scan's order since issue #434, replacing bare ascending index.
 *
 * Total by construction, which is the property ADR 0029 decision 7 commitment 3
 * requires and the one a fairness rule is easiest to get wrong: two live
 * prisoners cannot share a storage index, so this never answers `0` for two
 * distinct entries. The sorted result is therefore one unique permutation of
 * the input, independent of whether the engine's `Array.prototype.sort` is
 * stable and of the order the idle list happened to be collected in. A
 * comparator that stopped at the urgency term would be neither -- it would fall
 * back to collection order, which is ascending index today and would silently
 * become something else the day the collection loop moved.
 *
 * Ascending index rather than ascending entity **id** deliberately: since #441
 * an id is `(generation, index)` and a recycled low index sorts *after* a fresh
 * high one, so id order and index order are no longer the same order.
 * `EntityQuery.execute` guarantees index order and the rest of this system
 * already runs in it, so the tie-break is the order everything else here
 * already agrees on rather than a second one.
 */
function compareByNeedUrgency(left: UrgencyRanked, right: UrgencyRanked): number {
  return right.urgency - left.urgency || left.index - right.index;
}

export interface ActionMetrics {
  /** Reconsideration cycles where no legal action had a reachable, available target -- observable unmet demand. */
  readonly unmetDemandCycles: number;
  readonly actionsStarted: number;
  readonly actionsCompleted: number;
  readonly routeFailures: number;
}

/** Maps a prisoner's classification group + risk tier to the `RouteContext` #21/#22's navigation uses to gate doors. */
export type PrisonerRouteContextResolver = (classificationGroupId: string, riskTier: number) => RouteContext;

export const DEFAULT_PRISONER_ROUTE_CONTEXT_RESOLVER: PrisonerRouteContextResolver = (classificationGroupId) => ({
  role: 'prisoner',
  securityClearance: 0,
  permissions: classificationGroupId === 'high-risk' ? [] : ['general-population'],
});

function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Applies one interval's worth of an action's need effects, and answers
 * **whether it applied any** -- which is not the same question as "did this
 * action run".
 *
 * An `ActionDefinition` may legitimately declare no need effect at all:
 * `action.free-association` is the catalogue's first such entry and exists to
 * give a regime block that grants out-of-cell time something to grant, not to
 * fill a bar (`actions.ts`). `continuePerforming` stamps
 * `needFulfilledLastTick` from this answer rather than from the fact that it
 * reached the line, because that field is projected to the HUD verbatim
 * (`presentation/prisoner-projection.ts`'s `PrisonerActionViewModel`) and a
 * "need fulfilled at tick N" that no need was fulfilled at is a sentence the
 * simulation would be telling a player and not keeping.
 *
 * Written as a loop flag rather than as `Object.keys(...).length > 0` on the
 * caller's side so it costs no allocation on a path that runs once per
 * performing prisoner per reconsideration cycle, and so the answer is what the
 * loop *did* rather than what a second reading of the definition predicts.
 */
function applyNeedEffects(needs: NeedsComponent, index: number, action: ActionDefinition, ticksElapsed: number): boolean {
  let appliedAny = false;
  for (const [needId, perTick] of Object.entries(action.needEffectsPerTick) as [keyof typeof action.needEffectsPerTick, number][]) {
    needs.adjust(index, needId, perTick * ticksElapsed);
    appliedAny = true;
  }
  return appliedAny;
}

/**
 * Per-prisoner action reconsideration, at a fixed multi-rate cadence
 * (issue #24's "action reconsideration cadence through the multi-rate
 * scheduler") -- not every kernel tick. Owns the idle -> travelling ->
 * performing -> idle cycle, delegating all pathfinding to #21/#22's real
 * `NavigationSystem` (never a parallel/mocked routing shortcut) and all
 * candidate scoring to the pure functions in `utility-ai.ts`.
 */
export class ActionSystem implements SystemRegistration {
  public readonly id = 'prisoners.actions';
  public readonly order = 250;
  public readonly schedule = { intervalTicks: 20, phaseTicks: 0 };

  private unmetDemandCycles = 0;
  private actionsStarted = 0;
  private actionsCompleted = 0;
  private routeFailures = 0;
  private requestSequence = 0;

  public constructor(
    private readonly store: EntityStore,
    private readonly query: EntityQuery,
    private readonly records: PrisonerRecordComponent,
    private readonly needs: NeedsComponent,
    private readonly currentAction: CurrentActionComponent,
    private readonly position: PositionComponent,
    private readonly coldState: PrisonerColdState,
    private readonly roomInstances: RoomInstanceRegistry,
    private readonly navigation: NavigationSystem,
    private readonly regimeSchedules: readonly RegimeSchedule[],
    private readonly routeContextResolver: PrisonerRouteContextResolver = DEFAULT_PRISONER_ROUTE_CONTEXT_RESOLVER,
    /**
     * What an incident is imposing on this prisoner's day in place of their
     * timetable, asked once per idle prisoner per reconsideration cycle
     * ([ADR 0057](../../../docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md)).
     *
     * **`regimeSchedules` above stays `readonly` and still has no setter**, and
     * this is why one was not added. A setter makes the live array mutable
     * state that no snapshot carries, so a save taken mid-riot would come back
     * on the base timetable with the incident still open; it overrides by
     * classification group, which is not the set the incident record names; and
     * it needs every close path to remember to write it back. Resolving at the
     * point of use has none of those properties, and the array a session was
     * constructed with is still the only timetable it holds.
     *
     * Defaults to naming no override, which is what a fixture with no incident
     * pipeline wants: `PrisonerOperationsRuntime` can be stood up alone, and
     * every prisoner then runs their classification group's schedule exactly as
     * before.
     */
    private readonly regimeOverride: PrisonerRegimeOverrideResolver = () => undefined,
  ) {}

  public getMetrics(): ActionMetrics {
    return {
      unmetDemandCycles: this.unmetDemandCycles,
      actionsStarted: this.actionsStarted,
      actionsCompleted: this.actionsCompleted,
      routeFailures: this.routeFailures,
    };
  }

  /**
   * One reconsideration cycle over the whole population, in **three passes**:
   * everybody mid-action first, then the arrivals **ordered by need urgency**,
   * then the idle selections **ordered by need urgency** --
   * [ADR 0062](../../../docs/adr/0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md),
   * issue #434, taking
   * [ADR 0041](../../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
   * decision 2, which is the fairness half of
   * [ADR 0029](../../../docs/adr/0029-concurrent-room-use-claims.md) decision 5.
   * The argument for the key, the rejected alternatives and the costs are
   * there; what follows is why the code is shaped the way it is.
   *
   * ## What was wrong with one pass in ascending index
   *
   * A room's concurrent-use claims are taken *during* this walk and each one is
   * visible to the next prisoner in it, so the walk's order **is** the
   * contention rule -- ADR 0029 decision 5 says exactly that and accepts it.
   * Ascending entity index never changes, and the winners' needs are refilled
   * while the losers' are not, so the losing set never reopens. ADR 0029 calls
   * that incumbency.
   *
   * Measured on `origin/main` at `c00b641`, 24 prisoners in one furnished
   * dormitory with a two-head shower room, 40,000 ticks: the two highest-index
   * prisoners finished at hygiene **0.0**, six finished there, and the spread
   * over the population tracked nothing but scan position. `action.shower` has
   * no `own-accommodation` sibling and gets none by design
   * ([ADR 0054](../../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
   * decision 1), so unlike a meal a lost shower is a need that simply goes
   * unserved. `tests/integration/contended-shower-fairness.test.ts` is the run.
   *
   * ## Both gates, because ADR 0029 decision 2 put the claim at the far end
   *
   * Contention is resolved at **two** points and reordering only one of them
   * fixes nothing. The selection gate is `findAvailableForUse`, which is *an
   * answer and not a reservation* -- it can tell six prisoners the same
   * two-seat shower room is free. The arrival gate is `claimUse` in
   * `continueTravelling`, and that is where a room reached by walking is
   * actually won or lost. Measured: ordering the idle selections alone left the
   * two highest-index prisoners on 0 showers in 40,000 ticks, unchanged,
   * because they were being refused on arrival rather than at selection.
   *
   * **Pass 1 -- `performing`, ascending entity index.** Order irrelevant and
   * therefore left alone: a performer either continues or *releases* its claim,
   * and running all of them first means every seat freed this cycle is free
   * before anybody competes for it.
   *
   * **Pass 2 -- `travelling`, by descending urgency of the action they walked
   * for.** Two prisoners arriving at the last free shower head in the same
   * cycle are settled by which of them is dirtier, not by which was admitted
   * first. Arrivals run before selections so a prisoner who has already walked
   * to a room is not pre-empted by one who decided to go a moment ago.
   *
   * **Pass 3 -- the idle, by descending `needUrgency`.** The set is exactly the
   * prisoners whose phase was `idle` when pass 1 reached them, which is the same
   * set the single-pass loop used to call `beginNextAction` for: a prisoner
   * dropped to `idle` *by* an earlier pass waits for the next cycle exactly as
   * they always did.
   *
   * ## Why planning happens before the sort, and why that is safe
   *
   * `planIdleSelection` computes the regime block, the legal candidates and the
   * ranked walk for one prisoner. It is a pure function of that prisoner's own
   * needs, their classification group, any incident override and the tick --
   * **no part of it reads a room's claims or another prisoner** -- so computing
   * it for everybody before executing anybody cannot change what it answers.
   * `resolveTargetInstance`, the one step that does look at claims, stays in
   * pass 3's execution half where the claims taken by earlier prisoners are
   * visible to later ones, exactly as before. The same holds of pass 2's key,
   * which is scored off the action the prisoner is already committed to.
   *
   * ## Determinism
   *
   * ADR 0029 decision 7's four commitments hold, and the third is the one this
   * touches. No RNG is drawn and no stream moves; no `Map` or `Set` is walked;
   * both urgency keys are pure functions of `NeedsComponent` (which the save
   * carries verbatim in stored units), the classification group, the incident
   * override, the room instances and the tick. The comparator is **total** --
   * entity index is unique among live prisoners, so it never answers `0` for two
   * distinct entries and the result therefore does not depend on
   * `Array.prototype.sort` being stable, on the engine's sort algorithm, or on
   * the order either list happened to be collected in. Ascending entity index is
   * the same total order derived from state that `EntityQuery.execute` already
   * guarantees and that ADR 0029 decision 7 commitment 3 already names.
   */
  public update(context: SimulationContext): void {
    const arriving: UrgencyRanked[] = [];
    const idle: PlannedSelection[] = [];

    for (const entityId of this.query.execute()) {
      const index = this.store.getIndex(entityId);
      if (this.records.intakeStage[index] !== intakeStageIndex('completed')) continue;

      const phase = ACTION_PHASES[this.currentAction.phase[index]!]!;

      if (phase === 'performing') {
        this.continuePerforming(entityId, index, context.tick);
        continue;
      }

      if (phase === 'travelling') {
        arriving.push({ entityId, index, urgency: this.committedActionUrgency(index) });
        continue;
      }

      idle.push(this.planIdleSelection(entityId, index, context.tick));
    }

    arriving.sort(compareByNeedUrgency);
    for (const arrival of arriving) this.continueTravelling(arrival.entityId, arrival.index, context.tick);

    idle.sort(compareByNeedUrgency);
    for (const plan of idle) this.beginNextAction(plan, context.tick);
  }

  /**
   * How badly a traveller wants the action they are already walking to perform
   * -- pass 2's ordering key.
   *
   * `needUrgency`'s counterpart for a prisoner who has already chosen: there is
   * no candidate list to walk, because the choice was made in an earlier cycle
   * and is recorded in `actionIndex`. Scored with the same `scoreAction` the
   * selection half uses, so the two halves of the scan cannot disagree about
   * what "urgent" means. An unreadable action index scores `0` and therefore
   * sorts last, which is the same treatment `continueTravelling` gives it two
   * lines later when it drops the prisoner back to `idle`.
   */
  private committedActionUrgency(index: number): number {
    const action = DEFAULT_ACTIONS[this.currentAction.actionIndex[index]!];
    return action === undefined ? 0 : scoreAction(this.needs, index, action);
  }

  /**
   * Re-takes the concurrent-use claim of every prisoner a restored snapshot
   * left mid-performance in a `room-catalog-id` room.
   *
   * **A restore is the one path where the claim has to be rebuilt rather than
   * carried**, and the reason it is rebuilt rather than saved is ADR 0028
   * decision 6's, one system over: a use claim is a pure function of two values
   * the save already holds -- `CurrentActionComponent.phase` and the cold
   * state's `currentActionTargetInstanceId` -- so persisting it would put a
   * derived value in the payload that can disagree with the state that produced
   * it. Deriving it makes `snapshot() -> restore()` land on the same claim set
   * by construction, adds no save-schema key, and moves no save version.
   *
   * Both failure directions are closed:
   *
   * - **Leak.** `RoomInstanceRegistry.loadSnapshot` clears every use claim, so
   *   a claim held by the registry before the restore cannot survive it. Any
   *   claim standing afterwards was rebuilt from a prisoner who is genuinely
   *   still performing.
   * - **Duplicate.** The rebuild is idempotent -- claims are keyed by entity id
   *   and the scan visits each live index once -- so restoring the same
   *   snapshot twice into the same registry produces the same count, not
   *   double.
   *
   * Deterministic: `EntityQuery.execute` is ascending index order, so the
   * rebuild is a total order derived from state. It uses `reinstateUseClaim`
   * rather than `claimUse`, because reproducing a claim that was already
   * granted is not a grant and has no ceiling to check; see that method for why
   * silently dropping the excess would be the worse of the two errors.
   *
   * `travelling` needs no equivalent and must not have one: the caller has
   * already dropped those prisoners back to `idle` (their path request died
   * with the previous `NavigationSystem`), and a traveller holds no claim in a
   * live session either.
   */
  public reinstateUseClaims(): void {
    const performingPhase = phaseIndex('performing');
    for (const entityId of this.query.execute()) {
      const index = this.store.getIndex(entityId);
      if (this.currentAction.phase[index] !== performingPhase) continue;

      const action = DEFAULT_ACTIONS[this.currentAction.actionIndex[index]!];
      if (action === undefined || action.target.kind !== 'room-catalog-id') continue;

      const targetInstanceId = this.coldState.getActionTarget(entityId);
      if (targetInstanceId === undefined) continue;
      // The capability comes from the action the prisoner is still performing,
      // so a rebuilt claim consumes the same seat the live one did (issue
      // #326). Reading it from the action rather than persisting it is what
      // keeps use claims out of the save format.
      this.roomInstances.reinstateUseClaim(targetInstanceId, entityId, action.requiredObjectCapability);
    }
  }

  private continuePerforming(entityId: number, index: number, tick: number): void {
    const action = DEFAULT_ACTIONS[this.currentAction.actionIndex[index]!];
    if (action === undefined) {
      // An unreadable action index is the one exit from `performing` that is
      // not a completion, and it has to release too: the claim was taken
      // against an action this method can no longer identify, and leaving it
      // held would cost the room a seat for the rest of the session.
      this.releaseUseClaim(entityId);
      this.currentAction.phase[index] = phaseIndex('idle');
      this.coldState.setActionTarget(entityId, undefined);
      return;
    }

    // A claimed instance that has stopped existing. Unreachable through
    // `unzone`, which refuses on `claimCountOf` before it can unregister an
    // instance anybody is using -- and defended anyway, because "the claim
    // outlived the room" is the shape of leak that would otherwise be silent,
    // and the first path that removes an instance without asking would
    // introduce it without touching this file.
    if (action.target.kind === 'room-catalog-id') {
      const targetInstanceId = this.coldState.getActionTarget(entityId);
      if (targetInstanceId === undefined || this.roomInstances.getById(targetInstanceId) === undefined) {
        this.releaseUseClaim(entityId);
        this.currentAction.phase[index] = phaseIndex('idle');
        this.coldState.setActionTarget(entityId, undefined);
        this.unmetDemandCycles += 1;
        return;
      }
    }

    if (applyNeedEffects(this.needs, index, action, this.schedule.intervalTicks)) {
      this.currentAction.needFulfilledLastTick[index] = tick;
    }

    const elapsed = tick - this.currentAction.phaseStartedAtTick[index]!;
    if (elapsed >= action.minDurationTicks) {
      // Released before the target is cleared, because the release needs the
      // instance id the target holds. ADR 0029 settles ADR 0028's own open
      // question 7 here: the claim ends when the *action* ends, not when the
      // actor leaves the tile, because an abstracted arrival gives this model
      // no departure event to hang the other answer on.
      this.releaseUseClaim(entityId);
      this.currentAction.phase[index] = phaseIndex('idle');
      this.coldState.setActionTarget(entityId, undefined);
      this.actionsCompleted += 1;
    }
  }

  /**
   * Releases whatever concurrent-use claim this prisoner holds on the instance
   * its action currently targets. **Every exit from `performing` calls it, and
   * that is the whole leak argument**: one release site per exit, asked
   * unconditionally, so no path can be the one that forgot.
   *
   * Deliberately *not* gated on the action's `target.kind`. Gating would make
   * the release read as the exact mirror of the claim, and would also make the
   * one case where the action index cannot be read -- the case that most needs
   * a release -- the case that skips it. `releaseUse` is total instead: an
   * unknown instance, an entity holding no claim, and a second release are all
   * no-ops, so asking about an id that never took one costs a map lookup and
   * cannot be wrong. An `own-accommodation` target is exactly that case.
   */
  private releaseUseClaim(entityId: number): void {
    const targetInstanceId = this.coldState.getActionTarget(entityId);
    if (targetInstanceId !== undefined) this.roomInstances.releaseUse(targetInstanceId, entityId);
  }

  /**
   * ## The three exits, and why two of them count an unmet cycle and one does not
   *
   * Every exit back to `idle` clears `currentActionTargetInstanceId`, and that
   * is not tidiness: a target left standing outlives the journey it belonged
   * to. `projectPrisonerDetail` publishes it as `targetRoomInstanceId`
   * (`presentation/prisoner-projection.ts`) whatever the phase, and
   * `beginNextAction` overwrites it only when some candidate resolves -- so a
   * prisoner who is idle *and* finds nothing to do keeps publishing the target
   * of a walk that already failed, indefinitely.
   *
   * The counting follows `continuePerforming`'s convention rather than a new
   * one, because the two methods answer the same two questions:
   *
   * - **A target that has stopped existing** counts an unmet cycle. The
   *   prisoner wanted a room, the room is gone, and that is exactly what
   *   `unmetDemandCycles` is documented to count ("no legal action had a
   *   reachable, available target"). `continuePerforming` counts it for the
   *   same reason.
   * - **Bookkeeping that cannot be read back** does not. A traveller with no
   *   path request demanded nothing this cycle that anything refused; it is the
   *   mirror of `continuePerforming`'s unreadable action index, which also
   *   releases, resets and does not count.
   *
   * **Only the middle exit is reachable in play, and it was measured rather
   * than reasoned about.** `RoomZoningService.unzone` refuses on
   * `claimCountOf > 0`, and by ADR 0029 decision 2 a traveller holds no claim,
   * so a player may un-zone a canteen a prisoner is walking to. Driven through
   * the real commands: the prisoner is `travelling` to `room.canteen:8:8` at
   * tick 2,021 with `claimCountOf` 0, `UnzoneRoom` is accepted with no refusal,
   * and twenty ticks later this method finds the instance gone. The first exit
   * has no such path -- `beginNextAction` writes the request in the same
   * statement run that writes the phase, and `PrisonerOperationsRuntime.loadSnapshot`
   * drops every restored traveller to `idle` and clears both -- so it is
   * defence in depth, and `tests/integration/unzoned-target-mid-journey.test.ts`
   * covers the one that is not.
   */
  private continueTravelling(entityId: number, index: number, tick: number): void {
    const requestId = this.coldState.getPathRequestId(entityId);
    if (requestId === undefined) {
      this.currentAction.phase[index] = phaseIndex('idle');
      this.coldState.setActionTarget(entityId, undefined);
      return;
    }

    const outcome = this.navigation.getResult(requestId);
    if (outcome === undefined) return; // still queued/deferred in the navigation system; retried next cycle

    this.navigation.clearResult(requestId);
    this.coldState.setPathRequestId(entityId, undefined);

    if (!outcome.result.ok) {
      this.routeFailures += 1;
      this.unmetDemandCycles += 1;
      this.currentAction.phase[index] = phaseIndex('idle');
      this.coldState.setActionTarget(entityId, undefined);
      return;
    }

    const targetInstanceId = this.coldState.getActionTarget(entityId);
    const instance = targetInstanceId === undefined ? undefined : this.roomInstances.getById(targetInstanceId);
    if (instance === undefined) {
      this.currentAction.phase[index] = phaseIndex('idle');
      this.coldState.setActionTarget(entityId, undefined);
      this.unmetDemandCycles += 1;
      return;
    }

    // The seat is claimed **before** the arrival is applied, so a prisoner who
    // is refused never enters the room: they keep the tile they were standing
    // on and go back to idle, and the next reconsideration cycle re-selects.
    // Between selecting this instance and arriving here the room genuinely can
    // have filled up -- `findAvailableForUse` answers a question and holds
    // nothing -- and this is the point that makes the ceiling true rather than
    // advisory.
    const action = DEFAULT_ACTIONS[this.currentAction.actionIndex[index]!];
    if (action === undefined || !this.claimUseIfNeeded(entityId, action, instance.instanceId)) {
      this.currentAction.phase[index] = phaseIndex('idle');
      this.coldState.setActionTarget(entityId, undefined);
      this.unmetDemandCycles += 1;
      return;
    }

    // Abstracted arrival: teleport onto the destination anchor tile. Real
    // tile-by-tile locomotion/rendering is out of scope here -- see #21's
    // docs/NAVIGATION.md and the ADR/doc note for this issue.
    this.position.tileX[index] = instance.anchorTile.x;
    this.position.tileY[index] = instance.anchorTile.y;
    this.currentAction.phase[index] = phaseIndex('performing');
    this.currentAction.phaseStartedAtTick[index] = tick;
  }

  /**
   * Takes the concurrent-use claim for an action about to start in `instanceId`,
   * or answers `false` when the room is already at the ceiling for the
   * capability this action consumes.
   *
   * `true` for an `own-accommodation` action without claiming anything, which
   * is the asymmetry ADR 0028's §*Context* measured and this method preserves
   * deliberately: that branch resolves by id and re-checks neither gate, so a
   * prisoner who holds a cell keeps sleeping, eating in cell and using the
   * toilet whatever else is happening. Bounding a prisoner's own cell by its
   * concurrent-use capacity would make the first bed buy one need instead of
   * three, which is a product change and not a leak fix.
   *
   * Takes the action and the instance id as arguments rather than reading them
   * back out of component storage, so a caller can ask *before* it has written
   * anything about the action it is starting -- which is what lets a refusal
   * leave no trace.
   */
  private claimUseIfNeeded(entityId: number, action: ActionDefinition, instanceId: string): boolean {
    if (action.target.kind !== 'room-catalog-id') return true;
    // The same capability `resolveTargetInstance` selected against, handed over
    // rather than re-derived, so the seat claimed here is the seat the room was
    // asked for (issue #326). An action naming none claims an unbounded place:
    // `room.yard` requires no object and so has nothing to run out of.
    return this.roomInstances.claimUse(instanceId, entityId, action.requiredObjectCapability);
  }

  /**
   * What one idle prisoner *wants* this cycle, and how badly -- the half of the
   * old `beginNextAction` that reads nothing but the prisoner.
   *
   * Split out for issue #434, so that the whole idle population can be planned,
   * reordered by `compareByNeedUrgency` and only then executed. Everything it
   * touches is that prisoner's own state plus the tick, so the split changes no
   * answer: the block comes from a gapless schedule, the candidates from
   * `DEFAULT_ACTIONS` filtered by that block, and the ranking from
   * `rankActions`' total order over needs. `resolveTargetInstance` -- the one
   * step that looks at a room and at the claims other prisoners have taken --
   * stays in `beginNextAction` below, which is what keeps a claim visible to
   * everybody scanned after the prisoner who took it.
   */
  private planIdleSelection(entityId: number, index: number, tick: number): PlannedSelection {
    const classificationGroupId = classificationGroupIdFromIndex(this.records.classificationGroupIndex[index]!);
    // The override, where one stands, *replaces* the timetable rather than
    // narrowing it -- see `PrisonerRegimeOverrideResolver` for why an
    // intersection would be the wrong shape. Everything downstream of this line
    // is unchanged: the block is still resolved from a gapless schedule, the
    // candidates are still `DEFAULT_ACTIONS` filtered by the block, and the
    // walk is still ADR 0041's.
    const schedule = this.regimeOverride(entityId, classificationGroupId) ?? findRegimeSchedule(this.regimeSchedules, classificationGroupId);
    const block = resolveActiveRegimeBlock(schedule, tick);
    const legalActions = DEFAULT_ACTIONS.filter((action) => isActionCategoryAllowed(action, block.allowedCategories));
    const candidates = rankActions(this.needs, index, legalActions);
    const urgency = needUrgency(this.needs, index, candidates, (action) => this.prisonProvides(entityId, action));
    return { entityId, index, classificationGroupId, candidates, urgency };
  }

  /**
   * Picks and starts one action for a prisoner who is idle, **falling back to
   * the next-best legal candidate when the best one has nowhere to go** --
   * [ADR 0041](../../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
   * decision 1.
   *
   * This method used to take `selectBestAction`'s single answer and return when
   * its target failed to resolve, which made every lower-ranked candidate
   * unreachable in that cycle -- and, since nothing about the prisoner's state
   * changed in the meantime, unreachable in the next cycle too, for the same
   * reason. `action.eat-meal` scores strictly above `action.eat-in-cell` on the
   * same need in the same `meal` category, so a prison with no canteen chose the
   * canteen meal for ever and **fed nobody at all**: measured at 0 performing
   * ticks of `action.eat-in-cell` and hunger pinned at the floor, in a cell-only
   * prison at 1, 4 and 24 prisoners
   * (`tests/integration/cell-only-meal-fallback.test.ts` records the run).
   *
   * The walk is the whole of *that* change. Nothing new is stored, no RNG is
   * drawn, and the four determinism commitments of ADR 0029 decision 7 hold as
   * they stood: the candidate order is `rankActions`' total order over state,
   * and a candidate that fails to resolve or is refused a seat has written
   * nothing when the next one is tried -- which is why the claim is still
   * settled before the action index, the target and `actionsStarted`.
   *
   * **This paragraph also said "the population's iteration order is untouched",
   * and since issue #434 and ADR 0062 that is no longer true.** It was exactly true of ADR
   * 0041: the fallback changed what one prisoner does, not who is asked first.
   * The order is now descending need urgency with an ascending-entity-index
   * tie-break, `ActionSystem.update` carries the argument, and the sentence is
   * marked rather than deleted because what it was claiming -- that ADR 0041
   * bought its fix without touching ADR 0020's territory -- is still a true
   * statement about ADR 0041.
   *
   * **The walk is unbounded, and that is decided rather than merely
   * unimplemented.** ADR 0041 open question 1 asked *"should a fallback be
   * bounded?"*, and
   * [ADR 0054](../../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
   * decision 4 answers no. An action fulfilling nothing scores exactly 0 in
   * `scoreAction` -- the floor, since no authored effect is negative -- so
   * `action.free-association` can only ever rank *last*, and the loop below
   * cannot reach it while anything better resolves. What was actually wanted was
   * a **terminal** rather than a limit: every regime block now holds one
   * candidate that resolves for any housed prisoner, so the loop ends at an
   * action instead of at the end of the list. Bounding it would reintroduce the
   * standing-still ADR 0041 removed, and would make a starved need visible only
   * as idleness -- which a player cannot read, because a well-served prisoner is
   * idle 360 ticks a day on the reconsideration cadence alone.
   *
   * `unmetDemandCycles` keeps its meaning exactly ("no legal action had a
   * reachable, available target"): it is now counted once, after every candidate
   * has been tried, rather than at the first that failed. In a prison with a
   * housed population it is therefore 0, and the one thing it still distinguishes
   * is **a prisoner with no accommodation**, who exhausts the walk because every
   * `own-accommodation` terminal resolves by an instance id they do not have.
   * ADR 0041 open question 2 asks whether it should instead count a prisoner who
   * got a *worse* action than the one they wanted; that is a different number and
   * is not decided here (#435).
   */
  private beginNextAction(plan: PlannedSelection, tick: number): void {
    const { entityId, index, classificationGroupId } = plan;
    const currentTile: TilePosition = { x: tileCoordinate(this.position.tileX[index]!), y: tileCoordinate(this.position.tileY[index]!) };

    for (const chosen of plan.candidates) {
      const target = this.resolveTargetInstance(entityId, chosen);
      if (target === undefined) continue;

      // The no-travel path into `performing` is the second of the two places a
      // claim is taken, and it is settled *before* anything is written: a refusal
      // must not leave an action index, a target or an `actionsStarted` behind for
      // an action that never began. It can only be refused when several prisoners
      // reconsider on the same tick, since `findAvailableForUse` was consulted two
      // statements ago and nothing else moves in between.
      const arrivesImmediately = sameTile(currentTile, target.anchorTile);
      if (arrivesImmediately && !this.claimUseIfNeeded(entityId, chosen, target.instanceId)) continue;

      this.currentAction.actionIndex[index] = actionIndexOf(chosen.id);
      this.coldState.setActionTarget(entityId, target.instanceId);
      this.actionsStarted += 1;

      if (arrivesImmediately) {
        this.currentAction.phase[index] = phaseIndex('performing');
        this.currentAction.phaseStartedAtTick[index] = tick;
        return;
      }

      this.requestSequence += 1;
      const requestId = `prisoner.${entityId}.${this.requestSequence}`;
      const routeContext = this.routeContextResolver(classificationGroupId, this.records.riskTier[index]!);
      this.navigation.requestRoute(requestId, currentTile, target.anchorTile, routeContext, 1, tick);
      this.coldState.setPathRequestId(entityId, requestId);
      this.currentAction.phase[index] = phaseIndex('travelling');
      this.currentAction.phaseStartedAtTick[index] = tick;
      return;
    }

    this.unmetDemandCycles += 1;
  }

  /**
   * Could this prisoner take this action **in an empty prison** -- is there
   * anywhere in this prison it could ever be performed?
   *
   * `resolveTargetInstance` without the contention, and the pair have to stay
   * that way round. This one answers `needUrgency`'s providability question and
   * therefore decides the *order* the scan runs in, so it must not read a use
   * claim: see `RoomInstanceRegistry.hasPlaceForUse` for why a key that did
   * would stop being a function of state. `resolveTargetInstance` keeps the
   * claims and runs per prisoner in the execution half, where a claim taken by
   * an earlier prisoner is supposed to be visible.
   *
   * The `own-accommodation` branch is identical to `resolveTargetInstance`'s
   * because that branch never consulted a claim in the first place: it resolves
   * by instance id, which is the asymmetry `claimUseIfNeeded` documents at
   * length.
   */
  private prisonProvides(entityId: number, action: ActionDefinition): boolean {
    if (action.target.kind === 'own-accommodation') {
      const instanceId = this.coldState.getAccommodation(entityId);
      return instanceId !== undefined && this.roomInstances.getById(instanceId) !== undefined;
    }
    return this.roomInstances.hasPlaceForUse(action.target.roomCatalogId, action.requiredObjectCapability);
  }

  private resolveTargetInstance(entityId: number, action: ActionDefinition): RoomInstance | undefined {
    if (action.target.kind === 'own-accommodation') {
      const instanceId = this.coldState.getAccommodation(entityId);
      return instanceId === undefined ? undefined : this.roomInstances.getById(instanceId);
    }
    // `findAvailableForUse`, not `findAvailableResidence`: this asks "can this
    // prisoner use this room now", which is bounded by the room's
    // concurrent-use capacity and not by how many live there (ADR 0028
    // decision 3). The `own-accommodation` branch above re-checks neither gate
    // -- it resolves by id -- which is why a prisoner who holds a cell keeps
    // sleeping, eating in cell and using the toilet whatever stands in the
    // room, and why the first bed placed buys three needs rather than one.
    return this.roomInstances.findAvailableForUse(action.target.roomCatalogId, action.requiredObjectCapability);
  }
}
