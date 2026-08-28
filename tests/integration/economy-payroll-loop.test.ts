import { describe, expect, it } from 'vitest';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { staffHireCostMinorUnits } from '../../src/simulation/staff';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **The prison now costs money to run.**
 * ([ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * step 3, [ADR 0017](../../docs/adr/0017-money-primary-resource-model.md)
 * decision 8's precondition.)
 *
 * `tests/unit/economy-payroll.test.ts` pins the arithmetic against wages it
 * authors itself. This file asks the questions a unit test cannot:
 *
 * - Is the system **wired**? A deleted call site that leaves everything green
 *   is this repository's most-found defect, and a payroll nobody registered
 *   looks exactly like a payroll that charges nothing.
 * - Does the **shipped** guard band actually reach the treasury once a day in a
 *   session built from real commands?
 * - Can a prison a player could build actually run out of money, and does the
 *   ladder ADR 0017 decision 8 authors follow from it -- deliveries refused
 *   first, then staff unpaid?
 * - Can it dig back out through a command a player has?
 *
 * Every command here is one the interface can send: `PurchaseMaterials`,
 * `ZoneRoom`, `PlaceObject`, `HireStaff`, `AdmitPrisoner`. The one shortcut is
 * `wallRoomPerimeter`, for the reason that helper states about itself.
 *
 * ## Where the figures come from
 *
 * Read off runs of this fixture and written out. `WAGE` and the opening balance
 * are read from content and from `TREASURY_STARTING_BALANCE_MINOR_UNITS`, so
 * moving the guard band moves this file with it rather than breaking it -- but
 * every *balance* is a literal, so an implementation that charged twice, or
 * once, or never would move one of them.
 */

const SEED = 0x9a6e5;
const GUARD = 'staff-role.guard';
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

/** The catalogue's guard wage: one day's worth, and also what one hire costs up front (ADR 0025 decision 2). */
const WAGE = staffHireCostMinorUnits(GUARD)!;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Cells in a row along the top of the one chunk a new prison owns, three tiles apart so no two share a wall. */
function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}

/** A prison of `cells` furnished cells, built through the real command path and standing by tick 1,000. */
function beddedPrison(cells: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const rects = Array.from({ length: cells }, (_unused, index) => cellRect(index));
  // One plank per bed: `materialsRequired[0].quantity` is the object's
  // footprint width and `bed-wooden` is one tile wide.
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: cells }));
  for (const rect of rects) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  rects.forEach((rect, index) => submit(runtime, `zone${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  rects.forEach((rect, index) =>
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y })),
  );
  stepTo(runtime, 1_000);
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

function hire(runtime: SimulationRuntime, count: number, offset = 0): void {
  for (let index = 0; index < count; index += 1) {
    submit(runtime, `hire-${String(offset + index)}`, packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
  }
}

function admit(runtime: SimulationRuntime, count: number, offset = 0): void {
  for (let index = 0; index < count; index += 1) {
    submit(runtime, `admit-${String(offset + index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }
}

describe('the payroll is on the kernel of a session a player can start', () => {
  it('is registered, at the order the determinism pin records', () => {
    // The wiring, asserted directly. Everything else in this file measures a
    // balance, and a balance that failed to move is indistinguishable from a
    // prison that owed nothing -- so the registration is checked where it
    // cannot be confused with an arithmetic result.
    const runtime = createNewSimulationRuntime(SEED);
    expect(runtime.kernel.systemExecutionOrder).toContainEqual({ id: 'economy.payroll', order: 130 });
  });

  it('bills the catalogue`s wage per guard per in-game day, out of a real hire', () => {
    const runtime = createNewSimulationRuntime(SEED);
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);

    hire(runtime, 2);
    // Two engagement charges of one day's wage each, before any day has ended.
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - 2 * WAGE);

    // One tick short of the first boundary the payroll has not run.
    stepTo(runtime, DAY_LENGTH_TICKS - 1);
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - 2 * WAGE);

    // 25,000 less two hires at 80 and then two wages at 80: 24,680. Written
    // out, because an implementation that charged the roster once at session
    // start would produce 24,840 and one that charged per tick would produce a
    // number nothing here would recognise.
    stepTo(runtime, DAY_LENGTH_TICKS);
    expect(runtime.treasury.balanceMinorUnits).toBe(24_680);

    // And again the next day, and the next: 160 a day, for ever, declined by
    // nobody.
    stepTo(runtime, DAY_LENGTH_TICKS * 2);
    expect(runtime.treasury.balanceMinorUnits).toBe(24_520);
    stepTo(runtime, DAY_LENGTH_TICKS * 3);
    expect(runtime.treasury.balanceMinorUnits).toBe(24_360);
  });

  it('publishes what the roster costs and what it owes, on the channel the HUD reads', () => {
    const runtime = createNewSimulationRuntime(SEED);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).dailyWageBillMinorUnits).toBe(0);

    hire(runtime, 3);
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    // Three guards at the catalogue's 80.
    expect(counts.dailyWageBillMinorUnits).toBe(240);
    expect(counts.unpaidWagesMinorUnits).toBe(0);
    expect(counts.staff).toBe(3);
  });
});

