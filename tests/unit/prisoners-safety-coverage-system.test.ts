import { describe, expect, it } from 'vitest';
import {
  NEED_DECAY_SCALED_PER_TICK,
  NEED_MAX_SCALED,
  NEED_MIN_SCALED,
  NEED_SCALE,
  NeedsComponent,
  SAFETY_COVERAGE_PROVISION_SCALED_PER_TICK,
} from '../../src/simulation/prisoners/needs';
import { EMPTY_SAFETY_COVERAGE_CENSUS, SafetyCoverageSystem } from '../../src/simulation/prisoners/safety-coverage-system';
import type { SimulationContext } from '../../src/simulation/kernel/system';

/**
 * **What coverage puts into the `safety` need, per rung** (issue #588).
 *
 * Driven directly rather than through a session, so what each rung provisions
 * is separable from what the rest of the prison is doing to the same need --
 * `tests/integration/coverage-safety-loop.test.ts` is where the two are
 * measured together on a real prison. Every expected level below is written as
 * arithmetic over the exported rates, never as a literal copied out of a run:
 * a fixture that hard-coded 51,000 would pass for any implementation that
 * happened to clamp.
 */

const SECTOR = 'sector-a';

function context(tick: number): SimulationContext {
  return { tick } as SimulationContext;
}

interface Harness {
  readonly needs: NeedsComponent;
  readonly system: SafetyCoverageSystem;
}

function harness(report: readonly { sectorId: string; required: number; assigned: number; shortage: number }[], occupants: readonly number[]): Harness {
  const needs = new NeedsComponent(8);
  const system = new SafetyCoverageSystem(
    { getCoverageReport: () => report },
    (sectorId) => (sectorId === SECTOR ? occupants : []),
    { getIndex: (entityId: number) => entityId },
    needs,
  );
  return { needs, system };
}

/** `intervalTicks` is 10, and `provisionSafety` is linear in it -- so one update is ten ticks' worth. */
const PER_UPDATE = 10;

describe('a covered sector', () => {
  it('provisions the full rate, and out-runs the decay of the same ten ticks', () => {
    const { needs, system } = harness([{ sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 }], [0]);
    needs.setScaled(0, 'safety', NEED_MAX_SCALED / 2);
    const before = needs.getScaled(0, 'safety');

    system.update(context(10));

    expect(needs.getScaled(0, 'safety') - before).toBe(SAFETY_COVERAGE_PROVISION_SCALED_PER_TICK.covered * PER_UPDATE);
    // The claim that makes `covered` the top rung: what it puts in is more than
    // `NeedsDecaySystem` takes out over the same ten ticks, so a covered
    // prisoner climbs.
    expect(SAFETY_COVERAGE_PROVISION_SCALED_PER_TICK.covered).toBeGreaterThan(NEED_DECAY_SCALED_PER_TICK.safety);
  });

  it('clamps at the ceiling rather than overflowing the stored range', () => {
    const { needs, system } = harness([{ sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 }], [0]);
    system.update(context(10));
    expect(needs.getScaled(0, 'safety')).toBe(NEED_MAX_SCALED);
  });
});

describe('an understaffed sector', () => {
  it('provisions exactly half of the full rate', () => {
    const { needs, system } = harness([{ sectorId: SECTOR, required: 2, assigned: 1, shortage: 1 }], [0]);
    needs.setScaled(0, 'safety', NEED_MAX_SCALED / 2);
    const before = needs.getScaled(0, 'safety');

    system.update(context(10));

    const gained = needs.getScaled(0, 'safety') - before;
    expect(gained).toBe(SAFETY_COVERAGE_PROVISION_SCALED_PER_TICK.understaffed * PER_UPDATE);
    // "Half" as a fact about the ladder rather than as two numbers that happen
    // to be related: the covered rate is exactly twice this one.
    expect(gained * 2).toBe(SAFETY_COVERAGE_PROVISION_SCALED_PER_TICK.covered * PER_UPDATE);
    // And it is the *middle* rung in the sense that matters: it does not keep
    // up with the decay, so an understaffed prisoner still falls -- slowly.
    expect(SAFETY_COVERAGE_PROVISION_SCALED_PER_TICK.understaffed).toBeLessThan(NEED_DECAY_SCALED_PER_TICK.safety);
  });
});

