import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteContext } from '../navigation/route-context';
import { routeWaypoints } from '../navigation/route';
import type { TilePosition } from '../world/coordinates';
import { resolveStaffRouteContext } from './access-policy';
import { isAtPost } from './deployment-phase';
import { resolveRequiredGuardCount, type DeploymentSchedule } from './deployment-schedule';
import { claimableGuardIds } from './post-eligibility';
import { resolveOccupancyScaledGuardCount, sectorOccupantCountIsComplete, type SectorOccupantCountResolver } from './sector-staffing';
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
    /**
     * How many prisoners each sector currently holds, so a requirement can
     * scale with the population it is guarding
     * (`src/simulation/security/sector-staffing.ts`,
     * [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
     * decision 3).
     *
     * **Optional, and absent means "the schedule is the whole requirement"** --
     * which is what every unit fixture in `tests/unit/security-*.test.ts`
     * wants, and what this system did for every caller before ADR 0048. A
     * session supplies it; a test measuring deployment against a hand-authored
     * schedule does not have to.
     */
    private readonly resolveOccupantCount?: SectorOccupantCountResolver,
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

  /**
   * The one place a sector's requirement is decided, which is why the
   * occupancy scaling is applied here rather than by rewriting the schedule:
   * `assignUnassignedGuards` and `getCoverageReport` both come through it, so
   * what is enforced and what is reported cannot disagree.
   */
  private requiredGuardCountFor(sectorId: string, tick: number): number {
    const schedule = findSchedule(this.schedules, sectorId);
    if (schedule === undefined) return 0;
    const scheduled = resolveRequiredGuardCount(schedule, tick);
    if (this.resolveOccupantCount === undefined) return scheduled;
    /*
     * The third argument is issue #533's empty-sector exemption, and it is
     * passed rather than assumed: `resolveSectorOccupants` counts the whole
     * prison for the derived sector and only the post tile for any other, so
     * `0` means "empty" for the first and "nobody is standing on one tile" for
     * the second. `sectorOccupantCountIsComplete` is where that is decided.
     */
    return resolveOccupancyScaledGuardCount(
      scheduled,
      this.resolveOccupantCount(sectorId),
      sectorOccupantCountIsComplete(sectorId),
    );
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
      const phase = this.guards.getDeploymentPhase(guardId);
      if (phase === 'on-post') {
        this.walkBackToPost(guardId, context.tick);
        continue;
      }
      if (phase !== 'travelling') continue;
      if (this.guards.getPatrolWaypointIndex(guardId) !== undefined) continue; // owned by PatrolSystem
      this.continueDeploymentTravel(guardId, context.tick);
    }
  }

  /**
   * A guard that holds a post it is not standing on is sent back to it
   * (owner's ruling 24 of 2026-08-31).
   *
   * **The state this exists for is a reload.** `GuardRoster.loadSnapshot`
   * settles a guard who was `'travelling'` at save time on `'on-post'` --
   * its path request named the previous `NavigationSystem` instance's queue
   * and nothing would ever resolve it -- and leaves its tile wherever the
   * walk had got to. Before this, in a sector with no patrol route, that
   * guard stood there for the rest of the session: `assignUnassignedGuards`
   * only draws from `'unassigned'` guards and the loop above only continues
   * `'travelling'` ones, so nothing in `src/` moved it and nothing ever
   * would. **Since ADR 0036 that is every session a player can start**, the
   * derived sector having no route by decision.
   *
   * So this is a behaviour change and not only a label change, and it is the
   * half that makes the label honest: `src/simulation/presentation/`'s
   * `'returning'` is a word about a walk, and without this there would be no
   * walk for it to be about -- the row would say `Returning` for ever, which
   * is a different lie from the one being fixed.
   *
   * **A sector with a patrol route is left alone**, exactly as
   * `PatrolSystem.update` requires: it treats an `'on-post'` guard with no
   * waypoint index as "idle, start the loop" and re-paths from wherever the
   * guard actually stands, deliberately (see the missed-leg comment in
   * `patrol-system.ts`). Two systems both re-homing one guard would be the
   * ownership collision `guard-roster.ts`'s header is careful about; this
   * takes the case that system declines.
   */
  private walkBackToPost(guardId: EntityId, tick: number): void {
    const sectorId = this.guards.getSectorId(guardId);
    if (sectorId === undefined) return;
    const sector = this.sectors.getDefinition(sectorId);
    if (sector === undefined) return; // a sector the session no longer registers is not this system's to invent
    if (sector.patrolRoute !== undefined && sector.patrolRoute.length > 0) return; // PatrolSystem's guard
    if (isAtPost(this.guards.getTile(guardId), sector.postTile)) return;
    this.beginDeployment(guardId, sectorId, sector.postTile, tick);
  }

  private assignUnassignedGuards(tick: number): void {
    for (const sector of this.sectors.all()) {
      const required = this.requiredGuardCountFor(sector.id, tick);
      let shortage = required - this.assignedGuardCountFor(sector.id);
      if (shortage <= 0) continue;

      /*
       * `claimableGuardIds`, not `unassignedGuardIds()`: a sector post is a
       * security duty and only a post-eligible role may hold one (ADR 0053).
       * Before it, the first hire of any of the eight roles was posted and
       * `getCoverageReport` then read `shortage: 0` -- so an administrator on
       * the wall took `staffingShortfall` to zero and the sector stopped
       * being able to reach `hotThreshold` at all.
       */
      for (const guardId of claimableGuardIds(this.guards)) {
        if (shortage <= 0) break;
        this.beginDeployment(guardId, sector.id, sector.postTile, tick);
        shortage -= 1;
      }
    }
  }

  private beginDeployment(guardId: EntityId, sectorId: string, postTile: TilePosition, tick: number): void {
    this.guards.assignToSector(guardId, sectorId);
    const currentTile = this.guards.getTile(guardId);

    if (isAtPost(currentTile, postTile)) {
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
    // Between two tiles. `GuardLocomotionSystem` moves them every tick; this
    // system reconsiders every ten, so most visits to a travelling guard stop
    // here -- the change ADR 0088 makes, mirroring ADR 0059's for prisoners.
    if (this.guards.locomotion.isWalking(guardId)) return;

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

    /*
     * The route is walked rather than applied in one step (ADR 0088,
     * answering ADR 0059 open question 4 the way ADR 0059 itself answered it
     * for prisoners). A one-waypoint route -- the guard was already standing
     * on the post -- arrives immediately, matching `beginDeployment`'s own
     * `isAtPost` fast path exactly.
     */
    if (this.guards.locomotion.beginWalk(guardId, routeWaypoints(outcome.result.route))) {
      this.onArrivedAtPost(guardId);
    }
  }

  /**
   * Called when a guard's walk to its post finishes -- immediately, for a
   * route with no distance in it, or by `GuardLocomotionSystem` on the tick a
   * longer one ends (`createGuardLocomotionSystem` in `guard-locomotion.ts`
   * is what dispatches an arrival here rather than to `PatrolSystem`).
   *
   * Public for that wiring alone, the same reason `ActionSystem.routeContextFor`
   * is public: it is called from outside this class's own `update`, on a
   * different cadence than this system runs on.
   */
  public onArrivedAtPost(guardId: EntityId): void {
    this.guards.setDeploymentPhase(guardId, 'on-post');
  }
}
