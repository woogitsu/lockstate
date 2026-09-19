import { tileCoordinate, type TilePosition } from '../world/coordinates';

/**
 * Whether a zoned rectangle is walled in along its own boundary.
 *
 * ## What this answers, and what it does not
 *
 * It answers exactly one question: **is every edge on the perimeter of this
 * rectangle occupied by edge geometry?** For a rectangle that is the same
 * thing as "no walk in the four directions leaves it", because a rectangle's
 * boundary is its whole frontier -- so a `sealed` answer is a true statement
 * about the tiles inside it.
 *
 * ## What `enclosed` means, and why that settles whether this is narrow
 *
 * **This section used to call the difference below a false negative, and it is
 * now a definition.** It said: this is not a region-enclosure query, a
 * rectangle drawn strictly inside a larger sealed building with no partition
 * walls of its own is reported `open` while being topologically indoors, and
 * "the narrowness is why nothing *refuses* a room on it".
 *
 * The owner has ruled that `zone` must refuse an open room (issue #446's third
 * open question; the ADR "Must a zoned room be enclosed" is the decision). What
 * that ruling settles is not only the outcome but the *question*: a room
 * definition's `enclosed` requirement now means **this room's own boundary is
 * closed**, not "this room is topologically indoors". Against that question
 * this function is not a narrow proxy for something better -- it is the exact
 * answer, with no false negatives and no false positives, in
 * `2 * (width + height)` edge reads.
 *
 * The consequence is a rule about layout rather than a defect: a rectangle
 * inside a larger sealed hall, with no partitions of its own, is not an
 * enclosed room and `RoomZoningService.zone` refuses it `not-enclosed`.
 * Adjacent rooms may share a wall -- room A's east boundary and room B's west
 * boundary are the same stored edge -- so this is subdivision, not
 * double-walling.
 *
 * The paragraphs below are kept because they are still true and still bound
 * what a *region* query would cost, should a future decision want the
 * topological reading back as a widening. Nothing here waits on them any more:
 *
 * - `TopologyManager` (`./topology.ts`) does **region detection**, not
 *   enclosure. It flood-fills each chunk across zero-valued edges, joins the
 *   per-chunk regions across chunk boundaries and hands each connected
 *   component a `GlobalTopologyId`. Its own comment says the mapping "would be
 *   used later to query if a global room is enclosed", and no such query
 *   exists. Nor is a region id enough on its own: a region that reaches the
 *   edge of the materialised world is indistinguishable from one bounded by
 *   walls there, so "is this region closed" needs a rule about the world's
 *   frontier that nobody has written.
 * - `TopologyManager.update()` has no caller anywhere in `src/`. It is
 *   constructed in `runtime/new-session.ts` and is absent from the
 *   `registerSystem` block beside it, so no tick recomputes it and
 *   `getTopologyId` answers `0` for every tile in a running session.
 *
 * So this module implements the predicate it can state honestly, and since the
 * ruling above that predicate *is* the rule -- `RoomZoningService.zone` refuses
 * an `enclosed` room whose answer here is `open`. Only `enclosed`: `outdoors`
 * (`room.yard`) and `none` accept any perimeter, because a walled exercise yard
 * is an ordinary prison yard and because `outdoors` is a claim about a roof,
 * which this world model does not represent at all.
 *
 * ## A sealed room can have a door in it, and that is recent
 *
 * Worth knowing before reading a `sealed`/`open` answer as a verdict on the
 * player's building. This paragraph used to say the opposite -- that only a
 * `'wall'` wrote into the edge layers, that `edgeNumericIdFor` returned `0` for
 * `door-wooden` because an edge is opaque to `TopologyManager`, and that "the
 * only enclosure the world can express today is a rectangle with no way in".
 *
 * A completed door order now writes `DOOR_EDGE_NUMERIC_ID` into the same layer
 * *and* registers a `DoorDefinition`, so this function reports a room with a
 * door in its wall line as `'sealed'` -- correctly, because it is: the
 * perimeter really is closed, and the way in is a gated crossing that only
 * navigation can see (`buildNavigationGraph` reads `DoorRegistry` before it
 * reads the edge value). So a `'sealed'` answer no longer implies "no way in",
 * and an `'open'` one still means exactly what it says: an edge on the
 * perimeter holds nothing at all.
 *
 * ## Determinism
 *
 * A pure read of the two edge layers in a fixed order -- north row west to
 * east, then south row, then west column north to south, then east column --
 * so the gap it names is a function of the rectangle and not of the loop. It
 * materialises nothing: `SparseWorld.getTopEdge`/`getLeftEdge` answer `0` for
 * a chunk that does not exist, unlike `setZoning`, which would grow the world.
 * Work is bounded by the perimeter, `2 * (width + height)` edge reads.
 */

