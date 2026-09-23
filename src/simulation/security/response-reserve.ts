import type { EntityId } from '../entity/entity-store';
import { INCIDENT_SEVERITY_CEILING } from '../incidents/incident';
import type { DeploymentPhase } from './guard-roster';
import { claimableGuardIds, isPostEligibleStaffRoleId, type PostEligibilityResolver } from './post-eligibility';

/**
 * **The response and search reserve** -- the second figure the coverage read
 * model publishes beside `required`/`assigned`/`shortage`
 * ([ADR 0095](../../../docs/adr/0095-what-the-guard-requirement-is-a-requirement-for.md)
 * decision 1, accepted by the owner on 2026-09-23; `AGENTS.md` ruling 18).
 *
 * ## What it is for
 *
 * `DeploymentSystem.requiredGuardCountFor` is the number of **posts** a sector
 * asks to have filled, and it is also the posting cap: `assignUnassignedGuards`
 * fills a sector to it and stops. Incident response and contraband search both
 * claim from what posting has left over (`claimableGuardIds`,
 * `claimableSearchGuardIds`), so a prison that hires exactly its requirement
 * has every post filled and nobody to send. ADR 0095 measured that prison
 * resolving **0** incidents and dispatching **0** responders over sixteen
 * in-game days while the panel read `Covered`. Raising the requirement was
 * measured to be strictly worse at identical cost -- it posts exactly the
 * reserve the raise was meant to buy -- so the reserve is a *second* figure
 * and nothing about posting moves.
 *
 * **This module changes no simulation behaviour.** Nothing in `src/simulation`
 * outside `presentation/` calls it; it is read by `projectStaff` (the Staff
 * panel's coverage block) and `projectStatusStrip` (the `COVERAGE` chip) and
 * by nothing that decides who is posted, claimed or dispatched.
 *
 * ## Which definition, and whose choice that is
 *
 * ADR 0095 offers two definitions and **recommends the ceiling constant**:
 * `requiredResponderCount` at the highest severity the game can produce, *"a
 * number a player can plan against"*, over a risk-derived figure that drifts
 * between pulls. The owner's ruling accepted decision 1 and **named neither**,
 * so open question 1 is still open: **this module follows the ADR's
 * recommendation, and that is not a separate owner choice.** The number is
 * still issue #29's -- a retuned `respondersPerSeverityPoint` or
 * `INCIDENT_SEVERITY_CEILING` moves it, and nothing here re-authors either.
 *
 * With `DEFAULT_INCIDENT_RESPONSE_POLICY` it is `max(1, ceil(10 * 0.5))` =
 * **5**, against the 4 that sufficed in ADR 0095's measured prison and the
 * riots at severity 9 and 10 its #586 re-measurement records.
 *
 * ## Prison-wide, not per sector
 *
 * One figure for the prison rather than a field on each coverage row, which is
 * a departure from the ADR's cost list (*"a field on
 * `StaffCoverageRowViewModel` and its sum in `projectStaff`"*) taken on the
 * ADR's own open question 2: *"a reserve almost certainly should not sum --
 * two sectors do not each need their own riot squad"*. The pool it is compared
 * against belongs to no sector either -- a guard in phase `'unassigned'` has
 * no sector, and `claimableResponders` filters by role and nothing else -- so
 * a per-sector reserve would have nothing per-sector to be compared with.
 * Today every session has one sector and the two readings are one number.
 */

/** The one method of `IncidentResponseSystem` the reserve is asked of. */
export interface ResponderCountSource {
  requiredResponderCount(severity: number): number;
}

/**
 * How many free guards an incident at `INCIDENT_SEVERITY_CEILING` needs before
 * any responder is claimed for it.
 *
 * **Asked of the response system rather than recomputed**, so there is one
 * formula for "how many responders": `claimableResponders` returns nothing
 * while the claimable pool is smaller than `requiredResponderCount(severity)`,
 * and this is that same call at the top of the band.
 */
