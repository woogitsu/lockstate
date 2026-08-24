import { describe, expect, it } from 'vitest';
import {
  decayNeed,
  NEED_DECAY_PER_TICK,
  NEED_DECAY_SCALED_PER_TICK,
  NEED_IDS,
  NEED_MAX,
  NEED_MAX_SCALED,
  NEED_MIN,
  NEED_MIN_SCALED,
  NEED_SCALE,
  NeedsComponent,
} from '../../src/simulation/prisoners/needs';

describe('the scale the needs store uses', () => {
  it('represents every decay rate as a whole number of stored units per tick', () => {
    // This is the property the whole fix rests on (#259): if a rate is not a
    // whole number at this scale, `decayNeed` starts rounding again and the
    // exactness the assertions below check is gone. Adding a need with a rate
    // `NEED_SCALE` cannot express fails here, naming the need, rather than
    // silently reintroducing the defect.
    for (const needId of NEED_IDS) {
      const exact = NEED_DECAY_PER_TICK[needId] * NEED_SCALE;
      expect(NEED_DECAY_SCALED_PER_TICK[needId], `${needId} is not a whole number of stored units per tick`).toBe(exact);
      expect(Number.isInteger(NEED_DECAY_SCALED_PER_TICK[needId])).toBe(true);
      expect(NEED_DECAY_SCALED_PER_TICK[needId]).toBeGreaterThan(0);
    }
  });

  it('keeps the full stored range inside a Uint16Array', () => {
    expect(NEED_MIN_SCALED).toBe(0);
    expect(NEED_MAX_SCALED).toBe(NEED_MAX * NEED_SCALE);
    expect(NEED_MAX_SCALED).toBeLessThanOrEqual(0xffff);
  });
});

describe('decayNeed', () => {
  it('decreases by exactly the need-specific rate times ticks elapsed', () => {
    for (const needId of NEED_IDS) {
      expect(decayNeed(NEED_MAX_SCALED, needId, 10)).toBe(NEED_MAX_SCALED - NEED_DECAY_SCALED_PER_TICK[needId] * 10);
    }
  });

  it("moves every need at the decay system's cadence -- none is a fixed point", () => {
    // The regression #259 is about. Before the fix this held for `bladder`
    // alone: every other rate times the ten-tick interval was at most 0.5 of
    // a whole level, and `Math.round(n - d) === n` for such a `d`, so five of
    // the six needs never moved at any level. Stated over `NEED_IDS` so a
    // seventh need is covered with no edit here.
    for (const needId of NEED_IDS) {
      expect(decayNeed(NEED_MAX_SCALED, needId, 10), `${needId} did not decay over one 10-tick interval`).toBeLessThan(
        NEED_MAX_SCALED,
      );
    }
  });

  it('clamps at NEED_MIN_SCALED, never goes negative', () => {
    expect(decayNeed(1, 'bladder', 1_000)).toBe(NEED_MIN_SCALED);
  });

  it('clamps at NEED_MAX_SCALED for a hypothetically over-full input', () => {
    expect(decayNeed(NEED_MAX_SCALED + 500, 'sleep', 0)).toBe(NEED_MAX_SCALED);
  });

  it('is a pure function of (currentScaledLevel, needId, ticksElapsed)', () => {
    expect(decayNeed(40_000, 'hygiene', 37)).toBe(decayNeed(40_000, 'hygiene', 37));
  });

  it('gives the same result however the same total of ticks is split across calls', () => {
    // The property `decayNeed`'s own doc comment claims. It did not hold
    // before #259 -- rounding per call meant a sub-1-per-tick rate vanished
    // entirely at single-tick granularity while accumulating at the batch
    // size -- so `NeedsDecaySystem.schedule.intervalTicks` silently decided
    // which needs decayed at all. It is what makes that interval a scheduling
    // knob rather than a balance one.
    for (const needId of NEED_IDS) {
      let stepped = NEED_MAX_SCALED;
      for (let tick = 0; tick < 37; tick += 1) stepped = decayNeed(stepped, needId, 1);

      let batched = NEED_MAX_SCALED;
      for (let batch = 0; batch < 3; batch += 1) batched = decayNeed(batched, needId, batch === 2 ? 17 : 10);

      expect(stepped, `${needId} depends on how the ticks were batched`).toBe(decayNeed(NEED_MAX_SCALED, needId, 37));
      expect(batched, `${needId} depends on how the ticks were batched`).toBe(stepped);
    }
  });
});

describe('NeedsComponent', () => {
  it('starts every need at NEED_MAX for every index', () => {
    const needs = new NeedsComponent(4);
    for (const needId of NEED_IDS) {
      expect(needs.get(2, needId)).toBe(NEED_MAX);
      expect(needs.getScaled(2, needId)).toBe(NEED_MAX_SCALED);
    }
  });

  it('set() clamps into [NEED_MIN, NEED_MAX] and keeps the sub-level part', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'hunger', -50);
    expect(needs.get(0, 'hunger')).toBe(NEED_MIN);
    needs.set(0, 'hunger', 999);
    expect(needs.get(0, 'hunger')).toBe(NEED_MAX);
    needs.set(0, 'hunger', 100.6);
    expect(needs.get(0, 'hunger')).toBe(101);
    // Rounded only on the way out: the stored value still carries the .6, so
    // a later sub-level step is measured against 100.6 and not against 101.
    expect(needs.getScaled(0, 'hunger')).toBe(Math.round(100.6 * NEED_SCALE));
  });

  it('adjust() applies a delta relative to the current level', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'recreation', 100);
    needs.adjust(0, 'recreation', 20);
    expect(needs.get(0, 'recreation')).toBe(120);
    needs.adjust(0, 'recreation', -1000);
    expect(needs.get(0, 'recreation')).toBe(NEED_MIN);
  });

  it('adjust() accumulates sub-level deltas instead of rounding them away', () => {
    const needs = new NeedsComponent(1);
    needs.set(0, 'safety', 100);
    for (let i = 0; i < 10; i += 1) needs.adjust(0, 'safety', 0.1);
    expect(needs.get(0, 'safety')).toBe(101);
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

  it('snapshot/restore round-trips the sub-level remainder, not only the whole level', () => {
    // What makes a restore exact rather than merely close: a save taken part
    // of the way between two whole levels must resume from there, or a
    // restored session decays on a different phase than the one it came from.
    const needs = new NeedsComponent(1);
    needs.setScaled(0, 'hunger', 42 * NEED_SCALE + 7);

    const restored = new NeedsComponent(1);
    restored.loadSnapshot(needs.getSnapshot());

    expect(restored.getScaled(0, 'hunger')).toBe(42 * NEED_SCALE + 7);
  });

  it('restore rejects a capacity mismatch', () => {
    const needs = new NeedsComponent(3);
    const other = new NeedsComponent(5);
    expect(() => needs.loadSnapshot(other.getSnapshot())).toThrow(/capacity mismatch/);
  });
});
