import { describe, expect, it } from 'vitest';
import { FLOOR_DEPTH, depthForAnchor } from '../../src/rendering/depth';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';

/**
 * Occlusion in a top-down view with visible object sides is entirely decided
 * by these numbers, so the rules are pinned here rather than being discovered
 * by looking at the screen: further south draws in front, an actor draws in
 * front of a structure it is standing at, and the ground is always behind.
 */

function southernEdgeOf(tileY: number): number {
  return (tileY + 1) * TILE_SIZE_PX;
}

describe('render depth ordering', () => {
  it('draws a thing further south in front of one further north', () => {
    expect(depthForAnchor(southernEdgeOf(5), 'actor')).toBeGreaterThan(depthForAnchor(southernEdgeOf(4), 'actor'));
    expect(depthForAnchor(southernEdgeOf(0), 'structure')).toBeGreaterThan(
      depthForAnchor(southernEdgeOf(-1), 'structure'),
    );
  });

  it('draws an actor in front of a structure anchored on the same row', () => {
    const row = southernEdgeOf(7);
    expect(depthForAnchor(row, 'actor')).toBeGreaterThan(depthForAnchor(row, 'structure'));
  });

  it('never lets the layer bias promote something past the next row', () => {
    const near = southernEdgeOf(7);
    const next = southernEdgeOf(8);
    expect(depthForAnchor(near, 'actor')).toBeLessThan(depthForAnchor(next, 'structure'));
  });

  it('separates sub-tile positions, so a step south changes the order', () => {
    const anchor = southernEdgeOf(3);
    expect(depthForAnchor(anchor + 0.5, 'actor')).toBeGreaterThan(depthForAnchor(anchor, 'actor'));
  });

  it('sorts a mixed scene the way a viewer standing to the south would see it', () => {
    const scene = [
      { name: 'wall on row 6', depth: depthForAnchor(southernEdgeOf(6), 'structure') },
      { name: 'prisoner on row 4', depth: depthForAnchor(southernEdgeOf(4), 'actor') },
      { name: 'guard on row 6', depth: depthForAnchor(southernEdgeOf(6), 'actor') },
      { name: 'ground', depth: FLOOR_DEPTH },
      { name: 'wall on row 2', depth: depthForAnchor(southernEdgeOf(2), 'structure') },
    ];

    expect([...scene].sort((left, right) => left.depth - right.depth).map((entry) => entry.name)).toEqual([
      'ground',
      'wall on row 2',
      'prisoner on row 4',
      'wall on row 6',
      'guard on row 6',
    ]);
  });

  it('keeps the ground below any row a real world could reach', () => {
    expect(FLOOR_DEPTH).toBeLessThan(depthForAnchor(southernEdgeOf(-1_000_000), 'structure'));
  });

  it('rejects a non-finite anchor rather than corrupting the display list', () => {
    expect(() => depthForAnchor(Number.NaN, 'actor')).toThrow(RangeError);
  });
});
