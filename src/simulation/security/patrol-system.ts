import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityId } from '../entity/entity-store';
import type { NavigationSystem } from '../navigation/navigation-system';
import { routeWaypoints } from '../navigation/route';
import type { RouteContext } from '../navigation/route-context';
import type { TilePosition } from '../world/coordinates';
import { resolveStaffRouteContext } from './access-policy';
import type { GuardRoster } from './guard-roster';
import type { SecuritySectorDefinition, SecuritySectorRegistry } from './sector';

export interface PatrolMetrics {
  readonly loopsCompletedOnTime: number;
  readonly loopsCompletedLate: number;
  readonly loopsMissed: number;
}

/** Sentinel `patrolWaypointIndex` meaning "the final leg back to post, after the last waypoint." */
const RETURNING_TO_POST = -1;

/**
 * Issue #26's "patrol route definitions, scheduling and completion/missed-
 * patrol metrics" -- "patrols are jobs/routes with missed/late outcomes;
 * staff do not teleport into deployment zones" (architecture notes). A
 * deployed (`'on-post'`) guard whose sector defines a `patrolRoute` walks
 * it as a continuous loop through the real `NavigationSystem`; a sector
 * with no `patrolRoute` gets static coverage only -- `DeploymentSystem`
 * alone already satisfies that guard's assignment, and `PatrolSystem`
 * leaves it alone.
 */
