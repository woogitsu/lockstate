import type { DoorRegistry } from './door';
import { checkDoorAccess, doorTraversalCost, type RouteContext } from './route-context';

/**
 * What a search concluded about one door, for one `RouteContext`. Those two
 * facts -- may this actor cross it, and what does crossing cost -- are the
 * whole of how a door reaches a route: `region-dijkstra.ts` reads nothing else
 * off a `DoorDefinition`, and neither does `local-search.ts`.
 */
export interface DoorDependency {
  /** `DoorRegistry.getAccessVersion` at capture time: an unchanged version is proof the verdict below still holds, with no re-evaluation. */
  readonly accessVersion: number;
  readonly allowed: boolean;
  /** Traversal cost at capture time. Never compared when `allowed` is false -- a refused door's cost cannot reach a route. */
  readonly traversalCost: number;
}

/**
 * The doors one cached answer depends on, with what the search concluded about
 * each.
 *
 * `accessRevision` is the registry-wide counter, checked first so that the
 * common case -- no door anywhere has changed since -- costs one integer
 * comparison however many doors the answer depended on.
 */
export interface DoorDependencies {
  readonly accessRevision: number;
  readonly perDoor: ReadonlyMap<string, DoorDependency>;
}

function verdict(doors: DoorRegistry, doorId: string, context: RouteContext): DoorDependency {
  const door = doors.getById(doorId);
  if (door === undefined) {
    // An unregistered door is impassable to every search here (`isPortalAllowed`
    // requires `getById` to answer), so "not allowed" is the verdict to record
    // and it is stable: re-registering one bumps `structuralRevision`, which
    // rebuilds the graph the entry is keyed against.
    return { accessVersion: doors.getAccessVersion(doorId), allowed: false, traversalCost: 0 };
  }
  const allowed = checkDoorAccess(door, context).allowed;
  return {
    accessVersion: doors.getAccessVersion(doorId),
    allowed,
    traversalCost: allowed ? doorTraversalCost(door) : 0,
  };
}

/**
 * Captures the verdict for every door in `doorIds`.
 *
 * Ascending door id (code-unit order, never `localeCompare`) so the captured
 * map's own iteration order is a function of state rather than of the order the
 * search happened to reach the doors in -- the rule `docs/DETERMINISM.md`
 * states for anything derived from a `Set`.
 */
export function captureDoorDependencies(
  doorIds: Iterable<string>,
  doors: DoorRegistry,
  context: RouteContext,
): DoorDependencies {
  const sorted = [...doorIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const perDoor = new Map<string, DoorDependency>();
  for (const doorId of sorted) perDoor.set(doorId, verdict(doors, doorId, context));
  return { accessRevision: doors.accessRevision, perDoor };
}

/**
 * Whether every captured verdict still holds -- i.e. whether recomputing the
 * answer from scratch would reach the same conclusion about every door it
 * depended on.
 *
 * This is deliberately finer than "has any recorded door's access version
 * moved". A door that was refused and is *still* refused cannot change a route
 * however its state moved (a `locked` door this actor lacks the clearance for
 * becoming `closed` is still a wall to it), and evicting on that would throw
 * away the targeted invalidation the whole dependency set exists to keep
 * narrow. What is compared is the pair a search actually consumes.
 */
export function doorDependenciesStillHold(
  dependencies: DoorDependencies,
  doors: DoorRegistry,
  context: RouteContext,
): boolean {
  if (dependencies.accessRevision === doors.accessRevision) return true;
  for (const [doorId, dependency] of dependencies.perDoor) {
    if (doors.getAccessVersion(doorId) === dependency.accessVersion) continue;
    const current = verdict(doors, doorId, context);
    if (current.allowed !== dependency.allowed) return false;
    if (current.allowed && current.traversalCost !== dependency.traversalCost) return false;
  }
  return true;
}
