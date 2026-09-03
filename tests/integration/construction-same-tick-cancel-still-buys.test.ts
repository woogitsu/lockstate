import { describe, expect, it } from 'vitest';
import { PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS, justInTimePurchaseOrderId } from '../../src/simulation/economy';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';

/**
 * **Issue #861: six build orders placed, nothing bought.**
 *
 * The state this file holds the line on is one a player reaches with the clock
 * stopped, which is why every command here is dispatched through
 * `Kernel.dispatchDueCommands` rather than through `step()`.
 * [ADR 0051](../../docs/adr/0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md)
 * dispatches a command that is already due when it is submitted, even while
 * the clock is paused -- so a player can draw a wall run, cancel one segment
 * and draw more, with **no tick passing between any of it**. Every purchase
 * `JustInTimeMaterialsService` composes at that tick therefore carries the
 * same `tick` part in its id, and #861 measured what that cost: seven standing
 * orders wanting fourteen bricks with **two** on the road and one wall's worth
 * of money spent.
 *
 * The mechanism, and the reason it is a gate rather than a browser run: the
 * purchase order id was `jit:<tick>:<itemId>:<inFlightBefore>` and
 * `inFlightBefore` is **not** monotone within a tick, because a cancel at that
 * same tick gives a delivery back. Two purchases take `...:0` and `...:2`; the
 * cancel takes `...:0` away, putting the in-flight total back to 2 without
 * freeing the id that names 2; and every further order at that tick composes
 * `...:2` again and is refused by `ProcurementSystem.purchase` as a
 * `duplicate-order` -- a refusal `procureForPendingOrders` deliberately
 * swallows, because for a genuine repeat nothing is owed.
 *
 * **What is asserted here is the queue's arithmetic and never an id.** The
 * shape of the id is `justInTimePurchaseOrderId`'s business and
 * `tests/unit/construction-just-in-time-materials.test.ts` is where it is
 * pinned; what a player is owed is that the bricks their standing orders need
 * are paid for, which is what every case below reads off the treasury and the
 * in-flight total.
 */

const SEED = 0x861;
const WALL = 'wall-brick';
const WALL_REQUIREMENT = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!;
const BRICK = WALL_REQUIREMENT.itemId;
/** Read from content rather than written down (`docs/TESTING.md`). */
const UNIT_PRICE = new Map(PROCURABLE_MATERIALS.map((material) => [material.itemId, material.unitPriceMinorUnits]));
const WALL_COST = UNIT_PRICE.get(BRICK)! * WALL_REQUIREMENT.quantity;

/**
 * Submits one command and dispatches it **without advancing a tick** -- the
 * paused player of ADR 0051, and the whole of what makes this file's scenario
 * reachable. `runtime.kernel.tick` is the `executeAtTick`, so the command is
 * already due when it is submitted.
 */
function pressWhilePaused(runtime: SimulationRuntime, command: SimulationCommand): void {
  runtime.kernel.submitCommand(
    `cmd-${runtime.kernel.expectedSequence}`,
    runtime.kernel.expectedSequence,
    runtime.kernel.tick,
    packCommand(command),
  );
  expect(runtime.kernel.dispatchDueCommands(), 'a command that is already due is dispatched on submission').toBe(1);
}

const wall = (orderId: string, x: number): SimulationCommand => ({
  type: 'PlaceBuildOrder',
  orderId,
  definitionId: WALL,
  x,
  y: 3,
  transactionId: `txn-${orderId}`,
});

/** Advances `ticks` scheduled steps from wherever the kernel is now -- relative, not absolute. */
function run(runtime: SimulationRuntime, ticks: number): void {
  for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
}

/** The bricks every order still on the queue is waiting for. */
function standingDemand(runtime: SimulationRuntime, orderIds: readonly string[]): number {
  let bricks = 0;
  for (const orderId of orderIds) {
    const order = runtime.construction.getOrder(orderId);
    if (order === undefined || order.state === 'cancelled' || order.state === 'completed') continue;
    bricks += WALL_REQUIREMENT.quantity;
  }
  return bricks;
}

