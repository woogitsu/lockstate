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

/**
 * A version no door ever has: `DoorRegistry` starts every version and its
 * registry-wide revision at 0 and only ever adds to them. A restored cache
 * entry whose dependency had *already* moved on when the save was taken gets
 * this, so the fast path can never mistake it for unchanged -- see
 * `rebaseDoorDependencies`.
 */
export const NO_DOOR_VERSION = -1;

/**
 * One dependency as a save carries it (ADR 0007's 2026-09-23 amendment): the
 * door, whether its version was still the one captured when the save was
 * taken, and -- only when it was not -- the verdict the answer was computed
 * under.
 *
 * The version itself is not carried because a restore does not reproduce the
 * counters: it re-registers every door and re-applies each sector's control
 * state, so the restored versions are not the saved ones. What the version is
 * *for* is carried instead.
 */
export interface DoorDependencySnapshot {
  readonly doorId: string;
  /** `DoorRegistry.getAccessVersion` still equalled the captured version when the save was taken. */
  readonly unchanged: boolean;
  /** The verdict captured -- carried only when `unchanged` is false, since an unchanged door's verdict is today's. */
  readonly verdict?: { readonly allowed: boolean; readonly traversalCost: number };
}

export interface DoorDependenciesSnapshot {
  /** `DoorRegistry.accessRevision` still equalled the captured revision when the save was taken. */
  readonly revisionUnchanged: boolean;
  /** Ascending door id, which is the order `captureDoorDependencies` holds them in. */
  readonly doors: readonly DoorDependencySnapshot[];
}

/**
 * What a save carries of `dependencies`, read against the registry as it stands
 * at the save.
 */
export function snapshotDoorDependencies(dependencies: DoorDependencies, doors: DoorRegistry): DoorDependenciesSnapshot {
  const snapshot: DoorDependencySnapshot[] = [];
  for (const [doorId, dependency] of dependencies.perDoor) {
    const unchanged = doors.getAccessVersion(doorId) === dependency.accessVersion;
    snapshot.push(
      unchanged
        ? { doorId, unchanged }
        : { doorId, unchanged, verdict: { allowed: dependency.allowed, traversalCost: dependency.allowed ? dependency.traversalCost : 0 } },
    );
  }
  return { revisionUnchanged: dependencies.accessRevision === doors.accessRevision, doors: snapshot };
}

/**
 * The inverse of `snapshotDoorDependencies`, against the **restored** registry,
 * called after the restore's last door mutation.
 *
 * ## Why this reproduces every later comparison exactly
 *
 * `doorDependenciesStillHold` asks two things of a version: is the registry's
 * revision still the captured one (then nothing changed anywhere), and is each
 * door's version still the captured one (then that door's verdict still
 * holds). In the continuous session both answers are "yes" from the capture
 * until the next change and "no" for ever after, because both counters only
 * rise. So what the answer depends on from the save onwards is only whether it
 * was still "yes" at the save -- which is what the snapshot carries. Rebasing a
 * "yes" onto the restored counter's current value, and a "no" onto
 * `NO_DOOR_VERSION`, gives the restored session the same answer on every later
 * tick, because the two sessions then apply the same changes.
 *
 * ## Why an unchanged dependency's verdict is re-derived rather than carried
 *
 * It is the inference the fast path in `doorDependenciesStillHold` already
 * makes: an unchanged version is taken as proof the verdict still holds, and
 * the verdict is not compared. A restored door is the door that was saved, so
 * its verdict for this entry's `context` is the one captured. Carrying it would
 * be a second copy of a fact the door already states.
 *
 * Throws `RangeError` on a snapshot that lists a door twice or out of order, or
 * that says a dependency changed and carries no verdict, or the reverse.
 */
export function rebaseDoorDependencies(
  snapshot: DoorDependenciesSnapshot,
  doors: DoorRegistry,
  context: RouteContext,
): DoorDependencies {
  const perDoor = new Map<string, DoorDependency>();
  let previous: string | undefined;
  for (const dependency of snapshot.doors) {
    if (previous !== undefined && !(previous < dependency.doorId)) {
      throw new RangeError(`Door dependencies are not in ascending id order at "${dependency.doorId}".`);
    }
    previous = dependency.doorId;
    if (dependency.unchanged) {
      if (dependency.verdict !== undefined) throw new RangeError(`Unchanged door dependency "${dependency.doorId}" carries a verdict.`);
      perDoor.set(dependency.doorId, verdict(doors, dependency.doorId, context));
    } else {
      if (dependency.verdict === undefined) throw new RangeError(`Changed door dependency "${dependency.doorId}" carries no verdict.`);
      const { allowed, traversalCost } = dependency.verdict;
      if (!Number.isFinite(traversalCost) || traversalCost < 0) throw new RangeError(`Door dependency "${dependency.doorId}" has an invalid cost.`);
      perDoor.set(dependency.doorId, { accessVersion: NO_DOOR_VERSION, allowed, traversalCost: allowed ? traversalCost : 0 });
    }
  }
  if (snapshot.revisionUnchanged && [...perDoor.values()].some((dependency) => dependency.accessVersion === NO_DOOR_VERSION)) {
    throw new RangeError('Door dependencies say nothing changed anywhere and that a door changed.');
  }
  return { accessRevision: snapshot.revisionUnchanged ? doors.accessRevision : NO_DOOR_VERSION, perDoor };
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
