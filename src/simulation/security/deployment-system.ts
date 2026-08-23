import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteContext } from '../navigation/route-context';
import type { TilePosition } from '../world/coordinates';
import { resolveStaffRouteContext } from './access-policy';
import { resolveRequiredGuardCount, type DeploymentSchedule } from './deployment-schedule';
import type { EntityId } from '../entity/entity-store';
import type { GuardRoster } from './guard-roster';
import type { SecuritySectorRegistry } from './sector';

export interface CoverageReportEntry {
  readonly sectorId: string;
  readonly required: number;
  /** Guards assigned to the sector, whether already on-post or still travelling there. */
  readonly assigned: number;
  readonly shortage: number;
}

function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function findSchedule(schedules: readonly DeploymentSchedule[], sectorId: string): DeploymentSchedule | undefined {
  return schedules.find((schedule) => schedule.sectorId === sectorId);
}

/**
 * Deterministically fills eligible sector assignments (issue #26's "guard
 * deployment fills eligible sector assignments deterministically") and
 * drives assigned guards to their post through the real `NavigationSystem`
 * -- "staff do not teleport into deployment zones" (architecture notes).
 * A sector with no `DeploymentSchedule` entry requires zero guards (no
 * fabricated demand); required headcount otherwise varies by tick via
 * `resolveRequiredGuardCount`.
 */
export class DeploymentSystem implements SystemRegistration {
  public readonly id = 'security.deployment';
  public readonly order = 270;
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };

  private requestSequence = 0;
  private deploymentFailures = 0;

  public constructor(
    private readonly sectors: SecuritySectorRegistry,
    private readonly guards: GuardRoster,
    private readonly navigation: NavigationSystem,
    private readonly schedules: readonly DeploymentSchedule[],
    private readonly routeContextResolver: (staffRoleId: string) => RouteContext = (staffRoleId) => resolveStaffRouteContext(staffRoleId),
  ) {}

  public getMetrics(): { readonly deploymentFailures: number } {
    return { deploymentFailures: this.deploymentFailures };
  }

  /**
   * The one counter this system owns, added for the save payload in issue
   * #70. Everything else it reads is state on `SecuritySectorRegistry`,
   * `GuardRoster` or the shared schedule array, each snapshotted where it
   * lives; `requestSequence` is excluded for the same reason as
   * `PatrolSystem`'s.
   */
  public getSnapshot(): { readonly metrics: { readonly deploymentFailures: number } } {
    return { metrics: this.getMetrics() };
  }

  public loadSnapshot(snapshot: { readonly metrics: { readonly deploymentFailures: number } }): void {
    this.deploymentFailures = snapshot.metrics.deploymentFailures;
  }

  /** Per-sector required/assigned/shortage at the given tick -- issue #26's "coverage/staffing metrics expose shortages without fabricating security." Deterministic: sorted by sector id. */
  public getCoverageReport(tick: number): readonly CoverageReportEntry[] {
    return this.sectors.all().map((sector) => {
      const required = this.requiredGuardCountFor(sector.id, tick);
      const assigned = this.assignedGuardCountFor(sector.id);
      return { sectorId: sector.id, required, assigned, shortage: Math.max(0, required - assigned) };
    });
  }

  private requiredGuardCountFor(sectorId: string, tick: number): number {
    const schedule = findSchedule(this.schedules, sectorId);
    return schedule === undefined ? 0 : resolveRequiredGuardCount(schedule, tick);
  }

  private assignedGuardCountFor(sectorId: string): number {
    let count = 0;
    for (const guardId of this.guards.allGuardIds()) {
      if (this.guards.getSectorId(guardId) === sectorId && this.guards.getDeploymentPhase(guardId) !== 'unassigned') count += 1;
    }
    return count;
  }

  public update(context: SimulationContext): void {
    this.assignUnassignedGuards(context.tick);
    for (const guardId of this.guards.allGuardIds()) {
      if (this.guards.getDeploymentPhase(guardId) !== 'travelling') continue;
      if (this.guards.getPatrolWaypointIndex(guardId) !== undefined) continue; // owned by PatrolSystem
      this.continueDeploymentTravel(guardId, context.tick);
    }
  }

  private assignUnassignedGuards(tick: number): void {
    for (const sector of this.sectors.all()) {
      const required = this.requiredGuardCountFor(sector.id, tick);
      let shortage = required - this.assignedGuardCountFor(sector.id);
      if (shortage <= 0) continue;

      for (const guardId of this.guards.unassignedGuardIds()) {
        if (shortage <= 0) break;
        this.beginDeployment(guardId, sector.id, sector.postTile, tick);
        shortage -= 1;
      }
    }
  }

  private beginDeployment(guardId: EntityId, sectorId: string, postTile: TilePosition, tick: number): void {
    this.guards.assignToSector(guardId, sectorId);
    const currentTile = this.guards.getTile(guardId);

    if (sameTile(currentTile, postTile)) {
      this.guards.setDeploymentPhase(guardId, 'on-post');
      return;
    }

    this.requestSequence += 1;
    const requestId = `security.deploy.${guardId}.${this.requestSequence}`;
    const routeContext = this.routeContextResolver(this.guards.getStaffRoleId(guardId));
    this.navigation.requestRoute(requestId, currentTile, postTile, routeContext, 2, tick);
    this.guards.setPathRequestId(guardId, requestId);
  }

  private continueDeploymentTravel(guardId: EntityId, tick: number): void {
    const requestId = this.guards.getPathRequestId(guardId);
    if (requestId === undefined) {
      const sectorId = this.guards.getSectorId(guardId);
      if (sectorId === undefined) {
        this.guards.unassign(guardId);
        return;
      }
      this.beginDeployment(guardId, sectorId, this.sectors.requireDefinition(sectorId).postTile, tick);
      return;
    }

    const outcome = this.navigation.getResult(requestId);
    if (outcome === undefined) return; // still queued/deferred

    this.navigation.clearResult(requestId);
    this.guards.setPathRequestId(guardId, undefined);

    if (!outcome.result.ok) {
      this.deploymentFailures += 1;
      this.guards.unassign(guardId); // retryable next assignment cycle, not a permanent loss of coverage
      return;
    }

    const sectorId = this.guards.getSectorId(guardId)!;
    const postTile = this.sectors.requireDefinition(sectorId).postTile;
    this.guards.setTile(guardId, postTile);
    this.guards.setDeploymentPhase(guardId, 'on-post');
  }
}
