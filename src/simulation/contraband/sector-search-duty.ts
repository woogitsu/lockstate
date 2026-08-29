import type { EntityId } from '../entity/entity-store';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { GuardRoster } from '../security/guard-roster';
import { claimableGuardIds } from '../security/post-eligibility';
import type { SecuritySectorDefinition } from '../security/sector';
import type { SearchPolicyDefinition, SearchTarget } from './search-policy';
import type { SearchSystem } from './search-system';

/**
 * The producer `SearchSystem.submitOrder` never had
 * ([ADR 0073](../../../docs/adr/0073-who-orders-a-contraband-search.md) Part 2
 * Option A, closing issue #552).
 *
 * ## What was missing, and what this is not
 *
 * The search machinery is complete: a queue that holds an order until enough
 * guards exist, real travel through the real `NavigationSystem`, detection
 * through a pure function against a named RNG stream, confiscation records that
 * name the finder, and a snapshot that survives a restore without re-ordering
 * the draws. What it had was **no caller**: `submitOrder` was reachable from
 * nowhere in `src/`, so contraband entered the prison on admission (10% of
 * arrivals at risk tier 0, 20% at tier 1) and could never be found. The status
 * strip's **Contraband** figure is `getMetrics().itemsDiscovered`, so it was
 * structurally pinned at 0 -- a number on screen that could not move.
 *
 * This is **not** a player command. ADR 0073 weighs a targeted search control
 * (its Option B) and recommends against building it first, because its value is
 * letting a player spend guards deliberately and nobody yet knows what a search
 * costs: how long a sweep ties a guard up, how often detection succeeds at the
 * shipped concealment values, whether a prison with one guard can afford one at
 * all. Those are measurements a standing duty produces and a control needs. So
 * this ships first, and it adds no locale key, no control and no new command.
 *
 * ## The one place this corrects ADR 0073's wording
 *
 * The ADR describes Option A as *"guards on post search their own sector on a
 * cadence"*. Taken literally that is not implementable against the system it
 * feeds, and the difference is worth stating rather than quietly resolving:
 * `SearchSystem.assignQueuedOrders` staffs a job from `claimableGuardIds` --
 * the **unassigned**, post-eligible pool (ADR 0053) -- never from guards
 * already standing a post. A guard on post is not claimable, so an order given
 * to a prison whose every guard is posted would sit in the queue for ever,
 * growing the payload and moving nothing.
 *
 * So the duty is: **a sector that is actually staffed runs standing sweeps, and
 * a spare guard walks them.** Both halves are conditions below, and together
 * they are the balance coupling ADR 0073 states as a consequence -- a prison
 * that hires exactly its posted requirement never searches, and the first
 * guard hired past that requirement is what makes contraband findable. Nothing
 * here takes a guard off a wall.
 *
 * ## Determinism
 *
 * `sectors.all()` is sorted by id; `resolveOccupants` answers in ascending
 * entity id; the target window is integer arithmetic on the tick; the order id
 * is derived from the sector id and the sweep index rather than allocated
 * ([ADR 0012](../../../docs/adr/0012-derived-identifier-reproducibility.md)
 * category 2, the same shape as `contraband.intake.<entity>.<tick>`). No RNG --
 * the only draw a search makes is `SearchSystem`'s own detection check, on its
 * own named stream -- no clock, no `Map` iteration.
 *
 * ## State, and the save
 *
 * This system holds none, which is deliberate rather than lucky. Everything it
 * would otherwise have to remember -- which sweep is outstanding, which
 * prisoners the last one covered -- is read back out of `SearchSystem`'s own
 * queue and derived from the tick, both of which the payload already carries.
 * So there is **no new persisted field, no schema bump and no migration**, and
 * a restored session resumes the cadence a continuous one was on.
 */