/** A rectangle of tiles, in the shape `ZoneRoomRequest` states one. */
export interface TileRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * `'sealed'` -- every perimeter edge holds edge geometry.
 * `'open'` -- at least one does not.
 */
export type RoomEnclosure = 'sealed' | 'open';

/*
 * **`RoomPerimeterAccess` and `roomPerimeterAccess` used to live here, and ADR
 * 0108 moved the verdict out of this module rather than widening it.**
 *
 * The type they published had three values and the docblock on it stated the
 * asymmetry in its own words: *"`'no-way-in'` is certain, `'doorway'` is
 * necessary rather than sufficient, and no sentence built on this may claim
 * more"*, handing the region question to `buildNavigationGraph`. #1006 measured
 * what shipping a player-facing readout on the half that is not certain costs
 * -- silence in exactly the state that costs 2,000 a day and every yard tick --
 * and the answer is now `RoomAccess` in `./reachability.ts`, which asks this
 * module's two perimeter questions first and the region question afterwards.
 *
 * What stays here is what this module can state honestly about one rectangle:
 * `roomPerimeterEnclosure` above, and `roomPerimeterHoldsDoor` below.
 */


/**
 * Which edge of which tile the world stores a gap at.
 *
 * `'north'` and `'west'` only, because those are the two the world keeps a
 * slot for: a gap on the rectangle's *south* boundary is the north edge of the
 * tile below it, and one on its east boundary is the west edge of the tile to
 * its right. The same rule `src/rendering/build/edge-picking.ts` applies to a
 * pointer, and the same vocabulary `BUILD_EDGES` uses.
 */
export interface RoomEnclosureGap {
  readonly tile: TilePosition;
  readonly edge: 'north' | 'west';
}

export interface RoomEnclosureResult {
  readonly enclosure: RoomEnclosure;
  /** The first gap in the canonical perimeter order; absent when `enclosure` is `'sealed'`. */
  readonly gap?: RoomEnclosureGap;
}

/**
 * The two reads this module needs from a world, named as a port rather than as
 * `SparseWorld` (issue #493).
 *
 * `SparseWorld` still satisfies this structurally and every call site inside
 * `src/simulation/**` keeps passing one -- nothing there changes. What this
 * makes possible is a *second* implementation on the other side of the worker
 * boundary: `src/rendering/world/world-view.ts`'s `WorldRenderView` is the
 * renderer's own decoded, read-only projection of the same two edge layers,
 * built for painting walls, and it satisfies this port with no adapter. A
 * pending rectangle's own enclosure can therefore be classified from the
 * *client* side of the boundary -- once, at the composition root that already
 * knows both the world and the HUD's vocabulary -- against the identical
 * function `RoomZoningService.zone` refuses by, rather than a second
 * implementation of the same walk that could silently disagree with it. That
 * is the discipline `WorldRenderView.isTileOwned`'s own comment already states
 * for ownership (`isTileOwnedBy` is imported, not reimplemented, after #93
 * found the two disagreeing); this is the same rule applied to enclosure.
 *
 * A concrete class typed as a parameter would refuse this, because a class
 * with private fields is only assignable to *that* class -- `WorldRenderView`
 * has its own private chunk map and could never satisfy `SparseWorld`
 * structurally no matter which public methods it grew. An interface has no
 * private side to fail to match, which is the whole reason this exists as one.
 */
export interface RoomEdgeReader {
  getTopEdge(tile: TilePosition): number;
  getLeftEdge(tile: TilePosition): number;
}

/**
 * The one read `roomPerimeterHoldsDoor` needs from a door registry, named as a
 * port for the reason `RoomEdgeReader` is one.
 *
 * `DoorRegistry.getByEdge` satisfies it structurally and every call site
 * passes one. The return type is `unknown` rather than `DoorDefinition |
 * undefined` deliberately: this module needs to know only whether an edge
 * *has* a door, and a `DoorDefinition` here would import the navigation
 * vocabulary -- its lock state, its cost multiplier, its permissions -- into a
 * module that must not weigh any of it. A locked door is still a door to this
 * question, which is the same policy `buildNavigationGraph` applies when it
 * records a portal "regardless of its current lock state".
 *
 * `'left'` and `'top'` are `DoorSide`'s own spelling for the two edges the
 * world stores, and they are the same two edges `RoomEnclosureGap` calls
 * `'west'` and `'north'`. Two vocabularies for one pair of edges is not this
 * module's to unify -- the door registry is keyed on one of them and
 * `src/rendering/build/edge-picking.ts` on the other -- so the walk below
 * reads a tile's north edge through `getTopEdge` and asks the registry for the
 * same tile's `'top'`.
 */
