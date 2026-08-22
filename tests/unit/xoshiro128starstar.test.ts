import { describe, expect, it } from 'vitest';
import { NamedRngStreams, Xoshiro128StarStar, deriveXoshiroState } from '../../src/simulation/rng';

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

  it('provides bounded integers and normalized floats without modulo bias', () => {
    const rng = new Xoshiro128StarStar([1, 2, 3, 4]);
    for (let index = 0; index < 100; index += 1) {
      expect(rng.nextInt(7)).toBeGreaterThanOrEqual(0);
      expect(rng.nextInt(7)).toBeLessThan(7);
      expect(rng.nextFloat()).toBeGreaterThanOrEqual(0);
      expect(rng.nextFloat()).toBeLessThan(1);
    }
    expect(() => rng.nextInt(0)).toThrow(RangeError);
  });

  it('keeps named streams isolated and snapshots in stable order', () => {
    const streams = new NamedRngStreams([
      { name: 'economy', state: { algorithm: 'xoshiro128**', version: 1, words: [1, 2, 3, 4] } },
      { name: 'ai.needs', state: { algorithm: 'xoshiro128**', version: 1, words: [5, 6, 7, 8] } },
    ]);
    const before = streams.get('ai.needs').snapshot();
    streams.get('economy').nextUint32();
    expect(streams.get('ai.needs').snapshot()).toEqual(before);
    expect(streams.snapshot().map((entry) => entry.name)).toEqual(['ai.needs', 'economy']);
  });

  it('derives reproducible independent states from master seed and stable names', () => {
    expect(deriveXoshiroState(42, 'ai.needs')).toEqual(deriveXoshiroState(42, 'ai.needs'));
    expect(deriveXoshiroState(42, 'ai.needs')).not.toEqual(deriveXoshiroState(42, 'economy'));
    expect(deriveXoshiroState(42, 'ai.needs')).not.toEqual(deriveXoshiroState(43, 'ai.needs'));
  });
});
