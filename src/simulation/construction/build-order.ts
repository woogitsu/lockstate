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

  state: BuildOrderLifecycleState;
  progress: number;

  // Future logistics state
  materialsAllocated: BuildOrderMaterial[];
  assignedWorkerId?: string;
  failReason?: string;
}

export function createBuildOrder(
  id: string,
  definitionId: string,
  location: TilePosition,
  edge?: BuildEdge,
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
    state: 'planned',
    progress: 0,
    materialsAllocated: [],
  };
}
