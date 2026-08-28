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
