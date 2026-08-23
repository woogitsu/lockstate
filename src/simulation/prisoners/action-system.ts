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
import { isActionCategoryAllowed, selectBestAction } from './utility-ai';

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

  private continuePerforming(entityId: number, index: number, tick: number): void {
    const action = DEFAULT_ACTIONS[this.currentAction.actionIndex[index]!];
    if (action === undefined) {
      this.currentAction.phase[index] = phaseIndex('idle');
      return;
    }

    applyNeedEffects(this.needs, index, action, this.schedule.intervalTicks);
    this.currentAction.needFulfilledLastTick[index] = tick;

    const elapsed = tick - this.currentAction.phaseStartedAtTick[index]!;
    if (elapsed >= action.minDurationTicks) {
      this.currentAction.phase[index] = phaseIndex('idle');
      this.coldState.setActionTarget(entityId, undefined);
      this.actionsCompleted += 1;
    }
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

    // Abstracted arrival: teleport onto the destination anchor tile. Real
    // tile-by-tile locomotion/rendering is out of scope here -- see #21's
    // docs/NAVIGATION.md and the ADR/doc note for this issue.
    this.position.tileX[index] = instance.anchorTile.x;
    this.position.tileY[index] = instance.anchorTile.y;
    this.currentAction.phase[index] = phaseIndex('performing');
    this.currentAction.phaseStartedAtTick[index] = tick;
  }

  private beginNextAction(entityId: number, index: number, tick: number): void {
    const classificationGroupId = classificationGroupIdFromIndex(this.records.classificationGroupIndex[index]!);
    const schedule = findRegimeSchedule(this.regimeSchedules, classificationGroupId);
    const block = resolveActiveRegimeBlock(schedule, tick);
    const legalActions = DEFAULT_ACTIONS.filter((action) => isActionCategoryAllowed(action, block.allowedCategories));

    const chosen = selectBestAction(this.needs, index, legalActions);
    if (chosen === undefined) {
      this.unmetDemandCycles += 1;
      return;
    }

    const target = this.resolveTargetInstance(entityId, chosen);
    if (target === undefined) {
      this.unmetDemandCycles += 1;
      return;
    }

    const currentTile: TilePosition = { x: tileCoordinate(this.position.tileX[index]!), y: tileCoordinate(this.position.tileY[index]!) };

    this.currentAction.actionIndex[index] = actionIndexOf(chosen.id);
    this.coldState.setActionTarget(entityId, target.instanceId);
    this.actionsStarted += 1;

    if (sameTile(currentTile, target.anchorTile)) {
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
  }

  private resolveTargetInstance(entityId: number, action: ActionDefinition): RoomInstance | undefined {
    if (action.target.kind === 'own-accommodation') {
      const instanceId = this.coldState.getAccommodation(entityId);
      return instanceId === undefined ? undefined : this.roomInstances.getById(instanceId);
    }
    return this.roomInstances.findAvailable(action.target.roomCatalogId, action.requiredObjectCapability);
  }
}
