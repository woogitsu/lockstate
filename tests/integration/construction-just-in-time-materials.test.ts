import { describe, expect, it, vi } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { projectBuildQueue } from '../../src/simulation/presentation';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { buildQueueFromProjection } from '../../src/ui/simulation-build-queue';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A build order buys what it needs** — [ADR 0017](../../docs/adr/0017-money-primary-resource-model.md)
 * decision 7, discharged (issue #627).
 *
 * ## What was wrong, in the owner's own session
 *
 * That decision is Accepted and reads *"materials are just-in-time by default;
 * holding is permitted, never required."* The code required holding.
 * `ConstructionSystem.update` asked `tryAllocate` for materials the container
 * did not have, got `false`, and parked the order in `'materials-pending'` to
 * be retried on every scheduled tick for ever. #627 is the owner meeting that
 * live: **40 wall orders placed, 25,000 in the bank, nothing built**, and
 * nothing on screen relating the two. Their words: *"gdzie mam kupić te
 * rzeczy? to powinno samo się kupić jak postawiłem ścianę"* — where am I
 * supposed to buy these things? it should buy itself when I place a wall.
 *
 * ## What every figure here is written from
 *
 * `wall-brick` needs 2 `item.brick`, a brick is 40, a prison opens on 25,000.
 * Those three are pinned as literals in the first case and every arithmetic
 * below is written out from them rather than read back off the code — a
 * balance computed from a price the code under test supplied would agree with
 * any price (`docs/TESTING.md`).
 *
 * ## What is measured here and nowhere else
 *
 * - `tests/unit/construction-just-in-time-materials.test.ts` — the deficit
 *   arithmetic, in isolation, against a stub procurement.
 * - `tests/integration/economy-money-conservation.test.ts` — that no route
 *   through this creates or destroys value, on every tick.
 * - here — that a player who never presses *Buy* gets a wall, that a prison
 *   that cannot pay is **told** rather than silently stalled (#629), and what
 *   this costs against [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md).
 */

const SEED = 0x627;
const WALL = 'wall-brick';
const BRICK = 'item.brick';
const PLANK = 'item.wood-plank';

const BRICKS_PER_WALL = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!.quantity;
const BRICK_PRICE = procurableMaterial(BRICK)!.unitPriceMinorUnits;
const PLANK_PRICE = procurableMaterial(PLANK)!.unitPriceMinorUnits;
/** One wall segment, all in: 2 bricks at 40. */
const WALL_COST = 80;

/**
 * One arrival of money with no command behind it, and the ticks that follow
 * it, for the case that characterises what a standing queue does with income.
 *
 * 300 is `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS`, used here as a *shape*
 * rather than as an income model -- this prison has no prisoners and earns
 * nothing, so the credit is applied directly. `INSTALMENT_TICKS` is twenty
 * scheduled construction ticks, which is far more than the queue needs and is
 * chosen so the case measures what the pass settles at rather than where it
 * had got to.
 */
const INSTALMENT = 300;
const INSTALMENT_TICKS = 200;
/** `room.cell`'s authored minimum, the rectangle every object fixture in this repository uses. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;

/**
 * Submits one command and steps once.
 *
 * The sequence is read off the kernel rather than counted by the caller: it
 * refuses a gap, and every case here mixes commands the fixture sends with
 * commands the case sends.
 */
function send(runtime: SimulationRuntime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

const stockOf = (runtime: SimulationRuntime, itemId: string): number =>
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf(itemId);

const statesOf = (runtime: SimulationRuntime): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const order of runtime.construction.snapshot().orders) {
    counts[order.state] = (counts[order.state] ?? 0) + 1;
  }
  return counts;
};

/**
 * Places `count` wall orders down one column, through the real command
 * boundary.
 *
 * Distinct tiles, because `submitOrder` refuses a second order for an edge one
 * is already standing on (`duplicate-order`, #514) and a fixture that placed
 * forty orders on one tile would be measuring that refusal instead.
 */
function placeWalls(runtime: SimulationRuntime, count: number): string[] {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const orderId = `order-${String(index).padStart(3, '0')}`;
    ids.push(orderId);
    send(
      runtime,
      { type: 'PlaceBuildOrder', orderId, definitionId: WALL, x: 4 + (index % 20), y: 4 + Math.floor(index / 20) },
    );
  }
  return ids;
}

