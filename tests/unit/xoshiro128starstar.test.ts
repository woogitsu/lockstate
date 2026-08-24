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

  /**
   * The three assertions above are reflexive plus two inequalities, and they
   * hold for *any* injective derivation -- including one that mixes the seed
   * differently. #264 S16 measured that: shifting `<< 32n` to `<< 31n` in
   * `deriveXoshiroState` left this file green, and was killed only
   * incidentally, by two scenario-outcome tests whose assertions happened to
   * move.
   *
   * Under ADR 0009 the derivation is a **cross-version identity**: a
   * challenge submission is replayed on a later build, and a run is ranked on
   * the assumption that the same master seed reproduces the same streams. A
   * derivation that changed between builds would not fail loudly; it would
   * silently rank a replay that diverged. That is exactly what a golden
   * vector is for, and the generator immediately above already has one --
   * this is the same guard for the half that feeds it.
   *
   * These literals were produced by this implementation and then cross-checked
   * against an independent transcription of the same algorithm, which agreed
   * on all five. That agreement proves the transcription, not the algorithm:
   * what the literals pin is that **today's output does not change**, which is
   * the property ADR 0009 depends on.
   */
  it('matches the deterministic golden vector for the stream derivation', () => {
    expect(deriveXoshiroState(42, 'ai.needs').words).toEqual([2014678705, 1904603032, 4243982547, 225317777]);

    // Both ends of the documented uint32 master-seed range, because the seed
    // is shifted into the high half and a mistake there is invisible in the
    // middle of the range.
    expect(deriveXoshiroState(0, 'ai.needs').words).toEqual([1912546602, 1718797919, 704379045, 2487675909]);
    expect(deriveXoshiroState(0xffff_ffff, 'ai.needs').words).toEqual([2835215313, 2454136822, 2282925149, 1192277980]);

    // Same seed, different stream: pins the name half of the mix, which the
    // inequality above only proves to be *some* function of the name.
    expect(deriveXoshiroState(42, 'economy').words).toEqual([668949069, 2655246761, 691499227, 3049179604]);

    // A single-character name, so the FNV-1a loop is pinned at one iteration
    // as well as at eight.
    expect(deriveXoshiroState(1, 'a').words).toEqual([2913672315, 1428944273, 3008891057, 3954192966]);
  });

  it('rejects a master seed outside uint32 and a stream name that is not a stable identifier', () => {
    expect(() => deriveXoshiroState(-1, 'ai.needs')).toThrow(RangeError);
    expect(() => deriveXoshiroState(0x1_0000_0000, 'ai.needs')).toThrow(RangeError);
    expect(() => deriveXoshiroState(1.5, 'ai.needs')).toThrow(RangeError);
    expect(() => deriveXoshiroState(42, 'AI.needs')).toThrow(RangeError);
    expect(() => deriveXoshiroState(42, '1ai')).toThrow(RangeError);
    expect(() => deriveXoshiroState(42, '')).toThrow(RangeError);

    // Both bounds admitted, not only refused: a derivation that rejected what
    // the documented range permits would be a defect rather than hardening.
    expect(() => deriveXoshiroState(0, 'ai.needs')).not.toThrow();
    expect(() => deriveXoshiroState(0xffff_ffff, 'a-b:c.d0')).not.toThrow();
  });
});
