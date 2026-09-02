import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import {
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  TREASURY_STARTING_BALANCE_MINOR_UNITS,
} from '../../src/simulation/economy';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';

/**
 * **What cancelling a build order actually gives back, in the window ADR 0076
 * left open** — [#717](https://github.com/matmaxalez/lockstate/issues/717).
 *
 * ## These are controls, not expectations
 *
 * Every case below **records what happens** and does not claim it is right,
 * which is the shape #717 asked for in its own words: *"It is written as a
 * control rather than an expectation — it records what happens, it does not
 * claim it is right."* Whether a prison may sell surplus material back to the
 * catalogue is
 * [ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
 * own open question — *"**Not decided either: whether surplus stock can be sold
 * back.** […] That is a new economic surface and a price question (ADR 0017
 * decision 5 reserves prices with the rest of #29), so it is named and not
 * taken"* — and it is the owner's. The branch
 * `fix/717-cancel-returns-what-it-took` implements taking it and prices what
 * taking it costs; this file is what survives either way.
 *
 * ## What #717 claimed, and which half of it survived the reading
 *
 * The issue is titled *"Cancelling a build order returns bricks, never money —
 * and with the standing overdraft an undo now keeps the debt"*. **The first
 * mechanism it names is still exactly true**: `PlaceBuildOrder` reaches
 * `ConstructionSystem.procureQueuedMaterials` in the command handler, so a drag
 * spends on the placing tick with no press of its own. **The second was already
 * false when the issue was filed.** The owner's ruling 20 of 2026-08-31 (ADR
 * 0076's amendment, shipped in #746) makes a cancellation pay in *money* for
 * `'approved'`, `'materials-pending'` and `'assigned'`, and
 * `tests/integration/economy-money-conservation.test.ts` pins one case per
 * state. The issue's reproduction figure — *"Cancelling all thirteen tail
 * orders on the tick after placing them still ends the prison at −1,000"* — is
 * a measurement of a **tail the queue never funded**, which returns nothing in
 * either currency because nothing was ever spent on it;
 * `tests/integration/economy-loan-recovery.test.ts` re-measured that on
 * 2026-09-01 and says so.
 *
 * ## What is left is the window, and it is wider than ADR 0076 says
 *
 * Ruling 20 is implemented as `refundSurplusDeliveries`, which cancels
 * *deliveries* — so money comes back only where the money is still on the road.
 * `ProcurementSystem` is scheduled every tick and `ConstructionSystem` every
 * tenth, so a delivery is unloaded into the container **ten ticks** before the
 * order that demanded it reaches `tryAllocate`, and for those ten ticks the
 * order is `'materials-pending'`, holds no allocation, and has no delivery to
 * turn around. ADR 0076 calls that window *"one scheduled construction tick
 * wide"*, which is true in construction ticks and is **ten ticks in the clock a
 * player experiences** — measured below, bricks land at tick 101 and allocate
 * at tick 111.
 *
 * **And it is not one plank.** A drag buys on the placing tick, so every
 * delivery in it lands within a tick of every other and the whole drag occupies
 * the window at once. Measured: 328 walls put **26,240** — the opening facility
 * plus 1,240 of the standing overdraft — into it, and cancelling all 328 there
 * returns **nothing**, in either currency. ADR 0076's *"a player who cancels in
 * this window keeps the material and does not get the money"* reads as a small
 * asymmetry about one plank; at drag scale it is the whole prison's liquidity.
 *
 * ## Why the overdraft is what makes the scale matter
 *
 * #703 ruling A gave every session a standing overdraft of 2,500
 * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * §2) and #785 equalised the insolvency rungs at −1,250. So the drag above
 * stops at −1,240: ten minor units above the rung a `PurchaseMaterials` press
 * is refused at, and 55 short of the 65 one plank costs. The prison cannot buy
 * the door its first cell needs, cannot zone the cell, cannot admit a prisoner
 * and cannot earn — ADR 0075's locked position, reached by a gesture rather than
 * by arithmetic — and the undo leaves it there holding 26,240 of value as 656
 * bricks. That is #717's *"an undo now keeps the debt"*, and it is the second
 * case below.
 *
 * Every command goes through `packCommand` and the real kernel:
 * `tests/unit/simulation-refusals.test.ts` states the rule this file follows —
 * a fixture that calls the system directly does not exercise the route the
 * behaviour lives on.
 */

const WALL = 'wall-brick';
const UNIT_PRICE = new Map(PROCURABLE_MATERIALS.map((material) => [material.itemId, material.unitPriceMinorUnits]));
const WALL_REQUIREMENT = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!;
/** Two bricks at 40, read from content rather than written down (`docs/TESTING.md`). */
const WALL_COST = UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity;
const PLANK = 'item.wood-plank';
const PLANK_PRICE = UNIT_PRICE.get(PLANK)!;

interface Edge {
  readonly x: number;
  readonly y: number;
  readonly edge: 'north' | 'west';
}