export class PatrolSystem implements SystemRegistration {
  public readonly id = 'security.patrol';
  public readonly order = 280;
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };

  private requestSequence = 0;

  public getPathRequestSequence(): number { return this.requestSequence; }
  public restorePathRequestSequence(sequence: number): void { this.requestSequence = sequence; }
  private loopsCompletedOnTime = 0;
  private loopsCompletedLate = 0;
  private loopsMissed = 0;

  public constructor(
    private readonly sectors: SecuritySectorRegistry,
    private readonly guards: GuardRoster,
    private readonly navigation: NavigationSystem,
    private readonly routeContextResolver: (staffRoleId: string) => RouteContext = (staffRoleId) => resolveStaffRouteContext(staffRoleId),
  ) {}

  /**
   * The counter that names this system's path requests, for the save's
   * `inFlight` section (issue #1373). It used to be excluded because *"no
   * restored state can reference an old name"*; since the navigation queue and
   * the roster's `pathRequestId` are both carried, restored state does, and a
   * counter reset to zero would mint names the saved session never minted.
   */
  public getRequestSequence(): number {
    return this.requestSequence;
  }

  public setRequestSequence(sequence: number): void {
    if (!Number.isInteger(sequence) || sequence < 0) throw new RangeError(`A path-request sequence is a non-negative integer, got ${String(sequence)}.`);
    this.requestSequence = sequence;
  }

  public getMetrics(): PatrolMetrics {
    return { loopsCompletedOnTime: this.loopsCompletedOnTime, loopsCompletedLate: this.loopsCompletedLate, loopsMissed: this.loopsMissed };
  }

  /**
   * Completion/missed-patrol counters (issue #26's stated output of this
   * system), added for the save payload in issue #70.
   *
   * Live per-guard patrol bookkeeping is deliberately absent: it lives on
   * `GuardRoster` (waypoint index, loop start tick, path request id), which
   * has its own snapshot and its own documented mid-leg reset.
   * `requestSequence` is likewise excluded — it only names path requests
   * against a `NavigationSystem` a restored session rebuilds empty, so no
   * restored state can reference an old name.
   */
  public getSnapshot(): { readonly metrics: PatrolMetrics } {
    return { metrics: this.getMetrics() };
  }

  public loadSnapshot(snapshot: { readonly metrics: PatrolMetrics }): void {
    this.loopsCompletedOnTime = snapshot.metrics.loopsCompletedOnTime;
    this.loopsCompletedLate = snapshot.metrics.loopsCompletedLate;
    this.loopsMissed = snapshot.metrics.loopsMissed;
  }

  public update(context: SimulationContext): void {
    for (const guardId of this.guards.allGuardIds()) {
      const sectorId = this.guards.getSectorId(guardId);
      if (sectorId === undefined) continue;
      const sector = this.sectors.requireDefinition(sectorId);
      if (sector.patrolRoute === undefined || sector.patrolRoute.length === 0) continue;

      const phase = this.guards.getDeploymentPhase(guardId);
      if (phase === 'on-post' && this.guards.getPatrolWaypointIndex(guardId) === undefined) {
        this.beginLoop(guardId, sector, context.tick);
      } else if (phase === 'travelling' && this.guards.getPatrolWaypointIndex(guardId) !== undefined) {
        this.continueLeg(guardId, sector, context.tick);
      }
    }
  }

  private legTarget(sector: SecuritySectorDefinition, waypointIndex: number): TilePosition {
    if (waypointIndex === RETURNING_TO_POST) return sector.postTile;
    const target = sector.patrolRoute![waypointIndex];
    if (target === undefined) throw new RangeError(`Sector "${sector.id}" patrol route has no waypoint at index ${waypointIndex}.`);
    return target;
  }

  private requestLeg(guardId: EntityId, sector: SecuritySectorDefinition, waypointIndex: number, tick: number): void {
    const currentTile = this.guards.getTile(guardId);
    const targetTile = this.legTarget(sector, waypointIndex);
    this.guards.setPatrolWaypointIndex(guardId, waypointIndex);
    this.guards.setDeploymentPhase(guardId, 'travelling');

    this.requestSequence += 1;
    const requestId = `security.patrol.${guardId}.${this.requestSequence}`;
    const routeContext = this.routeContextResolver(this.guards.getStaffRoleId(guardId));
    this.navigation.requestRoute(requestId, currentTile, targetTile, routeContext, 1, tick);
    this.guards.setPathRequestId(guardId, requestId);
  }

  private beginLoop(guardId: EntityId, sector: SecuritySectorDefinition, tick: number): void {
    this.guards.setPatrolLoopStartedAtTick(guardId, tick);
    this.requestLeg(guardId, sector, 0, tick);
  }

  private continueLeg(guardId: EntityId, sector: SecuritySectorDefinition, tick: number): void {
    // Between two tiles. `GuardLocomotionSystem` moves them every tick; this
    // system reconsiders every ten, so most visits to a travelling guard stop
    // here -- the change ADR 0088 makes, mirroring ADR 0059's for prisoners.
    if (this.guards.locomotion.isWalking(guardId)) return;

    const requestId = this.guards.getPathRequestId(guardId);
    if (requestId === undefined) {
      // **The restore this line was written for does not reach it, and never
      // did.** The sentence here read "Restored mid-leg (see
      // GuardRoster.loadSnapshot) -- re-request the current leg rather than
      // assuming arrival," and `loadSnapshot` has cleared the waypoint index
      // and settled the phase on `'on-post'` since the same commit that added
      // both (#26), so a restored guard arrives at `update` through the
      // `beginLoop` branch above instead. It is kept as what it actually is:
      // a defensive re-request for a `'travelling'` guard that holds a
      // waypoint and no request id, rather than an assumption that a leg
      // nobody is routing has completed.
      this.requestLeg(guardId, sector, this.guards.getPatrolWaypointIndex(guardId) ?? 0, tick);
      return;
    }

    const outcome = this.navigation.getResult(requestId);
    if (outcome === undefined) return; // still queued/deferred

    this.navigation.clearResult(requestId);
    this.guards.setPathRequestId(guardId, undefined);

    if (!outcome.result.ok) {
      this.loopsMissed += 1;
      // Retryable, not a permanent loss of patrol coverage: `'on-post'` here
      // means "idle, ready for the next loop," not literally standing on
      // `postTile` -- a failed leg leaves the guard's tile wherever it last
      // successfully arrived (never moved on failure, matching #24/#25's
      // "position updates only on arrival" convention). `beginLoop`'s route
      // request always starts from the guard's *current* tile, so the next
      // scheduled tick correctly re-paths from there, not from an assumed post.
      this.guards.setPatrolWaypointIndex(guardId, undefined);
      this.guards.setDeploymentPhase(guardId, 'on-post');
      return;
    }

    /*
     * The route is walked rather than applied in one step (ADR 0088). A
     * one-waypoint leg -- the guard was already standing on this waypoint,
     * which `legTarget` can name for the post itself on the final leg --
     * arrives immediately.
     */
    if (this.guards.locomotion.beginWalk(guardId, routeWaypoints(outcome.result.route))) {
      this.onArrivedAtLegTarget(guardId, tick);
    }
  }

  /**
   * Called when a walk toward the current leg's target tile finishes --
   * immediately, for a leg with no distance in it, or by
   * `GuardLocomotionSystem` on the tick a longer one ends
   * (`createGuardLocomotionSystem` in `guard-locomotion.ts` is what dispatches
   * an arrival here rather than to `DeploymentSystem`).
   *
   * Re-derives the sector and the current waypoint index rather than taking
   * them as parameters, because the caller is `GuardLocomotionSystem` and
   * holds neither -- it dispatches by nothing but the fact that this guard
   * has a `patrolWaypointIndex`, exactly as `update` above already does.
   *
   * Public for that wiring alone, the same reason `DeploymentSystem.onArrivedAtPost`
   * is.
   */
  public onArrivedAtLegTarget(guardId: EntityId, tick: number): void {
    const sectorId = this.guards.getSectorId(guardId);
    if (sectorId === undefined) return; // released/dismissed mid-walk: nothing left to advance
    const sector = this.sectors.getDefinition(sectorId);
    if (sector === undefined || sector.patrolRoute === undefined || sector.patrolRoute.length === 0) return;
    const currentIndex = this.guards.getPatrolWaypointIndex(guardId);
    if (currentIndex === undefined) return; // not this system's walk (a deployment travel, not a patrol leg)

    if (currentIndex === RETURNING_TO_POST) {
      const startedAt = this.guards.getPatrolLoopStartedAtTick(guardId) ?? tick;
      const budget = sector.expectedPatrolLoopTicks;
      if (budget !== undefined && tick - startedAt > budget) this.loopsCompletedLate += 1;
      else this.loopsCompletedOnTime += 1;
      this.beginLoop(guardId, sector, tick); // continuous patrol
      return;
    }

    const nextIndex = currentIndex + 1 < sector.patrolRoute.length ? currentIndex + 1 : RETURNING_TO_POST;
    this.requestLeg(guardId, sector, nextIndex, tick);
  }
}
