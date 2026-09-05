import { describe, expect, it } from 'vitest';
import {
  STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS,
  STATE_INCOME_UNMET_NEED_LEVEL,
  STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS,
  StateIncomeSystem,
  stateIncomeAccruedByTick,
  stateIncomeForCompletedDay,
  stateIncomeForOccupiedPlaces,
  stateIncomeForPrisonerDay,
  stateIncomeForPrisonerDayAt,
  unmetNeedCount,
  type PrisonerDayGrantSource,
} from '../../src/simulation/economy';
import { LoanBook, Treasury } from '../../src/simulation/economy';
import { Kernel } from '../../src/simulation/kernel';
import { NEED_IDS, NEED_MAX, NeedsComponent, type NeedId } from '../../src/simulation/prisoners/needs';
import {
  RoomInstanceRegistry,
  residentsWithExistingPlace,
  residentsWithoutExistingPlace,
} from '../../src/simulation/prisoners/room-instance-registry';
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
      residentCapacity: 1, concurrentUseCapacity: 1,
      objectCapabilities: ['sleep-surface'],
    });
  }
  for (let index = 0; index < occupied; index += 1) {
    expect(registry.assign(`cell-${String(index)}`, index)).toBe(true);
  }
  return registry;
}


/**
 * A `PrisonerDayGrantSource` over `registry`, where entity id `n` is prisoner
 * index `n` and every need starts at `NEED_MAX`.
 *
 * A hand-built source rather than a session runtime, so the arithmetic here is
 * tested against need levels this file sets. The behaviour of a *real* prison
 * -- which needs a prison of cells actually leaves unmet, and what that costs
 * over days of play -- is `tests/integration/needs-state-grant-loop.test.ts`,
 * and neither file substitutes for the other.
 */
function prisonOf(registry: RoomInstanceRegistry, capacity = 64): PrisonerDayGrantSource {
  return {
    roomInstances: registry,
    entityStore: { getIndex: (entityId: number) => entityId },
    needs: new NeedsComponent(capacity),
  };
}

/** `count` of the six needs driven to the floor for the prisoner at `index`, in `NEED_IDS` order. */
function floorNeeds(source: PrisonerDayGrantSource, index: number, count: number): void {
  for (let need = 0; need < count; need += 1) source.needs.set(index, NEED_IDS[need] as NeedId, 0);
}

/** A prison of `occupied` fully served prisoners: what the state pays before any withholding. */
function wellRunPrison(occupied: number, freeCells = 0): PrisonerDayGrantSource {
  return prisonOf(registryWithOccupiedCells(occupied, freeCells));
}

/** A kernel with only the income system on it, so nothing else can move the balance. */
function incomeOnlyKernel(prison: PrisonerDayGrantSource, startingBalance = 0): { kernel: Kernel; treasury: Treasury } {
  const treasury = new Treasury(startingBalance);
  const kernel = new Kernel();
  kernel.registerSystem(new StateIncomeSystem(treasury, prison));
  return { kernel, treasury };
}

function step(kernel: Kernel, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) kernel.step();
}

describe('the rate, and that it is the owner`s recorded figure', () => {
  it('pays 300 minor units per prisoner-day per occupied place', () => {
    expect(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS).toBe(300);
    expect(stateIncomeForCompletedDay(wellRunPrison(1))).toBe(300);
    expect(stateIncomeForCompletedDay(wellRunPrison(7))).toBe(2_100);
  });

  it('is exact for every occupancy, so a day boundary needs no rounding and carries no remainder', () => {
    // `300 x N` is a whole number of minor units for every whole `N`, which is
    // why this module has no remainder accumulator of the kind `NEED_SCALE`
    // exists to provide. If the rate ever stops dividing the day length, this
    // assertion is the one that has to be replaced by a carry.
    for (let places = 0; places <= 64; places += 1) {
      const paid = stateIncomeForCompletedDay(wellRunPrison(places));
      expect(Number.isSafeInteger(paid)).toBe(true);
      expect(paid % STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS).toBe(0);
    }
  });

  it('refuses a negative or fractional grant rather than inventing a fractional payment', () => {
    expect(() => stateIncomeForPrisonerDay(-1)).toThrow(RangeError);
    expect(() => stateIncomeForPrisonerDay(1.5)).toThrow(RangeError);
    // More unmet needs than there are needs is not a bigger withholding, it is
    // a caller that has lost count.
    expect(() => stateIncomeForPrisonerDay(NEED_IDS.length + 1)).toThrow(RangeError);
    expect(() => stateIncomeAccruedByTick(300, -1)).toThrow(RangeError);
    expect(() => stateIncomeAccruedByTick(-1, 0)).toThrow(RangeError);
  });
});

