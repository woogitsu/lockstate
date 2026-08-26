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
import { findRegimeSchedule, resolveActiveRegimeBlock, type RegimeSchedule } from './regime';
import type { RoomInstance, RoomInstanceRegistry } from './room-instance-registry';
import { isActionCategoryAllowed, rankActions } from './utility-ai';

function phaseIndex(phase: (typeof ACTION_PHASES)[number]): number {
  return ACTION_PHASES.indexOf(phase);
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

function applyNeedEffects(needs: NeedsComponent, index: number, action: ActionDefinition, ticksElapsed: number): void {
  for (const [needId, perTick] of Object.entries(action.needEffectsPerTick) as [keyof typeof action.needEffectsPerTick, number][]) {
    needs.adjust(index, needId, perTick * ticksElapsed);
  }
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
  ) {}

  public getMetrics(): ActionMetrics {
    return {
      unmetDemandCycles: this.unmetDemandCycles,
      actionsStarted: this.actionsStarted,
      actionsCompleted: this.actionsCompleted,
      routeFailures: this.routeFailures,
    };
  }

  public update(context: SimulationContext): void {
    for (const entityId of this.query.execute()) {
      const index = this.store.getIndex(entityId);
      if (this.records.intakeStage[index] !== intakeStageIndex('completed')) continue;

      const phase = ACTION_PHASES[this.currentAction.phase[index]!]!;

      if (phase === 'performing') {
        this.continuePerforming(entityId, index, context.tick);
        continue;
      }

      if (phase === 'travelling') {
        this.continueTravelling(entityId, index, context.tick);
        continue;
      }

      this.beginNextAction(entityId, index, context.tick);
    }
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

    applyNeedEffects(this.needs, index, action, this.schedule.intervalTicks);
    this.currentAction.needFulfilledLastTick[index] = tick;

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

  private continueTravelling(entityId: number, index: number, tick: number): void {
    const requestId = this.coldState.getPathRequestId(entityId);
    if (requestId === undefined) {
      this.currentAction.phase[index] = phaseIndex('idle');
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
   * The walk is the whole of the change. Nothing new is stored, no RNG is drawn,
   * the population's iteration order is untouched, and the four determinism
   * commitments of ADR 0029 decision 7 hold as they stood: the candidate order is
   * `rankActions`' total order over state, and a candidate that fails to resolve
   * or is refused a seat has written nothing when the next one is tried -- which
   * is why the claim is still settled before the action index, the target and
   * `actionsStarted`.
   *
   * `unmetDemandCycles` keeps its meaning exactly ("no legal action had a
   * reachable, available target"): it is now counted once, after every candidate
   * has been tried, rather than at the first that failed. ADR 0041 open question
   * 2 asks whether it should instead count a prisoner who got a *worse* action
   * than the one they wanted; that is a different number and is not decided here.
   */
  private beginNextAction(entityId: number, index: number, tick: number): void {
    const classificationGroupId = classificationGroupIdFromIndex(this.records.classificationGroupIndex[index]!);
    const schedule = findRegimeSchedule(this.regimeSchedules, classificationGroupId);
    const block = resolveActiveRegimeBlock(schedule, tick);
    const legalActions = DEFAULT_ACTIONS.filter((action) => isActionCategoryAllowed(action, block.allowedCategories));
    const currentTile: TilePosition = { x: tileCoordinate(this.position.tileX[index]!), y: tileCoordinate(this.position.tileY[index]!) };

    for (const chosen of rankActions(this.needs, index, legalActions)) {
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
