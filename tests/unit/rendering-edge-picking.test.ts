import { describe, expect, it } from 'vitest';
import {
  MAX_RUN_SEGMENTS,
  edgeRunBetween,
  edgeRunFromDrag,
  edgeTargetsEqual,
  pickEdgeAtWorld,
  pickEdgeOnAxis,
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

  it('keeps the axis, once the axis is settled', () => {
    // `edgeRunBetween` is the second half of the gesture: by the time it runs,
    // the direction has already chosen the axis. Choosing it is
    // `edgeRunFromDrag`'s job.
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

describe('the drag direction decides the axis, and the press decides the tile', () => {
  it('treats a press that barely moved as a click on the nearest edge', () => {
    // All four sides live for a click, corner included: pointing at the bottom
    // of a tile places the wall you are pointing at.
    const press = inTile(4, 6, 0.5, 0.95);
    expect(edgeRunFromDrag(press, press)).toEqual([{ tileX: 4, tileY: 7, edge: 'north' }]);
  });

  it('lays a horizontal run from a sideways drag, even when the press was nearest a west edge', () => {
    // The defect this rule exists for, seen while driving the real panel:
    // pressing a hair left of centre and dragging *sideways* laid one vertical
    // segment and no run at all.
    const press = inTile(4, 6, 0.2, 0.4);
    expect(pickEdgeAtWorld(press)).toEqual({ tileX: 4, tileY: 6, edge: 'west' });

    const run = edgeRunFromDrag(press, inTile(8, 6, 0.5, 0.4));
    expect(run.every((segment) => segment.edge === 'north')).toBe(true);
    expect(run).toHaveLength(5);
    // The tile the player pressed is still the tile the run starts on.
    expect(run[0]).toEqual({ tileX: 4, tileY: 6, edge: 'north' });
  });

  it('lays a vertical run from a downward drag, even when the press was nearest a north edge', () => {
    const press = inTile(4, 6, 0.4, 0.2);
    expect(pickEdgeAtWorld(press)).toEqual({ tileX: 4, tileY: 6, edge: 'north' });

    const run = edgeRunFromDrag(press, inTile(4, 9, 0.4, 0.5));
    expect(run.every((segment) => segment.edge === 'west')).toBe(true);
    expect(run).toHaveLength(4);
    expect(run[0]).toEqual({ tileX: 4, tileY: 6, edge: 'west' });
  });

  it('snaps the run to the near side of the press, not to the tile origin', () => {
    // Pressing in the lower half and dragging sideways means the wall along
    // the *bottom* of that tile -- which is the top of the one below.
    const run = edgeRunFromDrag(inTile(4, 6, 0.5, 0.8), inTile(6, 6, 0.5, 0.8));
    expect(run[0]).toEqual({ tileX: 4, tileY: 7, edge: 'north' });

    const rightwards = edgeRunFromDrag(inTile(4, 6, 0.8, 0.5), inTile(4, 9, 0.8, 0.5));
    expect(rightwards[0]).toEqual({ tileX: 5, tileY: 6, edge: 'west' });
  });

  it('picks the axis by the dominant travel, not by the first pixel of it', () => {
    const press = inTile(4, 6, 0.5, 0.5);
    // Mostly across, slightly down: a horizontal run.
    expect(edgeRunFromDrag(press, inTile(9, 7, 0.5, 0.1)).every((s) => s.edge === 'north')).toBe(true);
    // Mostly down, slightly across: a vertical run.
    expect(edgeRunFromDrag(press, inTile(5, 11, 0.1, 0.5)).every((s) => s.edge === 'west')).toBe(true);
  });

  it('offers only the two edges the world stores, on either axis', () => {
    expect(pickEdgeOnAxis(inTile(3, 3, 0.9, 0.9), 'x').edge).toBe('north');
    expect(pickEdgeOnAxis(inTile(3, 3, 0.9, 0.9), 'y').edge).toBe('west');
  });
});
