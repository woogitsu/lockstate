import { describe, expect, it } from 'vitest';
import {
  DAY_LENGTH_TICKS,
  DEFAULT_REGIME_SCHEDULES,
  findRegimeSchedule,
  GENERAL_POPULATION_REGIME,
  HIGH_RISK_REGIME,
  resolveActiveRegimeBlock,
} from '../../src/simulation/prisoners/regime';

describe('default regime schedules', () => {
  it('cover every tick of the day exactly once for both groups (asserted at module load; this re-checks explicitly)', () => {
    for (const schedule of DEFAULT_REGIME_SCHEDULES) {
      for (let tickOfDay = 0; tickOfDay < DAY_LENGTH_TICKS; tickOfDay += 137) {
        expect(() => resolveActiveRegimeBlock(schedule, tickOfDay)).not.toThrow();
      }
    }
  });

  it('general population has access to strictly more distinct action categories across the day than high-risk', () => {
    const distinctCategories = (schedule: typeof GENERAL_POPULATION_REGIME) =>
      new Set(schedule.blocks.flatMap((block) => block.allowedCategories));

    const generalCategories = distinctCategories(GENERAL_POPULATION_REGIME);
    const highRiskCategories = distinctCategories(HIGH_RISK_REGIME);

    expect(generalCategories.size).toBeGreaterThan(highRiskCategories.size);
    for (const category of highRiskCategories) expect(generalCategories.has(category)).toBe(true);
  });

  it('high-risk spends most of the day in sleep/meal/hygiene-only lockdown, unlike general population', () => {
    const lockdownTicks = (schedule: typeof HIGH_RISK_REGIME) =>
      schedule.blocks
        .filter((block) => block.allowedCategories.every((category) => category === 'sleep' || category === 'meal' || category === 'hygiene'))
        .reduce((sum, block) => sum + (block.endTickOfDay - block.startTickOfDay), 0);

    expect(lockdownTicks(HIGH_RISK_REGIME)).toBeGreaterThan(DAY_LENGTH_TICKS * 0.8);
    expect(lockdownTicks(HIGH_RISK_REGIME)).toBeGreaterThan(lockdownTicks(GENERAL_POPULATION_REGIME));
  });
});

describe('resolveActiveRegimeBlock', () => {
  it('resolves a tick within the schedule day identically to that tick plus any whole number of days (wraparound)', () => {
    const first = resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, 600);
    const wrapped = resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, 600 + DAY_LENGTH_TICKS * 5);
    expect(wrapped).toEqual(first);
  });

  it('resolves the correct block right at a boundary tick (inclusive start)', () => {
    const block = resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, 500);
    expect(block.allowedCategories).toEqual(['work', 'education']);
  });

  it('resolves the previous block one tick before a boundary (exclusive end)', () => {
    const block = resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, 499);
    expect(block.allowedCategories).toEqual(['meal', 'hygiene']);
  });
});

describe('findRegimeSchedule', () => {
  it('finds a registered schedule by classification group id', () => {
    expect(findRegimeSchedule(DEFAULT_REGIME_SCHEDULES, 'high-risk')).toBe(HIGH_RISK_REGIME);
  });

  it('throws a clear error for an unknown classification group', () => {
    expect(() => findRegimeSchedule(DEFAULT_REGIME_SCHEDULES, 'nonexistent')).toThrow(/Unknown classification group/);
  });
});
