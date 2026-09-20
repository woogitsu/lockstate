import type { ContentRegistry } from '../../content/registry';
import type { StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry, isPostEligibleStaffRole } from '../../content/staff-role-catalog';
import type { EntityId } from '../entity/entity-store';

/**
 * **Who a security duty may claim**
 * ([ADR 0053](../../../docs/adr/0053-who-may-stand-a-security-post.md),
 * closing issue #456).
 *
 * ## What this closes
 *
 * `GuardRoster` stores whatever `staffRoleId` it was hired with, and three
 * systems claim from it: `DeploymentSystem.assignUnassignedGuards` fills a
 * sector's posts, `IncidentResponseSystem.claimableResponders` mounts a
 * response to a riot, and `SearchSystem` puts a guard on contraband search
 * duty. All three drew from `GuardRoster.unassignedGuardIds()` with **no
 * filter on role at all**, so the eight authored `department` values decided
 * nothing and whoever was hired first stood the wall.
 *
 * Measured on `bb3a01e`, through the real command path, in the overcrowded
 * three-prisoner prison `tests/integration/security-default-sector.test.ts`
 * builds: five `HireStaff` commands for `administrator`, `nurse`,
 * `kitchen-staff`, `doctor` and `warden` were accepted with **zero refusals**;
 * entity 0, the administrator, was `on-post` in `security-sector.prison`; and
 * `getCoverageReport` published `required: 1, assigned: 1, shortage: 0`. Driven
 * on to 30,000 ticks, that prison had **4 riots, the first at tick 11,100, all
 * four resolved, 16 responders dispatched and nobody injured** -- a doctor, a
 * nurse and a cook containing every riot perfectly. The same prison under the
 * rule below has **6 riots, the first at tick 4,000, all six lapsed, nobody
 * dispatched and 18 injuries**, which is what an unguarded prison should look
 * like. `staffingShortfall` is `shortage / required`, so a body on the post
 * took the term to zero whoever the body was.
 *
 * ## Where the rule is, and why it is one function and not three checks
 *
 * The *policy* -- which departments are duty departments -- is authored in
 * `src/content/staff-role-catalog.ts` as `POST_ELIGIBLE_STAFF_DEPARTMENTS`,
 * because `AGENTS.md` boundary 6 puts content definitions in data modules.
 * This module is the *mechanism*, and it is a single function the three
 * claimants call in place of `unassignedGuardIds()` for exactly the reason
 * [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md) decision 3
 * gives for `requiredGuardCountFor`: one place decides, so what deployment
 * enforces, what a response claims and what `getCoverageReport` publishes
 * cannot disagree.
 *
 * `GuardRoster.unassignedGuardIds()` itself is deliberately **not** narrowed.
 * It is a store query and answers what it says -- who has no assignment -- and
 * `projectStaff`'s `totals.unassigned` is a headcount of exactly that. A prison
 * whose roster holds a nurse and no guard should read *three staff, one of them
 * unassigned, and nobody available to guard*, which is two true facts rather
 * than one silently narrowed one.
 *
 * ## Determinism
 *
 * `Array.prototype.filter` preserves order, and `unassignedGuardIds()` is
 * already ascending entity id, so the claimable pool is ascending entity id
 * too -- the ordering every one of the three claimants documents relying on.
 * No RNG, no clock, no allocation beyond the filtered array.
 *
 * ## Cost
 *
 * One registry `Map` lookup per unassigned staff member per call, on a
 * collection `docs/SECURITY.md` sizes at tens to low hundreds. It is a strictly
 * smaller pass than the `allGuardIds()` sort `unassignedGuardIds()` already
 * performs to produce its input.
 */

/** Whether a staff role id may be claimed for a security duty. Ascribed by role, so a resolver can be substituted in a test without a registry. */
export type PostEligibilityResolver = (staffRoleId: string) => boolean;

