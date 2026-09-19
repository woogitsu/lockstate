import type { EntityId } from '../entity/entity-store';
import type { DeploymentPhase } from './guard-roster';

/**
 * What was holding a guard, named rather than inferred by the caller.
 *
 * A closed union so the read model behind the surface and the outcome the
 * command answers with speak the same vocabulary, and so a *fourth* claimant
 * cannot be added without somebody deciding what a player is told about it.
 *
 * - `'incident-response'` -- an `IncidentResponseSystem` response record names
 *   this guard.
 * - `'search'` -- an active `SearchSystem` job names it.
 * - `'deployment'` -- it has a sector, from `GuardRoster.assignToSector`, and is
 *   `'travelling'` there or `'on-post'` (possibly mid-patrol-leg, which is the
 *   same claim: `PatrolSystem` moves a guard *within* a deployment rather than
 *   claiming it separately).
 * - `'unattributed'` -- `'on-search'`, and **nothing live names it**. This is the
 *   residue [ADR 0033](../../../docs/adr/0033-releasing-an-interrupted-incident-response-at-runtime.md)
 *   is about: a save taken during a response records the claim and not the
 *   attribution. It is a real kind rather than a bug, because between the load
 *   and this system's first scheduled update such a guard genuinely exists, and
 *   a player looking at the roster in that window is entitled to an answer.
 */
export const GUARD_CLAIM_KINDS = ['deployment', 'incident-response', 'search', 'unattributed'] as const;
export type GuardClaimKind = (typeof GUARD_CLAIM_KINDS)[number];

/**
 * Why a release was refused.
 *
 * **A named union rather than a boolean**, and that is a repository rule rather
 * than a preference: `tests/unit/simulation-refusals.test.ts` requires every wire
 * reason to come from an exhaustive `Record` over a closed union, so a `boolean`
 * return could not be reported to the player at all. `ProcurementSystem.cancel`
 * gained `PurchaseCancelRefusalReason` for exactly this reason in #285, and this
 * union is that precedent applied at the point where it was established.
 *
 * - `'unknown-guard'` -- the roster holds no such entity. Not reachable from the
 *   panel, which only draws rows the simulation published, but reachable from a
 *   command composed anywhere else: a queued command in a restored save, or a
 *   future producer. Mapped for that reason rather than for the panel's.
 * - `'not-held'` -- the guard is already `'unassigned'`, so there is nothing to
 *   release. **This is the reachable one**, and it is reachable without the
 *   player doing anything wrong: the list on screen is a projection on a cadence,
 *   so a response can close or a search can finish between the publication and
 *   the press. Silence there would be a control that appeared to free a guard and
 *   did not -- the same failure `cancel-purchase.not-pending` exists to prevent
 *   on the one control whose whole subject is money coming back.
 *
 * A bare type union with no runtime tuple beside it, following
 * `ZoneRoomRefusalReason` rather than `BUILD_ORDER_FAIL_REASONS`: nothing
 * iterates these at runtime -- `RELEASE_GUARD_REFUSAL_REASONS` in
 * `src/simulation/refusals/refusal-log.ts` is a `Record` over the union and
 * `tsc` checks its exhaustiveness -- so a tuple would be a second declaration
 * to keep in step for no reader.
 */
export type GuardReleaseRefusalReason = 'not-held' | 'unknown-guard';

/**
 * What a release answers with.
 *
 * `releasedFrom` is carried on the accepted form because it is the one fact the
 * caller cannot recompute: by the time `release` returns, the guard is
 * `'unassigned'` and what used to hold it is gone. Nothing reads it today beyond
 * the tests, and it is here rather than added later because an outcome type that
 * says only "yes" is a boolean with extra syntax.
 */
export type GuardReleaseOutcome =
  | { readonly kind: 'released'; readonly releasedFrom: GuardClaimKind }
  | { readonly kind: 'refused'; readonly reason: GuardReleaseRefusalReason };