describe('a build order buys its own materials (#627, ADR 0017 decision 7)', () => {
  it('pins the three figures every case below is written from', () => {
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS).toBe(25_000);
    expect(BRICKS_PER_WALL).toBe(2);
    expect(BRICK_PRICE).toBe(40);
    expect(BRICKS_PER_WALL * BRICK_PRICE).toBe(WALL_COST);
    expect(PLANK_PRICE).toBe(65);
  });

  it('builds the owner\'s forty walls with 25,000 in the bank and no Buy press at all', () => {
    /*
     * #627, played. Forty orders, an empty container, and not one
     * `PurchaseMaterials` command in the stream.
     *
     * The old behaviour is what makes this a gate rather than a demonstration:
     * before this change every one of the forty sat at `materials-pending` for
     * the whole run and the balance never moved, which is exactly the state
     * the owner was looking at.
     */
    const runtime = createNewSimulationRuntime(SEED);
    expect(stockOf(runtime, BRICK), 'the prison must start with no bricks').toBe(0);

    placeWalls(runtime, 40);

    // 40 x 2 bricks at 40 = 3,200, spent at the press and not a minor unit more.
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - 40 * WALL_COST);
    expect(runtime.treasury.balanceMinorUnits).toBe(21_800);
    expect(
      runtime.procurement.pendingDeliveries.reduce((total, delivery) => total + delivery.quantity, 0),
      'eighty bricks are on their way, and none of them is here yet',
    ).toBe(80);
    expect(stockOf(runtime, BRICK)).toBe(0);

    // Long enough for the delivery (100 ticks) and for one crew to build forty
    // walls at 50 work a piece, 10 a scheduled tick, one at a time (#348).
    step(runtime, 4_000);

    expect(statesOf(runtime), 'every wall the owner drew is standing').toEqual({ completed: 40 });
    expect(stockOf(runtime, BRICK), 'and nothing was over-bought').toBe(0);
    expect(runtime.treasury.balanceMinorUnits).toBe(21_800);
  });

  it('buys nothing for a player who bought the bricks themselves', () => {
    /*
     * The other half of decision 7 — *"holding is permitted"* — as a
     * measurement. A player who pre-buys must see exactly what they saw before
     * this change: their own purchase, and no second one.
     *
     * Both terms of the deficit are exercised: the first ten orders are placed
     * while the bricks are still **in flight**, the last ten after they have
     * landed as **stock**. Dropping either term from
     * `JustInTimeMaterialsService` double-buys one half or the other.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, { type: 'PurchaseMaterials', orderId: 'order-buy', itemId: BRICK, quantity: 40 });
    const afterOwnPurchase = runtime.treasury.balanceMinorUnits;
    expect(afterOwnPurchase).toBe(25_000 - 40 * BRICK_PRICE);

    // In flight.
    for (let index = 0; index < 10; index += 1) {
      send(runtime, { type: 'PlaceBuildOrder', orderId: `order-a${index}`, definitionId: WALL, x: 4, y: 4 + index });
    }
    expect(runtime.treasury.balanceMinorUnits, 'the lorry already has these bricks on it').toBe(afterOwnPurchase);
    expect(runtime.procurement.pendingDeliveries, 'and no second lorry was sent').toHaveLength(1);

    // Landed.
    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 2);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);
    for (let index = 0; index < 10; index += 1) {
      send(runtime, { type: 'PlaceBuildOrder', orderId: `order-b${index}`, definitionId: WALL, x: 6, y: 4 + index });
    }
    expect(runtime.treasury.balanceMinorUnits, 'these bricks are on the shelf').toBe(afterOwnPurchase);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);

    step(runtime, 4_000);
    expect(statesOf(runtime)).toEqual({ completed: 20 });
    expect(runtime.treasury.balanceMinorUnits, 'twenty walls, one purchase, and it was the player\'s').toBe(afterOwnPurchase);
  });

  it('gives two orders placed on one tick two separate deliveries, not one refused as a duplicate', () => {
    /*
     * `justInTimePurchaseOrderId`'s fourth part, measured.
     *
     * The kernel dispatches **every** command due at a tick before any system
     * runs, so a dragged wall run puts several `PlaceBuildOrder` commands on
     * one tick and each buys the increment its own order added. Keyed only on
     * `(tick, itemId)` the second is a `duplicate-order`, which this service
     * reads as "already ordered" — so the second wall would have waited for
     * ever while the report said nothing was wrong.
     *
     * Two purchases at one tick, for two bricks each, is what says the fourth
     * part is doing its job.
     */
    const runtime = createNewSimulationRuntime(SEED);
    runtime.kernel.submitCommand('cmd-0', 0, 0, packCommand({ type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 }));
    runtime.kernel.submitCommand('cmd-1', 1, 0, packCommand({ type: 'PlaceBuildOrder', orderId: 'order-b', definitionId: WALL, x: 4, y: 5 }));
    runtime.kernel.step();

    expect(
      runtime.procurement.pendingDeliveries.map((delivery) => [delivery.orderId, delivery.itemId, delivery.quantity]),
    ).toEqual([
      ['jit:0:item.brick:0', BRICK, 2],
      ['jit:0:item.brick:2', BRICK, 2],
    ]);
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - 2 * WALL_COST);

    step(runtime, 4_000);
    expect(statesOf(runtime), 'both walls, not one').toEqual({ completed: 2 });
  });
});

