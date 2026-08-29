import type { DoorDefinition, DoorRegistry } from './door';
import { resolveEdge } from './region-graph';
import { checkDoorAccess, type RouteContext } from './route-context';
import type { TilePosition } from '../world/coordinates';
import type { SparseWorld } from '../world/sparse-world';

/**
 * What stands between two orthogonally adjacent tiles, right now.
 *
 * ## Why this is one function and not three
 *
 * Three places in this repository need to know whether an edge is crossable,
 * and each applies a *different door policy* to the same physical question:
 *
 * - `buildNavigationGraph` (`region-graph.ts`) treats any door as a region
 *   boundary and records a portal, whatever its lock state.
 * - `canStep` (`local-search.ts`) crosses a door only if the portal search
 *   upstream already admitted it, so its policy is an allow-list of door ids.
 * - `isEdgeTraversable` below asks `checkDoorAccess` directly, because a
 *   walker crossing an edge *now* has a `RouteContext` and no upstream search
 *   to defer to.
 *
 * What must not differ between them is the ordering: **a registered door
 * decides the edge, whatever value the edge layer holds.** That is not a
 * convention, it is the only reason a doorway is not a wall -- a completed
 * `door-wooden` order writes `DOOR_EDGE_NUMERIC_ID` into the same edge slot a
 * `wall-brick` order writes into (`construction/definition.ts`), so a reader
 * that consulted the edge value first would find every door impassable. So the
 * ordering lives here once, and each caller supplies only its own door policy.
 *
 * ## What a `wall` answer means
 *
 * `wallValue` is carried rather than reduced to a boolean because it is the
 * numeric buildable id the edge layer stores, and a caller reporting *why* an
 * actor stopped needs it. Nothing here interprets it: any non-zero value with
 * no registered door is an impassable wall, which is the sentence
 * `definition.ts` already states about `DOOR_EDGE_NUMERIC_ID`.
 */
export type EdgeStanding =
  | { readonly kind: 'open' }
  | { readonly kind: 'wall'; readonly wallValue: number }
  | { readonly kind: 'door'; readonly door: DoorDefinition };

/**
 * What stands on the boundary between `from` and `to`.
 *
 * Throws `RangeError` for tiles that are not a single orthogonal step apart,
 * which is `resolveEdge`'s contract and deliberately not softened: every leg
 * of every route this repository can produce is one tile along one axis
 * (`region-graph.ts`'s `neighbors` offers four neighbours and
 * `LocomotionStore.beginWalk` refuses anything else), so a non-adjacent pair
 * reaching here is a defect in the caller rather than an edge to describe.
 */
export function edgeStanding(world: SparseWorld, doors: DoorRegistry, from: TilePosition, to: TilePosition): EdgeStanding {
  const edge = resolveEdge(world, from, to);
  const door = doors.getByEdge(edge.ownerTile, edge.side);
  if (door !== undefined) return { kind: 'door', door };
  if (edge.wallValue !== 0) return { kind: 'wall', wallValue: edge.wallValue };
  return { kind: 'open' };
}

/**
 * Whether this actor may cross this edge **on the tick it is being crossed**.
 *
 * This is the traversal-time half of the ADR *When a route stops being valid*: a route
 * is a plan made against the world of one tick, and nothing about calculating
 * it entitles an actor to the world of a later one. `LocomotionStore.advance`
 * asks this before it writes an actor onto the far tile, which is the only
 * place the question can be asked late enough to be about the tick that
 * matters.
 *
 * It is deliberately **not** region-aware, and that is the difference between
 * this and `canStep`. A region graph answers "are these two tiles connected",
 * which is a question about a whole prison and is recomputed lazily from a
 * geometry revision; this answers "is this one boundary standing", which is a
 * question about two chunk cells and a `Map` lookup. A walker halfway down a
 * corridor needs the second, and asking the first would make every walker's
 * step depend on a graph rebuild.
 *
 * **That ADR is `docs/adr/0077-when-a-route-stops-being-valid.md`, and every
 * citation of it in the code names it by title rather than by that number.**
 * Deliberately: the number is provisional until the branch merges, because a
 * branch nobody has merged is invisible from `docs/adr/README.md` and that
 * index is the only thing that reserves a number (`AGENTS.md`: *"A number is
 * not reserved until it appears in `docs/adr/README.md`"*). Two agents here
 * have already taken the same number by each reading "next free" off `main`,
 * and `max + 1` off disk said 0075 for this one while two higher numbers sat
 * unmerged on another branch. So the ADR pre-commits to being renumbered, and
 * citing it by title is what makes that a one-line edit instead of a hunt
 * through five modules. `grep "When a route stops being valid"` finds them
 * all: here, `navigation-system.ts`, `locomotion.ts`, `action-system.ts`,
 * `prisoner-operations-runtime.ts`, `tests/helpers/open-ground.ts` and
 * `docs/NAVIGATION.md`.
 */
export function isEdgeTraversable(
  world: SparseWorld,
  doors: DoorRegistry,
  from: TilePosition,
  to: TilePosition,
  context: RouteContext,
): boolean {
  const standing = edgeStanding(world, doors, from, to);
  if (standing.kind === 'open') return true;
  if (standing.kind === 'wall') return false;
  return checkDoorAccess(standing.door, context).allowed;
}
