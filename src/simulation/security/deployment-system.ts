import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteContext } from '../navigation/route-context';
import { routeWaypoints } from '../navigation/route';
import type { TilePosition } from '../world/coordinates';
import { resolveStaffRouteContext } from './access-policy';
import { isAtPost } from './deployment-phase';
import { resolveRequiredGuardCount, type DeploymentSchedule } from './deployment-schedule';
import { claimableGuardIds, isPostEligibleStaffRoleId } from './post-eligibility';
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

  /**
   * The sectors whose **most recent** deployment route request failed, and
   * which have had no successful one since ([ADR 0117](../../../docs/adr/0117-what-happens-when-a-guards-post-is-walled-in.md),
   * accepted 2026-09-17, option 3).
   *
   * **Not `deploymentFailures` above, and that is the whole reason this field
   * exists.** That counter is a lifetime total which never decreases, so it
   * can say *this prison has failed to post a guard* and can never say
   * *currently* -- ADR 0117 §3 rules it out by name for exactly that. This
   * set is a level: `continueDeploymentTravel` adds a sector when its route
   * request comes back `ok: false`, and every path on which a route to the
   * post turns out to exist removes it again -- the successful branch of the
   * same method, `onArrivedAtPost`, and `beginDeployment`'s
   * already-standing-there fast path. **The successful branch is the earliest
   * of those three and is the one that matters**: a resolved route is a way
   * to the post, so the level drops when the route exists rather than when
   * the walk ends, which was measured at 74 ticks later on seed `0x396`. So it goes back to
   * false when the player takes the wall down, which is the property the
   * condition's sentence rests on.
   *
   * **Not snapshotted, deliberately**, exactly as `requestSequence` is not.
   * A restored session starts with it empty and re-establishes the truth on
   * its first deployment cadence -- one `intervalTicks: 10` pair, i.e. within
   * 20 ticks of the load -- because the world geometry that decides it is
   * itself in the save. Persisting it would put a derived fact in the payload
   * and give a stale save authority over a world it no longer describes.
   * `getSnapshot` below is unchanged and `SAVE_SCHEMA_VERSION` does not move.
   *
   * **Read by key only, never iterated**, so `docs/DETERMINISM.md`'s rule
   * about `Map`/`Set` iteration order is not engaged: `hasUnreachablePost`
   * walks `SecuritySectorRegistry.all()` -- which is sorted -- and asks this
   * set about each id in turn.
   *
   * ## The one stale window, stated rather than left to be found
   *
   * A sector whose last request failed keeps the flag while no request is
   * made at all -- the prison has dismissed every post-eligible guard, say.
   * `hasUnreachablePost` cannot report a condition in that state because it
   * also requires a claimable guard, so nothing is said. But a player who
   * dismisses every guard, takes the wall down, and then hires again would
   * have the condition read true for at most one deployment cadence before
   * the first successful route clears it. The alternative -- clearing the
   * flag whenever a guard is claimed -- was measured and rejected: assignment
   * happens one cadence *before* the failure it causes is read, so the flag
   * would flicker in exactly the 100-ticks-on / 100-ticks-off pattern ADR
   * 0117 §1b measures for `shortage`, which is the defect this condition
   * exists to stop reproducing.
   */
  private readonly sectorsWithFailedRoute = new Set<string>();

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

  /**
   * Whether some sector of this prison currently has a post **nothing can
   * route to**, with guards on the roster that would take it
   * ([ADR 0117](../../../docs/adr/0117-what-happens-when-a-guards-post-is-walled-in.md),
   * accepted by the owner on 2026-09-17).
   *
   * The producer of `PrisonCondition`'s `'security.post-unreachable'` member,
   * read once per status-strip publication by
   * `computeStandingPrisonConditions`. It is a **read**: nothing here assigns,
   * routes, steps or mutates, which is what lets the projection stay the pure
   * function `tests/determinism/status-counts-publication.test.ts` treats it
   * as.
   *
   * ## The four conjuncts, and why each one is load-bearing
   *
   * ADR 0117 §3 names the shape and leaves the predicate to the
   * implementation; these are the four it asked for, with what each one keeps
   * out.
   *
   * 1. **The sector asks for at least one guard.** A sector requiring nobody
   *    has no post to fail to man, and `resolveOccupancyScaledGuardCount`
   *    answers `0` for an empty prison (issue #533's exemption), so this is
   *    also what keeps the condition off a prison with no prisoners in it.
   * 2. **Its last deployment route failed and nothing has succeeded since**
   *    -- `sectorsWithFailedRoute`. This is the conjunct that says
   *    *currently*, and the one that goes back to false when the player takes
   *    the wall down.
   * 3. **No guard of the sector is standing on the post.** Without it the
   *    condition could stand beside a manned post in a prison whose *second*
   *    guard could not be routed, and the sentence it prints ("nobody is on
   *    duty") would be false.
   * 4. **The roster holds at least one post-eligible guard.** A prison that
   *    has hired nobody has an unmanned post too, and its true story is "hire
   *    a guard", not "nothing can reach the post".
   *
   *    **It is the whole roster and deliberately not `claimableGuardIds`,
   *    and that is a measurement rather than a preference.** Written with
   *    `claimableGuardIds` -- the list `assignUnassignedGuards` draws from,
   *    which holds only *unassigned* guards -- this predicate answered `true`
   *    on exactly **100 of 200 consecutive ticks** on seed `0x396` with the
   *    post sealed, because the one guard is assigned on one deployment
   *    cadence and unassigned again on the next. That is the same
   *    ten-tick alternation ADR 0117 §1b measures for `shortage` and for the
   *    strip's coverage counts, reproduced inside the condition written to
   *    stop it: the chip would have read *"Post cut off"* and *"Covered"* in
   *    turn. Counting hired post-eligible guards instead holds it at **200 of
   *    200**, because a hire is a fact about the roster rather than about
   *    where the deployment cadence happens to be.
   *
   * ## What it deliberately does not read
   *
   * `deploymentFailures`. It is a lifetime counter that never decreases, so
   * a prison that recovered would carry the condition for the rest of the
   * session; ADR 0117 §3 rules it out by name and `sectorsWithFailedRoute`'s
   * own comment records the same thing from the other side.
   *
   * ## Cost
   *
   * `O(sectors x guards)` with one `Set.has` per sector, on the
   * 500 ms status-counts cadence, against a registry that holds exactly one
   * sector in any startable session (ADR 0110). No route is requested and no
   * search is run: the answer is state this system already holds.
   */
  public hasUnreachablePost(tick: number): boolean {
    for (const sector of this.sectors.all()) {
      if (this.requiredGuardCountFor(sector.id, tick) <= 0) continue;
      if (!this.sectorsWithFailedRoute.has(sector.id)) continue;
      if (this.hasGuardOnPost(sector.id)) continue;
      if (!this.hasPostEligibleGuard()) continue;
      return true;
    }
    return false;
  }

  /**
   * Whether the roster holds anybody who could take a post at all -- hired,
   * whatever the deployment cadence has done with them this tick.
   *
   * `isPostEligibleStaffRoleId` is the same eligibility rule
   * `claimableGuardIds` applies (ADR 0053's *"one place decides"*); what
   * differs is that this does not also require the guard to be unassigned,
   * which is what makes the answer steady rather than alternating. See
   * `hasUnreachablePost`'s conjunct 4 for the measurement.
   */
  private hasPostEligibleGuard(): boolean {
    for (const guardId of this.guards.allGuardIds()) {
      if (isPostEligibleStaffRoleId(this.guards.getStaffRoleId(guardId))) return true;
    }
    return false;
  }

  private hasGuardOnPost(sectorId: string): boolean {
    for (const guardId of this.guards.allGuardIds()) {
      if (this.guards.getSectorId(guardId) === sectorId && this.guards.getDeploymentPhase(guardId) === 'on-post') return true;
    }
    return false;
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
      // Standing on it already, so nothing has to be routed to reach it --
      // `onArrivedAtPost`'s clause one line of code away, for the path that
      // never enters the navigation queue at all.
      this.sectorsWithFailedRoute.delete(sectorId);
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

    // Read before either branch, because `unassign` below clears it and both
    // branches are statements about this guard's sector (ADR 0117).
    const sectorId = this.guards.getSectorId(guardId);

    if (!outcome.result.ok) {
      this.deploymentFailures += 1;
      // ADR 0117 §4's truth condition (b) -- "no guard can reach it is true
      // exactly when the route request fails, which is the branch at
      // `deployment-system.ts`" -- and this is that branch.
      if (sectorId !== undefined) this.sectorsWithFailedRoute.add(sectorId);
      this.guards.unassign(guardId); // retryable next assignment cycle, not a permanent loss of coverage
      return;
    }

    // **The moment "no guard can reach it" stops being true is here, not at
    // the far end of the walk.** A resolved route *is* a way to the post, so
    // the flag goes down as soon as one exists; clearing it only in
    // `onArrivedAtPost` left the condition standing for the whole walk --
    // measured at **74 ticks** on seed `0x396` after one of the four sealing
    // edges came down -- during which the chip would have printed "No guard
    // can reach the post" over a guard visibly walking to it.
    if (sectorId !== undefined) this.sectorsWithFailedRoute.delete(sectorId);

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
    // A guard standing on the post is the refutation of "no guard can reach
    // it", so the flag goes down here rather than only where a route resolves:
    // this is the one place every arrival passes through, whatever route
    // length or reload brought the guard to it.
    const arrivedSectorId = this.guards.getSectorId(guardId);
    if (arrivedSectorId !== undefined) this.sectorsWithFailedRoute.delete(arrivedSectorId);
    this.guards.setDeploymentPhase(guardId, 'on-post');
  }
}