describe('a prison that cannot pay is told, at the press (#629, ADR 0017 decision 2)', () => {
  /**
   * ADR 0017 decision 2 rides with decision 7: *"a purchase that cannot be
   * afforded must be refusable."* Issue #629 is what makes "refusable" mean
   * "reaches the player": *"a mechanic the player must discover in order to
   * proceed is a defect"*, and the worked example is #627 — *"Awaiting
   * Materials"* was present the whole time, inside a fold that starts shut.
   */

  /**
   * Spends the treasury down to `balance` on planks, which no wall can use.
   *
   * **This helper took a positive `remainder` and every case below called it
   * with `40`** -- *"40 in the bank against a wall that costs 80"*. That was the
   * whole of "cannot pay" while `Treasury`'s floor was 0. Since #703 ruling A
   * every session opens a standing overdraft of 2,500
   * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
   * §2), so 40 in the bank buys 2,540 worth of wall and the refusal these cases
   * are about is not reached at all.
   *
   * **The fixture moved and the subject did not.** What every case below
   * measures is the refusal *machinery* -- that the player is told on the press,
   * that the order is kept, that the shortfall figure reaches the view model --
   * and none of that is about where the boundary sits. So the position is now
   * `-2,430`: seventy minor units of room against a wall that costs eighty,
   * which is the same relationship `40` against `80` expressed against the floor
   * the prison actually has. `PLANK_PRICE` is 65 and 25,000 mod 65 is 40, so
   * `-2,430` is the deepest balance a whole number of planks can reach that
   * still cannot fund a wall: 422 planks, and 70 of the facility left.
   *
   * The floor is deliberately **not** closed with `setOverdraftFloor(0)` to make
   * the old figures work again. That would leave every case here exercising a
   * configuration no session has.
   */
  function prisonWith(balance: number): SimulationRuntime {
    const runtime = createNewSimulationRuntime(SEED);
    const planks = (25_000 - balance) / PLANK_PRICE;
    expect(Number.isInteger(planks), 'the fixture must spend a whole number of planks').toBe(true);
    send(runtime, { type: 'PurchaseMaterials', orderId: 'order-buy', itemId: PLANK, quantity: planks });
    expect(runtime.treasury.balanceMinorUnits).toBe(balance);
    expect(
      runtime.treasury.canAfford(WALL_COST),
      'the fixture only means anything if a wall is genuinely unaffordable from here',
    ).toBe(false);
    return runtime;
  }

  /**
   * Seventy of room against an eighty-minor-unit wall: the position every case
   * in this describe is written from. See `prisonWith`.
   */
  const CANNOT_FUND_A_WALL = -2_430;

  it('records the refusal on the press, keeps the order, and says how much is missing', () => {
    // 40 in the bank against a wall that costs 80.
    const runtime = prisonWith(CANNOT_FUND_A_WALL);

    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });

    // 1. The alert band, which is the channel that does not have to be opened.
    expect(runtime.refusals.last?.reason, 'the player is told on the press').toBe('purchase.insufficient-funds');
    expect(runtime.refusals.last?.tick).toBe(runtime.kernel.tick - 1);

    // 2. The treasury is untouched: a refused purchase spends nothing, and
    //    nothing joined the queue behind the fixture's own plank order.
    expect(runtime.treasury.balanceMinorUnits).toBe(CANNOT_FUND_A_WALL);
    expect(runtime.procurement.pendingDeliveries.map((delivery) => delivery.orderId)).toEqual(['order-buy']);

    // 3. The order is kept rather than thrown away, so the wall the player drew
    //    is still theirs when the money arrives.
    expect(runtime.construction.getOrder('order-a')?.state).not.toBe('failed');

    // 4. And the queue's own read model says *why* it is not moving, which is
    //    what `'materials-pending'` alone cannot: the same state means "the
    //    lorry is coming" for a funded order.
    step(runtime, 20);
    const view = projectBuildQueue(runtime.construction, {}, runtime.justInTimeMaterials);
    expect(view.materialsFunding).toEqual({
      unfunded: true,
      shortfallMinorUnits: WALL_COST,
      items: [{ itemId: BRICK, quantity: BRICKS_PER_WALL, costMinorUnits: WALL_COST }],
    });
    expect(view.orders.rows.map((row) => row.state), 'and the state alone would have said nothing').toEqual([
      'materials-pending',
    ]);

    /*
     * 5. And twenty ticks of scheduled retries have NOT taken the notice down.
     *
     * The counterpart of the withdrawal case below, and it is here because a
     * withdrawal that fires unconditionally passes that one: #640 wires the
     * scheduled report to `refusals.supersede` only when the pass funded
     * everything, and without the guard a prison that still cannot pay would
     * clear its own warning on the next construction tick and go back to
     * looking like an idle crew -- which is #627's original defect exactly.
     * Measured: dropping the guard leaves every other test in this repository
     * green.
     */
    expect(runtime.refusals.last?.reason, 'the retries withdrew a shortfall that is still true').toBe(
      'purchase.insufficient-funds',
    );
    expect(runtime.refusals.count, 'and the retries did not re-record it either').toBe(1);
  });

  it('hands the main thread the number the prison is short by, instead of dropping it at the boundary', () => {
    /*
     * The half of #629 that #640 computed and did not deliver, measured end to
     * end: a prison that genuinely cannot pay, through the projection the
     * worker answers `hud/build-queue` with, through the translator the Build
     * panel is fed from, to the view model a surface can read.
     *
     * **Why this is worth an integration case and not only the unit
     * passthrough in `tests/unit/ui-simulation-build-queue.test.ts`:** that one
     * is handed a `materialsFunding` block written in the test, so it proves
     * the field survives the mapping and nothing about the figure. This one is
     * handed a treasury of 40 and a wall priced at 80 by the shipped catalogue,
     * and the number it asserts -- 80, the pinned literal this file opens with
     * -- was produced by the simulation rather than by the assertion.
     *
     * **Both directions, in one case, and that is deliberate.** A passthrough
     * hard-coded to `{ unfunded: true, shortfallMinorUnits: 80 }` would satisfy
     * the first half; one hard-coded to the empty block would satisfy the
     * second. Only carrying the projection's own answer satisfies both.
     *
     * **What this does not claim.** It is a view model, not a pixel. Nothing in
     * `src/ui/hud/build-panel.ts` reads `materialsFunding` yet and no test here
     * says it does: rendering the figure needs a player-facing sentence that
     * does not exist and that `AGENTS.md` reserves to the owner. See
     * `docs/HUD_PROJECTIONS.md` gap 32b.
     */
    const runtime = prisonWith(CANNOT_FUND_A_WALL);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });
    step(runtime, 20);

    const stalled = buildQueueFromProjection(
      projectBuildQueue(runtime.construction, {}, runtime.justInTimeMaterials),
      () => 'hud.build.buildable.wall-brick',
    );
    expect(stalled.materialsFunding).toEqual({ unfunded: true, shortfallMinorUnits: WALL_COST });
    expect(stalled.orders.map((order) => order.state), 'and the row alone still says nothing about money').toEqual([
      'materials-pending',
    ]);

    // The money comes back, the scheduled pass buys, and the same route says so
    // -- so the figure above is the projection's answer and not a constant.
    send(runtime, { type: 'CancelMaterialPurchase', orderId: 'order-buy' });
    step(runtime, 4_000);
    const settled = buildQueueFromProjection(
      projectBuildQueue(runtime.construction, {}, runtime.justInTimeMaterials),
      () => 'hud.build.buildable.wall-brick',
    );
    expect(settled.materialsFunding).toEqual({ unfunded: false, shortfallMinorUnits: 0 });
  });

  it('builds the order it could not afford, without a further press, once the money is back', () => {
    /*
     * The reason the order is kept rather than refused outright, and the
     * reason the just-in-time pass runs on the construction tick as well as on
     * the press. ADR 0017 decision 8 and ADR 0075 both say insolvency is a
     * state a prison digs out of; a queue that threw away the player's walls
     * on the way in would make digging out mean drawing them again.
     *
     * `CancelMaterialPurchase` is the money coming back — the one command in
     * the union that credits the treasury — so this needs no population and no
     * day boundary.
     */
    const runtime = prisonWith(CANNOT_FUND_A_WALL);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');

    // Three scheduled construction ticks, and short of the fixture's own
    // delivery at tick 100 -- the refund below needs a purchase still in
    // flight, and `CancelMaterialPurchase` refuses one that has landed.
    step(runtime, 30);
    expect(runtime.construction.getOrder('order-a')?.state, 'still waiting, and still the player\'s').toBe(
      'materials-pending',
    );

    send(runtime, { type: 'CancelMaterialPurchase', orderId: 'order-buy' });
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);

    // No further `PlaceBuildOrder`. The scheduled pass is what buys.
    step(runtime, 4_000);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('completed');
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - WALL_COST);
    expect(projectBuildQueue(runtime.construction, {}, runtime.justInTimeMaterials).materialsFunding, 'and the shortfall stopped being reported').toEqual({
      unfunded: false,
      shortfallMinorUnits: 0,
      items: [],
    });
  });

  it('takes the notice down on the scheduled tick, with nothing pressed after the money came back (#640)', () => {
    /*
     * The second half of #640's playtest, and it is worse than that pass could
     * see from outside. It measured the band saying *"The materials were not
     * ordered — there are not enough funds."* -- the sentence this key carried
     * until the owner's ruling 23 of 2026-08-31, quoted as the playtest
     * recorded it -- unchanged for four minutes while
     * eighty-one walls went up behind it, and named the cause:
     * `ConstructionSystem.update` called `procureQueuedMaterials` and threw the
     * report away, so only the two press paths -- `construction/handler.ts` and
     * `runtime/session-commands.ts` -- ever reached `reportMaterialsFunding`.
     *
     * In that run the sentence was at least still *true*: 312 of 313 segments
     * were funded and the last never would be. This case is the direction where
     * it is false. The treasury is refunded in full, the scheduled pass buys the
     * bricks and the crew finishes the wall -- and before this change
     * `refusals.last` was still the `purchase.insufficient-funds` recorded at
     * tick 1, standing over a solvent prison with the wall up. No press had
     * happened since, and none ever would: the only route to a withdrawal was a
     * press.
     *
     * **What this does NOT assert, deliberately.** Nothing here says a shortfall
     * that *arises* on a scheduled tick is announced -- payroll draining the
     * treasury under a standing queue is still silent. That is the open
     * question this change refused to settle: whether a refusal is an event
     * caused by a press or a condition of the prison. It is filed as its own
     * issue, and the withdraw-only asymmetry in `createNewSimulationRuntime` is
     * where the reasoning lives.
     */
    const runtime = prisonWith(CANNOT_FUND_A_WALL);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });
    expect(runtime.refusals.last?.reason, 'the press is what announced it').toBe('purchase.insufficient-funds');

    send(runtime, { type: 'CancelMaterialPurchase', orderId: 'order-buy' });
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);

    // The last command this session receives. Everything below is the clock.
    step(runtime, 4_000);
    expect(runtime.construction.getOrder('order-a')?.state, 'the wall the notice is about').toBe('completed');

    expect(runtime.refusals.last, 'the notice outlived the condition it describes').toBeUndefined();
    // Withdrawn, not un-happened: `count` is a historical tally and `supersede`
    // does not touch it. A fix that cleared this would be hiding the refusal
    // rather than withdrawing it.
    expect(runtime.refusals.count, 'the refusal happened, and the count still says so').toBe(1);
  });

  it('withdraws the standing refusal when the same purchase later succeeds', () => {
    // #492's supersession, on this route: a shortfall the player has since
    // fixed must not keep a notice on screen.
    const runtime = prisonWith(CANNOT_FUND_A_WALL);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');

    send(runtime, { type: 'CancelMaterialPurchase', orderId: 'order-buy' });
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-b', definitionId: WALL, x: 4, y: 5 });

    expect(runtime.refusals.last, 'the same item and quantity, bought this time').toBeUndefined();
    expect(runtime.refusals.count, 'the refusal happened, and the count says so').toBe(1);
  });
});

