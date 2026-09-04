import { describe, expect, it } from 'vitest';
import {
  createCrowdOffset,
  crowdKeyForPosition,
  crowdSpreadOffset,
  CROWD_POSITION_QUANTUM,
  CROWD_SPREAD_SPAN_TILES_X,
  CROWD_SPREAD_SPAN_TILES_Y,
  NO_CROWD_KEY,
} from '../../src/rendering/actors/crowd-spread';
import { RENDER_ACTORS_SUBTILE_UNITS } from '../../src/simulation/protocol/render-actors-payload';

/**
 * The arithmetic behind "two actors on one tile are two figures".
 *
 * `tests/browser/actor-crowding.spec.ts` is the claim about pixels -- Phaser,
 * a real atlas and a real display list, none of which `vitest` can reach
 * (`vitest.config.ts` is `environment: 'node'` with no jsdom). This file pins
 * the properties that spec's result depends on, so a regression says *which*
 * property broke rather than only that the picture changed.
 */

describe('crowd spread offsets', () => {
  it('leaves an actor standing alone exactly where it was', () => {
    expect(crowdSpreadOffset(0, 1)).toEqual({ x: 0, y: 0 });
  });

  it('leaves the first member of any group exactly where it was', () => {
    // The point of anchoring rank 0: an actor arriving on an occupied tile
    // never shoves the actor already standing there off the spot it holds.
    for (const count of [2, 3, 6, 22, 28]) {
      expect(crowdSpreadOffset(0, count)).toEqual({ x: 0, y: 0 });
    }
  });

  it('gives two actors on one point two different points', () => {
    const first = crowdSpreadOffset(0, 2, createCrowdOffset());
    const second = crowdSpreadOffset(1, 2, createCrowdOffset());
    expect(second.x).not.toBe(first.x);
    expect(second.y).not.toBe(first.y);
  });

  it('never puts two ranks of one group on the same point or the same row', () => {
    // The same row matters on its own: `ActorLayer` derives the depth anchor
    // from the drawn foot, so two members sharing a world Y would share a
    // depth and fall back to array order -- the coupling #944 is about.
    for (const count of [2, 3, 4, 6, 12, 22, 28, 64]) {
      const seenX = new Set<number>();
      const seenY = new Set<number>();
      for (let rank = 0; rank < count; rank += 1) {
        const offset = crowdSpreadOffset(rank, count, createCrowdOffset());
        seenX.add(offset.x);
        seenY.add(offset.y);
      }
      expect(seenX.size).toBe(count);
      expect(seenY.size).toBe(count);
    }
  });

  it('walks south and east only, so a member never sorts behind its own tile', () => {
    // North would: an actor anchored north of its tile's southern edge loses
    // the `LAYER_BIAS` `actor` promotion that makes someone in a doorway read
    // as being in front of it.
    for (const count of [2, 5, 22]) {
      let previousX = -1;
      let previousY = -1;
      for (let rank = 0; rank < count; rank += 1) {
        const offset = crowdSpreadOffset(rank, count, createCrowdOffset());
        expect(offset.x).toBeGreaterThan(previousX);
        expect(offset.y).toBeGreaterThan(previousY);
        previousX = offset.x;
        previousY = offset.y;
      }
    }
  });

  it('keeps every foot inside the tile the simulation named', () => {
    // The bound is what makes the spread honest: the renderer does not know
    // where the room's walls are, so a fan that left the tile would claim a
    // position no snapshot published.
    expect(CROWD_SPREAD_SPAN_TILES_X).toBeLessThan(0.5);
    expect(CROWD_SPREAD_SPAN_TILES_Y).toBeLessThan(0.5);
    for (const count of [2, 3, 22]) {
      for (let rank = 0; rank < count; rank += 1) {
        const offset = crowdSpreadOffset(rank, count, createCrowdOffset());
        expect(offset.x).toBeLessThanOrEqual(CROWD_SPREAD_SPAN_TILES_X);
        expect(offset.y).toBeLessThanOrEqual(CROWD_SPREAD_SPAN_TILES_Y);
      }
    }
  });

  it('spans the whole band whatever the group size, so a pair is as far apart as it can be', () => {
    for (const count of [2, 3, 22]) {
      const last = crowdSpreadOffset(count - 1, count, createCrowdOffset());
      expect(last.x).toBeCloseTo(CROWD_SPREAD_SPAN_TILES_X, 12);
      expect(last.y).toBeCloseTo(CROWD_SPREAD_SPAN_TILES_Y, 12);
    }
  });

  it('answers the same thing every time, so two clients draw the same picture', () => {
    expect(crowdSpreadOffset(3, 7, createCrowdOffset())).toEqual(crowdSpreadOffset(3, 7, createCrowdOffset()));
  });

  it('fills the caller-owned offset rather than allocating one', () => {
    const out = createCrowdOffset();
    expect(crowdSpreadOffset(1, 2, out)).toBe(out);
  });

  it('offers no offset for a rank outside its group', () => {
    expect(crowdSpreadOffset(2, 2)).toEqual({ x: 0, y: 0 });
    expect(crowdSpreadOffset(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('rejects a fractional rank or count rather than drawing between two ranks', () => {
    expect(() => crowdSpreadOffset(0.5, 2)).toThrow(RangeError);
    expect(() => crowdSpreadOffset(0, 2.5)).toThrow(RangeError);
  });
});

describe('crowd grouping keys', () => {
  it('groups two actors the simulation put on one tile', () => {
    expect(crowdKeyForPosition(16, 16)).toBe(crowdKeyForPosition(16, 16));
    expect(crowdKeyForPosition(12, 12)).not.toBe(crowdKeyForPosition(16, 16));
  });

  it('separates two adjacent tiles and the two axes', () => {
    expect(crowdKeyForPosition(12, 12)).not.toBe(crowdKeyForPosition(13, 12));
    expect(crowdKeyForPosition(12, 12)).not.toBe(crowdKeyForPosition(12, 13));
    // Not symmetric under swapping the axes, which a single-multiplier key
    // would be and which would merge (12,16) with (16,12).
    expect(crowdKeyForPosition(12, 16)).not.toBe(crowdKeyForPosition(16, 12));
  });

  it('separates two actors a whole sub-tile step apart and merges two within one step', () => {
    const step = 1 / CROWD_POSITION_QUANTUM;
    expect(crowdKeyForPosition(12 + step, 12)).not.toBe(crowdKeyForPosition(12, 12));
    expect(crowdKeyForPosition(12 + step / 4, 12)).toBe(crowdKeyForPosition(12, 12));
  });

  it('quantises at the resolution the render channel publishes', () => {
    // The one number this module states that another module also states. A
    // coarser quantum here would merge two positions the wire can tell apart;
    // a finer one would fail to merge two the wire cannot.
    expect(CROWD_POSITION_QUANTUM).toBe(RENDER_ACTORS_SUBTILE_UNITS);
  });

  it('keeps negative coordinates apart, since a prison may be zoned north-west of the origin', () => {
    const keys = new Set([
      crowdKeyForPosition(-3, -4),
      crowdKeyForPosition(-4, -3),
      crowdKeyForPosition(3, -4),
      crowdKeyForPosition(-3, 4),
      crowdKeyForPosition(3, 4),
    ]);
    expect(keys.size).toBe(5);
    expect(keys.has(NO_CROWD_KEY)).toBe(false);
  });

  it('declines to group a position too far out to pack, rather than colliding with a distant one', () => {
    expect(crowdKeyForPosition(1e9, 0)).toBe(NO_CROWD_KEY);
    expect(crowdKeyForPosition(0, 1e9)).toBe(NO_CROWD_KEY);
    expect(crowdKeyForPosition(Number.NaN, 0)).toBe(NO_CROWD_KEY);
    expect(crowdKeyForPosition(0, Number.POSITIVE_INFINITY)).toBe(NO_CROWD_KEY);
  });

  it('packs every key inside the exactly-representable integer range', () => {
    for (const [x, y] of [
      [262_143, 131_071],
      [-262_144, -131_072],
      [0, 0],
    ] as const) {
      const key = crowdKeyForPosition(x, y);
      expect(key).not.toBe(NO_CROWD_KEY);
      expect(Number.isSafeInteger(key)).toBe(true);
    }
  });
});