/**
 * The id-shaped form of `isPostEligibleStaffRole`.
 *
 * **An id the registry does not declare is ineligible, not an error**, and that
 * is a decision rather than a fallthrough. `resolveStaffRouteContext` throws for
 * an unknown id because it has no `RouteContext` to return; this has an answer,
 * and the safe one is *no*. The reachable case is a save written against a
 * catalogue that later dropped a role: refusing to post that staff member reads
 * to a player as an uncovered sector, which is true, where posting them would be
 * a body the game cannot describe standing on a wall.
 */
export function isPostEligibleStaffRoleId(
  staffRoleId: string,
  staffRoles: ContentRegistry<StaffRoleDefinition> = defaultStaffRoleRegistry,
): boolean {
  const role = staffRoles.getById(staffRoleId);
  return role !== undefined && isPostEligibleStaffRole(role);
}

/** The narrow slice of `GuardRoster` a claimant needs -- the pool, and what each member was hired as. */
export interface ClaimableGuardSource {
  unassignedGuardIds(): readonly EntityId[];
  getStaffRoleId(entityId: EntityId): string;
}

/**
 * The unassigned staff a security duty may actually claim, ascending entity id.
 *
 * This is what `DeploymentSystem`, `IncidentResponseSystem` and `SearchSystem`
 * call where each of them used to call `unassignedGuardIds()` directly.
 */
export function claimableGuardIds(
  source: ClaimableGuardSource,
  isEligible: PostEligibilityResolver = isPostEligibleStaffRoleId,
): readonly EntityId[] {
  return source.unassignedGuardIds().filter((entityId) => isEligible(source.getStaffRoleId(entityId)));
}

/**
 * How many claimable guards a contraband search must leave behind for incident
 * response ([issue #996](https://github.com/woogitsu/lockstate/issues/996)).
 *
 * ## What it is for
 *
 * The owner's ruling on #996 is *"osobna pula dla przeszukań ... istnienie
 * trwającego przeszukania nie może opróżnić puli odpowiadających na
 * incydenty"* -- a search draws on its own allowance, and the existence of a
 * running search may not empty the pool a riot is answered from. This number is
 * the whole of that rule: `claimableSearchGuardIds` refuses to hand a search
 * the last `INCIDENT_RESPONSE_GUARD_RESERVE` free guards, so no sweep can be
 * the reason there is nobody left to send.
 *
 * ## Why one, measured rather than chosen
 *
 * Three candidates were run through the real command path on `origin/main` at
 * `1ad2189a` and again with this constant at 0, 1 and 2 -- 24 configurations
 * each: prisons of 4 and 12 prisoners, one to six guards, seeds `0x996` and
 * `0x997`, ten in-game days apiece. `0` reproduces `main` exactly, because
 * `slice(0, length - 0)` is the whole array.
 *
 * - **`0` (today).** The free pool stands empty with a sweep as its sole cause
 *   for **466 ticks a day** in the twelve-prisoner prison at one spare guard,
 *   and **520** in the four-prisoner one -- 19% and 22% of a 2,400-tick day.
 *   At two spare guards or more it is 0, because a sector sweep claims exactly
 *   one guard (`DEFAULT_SEARCH_POLICIES`' `sector.requiredGuardCount`).
 * - **`1` (this).** That figure is **0 ticks a day in all 24 configurations**,
 *   and every other number measured is unchanged at two spare guards or more --
 *   same sweeps started and finished, same discoveries, same incidents
 *   resolved, lapsed and responders dispatched. The whole behavioural
 *   difference is at *exactly one* spare guard, where sweeps stop: 40 sweeps
 *   per ten days become 0.
 * - **`2`.** Stops sweeps at two spare guards as well (40 per ten days to 0,
 *   and at seed `0x997` four discoveries to none) and **changed no incident
 *   outcome anywhere**: every resolved/lapsed/dispatched triple was identical
 *   to `1`'s.
 *
 * So `1` is the smallest number that makes the ruling true, and the next one up
 * was measured to buy nothing. The numbers, the probe and the commands are in
 * `docs/research/2026-09-05-what-a-sweep-costs-the-response.md`.
 *
 * ## What one guard does **not** buy, stated because it is the tempting misread
 *
 * A reserved guard is not a mounted response. The cheapest incident this build
 * can open asks for **two**: `IncidentResponseSystem.requiredResponderCount` is
 * `max(1, ceil(severity * 0.5))` and `ASSAULT_SEVERITY_CEILING`'s docblock
 * (`src/simulation/incidents/flashpoint.ts`) fixes the floor -- *"A
 * threshold-grazing assault is severity 3 and asks for two guards"*. Across
 * those 24 runs every incident that opened carried severity 3 or more, so a
 * single free guard answered none of them, and this constant at 1 therefore
 * removed no lapse and added no dispatch. **It is a structural guarantee, not
 * a measured improvement**, and saying otherwise would be the "true and
 * meaningless" completion issue #457 warns about.
 *
 * What still costs something at 1, measured: with the pool at exactly two, a
 * sweep holding one of them delays a two-responder dispatch for **11 to 26
 * ticks a day**. It never turned into a lapse in any run -- the response
 * deadline is 600 ticks -- and raising this constant to 2 is the one-line
 * change that removes it, at the price the bullet above prices. **How many
 * guards a prison must hire is balance and the owner's** (`AGENTS.md`, and
 * `staff-panel.ts` says the same about the posted requirement), so the number
 * moves on their word and not on a later agent's taste.
 *
 * A constant rather than a policy field: it is derived from the incident
 * policy's arithmetic rather than authored beside it, and a second authored
 * number would be a second thing to keep in step with
 * `respondersPerSeverityPoint`. If that field moves, this derivation is what
 * has to be re-run.
 */