describe('an occupied place is an occupancy slot a prisoner holds, not a prisoner and not a place', () => {
  it('counts a cell a prisoner occupies', () => {
    expect(registryWithOccupiedCells(3).totalOccupancy).toBe(3);
  });

  it('does not count an empty cell, so building capacity and leaving it empty earns nothing', () => {
    const registry = registryWithOccupiedCells(0, 5);
    expect(registry.totalOccupancy).toBe(0);

    const { kernel, treasury } = incomeOnlyKernel(prisonOf(registry));
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
      residentCapacity: 2, concurrentUseCapacity: 2,
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
    const { kernel, treasury } = incomeOnlyKernel(wellRunPrison(4));
    kernel.step();
    expect(kernel.tick).toBe(1);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('pays nothing on any tick before the last one of the day', () => {
    const { kernel, treasury } = incomeOnlyKernel(wellRunPrison(4));
    step(kernel, DAY_LENGTH_TICKS - 1);
    expect(kernel.tick).toBe(DAY_LENGTH_TICKS - 1);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('credits exactly 300 x occupied places on the last tick of the day', () => {
    const { kernel, treasury } = incomeOnlyKernel(wellRunPrison(4));
    step(kernel, DAY_LENGTH_TICKS);
    expect(treasury.balanceMinorUnits).toBe(1_200);
  });

  it('pays once per day and no more, over three days', () => {
    const { kernel, treasury } = incomeOnlyKernel(wellRunPrison(2));
    for (let day = 1; day <= 3; day += 1) {
      step(kernel, DAY_LENGTH_TICKS);
      expect(treasury.balanceMinorUnits, `after day ${String(day)}`).toBe(600 * day);
    }
  });

  it('the phase is the last tick of the day, not the first', () => {
    // The measured reason phase 0 was rejected: the kernel evaluates
    // `tick % intervalTicks === phaseTicks` *before* advancing the tick, so a
    // phase-0 system fires on tick 0 -- paying for a day nobody has served.
    const system = new StateIncomeSystem(new Treasury(0), wellRunPrison(1));
    expect(system.schedule).toEqual({ intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 });
  });
});

describe('zero prisoners means zero income, and no crash', () => {
  it('runs a whole day against an empty prison and changes nothing', () => {
    const registry = new RoomInstanceRegistry();
    const { kernel, treasury } = incomeOnlyKernel(prisonOf(registry), 25_000);
    step(kernel, DAY_LENGTH_TICKS * 2);
    expect(treasury.balanceMinorUnits).toBe(25_000);
    expect(stateIncomeAccruedByTick(0, 1_234)).toBe(0);
  });
});

describe('the "earned today" readout matches what is actually credited', () => {
  it('equals the day`s payment exactly on the tick the payment is made', () => {
    for (const grant of [0, 300, 900, 2_400, 5_100, 42_600, 1_500_000]) {
      expect(stateIncomeAccruedByTick(grant, DAY_LENGTH_TICKS - 1)).toBe(grant);
      // And on the same tick of any later day, since the readout is about the
      // day in progress rather than the session.
      expect(stateIncomeAccruedByTick(grant, DAY_LENGTH_TICKS * 9 - 1)).toBe(grant);
    }
  });

  it('rises through the day and resets when the day does', () => {
    const grant = 2_400;
    let previous = -1;
    for (let tickOfDay = 0; tickOfDay < DAY_LENGTH_TICKS; tickOfDay += 1) {
      const accrued = stateIncomeAccruedByTick(grant, tickOfDay);
      expect(accrued, `tick ${String(tickOfDay)}`).toBeGreaterThanOrEqual(previous);
      previous = accrued;
    }
    expect(previous).toBe(2_400);
    // The first tick of the next day is back near zero, not at yesterday's
    // total: the readout describes one day, and the day that ended was paid.
    expect(stateIncomeAccruedByTick(grant, DAY_LENGTH_TICKS)).toBe(1);
  });

  it('is an integer at every tick of the day, at every occupancy', () => {
    // Money is minor units and `docs/DETERMINISM.md` makes no exception for
    // it: `300 / 2,400` is an eighth of a minor unit per tick per place, so
    // the accrual is a floored division of exact integers and never a float.
    for (const grant of [300, 900, 2_100, 299_700]) {
      for (let tickOfDay = 0; tickOfDay < DAY_LENGTH_TICKS; tickOfDay += 1) {
        expect(Number.isInteger(stateIncomeAccruedByTick(grant, tickOfDay))).toBe(true);
      }
    }
  });

  it('never runs ahead of what the day will pay', () => {
    // The readout is a promise about a payment. Overstating it -- even by one
    // minor unit at one tick -- would make the balance appear to lose money at
    // the boundary.
    for (const grant of [300, 1_500, 18_900]) {
      for (let tickOfDay = 0; tickOfDay < DAY_LENGTH_TICKS; tickOfDay += 1) {
        expect(stateIncomeAccruedByTick(grant, tickOfDay)).toBeLessThanOrEqual(grant);
      }
    }
  });

  it('reads the same figure from the system as the projection derives', () => {
    const prison = wellRunPrison(3);
    const system = new StateIncomeSystem(new Treasury(0), prison);
    expect(system.accruedThisDay(1_199)).toBe(stateIncomeAccruedByTick(900, 1_199));
    expect(system.accruedThisDay(DAY_LENGTH_TICKS - 1)).toBe(stateIncomeForCompletedDay(prison));
  });
});

/**
 * **What a place pays depends on the occupant's conditions, and on what one
 * unmet need is worth** ([ADR 0064](../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md),
 * #443, #477 -- as amended 2026-09-03).
 *
 * The arithmetic of the rule, against need levels this file sets. What a real
 * prison actually leaves unmet, and what that costs it over days of play, is
 * `tests/integration/needs-state-grant-loop.test.ts`.
 *
 * ## The owner suspended the cost, and this block was in two halves because of it
 *
 * **That suspension is over: the owner restored the rate to `40` on
 * 2026-09-04, and the paragraph below is kept as it stood rather than
 * rewritten** (`docs/AGENT_WORKFLOW.md` §4: mark both directions). It is what
 * the block was shaped by, and the shape is still here -- the two halves were
 * built so that the restoration would be one constant, and this file is the
 * measure of how nearly that held.
 *
 * > The owner ruled on 2026-09-03 -- *"usuń na razie kary, zobaczymy jak
 * > pogram i ocenię łatwość"* ("remove the penalties for now, we'll see how it
 * > plays and I'll judge the ease") -- and
 * > `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` is `0` while they play.
 * > **"na razie" is "for now", so the mechanic is switched off rather than
 * > removed, and a switched-off mechanic that nothing asserts rots.** So:
 * >
 * > - the tests below that go through the *shipped* rate assert what the game
 * >   pays today -- the flat rate, whoever is neglected -- and each one keeps
 * >   the figure it used to assert in its own comment rather than losing it;
 * > - and the schedule itself is pinned through `stateIncomeForPrisonerDayAt`,
 * >   which takes the withheld rate as an argument. That is the half that
 * >   proves the withholding still works, and it is parameterised on the
 * >   constant rather than on the literal `40`, so restoring the constant
 * >   needs no edit here.
 * >
 * > Nothing in this block is skipped and nothing is deleted.
 *
 * **What restoring it actually took, measured rather than predicted.** The
 * second bullet held exactly: the parameterised test needed no edit. The first
 * bullet is what carried the cost, and it is the reason the figures were kept
 * in comments -- four tests in this block assert a figure that goes through
 * the shipped rate, and each of the four moved back to the number its own
 * comment had preserved. `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`'s
 * docblock predicted that the tests here would *"re-price themselves from the
 * constant and stay true without being touched"*; that prediction is refuted
 * by this file, and the docblock now says so.
 */
describe('what a prisoner-day pays, given how many needs are unmet and what one unmet need is worth', () => {
  it('counts a need as unmet at or below one fifth of NEED_MAX, and not above it', () => {
    // Written as a fifth rather than as `51` alone, so a change to either
    // number has to face the other.
    expect(STATE_INCOME_UNMET_NEED_LEVEL * 5).toBe(NEED_MAX);

    const needs = new NeedsComponent(1);
    expect(unmetNeedCount(needs, 0)).toBe(0);

    needs.set(0, 'hygiene', STATE_INCOME_UNMET_NEED_LEVEL + 1);
    expect(unmetNeedCount(needs, 0), 'one level above the line is still served').toBe(0);

    needs.set(0, 'hygiene', STATE_INCOME_UNMET_NEED_LEVEL);
    expect(unmetNeedCount(needs, 0), 'the line itself is unmet').toBe(1);

    needs.set(0, 'recreation', 0);
    expect(unmetNeedCount(needs, 0)).toBe(2);

    for (const needId of NEED_IDS) needs.set(0, needId, 0);
    expect(unmetNeedCount(needs, 0)).toBe(NEED_IDS.length);
  });

  it('withholds 40 of a prisoner-day for each unmet need, the rate the owner restored on 2026-09-04', () => {
    // The ruling, asserted rather than described, so that a change to the
    // shipped rate cannot happen by accident and fails here first with the
    // reason attached.
    //
    // **Restored 2026-09-04. The sentence that was true from 2026-09-03 is
    // kept here rather than overwritten** (`docs/AGENT_WORKFLOW.md` §4: mark
    // both directions). This test was named *"withholds nothing at the shipped
    // rate, which the owner set to 0 on 2026-09-03"*, asserted `toBe(0)`, and
    // pinned a flat `[300, 300, 300, 300, 300, 300, 300]` -- under the owner's
    // *"usuń na razie kary, zobaczymy jak pogram i ocenię łatwość"* ("remove
    // the penalties for now, we'll see how it plays and I'll judge the ease").
    // That suspension was an experiment with a condition on it: asked on
    // 2026-09-04 whether the prison should ever be allowed to be in trouble,
    // the owner ruled *"Zmierzcie to najpierw"* ("measure it first"), and,
    // shown the four-prisoner measurement, ruled the constant back to `40`
    // **on condition that a fifty-prisoner prison was measured first**. Both
    // measurements exist -- `2026-09-04-what-pressure-there-is.md` and its
    // `-at-fifty` companion, in `docs/research/`, named without a rooted path
    // because both branches are unmerged and
    // `tests/foundation/documentation-links-contract.test.ts` fails on a
    // dangling link -- so this is that ruling carried out.
    // Unlike the suspension, the restoration was made by choosing a presented
    // option rather than in the owner's own words, so no verbatim quotation of
    // it is available to put here and none is invented.
    expect(STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS).toBe(40);
    // The whole shipped schedule, written out rather than recomputed with the
    // production expression (#375): a fixture that derives the expected value
    // the same way the code does holds for any implementation. This is the
    // schedule the test below pins at the literal `40`, and the two agree
    // because the constant is `40` -- which is the whole of what changed.
    expect([0, 1, 2, 3, 4, 5, 6].map(stateIncomeForPrisonerDay)).toEqual([300, 260, 220, 180, 140, 100, 60]);
  });

  it('withholds the rate per unmet need whenever the rate is not zero, which is what keeps the mechanic gated while it is off', () => {
    // **This is the test the ruling's reversibility rests on.** It drives
    // `stateIncomeForPrisonerDayAt` -- the same formula
    // `stateIncomeForPrisonerDay` calls, with the withheld rate as an argument
    // -- so the shape ADR 0064 decided (linear in the count, one term per
    // need, no interaction) stays asserted at a rate the owner has switched
    // off. Deleting the `- withheld x unmetNeeds` term as dead arithmetic goes
    // red here.
    //
    // ADR 0064's own schedule, written out for the same #375 reason as above.
    const SCHEDULE_AT_FORTY = [300, 260, 220, 180, 140, 100, 60];
    expect([0, 1, 2, 3, 4, 5, 6].map((unmet) => stateIncomeForPrisonerDayAt(40, unmet))).toEqual(SCHEDULE_AT_FORTY);

    // Parameterised on the constant rather than on the literal, so restoring
    // the mechanic needs no edit in this file: at `0` the schedule is flat, at
    // any other rate every additional unmet need costs exactly that rate until
    // the clamp binds.
    const shipped = [0, 1, 2, 3, 4, 5, 6].map(stateIncomeForPrisonerDay);
    const parameterised = [0, 1, 2, 3, 4, 5, 6].map((unmet) =>
      stateIncomeForPrisonerDayAt(STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS, unmet),
    );
    expect(shipped).toEqual(parameterised);

    // One term per need and no interaction: each step down the schedule is the
    // same rate, at three rates including the suspended one.
    for (const rate of [0, 40, STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS]) {
      for (let unmet = 1; unmet <= NEED_IDS.length; unmet += 1) {
        expect(
          stateIncomeForPrisonerDayAt(rate, unmet - 1) - stateIncomeForPrisonerDayAt(rate, unmet),
          `at a withheld rate of ${String(rate)}, one more unmet need costs exactly that and no more`,
        ).toBe(rate);
      }
    }
  });

  it('never pays nothing, so a neglected prison is not put beyond digging itself out', () => {
    // `300 - 6 x 40` reaches 60 exactly; the floor is arrived at rather than
    // clamped, and ADR 0049 made insolvency a state rather than a loss
    // condition, which an income line that could reach zero would undo. Stated
    // at `40` rather than at the shipped rate because that is the rate the
    // property was chosen for; at the suspended `0` the figure is the full 300
    // and the property holds trivially, which is asserted second so that both
    // rates are covered.
    expect(stateIncomeForPrisonerDayAt(40, NEED_IDS.length)).toBe(60);
    expect(stateIncomeForPrisonerDayAt(40, NEED_IDS.length)).toBeGreaterThan(0);
    expect(stateIncomeForPrisonerDay(NEED_IDS.length)).toBeGreaterThan(0);
  });

  it('clamps at zero rather than billing the prison for holding somebody, at a rate that makes the clamp bind', () => {
    // `Math.max(0, ...)` is unobservable at both `40` (floor 60) and the
    // shipped `0` (floor 300), so it is pinned at a rate above a sixth of the
    // grant -- the case its own comment says `Treasury.credit` is not the place
    // to discover.
    expect(stateIncomeForPrisonerDayAt(51, NEED_IDS.length)).toBe(0);
    expect(stateIncomeForPrisonerDayAt(1_000, 1)).toBe(0);
    expect(() => stateIncomeForPrisonerDayAt(-1, 0)).toThrow(RangeError);
    expect(() => stateIncomeForPrisonerDayAt(1.5, 0)).toThrow(RangeError);
  });

  it('pays each occupied place at its own occupant`s rate, so a day is a sum of individual terms and never a mean', () => {
    const prison = wellRunPrison(8);
    expect(stateIncomeForCompletedDay(prison)).toBe(2_400);

    // Prisoner 3 alone has two needs on the floor -- the shape of #477's
    // prison, applied to one person. A mean over the sector would round this
    // away; the grant is a sum of individual terms and cannot.
    //
    // **The money can show that again**: the rate was restored to `40` on
    // 2026-09-04, so one neglected occupant costs the day exactly their own
    // term and nobody else's. From 2026-09-03 these three assertions read
    // `2_400`, `300` and `2_400` -- the flat rate, whoever is neglected --
    // because a mean and a sum agree when nothing is withheld, and the figures
    // below are the ones those comments preserved (`docs/AGENT_WORKFLOW.md`
    // §4: mark both directions). `2_400 - 80` is two unmet needs at 40 on one
    // of eight places; `2_400 - 240` is six.
    floorNeeds(prison, 3, 2);
    expect(unmetNeedCount(prison.needs, 3)).toBe(2);
    expect(stateIncomeForCompletedDay(prison)).toBe(2_400 - 80);
    expect(stateIncomeForOccupiedPlaces(prison, [3])).toBe(220);

    floorNeeds(prison, 3, NEED_IDS.length);
    expect(unmetNeedCount(prison.needs, 3)).toBe(NEED_IDS.length);
    expect(stateIncomeForCompletedDay(prison)).toBe(2_400 - 240);

    // The structural half, which holds at every rate: the day is exactly the
    // sum over occupied places of what each place pays for its own occupant's
    // unmet count. A prison-wide mean, a prison-wide unmet count, or a walk
    // that read one prisoner's needs for all eight would fail this at `40` and
    // it is the identity that makes the restored mechanic per-occupant.
    const places = prison.roomInstances.residentIdsWithExistingPlace();
    const termByTerm = places.reduce(
      (total, entityId) => total + stateIncomeForPrisonerDay(unmetNeedCount(prison.needs, entityId)),
      0,
    );
    expect(stateIncomeForCompletedDay(prison)).toBe(termByTerm);
    expect(places.map((entityId) => unmetNeedCount(prison.needs, entityId))).toEqual([0, 0, 0, 6, 0, 0, 0, 0]);
  });

  it('pays nothing extra for a prisoner who holds no place, however well kept', () => {
    // The grant is per occupied place. An arrival waiting on a full cell has
    // six satisfied needs and earns the prison nothing, which is unchanged --
    // what a homeless prisoner costs is ADR 0061's assault model, not this
    // line's.
    const registry = registryWithOccupiedCells(2);
    expect(registry.assign('cell-0', 99)).toBe(false);
    expect(stateIncomeForCompletedDay(prisonOf(registry))).toBe(600);
  });

  it('credits what the day is worth through a real kernel day, not merely from the pure function', () => {
    const prison = wellRunPrison(4);
    floorNeeds(prison, 0, 2);
    floorNeeds(prison, 1, 2);
    floorNeeds(prison, 2, 2);
    floorNeeds(prison, 3, 2);

    const { kernel, treasury } = incomeOnlyKernel(prison);
    step(kernel, DAY_LENGTH_TICKS);
    // Four places at 220 -- two unmet needs apiece, at the `40` the owner
    // restored on 2026-09-04. From 2026-09-03 this asserted `1_200`, four at
    // the flat 300, and the comment then said this figure was `880`; both
    // directions are marked rather than overwritten
    // (`docs/AGENT_WORKFLOW.md` §4). The boundary still pays whatever
    // `stateIncomeForCompletedDay` says, which is the property this test is
    // for, and it is that function's own tests above that price it.
    expect(treasury.balanceMinorUnits).toBe(880);
    expect(treasury.balanceMinorUnits).toBe(stateIncomeForCompletedDay(prison));
  });

  it('the readout beside the balance says what the boundary will pay rather than a rate of its own', () => {
    const prison = wellRunPrison(4);
    const system = new StateIncomeSystem(new Treasury(0), prison);
    expect(system.accruedThisDay(DAY_LENGTH_TICKS - 1)).toBe(1_200);

    floorNeeds(prison, 0, 6);
    // A chip that disagreed with the boundary in either direction would be
    // promising money the boundary is not going to pay, or hiding money it
    // will. The assertion that survives the rate is the agreement, so it is
    // written as the agreement first and the figure second. That figure was
    // `1_200 - 240` at the `40` ADR 0064 shipped, `1_200` while the owner had
    // the rate suspended at `0` from 2026-09-03, and is `1_200 - 240` again
    // now they have restored it -- one of the four places holds a prisoner
    // with all six needs on the floor, so it pays the schedule's own floor of
    // 60 rather than 300 (`docs/AGENT_WORKFLOW.md` §4: mark both directions).
    expect(system.accruedThisDay(DAY_LENGTH_TICKS - 1)).toBe(stateIncomeForCompletedDay(prison));
    expect(system.accruedThisDay(DAY_LENGTH_TICKS - 1)).toBe(1_200 - 240);
  });
});

describe('who holds the occupied places', () => {
  it('lists every resident ascending, whatever order they were housed in', () => {
    const registry = new RoomInstanceRegistry();
    for (const instanceId of ['cell-b', 'cell-a']) {
      registry.register({
        instanceId,
        roomCatalogId: 'room.cell',
        anchorTile: TILE(0, 0),
        residentCapacity: 2,
        concurrentUseCapacity: 2,
        objectCapabilities: ['sleep-surface'],
      });
    }
    expect(registry.assign('cell-b', 9)).toBe(true);
    expect(registry.assign('cell-a', 4)).toBe(true);
    expect(registry.assign('cell-b', 1)).toBe(true);

    expect(registry.residentIds()).toEqual([1, 4, 9]);
    expect(registry.residentIds().length).toBe(registry.totalOccupancy);
  });

  it('agrees with itself across a save, which is the reason the sort is written down', () => {
    const source = registryWithOccupiedCells(3, 1);
    const restored = registryWithOccupiedCells(0, 4);
    restored.loadSnapshot(source.getSnapshot());
    expect(restored.residentIds()).toEqual(source.residentIds());
  });

  it('drops a released occupant', () => {
    const registry = registryWithOccupiedCells(3);
    registry.release('cell-1', 1);
    expect(registry.residentIds()).toEqual([0, 2]);
    registry.releaseEntity(2);
    expect(registry.residentIds()).toEqual([0]);
  });
});

/**
 * Issue #585: **an occupied place is a prisoner backed by residency capacity
 * that currently exists**, and a bed can stop existing under a sitting
 * resident. ADR 0028 decision 2 decides that this evicts nobody, so the two
 * counts genuinely diverge and both are needed -- `residentIds` for who is
 * housed, `residentIdsWithExistingPlace` for who is a place.
 *
 * The arithmetic is `residentsWithExistingPlace`; the walk that applies it to a
 * whole prison is the registry's; the consequence for the money is
 * `stateIncomeForCompletedDay`. All three are exercised, because a green
 * function and a green registry would still let the income line read the wrong
 * accessor.
 *
 * The end-to-end measurement -- one plank cycled through three cells by real
 * commands -- is `tests/integration/economy-occupied-place-exists.test.ts`.
 */
describe('a place the prison no longer has is not an occupied place', () => {
  /** `count` residents, entity ids ascending from `firstEntityId`, in one instance whose capacity is `capacity`. */
  function overfilledCell(capacity: number, count: number, firstEntityId = 0): RoomInstanceRegistry {
    const registry = new RoomInstanceRegistry();
    registry.register({
      instanceId: 'cell-0',
      roomCatalogId: 'room.cell',
      anchorTile: TILE(0, 0),
      // Registered at the occupancy the prison had *before* the bed went, so
      // `assign` accepts the residents; `updateDerived` then takes the capacity
      // away underneath them, which is the sequence a removal really produces.
      residentCapacity: count,
      concurrentUseCapacity: count,
      objectCapabilities: ['sleep-surface'],
    });
    for (let index = 0; index < count; index += 1) {
      expect(registry.assign('cell-0', firstEntityId + index)).toBe(true);
    }
    registry.updateDerived('cell-0', {
      residentCapacity: capacity,
      concurrentUseCapacity: capacity,
      concurrentUseCapacityByCapability: capacity > 0 ? [['sleep-surface', capacity]] : [],
      objectCapabilities: capacity > 0 ? ['sleep-surface'] : [],
    });
    return registry;
  }

  it('keeps every resident under capacity, and takes exactly the surplus above it', () => {
    // Under: nothing is dropped, and the answer is the input array.
    expect(residentsWithExistingPlace([3, 7], 4)).toEqual([3, 7]);
    // Exactly at: the boundary case a `>` for a `>=` would break.
    expect(residentsWithExistingPlace([3, 7], 2)).toEqual([3, 7]);
    // Over: the lowest ids keep the places, in the order handed in.
    expect(residentsWithExistingPlace([3, 7, 11], 2)).toEqual([3, 7]);
    expect(residentsWithExistingPlace([3, 7, 11], 1)).toEqual([3]);
    // No capacity at all: a bedless cell full of prisoners is worth nothing.
    expect(residentsWithExistingPlace([3, 7, 11], 0)).toEqual([]);
    // Negative, which is why the guard is a `> 0` and not a `!== 0`: without
    // it `slice(0, -1)` answers *every resident but the last*, so a negative
    // capacity would pay for a bedless cell instead of for nothing. Nothing
    // derives one today, and this is what keeps that a fact about the content
    // rather than something the money depends on.
    expect(residentsWithExistingPlace([3, 7, 11], -1)).toEqual([]);
    // And an empty room with capacity to spare is still not a place.
    expect(residentsWithExistingPlace([], 4)).toEqual([]);
  });

  it('splits the room in two at the same index the money is: the excess is exactly who is not paid for', () => {
    // `residentsWithoutExistingPlace` is ADR 0076 decision A(i)'s "excess",
    // and it is asserted here beside A(ii)'s rule because the two are one
    // partition: whoever this returns is whoever the line above leaves out,
    // and a relocation that moved anybody else would be moving a resident the
    // state is paying for. Same six cases, same order, mirrored.
    expect(residentsWithoutExistingPlace([3, 7], 4)).toEqual([]);
    expect(residentsWithoutExistingPlace([3, 7], 2)).toEqual([]);
    expect(residentsWithoutExistingPlace([3, 7, 11], 2)).toEqual([11]);
    expect(residentsWithoutExistingPlace([3, 7, 11], 1)).toEqual([7, 11]);
    expect(residentsWithoutExistingPlace([3, 7, 11], 0)).toEqual([3, 7, 11]);
    // Negative: `slice(-1)` would answer *the last resident only*, leaving
    // every other resident of a bedless cell unrelocated while the sibling
    // paid for none of them. `Math.max(0, ...)` is what stops that, and it is
    // the same defence the sibling's `> 0` guard is.
    expect(residentsWithoutExistingPlace([3, 7, 11], -1)).toEqual([3, 7, 11]);
    expect(residentsWithoutExistingPlace([], 4)).toEqual([]);

    // The partition property itself, stated once over the case that has both
    // halves non-empty: concatenating them reproduces the room, in order.
    expect([...residentsWithExistingPlace([3, 7, 11], 2), ...residentsWithoutExistingPlace([3, 7, 11], 2)]).toEqual([3, 7, 11]);
  });

  it('counts a bedless cell full of residents as no places at all', () => {
    const registry = overfilledCell(0, 3);
    // Housed, and the count that says so is unchanged -- ADR 0028 decision 2.
    expect(registry.residentIds()).toEqual([0, 1, 2]);
    expect(registry.totalOccupancy).toBe(3);
    // And not places.
    expect(registry.residentIdsWithExistingPlace()).toEqual([]);
    expect(stateIncomeForCompletedDay(prisonOf(registry))).toBe(0);
  });

  it('pays for as many places as are left standing, not for as many as were assigned', () => {
    const registry = overfilledCell(1, 3);
    expect(registry.residentIdsWithExistingPlace()).toEqual([0]);
    expect(stateIncomeForCompletedDay(prisonOf(registry))).toBe(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);
  });

  it('pays for the surviving place at the rate of its own occupant, which is what makes the tie-break observable', () => {
    // Two residents over one bed, and only the *first* is neglected. If the
    // walk kept the wrong one the day would pay the full 300, so this
    // distinguishes "one place" from "the right one place" -- a bound on the
    // count alone could not.
    const neglectedFirst = prisonOf(overfilledCell(1, 2));
    floorNeeds(neglectedFirst, 0, 6);
    expect(neglectedFirst.roomInstances.residentIdsWithExistingPlace()).toEqual([0]);
    expect(stateIncomeForCompletedDay(neglectedFirst)).toBe(
      STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS - 6 * STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS,
    );

    // The mirror: neglect the resident who *loses* the place instead, and the
    // day is worth the full rate. Same two prisoners, same one bed, opposite
    // answers -- so the tie-break is pinned in both directions rather than by
    // one measurement that a reversed rule would also satisfy.
    const neglectedSecond = prisonOf(overfilledCell(1, 2));
    floorNeeds(neglectedSecond, 1, 6);
    expect(stateIncomeForCompletedDay(neglectedSecond)).toBe(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);
  });

  it('spends each room capacity on the residents of that room, never prison-wide', () => {
    // A prison-wide `min(residents, capacity)` would answer 2 here and be
    // wrong: the empty furnished cell's spare bed cannot house the prisoner
    // sleeping on the floor of the other one. Nobody is moved by the income
    // line -- reassignment is intake's, not this line's.
    const registry = new RoomInstanceRegistry();
    registry.register({
      instanceId: 'cell-bedless', roomCatalogId: 'room.cell', anchorTile: TILE(0, 0),
      residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'],
    });
    registry.register({
      instanceId: 'cell-spare', roomCatalogId: 'room.cell', anchorTile: TILE(2, 0),
      residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'],
    });
    expect(registry.assign('cell-bedless', 0)).toBe(true);
    registry.updateDerived('cell-bedless', {
      residentCapacity: 0, concurrentUseCapacity: 0, concurrentUseCapacityByCapability: [], objectCapabilities: [],
    });

    expect(registry.totalOccupancy).toBe(1);
    expect(registry.residentIdsWithExistingPlace()).toEqual([]);
    expect(stateIncomeForCompletedDay(prisonOf(registry))).toBe(0);
  });

  it('agrees with itself across a save', () => {
    const source = overfilledCell(1, 3);
    const restored = overfilledCell(1, 3, 100);
    restored.loadSnapshot(source.getSnapshot());
    expect(restored.residentIdsWithExistingPlace()).toEqual(source.residentIdsWithExistingPlace());
    expect(restored.residentIdsWithExistingPlace()).toEqual([0]);
  });

  it('is exactly `residentIds` for a prison whose beds all still stand', () => {
    // The property that makes this change a patch and not a nerf: nothing an
    // honest prison earns moves.
    const registry = registryWithOccupiedCells(4, 2);
    expect(registry.residentIdsWithExistingPlace()).toEqual(registry.residentIds());
    expect(stateIncomeForCompletedDay(prisonOf(registry))).toBe(4 * STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS);
  });
});

/**
 * [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 2: **a loan is repaid by diverting a fixed percentage of positive
 * inflows**, and this line is the prison's only positive inflow today. So the
 * income system is where the diversion happens, and the two properties that
 * matter are that it happens *here* and that it does not happen at all when
 * nothing has been borrowed.
 *
 * The rate below is a fixture value chosen so the arithmetic is checkable by
 * eye. The rate a session should ship is
 * [#29](https://github.com/matmaxalez/lockstate/issues/29)'s.
 */
describe('a day`s income pays the debt before it pays the prison', () => {
  /** Half of every inflow to the debt, a tenth of the principal as the fee, no escalation inside this file`s horizon. */
  const TERMS = {
    diversionRateBasisPoints: 5_000,
    feeRateBasisPoints: 1_000,
    maximumDurationDays: 1_000,
    escalatedDiversionRateBasisPoints: 10_000,
  } as const;

  function borrowedKernel(prison: PrisonerDayGrantSource, principal: number): { kernel: Kernel; treasury: Treasury; loans: LoanBook } {
    const treasury = new Treasury(0);
    const loans = new LoanBook(treasury, TERMS);
    loans.draw(principal, 0);
    const kernel = new Kernel();
    kernel.registerSystem(new StateIncomeSystem(treasury, prison, loans));
    return { kernel, treasury, loans };
  }

  it('credits the whole day when no loan is outstanding', () => {
    // The control. Four occupied places at 300 is 1,200, exactly as above.
    const treasury = new Treasury(0);
    const loans = new LoanBook(treasury, TERMS);
    const kernel = new Kernel();
    kernel.registerSystem(new StateIncomeSystem(treasury, wellRunPrison(4), loans));

    step(kernel, DAY_LENGTH_TICKS);
    expect(treasury.balanceMinorUnits).toBe(1_200);
    expect(loans.divertedTotalMinorUnits).toBe(0);
  });

  it('splits one day`s payment between the debt and the prison', () => {
    const { kernel, treasury, loans } = borrowedKernel(wellRunPrison(4), 1_000);
    // 1,000 in hand, 1,100 owed.
    expect(treasury.balanceMinorUnits).toBe(1_000);
    expect(loans.outstandingMinorUnits).toBe(1_100);

    step(kernel, DAY_LENGTH_TICKS);

    // 1,200 earned: 600 to the debt, 600 to the prison on top of the 1,000.
    expect(treasury.balanceMinorUnits).toBe(1_600);
    expect(loans.outstandingMinorUnits).toBe(500);
    expect(loans.divertedTotalMinorUnits).toBe(600);
  });

  it('clears the debt and hands the whole of the next day back', () => {
    const { kernel, treasury, loans } = borrowedKernel(wellRunPrison(4), 1_000);

    step(kernel, DAY_LENGTH_TICKS * 2);
    // Day two earns 1,200 against 500 still owed: the debt takes 500 and the
    // prison keeps 700, because a diversion never overshoots what is owed.
    expect(loans.outstandingMinorUnits).toBe(0);
    expect(treasury.balanceMinorUnits).toBe(2_300);

    step(kernel, DAY_LENGTH_TICKS);
    expect(treasury.balanceMinorUnits, 'a cleared debt takes nothing').toBe(3_500);
    expect(loans.divertedTotalMinorUnits).toBe(1_100);
  });

  it('takes nothing at all from a prison earning nothing, however long the debt is held', () => {
    /*
     * The property the owner's ruling rests on: *"a repayment that takes a
     * share of what arrives cannot bill a prison that is earning nothing."*
     * Ten in-game days of an empty prison, and the balance is exactly the
     * principal it borrowed.
     */
    const registry = new RoomInstanceRegistry();
    const { kernel, treasury, loans } = borrowedKernel(prisonOf(registry), 1_000);

    step(kernel, DAY_LENGTH_TICKS * 10);

    expect(treasury.balanceMinorUnits).toBe(1_000);
    expect(loans.outstandingMinorUnits).toBe(1_100);
  });
});