describe('an unguarded sector', () => {
  it('provisions nothing, and never subtracts', () => {
    const { needs, system } = harness([{ sectorId: SECTOR, required: 1, assigned: 0, shortage: 1 }], [0]);
    needs.setScaled(0, 'safety', NEED_MAX_SCALED / 2);
    const before = needs.getScaled(0, 'safety');

    system.update(context(10));

    // Exactly unchanged. What makes an unguarded prisoner unsafe is
    // `NeedsDecaySystem` continuing unopposed, and this system manufacturing a
    // drain of its own would double-charge it -- and would let a security lapse
    // push a need below where decay alone could take it.
    expect(needs.getScaled(0, 'safety')).toBe(before);
  });

  it('leaves a floored need on the floor rather than driving it negative', () => {
    const { needs, system } = harness([{ sectorId: SECTOR, required: 1, assigned: 0, shortage: 1 }], [0]);
    needs.setScaled(0, 'safety', NEED_MIN_SCALED);
    system.update(context(10));
    expect(needs.getScaled(0, 'safety')).toBe(NEED_MIN_SCALED);
  });
});

describe('the walk itself', () => {
  it('touches only `safety`, and only the prisoners the sector holds', () => {
    const { needs, system } = harness([{ sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 }], [1]);
    for (const index of [0, 1, 2]) needs.set(index, 'safety', 10);
    needs.set(1, 'sleep', 10);
    needs.set(1, 'hunger', 10);

    system.update(context(10));

    expect(needs.getScaled(1, 'safety')).toBeGreaterThan(10 * NEED_SCALE);
    // Slot 0 and slot 2 are alive and hold the same starting level; they are
    // simply not in the sector, and nothing may reach them.
    expect(needs.getScaled(0, 'safety')).toBe(10 * NEED_SCALE);
    expect(needs.getScaled(2, 'safety')).toBe(10 * NEED_SCALE);
    // And the other five needs of the prisoner who *was* provisioned are
    // untouched: this is a reader into one need, not a general restorer.
    expect(needs.getScaled(1, 'sleep')).toBe(10 * NEED_SCALE);
    expect(needs.getScaled(1, 'hunger')).toBe(10 * NEED_SCALE);
  });

  it('provisions nothing for a sector that is in the report but holds nobody', () => {
    const { needs, system } = harness([{ sectorId: 'somewhere-else', required: 1, assigned: 1, shortage: 0 }], [0]);
    needs.set(0, 'safety', 10);
    system.update(context(10));
    expect(needs.getScaled(0, 'safety')).toBe(10 * NEED_SCALE);
  });

  it('is linear in the ticks, so the cadence is a scheduling choice and not a balance one', () => {
    const once = harness([{ sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 }], [0]);
    const thrice = harness([{ sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 }], [0]);
    for (const it of [once, thrice]) it.needs.setScaled(0, 'safety', NEED_MIN_SCALED);

    once.system.update(context(10));
    once.system.update(context(20));
    once.system.update(context(30));
    thrice.system.update(context(10));

    expect(once.needs.getScaled(0, 'safety')).toBe(3 * thrice.needs.getScaled(0, 'safety'));
  });
});

describe('the census the status strip reads', () => {
  it('is the empty prison until the first update, and never a guess', () => {
    const { system } = harness([{ sectorId: SECTOR, required: 1, assigned: 0, shortage: 1 }], [0, 1, 2]);
    expect(system.getCensus()).toEqual(EMPTY_SAFETY_COVERAGE_CENSUS);
  });

  it('counts the population onto the rung its own sector is on', () => {
    const { system } = harness([{ sectorId: SECTOR, required: 2, assigned: 1, shortage: 1 }], [0, 1, 2, 3]);
    system.update(context(10));
    expect(system.getCensus()).toEqual({ covered: 0, understaffed: 4, unguarded: 0 });
  });

  it('splits a population across sectors on different rungs', () => {
    const needs = new NeedsComponent(8);
    const system = new SafetyCoverageSystem(
      {
        getCoverageReport: () => [
          { sectorId: 'covered-wing', required: 1, assigned: 1, shortage: 0 },
          { sectorId: 'dark-wing', required: 1, assigned: 0, shortage: 1 },
        ],
      },
      (sectorId) => (sectorId === 'covered-wing' ? [0, 1, 2] : [3]),
      { getIndex: (entityId: number) => entityId },
      needs,
    );

    system.update(context(10));

    expect(system.getCensus()).toEqual({ covered: 3, understaffed: 0, unguarded: 1 });
    // The census is not a second opinion: the prisoner counted `unguarded` is
    // the one nothing provisioned.
    expect(needs.getScaled(0, 'safety')).toBe(NEED_MAX_SCALED);
    expect(needs.getScaled(3, 'safety')).toBe(NEED_MAX_SCALED);
    needs.setScaled(3, 'safety', 0);
    system.update(context(20));
    expect(needs.getScaled(3, 'safety')).toBe(0);
  });

  it('is rebuilt from scratch on each update rather than accumulated', () => {
    const { system } = harness([{ sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 }], [0, 1]);
    system.update(context(10));
    system.update(context(20));
    expect(system.getCensus()).toEqual({ covered: 2, understaffed: 0, unguarded: 0 });
  });
});