/** An active search job's claim, read live. `SearchSystem` satisfies this. */
export interface SearchClaimSource {
  claimedGuardIds(): readonly EntityId[];
  releaseGuard(guardId: EntityId): boolean;
}

/** A live response record's claim, read live. `IncidentResponseSystem` satisfies this. */
export interface IncidentResponseClaimSource {
  claimedGuardIds(): readonly EntityId[];
  releaseResponder(guardId: EntityId): boolean;
}

/** The roster reads and the one write a release performs. */
export interface GuardReleaseRosterSource {
  allGuardIds(): readonly EntityId[];
  getDeploymentPhase(entityId: EntityId): DeploymentPhase;
  /** Read *before* `unassign`, which clears it: see `release`. */
  getPathRequestId(entityId: EntityId): string | undefined;
  unassign(entityId: EntityId): void;
}

/**
 * The one thing a release has to give back to navigation.
 *
 * Narrowed to a single method for the reason `StaffDismissalSurfaces` narrows
 * its own: this service must not be able to ask navigation for a route, only
 * to hand one back. `NavigationSystem` satisfies it structurally.
 */
export interface GuardReleaseNavigationSurface {
  abandonRequest(id: string): boolean;
}

/**
 * Releases a guard from whatever is holding it
 * ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md), answering
 * [ADR 0033](./0033-releasing-an-interrupted-incident-response-at-runtime.md)
 * open question 3).
 *
 * ## Why this exists at all
 *
 * ADR 0033 measured a defect that was *terminal* rather than merely slow, and
 * said why: *"`GuardRoster.unassign`'s callers in `src/` are all unreachable for
 * an `'on-search'` guard, and no dismiss command exists."* The repair it shipped
 * is specific to one claimant and one cause -- a save taken during an incident
 * response -- and its open question 3 is the general observation: *"the absence
 * of one is what made this defect terminal rather than merely slow, and it will
 * make the next resource-claiming system's equivalent bug terminal too."*
 *
 * This is the general answer, and "general" means something precise here: **not
 * one release per claimant, but one release that knows every claimant.** A
 * command per claimant would be three commands the player has to choose between
 * while looking at one guard, and it would be four when the fourth claimant
 * arrives -- which is the shape ADR 0033's open question warns about, one level
 * up.
 *
 * ## Why it routes through the claimant instead of calling `unassign`
 *
 * Because `GuardRoster.unassign` alone is a bug, not a fix, and the bug is
 * bigger than the one it repairs. The roster holds a guard's phase and sector;
 * the *claim* lives in the claimant's own bookkeeping -- a `SearchJobRecord`'s
 * `guardIds`, a `ResponseRecord`'s `guardIds` and `arrivedGuardIds`. Unassigning
 * without telling the claimant leaves the two disagreeing, and the disagreement
 * is not benign: a search job would keep routing a guard that
 * `DeploymentSystem` had since sent to a post and would record a confiscation as
 * found by somebody standing somewhere else, and a response would keep counting
 * a guard toward `arrivedGuardIds` and would later `unassign` it out from under
 * whoever had claimed it since.
 *
 * So each claimant is asked to drop the guard first, and this service performs
 * the single `unassign` afterwards. Neither claimant touches the roster, so the
 * write happens exactly once from exactly one place.
 *
 * ## How the claim is resolved, and why in this order
 *
 * The two `'on-search'` claimants are asked *by name*, live, and only then does
 * the phase decide anything. That ordering is the point: `'on-search'` is a
 * shared phase and the roster cannot tell the two apart -- which is the whole
 * subject of ADR 0033 decision 4 -- so a resolution that read the phase first
 * would have to guess between them.
 *
 * `'unattributed'` is what is left: `'on-search'` with neither claimant naming
 * it. `releaseOrphanedClaims` would hand such a guard back on this system's next
 * scheduled update anyway, so this is not the only route out of that state --
 * but it is the only *immediate* one, and it is the state a player can actually
 * see, in the window between a load and that update.
 *
 * A `'travelling'` or `'on-post'` guard is a `'deployment'` claim and needs no
 * claimant call: `DeploymentSystem` holds no per-guard record of its own -- the
 * sector id and the phase *are* the record, both on the roster -- and it reads
 * `unassignedGuardIds()` afresh every cycle, so `unassign` is the whole of the
 * release. `PatrolSystem` is the same: it acts on an `'on-post'` guard with a
 * waypoint index, and `unassign` clears both. The honest consequence, and it is
 * stated rather than hidden: `DeploymentSystem` will re-assign a released guard
 * on its next cycle if the sector is still short, so releasing a deployed guard
 * is a *re-shuffle* rather than a dismissal. That is a real limit of this command
 * and ADR 0034 records it as one.
 *
 * ## What it deliberately is not
 *
 * **Not a dismissal.** The guard stays hired, stays on the payroll and stays in
 * the roster; what is released is the *claim*. Firing a guard is a different
 * decision (it destroys an entity, which is ADR 0026's subject) and it is not
 * this command's.
 *
 * **Not idempotent-by-silence.** A second release of the same guard is refused
 * with `'not-held'` and the player is told, rather than answered with a quiet
 * success that a race is indistinguishable from.
 *
 * Deterministic: two reads of two live claim views and one roster write, no
 * iteration whose order could decide anything, and no RNG draw.
 */