/** Distinct north edges inside the one 32x32 chunk a new session owns. */
function edges(count: number): readonly Edge[] {
  const out: Edge[] = [];
  for (let y = 1; y < 32 && out.length < count; y += 1) {
    for (let x = 1; x < 32 && out.length < count; x += 1) out.push({ x, y, edge: 'north' });
  }
  if (out.length < count) throw new RangeError(`only ${String(out.length)} edges available for ${String(count)}`);
  return out;
}

/**
 * The real command boundary, with **one drag dispatched at one tick**.
 *
 * A drag is many `PlaceBuildOrder` commands from one gesture, and the kernel
 * drains its whole queue in a single step, so submitting them all against the
 * current tick and stepping once is what a player's drag actually looks like.
 * Stepping per command instead would let the crew build and the deliveries land
 * *during* the gesture, which is a different measurement.
 */
function createSession(seed = 0x717) {
  const runtime = createNewSimulationRuntime(seed);
  let sequence = 0;

  const atOneTick = (commands: readonly SimulationCommand[]): void => {
    for (const command of commands) {
      runtime.kernel.submitCommand(`cmd-${String(sequence)}`, sequence, runtime.kernel.tick, packCommand(command));
      sequence += 1;
    }
    runtime.kernel.step();
  };

  const stock = (itemId: string): number =>
    runtime.containers.getById(CONSTRUCTION_MATERIALS_CONTAINER_ID)!.quantityOf(itemId);

  const run = (ticks: number): void => {
    for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
  };

  const stateCounts = (orderIds: readonly string[]): ReadonlyMap<string, number> => {
    const counts = new Map<string, number>();
    for (const id of orderIds) {
      const state = runtime.construction.getOrder(id)?.state ?? 'absent';
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return counts;
  };

  return { runtime, atOneTick, run, stock, stateCounts };
}

function placements(orderIds: readonly string[]): readonly SimulationCommand[] {
  const where = edges(orderIds.length);
  return orderIds.map((orderId, index) => ({
    type: 'PlaceBuildOrder' as const,
    orderId,
    definitionId: WALL,
    ...(where[index] as Edge),
    transactionId: 'drag-1',
  }));
}

/** The 328 walls the overdraft funds: 26,240 out of a 25,000 facility, ending at −1,240. */
const DRAG = 328;

describe('what a cancelled drag gives back, and when (#717)', () => {
  it('gives back every minor unit while the bricks are still on the road', () => {
    /*
     * Ruling 20 working: the money is in 328 deliveries, `refundSurplusOf`
     * turns each one around, and the facility is whole again. This is the
     * control the next case is measured against — the same gesture, the same
     * drag, a hundred ticks later.
     */
    const session = createSession();
    const orderIds = Array.from({ length: DRAG }, (unused, index) => `wall-${String(index)}`);

    session.atOneTick(placements(orderIds));
    expect(session.runtime.treasury.balanceMinorUnits, '328 walls at 80, out of 25,000').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - DRAG * WALL_COST,
    );
    expect(session.runtime.procurement.pendingDeliveries, 'one delivery per funded order').toHaveLength(DRAG);

    session.atOneTick(orderIds.map((orderId) => ({ type: 'CancelBuildOrder' as const, orderId })));
    expect(session.runtime.treasury.balanceMinorUnits, 'the whole 26,240, in money').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS,
    );
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and no bricks were conjured on the way back').toBe(0);
  }, 60_000);

  it('gives back nothing once the bricks have landed, and the prison stays locked out of its own door', () => {
    /*
     * **The control #717 is about, and it records rather than judges.** The
     * only difference from the case above is a hundred ticks of clock. Every
     * order is still `'materials-pending'`, every brick is on the shelf, and
     * `refundSurplusOf` has no delivery to cancel — so the press moves neither
     * the balance nor the shelf, and the prison is left at −1,240 holding
     * 26,240 of value it cannot spend on a 65 plank.
     *
     * ADR 0076's amendment is where the *reason* lives, and it is not an
     * oversight: paying for a brick that is still in the container as well
     * would be the one-press value creation ruling 20 exists to forbid. What
     * the amendment leaves open is the remedy — selling the surplus back — and
     * that is a new economic surface it declines to take.
     */
    const session = createSession();
    const orderIds = Array.from({ length: DRAG }, (unused, index) => `wall-${String(index)}`);

    session.atOneTick(placements(orderIds));
    const strandedBalance = session.runtime.treasury.balanceMinorUnits;
    expect(strandedBalance, 'inside the standing overdraft').toBeGreaterThan(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    expect(strandedBalance, 'and past the rung a Buy press is refused at, by less than a plank').toBeLessThan(
      INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS + PLANK_PRICE,
    );

    session.run(PROCUREMENT_DELIVERY_DELAY_TICKS);
    expect(session.stateCounts(orderIds), 'every order still waiting, with its bricks already here').toEqual(
      new Map([['materials-pending', DRAG]]),
    );
    expect(session.runtime.procurement.pendingDeliveries, 'nothing left on the road').toHaveLength(0);
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and all of it on the shelf').toBe(
      DRAG * WALL_REQUIREMENT.quantity,
    );

    // The locked position, pressed rather than argued: one plank for one door.
    session.atOneTick([{ type: 'PurchaseMaterials', orderId: 'buy-plank', itemId: PLANK, quantity: 1 }]);
    expect(session.runtime.treasury.balanceMinorUnits, 'refused: the prison cannot buy its own door').toBe(
      strandedBalance,
    );
    expect(session.stock(PLANK), 'and no plank arrived').toBe(0);

    // The undo. Recorded, not endorsed: it moves neither figure.
    session.atOneTick(orderIds.map((orderId) => ({ type: 'CancelBuildOrder' as const, orderId })));
    expect(session.stateCounts(orderIds), 'every order really was cancelled').toEqual(
      new Map([['cancelled', DRAG]]),
    );
    expect(session.runtime.treasury.balanceMinorUnits, 'and the debt is exactly where it was').toBe(
      strandedBalance,
    );
    expect(session.stock(WALL_REQUIREMENT.itemId), 'with the bricks still on the shelf').toBe(
      DRAG * WALL_REQUIREMENT.quantity,
    );

    // Still locked, which is the half of the title that is true today.
    session.atOneTick([{ type: 'PurchaseMaterials', orderId: 'buy-plank-2', itemId: PLANK, quantity: 1 }]);
    expect(session.runtime.treasury.balanceMinorUnits, 'the undo bought no door either').toBe(strandedBalance);
  }, 60_000);

  it('is ten ticks wide for one wall, not one, and the currency changes twice inside it', () => {
    /*
     * The window measured at the granularity ADR 0076 describes it at, because
     * *"one scheduled construction tick wide"* and *"ten ticks"* are the same
     * fact in two clocks and only one of them is the player's. Three presses of
     * the same gesture at three moments, and the middle one is the odd one out:
     *
     * | pressed at | what comes back |
     * | --- | --- |
     * | delivery on the road | 80, in money |
     * | bricks landed, order still `materials-pending` | nothing, and two bricks stay |
     * | `assigned` | 80, in money, and the bricks go |
     *
     * That is the shape of inversion the ruling of 2026-09-01 closed for
     * `'completed'`, still open one state earlier.
     */
    const onTheRoad = createSession();
    onTheRoad.atOneTick(placements(['wall-0']));
    expect(onTheRoad.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - WALL_COST);
    onTheRoad.atOneTick([{ type: 'CancelBuildOrder', orderId: 'wall-0' }]);
    expect(onTheRoad.runtime.treasury.balanceMinorUnits, 'money').toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(onTheRoad.stock(WALL_REQUIREMENT.itemId)).toBe(0);

    const landed = createSession();
    landed.atOneTick(placements(['wall-0']));
    const placedAt = landed.runtime.kernel.tick;
    landed.run(PROCUREMENT_DELIVERY_DELAY_TICKS);
    expect(landed.runtime.kernel.tick - placedAt, 'the delivery delay, exactly').toBe(
      PROCUREMENT_DELIVERY_DELAY_TICKS,
    );
    expect(landed.stateCounts(['wall-0'])).toEqual(new Map([['materials-pending', 1]]));
    expect(landed.stock(WALL_REQUIREMENT.itemId), 'on the shelf, allocated to nothing').toBe(
      WALL_REQUIREMENT.quantity,
    );
    landed.atOneTick([{ type: 'CancelBuildOrder', orderId: 'wall-0' }]);
    expect(landed.runtime.treasury.balanceMinorUnits, 'bricks, not money').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - WALL_COST,
    );
    expect(landed.stock(WALL_REQUIREMENT.itemId), 'and the player keeps them').toBe(WALL_REQUIREMENT.quantity);

    /*
     * How wide the window is, counted rather than asserted from the schedules:
     * step from the landing tick until the order leaves `materials-pending`.
     * The bound is generous so that a schedule change widens the number this
     * records instead of failing it.
     */
    const measured = createSession();
    measured.atOneTick(placements(['wall-0']));
    measured.run(PROCUREMENT_DELIVERY_DELAY_TICKS);
    let ticksHolding = 0;
    while (measured.stateCounts(['wall-0']).get('materials-pending') === 1 && ticksHolding < 200) {
      measured.run(1);
      ticksHolding += 1;
    }
    expect(measured.stateCounts(['wall-0']).get('assigned'), 'it did allocate in the end').toBe(1);
    expect(ticksHolding, 'ten ticks of holding bricks nothing has claimed').toBe(10);

    expect(measured.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - WALL_COST);
    measured.atOneTick([{ type: 'CancelBuildOrder', orderId: 'wall-0' }]);
    expect(measured.runtime.treasury.balanceMinorUnits, 'money again, one state later').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS,
    );
    expect(measured.stock(WALL_REQUIREMENT.itemId), 'and the bricks went with it').toBe(0);
  }, 60_000);
});
