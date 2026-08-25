import { describe, expect, it } from 'vitest';
import {
  STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS,
  StateIncomeSystem,
  stateIncomeAccruedByTick,
  stateIncomeForCompletedDay,
} from '../../src/simulation/economy';
import { Treasury } from '../../src/simulation/economy';
import { Kernel } from '../../src/simulation/kernel';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * ADR 0017 decision 3's income line, on decision 6's basis, at the rate the
 * owner chose (issue #29): **the state pays 300 minor units per prisoner-day,
 * per occupied place, at the end of each in-game day.**
 *
 * ## What an occupied place is, since the test names below assert it
 *
 * One unit of a registered room instance's declared capacity that a prisoner
 * currently holds -- an occupancy slot in `RoomInstanceRegistry`. Not a
 * prisoner in existence (an arrival waiting on a cell holds no slot) and not
 * an empty place (a zoned but unoccupied cell earns nothing). Both exclusions
 * are asserted here rather than described, because "per occupied place" is the
 * half of decision 6 that a plausible implementation gets wrong: paying per
 * prisoner pays for a queue, and paying per place pays for building cells and
 * leaving them empty.
 */

const TILE = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function registryWithOccupiedCells(occupied: number, freeCells = 0): RoomInstanceRegistry {
  const registry = new RoomInstanceRegistry();
  for (let index = 0; index < occupied + freeCells; index += 1) {
    registry.register({
      instanceId: `cell-${String(index)}`,
      roomCatalogId: 'room.cell',
      anchorTile: TILE(index, 0),
      capacity: 1,
      objectCapabilities: ['sleep-surface'],
    });
  }
  for (let index = 0; index < occupied; index += 1) {
    expect(registry.assign(`cell-${String(index)}`, index)).toBe(true);
  }
  return registry;
}

/** A kernel with only the income system on it, so nothing else can move the balance. */
function incomeOnlyKernel(registry: RoomInstanceRegistry, startingBalance = 0): { kernel: Kernel; treasury: Treasury } {
  const treasury = new Treasury(startingBalance);
  const kernel = new Kernel();
  kernel.registerSystem(new StateIncomeSystem(treasury, registry));
  return { kernel, treasury };
}

function step(kernel: Kernel, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) kernel.step();
}

describe('the rate, and that it is the owner`s recorded figure', () => {
  it('pays 300 minor units per prisoner-day per occupied place', () => {
    expect(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS).toBe(300);
    expect(stateIncomeForCompletedDay(1)).toBe(300);
    expect(stateIncomeForCompletedDay(7)).toBe(2_100);
  });

  it('is exact for every occupancy, so a day boundary needs no rounding and carries no remainder', () => {
    // `300 x N` is a whole number of minor units for every whole `N`, which is
    // why this module has no remainder accumulator of the kind `NEED_SCALE`
    // exists to provide. If the rate ever stops dividing the day length, this
    // assertion is the one that has to be replaced by a carry.
    for (let places = 0; places <= 64; places += 1) {
      const paid = stateIncomeForCompletedDay(places);
      expect(Number.isSafeInteger(paid)).toBe(true);
      expect(paid % STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS).toBe(0);
    }
  });

  it('refuses a negative or fractional occupancy rather than inventing a fractional payment', () => {
    expect(() => stateIncomeForCompletedDay(-1)).toThrow(RangeError);
    expect(() => stateIncomeForCompletedDay(1.5)).toThrow(RangeError);
    expect(() => stateIncomeAccruedByTick(1, -1)).toThrow(RangeError);
  });
});