/**
 * **`takeCensus` is the census walk with the provisioning turned off, for a
 * restore.**
 *
 * A restored session arrives paused and its status counts are published before
 * any tick runs, so `getCensus`'s "empty until the first update" is not a
 * ten-tick staleness there -- it is however long the player leaves the game
 * paused, and a twelve-prisoner prison reading `0 COVERAGE` under the green
 * `Covered` badge for all of it. `src/simulation/runtime/restore-session.ts`
 * is the caller; `tests/integration/session-save-round-trip.test.ts` measures
 * it on a real save. These four are the properties that call depends on.
 */
describe('the census a restore takes', () => {
  it('answers the same thing an update would, without an update', () => {
    const walked = harness([{ sectorId: SECTOR, required: 2, assigned: 1, shortage: 1 }], [0, 1, 2, 3]);
    const restored = harness([{ sectorId: SECTOR, required: 2, assigned: 1, shortage: 1 }], [0, 1, 2, 3]);

    walked.system.update(context(10));
    restored.system.takeCensus(10);

    // Against the walk rather than against a literal: the two are required to
    // agree, and a copied `{ understaffed: 4 }` would hold for an
    // implementation where they did not.
    expect(restored.system.getCensus()).toEqual(walked.system.getCensus());
  });

  it('provisions nothing, because no time passed between the save and the load', () => {
    const { needs, system } = harness([{ sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 }], [0]);
    // Below the ceiling on purpose: `provisionSafety` clamps, so a covered
    // prisoner already at `NEED_MAX_SCALED` would hide a spurious provision.
    needs.setScaled(0, 'safety', NEED_MAX_SCALED / 2);
    const before = needs.getScaled(0, 'safety');

    system.takeCensus(10);

    expect(needs.getScaled(0, 'safety')).toBe(before);
    expect(system.getCensus()).toEqual({ covered: 1, understaffed: 0, unguarded: 0 });
  });

  it('asks the deployment report about the tick it was given', () => {
    const needs = new NeedsComponent(8);
    const asked: number[] = [];
    const system = new SafetyCoverageSystem(
      {
        getCoverageReport: (tick: number) => {
          asked.push(tick);
          // A security schedule whose blocks differ across the day is the
          // reason the tick is a parameter at all: the same sector is covered
          // at one hour and unguarded at another, so a restore that asked
          // about tick 0 instead of the tick it restored to would report the
          // wrong rung for the prison the player is looking at.
          return [{ sectorId: SECTOR, required: 1, assigned: tick >= 5_000 ? 1 : 0, shortage: tick >= 5_000 ? 0 : 1 }];
        },
      },
      (sectorId) => (sectorId === SECTOR ? [0, 1] : []),
      { getIndex: (entityId: number) => entityId },
      needs,
    );

    system.takeCensus(7_000);

    expect(asked).toEqual([7_000]);
    expect(system.getCensus()).toEqual({ covered: 2, understaffed: 0, unguarded: 0 });
  });

  it('replaces the census rather than adding to it, so a second load is not a double count', () => {
    const { system } = harness([{ sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 }], [0, 1]);
    system.takeCensus(10);
    system.takeCensus(20);
    expect(system.getCensus()).toEqual({ covered: 2, understaffed: 0, unguarded: 0 });
  });
});