export function responseReserveGuardCount(responders: ResponderCountSource): number {
  return responders.requiredResponderCount(INCIDENT_SEVERITY_CEILING);
}

/** The slice of a staff roster the spare count reads: who, hired as what, doing what. */
export interface SpareGuardSource {
  allGuardIds(): readonly EntityId[];
  getStaffRoleId(entityId: EntityId): string;
  getDeploymentPhase(entityId: EntityId): DeploymentPhase;
}

/**
 * How many guards an incident response could claim right now: the size of
 * `claimableGuardIds`, the pool `IncidentResponseSystem.claimableResponders`
 * reads.
 *
 * **Through `claimableGuardIds` itself**, so the role filter is ADR 0053
 * decision 3's one definition rather than a second one here: a nurse standing
 * unassigned is not a spare guard, and `totals.unassigned` -- every role in
 * phase `'unassigned'` -- would count her. The pool's own input,
 * `GuardRoster.unassignedGuardIds`, is `allGuardIds()` filtered to phase
 * `'unassigned'`; the projection sources declare the roster by the narrower
 * `StaffRosterSource` shape, so that filter is spelled once here, and
 * `tests/unit/security-response-reserve.test.ts` pins it against a real
 * `GuardRoster`.
 *
 * `O(staff)`, the cost `projectStaff` already pays to map every row.
 */
export function spareGuardCount(
  roster: SpareGuardSource,
  isEligible: PostEligibilityResolver = isPostEligibleStaffRoleId,
): number {
  return claimableGuardIds(
    {
      unassignedGuardIds: () => roster.allGuardIds().filter((id) => roster.getDeploymentPhase(id) === 'unassigned'),
      getStaffRoleId: (id) => roster.getStaffRoleId(id),
    },
    isEligible,
  ).length;
}

/** The five figures the reserve rung is decided from. */
export interface ResponseReserveCounts {
  readonly required: number;
  readonly assigned: number;
  readonly shortage: number;
  readonly spare: number;
  readonly reserve: number;
}

/**
 * Whether every post is filled and fewer guards are free than the worst
 * incident needs -- the rung ADR 0095 decision 1 adds between `Covered` and
 * `Understaffed`.
 *
 * **The boundary is `spare < reserve`, not `spare === 0`.** Decision 1 names
 * the rung for its measured instance, *"every post filled, nothing spare"*,
 * and in the same section says what `Covered` must mean once it exists:
 * *"that the prison can both hold its posts and answer what happens"*. A
 * prison with two free guards against a reserve of five cannot answer a
 * severity-10 riot -- `claimableResponders` returns nothing below
 * `requiredResponderCount` -- so leaving it on `Covered` would keep exactly
 * the promise decision 1 withdraws. Its row-4 measurement is that prison:
 * `Covered`, spare 2, three incidents resolved and six lapsed.
 *
 * The two lower rungs are excluded rather than overlapped, and in
 * `describeStaffCoverage`'s own order: a prison with nobody on duty, or short
 * of its posts, is told that first, and this rung is only asked of a prison
 * whose posts are filled. A prison that asks for nobody (`required === 0`,
 * which since issue #533 is an empty one) is never on it: it holds nobody who
 * could open an incident.
 *
 * `src/ui/hud/staff-panel.ts`'s `describeStaffCoverage` decides the same rung
 * on the other side of the worker boundary, which `AGENTS.md` boundary 1
 * keeps from importing this; `tests/unit/security-response-reserve.test.ts`
 * drives both over one grid and fails the day they disagree, the pattern
 * `coverage-state.ts` set for the three-rung ladder.
 */
export function isResponseReserveShort(counts: ResponseReserveCounts): boolean {
  if (counts.required <= 0 || counts.assigned <= 0 || counts.shortage > 0) return false;
  return counts.spare < counts.reserve;
}
