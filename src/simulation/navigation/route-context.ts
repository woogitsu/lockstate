import type { DoorDefinition } from './door';

/**
 * Traversal-time identity of the actor requesting a route. Permission
 * checks consume this at edge-traversal time (see `checkDoorAccess`), not
 * as a pre-filter over the graph — an actor without clearance sees the
 * door in the graph and is denied crossing it, rather than the door not
 * existing for them.
 */
export interface RouteContext {
  readonly role: string;
  readonly securityClearance: number;
  readonly permissions?: readonly string[];
  /** Bypasses `locked`, e.g. fire evacuation. Does not bypass clearance/permission requirements. */
  readonly emergencyOverride?: boolean;
}

export type DoorAccessDenialReason = 'locked' | 'insufficient-clearance' | 'missing-permission';

export type DoorAccessResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DoorAccessDenialReason };

export function checkDoorAccess(door: DoorDefinition, context: RouteContext): DoorAccessResult {
  if (door.state === 'locked' && context.emergencyOverride !== true) {
    return { allowed: false, reason: 'locked' };
  }
  if (context.securityClearance < door.requiredSecurityClearance) {
    return { allowed: false, reason: 'insufficient-clearance' };
  }
  if (door.requiredPermission !== undefined && !(context.permissions ?? []).includes(door.requiredPermission)) {
    return { allowed: false, reason: 'missing-permission' };
  }
  return { allowed: true };
}

/** Closed doors cost more than already-open ones (an opening delay); locked-but-overridden doors cost the most. */
export function doorTraversalCost(door: DoorDefinition): number {
  if (door.state === 'open') return door.costMultiplier;
  if (door.state === 'closed') return door.costMultiplier * 1.5;
  return door.costMultiplier * 2; // locked, crossed only via emergencyOverride
}

/**
 * Stable string identity for a `RouteContext`'s permission-relevant fields
 * -- two actors with the same role/clearance/permissions/override are
 * interchangeable for caching and route/flow-field sharing purposes.
 * Shared by `route-cache.ts` and `flow-field.ts` so both key on identically
 * defined "same context" semantics.
 */
export function routeContextFingerprint(context: RouteContext): string {
  const permissions = [...(context.permissions ?? [])].sort().join(',');
  return `${context.role}|${context.securityClearance}|${permissions}|${context.emergencyOverride === true ? '1' : '0'}`;
}

/**
 * A copy of `context` in the one shape its fingerprint names: permissions
 * sorted and omitted when there are none, `emergencyOverride` present only
 * when it is `true`.
 *
 * Two contexts with one fingerprint are interchangeable everywhere a context
 * is read -- `checkDoorAccess` consults the clearance, the permission set and
 * the override, all three of which the fingerprint states, and nothing reads
 * `role` except the fingerprint itself. So a cache may keep this copy in place
 * of whichever of them it was handed, and a save may carry one per
 * fingerprint (ADR 0007's 2026-09-23 amendment).
 */
export function canonicalRouteContext(context: RouteContext): RouteContext {
  const permissions = [...(context.permissions ?? [])].sort();
  return {
    role: context.role,
    securityClearance: context.securityClearance,
    ...(permissions.length === 0 ? {} : { permissions }),
    ...(context.emergencyOverride === true ? { emergencyOverride: true } : {}),
  };
}
