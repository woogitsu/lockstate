import { describe, expect, it } from 'vitest';
import {
  assertGaplessSchedule,
  DAY_LENGTH_TICKS,
  DEFAULT_REGIME_SCHEDULES,
  findRegimeSchedule,
  GENERAL_POPULATION_REGIME,
  HIGH_RISK_REGIME,
  resolveActiveRegimeBlock,
  type RegimeBlock,
  type RegimeSchedule,
} from '../../src/simulation/prisoners/regime';

/** How many of the schedule's blocks claim this tick. The invariant is: exactly one, at every tick. */
function coveringBlocks(schedule: RegimeSchedule, tickOfDay: number): readonly RegimeBlock[] {
  return schedule.blocks.filter((block) => tickOfDay >= block.startTickOfDay && tickOfDay < block.endTickOfDay);
}

describe('default regime schedules', () => {
  /**
   * Exhaustive, because the sampled version was the defect (issue #140).
   *
   * This test used to walk the day with `tickOfDay += 137` -- 18 of 2,400
   * ticks -- and assert only `not.toThrow()`, under the title "cover every
   * tick of the day exactly once". So a gap narrower than the stride was
   * invisible, and "exactly once" was never checked at all: an *overlap*
   * does not throw, because `resolveActiveRegimeBlock` returns the first
   * match rather than complaining about the second.
   *
   * Its parenthetical said the real check happens at module load, which is
   * true -- `assertGaplessSchedule` runs over `DEFAULT_REGIME_SCHEDULES`
   * there. That is exactly why this test is worth keeping rather than
   * deleting as redundant: it verifies the two schedules' *data*
   * independently of the code that claims to verify it. Today it takes two
   * mutations to ship a broken default (weaken the assert, then break the
   * data); before, it took one, because nothing else looked.
   *
   * 4,800 iterations of an array filter. Measured at 4 ms, three runs.
   */
  it('cover every tick of the day exactly once, at every tick rather than at every 137th', () => {
    for (const schedule of DEFAULT_REGIME_SCHEDULES) {
      const uncovered: number[] = [];
      const doublyCovered: number[] = [];
      const misresolved: number[] = [];

      for (let tickOfDay = 0; tickOfDay < DAY_LENGTH_TICKS; tickOfDay += 1) {
        const covering = coveringBlocks(schedule, tickOfDay);
        if (covering.length === 0) uncovered.push(tickOfDay);
        else if (covering.length > 1) doublyCovered.push(tickOfDay);
        // Identity, not equality: `find` returns the array element, so this
        // pins that the resolver picks *the* covering block and not merely an
        // equal-looking one. HIGH_RISK_REGIME has two structurally identical
        // blocks, which is what makes the distinction real here.
        else if (resolveActiveRegimeBlock(schedule, tickOfDay) !== covering[0]) misresolved.push(tickOfDay);
      }

      expect(uncovered, `${schedule.classificationGroupId}: ticks covered by no block`).toEqual([]);
      expect(doublyCovered, `${schedule.classificationGroupId}: ticks covered by more than one block`).toEqual([]);
      expect(misresolved, `${schedule.classificationGroupId}: ticks where the resolver returned the wrong block`).toEqual([]);
    }
  });

  /**
   * Every block's own boundaries, derived from the block list rather than
   * hand-picked. The two literal tests below pin what tick 499 and 500
   * actually contain; this pins that the inclusive-start/exclusive-end rule
   * holds at all 13 blocks of the two schedules, including the ones nobody
   * thought to write a literal for.
   */
  it('resolve each block at its own inclusive start and exclusive-end-minus-one', () => {
    for (const schedule of DEFAULT_REGIME_SCHEDULES) {
      for (const block of schedule.blocks) {
        expect(
          resolveActiveRegimeBlock(schedule, block.startTickOfDay),
          `${schedule.classificationGroupId}: tick ${block.startTickOfDay} is a block start and must resolve to it`,
        ).toBe(block);
        expect(
          resolveActiveRegimeBlock(schedule, block.endTickOfDay - 1),
          `${schedule.classificationGroupId}: tick ${block.endTickOfDay - 1} is the last tick of a block and must resolve to it`,
        ).toBe(block);
        // `endTickOfDay` belongs to the *next* block -- and for the last block
        // of the day it wraps to the first, which is why this holds for every
        // block without a special case.
        expect(
          resolveActiveRegimeBlock(schedule, block.endTickOfDay),
          `${schedule.classificationGroupId}: tick ${block.endTickOfDay} is exclusive and must not resolve to the block ending there`,
        ).not.toBe(block);
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

    // The exact figure, not just a floor: `docs/PRISONER_OPERATIONS.md` quotes
    // it, and the loose `> 0.8 * DAY_LENGTH_TICKS` bound this replaced was
    // satisfied by 2,000 as readily as by 2,200 -- which is how the doc came to
    // say ~83% when the schedule has said ~92% since it was written. Pinning
    // the number is what stops the two drifting apart again.
    expect(lockdownTicks(HIGH_RISK_REGIME)).toBe(2_200);
    expect(lockdownTicks(HIGH_RISK_REGIME) / DAY_LENGTH_TICKS).toBeCloseTo(0.9167, 4);
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
    // `'free-association'` joined this block in
    // [ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md):
    // both `work` and `education` are served only by actions naming a zoned
    // room, so before it the block was 500 ticks a prisoner in a prison
    // without a laundry or a classroom stood through. The boundary this test
    // is about is unchanged; the list it reads off is not.
    expect(block.allowedCategories).toEqual(['work', 'education', 'free-association']);
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

/**
 * The invariant enforcer itself, which nothing tested.
 *
 * `assertGaplessSchedule` is the reason every other schedule in this module
 * is safe to resolve, and replacing its body with `return;` left the whole
 * suite green (issue #140): the two default schedules are valid, so a
 * no-op check is indistinguishable from a working one until someone
 * authors a third schedule. These five cases are the difference.
 *
 * They also matter because the check is now exported: `buildRiotRegimeSchedule`
 * builds a schedule at runtime, and `PrisonerOperationsRuntime`'s constructor
 * options and `projectStatusStrip`'s source both accept a caller-supplied
 * array, none of which the module-load call can see.
 */
describe('assertGaplessSchedule', () => {
  const scheduleOf = (...blocks: readonly RegimeBlock[]): RegimeSchedule => ({
    classificationGroupId: 'test-group',
    blocks,
  });

  it('rejects a gap, naming the tick where coverage stopped', () => {
    // 11 ticks wide -- narrower than the 137-tick stride the old coverage
    // test walked with, which is the point.
    expect(() =>
      assertGaplessSchedule(
        scheduleOf(
          { startTickOfDay: 0, endTickOfDay: 489, allowedCategories: ['sleep'] },
          { startTickOfDay: 500, endTickOfDay: DAY_LENGTH_TICKS, allowedCategories: ['work'] },
        ),
      ),
    ).toThrow(/has a gap\/overlap at tick 489/);
  });

  it('rejects an overlap, which the resolver alone cannot detect', () => {
    // `resolveActiveRegimeBlock` would silently return the first matching
    // block for every tick in 400..499 and throw nothing, so this branch is
    // the only thing standing between an overlap and a schedule that quietly
    // ignores half of one of its own blocks.
    expect(() =>
      assertGaplessSchedule(
        scheduleOf(
          { startTickOfDay: 0, endTickOfDay: 500, allowedCategories: ['sleep'] },
          { startTickOfDay: 400, endTickOfDay: DAY_LENGTH_TICKS, allowedCategories: ['work'] },
        ),
      ),
    ).toThrow(/has a gap\/overlap at tick 500/);
  });

  it('rejects a day that ends early', () => {
    expect(() =>
      assertGaplessSchedule(scheduleOf({ startTickOfDay: 0, endTickOfDay: 2_000, allowedCategories: ['sleep'] })),
    ).toThrow(/does not cover the full day \(ends at 2000, expected 2400\)/);
  });

  it('rejects a day that runs past its end', () => {
    expect(() =>
      assertGaplessSchedule(
        scheduleOf(
          { startTickOfDay: 0, endTickOfDay: DAY_LENGTH_TICKS, allowedCategories: ['sleep'] },
          { startTickOfDay: DAY_LENGTH_TICKS, endTickOfDay: DAY_LENGTH_TICKS + 100, allowedCategories: ['work'] },
        ),
      ),
    ).toThrow(/does not cover the full day \(ends at 2500, expected 2400\)/);
  });

  it('accepts a valid schedule whose blocks are declared out of order, because it sorts first', () => {
    // Declaration order is free -- which is worth pinning, because
    // `resolveActiveRegimeBlock` searches in declaration order while this
    // function sorts, and the two must agree on which schedules are legal.
    expect(() =>
      assertGaplessSchedule(
        scheduleOf(
          { startTickOfDay: 400, endTickOfDay: DAY_LENGTH_TICKS, allowedCategories: ['work'] },
          { startTickOfDay: 0, endTickOfDay: 400, allowedCategories: ['sleep'] },
        ),
      ),
    ).not.toThrow();
  });
});
