import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityId } from '../entity/entity-store';
import type { NavigationSystem } from '../navigation/navigation-system';
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
  private loopsCompletedOnTime = 0;
  private loopsCompletedLate = 0;
  private loopsMissed = 0;

  public constructor(
    private readonly sectors: SecuritySectorRegistry,
    private readonly guards: GuardRoster,
    private readonly navigation: NavigationSystem,
    private readonly routeContextResolver: (staffRoleId: string) => RouteContext = (staffRoleId) => resolveStaffRouteContext(staffRoleId),
  ) {}

  public getMetrics(): PatrolMetrics {
    return { loopsCompletedOnTime: this.loopsCompletedOnTime, loopsCompletedLate: this.loopsCompletedLate, loopsMissed: this.loopsMissed };
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
    const requestId = this.guards.getPathRequestId(guardId);
    if (requestId === undefined) {
      // Restored mid-leg (see GuardRoster.loadSnapshot) -- re-request the current leg rather than assuming arrival.
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

    const currentIndex = this.guards.getPatrolWaypointIndex(guardId)!;
    this.guards.setTile(guardId, this.legTarget(sector, currentIndex));

    if (currentIndex === RETURNING_TO_POST) {
      const startedAt = this.guards.getPatrolLoopStartedAtTick(guardId) ?? tick;
      const budget = sector.expectedPatrolLoopTicks;
      if (budget !== undefined && tick - startedAt > budget) this.loopsCompletedLate += 1;
      else this.loopsCompletedOnTime += 1;
      this.beginLoop(guardId, sector, tick); // continuous patrol
      return;
    }

    const nextIndex = currentIndex + 1 < sector.patrolRoute!.length ? currentIndex + 1 : RETURNING_TO_POST;
    this.requestLeg(guardId, sector, nextIndex, tick);
  }
}
