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
 * **Over-drag the build queue into the standing overdraft, then take it all
 * back** — [#717](https://github.com/matmaxalez/lockstate/issues/717).
 *
 * ## What the issue claimed, and which half of it survived
 *
 * #717 is titled *"Cancelling a build order returns bricks, never money — and
 * with the standing overdraft an undo now keeps the debt"*, and it names two
 * mechanisms. **The first is still exactly true**: `PlaceBuildOrder` reaches
 * `ConstructionSystem.procureQueuedMaterials` in the command handler, so a drag
 * spends on the placing tick with no press of its own. **The second was already
 * false when this file was written.** The owner's ruling 20 of 2026-08-31 (ADR
 * 0076's amendment of that date, shipped in #746) made a cancellation pay in
 * money for `'approved'`, `'materials-pending'` and `'assigned'`, and
 * `tests/integration/economy-money-conservation.test.ts` pins one case per
 * state. The issue's own reproduction figure — *"Cancelling all thirteen tail
 * orders on the tick after placing them still ends the prison at −1,000"* — is
 * a measurement of a **tail the queue never funded**, which returns nothing in
 * either currency because nothing was ever spent on it;
 * `tests/integration/economy-loan-recovery.test.ts` re-measured that on
 * 2026-09-01 and says so in its own words.
 *
 * ## What was left, and it is the title verbatim
 *
 * Ruling 20 was implemented as `refundSurplusDeliveries` alone, so it paid
 * money only where the money still happened to be in a **delivery**.
 * `ProcurementSystem` is scheduled every tick and `ConstructionSystem` every
 * tenth, so a just-in-time delivery is unloaded into the container up to ten
 * ticks before the order that demanded it reaches `tryAllocate` — and in that
 * window the order is `'materials-pending'`, holds no allocation, and has no
 * delivery to turn around. Measured on `0e2eb7fb`, through the real kernel and
 * the real command handler:
 *
 * | gesture | before #717 | after |
 * | --- | --- | --- |
 * | one wall, cancelled while its delivery is on the road | `25,000`, no bricks | unchanged |
 * | one wall, cancelled after its bricks land, still `materials-pending` | **`24,920` and two bricks** | `25,000`, no bricks |
 * | one wall, cancelled at `'assigned'` | `25,000`, no bricks | unchanged |
 * | 328 walls in one drag, cancelled after the bricks land | **`−1,240` and 656 bricks** | `25,000`, no bricks |
 *
 * The third row is what makes the second a defect rather than a rule: the
 * currency changed between two adjacent states of the same order and changed
 * back again, for a reason a player cannot see. It is the same inversion the
 * ruling of 2026-09-01 closed for `'completed'`.
 *
 * ## Why the overdraft is what made it worth fixing
 *
 * #703 ruling A gave every session a standing overdraft of 2,500
 * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * §2) and #785 equalised the insolvency rungs at −1,250. A drag can therefore
 * spend 26,240 out of a 25,000 facility and stop at −1,240 — ten minor units
 * above the rung a `PurchaseMaterials` press is refused at, and 55 short of the
 * 65 one plank costs. So the prison that over-drags cannot buy the door its
 * first cell needs, cannot zone the cell, cannot admit a prisoner and cannot
 * earn: it is ADR 0075's locked position, reached by a gesture rather than by
 * arithmetic. Before this fix the *undo* left it there, holding 26,240 of value
 * as 656 bricks it could not convert into the 65 it needed. That is the whole
 * of the issue's *"an undo now keeps the debt"*, and the second case below
 * plays it.
 *
 * Every command here goes through `packCommand` and the real kernel:
 * `tests/unit/simulation-refusals.test.ts` states the rule this file follows —
 * a fixture that calls the system directly does not exercise the route the bug
 * lives on.
 */

const WALL = 'wall-brick';
const UNIT_PRICE = new Map(PROCURABLE_MATERIALS.map((material) => [material.itemId, material.unitPriceMinorUnits]));
const WALL_REQUIREMENT = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!;
/** Two bricks at 40, read from content rather than written down (`docs/TESTING.md`). */
const WALL_COST = UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity;
const PLANK = 'item.wood-plank';
const PLANK_PRICE = UNIT_PRICE.get(PLANK)!;

/**
 * The smallest drag that ends the prison under water, computed rather than
 * pinned: one more wall than the opening facility pays for. At the shipped
 * prices that is 313 walls and a balance of −40, and the case below drags
 * further than that on purpose — see its own comment.
 */