describe('a cancel at the same tick must not make the next order look like a repeat (#861)', () => {
  it("buys every standing order's bricks, with the whole run given while the clock never moves", () => {
    /*
     * #861's own scenario, at its own numbers: two walls, `Cancel` on the
     * second, then six more walls -- eight presses, one tick, seven orders
     * left standing wanting fourteen bricks.
     *
     * The measurement before the fix, taken on `f948b8e2` through this exact
     * sequence: `IN FLIGHT 2`, `SPENT 80`, and a `lastReport` reading
     * `purchased: [], unfunded: []` -- so the panel had nothing to say about
     * twelve bricks nobody had bought.
     */
    const runtime = createNewSimulationRuntime(SEED);
    const standing: string[] = [];

    pressWhilePaused(runtime, wall('order-1', 3));
    standing.push('order-1');
    pressWhilePaused(runtime, wall('order-2', 4));
    pressWhilePaused(runtime, { type: 'CancelBuildOrder', orderId: 'order-2' });
    for (let index = 3; index <= 8; index += 1) {
      pressWhilePaused(runtime, wall(`order-${index}`, 2 + index));
      standing.push(`order-${index}`);
    }

    expect(runtime.kernel.tick, 'the whole run was given at one tick, which is what makes the ids collide').toBe(0);
    expect(standing).toHaveLength(7);
    expect(standingDemand(runtime, standing), "seven walls' worth of bricks are wanted").toBe(14);
    expect(runtime.construction.getOrder('order-2')?.state).toBe('cancelled');

    /*
     * The claim, in the two figures a player can see: the bricks the standing
     * queue wants are on the road, and the money for exactly those walls has
     * left the treasury. Neither number is computed from the other -- the
     * first is `ProcurementSystem`'s in-flight total, the second is the
     * treasury's own balance.
     */
    expect(runtime.justInTimeMaterials.heldOrInFlightOf(BRICK), 'every wanted brick is paid for and on the road').toBe(
      standingDemand(runtime, standing),
    );
    expect(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - runtime.treasury.balanceMinorUnits,
      'and the money that left is seven walls, not one',
    ).toBe(7 * WALL_COST);
    expect(runtime.justInTimeMaterials.lastReport.unfunded, 'nothing is short of money, so nothing is reported as such').toEqual([]);
    expect(runtime.justInTimeMaterials.lastReport.unprocurable, 'and this was never a content problem').toEqual([]);
  });

  it('is a delay and not a loss, so the fix must not change what the queue costs in the end', () => {
    /*
     * The half of #861 the issue could not answer and this file measures:
     * **the demand was never lost.** Before the fix the shortfall was bought
     * by the next scheduled `ConstructionSystem` pass -- ten ticks away, and
     * unbounded while the clock stays paused, because the tick part of the id
     * never changes -- after which all seven walls stood and the queue had
     * cost exactly `7 x 80`. Measured on `f948b8e2`: `balance 24440` and
     * seven `completed` orders.
     *
     * So the fix moves *when* the money leaves and must move nothing else. A
     * change that bought the queue twice would pass the case above and fail
     * here.
     */
    const runtime = createNewSimulationRuntime(SEED);
    const standing: string[] = [];
    pressWhilePaused(runtime, wall('order-1', 3));
    standing.push('order-1');
    pressWhilePaused(runtime, wall('order-2', 4));
    pressWhilePaused(runtime, { type: 'CancelBuildOrder', orderId: 'order-2' });
    for (let index = 3; index <= 8; index += 1) {
      pressWhilePaused(runtime, wall(`order-${index}`, 2 + index));
      standing.push(`order-${index}`);
    }

    run(runtime, 610);

    for (const orderId of standing) {
      expect(runtime.construction.getOrder(orderId)?.state, `${orderId} stands as a wall`).toBe('completed');
    }
    expect(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - runtime.treasury.balanceMinorUnits,
      'seven walls cost seven walls, whenever the money left',
    ).toBe(7 * WALL_COST);
    expect(runtime.procurement.pendingDeliveries, 'and nothing is still on the road').toEqual([]);
  });

  it('still buys nothing for a queue whose bricks are already on the road, pass after pass', () => {
    /*
     * The double-buy the id scheme was there to stop, asked as a question
     * about money rather than about ids: the pass runs once per
     * `PlaceBuildOrder` at a tick **and** on every scheduled construction
     * tick, so an order in `'materials-pending'` is walked again on the press
     * that places the next wall and on every pass while its delivery is in
     * flight. It must buy nothing on any of them.
     *
     * `PROCUREMENT_DELIVERY_DELAY_TICKS` is ten construction intervals, so
     * the run below sits inside the flight and the assertion is about every
     * pass in it. This is the case a fix that made every id unique *by
     * spending again* would fail.
     */
    const runtime = createNewSimulationRuntime(SEED);
    pressWhilePaused(runtime, wall('order-1', 3));
    pressWhilePaused(runtime, wall('order-2', 4));

    const afterTwo = runtime.treasury.balanceMinorUnits;
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS - afterTwo, 'two walls, two purchases').toBe(2 * WALL_COST);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(2);

    run(runtime, 90);

    expect(runtime.treasury.balanceMinorUnits, 'and the passes inside the flight bought nothing more').toBe(afterTwo);
    expect(runtime.procurement.pendingDeliveries, 'still two deliveries, not a queue of them').toHaveLength(2);
    expect(runtime.justInTimeMaterials.heldOrInFlightOf(BRICK)).toBe(2 * WALL_REQUIREMENT.quantity);
  });

  it('and the session it repairs can still be saved, and its deliveries still cancelled', () => {
    /*
     * **The half of this fix that a green suite did not catch, and the reason
     * this case reaches for a save and a command rather than for a figure.**
     * The purchase whose id collided now carries a suffix, and a purchase order
     * id is an `identifierSchema` in two places that both reach a player:
     * `economySectionSchema`'s `procurement.pending[].orderId`, so an id that
     * fails it cannot be **saved**, and `CancelMaterialPurchase.orderId`, so an
     * id that fails it cannot be **cancelled**. The first draft of this fix
     * suffixed with `#`, which that schema rejects; every test above was green
     * on it, because none of them saved the session or cancelled the delivery.
     *
     * So this case takes #861's own sequence, checks that it really did have to
     * disambiguate an id -- otherwise it would prove nothing -- and then puts
     * that id through both gates.
     */
    const runtime = createNewSimulationRuntime(SEED);
    pressWhilePaused(runtime, wall('order-1', 3));
    pressWhilePaused(runtime, wall('order-2', 4));
    pressWhilePaused(runtime, { type: 'CancelBuildOrder', orderId: 'order-2' });
    pressWhilePaused(runtime, wall('order-3', 5));

    /*
     * Which delivery is the disambiguated one is read as *"not one of the base
     * ids"* rather than by looking for the separator, so this case cannot be
     * satisfied by a separator it agrees with: any suffix at all, of any shape,
     * lands outside this set and goes through both gates below.
     */
    const baseIds = new Set<string>();
    for (let inFlightBefore = 0; inFlightBefore <= 3 * WALL_REQUIREMENT.quantity; inFlightBefore += 1) {
      baseIds.add(justInTimePurchaseOrderId(runtime.kernel.tick, BRICK, inFlightBefore));
    }
    const disambiguated = runtime.procurement.pendingDeliveries.filter((delivery) => !baseIds.has(delivery.orderId));
    expect(disambiguated, 'this sequence must actually reach a collision, or the case below proves nothing').toHaveLength(1);
    const collidedId = disambiguated[0]!.orderId;

    /* Gate one: the save. `captureSessionSnapshot` validates against the real schema. */
    const bundle = captureSessionSnapshot(runtime);
    const restored = restoreSimulationRuntime(bundle, SEED).runtime;
    expect(
      restored.procurement.pendingDeliveries.map((delivery) => delivery.orderId),
      'the restored session holds the same deliveries, suffix and all',
    ).toEqual(runtime.procurement.pendingDeliveries.map((delivery) => delivery.orderId));

    /* Gate two: the command. A delivery a player cannot cancel is a control that lies. */
    const balanceBefore = restored.treasury.balanceMinorUnits;
    pressWhilePaused(restored, { type: 'CancelMaterialPurchase', orderId: collidedId });
    expect(
      restored.procurement.pendingDeliveries.map((delivery) => delivery.orderId),
      'the delivery the player named is the one that left',
    ).not.toContain(collidedId);
    expect(restored.treasury.balanceMinorUnits, 'and the refund landed').toBeGreaterThan(balanceBefore);
  });
});