export class SectorSearchDutySystem implements SystemRegistration {
  public readonly id = 'contraband.search-duty';
  /**
   * Between `incidents.trigger` (285) and `contraband.search` (290), so a sweep
   * ordered on a tick is staffed by `SearchSystem` on that same tick rather
   * than a cadence later -- and after `security.deployment` (270), so the
   * "is this sector staffed" and "is a guard spare" reads below see the posting
   * decisions this tick already made rather than last cadence's.
   */
  public readonly order = 288;
  public readonly schedule: { readonly intervalTicks: number; readonly phaseTicks: number };

  public constructor(
    private readonly sectors: { all(): readonly SecuritySectorDefinition[] },
    private readonly guards: GuardRoster,
    private readonly searches: Pick<SearchSystem, 'submitOrder' | 'orderIds'>,
    /** The live policy list the session holds -- read rather than copied, because `SearchSystem` reads the same array and a restore refills it in place. */
    private readonly policies: readonly SearchPolicyDefinition[],
    /** Who is in a sector, the one definition of it (`resolveSectorOccupants`, ADR 0048) -- injected for the reason `DeploymentSystem` injects its count: this module must not decide a containment rule. */
    private readonly resolveOccupants: (sector: SecuritySectorDefinition) => readonly EntityId[],
    intervalTicks: number = DEFAULT_SECTOR_SEARCH_INTERVAL_TICKS,
    private readonly maxTargetsPerSweep: number = DEFAULT_SECTOR_SWEEP_MAX_TARGETS,
  ) {
    this.schedule = { intervalTicks, phaseTicks: 0 };
  }

  public update(context: SimulationContext): void {
    const policy = this.policies.find((candidate) => candidate.scope === 'sector');
    /*
     * No `'sector'` policy: order nothing rather than throw.
     *
     * `applyDefaultSearchPolicies` runs in `createNewSimulationRuntime` and
     * again after a restore, so this is not reachable from a session a player
     * can start -- but a scenario builds its own list, and a producer whose
     * failure mode is an exception out of a scheduled system update is not a
     * producer worth having. `findPolicy` still throws for an order that names
     * a scope nobody authored; the difference is that nothing here submits one.
     */
    if (policy === undefined) return;
    const sweepIndex = Math.floor(context.tick / this.schedule.intervalTicks);

    /*
     * The claimable read below is taken *before* `contraband.search` runs, so
     * with several staffed sectors this loop can order more sweeps in one tick
     * than there are spare guards to walk them. The surplus stays queued and
     * drains as guards free up, which is `SearchSystem`'s documented
     * "observable backlog, not a failure" -- and it is bounded rather than
     * unbounded, because `hasOutstandingSweep` allows each sector exactly one.
     * Reserving against the pool here instead would put a second copy of the
     * staffing rule in this file, which is what ADR 0053 exists to prevent.
     */

    for (const sector of this.sectors.all()) {
      if (this.hasOutstandingSweep(sector.id)) continue;
      if (this.assignedGuardCount(sector.id) === 0) continue;
      if (claimableGuardIds(this.guards).length < policy.requiredGuardCount) continue;

      const targets = selectSweepTargets(this.resolveOccupants(sector), sweepIndex, this.maxTargetsPerSweep);
      if (targets.length === 0) continue;
      this.searches.submitOrder({ id: sectorSweepOrderId(sector.id, sweepIndex), scope: 'sector', targets });
    }
  }

  /**
   * Whether a sweep of this sector is already queued or running.
   *
   * One at a time per sector, and the check is a prefix scan of
   * `SearchSystem`'s own order ids rather than a remembered id, so it is
   * correct across a restore for free: the queue and the active jobs are both
   * in the payload, and a remembered id would be a second copy of that fact to
   * keep in step. It is also what makes a duplicate `submitOrder` -- which
   * throws `RangeError` -- unreachable when a restore replays a tick this
   * system has already run.
   */
  private hasOutstandingSweep(sectorId: string): boolean {
    const prefix = sectorSweepOrderIdPrefix(sectorId);
    return this.searches.orderIds().some((orderId) => orderId.startsWith(prefix));
  }

