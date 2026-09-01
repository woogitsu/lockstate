import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS } from '../../src/content/procurement-catalog';
import {
  INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
} from '../../src/simulation/economy';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * **ADR 0017 decision 8's insolvency ladder, walked in one run.**
 *
 * Decision 8 is Accepted and it promises an *order*: at a negative balance the
 * state stops paying for discretionary things *"deliveries refused first, then
 * construction halted, then staff unpaid"*. #703 ruling A's standing overdraft
 * inverted it -- `Treasury.canAfford` was one comparison against one floor, so
 * rungs 1 and 2 moved together while `PayrollSystem`'s `Math.min(due, balance)`
 * pinned rung 3 at a balance of zero, which fires *first*. ADR 0083 §2 recorded
 * that an amendment was owed and that choosing it was the owner's.
 *
 * **The owner's ruling 19 of 2026-08-31 is that amendment's source**:
 * *"Dać szczeblom własne progi wewnątrz debetu"* -- give the rungs their own
 * thresholds inside the overdraft -- at **-1,250**, **-2,000** and **-2,500**.
 * It is drafted at `docs/adr/0017-money-primary-resource-model.md` ("Amendment,
 * 2026-09-01") and is **Proposed and not self-approved**.
 *
 * ## What this file is, and why it is not covered by the files it sits beside
 *
 * `tests/unit/economy-treasury.test.ts` pins the arithmetic of one rung at a
 * time against a `Treasury` built by hand.
 * `tests/integration/economy-payroll-loop.test.ts` watches one prison sink
 * through all three under a real income line and a real wage bill, and reads
 * the rungs rather than pressing them.
 *
 * **This file presses them.** Every rung here is provoked by the thing a rung
 * is *about*: a `PurchaseMaterials` the player pressed, a `PlaceBuildOrder` the
 * queue has to fund, and a payday nobody can decline. What it asserts is the
 * one property decision 8 states and no single-rung test can: that at each
 * depth the rungs that have fired are a *prefix* of the ladder, and the ones
 * below it are still working.
 *
 * ## Why the walk is driven by `Treasury.spend(…, 'wages')`
 *
 * Because nothing else can reach these depths. A press stops at -1,250 and the
 * queue at -2,000, so the only class that can put a balance anywhere is the
 * wage rung -- which is what a payday does, and `PayrollSystem` calls exactly
 * this method. Positioning with it rather than by running eleven in-game days
 * keeps every figure below a literal instead of the output of an income model.
 *
 * ## Every figure is a literal
 *
 * `item.brick` is 40, a `wall-brick` order takes two of them, and a guard's
 * day is 80. The three thresholds are asserted against the constants once, at
 * the top, and used as literals after that: a threshold derived from the code
 * under test would agree with any threshold.
 */

const SEED = 0x1adde7;
const BRICK = 'item.brick';
const BRICK_PRICE = 40;
const WALL = 'wall-brick';
const WALL_COST = 2 * BRICK_PRICE;
const GUARD = 'staff-role.guard';
const GUARD_DAY = 80;
const ARRIVAL = { x: 16, y: 16 } as const;

function send(runtime: SimulationRuntime, id: string, command: SimulationCommand): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Puts the balance exactly on `balance`, at the only rung that can reach it. */
function sinkTo(runtime: SimulationRuntime, balance: number): void {
  const amount = runtime.treasury.balanceMinorUnits - balance;
  expect(amount, 'the walk only ever goes down').toBeGreaterThan(0);
  expect(runtime.treasury.spend(amount, 'wages')).toBe(true);
  expect(runtime.treasury.balanceMinorUnits).toBe(balance);
}

/**
 * A prison with one guard on the books, so there is a wage bill to leave
 * unpaid, and nothing else -- no cells, no prisoners, no income.
 */
function prisonWithOneGuard(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  send(runtime, 'hire', { type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL });
  expect(runtime.refusals.count, 'the fixture must be able to hire the guard it hires').toBe(0);
  expect(runtime.payroll.dailyWageBillMinorUnits()).toBe(GUARD_DAY);
  return runtime;
}

/** Whether the press was refused, and whether it took any money. */
function pressBuy(runtime: SimulationRuntime, id: string): boolean {
  const before = runtime.refusals.count;
  const balanceBefore = runtime.treasury.balanceMinorUnits;
  send(runtime, id, { type: 'PurchaseMaterials', orderId: id, itemId: BRICK, quantity: 1 });
  const refused = runtime.refusals.count > before;
  if (refused) {
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits, 'a refusal must not take a minor unit').toBe(balanceBefore);
  }
  return !refused;
}