describe('an occupied place is an occupancy slot a prisoner holds, not a prisoner and not a place', () => {
  it('counts a cell a prisoner occupies', () => {
    expect(registryWithOccupiedCells(3).totalOccupancy).toBe(3);
  });

  it('does not count an empty cell, so building capacity and leaving it empty earns nothing', () => {
    const registry = registryWithOccupiedCells(0, 5);
    expect(registry.totalOccupancy).toBe(0);

    const { kernel, treasury } = incomeOnlyKernel(registry);
    step(kernel, DAY_LENGTH_TICKS);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('does not count a prisoner who holds no slot, so an arrival waiting on a full cell earns nothing', () => {
    // The state a full prison puts an arrival in: `IntakeSystem` leaves it at
    // `accommodation-assignment` and increments `accommodationBacklogTicks`.
    // No `assign` succeeded, so no place is occupied and nothing is paid --
    // which is exactly the difference between "per prisoner" and "per occupied
    // place".
    const registry = registryWithOccupiedCells(1);
    expect(registry.assign('cell-0', 99)).toBe(false);
    expect(registry.totalOccupancy).toBe(1);
  });

  it('stops counting a place once its occupant is released', () => {
    const registry = registryWithOccupiedCells(2);
    registry.release('cell-0', 0);
    expect(registry.totalOccupancy).toBe(1);
    // Releasing again, or releasing somebody who was never there, cannot drive
    // the count below what is actually occupied.
    registry.release('cell-0', 0);
    registry.release('cell-1', 41);
    expect(registry.totalOccupancy).toBe(1);
  });

  it('counts one place for one prisoner even if the same assignment is repeated', () => {
    // A shared cell, because a capacity-1 instance refuses the second call on
    // capacity before it can be idempotent -- and the count must follow the set
    // rather than the call either way.
    const registry = new RoomInstanceRegistry();
    registry.register({
      instanceId: 'shared-cell',
      roomCatalogId: 'room.cell',
      anchorTile: TILE(0, 0),
      capacity: 2,
      objectCapabilities: ['sleep-surface'],
    });
    expect(registry.assign('shared-cell', 7)).toBe(true);
    expect(registry.assign('shared-cell', 7)).toBe(true);
    expect(registry.totalOccupancy).toBe(1);
    expect(registry.assign('shared-cell', 8)).toBe(true);
    expect(registry.totalOccupancy).toBe(2);
  });

  it('recounts occupied places from a restored snapshot rather than trusting a stored total', () => {
    const source = registryWithOccupiedCells(2, 1);
    const restored = registryWithOccupiedCells(0, 3);
    restored.loadSnapshot(source.getSnapshot());
    expect(restored.totalOccupancy).toBe(2);

    // And a restore is a *replacement*, not an addition: a registry that
    // already held occupants must not end up counting both sets.
    const dirty = registryWithOccupiedCells(3);
    dirty.loadSnapshot(source.getSnapshot());
    expect(dirty.totalOccupancy).toBe(2);
  });
});

describe('the day boundary: paid at the end of the day, and not before', () => {
  it('pays nothing on tick 0, because a day not yet served has earned nothing', () => {
    const { kernel, treasury } = incomeOnlyKernel(registryWithOccupiedCells(4));
    kernel.step();
    expect(kernel.tick).toBe(1);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('pays nothing on any tick before the last one of the day', () => {
    const { kernel, treasury } = incomeOnlyKernel(registryWithOccupiedCells(4));
    step(kernel, DAY_LENGTH_TICKS - 1);
    expect(kernel.tick).toBe(DAY_LENGTH_TICKS - 1);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('credits exactly 300 x occupied places on the last tick of the day', () => {
    const { kernel, treasury } = incomeOnlyKernel(registryWithOccupiedCells(4));
    step(kernel, DAY_LENGTH_TICKS);
    expect(treasury.balanceMinorUnits).toBe(1_200);
  });

  it('pays once per day and no more, over three days', () => {
    const { kernel, treasury } = incomeOnlyKernel(registryWithOccupiedCells(2));
    for (let day = 1; day <= 3; day += 1) {
      step(kernel, DAY_LENGTH_TICKS);
      expect(treasury.balanceMinorUnits, `after day ${String(day)}`).toBe(600 * day);
    }
  });

  it('the phase is the last tick of the day, not the first', () => {
    // The measured reason phase 0 was rejected: the kernel evaluates
    // `tick % intervalTicks === phaseTicks` *before* advancing the tick, so a
    // phase-0 system fires on tick 0 -- paying for a day nobody has served.
    const system = new StateIncomeSystem(new Treasury(0), registryWithOccupiedCells(1));
    expect(system.schedule).toEqual({ intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 });
  });
});

describe('zero prisoners means zero income, and no crash', () => {
  it('runs a whole day against an empty prison and changes nothing', () => {
    const registry = new RoomInstanceRegistry();
    const { kernel, treasury } = incomeOnlyKernel(registry, 25_000);
    step(kernel, DAY_LENGTH_TICKS * 2);
    expect(treasury.balanceMinorUnits).toBe(25_000);
    expect(stateIncomeAccruedByTick(0, 1_234)).toBe(0);
  });
});

describe('the "earned today" readout matches what is actually credited', () => {
  it('equals the day`s payment exactly on the tick the payment is made', () => {
    for (const places of [0, 1, 3, 8, 17, 142, 5_000]) {
      expect(stateIncomeAccruedByTick(places, DAY_LENGTH_TICKS - 1)).toBe(stateIncomeForCompletedDay(places));
      // And on the same tick of any later day, since the readout is about the
      // day in progress rather than the session.
      expect(stateIncomeAccruedByTick(places, DAY_LENGTH_TICKS * 9 - 1)).toBe(stateIncomeForCompletedDay(places));
    }
  });

  it('rises through the day and resets when the day does', () => {
    const places = 8;
    let previous = -1;
    for (let tickOfDay = 0; tickOfDay < DAY_LENGTH_TICKS; tickOfDay += 1) {
      const accrued = stateIncomeAccruedByTick(places, tickOfDay);
      expect(accrued, `tick ${String(tickOfDay)}`).toBeGreaterThanOrEqual(previous);
      previous = accrued;
    }
    expect(previous).toBe(2_400);
    // The first tick of the next day is back near zero, not at yesterday's
    // total: the readout describes one day, and the day that ended was paid.
    expect(stateIncomeAccruedByTick(places, DAY_LENGTH_TICKS)).toBe(1);
  });

  it('is an integer at every tick of the day, at every occupancy', () => {
    // Money is minor units and `docs/DETERMINISM.md` makes no exception for
    // it: `300 / 2,400` is an eighth of a minor unit per tick per place, so
    // the accrual is a floored division of exact integers and never a float.
    for (const places of [1, 3, 7, 999]) {
      for (let tickOfDay = 0; tickOfDay < DAY_LENGTH_TICKS; tickOfDay += 1) {
        expect(Number.isInteger(stateIncomeAccruedByTick(places, tickOfDay))).toBe(true);
      }
    }
  });

  it('never runs ahead of what the day will pay', () => {
    // The readout is a promise about a payment. Overstating it -- even by one
    // minor unit at one tick -- would make the balance appear to lose money at
    // the boundary.
    for (const places of [1, 5, 63]) {
      for (let tickOfDay = 0; tickOfDay < DAY_LENGTH_TICKS; tickOfDay += 1) {
        expect(stateIncomeAccruedByTick(places, tickOfDay)).toBeLessThanOrEqual(stateIncomeForCompletedDay(places));
      }
    }
  });

  it('reads the same figure from the system as the projection derives', () => {
    const registry = registryWithOccupiedCells(3);
    const system = new StateIncomeSystem(new Treasury(0), registry);
    expect(system.accruedThisDay(1_199)).toBe(stateIncomeAccruedByTick(3, 1_199));
    expect(system.accruedThisDay(DAY_LENGTH_TICKS - 1)).toBe(stateIncomeForCompletedDay(3));
  });
});
