import { describe, expect, it } from 'vitest';
import { remainingSentenceTicks, remainingSentenceDays } from '../../src/ui/prisoner-sentence';

describe('sentence durations use simulation time (#958)', () => {
  const record = { classified: true, sentence: { endTick: 7300, lengthTicks: 7200 } };
  it('counts down from the observation, with zero rather than a negative duration at the deadline', () => {
    expect(remainingSentenceTicks(record, 100)).toBe(7200);
    expect(remainingSentenceTicks(record, 2500)).toBe(4800);
    expect(remainingSentenceTicks(record, 7300)).toBe(0);
    expect(remainingSentenceTicks(record, 7320)).toBe(0);
  });
  it('does not invent a deadline before classification or after an unsigned wrap', () => {
    expect(remainingSentenceTicks({ ...record, classified: false }, 100)).toBeUndefined();
    expect(remainingSentenceTicks({ classified: true, sentence: { endTick: 10, lengthTicks: 0xffff_ffff } }, 100)).toBeUndefined();
    expect(remainingSentenceTicks(record, undefined)).toBeUndefined();
  });
  it('uses the published day length and distinguishes an unknown clock from zero remaining', () => {
    expect(remainingSentenceDays(4800, 2400)).toBe(2);
    expect(remainingSentenceDays(4800, 1200)).toBe(4);
    expect(remainingSentenceDays(1200, 2400)).toBe(0.5);
    expect(remainingSentenceDays(0, 2400)).toBe(0);
    expect(remainingSentenceDays(4800, 0)).toBeUndefined();
    expect(remainingSentenceDays(undefined, 2400)).toBeUndefined();
  });
});

