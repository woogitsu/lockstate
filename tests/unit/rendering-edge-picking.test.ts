import { describe, expect, it } from 'vitest';
import {
  MAX_RUN_SEGMENTS,
  edgeRunBetween,
  edgeTargetsEqual,
  pickEdgeAtWorld,
} from '../../src/rendering/build/edge-picking';
import { BUILD_EDGES } from '../../src/simulation/construction';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';

/**
 * "Point at where the wall goes" is a rule, and this is the rule.
 *
 * It is pure geometry on purpose: the alternative is proving click-to-place
 * by clicking, which cannot say what happens a pixel either side of a
 * boundary. The browser spec proves the wiring; this proves the answer.
 */

/** A world point at a fraction across and down tile `(tileX, tileY)`. */
function inTile(tileX: number, tileY: number, acrossFraction: number, downFraction: number) {
  return { x: (tileX + acrossFraction) * TILE_SIZE_PX, y: (tileY + downFraction) * TILE_SIZE_PX };
}

describe('the pointer picks the edge it is nearest', () => {
  it('picks the north edge near the top of a tile', () => {
    expect(pickEdgeAtWorld(inTile(4, 6, 0.5, 0.1))).toEqual({ tileX: 4, tileY: 6, edge: 'north' });
  });

  it('picks the west edge near the left of a tile', () => {
    expect(pickEdgeAtWorld(inTile(4, 6, 0.1, 0.5))).toEqual({ tileX: 4, tileY: 6, edge: 'west' });
  });

  it('resolves a south pick onto the north edge of the tile below', () => {
    // The world stores two edges per tile, not four. "The bottom of this
    // tile" and "the top of the next one down" are the same wall, and the
    // player never has to know which name it is filed under.
    expect(pickEdgeAtWorld(inTile(4, 6, 0.5, 0.9))).toEqual({ tileX: 4, tileY: 7, edge: 'north' });
  });

  it('resolves an east pick onto the west edge of the tile to the right', () => {
    expect(pickEdgeAtWorld(inTile(4, 6, 0.9, 0.5))).toEqual({ tileX: 5, tileY: 6, edge: 'west' });
  });

  it('never returns an edge the world has no slot for', () => {
    for (let across = 0; across < 1; across += 0.05) {
      for (let down = 0; down < 1; down += 0.05) {
        const picked = pickEdgeAtWorld(inTile(2, 3, across, down));
        expect(BUILD_EDGES as readonly string[], `${across},${down}`).toContain(picked.edge);
      }
    }
  });

  it('answers the same way every time for a point exactly on a corner', () => {
    // A tie has to resolve, and resolve identically on every machine --
    // otherwise the wall you get depends on rounding. The ghost is what makes
    // the choice visible before the player commits to it.
    const corner = inTile(4, 6, 0, 0);
    expect(pickEdgeAtWorld(corner)).toEqual(pickEdgeAtWorld(corner));
    expect(pickEdgeAtWorld(corner)).toEqual({ tileX: 4, tileY: 6, edge: 'north' });
  });

  it('works in negative space, where tiles floor rather than truncate', () => {
    expect(pickEdgeAtWorld(inTile(-2, -3, 0.1, 0.5))).toEqual({ tileX: -2, tileY: -3, edge: 'west' });
    expect(pickEdgeAtWorld(inTile(-2, -3, 0.5, 0.9))).toEqual({ tileX: -2, tileY: -2, edge: 'north' });
  });

  it('refuses a non-finite point rather than inventing a tile', () => {
    expect(() => pickEdgeAtWorld({ x: Number.NaN, y: 0 })).toThrow(RangeError);
  });
});

describe('a drag lays a run of edges', () => {
  const northAnchor = { tileX: 4, tileY: 6, edge: 'north' } as const;
  const westAnchor = { tileX: 4, tileY: 6, edge: 'west' } as const;

  it('treats a press with no movement as a run of one', () => {
    expect(edgeRunBetween(northAnchor, inTile(4, 6, 0.5, 0.1))).toEqual([northAnchor]);
  });

  it('runs a north edge east-west', () => {
    expect(edgeRunBetween(northAnchor, inTile(7, 6, 0.5, 0.1))).toEqual([
      { tileX: 4, tileY: 6, edge: 'north' },
      { tileX: 5, tileY: 6, edge: 'north' },
      { tileX: 6, tileY: 6, edge: 'north' },
      { tileX: 7, tileY: 6, edge: 'north' },
    ]);
  });

  it('runs a west edge north-south', () => {
    expect(edgeRunBetween(westAnchor, inTile(4, 8, 0.1, 0.5))).toEqual([
      { tileX: 4, tileY: 6, edge: 'west' },
      { tileX: 4, tileY: 7, edge: 'west' },
      { tileX: 4, tileY: 8, edge: 'west' },
    ]);
  });

  it('keeps the axis the anchor chose, however the hand wandered', () => {
    // Dragging a north-edge run mostly downwards must not silently become a
    // west-edge run: the player aimed at a specific edge, and re-picking the
    // axis mid-gesture would throw that away.
    const run = edgeRunBetween(northAnchor, inTile(6, 40, 0.5, 0.5));
    expect(run.every((segment) => segment.edge === 'north' && segment.tileY === 6)).toBe(true);
    expect(run).toHaveLength(3);
  });

  it('produces the same commands whichever way the drag went', () => {
    // Ascending regardless of direction, so one wall is one command stream
    // (docs/DETERMINISM.md) rather than two that depend on hand movement.
    const rightwards = edgeRunBetween({ tileX: 4, tileY: 6, edge: 'north' }, inTile(6, 6, 0.5, 0.1));
    const leftwards = edgeRunBetween({ tileX: 6, tileY: 6, edge: 'north' }, inTile(4, 6, 0.5, 0.1));
    expect(rightwards).toEqual(leftwards);
  });

  it('clamps a careless flick instead of submitting hundreds of orders', () => {
    const run = edgeRunBetween(northAnchor, inTile(4 + 5_000, 6, 0.5, 0.1));
    expect(run).toHaveLength(MAX_RUN_SEGMENTS);
    // Clamped from the anchor, not recentred: the run still starts where the
    // player pressed.
    expect(run[0]).toEqual(northAnchor);
  });

  it('clamps a backwards flick the same way', () => {
    const run = edgeRunBetween(northAnchor, inTile(4 - 5_000, 6, 0.5, 0.1));
    expect(run).toHaveLength(MAX_RUN_SEGMENTS);
    expect(run[run.length - 1]).toEqual(northAnchor);
  });
});

describe('edge identity', () => {
  it('compares by value, and treats a missing target as unequal to a real one', () => {
    expect(edgeTargetsEqual({ tileX: 1, tileY: 2, edge: 'north' }, { tileX: 1, tileY: 2, edge: 'north' })).toBe(true);
    expect(edgeTargetsEqual({ tileX: 1, tileY: 2, edge: 'north' }, { tileX: 1, tileY: 2, edge: 'west' })).toBe(false);
    expect(edgeTargetsEqual(undefined, { tileX: 1, tileY: 2, edge: 'west' })).toBe(false);
    expect(edgeTargetsEqual(undefined, undefined)).toBe(true);
  });
});
