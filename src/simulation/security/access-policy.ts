import type { ContentRegistry } from '../../content/registry';
import type { StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry } from '../../content/staff-role-catalog';
import type { PrisonerRouteContextResolver } from '../prisoners/action-system';
import type { RouteContext } from '../navigation/route-context';

/**
 * Issue #26's "staff-only, prisoner classification, escort and emergency
 * access rules" as one authoritative policy surface, instead of each
 * caller hand-rolling its own `RouteContext`. Resolvers here are drop-in
 * replacements for the seams #24/#25 already exposed for exactly this
 * purpose (`PrisonerRouteContextResolver` on `ActionSystem`/
 * `PrisonerJobWorkerAdapter`, both already parameterized) -- nothing in
 * #24/#25 needed to change.
 */

/** A staff role's clearance/permissions, straight from #23's catalog -- security policy does not fork or duplicate that data. */
export function resolveStaffRouteContext(
  staffRoleId: string,
  options?: { readonly emergencyOverride?: boolean },
  registry: ContentRegistry<StaffRoleDefinition> = defaultStaffRoleRegistry,
): RouteContext {
  const role = registry.getById(staffRoleId);
  if (role === undefined) throw new RangeError(`Unknown staff role id "${staffRoleId}".`);
  return {
    role: 'staff',
    securityClearance: role.baseSecurityClearance,
    permissions: role.permissions,
    ...(options?.emergencyOverride === true ? { emergencyOverride: true } : {}),
  };
}

/**
 * Prisoner classification access policy as explicit, versioned data --
 * formalizing what `action-system.ts`'s `DEFAULT_PRISONER_ROUTE_CONTEXT_RESOLVER`
 * hand-rolled inline for #24. A general-population prisoner holds the
 * `'general-population'` permission (matches
 * `buildCellBlockFixture`-style doors and #24's own default); a high-risk
 * prisoner holds none, relying on an *escort* (an accompanying staff
 * member's own clearance governs the route instead -- see
 * `resolveEscortedPrisonerRouteContext`) for anywhere beyond their own
 * regime-permitted blocks.
 */
export const PRISONER_CLASSIFICATION_ACCESS_POLICY: Readonly<Record<string, { readonly securityClearance: number; readonly permissions: readonly string[] }>> = {
  'general-population': { securityClearance: 0, permissions: ['general-population'] },
  'high-risk': { securityClearance: 0, permissions: [] },
};

export const resolvePrisonerRouteContext: PrisonerRouteContextResolver = (classificationGroupId) => {
  const policy = PRISONER_CLASSIFICATION_ACCESS_POLICY[classificationGroupId];
  if (policy === undefined) throw new RangeError(`No access policy defined for classification group "${classificationGroupId}".`);
  return { role: 'prisoner', securityClearance: policy.securityClearance, permissions: policy.permissions };
};

/**
 * An escorted prisoner moves under the *escorting staff member's* door
 * access rather than their own -- issue #26's "escort... access rules."
 * `role` stays `'prisoner'` (this is still a prisoner's route, relevant to
 * any future prisoner-specific logging/incident system) while clearance/
 * permissions borrow the escort's.
 */
export function resolveEscortedPrisonerRouteContext(escortStaffRoleId: string, registry: ContentRegistry<StaffRoleDefinition> = defaultStaffRoleRegistry): RouteContext {
  const escort = resolveStaffRouteContext(escortStaffRoleId, undefined, registry);
  return { role: 'prisoner', securityClearance: escort.securityClearance, permissions: escort.permissions ?? [] };
}