describe('a placed object is a build order too (ADR 0028 decision 4)', () => {
  /**
   * `PlaceObject` reaches the same queue by a different door: it is routed in
   * `runtime/session-commands.ts` rather than `construction/handler.ts`, and
   * `ObjectPlacementService.place` submits a `BuildOrder` once the footprint
   * checks pass. So everything above has to be true of a bed as well as of a
   * wall, and it is a *separate* call site -- measured: removing it leaves
   * every other test in this repository green.
   */

  /** A walled, zoned cell, which is what `PlaceObject` refuses without (`outside-room`). */
  function prisonWithACell(): SimulationRuntime {
    const runtime = createNewSimulationRuntime(SEED);
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    send(runtime, { type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
    return runtime;
  }

  it('buys the plank on the press, not on the next scheduled tick', () => {
    const runtime = prisonWithACell();
    const before = runtime.treasury.balanceMinorUnits;

    send(runtime, { type: 'PlaceObject', orderId: 'order-bed', definitionId: 'bed-wooden', x: CELL_RECT.x, y: CELL_RECT.y });

    expect(runtime.treasury.balanceMinorUnits, 'one plank at 65, at the press').toBe(before - PLANK_PRICE);
    expect(runtime.procurement.pendingDeliveries.map((delivery) => [delivery.itemId, delivery.quantity])).toEqual([
      [PLANK, 1],
    ]);

    step(runtime, 4_000);
    expect(runtime.construction.getOrder('order-bed')?.state).toBe('completed');
    expect(runtime.placedObjects.size).toBe(1);
  });

  it('tells the player on the press when the prison cannot pay for it', () => {
    const runtime = prisonWithACell();
    /*
     * **This bought 624 bricks and asserted a balance of 40** -- "down to 40, on
     * bricks a bed cannot use". Since #703 ruling A a prison at 40 can afford a
     * 65 plank out of its standing overdraft, so the press is not refused and
     * the case measured nothing.
     *
     * The bed needs one plank at 65. 687 bricks is 27,480 of the 27,500 a new
     * prison can spend, leaving **20** of the facility -- so a plank is
     * unaffordable by 45 and the refusal this case is about is reached again.
     * The prison holds bricks a bed cannot use either way, which is the property
     * the fixture was chosen for.
     */
    send(runtime, { type: 'PurchaseMaterials', orderId: 'order-buy', itemId: BRICK, quantity: 687 });
    expect(runtime.treasury.balanceMinorUnits).toBe(-2_480);
    expect(runtime.treasury.canAfford(PLANK_PRICE), 'a plank is 65 and 20 of room is left').toBe(false);

    send(runtime, { type: 'PlaceObject', orderId: 'order-bed', definitionId: 'bed-wooden', x: CELL_RECT.x, y: CELL_RECT.y });

    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits).toBe(-2_480);
    expect(runtime.construction.getOrder('order-bed')?.state, 'and the bed is still the player\'s').not.toBe('failed');
  });
});

describe('the order the queue is funded in (#703 ruling 12)', () => {
  /** A walled, zoned cell, so a bed order is accepted rather than refused `outside-room`. */
  function prisonWithACell(): SimulationRuntime {
    const runtime = createNewSimulationRuntime(SEED);
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    send(runtime, { type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
    return runtime;
  }

  it('funds the order the player placed first, not the cheaper one and not the lower id (#722)', () => {
    /*
     * **The one property of ruling 12 that nothing else in this repository
     * measures**, and it was found by mutation: reversing the walk
     * `ConstructionSystem.pendingOrderDemand` hands the sink left the whole
     * suite green (4,095 passed), because a queue of identical wall orders
     * cannot tell which of them the money was spent on -- every purchase lands
     * in one shared container and `ContainerMaterialsProvider.tryAllocate`
     * decides which order gets it, by its own ascending-id walk.
     *
     * A **mixed** queue can tell, because the two orders want different
     * materials. A wall wants 2 bricks (80) and a bed wants 1 plank (65). With
     * exactly 80 of spending room and both already queued, the walk's first
     * order is funded and the second is left; the container's contents are the
     * answer.
     *
     * **Until 2026-08-31 that first order was the lower id and this test was
     * called *"funds the earlier order in the crew's own walk, not the cheaper
     * one and not the later one"*.** It funded `order-aa`, the wall, which was
     * placed *second*, and its own comment recorded the limit: *"the ids here
     * are chosen so that ascending id is a fact this case can state. A session
     * mints `order-${crypto.randomUUID()}`, so which of a player's two orders
     * is `order-aa` and which is `order-zz` is a draw they cannot see. ADR
     * 0082 proposes the persisted placement ordinal that would fix it and is
     * unsigned."* It was signed, #722 implemented it, and this is the case
     * where the fix is visible in money: the bed is placed first and the bed is
     * what the 80 buys, even though `order-zz` sorts after `order-aa`.
     *
     * **It is also the only test in the suite that pins the `PlaceObject`
     * route's ordinal against a wall's.** A placed object is a build order
     * (ADR 0028 decision 4), so it queues with the walls rather than beside
     * them; an implementation that stamped only `PlaceBuildOrder` would leave
     * the bed unstamped, sort it ahead of everything at the `-1` sentinel, and
     * pass this test for the wrong reason -- which is why the assertion below
     * reads the ordinals directly as well as the money.
     */
    const runtime = prisonWithACell();

    /*
     * Drained through `Treasury.spend` rather than through the *Buy* control on
     * purpose: a purchase would land materials in the container ten seconds
     * later, and a wall order with bricks in stock needs no purchase at all --
     * which would make this a case about stock instead of about the walk.
     */
    const roomBefore = runtime.treasury.balanceMinorUnits - runtime.treasury.overdraftFloorMinorUnits;
    expect(runtime.treasury.spend(roomBefore), 'the prison starts this case with nothing to spend').toBe(true);
    expect(runtime.treasury.canAfford(1)).toBe(false);

    // Both are placed while nothing is affordable, so neither is funded by its
    // own press and both are waiting when the money arrives.
    send(runtime, { type: 'PlaceObject', orderId: 'order-zz', definitionId: 'bed-wooden', x: CELL_RECT.x, y: CELL_RECT.y });
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-aa', definitionId: WALL, x: 20, y: 20 });
    expect(runtime.procurement.pendingDeliveries, 'nothing was bought at either press').toEqual([]);

    // Exactly one wall, and 15 short of the wall plus the bed.
    runtime.treasury.credit(WALL_COST);
    expect(runtime.treasury.balanceMinorUnits - runtime.treasury.overdraftFloorMinorUnits).toBe(80);

    /*
     * One scheduled construction tick, and no more: `lastReport` is rewritten
     * by every pass, so the pass *after* the buying one reports an empty
     * `purchased` -- the bricks are in flight by then and nothing is left to
     * buy. The buying pass is the one this case is about.
     */
    const buyingTick = 10;
    step(runtime, buyingTick);

    // The bed was drawn first, so the bed is funded -- and the ordinals say so
    // rather than the ids: `order-zz` carries the smaller `placementSequence`
    // and the larger id, which is the pair that makes this case decisive.
    const bedSequence = runtime.construction.getOrder('order-zz')?.placementSequence;
    const wallSequence = runtime.construction.getOrder('order-aa')?.placementSequence;
    expect(bedSequence).toBeTypeOf('number');
    expect(wallSequence).toBeTypeOf('number');
    expect(bedSequence!).toBeLessThan(wallSequence!);

    expect(runtime.justInTimeMaterials.lastReport.purchased).toEqual([
      { itemId: PLANK, quantity: 1, costMinorUnits: PLANK_PRICE },
    ]);
    expect(runtime.justInTimeMaterials.lastReport.unfunded).toEqual([
      { itemId: BRICK, quantity: BRICKS_PER_WALL, costMinorUnits: WALL_COST },
    ]);
    expect(
      runtime.procurement.pendingDeliveries.map((delivery) => delivery.itemId),
      'a plank for order-zz, and no bricks for order-aa',
    ).toEqual([PLANK]);
    // 80 less the plank's 65. Written out rather than read back: the residual
    // is what says the wall was refused for the whole 80 and not part-funded,
    // which is ruling 12's per-order atomicity.
    expect(runtime.treasury.balanceMinorUnits - runtime.treasury.overdraftFloorMinorUnits).toBe(15);
    expect(runtime.treasury.canAfford(WALL_COST), 'what is left cannot buy the wall').toBe(false);
  });
});

describe('what auto-procurement costs, measured rather than assumed', () => {
  /**
   * **A standing build queue spends money that arrives after it was placed,
   * with no press between the two. Characterised, not judged.**
   *
   * ## Why this exists, and it is a correction
   *
   * The agent that implemented #703 ruling 9 measured
   * `scripts/report-loan-recovery-pricing.mjs` §10c by tagging every
   * `ConstructionSystem.procureQueuedMaterials` call with its caller, found the
   * scheduled pass spending **0** in all five runs against the presses' 27,440,
   * and concluded that the scheduled pass does not spend. **The measurement was
   * right and the conclusion generalised past it.** §10c never gives a prison
   * money *after* its queue is standing, so the press is the only moment money
   * exists there -- a fixture agreeing with any implementation, which
   * `docs/TESTING.md` names as its own defect class. This case is the shape §10c
   * cannot produce.
   *
   * ## What it is NOT
   *
   * Not a defect in procurement. Every order below was **placed by the player**,
   * and buying for it later is ADR 0017 decision 7 doing exactly what the owner
   * asked for in #627 -- *"it should buy itself when I place a wall"*. A queue
   * that forgot its orders the moment the money ran out is the behaviour #627
   * was filed against.
   *
   * ## What it is
   *
   * A **cost the player is not shown**, and it only became reachable when #703
   * ruling A opened a standing overdraft. A player who drags a perimeter while
   * broke and then forgets watches their income turn into wall over the
   * following days, with nothing on screen relating the two. The sentence that
   * would relate them is ADR 0081 open question 2 and is the owner's; this case
   * is the measurement that sentence would be written against.
   *
   * ## The figures, and what per-order fill changed about them
   *
   * Measured on both trees with one probe -- ten wall orders at 80, drained to
   * the floor, then 300 credited per in-game day with nothing pressed, walls
   * counted at dusk:
   *
   * ```
   *          all-or-nothing (c6cd3e3)      per order (this branch)
   *   day     room left    walls standing   room left    walls standing
   *     1        300            0               60             3
   *     2        600            0               40             7
   *     3        100           10              100            10
   *    4-6    identical     identical       identical      identical
   * ```
   *
   * The case below is the same shape at a shorter interval, and it counts
   * **money out** rather than walls up -- see the comment on `boughtAtDusk` for
   * why the two are not the same measurement.
   *
   * **The endpoint and the total are identical to the minor unit**: 800, which
   * is the queue's own cost, and the floor is never reached under either rule.
   * What ruling 9 moved is *when*: the threshold at which the queue starts
   * taking income falls from the whole queue's cost to the cheapest single
   * order -- 800 to 80 here -- so the prison gets its walls two instalments
   * sooner and holds 60 and 40 where it used to hold 300 and 600. Both of those
   * are below the 65 a plank costs, which is
   * [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)'s
   * whole subject, and it is the trade ruling 9 chose rather than a side effect
   * of it.
   */
  it('spends income that arrives after placement, with nothing pressed in between (#703)', () => {
    const runtime = createNewSimulationRuntime(SEED);
    const roomOf = (): number => runtime.treasury.balanceMinorUnits - runtime.treasury.overdraftFloorMinorUnits;

    /*
     * Drained to exactly the floor, so no order can be funded by the press that
     * places it and the press path is out of the picture entirely. Through
     * `Treasury.spend` rather than the Buy control, because a purchase would
     * land materials in the container and the queue would then need none.
     */
    expect(runtime.treasury.spend(roomOf())).toBe(true);
    expect(roomOf()).toBe(0);

    const orders = placeWalls(runtime, 10);
    expect(runtime.treasury.balanceMinorUnits, 'nothing was funded at any press').toBe(
      runtime.treasury.overdraftFloorMinorUnits,
    );
    expect(runtime.procurement.pendingDeliveries).toEqual([]);
    /*
     * One `materials-pending` and nine `approved`: `update` promotes the first
     * eligible order per scheduled tick and only one tick has run. Both states
     * count toward demand (`pendingMaterialDemand`), which is why one pending
     * order draws ten walls' worth of purchasing.
     */
    expect(statesOf(runtime)).toEqual({ 'materials-pending': 1, approved: 9 });

    /*
     * Below one order's cost, nothing at all happens -- the residual bound, at
     * the top of the range this time rather than the bottom.
     */
    runtime.treasury.credit(WALL_COST - 1);
    step(runtime, INSTALMENT_TICKS);
    expect(runtime.treasury.balanceMinorUnits, '79 buys no part of an 80 order').toBe(
      runtime.treasury.overdraftFloorMinorUnits + WALL_COST - 1,
    );
    expect(statesOf(runtime).completed ?? 0).toBe(0);

    /*
     * And now money arrives the way income arrives: with no command, while the
     * clock runs. Nothing below presses anything.
     */
    const walletAtDusk: number[] = [];
    const boughtAtDusk: number[] = [];
    let spentUnpressed = 0;
    for (let instalment = 0; instalment < 3; instalment += 1) {
      const before = runtime.treasury.balanceMinorUnits;
      runtime.treasury.credit(INSTALMENT);
      step(runtime, INSTALMENT_TICKS);
      spentUnpressed += before + INSTALMENT - runtime.treasury.balanceMinorUnits;
      walletAtDusk.push(roomOf());
      boughtAtDusk.push(spentUnpressed);
    }

    /*
     * **Money spent, not walls standing**, and the distinction cost this case
     * one revision: `completed` lags funding by however long the crew takes,
     * one order at a time, so a case asserting walls would have been measuring
     * `ConstructionSystem`'s throughput and calling it procurement. What this
     * case is about is what leaves the treasury.
     *
     * Four orders per instalment: the 79 left over from the boundary above
     * rides along, so 379 covers four whole 80s with 59 to spare.
     */
    expect(boughtAtDusk, 'four orders, four more, then the last two').toEqual([320, 640, 800]);
    expect(walletAtDusk, 'and what the player is left holding while it happens').toEqual([59, 39, 179]);

    // The whole of what the queue can ever take, and it is the queue's own cost.
    expect(spentUnpressed).toBe(orders.length * WALL_COST);
    expect(spentUnpressed).toBe(800);
    expect(runtime.justInTimeMaterials.lastReport.unfunded, 'every order is paid for').toEqual([]);

    // It stops. A drained queue takes nothing more, however long the clock runs.
    const settled = runtime.treasury.balanceMinorUnits;
    runtime.treasury.credit(INSTALMENT);
    step(runtime, INSTALMENT_TICKS * 3);
    expect(runtime.treasury.balanceMinorUnits, 'an empty queue is not a standing charge').toBe(settled + INSTALMENT);

    // And no route through any of it got under the floor.
    expect(runtime.treasury.balanceMinorUnits).toBeGreaterThanOrEqual(runtime.treasury.overdraftFloorMinorUnits);
  });

  it('makes ADR 0075\'s hard lock reachable by a drag gesture, and this is a finding for the owner', () => {
    /*
     * **ADR 0075 is about a prison that cannot afford its first bed**, and
     * `tests/integration/economy-liquidity-hard-lock.test.ts` pins the trap:
     * a balance below `PLANK_PRICE` with no plank in stock and nothing
     * plank-built to reverse can never earn another minor unit, because state
     * income needs a bed and a bed needs a plank. That file reaches it by one
     * deliberate press of a control — 625 bricks for exactly 25,000.
     *
     * Before this change a wall order cost nothing, so **no amount of
     * dragging could reach it**. It now can, and this case is the number.
     *
     * **What this case said until 2026-08-31, and it was measured:**
     *
     * > floor(25,000 / 80) = 312 wall segments, leaving 40.
     * >
     * > 40 is *the same figure* ADR 0075's own second case calls out — *"a
     * > positive balance on the status strip, and below the 65 that would end
     * > this"*. So the trap is entered on wall 312, and the first thing the game
     * > says about money is on wall **313**, when the prison is already locked.
     *
     * **#703 ruling A moved that number and did not remove it, and the
     * distinction is the finding.** A standing overdraft of 2,500
     * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
     * §2) makes spending power 27,500 rather than 25,000, so:
     *
     *   floor(27,500 / 80) = 343 wall segments, leaving 60 of the facility.
     *
     * `Treasury.canAfford` is `balance - amount >= floor`, so what ends a prison
     * is `balance - 65 < floor` and a floor **translates** that condition rather
     * than dissolving it. The drag still locks the prison; it locks it 31
     * segments later, at −2,440 instead of at +40, and the first thing the game
     * says about money is now on wall **344**. Whether the standing overdraft
     * rescues a prison at all turns entirely on whether the player stops
     * pressing before the room is gone -- `scripts/report-loan-recovery-pricing.mjs`
     * §9 measures a prison that does stop and it escapes; this measures one that
     * does not, and it does not.
     *
     * **This is reported, not designed around**, and that has not changed. ADR
     * 0075's three accepted decisions — development grants at population
     * thresholds, a balance that may go negative with loans as the way out, and
     * sell-back at a loss — are the answer to it, and the second of the three is
     * now built and is not sufficient on its own. Doing anything else here (a
     * reserve floor, a refusal above some balance) would be deciding economic
     * policy inside implementation code.
     *
     * The gesture is 343 segments. The starter prison owns one 32x32 chunk,
     * whose bare perimeter is 128 segments, so it is two or three rooms'
     * worth of interior walls rather than an absurd figure.
     */
    const runtime = createNewSimulationRuntime(SEED);

    let funded = 0;
    let firstRefusedAt = -1;
    for (let index = 0; index < 360; index += 1) {
      const orderId = `order-${String(index).padStart(3, '0')}`;
      send(
        runtime,
        { type: 'PlaceBuildOrder', orderId, definitionId: WALL, x: 2 + (index % 28), y: 2 + Math.floor(index / 28) },
      );
      if (runtime.justInTimeMaterials.lastReport.unfunded.length === 0) funded += 1;
      else if (firstRefusedAt < 0) firstRefusedAt = index;
    }

    expect(funded, '(25,000 + 2,500) / 80').toBe(343);
    expect(firstRefusedAt, 'zero-based, so the 344th wall is the first the game refuses to buy for').toBe(343);
    expect(runtime.treasury.balanceMinorUnits, '25,000 - 343 x 80').toBe(-2_440);
    expect(
      runtime.treasury.canAfford(PLANK_PRICE),
      'and the 60 of overdraft still standing is below the 65 that would end this',
    ).toBe(false);

    // The lock itself, confirmed rather than inferred: the one thing that
    // would restart the income line is refused.
    send(runtime, { type: 'PurchaseMaterials', orderId: 'order-plank', itemId: PLANK, quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.treasury.balanceMinorUnits).toBe(-2_440);
  });
});

describe('the money loop this must not create (ADR 0076)', () => {
  it('never credits the treasury on any build, undo, redo or remove route', () => {
    /*
     * ADR 0076 names the hazard in terms: a refund added to a removal that
     * leaves `materialsAllocated` populated is refunded a second time by a
     * subsequent `Undo`, *"value created from nothing"*. Just-in-time
     * procurement is the same hazard one step earlier — buy, cancel, refund,
     * buy — and the answer is that **there is no refund**: the money became
     * bricks, and `cancelOrder` gives the bricks back.
     *
     * `Treasury.credit` has exactly one caller in `src/`
     * (`ProcurementSystem.cancel`, pinned by
     * `tests/foundation/documentation-claims-contract.test.ts`), and no
     * command below reaches it. A spy is the whole assertion: if some future
     * change wires a refund here, this fails and sends its author to
     * `economy-money-conservation.test.ts` to prove the sum still holds.
     */
    const runtime = createNewSimulationRuntime(SEED);
    const creditSpy = vi.spyOn(runtime.treasury, 'credit');

    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4, transactionId: 'gesture-1' });
    const afterPlacing = runtime.treasury.balanceMinorUnits;
    expect(afterPlacing).toBe(25_000 - WALL_COST);

    // Round trip while the delivery is still in flight, which is the only
    // window in which a naive "cancel the purchase too" would do anything.
    send(runtime, { type: 'Undo' });
    expect(runtime.construction.getOrder('order-a')?.state).toBe('cancelled');
    send(runtime, { type: 'Redo' });
    send(runtime, { type: 'Undo' });

    expect(creditSpy, 'undo and redo must not refund a purchase').not.toHaveBeenCalled();
    expect(runtime.treasury.balanceMinorUnits).toBe(afterPlacing);

    // And past the delivery, where the bricks land whatever the order did.
    step(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 20);
    expect(stockOf(runtime, BRICK), 'the money became bricks and the bricks are the prison\'s').toBe(BRICKS_PER_WALL);
    expect(creditSpy).not.toHaveBeenCalled();
    expect(runtime.treasury.balanceMinorUnits).toBe(afterPlacing);
  });

  it('does not buy a second time for an order that is undone and redone', () => {
    /*
     * The other direction of the same loop: a redo returns the order to
     * `'approved'`, so it is demand again. If the delivery it already paid for
     * were not netted off, every undo/redo pair would cost another 80 —
     * a money pump driven by one key (`KeyZ`).
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4, transactionId: 'gesture-1' });
    const afterPlacing = runtime.treasury.balanceMinorUnits;

    for (let round = 0; round < 5; round += 1) {
      send(runtime, { type: 'Undo' });
      send(runtime, { type: 'Redo' });
      step(runtime, 12);
    }

    expect(runtime.treasury.balanceMinorUnits, 'five undo/redo rounds cost nothing').toBe(afterPlacing);
    step(runtime, 4_000);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('completed');
    expect(runtime.treasury.balanceMinorUnits).toBe(afterPlacing);
  });
});

describe('a save taken mid-purchase', () => {
  it('does not re-buy what the restored session has already paid for', () => {
    /*
     * The restore case `justInTimePurchaseOrderId` is written for. A session
     * saved with a delivery in flight resumes at the tick it was saved on, and
     * the pending deliveries come back with it — so the deficit nets them off
     * and nothing is bought twice. The order finishes on the bricks the
     * *original* session paid for.
     *
     * This is also the answer to ADR 0038's question, stated as a
     * measurement: **no new field reaches `save-schema.ts` and
     * `SAVE_SCHEMA_VERSION` does not move**, because what an order is owed is
     * a function of the order book, the container and the pending deliveries,
     * and all three were already in the payload.
     */
    const runtime = createNewSimulationRuntime(SEED);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 4, y: 4 });
    step(runtime, 20);
    expect(runtime.procurement.pendingDeliveries, 'the save must be taken mid-flight for this to mean anything').toHaveLength(1);
    const spentBefore = 25_000 - runtime.treasury.balanceMinorUnits;

    const bundle = captureSessionSnapshot(runtime);
    const restored = restoreSimulationRuntime(bundle, SEED).runtime;

    expect(restored.treasury.balanceMinorUnits).toBe(runtime.treasury.balanceMinorUnits);
    expect(restored.procurement.pendingDeliveries).toHaveLength(1);

    step(restored, 4_000);
    expect(restored.construction.getOrder('order-a')?.state).toBe('completed');
    expect(25_000 - restored.treasury.balanceMinorUnits, 'the restored session paid nothing further').toBe(spentBefore);
    expect(spentBefore).toBe(WALL_COST);
  });
});