export const INCIDENT_RESPONSE_GUARD_RESERVE = 1;

/**
 * The unassigned staff a **contraband search** may claim, ascending entity id:
 * `claimableGuardIds` less the guards held back for incident response.
 *
 * This is the separate pool issue #996 asks for, and it is one function in this
 * module rather than a rule copied into the two search call sites for exactly
 * the reason `claimableGuardIds` is: ADR 0053's *"one place decides"*.
 * `SectorSearchDutySystem.update` gates a sweep on it and
 * `SearchSystem.assignQueuedOrders` staffs one from it, so what a duty is
 * willing to order and what the system will staff cannot disagree.
 *
 * **`IncidentResponseSystem` keeps calling `claimableGuardIds` and is not
 * narrowed by anything here.** The asymmetry is the decision: a response is
 * reactive and cannot be deferred, a sweep is scheduled and can, so the
 * deferrable duty is the one that yields. Nothing in this function can reduce
 * what a responder may claim.
 *
 * **The guarantee is about the claim, not about every later tick**, and the
 * difference is worth stating because a test that asserted the stronger form
 * would be asserting something false. A search never *takes* the last
 * `INCIDENT_RESPONSE_GUARD_RESERVE` free guards; a response claiming those
 * guards a tick later still empties the pool, which is the priority order
 * working rather than a hole in it.
 *
 * ## Determinism
 *
 * `Array.prototype.slice` from the front of an already ascending array, so the
 * result is ascending entity id and the guards a sweep picks are the same ones
 * it picked before wherever the surplus is large enough to run at all. No RNG,
 * no clock, no `Map` iteration.
 */
export function claimableSearchGuardIds(
  source: ClaimableGuardSource,
  isEligible: PostEligibilityResolver = isPostEligibleStaffRoleId,
  reserve: number = INCIDENT_RESPONSE_GUARD_RESERVE,
): readonly EntityId[] {
  const claimable = claimableGuardIds(source, isEligible);
  return claimable.slice(0, Math.max(0, claimable.length - reserve));
}
