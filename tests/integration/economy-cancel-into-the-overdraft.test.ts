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
 * ## What this takes, and who took it
 *
 * **This heading read "What this branch takes, and why it is unsigned" while
 * the decision was open, and it is marked rather than deleted because the
 * refusal is the record of the escalation working.** ADR 0076's amendment
 * named this window and declined to close it: its case 3 is exactly the window
 * above -- *"In stock in the container. The goods arrived, the order had not
 * yet allocated them […] A player who cancels in this window keeps the
 * material and does not get the money, and that is a real asymmetry rather
 * than an oversight"* -- and its open questions added *"**Not decided either:
 * whether surplus stock can be sold back.** […] That is a new economic surface
 * and a price question (ADR 0017 decision 5 reserves prices with the rest of
 * #29), so it is named and not taken."*
 *
 * **The repository owner took it on 2026-09-02, in the broad reading, with the
 * cost below in front of them**, and ADR 0076's amendment records the ruling.
 * So these cases are a fix's expectations now rather than a proposal's
 * measurements -- and the cost is not hidden by that, it is the last case in
 * this file, measured rather than argued: **place a wall against a shelf you already hold and cancel it, and
 * two bricks become 80 minor units, per gesture, with no clock wait and no
 * crew.** That is a general material-to-money channel, not only #717's window,
 * and it dissolves ADR 0075's locked position for any prison holding bricks.
 * Three of ADR 0076's own sentences about this case are also contradicted by
 * measurement and are reported rather than edited here:
 *
 * 1. *"The window is one scheduled construction tick wide"* -- it is **ten
 *    ticks** wide in the clock a player experiences, because
 *    `ProcurementSystem` is scheduled every tick and `ConstructionSystem`
 *    every tenth. Measured: bricks land at tick 101 and allocate at tick 111.
 * 2. *"the plank is in the container, and paying for it as well is the
 *    one-press hazard"* -- paying for it **and leaving it there** is the
 *    hazard. Paying for it and taking it out is not, and is exactly what the
 *    `'assigned'` arm already does at the same catalogue price.
 * 3. The case reads as one plank in a one-tick window. It is not: a drag buys
 *    on the placing tick, so every delivery in it lands within a tick of every
 *    other and **the whole drag occupies the window at once**. Measured, 328
 *    walls put 26,240 -- the entire opening facility plus 1,240 of the
 *    overdraft -- into it, and cancelling all of them there returned nothing
 *    before the ruling.
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

/**
 * A `CancelBuildOrder` aimed at `orderId`'s true current revision (ADR 0107),
 * read off `runtime` at the moment this is called -- this file's subject is
 * what a cancellation gives back, not whether a press is stale.
 */
function cancelOrder(runtime: SimulationRuntime, orderId: string): SimulationCommand {
  return { type: 'CancelBuildOrder', orderId, expectedRevision: runtime.construction.revisionOf(orderId) };
}

function cancels(runtime: SimulationRuntime, orderIds: readonly string[]): readonly SimulationCommand[] {
  return orderIds.map((orderId) => cancelOrder(runtime, orderId));
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

    session.atOneTick(cancels(session.runtime, orderIds));
    expect(session.runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and no bricks were conjured on the way back').toBe(0);
  }, 60_000);

  it('gives back nothing for one order out of a drag whose stalled tail still wants those bricks', () => {
    /*
     * **The bound that stops the fix re-creating [#687](https://github.com/matmaxalez/lockstate/issues/687)
     * one layer down**, and the stock-side twin of the delivery-side case
     * `tests/integration/economy-money-conservation.test.ts` calls *"will not
     * cancel one lorry two orders are waiting on"*.
     *
     * A drag longer than the overdraft funds splits into a funded head and a
     * stalled tail: 340 walls cost 27,200 and the rung stops the queue at 328
     * of them, so twelve orders stand in `'materials-pending'` with nothing
     * bought for them. Once the head's deliveries land, the 656 bricks on the
     * shelf are **short** of what the whole queue still wants -- 680 -- so
     * cancelling one order does not make a single brick surplus. The bricks are
     * what the tail is waiting on, and selling them would take the queue's own
     * supply away at a balance where `procureForPendingOrders` cannot buy it
     * back: the tail would stall for good and the press would have made the
     * prison strictly worse at building, which is exactly #687's finding.
     *
     * So the honest answer here is **nothing back**, and it is a different
     * sentence from "nothing was ever spent": money *was* spent, and it is
     * sitting in bricks the rest of the queue is about to consume. The press
     * shortens the queue by one order and leaves the supply where it is.
     */
    const walls = 340;
    const session = createSession();
    const orderIds = Array.from({ length: walls }, (unused, index) => `wall-${String(index)}`);

    session.atOneTick(placements(orderIds));
    const strandedBalance = session.runtime.treasury.balanceMinorUnits;
    const funded = session.runtime.procurement.pendingDeliveries.length;
    expect(funded, 'a funded head, and a tail the rung refused').toBeLessThan(walls);
    expect(strandedBalance, 'stopped by the rung rather than by the drag running out').toBeLessThan(
      INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS + WALL_COST,
    );

    session.run(PROCUREMENT_DELIVERY_DELAY_TICKS);
    const shelf = session.stock(WALL_REQUIREMENT.itemId);
    expect(shelf, 'the head\'s bricks, all of them landed').toBe(funded * WALL_REQUIREMENT.quantity);
    expect(shelf, 'and short of what the whole queue still wants').toBeLessThan(walls * WALL_REQUIREMENT.quantity);

    session.atOneTick([cancelOrder(session.runtime, orderIds[0]!)]);
    expect(session.runtime.treasury.balanceMinorUnits, 'nothing back: the tail needs those bricks').toBe(
      strandedBalance,
    );
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and the shelf is untouched').toBe(shelf);
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
    session.atOneTick(cancels(session.runtime, orderIds));
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

  it('turns two bricks into eighty minor units per gesture, which is the surface the owner is being asked for', () => {
    /*
     * **The price of the change, measured, and the reason this branch is a
     * proposal.** The stock arm does not know which bricks a cancelled order's
     * own demand paid for -- `procureForPendingOrders` buys the *deficit*, so a
     * wall placed against a full shelf costs nothing at all and nothing records
     * that it did. It can therefore only ask "is this item surplus to what the
     * queue still wants", and against a shelf the player filled by hand the
     * answer is yes.
     *
     * So *place a wall, cancel the wall* is a sell-back button: two commands,
     * no clock wait, no crew, 80 minor units a gesture, repeatable until the
     * shelf is empty. Nothing is created -- the shelf falls by exactly the two
     * bricks the treasury is paid for -- but the prison has gained the ability
     * to convert material into money at will, which is the *"new economic
     * surface"* ADR 0076's amendment named and left to the owner, and which
     * would dissolve ADR 0075's locked position for any prison holding bricks.
     *
     * This case is here so the surface cannot be taken by accident: if the
     * owner rules against it, this is the test that goes with the arm.
     */
    const session = createSession();
    const stockpile = 12;
    session.atOneTick([
      { type: 'PurchaseMaterials', orderId: 'buy-1', itemId: WALL_REQUIREMENT.itemId, quantity: stockpile },
    ]);
    session.run(PROCUREMENT_DELIVERY_DELAY_TICKS);
    expect(session.stock(WALL_REQUIREMENT.itemId), 'a shelf the player pressed Buy for').toBe(stockpile);
    const afterBuying = session.runtime.treasury.balanceMinorUnits;

    const gestures = 4;
    for (let gesture = 0; gesture < gestures; gesture += 1) {
      const orderId = `sell-${String(gesture)}`;
      session.atOneTick([
        { type: 'PlaceBuildOrder', orderId, definitionId: WALL, x: 3 + gesture, y: 3, edge: 'north', transactionId: `t${String(gesture)}` },
      ]);
      expect(session.runtime.procurement.pendingDeliveries, 'it bought nothing').toHaveLength(0);
      session.atOneTick([cancelOrder(session.runtime, orderId)]);
    }

    expect(session.runtime.treasury.balanceMinorUnits, 'four gestures, four walls\' worth of money').toBe(
      afterBuying + gestures * WALL_COST,
    );
    expect(session.stock(WALL_REQUIREMENT.itemId), 'and the shelf paid for it, brick for brick').toBe(
      stockpile - gestures * WALL_REQUIREMENT.quantity,
    );
  }, 60_000);
});
