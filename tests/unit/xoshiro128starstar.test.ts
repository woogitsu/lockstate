import { describe, expect, it } from 'vitest';
import { Xoshiro128StarStar } from '../../src/simulation/rng';

describe('xoshiro128**', () => {
  it('matches the deterministic golden vector for a known state', () => {
    const rng = new Xoshiro128StarStar([1, 2, 3, 4]);
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]).toEqual([11520, 0, 5927040, 70819200]);
  });

  it('snapshots serializable state and rejects invalid state', () => {
    const rng = new Xoshiro128StarStar([1, 2, 3, 4]);
    rng.nextUint32();
    expect(new Xoshiro128StarStar(rng.snapshot().words).nextUint32()).toBe(rng.nextUint32());
    expect(() => new Xoshiro128StarStar([0, 0, 0, 0])).toThrow(RangeError);
  });
});
