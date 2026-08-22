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