  /** Guards this sector holds, whether on post or still walking to it -- the same reading `DeploymentSystem.assignedGuardCountFor` takes of "assigned". */
  private assignedGuardCount(sectorId: string): number {
    let count = 0;
    for (const guardId of this.guards.allGuardIds()) {
      if (this.guards.getSectorId(guardId) === sectorId && this.guards.getDeploymentPhase(guardId) !== 'unassigned') count += 1;
    }
    return count;
  }
}

/**
 * How often a staffed sector orders a sweep: 600 ticks, a quarter of
 * `DAY_LENGTH_TICKS`.
 *
 * A **directional default, not a balance decision**, in the standing sense of
 * `DEFAULT_SECTOR_RISK_POLICY` and `DEFAULT_CONTRABAND_INTRODUCTION_POLICY`.
 * The reasoning, so a balance pass has something to disagree with: ADR 0073's
 * stated consequence is that a guard away searching is a guard not suppressing
 * riot pressure -- `DEFAULT_SECTOR_RISK_POLICY.staffingShortfallWeight` is 0.3,
 * and the measured gap between one guard and none in an eight-prisoner prison
 * is 0.4824 against 0.7979 on a 0.65 threshold. Four sweeps an in-game day is
 * slow enough that a spare guard is idle between them and fast enough that a
 * concealed phone at the sector policy's 0.30 per visit is found within a few
 * days rather than never. It is the number most likely to be wrong, and it is
 * the constructor argument most likely to be worth overriding.
 */
export const DEFAULT_SECTOR_SEARCH_INTERVAL_TICKS = 600;

/**
 * How many of a sector's occupants one sweep covers.
 *
 * A sweep visits its targets **in sequence**, walking to each and dwelling
 * there, so the cost of an order is linear in this number: at the sector
 * policy's 15-tick dwell plus travel, four targets is a job of the order of a
 * hundred ticks. Sweeping a whole prison in one order would tie a guard up for
 * an in-game day and make the duty an all-or-nothing commitment; four keeps a
 * sweep a spot check, which is what the sector scope's odds are tuned for.
 */
export const DEFAULT_SECTOR_SWEEP_MAX_TARGETS = 4;

/** Every sweep order id for this sector begins with this; nothing else in the tree mints an id in this shape. */
export function sectorSweepOrderIdPrefix(sectorId: string): string {
  return `contraband.sector-sweep.${sectorId}.`;
}

/** Derived, not allocated (ADR 0012 category 2): a function of the sector and the sweep index, so a restored session mints exactly what a continuous one did. */
export function sectorSweepOrderId(sectorId: string, sweepIndex: number): string {
  return `${sectorSweepOrderIdPrefix(sectorId)}${String(sweepIndex)}`;
}

/**
 * The occupants one sweep covers: a window of at most `maxTargets`, rotating by
 * a whole window each sweep.
 *
 * Pure, and exported so the rotation is testable without a kernel -- the shape
 * `resolveDetectionProbability` and `scoreSectorRisk` already use for the
 * decisions in this tier.
 *
 * **Rotating rather than always the first few** is the whole point. A window
 * pinned to the head of an ascending-entity-id list would search the prison's
 * oldest arrivals for ever and never search anybody else, so a prisoner who
 * arrived carrying something would be findable or unfindable purely by their
 * position in the roster -- which is exactly the "structurally pinned" shape
 * issue #552 is about, moved one level down. Stepping by `maxTargets` covers
 * every occupant in `ceil(population / maxTargets)` sweeps.
 */
export function selectSweepTargets(occupants: readonly EntityId[], sweepIndex: number, maxTargets: number): readonly SearchTarget[] {
  if (occupants.length === 0 || maxTargets <= 0) return [];
  const count = Math.min(maxTargets, occupants.length);
  // `((a % n) + n) % n`: a negative sweep index cannot arise from a kernel tick,
  // and the identity costs nothing next to an index that would silently read
  // `undefined` if one ever did.
  const start = (((sweepIndex * maxTargets) % occupants.length) + occupants.length) % occupants.length;
  const targets: SearchTarget[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    targets.push({ holderKind: 'prisoner', holderId: String(occupants[(start + offset) % occupants.length]!) });
  }
  return targets;
}