/** Whether the queue funded the wall order it was handed. */
function queueFunded(runtime: SimulationRuntime, id: string, x: number): boolean {
  send(runtime, id, { type: 'PlaceBuildOrder', orderId: id, definitionId: WALL, x, y: 20 });
  return runtime.justInTimeMaterials.lastReport.unfunded.length === 0;
}

/** What one payday takes, and what it leaves owed. */
function payday(runtime: SimulationRuntime, day: number): { paid: number; owed: number } {
  const before = runtime.treasury.balanceMinorUnits;
  const owedBefore = runtime.payroll.unpaidWagesMinorUnits;
  stepTo(runtime, DAY_LENGTH_TICKS * day);
  return {
    paid: before - runtime.treasury.balanceMinorUnits,
    owed: runtime.payroll.unpaidWagesMinorUnits - owedBefore,
  };
}

describe('the three thresholds ruling 19 gives ADR 0017 decision 8`s rungs', () => {
  it('is the owner`s three numbers, in the order decision 8 promises', () => {
    expect(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS, 'deliveries refused below -1,250').toBe(-1_250);
    expect(INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS, 'construction halted below -2,000').toBe(-2_000);
    expect(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, 'wages unpaid below -2,500, which is the floor').toBe(-2_500);

    /*
     * The ordering, asserted on the numbers themselves. It is what makes the
     * ladder a ladder, and it is the one thing a reader should not have to
     * check by eye -- two rungs the same way round is a ladder with a step
     * missing and nothing else here would say so.
     */
    expect(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS).toBeGreaterThan(
      INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS,
    );
    expect(INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS).toBeGreaterThan(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
  });

  it('is what a shipped session actually applies, on every class', () => {
    const runtime = createNewSimulationRuntime(SEED);

    expect(runtime.treasury.floorFor('deliveries')).toBe(-1_250);
    expect(runtime.treasury.floorFor('hiring'), 'not a rung of its own: the shallowest of the three').toBe(-1_250);
    expect(runtime.treasury.floorFor('construction')).toBe(-2_000);
    expect(runtime.treasury.floorFor('wages'), 'the third rung is the floor, not a second copy of it').toBe(
      runtime.treasury.overdraftFloorMinorUnits,
    );
  });
});

describe('ADR 0017 decision 8`s ladder, pressed rung by rung in one run', () => {
  it('refuses a delivery first, halts construction second and leaves wages unpaid last', () => {
    const runtime = prisonWithOneGuard();
    let wall = 0;

    /*
     * **Position 1: -1,210, one brick above the first rung.** Everything works,
     * which is the control: without it every assertion below could be satisfied
     * by a prison that never worked at all.
     */
    sinkTo(runtime, -1_210);
    expect(pressBuy(runtime, 'buy-above-rung-1'), 'a delivery that lands exactly on the rung is bought').toBe(true);
    expect(runtime.treasury.balanceMinorUnits).toBe(-1_250);
    stepTo(runtime, runtime.kernel.tick + PROCUREMENT_DELIVERY_DELAY_TICKS + 2);

    /*
     * **Position 2: -1,251, one minor unit past the first rung.**
     *
     * Rung 1 has fired and nothing below it has. The prison cannot buy a 40
     * brick and can still finish the wall it has already queued -- which is the
     * whole of what "deliveries refused first, then construction halted" means
     * as two separate events rather than one.
     */
    sinkTo(runtime, -1_251);
    expect(pressBuy(runtime, 'buy-past-rung-1'), 'rung 1: the delivery is refused').toBe(false);
    expect(queueFunded(runtime, `wall-${String(wall)}`, 2 + wall), 'rung 2: construction is still funded').toBe(true);
    wall += 1;
    // 40 and not 80: the brick position 1 bought has landed, so the wall order
    // claims it and buys the one it is short of. That the stock is *counted* is
    // ADR 0081's per-order arithmetic and not this file's subject; what matters
    // here is that money left the treasury at all.
    expect(runtime.treasury.balanceMinorUnits, 'and it really did spend what the order was short').toBe(-1_291);
    expect(payday(runtime, 1), 'rung 3: the wages are paid in full').toEqual({ paid: GUARD_DAY, owed: 0 });

    /*
     * **Position 3: -1,921, one wall order above the second rung.** Rung 2 has
     * not fired yet, and the order that proves it is the last one the prison can
     * afford: it lands exactly on -2,000.
     */
    sinkTo(runtime, -1_920);
    expect(queueFunded(runtime, `wall-${String(wall)}`, 2 + wall), 'a wall order that lands on the rung is funded').toBe(
      true,
    );
    wall += 1;
    expect(runtime.treasury.balanceMinorUnits).toBe(-2_000);

    /*
     * **Position 4: -2,001, one minor unit past the second rung.**
     *
     * Rungs 1 and 2 have fired and rung 3 has not. The queue stops buying, the
     * order stays the player's rather than failing, and the payday is still met
     * out of what is left of the facility.
     */
    sinkTo(runtime, -2_001);
    expect(pressBuy(runtime, 'buy-past-rung-2'), 'rung 1: still refused').toBe(false);
    expect(queueFunded(runtime, `wall-${String(wall)}`, 2 + wall), 'rung 2: construction halts').toBe(false);
    expect(runtime.justInTimeMaterials.lastReport.unfunded, 'and it says what it could not buy').toEqual([
      { itemId: BRICK, quantity: 2, costMinorUnits: WALL_COST },
    ]);
    expect(
      runtime.construction.getOrder(`wall-${String(wall)}`)?.state,
      'an unfunded order is kept, not failed -- ADR 0017 decision 8 is a state, not a loss condition',
    ).not.toBe('failed');
    wall += 1;
    expect(runtime.treasury.balanceMinorUnits, 'and a halted queue took nothing').toBe(-2_001);
    expect(payday(runtime, 2), 'rung 3: the wages are still paid in full').toEqual({ paid: GUARD_DAY, owed: 0 });

    /*
     * **Position 5: -2,441, part of one guard-day above the third rung.** The
     * payday takes the 59 the rung leaves and owes the other 21 -- ADR 0049's
     * arrears, which ruling 19 does not touch.
     */
    sinkTo(runtime, -2_441);
    expect(payday(runtime, 3), 'rung 3 fires: what the rung leaves is paid and the rest is owed').toEqual({
      paid: 59,
      owed: GUARD_DAY - 59,
    });
    expect(runtime.treasury.balanceMinorUnits, 'exactly the floor').toBe(-2_500);

    /*
     * **Position 6: at the rung.** Every rung has fired. The payday takes
     * nothing at all, the balance does not move again, and the whole bill is
     * owed -- which is what makes the third rung the last one.
     */
    expect(payday(runtime, 4)).toEqual({ paid: 0, owed: GUARD_DAY });
    expect(runtime.treasury.balanceMinorUnits, 'no payday may pass the floor').toBe(-2_500);
    expect(pressBuy(runtime, 'buy-at-the-floor'), 'rung 1: still refused').toBe(false);
    expect(queueFunded(runtime, `wall-${String(wall)}`, 2 + wall), 'rung 2: still halted').toBe(false);

    /*
     * **And the ladder is a prefix at every depth, which is the property
     * decision 8 states.** Read back off the treasury rather than off the walk
     * above, so a rung that fired in the wrong order would fail here as well.
     */
    for (const balance of [-1_210, -1_251, -1_920, -2_001, -2_441, -2_500]) {
      const probe = createNewSimulationRuntime(SEED);
      probe.treasury.restore({ balanceMinorUnits: balance });
      const fired = [
        !probe.treasury.canAfford(BRICK_PRICE, 'deliveries'),
        !probe.treasury.canAfford(WALL_COST, 'construction'),
        !probe.treasury.canAfford(1, 'wages'),
      ];
      /*
       * The prefix property, stated as the implication it is: a rung that has
       * fired implies every rung above it has fired too. A ladder whose second
       * rung fired before its first fails here at the balance between them,
       * whichever two rungs were swapped.
       */
      for (let rung = 1; rung < fired.length; rung += 1) {
        if (!fired[rung]) continue;
        expect(
          fired[rung - 1],
          `at ${String(balance)} rung ${String(rung + 1)} has fired, so rung ${String(rung)} must have too`,
        ).toBe(true);
      }
    }
  });

  it('has no rungs at all in a prison with no facility open, which is every bare `new Treasury`', () => {
    /*
     * The other direction, and it is what keeps the ladder *inside* the
     * overdraft as the ruling's own words say. `Treasury.floorFor` clamps every
     * rung up to the treasury's floor, so at a floor of `0` all four classes are
     * the same comparison and a prison that has no facility behaves exactly as
     * it did before ruling 19, to the minor unit.
     */
    const runtime = createNewSimulationRuntime(SEED);
    runtime.treasury.setOverdraftFloor(0);

    for (const spendClass of ['deliveries', 'construction', 'wages', 'hiring'] as const) {
      expect(runtime.treasury.floorFor(spendClass), spendClass).toBe(0);
    }

    sinkTo(runtime, 40);
    expect(runtime.treasury.canAfford(40, 'deliveries'), 'a prison may spend its last coin, on any rung').toBe(true);
    expect(runtime.treasury.canAfford(41, 'deliveries')).toBe(false);
    expect(runtime.treasury.canAfford(41, 'wages')).toBe(false);
  });
});