export class GuardReleaseService {
  public constructor(
    private readonly guards: GuardReleaseRosterSource,
    private readonly search: SearchClaimSource,
    private readonly response: IncidentResponseClaimSource,
    private readonly navigation: GuardReleaseNavigationSurface,
  ) {}

  /**
   * What is holding `guardId`, or `undefined` when nothing is.
   *
   * Public because the read model behind the surface needs exactly this answer
   * for every held guard, and a second implementation of the resolution rule
   * would be a second thing to keep in step with the release.
   */
  public claimOf(guardId: EntityId): GuardClaimKind | undefined {
    const phase = this.guards.getDeploymentPhase(guardId);
    if (phase === 'unassigned') return undefined;
    if (phase === 'on-search') {
      if (this.response.claimedGuardIds().includes(guardId)) return 'incident-response';
      if (this.search.claimedGuardIds().includes(guardId)) return 'search';
      return 'unattributed';
    }
    return 'deployment';
  }

  public release(guardId: EntityId): GuardReleaseOutcome {
    if (!this.guards.allGuardIds().includes(guardId)) return { kind: 'refused', reason: 'unknown-guard' };

    const claim = this.claimOf(guardId);
    if (claim === undefined) return { kind: 'refused', reason: 'not-held' };

    // The claimant drops it first; the roster write happens once, below. The
    // returned booleans are deliberately not trusted as the answer -- `claimOf`
    // already decided which claimant to ask, and asking is what keeps the two
    // records consistent whether or not the drop found anything.
    if (claim === 'incident-response') this.response.releaseResponder(guardId);
    if (claim === 'search') this.search.releaseGuard(guardId);

    /*
     * **The route the guard was walking is given back before the roster
     * forgets it.**
     *
     * `unassign` sets `pathRequestId` to `undefined`, so reading it afterwards
     * is reading nothing -- which is exactly how this leaked: a `'deployment'`
     * claim released mid-`'travelling'` dropped the id and left the request
     * with `NavigationSystem`, where a queued request is searched at full
     * budget cost and a resolved one is retained for the life of the session
     * (nothing there expires a result, and the queue's aging raises priority
     * rather than evicting). The two `'on-search'` claimants give back their
     * own ids above, because the id lives in *their* bookkeeping and not on the
     * roster; this is the roster's own.
     *
     * Unconditional rather than gated on the claim kind: a guard can hold a
     * roster `pathRequestId` under any phase that travels, and
     * `abandonRequest` is total, so asking costs one `Map` miss for a guard
     * that had none.
     */
    const pathRequestId = this.guards.getPathRequestId(guardId);
    if (pathRequestId !== undefined) this.navigation.abandonRequest(pathRequestId);

    this.guards.unassign(guardId);
    return { kind: 'released', releasedFrom: claim };
  }
}