const WALLS_TO_GO_UNDER = Math.floor(TREASURY_STARTING_BALANCE_MINOR_UNITS / WALL_COST) + 1;

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

  const submit = (command: SimulationCommand): void => {
    runtime.kernel.submitCommand(`cmd-${String(sequence)}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
  };

  const atOneTick = (commands: readonly SimulationCommand[]): void => {
    for (const command of commands) submit(command);
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

describe('cancelling a drag that spent into the standing overdraft (#717)', () => {
  it('gives back every minor unit when the bricks are still on the road', () => {
    /*
     * The control, and the row of the table this file's header calls unchanged:
     * cancel before the delivery delay is out and `refundSurplusDeliveries`
     * alone already answered the press. It is here so that the case below is
     * measured against the same gesture at a different moment, rather than
     * against a number written down.
     */
    const session = createSession();
    const orderIds = Array.from({ length: WALLS_TO_GO_UNDER }, (unused, index) => `wall-${String(index)}`);

    session.atOneTick(placements(orderIds));
    const spent = TREASURY_STARTING_BALANCE_MINOR_UNITS - session.runtime.treasury.balanceMinorUnits;
    expect(spent, 'the whole drag bought itself on the placing tick').toBe(WALLS_TO_GO_UNDER * WALL_COST);
    expect(session.runtime.treasury.balanceMinorUnits, 'and it is under water').toBeLessThan(0);
    expect(session.stock(WALL_REQUIREMENT.itemId), 'nothing has landed yet').toBe(0);

    session.atOneTick(orderIds.map((orderId) => ({ type: 'CancelBuildOrder' as const, orderId })));
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and no bricks were conjured on the way back').toBe(0);
  }, 60_000);

  it('gives back every minor unit once the bricks have landed, and unlocks the door the drag locked', () => {
    /*
     * ## Why 328 and not `WALLS_TO_GO_UNDER`
     *
     * The point of the case is the *locked* position, not merely a negative
     * balance: the prison has to end below the rung minus a plank, so that the
     * door its first cell needs is genuinely refused. 328 walls spend 26,240
     * and land the balance at −1,240 — inside the overdraft, ten minor units
     * above the equalised rung, and 55 short of one plank. The two assertions
     * below are what make that a measurement rather than an assumption: the
     * plank press really is refused, and the balance really is between the rung
     * and zero.
     *
     * ## Why the wait is exactly the delivery delay
     *
     * `PROCUREMENT_DELIVERY_DELAY_TICKS` after the placing tick every delivery
     * has been unloaded and no construction tick has run since — this system is
     * scheduled every ten ticks and the drag went in at tick 1 — so all 328
     * orders sit in `'materials-pending'` with 656 bricks on the shelf and
     * nothing in flight. That is the window #717's title is about, and reading
     * the state counts here is what stops the case passing vacuously if the
     * schedules ever move.
     */
    const walls = 328;
    const session = createSession();
    const orderIds = Array.from({ length: walls }, (unused, index) => `wall-${String(index)}`);

    session.atOneTick(placements(orderIds));
    const strandedBalance = session.runtime.treasury.balanceMinorUnits;
    expect(strandedBalance, '328 walls at 80, out of a 25,000 facility').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - walls * WALL_COST,
    );
    expect(strandedBalance, 'inside the standing overdraft').toBeGreaterThan(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    expect(strandedBalance, 'and past the rung a Buy press is refused at').toBeLessThan(
      INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS + PLANK_PRICE,
    );

    session.run(PROCUREMENT_DELIVERY_DELAY_TICKS);
    expect(session.stateCounts(orderIds), 'every order still waiting, with its bricks already here').toEqual(
      new Map([['materials-pending', walls]]),
    );
    expect(session.runtime.procurement.pendingDeliveries, 'nothing left on the road').toHaveLength(0);
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and all of it on the shelf').toBe(
      walls * WALL_REQUIREMENT.quantity,
    );

    // The locked position, pressed rather than argued: one plank for one door.
    session.atOneTick([{ type: 'PurchaseMaterials', orderId: 'buy-plank', itemId: PLANK, quantity: 1 }]);
    expect(session.runtime.treasury.balanceMinorUnits, 'refused: the prison cannot buy its own door').toBe(
      strandedBalance,
    );
    expect(session.stock(PLANK), 'and no plank arrived').toBe(0);

    // The undo. Before #717 this moved neither figure: −1,240 and 656 bricks.
    session.atOneTick(orderIds.map((orderId) => ({ type: 'CancelBuildOrder' as const, orderId })));
    expect(session.runtime.treasury.balanceMinorUnits, 'the whole 26,240, in money').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS,
    );
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and the bricks went with it').toBe(0);

    // And the position really is unlocked: the same press now goes through.
    session.atOneTick([{ type: 'PurchaseMaterials', orderId: 'buy-plank-2', itemId: PLANK, quantity: 1 }]);
    expect(session.runtime.treasury.balanceMinorUnits, 'one plank, out of a whole facility').toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - PLANK_PRICE,
    );
  }, 60_000);
});
