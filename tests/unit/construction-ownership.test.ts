import { describe, expect, it } from 'vitest';
import { ConstructionSystem, createBuildOrder } from '../../src/simulation/construction';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * Issue #215: a build order on land the player does not own must be refused.
 *
 * `canBuildAt` has existed, correct and tested, with **no caller anywhere in
 * `src/`** since #93 -- re-verified independently by PR #130 and again by
 * #214. `ConstructionSystem.submitOrder` carried a comment where the check
 * should be (*"Validation hooks would run here: check ownership, terrain,
 * occupancy"*) and approved everything that was in bounds.
 *
 * That was latent only because nothing could finish: #204 said the case was
 * unreachable because "nothing can be built (#89)", and #214 corrected that --
 * orders *can* be placed, and completion was blocked by **materials**, not by
 * geometry. So the order entered the queue and the ownership question was
 * simply never asked. PR #91 gives materials a way in, at which point an order
 * placed on unowned land completes on unowned land and the world materialises
 * the chunk to hold the wall: measured on #204, `loadedBounds` went from 32x32
 * to 1312x1312 -- 1,721,344 tile positions -- from one order, with no parcel
 * purchased and no authored save.
 *
 * The owner's decision was **refuse at submission**: ownership is permission,
 * not backpressure. #25's "backpressure is a state, not an error" is about
 * work the game will eventually do; permission you do not have cannot be
 * queued.
 *
 * ## What this file is for, beyond the behaviour
 *
 * The standing surviving mutation on #215 is *delete `canBuildAt` entirely* --
 * nothing in `src/` breaks and the whole suite stays green. That has been true
 * for the function's entire existence. These assertions are what kills it.
 *
 * ## What this deliberately does not decide
 *
 * ADR 0019 -- tile ownership under overlapping parcels -- is **Accepted**, and
 * nothing here is what settled it. The rule for *which* tiles are owned
 * lives in `isTileOwnedBy` and is what ADR 0019 is about; this file only
 * consumes the answer. The two are separable in fact and not just in
 * principle: `src/` has exactly one `registerParcel` call site
 * (`SparseWorld.fromSnapshot`, re-registering what a save carried), so no
 * world a running game can reach has overlapping parcels for the ADR's
 * question to arise over.
 */

const CHUNK = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/** A loaded chunk, owned or not, with nothing else done to it. */
function worldWith(owned: boolean): SparseWorld {
  const world = new SparseWorld(32);
  world.ensureMetadata(CHUNK);
  world.load(CHUNK);
  world.setOwned(CHUNK, owned);
  return world;
}

describe('submitOrder refuses an order on unowned land (#215)', () => {
  it('fails an order whose tile the player does not own', () => {
    const construction = new ConstructionSystem(worldWith(false));
    const order = createBuildOrder('order-1', 'wall-brick', tile(4, 6));
    construction.submitOrder(order);

    expect(order.state).toBe('failed');
    // The reason is asserted, not just the refusal: `out-of-bounds` was the
    // only failure `submitOrder` could previously produce, so a test that
    // checked the state alone would pass on a chunk that had silently stopped
    // being loaded and would say nothing about ownership.
    expect(order.failReason).toBe('unowned-land');
    expect(construction.getOrder('order-1')?.state).toBe('failed');
  });

  it('approves the same order once the land is owned', () => {
    // The other direction, and the one that stops this being a rule that
    // refuses everything. Same order, same tile, same definition.
    const construction = new ConstructionSystem(worldWith(true));
    const order = createBuildOrder('order-1', 'wall-brick', tile(4, 6));
    construction.submitOrder(order);

    expect(order.state).toBe('approved');
    expect(order.failReason).toBeUndefined();
  });

  it('approves an order on a tile an owned parcel covers, with no owned chunk', () => {
    // The second half of the ownership rule (`isTileOwnedBy`): a tile is owned
    // when any owned parcel contains it **or** its chunk is owned outright.
    // Asserted because a check written against `isOwned(chunk)` alone would
    // pass every other test in this file and would refuse to build on land the
    // player had actually bought.
    const world = worldWith(false);
    world.registerParcel({
      id: 'parcel-1',
      bounds: { x: tileCoordinate(0), y: tileCoordinate(0), width: 11, height: 11 },
      basePrice: 100,
    });
    world.setParcelOwned('parcel-1', true);

    const inside = createBuildOrder('order-inside', 'wall-brick', tile(4, 6));
    construction(world).submitOrder(inside);
    expect(inside.state).toBe('approved');

    const outside = createBuildOrder('order-outside', 'wall-brick', tile(20, 20));
    construction(world).submitOrder(outside);
    expect(outside.state, 'a tile outside the owned parcel is still unowned').toBe('failed');
    expect(outside.failReason).toBe('unowned-land');
  });

  it('decides out-of-bounds before ownership, because an unmaterialised tile has no owner', () => {
    // Ordering, asserted rather than left to the reading order of the source.
    // A tile in no loaded chunk cannot be owned, so an ownership check running
    // first would report `unowned-land` for what is really a coordinate
    // outside the world -- a true-sounding message pointing at the wrong
    // problem.
    const construction = new ConstructionSystem(worldWith(true));
    const order = createBuildOrder('order-far', 'wall-brick', tile(9_000, 9_000));
    construction.submitOrder(order);

    expect(order.state).toBe('failed');
    expect(order.failReason).toBe('out-of-bounds');
  });

  it('approves an edge order when the order\'s own tile is owned and the tile across the edge is not', () => {
    /*
     * **This case is unchanged; its title is not.** It read *"checks the
     * order's own tile, not the tile across the edge it occupies"* until
     * #448, which is the half of the rule this fixture happens to exercise
     * and is no longer the rule. The fixture has one owned side, so it passes
     * under the one-sided predicate and under the symmetric one alike -- which
     * is exactly why the title had to be rewritten by hand rather than being
     * caught by a run. A test whose name asserts the opposite of the rule is
     * worse than a failing one.
     *
     * What it asserts, and still asserts: requiring *both* tiles would make it
     * impossible to wall your own perimeter, because every boundary edge of an
     * owned parcel has an unowned tile on the far side of it and a prison is a
     * perimeter. The case below it is the other half -- the same wall,
     * addressed from the unowned side -- and the two together are the rule.
     */
    const world = ownedRows5To10();

    // (4, 5) is owned; (4, 4) directly north of it is not, and the order's
    // north edge is the boundary between them.
    expect(world.isTileOwned(tile(4, 5)), 'fixture: the order tile must be owned').toBe(true);
    expect(world.isTileOwned(tile(4, 4)), 'fixture: the tile across the edge must not be').toBe(false);

    const order = createBuildOrder('order-perimeter', 'wall-brick', tile(4, 5), 'north');
    construction(world).submitOrder(order);
    expect(order.state).toBe('approved');
  });

  /*
   * ==========================================================================
   * Issue #448 / ADR 0047 decision 6: the same wall, from the other side.
   * ==========================================================================
   *
   * `SparseWorld` keeps one slot per edge and keeps it on the tile to the
   * *south* and to the *east* of it -- the north edge of `(x, y)` and the west
   * edge of `(x, y)`. So the south face of owned land is addressed as the
   * north edge of the first *unowned* row, and its east face as the west edge
   * of the first unowned column. Asking only the order's own tile therefore
   * approved two of the four faces of a parcel and refused the other two.
   *
   * Since ADR 0045 that was a wrong *refusal* rather than a wrong readout:
   * `roomPerimeterEnclosure` reads a room's south boundary off the row below
   * it, so a room flush against the edge of owned land could never be sealed
   * and therefore could never be zoned.
   * `tests/integration/edge-of-owned-land-room.test.ts` is that room.
   */

  it('approves the same wall addressed from the unowned side -- the south face of owned land', () => {
    const world = ownedRows5To10();

    // Row 10 is the last owned row, so the parcel's south boundary is the
    // north edge of row 11 -- a tile the player does not own and never will,
    // because it is the far side of their own property line.
    expect(world.isTileOwned(tile(4, 10)), 'fixture: the last owned row').toBe(true);
    expect(world.isTileOwned(tile(4, 11)), 'fixture: the order tile must NOT be owned').toBe(false);

    const order = createBuildOrder('order-south-face', 'wall-brick', tile(4, 11), 'north');
    construction(world).submitOrder(order);
    expect(order.state, 'the south face of owned land is the same property line as its north face').toBe('approved');
    expect(order.failReason).toBeUndefined();
  });

  it('approves the east face of owned land, which is the west edge of the first unowned column', () => {
    const world = ownedRows5To10();

    expect(world.isTileOwned(tile(10, 7)), 'fixture: the last owned column').toBe(true);
    expect(world.isTileOwned(tile(11, 7)), 'fixture: the order tile must NOT be owned').toBe(false);

    const order = createBuildOrder('order-east-face', 'wall-brick', tile(11, 7), 'west');
    construction(world).submitOrder(order);
    expect(order.state).toBe('approved');
  });

  it('still refuses an edge order when neither of the two tiles is owned', () => {
    // The direction that stops "either side" from meaning "anywhere". Both
    // tiles are inside the loaded chunk and neither is inside the parcel, so
    // nothing about this order touches the property line at all.
    const world = ownedRows5To10();
    expect(world.isTileOwned(tile(4, 20)), 'fixture: the order tile must be unowned').toBe(false);
    expect(world.isTileOwned(tile(4, 19)), 'fixture: the tile across the edge must be unowned too').toBe(false);

    const order = createBuildOrder('order-nowhere', 'wall-brick', tile(4, 20), 'north');
    construction(world).submitOrder(order);
    expect(order.state).toBe('failed');
    // The order's own tile's reason, not the far tile's: it is the tile the
    // player named and the one they can do something about.
    expect(order.failReason).toBe('unowned-land');
  });

  it('gives a buildable that is not edge geometry no far side to fall back on', () => {
    /*
     * `bed-wooden` is an object: it is addressed by a *tile*, and a tile has
     * no second owner to consult. Without this, a widening written as "look at
     * the neighbour too" would let a bed be placed one tile outside the fence
     * because the tile behind it is owned -- which is a change to where objects
     * may go, and #448 decided nothing of the kind. `occupiesTileEdge` is the
     * predicate that separates the two, and deleting it from `submitOrder`
     * fails here and nowhere else in this file.
     */
    const world = ownedRows5To10();
    expect(world.isTileOwned(tile(4, 5)), 'fixture: the tile north of the order must be owned').toBe(true);

    const order = createBuildOrder('order-bed-outside', 'bed-wooden', tile(4, 4), 'north');
    construction(world).submitOrder(order);
    expect(order.state).toBe('failed');
    expect(order.failReason).toBe('unowned-land');
  });

  it('approves an edge order whose own tile is outside the materialised world when the far tile is owned', () => {
    /*
     * The world's own frontier, which is where this matters today: a new
     * session owns exactly one 32x32 chunk, so the south face of the whole
     * playable world is the north edge of row 32 -- a tile in a chunk that
     * does not exist. `out-of-bounds` used to be decided before ownership was
     * ever consulted, so widening ownership alone would have left this face
     * refused; ADR 0047 decision 6 says both checks move together and this is
     * that half.
     *
     * Completing such an order materialises chunk (0, 1). That is the visible
     * consequence `docs/WORLD.md` records as deferred, and it is asserted
     * rather than implied in `tests/integration/edge-of-owned-land-room.test.ts`.
     */
    const world = worldWith(true);
    expect(world.getChunk({ x: chunkCoordinate(0), y: chunkCoordinate(1) }), 'fixture: the row below the world must not exist yet').toBeUndefined();
    expect(world.isTileOwned(tile(5, 31)), 'fixture: the last owned row of the one owned chunk').toBe(true);

    const order = createBuildOrder('order-world-south-face', 'wall-brick', tile(5, 32), 'north');
    construction(world).submitOrder(order);
    expect(order.state).toBe('approved');

    // Submission is a read. A refusal must grow no world and neither may an
    // approval: the chunk appears when the wall is *built*, not when it is
    // ordered.
    expect(world.getChunk({ x: chunkCoordinate(0), y: chunkCoordinate(1) }), 'submitting must not materialise anything').toBeUndefined();
  });

  it('still refuses an edge order when both of its tiles are outside the materialised world', () => {
    // One row further out than the case above, so neither tile has a chunk to
    // be owned in. `out-of-bounds` rather than `unowned-land`, because a tile
    // that is not there has no owner to be missing.
    const world = worldWith(true);
    const order = createBuildOrder('order-beyond', 'wall-brick', tile(5, 33), 'north');
    construction(world).submitOrder(order);
    expect(order.state).toBe('failed');
    expect(order.failReason).toBe('out-of-bounds');
  });

  it('does not check terrain, which is a separate decision and is turned off explicitly', () => {
    /*
     * `canBuildAt` defaults `requiresBuildableTerrain` on and `allowWater`
     * off, so passing no requirement would have this change start refusing
     * water and unbuildable ground in the same commit -- neither of which #215
     * decided.
     *
     * Asserted rather than left in a comment, because `SUBMISSION_REQUIREMENT`
     * turning those flags off is invisible to every other test here: they all
     * use dirt. This is what makes flipping one a change a reviewer sees.
     */
    const world = worldWith(true);
    world.setTerrain(tile(4, 6), 'water');
    expect(world.getTerrain(tile(4, 6)).isWater, 'fixture: the tile must really be water').toBe(true);
    expect(world.getTerrain(tile(4, 6)).buildable, 'fixture: water must be unbuildable terrain').toBe(false);

    const order = createBuildOrder('order-water', 'wall-brick', tile(4, 6));
    construction(world).submitOrder(order);
    expect(order.state, 'terrain is deliberately not enforced at submission (#215)').toBe('approved');
  });
});

function construction(world: SparseWorld): ConstructionSystem {
  return new ConstructionSystem(world);
}

/**
 * A loaded, unowned chunk with one owned parcel covering rows 5..10 of
 * columns 0..10.
 *
 * Four faces, none of them the chunk's own boundary, so each of the four is a
 * property line with land on both sides of it and the four are decided by the
 * ownership rule alone rather than by the edge of the world.
 */
function ownedRows5To10(): SparseWorld {
  const world = worldWith(false);
  world.registerParcel({
    id: 'parcel-1',
    bounds: { x: tileCoordinate(0), y: tileCoordinate(5), width: 11, height: 6 },
    basePrice: 100,
  });
  world.setParcelOwned('parcel-1', true);
  return world;
}
