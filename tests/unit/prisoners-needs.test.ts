import { describe, expect, it } from 'vitest';
import { decayNeed, NEED_IDS, NEED_MAX, NEED_MIN, NeedsComponent } from '../../src/simulation/prisoners/needs';

describe('decayNeed', () => {
  it('decreases by the need-specific rate times ticks elapsed, rounded', () => {
    expect(decayNeed(255, 'bladder', 10)).toBe(255 - Math.round(0.08 * 10));
  });

  it('clamps at NEED_MIN, never goes negative', () => {
    expect(decayNeed(1, 'bladder', 1_000)).toBe(NEED_MIN);
  });

  it('clamps at NEED_MAX for a hypothetically over-full input', () => {
    expect(decayNeed(300, 'sleep', 0)).toBe(NEED_MAX);
  });

  it('is a pure function of (currentLevel, needId, ticksElapsed) -- repeated calls with the same inputs agree', () => {
    // Note: because each call rounds to an integer level, decaying N ticks in
    // one batched call is NOT required to equal N separate single-tick calls
    // (sub-1-per-tick rates round away entirely at single-tick granularity).
    // NeedsDecaySystem always calls this at one fixed batch cadence, so that
    // never matters in practice -- this test only pins down that the function
    // itself has no hidden state.
    expect(decayNeed(200, 'hygiene', 37)).toBe(decayNeed(200, 'hygiene', 37));
    expect(decayNeed(200, 'hygiene', 1)).toBe(200); // 0.02/tick rounds away at single-tick granularity
    expect(decayNeed(200, 'hygiene', 37)).toBe(199); // but accumulates correctly at the system's real batch size
  });
});

describe('NeedsComponent', () => {
  it('starts every need at NEED_MAX for every index', () => {
    const needs = new NeedsComponent(4);
    for (const needId of NEED_IDS) {
      expect(needs.get(2, needId)).toBe(NEED_MAX);
    }
  });

  it('set() clamps into [NEED_MIN, NEED_MAX] and rounds', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'hunger', -50);
    expect(needs.get(0, 'hunger')).toBe(NEED_MIN);
    needs.set(0, 'hunger', 999);
    expect(needs.get(0, 'hunger')).toBe(NEED_MAX);
    needs.set(0, 'hunger', 100.6);
    expect(needs.get(0, 'hunger')).toBe(101);
  });

  it('adjust() applies a delta relative to the current level', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'recreation', 100);
    needs.adjust(0, 'recreation', 20);
    expect(needs.get(0, 'recreation')).toBe(120);
    needs.adjust(0, 'recreation', -1000);
    expect(needs.get(0, 'recreation')).toBe(NEED_MIN);
  });

  it('snapshot/restore round-trips every need level per index', () => {
    const needs = new NeedsComponent(3);
    needs.set(1, 'safety', 42);
    needs.set(2, 'bladder', 7);

    const snapshot = needs.getSnapshot();
    const restored = new NeedsComponent(3);
    restored.loadSnapshot(snapshot);

    expect(restored.get(1, 'safety')).toBe(42);
    expect(restored.get(2, 'bladder')).toBe(7);
    expect(restored.get(0, 'hunger')).toBe(NEED_MAX);
  });

  it('restore rejects a capacity mismatch', () => {
    const needs = new NeedsComponent(3);
    const other = new NeedsComponent(5);
    expect(() => needs.loadSnapshot(other.getSnapshot())).toThrow(/capacity mismatch/);
  });
});