export interface RoomDoorReader {
  getByEdge(tile: TilePosition, side: 'left' | 'top'): unknown;
}

/**
 * Evaluates the perimeter of `rectangle` against the world's edge layers.
 *
 * A rectangle with a non-positive dimension has no perimeter to check and is
 * reported `'open'` with no gap: it is not a shape that could enclose
 * anything, and the caller has already refused it as an invalid area.
 */
export function roomPerimeterEnclosure(world: RoomEdgeReader, rectangle: TileRectangle): RoomEnclosureResult {
  if (rectangle.width < 1 || rectangle.height < 1) return { enclosure: 'open' };

  const left = rectangle.x;
  const top = rectangle.y;
  const right = rectangle.x + rectangle.width - 1;
  const bottom = rectangle.y + rectangle.height - 1;

  for (let x = left; x <= right; x += 1) {
    // The rectangle's top boundary: this tile's own north edge.
    if (world.getTopEdge(tile(x, top)) === 0) {
      return { enclosure: 'open', gap: { tile: tile(x, top), edge: 'north' } };
    }
  }
  for (let x = left; x <= right; x += 1) {
    // Its bottom boundary: the north edge of the row below it.
    if (world.getTopEdge(tile(x, bottom + 1)) === 0) {
      return { enclosure: 'open', gap: { tile: tile(x, bottom + 1), edge: 'north' } };
    }
  }
  for (let y = top; y <= bottom; y += 1) {
    if (world.getLeftEdge(tile(left, y)) === 0) {
      return { enclosure: 'open', gap: { tile: tile(left, y), edge: 'west' } };
    }
  }
  for (let y = top; y <= bottom; y += 1) {
    // Its east boundary: the west edge of the column to its right.
    if (world.getLeftEdge(tile(right + 1, y)) === 0) {
      return { enclosure: 'open', gap: { tile: tile(right + 1, y), edge: 'west' } };
    }
  }

  return { enclosure: 'sealed' };
}

/**
 * Whether any edge on `rectangle`'s perimeter carries a **registered door**.
 *
 * The second of this module's two perimeter questions, and the one that makes
 * a crossing possible at all: `edgeStanding` (`../navigation/traversal.ts`)
 * consults `DoorRegistry` *before* the edge value, and `buildNavigationGraph`
 * records a portal for exactly that edge whatever its lock state. So a closed
 * perimeter holding no door anywhere is a boundary no route can cross in either
 * direction -- `traversal.ts` states it as a rule rather than an observation:
 * *"any non-zero value with no registered door is an impassable wall"*.
 *
 * **It answers about the wall line and says nothing about what is behind it**,
 * which is the whole reason `roomAccess` (`./reachability.ts`) exists to ask a
 * second question of the region graph. A caller reading `true` here as "somebody
 * can get in" is making exactly the claim #1006 was filed about.
 *
 * ## Determinism and cost
 *
 * The same canonical perimeter order `roomPerimeterEnclosure` walks -- north row
 * west to east, then south row, then west column, then east column -- so the two
 * walks cannot disagree about which edges belong to the rectangle. A pure read
 * of the registry; it materialises nothing, for the reason that function gives.
 * At most `2 * (width + height)` lookups, and it **returns on the first door
 * found**, so the answer is a function of the rectangle rather than of the loop.
 */
export function roomPerimeterHoldsDoor(doors: RoomDoorReader, rectangle: TileRectangle): boolean {
  if (rectangle.width < 1 || rectangle.height < 1) return false;

  const left = rectangle.x;
  const top = rectangle.y;
  const right = rectangle.x + rectangle.width - 1;
  const bottom = rectangle.y + rectangle.height - 1;

  for (let x = left; x <= right; x += 1) {
    // The rectangle's top boundary: this tile's own north edge, which the
    // registry keys as `'top'`.
    if (doors.getByEdge(tile(x, top), 'top') !== undefined) return true;
  }
  for (let x = left; x <= right; x += 1) {
    // Its bottom boundary: the north edge of the row below it.
    if (doors.getByEdge(tile(x, bottom + 1), 'top') !== undefined) return true;
  }
  for (let y = top; y <= bottom; y += 1) {
    if (doors.getByEdge(tile(left, y), 'left') !== undefined) return true;
  }
  for (let y = top; y <= bottom; y += 1) {
    // Its east boundary: the west edge of the column to its right.
    if (doors.getByEdge(tile(right + 1, y), 'left') !== undefined) return true;
  }

  return false;
}

function tile(x: number, y: number): TilePosition {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}
