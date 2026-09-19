import { type TilePosition } from '../world/coordinates';

export type BuildOrderLifecycleState =
  | 'planned'
  | 'approved'
  | 'materials-pending'
  | 'assigned'
  | 'in-progress'
  | 'completed'
  | 'cancelled'
  | 'failed';

/**
 * Which edge of its tile a build order occupies.
 *
 * `SparseWorld` stores wall geometry on tile *edges*, and it stores only two
 * of the four per tile: `topEdge` (the boundary with the tile to the north)
 * and `leftEdge` (the boundary with the tile to the west). The other two are
 * not missing -- the south edge of `(x, y)` *is* the north edge of
 * `(x, y + 1)`, and the east edge of `(x, y)` *is* the west edge of
 * `(x + 1, y)`. One edge, one storage slot, so a wall can never be recorded
 * twice or half-erased.
 *
 * This type deliberately names only the two canonical slots rather than all
 * four compass directions. A `'south'` member would have to be normalized to
 * a different tile's `'north'` on the way into the world, which means the
 * order as stored would no longer say what was submitted, and cancelling it
 * would have to re-derive that translation. Callers that think in "south"
 * address the tile below instead; `TilePosition` already makes that
 * unambiguous.
 */
export const BUILD_EDGES = ['north', 'west'] as const;
export type BuildEdge = (typeof BUILD_EDGES)[number];

/**
 * What an order with no explicit edge means.
 *
 * The field is optional so that a save written before it existed still
 * loads: `BuildOrder` lives inside `ConstructionSnapshot`, which lives inside
 * the session snapshot, and adding a *required* field would have forced a
 * save-schema bump and a migration (see `docs/PERSISTENCE.md`). Defaulting is
 * safe rather than merely convenient, because no pre-existing save can
 * disagree with the default: before this change `finalizeConstruction` wrote
 * no geometry at all, so a restored order's edge is not reconciling against
 * anything already on the map.
 */
export const DEFAULT_BUILD_EDGE: BuildEdge = 'north';

export function isBuildEdge(value: string): value is BuildEdge {
  return (BUILD_EDGES as readonly string[]).includes(value);
}

/** The edge an order occupies, applying `DEFAULT_BUILD_EDGE` to an order that carries none. */
export function resolveBuildEdge(order: { readonly edge?: BuildEdge }): BuildEdge {
  return order.edge ?? DEFAULT_BUILD_EDGE;
}

/**
 * Every reason `ConstructionSystem.submitOrder` can fail an order with.
 *
 * It was `string` until #261, which is what let a refusal be produced and
 * consumed by nobody: a value nothing can enumerate cannot be mapped onto a
 * player-facing vocabulary without a fallback, and a fallback is how a new
 * refusal reaches the screen as the wrong sentence. Declared as a closed
 * union, `src/simulation/refusals/refusal-log.ts` maps it through an
 * exhaustive `Record` and a seventh member added here fails to compile until
 * somebody decides what the player is told.
 *
 * `'unbuildable'` is the value `submitOrder` writes when `canBuildAt` refuses
 * for a reason `SUBMISSION_FAIL_REASONS` does not name; three more are that
 * table's entries and one is the out-of-bounds check that runs before it.
 *
 * `'unknown-buildable'` is the odd one out among the original six and the
 * only member that is not about a *tile*: it is what `submitOrder` writes
 * when `definitionId` names no row in `BUILDABLE_REGISTRY`. It is spelled
 * exactly like `PlaceObjectRefusalReason`'s member of the same name because it
 * is the same fact about the same registry reached by a different command,
 * and it is namespaced apart from it on the wire for the reason every other
 * collision in `REFUSAL_REASONS` is. Before it existed the id was never
 * checked: the order was approved, stored, and `ConstructionSystem.update`'s
 * unconditional `getBuildableDefinition` then threw out of a scheduled system
 * update on every subsequent tick, for every order, and `snapshot()` carried
 * the offending order into the save -- so the prison could never build
 * anything again and reloading reproduced it.
 *
 * `'duplicate-order'` is the seventh (issue #514) and, like
 * `'unknown-buildable'`, not about a tile: it is what `submitOrder` writes
 * when another order it is still honouring -- see `isCancellable` --
 * already names the identical `definitionId`, tile and edge. Before it
 * existed, *Place order* pressed several times for the same wall queued one
 * order per press, each approved, each allocating and consuming its own
 * materials once the crew reached it, for a tile that can only ever hold one
 * wall -- an unrefunded loss for every press past the first, not merely
 * queue noise. It is spelled exactly like `PlaceObjectRefusalReason`'s and
 * `PurchaseRefusalReason`'s members of the same name because "a request just
 * like one already standing" is the same fact reached by three different
 * commands, and namespaced apart from both on the wire for the reason every
 * other collision in `REFUSAL_REASONS` is -- a player who pressed *Place
 * order* must not read that materials were not ordered.
 *
 * Persisted: `save-schema.ts` validates `failReason` as an optional string, so
 * a save written by an older build can carry any of these and no migration is
 * needed. It stays a `z.string()` there deliberately -- a save is data that
 * already exists, and narrowing the *reader* would turn an unrecognised
 * historical value into an unloadable prison rather than an order that reads
 * as failed. The same property is what lets a member be *added* without a
 * save bump: an order failed for it is written by a build that has the value,
 * and read back by any build at all.
 */
export const BUILD_ORDER_FAIL_REASONS = [
  'duplicate-order',
  'out-of-bounds',
  'unbuildable',
  'unbuildable-terrain',
  'unknown-buildable',
  'unowned-land',
  'water-blocked',
] as const;

export type BuildOrderFailReason = (typeof BUILD_ORDER_FAIL_REASONS)[number];