describe('hiring before there is anybody to guard is a decision the balance now punishes', () => {
  it('falls every day in a prison with no population, which nothing could make it do before', () => {
    // The trade-off this whole step exists to create, in its plainest form: an
    // empty prison earns nothing (`StateIncomeSystem` pays per *occupied
    // place*) and three guards cost 240 a day.
    const runtime = createNewSimulationRuntime(SEED);
    hire(runtime, 3);

    const balances = [24_520, 24_280, 24_040, 23_800];
    for (let day = 1; day <= balances.length; day += 1) {
      stepTo(runtime, DAY_LENGTH_TICKS * day);
      expect(runtime.treasury.balanceMinorUnits, `day ${String(day)}`).toBe(balances[day - 1]);
    }

    // Thirty days of it: 25,000 less three hires at 80 and thirty days at 240.
    stepTo(runtime, DAY_LENGTH_TICKS * 30);
    expect(runtime.treasury.balanceMinorUnits).toBe(17_560);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
  });

  it('is paid for out of the same day`s income once the beds are occupied', () => {
    // The same three guards in a prison that houses eight: the state pays 300
    // per occupied place per day, so the day settles well ahead and the balance
    // climbs. Payroll runs *after* the income on the same tick, which is what
    // makes this one settlement rather than a dip and a recovery.
    const runtime = beddedPrison(8);
    hire(runtime, 3);
    admit(runtime, 8);

    stepTo(runtime, DAY_LENGTH_TICKS * 10);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(8);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
    // 2,400 a day in and 240 a day out, from 24,240 after the build: the
    // balance climbs by 2,160 every day and reads 45,840 on day 10. The
    // 2.5%-of-income shape of that is the finding this step reports, not a
    // defect in it -- see the commit message.
    expect(runtime.treasury.balanceMinorUnits).toBe(45_840);
  });
});

describe('a prison can run out of money, and ADR 0017 decision 8`s ladder follows from one balance', () => {
  /**
   * The fixture: eight furnished cells, two prisoners in them, twelve guards --
   * four times what `DEFAULT_SECTOR_PRISONERS_PER_GUARD` asks for at this
   * population -- and then the rest of the treasury spent on bricks.
   *
   * **Spending it on bricks is the point, not a shortcut.** It is the trade-off
   * this step exists to create, taken by a real command: money committed to
   * materials is money that is not there on payday.
   */
  function overcommitted(): SimulationRuntime {
    const runtime = beddedPrison(8);
    hire(runtime, 12);
    admit(runtime, 2);
    // 550 bricks at 40: 22,000 of the remaining balance, leaving too little to
    // meet a 960 payroll for long.
    submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 550 }));
    expect(runtime.refusals.count, 'the fixture must be able to afford the bricks it buys').toBe(0);
    return runtime;
  }

  it('empties the treasury, floors it at zero and starts owing wages instead of overdrawing', () => {
    const runtime = overcommitted();
    // 25,000 less 8 planks at 65 (520), 12 hires at 80 (960) and 550 bricks at
    // 40 (22,000): 1,520 in hand against 960 a day.
    expect(runtime.treasury.balanceMinorUnits).toBe(1_520);

    // Day 1: 600 of income for two occupied places, 960 of wages. 1,520 + 600
    // - 960 = 1,160. Days 2, 3 and 4 take 360 more each: 800, 440, 80.
    stepTo(runtime, DAY_LENGTH_TICKS);
    expect(runtime.treasury.balanceMinorUnits).toBe(1_160);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
    stepTo(runtime, DAY_LENGTH_TICKS * 4);
    expect(runtime.treasury.balanceMinorUnits).toBe(80);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);

    // Day 5 is the first the prison cannot meet: 80 in hand plus 600 of income
    // against a 960 bill. It pays 680, the balance stops at 0 rather than
    // going to -280, and 280 is owed.
    stepTo(runtime, DAY_LENGTH_TICKS * 5);
    expect(runtime.treasury.balanceMinorUnits).toBe(0);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(280);

    // And the debt compounds while nothing changes: 360 more owed every day,
    // which is the 960 bill less the 600 the prison earns.
    stepTo(runtime, DAY_LENGTH_TICKS * 8);
    expect(runtime.treasury.balanceMinorUnits).toBe(0);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(1_360);
  });

  it('refuses a delivery first, which is the ladder`s top rung and needed no new code', () => {
    const runtime = overcommitted();
    stepTo(runtime, DAY_LENGTH_TICKS * 5);
    expect(runtime.treasury.balanceMinorUnits).toBe(0);

    const before = runtime.refusals.count;
    submit(runtime, 'buy-more', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-more', itemId: 'item.brick', quantity: 1 }));
    expect(runtime.refusals.count).toBe(before + 1);
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');

    // And a hire is refused on the same balance, so a prison that cannot pay
    // the staff it has cannot take on more.
    submit(runtime, 'hire-more', packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
    expect(runtime.refusals.last?.reason).toBe('hire.insufficient-funds');
  });

  it('says so on the status channel rather than accruing an invisible debt', () => {
    const runtime = overcommitted();
    stepTo(runtime, DAY_LENGTH_TICKS * 5);
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    expect(counts.treasuryMinorUnits).toBe(0);
    expect(counts.unpaidWagesMinorUnits).toBe(280);
    expect(counts.dailyWageBillMinorUnits).toBe(960);
  });

  it('digs out when the player fills the beds they already built', () => {
    // The recovery lever, and it is a command rather than a mechanic invented
    // for this: six more prisoners into six empty beds takes the income from
    // 600 a day to 2,400 against a 960 payroll. ADR 0017 decision 8 says the
    // interesting part of insolvency is digging out; this is it happening.
    const runtime = overcommitted();
    stepTo(runtime, DAY_LENGTH_TICKS * 8);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(1_360);

    admit(runtime, 6, 2);
    stepTo(runtime, DAY_LENGTH_TICKS * 9);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(8);
    // 2,400 of income against 1,360 owed plus 960 for the day: the whole debt
    // clears in one day and the balance is positive again at 80.
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
    expect(runtime.treasury.balanceMinorUnits).toBe(80);

    // And it keeps climbing, so the recovery is a recovery rather than a pause.
    stepTo(runtime, DAY_LENGTH_TICKS * 10);
    expect(runtime.treasury.balanceMinorUnits).toBe(1_520);
  });
});
