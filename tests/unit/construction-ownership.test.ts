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
 * ADR 0019 -- tile ownership under overlapping parcels -- is still **Proposed**
 * (#120), and nothing here settles it. The rule for *which* tiles are owned
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

  it('checks the order\'s own tile, not the tile across the edge it occupies', () => {
    /*
     * A wall on the north edge of `(x, y)` is the same edge as the south side
     * of `(x, y - 1)`, so "which tile must be owned" is a real question and
     * this is the answer: the order's own tile.
     *
     * Requiring both would make it impossible to wall your own perimeter --
     * every boundary edge of an owned parcel has an unowned tile on the far
     * side of it, and a prison is a perimeter. So the rule is the one a fence
     * on a property line follows.
     */
    const world = worldWith(false);
    world.registerParcel({
      id: 'parcel-1',
      bounds: { x: tileCoordinate(0), y: tileCoordinate(5), width: 11, height: 6 },
      basePrice: 100,
    });
    world.setParcelOwned('parcel-1', true);

    // (4, 5) is owned; (4, 4) directly north of it is not, and the order's
    // north edge is the boundary between them.
    expect(world.isTileOwned(tile(4, 5)), 'fixture: the order tile must be owned').toBe(true);
    expect(world.isTileOwned(tile(4, 4)), 'fixture: the tile across the edge must not be').toBe(false);

    const order = createBuildOrder('order-perimeter', 'wall-brick', tile(4, 5), 'north');
    construction(world).submitOrder(order);
    expect(order.state).toBe('approved');
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