export interface BuildOrderMaterial {
  readonly itemId: string;
  readonly quantity: number;
}

export interface BuildOrder {
  readonly id: string;
  readonly definitionId: string;
  readonly location: TilePosition;
  /**
   * Which tile edge this order occupies, for buildables that are edge
   * geometry (walls). Absent means `DEFAULT_BUILD_EDGE`; absent is also what
   * every order restored from a save written before this field existed looks
   * like. Buildables that are not edge geometry ignore it.
   */
  readonly edge?: BuildEdge;

  /**
   * Where this order sits in the sequence of gestures the player made
   * ([ADR 0082](../../../docs/adr/0082-what-order-build-orders-are-carried-out-in.md),
   * #722). Smaller is earlier; `compareBuildOrderExecution` is the one place
   * that reads it.
   *
   * **It is `QueuedCommand.sequence`, stamped where the command is handled and
   * never minted here.** The kernel enforces that the value is strictly
   * increasing with no gaps and no duplicates
   * (`src/simulation/kernel/kernel.ts`, `submitCommand`), dispatches strictly
   * by `(executeAtTick, sequence)`, and persists the counter as
   * `KernelSnapshot.expectedSequence` -- which `restoreState` restores, so
   * every order placed after a load sorts after every order restored from the
   * save and no two orders can collide. That is why no new counter is
   * introduced and why the ordinal survives a round trip.
   *
   * **Optional, and absent is not a defect.** An order restored from a save
   * written before this field existed has none, and so does any order a
   * fixture or a producer creates without one. `compareBuildOrderExecution`
   * sorts such an order ahead of every stamped one and tie-breaks among them
   * by id -- which is exactly the ascending-id walk this class had before the
   * field existed, so an order book of nothing but unstamped orders behaves
   * identically to the way it did. Declared `placementSequence` in
   * `buildOrderSchema` (`src/persistence/save-schema.ts`) for the same reason
   * `edge` is declared: the schema is `.strict()`.
   */
  readonly placementSequence?: number;

  state: BuildOrderLifecycleState;
  progress: number;

  // Future logistics state
  materialsAllocated: BuildOrderMaterial[];
  assignedWorkerId?: string;
  failReason?: BuildOrderFailReason;
}

export function createBuildOrder(
  id: string,
  definitionId: string,
  location: TilePosition,
  edge?: BuildEdge,
  placementSequence?: number,
): BuildOrder {
  return {
    id,
    definitionId,
    location,
    // Spread rather than `edge: edge` so an order without one has no `edge`
    // key at all: `exactOptionalPropertyTypes` is on, and an explicit
    // `undefined` would also serialize into a snapshot as a key that is not
    // in the schema.
    ...(edge === undefined ? {} : { edge }),
    // Same spread, same three reasons, plus a fourth that is this field's own:
    // an order with an explicit `placementSequence: undefined` is *not* the
    // same value as one with no key, and `BuildOrder.placementSequence`'s
    // contract is that a missing key means "this order predates the field or
    // was made outside a command". A key holding `undefined` also reaches
    // `computeSaveChecksum` and then does not survive the JSON round trip, so
    // the reloaded payload would hash differently -- the trap
    // `ConstructionSystem.snapshot` already records for `currentTransaction`.
    ...(placementSequence === undefined ? {} : { placementSequence }),
    state: 'planned',
    progress: 0,
    materialsAllocated: [],
  };
}

/**
 * The order the crew reaches build orders in: placement order, ties by id
 * ([ADR 0082](../../../docs/adr/0082-what-order-build-orders-are-carried-out-in.md)
 * decisions 1 and 2, #722).
 *
 * **Until 2026-08-31 the sort was ascending `id` alone**, and because
 * `src/main.ts` mints `order-${crypto.randomUUID()}` that made the build
 * schedule a uniformly random permutation of the player's own gestures -- ADR
 * 0082 measured 21, 17, 14, 17 and 25 inversions out of 45 on a ten-segment
 * perimeter, against the 22.5 a random permutation predicts. The old sentence
 * is kept because four docblocks in this repository still explain themselves
 * against it: the sort *was* ascending id, and the id remains the total
 * tie-break.
 *
 * `(placementSequence ?? -1, id)`, and both halves are load-bearing:
 *
 * - **`?? -1` puts an unstamped order first.** Kernel sequences are
 *   non-negative integers (`Kernel.restoreState` refuses a snapshot whose
 *   `expectedSequence` is not one), so `-1` sorts below every real ordinal and
 *   below no other sentinel. An order book in which *nothing* is stamped --
 *   every save written before this field, and every fixture that builds orders
 *   directly -- therefore collapses to ascending id, which is what it did
 *   before.
 * - **The id is the tie-break, so the comparator is total.**
 *   `docs/DETERMINISM.md` requires that ("A tie-break must be total"), and ids
 *   are unique by construction: `ConstructionSystem.submitOrder` throws on a
 *   duplicate. Two orders sharing an ordinal cannot arise from the kernel, but
 *   they can arise from a hand-built fixture, and the answer must still not
 *   depend on `Map` insertion order.
 *
 * Exported rather than private to `ConstructionSystem` because
 * `projectBuildQueue` re-sorts the rows it publishes instead of trusting its
 * source, and a second copy of this rule is how the panel and the crew would
 * come to disagree about what is next.
 */
export function compareBuildOrderExecution(
  left: Pick<BuildOrder, 'id' | 'placementSequence'>,
  right: Pick<BuildOrder, 'id' | 'placementSequence'>,
): number {
  const leftSequence = left.placementSequence ?? -1;
  const rightSequence = right.placementSequence ?? -1;
  if (leftSequence !== rightSequence) return leftSequence - rightSequence;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
