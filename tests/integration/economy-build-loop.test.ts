import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY, createBuildOrder } from '../../src/simulation/construction';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * Issue #89, through the loop issue #96 decided: **money buys materials,
 * materials arrive, and a build order finally completes.**
 *
 * Before this, `createNewSimulationRuntime` registered one empty `Container`
 * under `CONSTRUCTION_MATERIALS_CONTAINER_ID` and **nothing in the shipped
 * codebase ever deposited into it**. `ConstructionSystem.update` called
 * `materialsProvider.tryAllocate` on every scheduled tick, got `false`, and
 * the order sat in `materials-pending` forever. Not a bug in construction --
 * a missing half of the game.
 *
 * Everything below goes through the real kernel, the real command decoder and
 * the real systems. Nothing deposits into a container by hand, which is the
 * whole point: a test that seeded the materials would prove the *construction*
 * half and say nothing about whether a player can get them.
 *
 * ## Where the other half of "a player can get them" is proved
 *
 * This file drives the command; it does not drive the button. Until #89 there
 * was no button: `PurchaseMaterials` had a schema, a decoder, a router, a
 * system and a save representation, and **nothing in `src/` could construct
 * one**, so the loop below was reachable only from a test and the running app
 * still could not finish a wall. That is now closed, and it is closed
 * somewhere this layer cannot reach: `src/main.ts` imports Phaser,
 * constructs a `Worker` and runs at import, so no Vitest file executes it.
 *
 * The proof is therefore split, deliberately and along the line
 * `docs/TESTING.md` draws:
 *
 * - **that a producer exists at all** --
 *   `tests/foundation/unconsumed-command-contract.test.ts`, which scans `src/`
 *   and fails in both directions;
 * - **that pressing Buy sends one** -- `tests/browser/app-shell.spec.ts`, over
 *   a tee on the real `postMessage`, which is the only place a minted
 *   `orderId` is observable;
 * - **that the panel dispatches the intent behind it** --
 *   `tests/browser/ui-shell.spec.ts`;
 * - **that the command closes the loop** -- here.
 *
 * The quantities below are read out of the same two content modules the
 * composition root reads, rather than written as literals, so a buildable
 * whose material nobody sells fails here rather than shipping as a buy
 * control that can only be refused.
 *
 * ## What this does not cover, and why the gap is where it is
 *
 * #96's loop has a physical middle -- the delivery arrives at
 * `room.delivery-bay` and carry jobs move it to the site. That is **not**
 * here, because no session instantiates a delivery bay: it is declared
 * content with no consumer (#141). A delivery therefore lands directly in the
 * container construction draws from, which is scaffolding and is recorded as
 * such on #96 and in `ProcurementSystem`'s own header.
 *
 * So this proves the loop closes economically, not that materials travel.
 */

const WALL = 'wall-brick';

/**
 * What one wall is made of, and what a unit of it costs -- read from content
 * rather than written down.
 *
 * These are the exact two lookups `src/main.ts` performs to build the Build
 * panel's buy control (`purchasableMaterialFor`), so the purchase this file
 * drives is the purchase that control composes. Written as literals they
 * agreed with content by coincidence, and would have kept agreeing with a
 * `materialsRequired` nobody had priced.
 */
const WALL_REQUIREMENT = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!;
const BRICKS_PER_WALL = WALL_REQUIREMENT.quantity;
const BRICK_PRICE = procurableMaterial(WALL_REQUIREMENT.itemId)?.unitPriceMinorUnits;

function tile(x: number, y: number) {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

/** Steps until `predicate` holds, or gives up with what it saw. */
function stepUntil(runtime: SimulationRuntime, predicate: () => boolean, limit = 2_000): number {
  for (let step = 0; step < limit; step += 1) {
    if (predicate()) return step;
    runtime.kernel.step();
  }
  return -1;
}

describe('money buys materials and a wall gets built (#89, #96)', () => {
  it('completes a build order the player bought the materials for first', () => {
    const runtime = createNewSimulationRuntime(7);

    // The prison starts with money and no materials. Both halves asserted:
    // a test that only checked the balance would pass on a runtime that had
    // been seeded with bricks after all.
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    const materials = runtime.containers.getById(CONSTRUCTION_MATERIALS_CONTAINER_ID);
    expect(materials, 'the construction container must exist').toBeDefined();
    expect(materials!.quantityOf('item.brick'), 'the prison must start with no bricks').toBe(0);

    // Buy the bricks through the real command path, not by calling the
    // system: the decoder and the session command router are part of what is
    // under test.
    // `(id, sequence, executeAtTick, payload)`. Sequence 0 because this is the
    // session's first command; `executeAtTick` is now, not zero, because the
    // kernel refuses a command dated before the tick it has reached.
    //
    // The order id is the shape `src/main.ts` mints, `order-` and a UUID, and
    // not a hand-written `buy-1`: `purchaseMaterialsSchema` bounds it with
    // `identifierSchema`, so an id shape the composition root can produce and
    // the decoder rejects would fail at the boundary rather than here.
    expect(BRICK_PRICE, `nothing sells ${WALL_REQUIREMENT.itemId}, so no buy control can be offered for a wall`)
      .toBeGreaterThan(0);
    runtime.kernel.submitCommand(
      'cmd-buy',
      0,
      runtime.kernel.tick,
      packCommand({
        type: 'PurchaseMaterials',
        orderId: `order-${crypto.randomUUID()}`,
        itemId: WALL_REQUIREMENT.itemId,
        quantity: BRICKS_PER_WALL,
      }),
    );
    runtime.kernel.step();

    /*
     * **The order is placed second, and it used to be placed first.**
     *
     * The old comment here read *"Order the wall first, so it is genuinely
     * waiting on materials rather than being placed into a stocked prison"*,
     * and that ordering stopped being available on the change that implemented
     * ADR 0017 decision 7 (#627): an order placed against an empty prison now
     * *buys* its own materials, so ordering first and then pressing Buy is two
     * purchases for one wall. That is not a defect -- the player asked for
     * both -- but it is no longer this case's subject.
     *
     * This case is now the **holding** half of decision 7, *"holding is
     * permitted"*: a player who pre-buys sees exactly the behaviour they saw
     * before #627, one purchase and one wall. The just-in-time half is
     * `pays for a wall the player never pressed Buy for` below, and that one is
     * #627's own subject.
     */
    const order = createBuildOrder('wall-1', WALL, tile(4, 6), 'north');
    runtime.construction.submitOrder(order);
    expect(order.state, 'the order must be approved -- the land is owned (#215)').toBe('approved');

    // To the next scheduled construction tick rather than one step: the order
    // is now submitted at tick 1 rather than tick 0, and `ConstructionSystem`
    // runs every ten ticks, so a single step lands between two of them.
    expect(stepUntil(runtime, () => runtime.construction.getOrder('wall-1')?.state !== 'approved'))
      .toBeGreaterThanOrEqual(0);
    expect(runtime.construction.getOrder('wall-1')?.state).toBe('materials-pending');

    // Paid now, delivered later. Both are asserted because the money leaving
    // immediately is what makes a save taken mid-flight matter -- and the
    // amount is asserted exactly, because "less than the starting balance" is
    // also true of a purchase that charged the wrong price. Exactly one
    // purchase, so nothing bought the same bricks twice.
    expect(runtime.treasury.balanceMinorUnits).toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - BRICK_PRICE! * BRICKS_PER_WALL,
    );
    expect(runtime.procurement.pendingDeliveries).toHaveLength(1);
    expect(materials!.quantityOf('item.brick'), 'nothing arrives on the tick it is bought').toBe(0);
    // The tick the lorry is due, read off the queue rather than recomputed:
    // "it arrived early" has to be measured against the purchase's own tick,
    // and the order is no longer placed on the same tick as the purchase.
    const arrivesAtTick = runtime.procurement.pendingDeliveries[0]!.arrivesAtTick;

    expect(stepUntil(runtime, () => materials!.quantityOf(WALL_REQUIREMENT.itemId) > 0), 'the delivery never arrived')
      .toBeGreaterThan(0);
    expect(runtime.kernel.tick, 'it arrived early').toBeGreaterThanOrEqual(arrivesAtTick);
    expect(runtime.procurement.pendingDeliveries, 'an arrived delivery must leave the queue').toHaveLength(0);

    const stepsToCompletion = stepUntil(runtime, () => runtime.construction.getOrder('wall-1')?.state === 'completed');
    expect(stepsToCompletion, 'the order never completed even with materials delivered').toBeGreaterThan(0);

    // And the world actually changed -- the order reaching `completed` is not
    // the same claim as a wall existing.
    expect(runtime.world.getTopEdge(tile(4, 6))).toBeGreaterThan(0);
  });

  it('refuses a purchase the prison cannot afford, and changes nothing', () => {
    const runtime = createNewSimulationRuntime(7);
    const before = runtime.treasury.balanceMinorUnits;

    const outcome = runtime.procurement.purchase('buy-huge', 'item.brick', 100_000, 0);
    expect(outcome).toEqual({ ok: false, reason: 'insufficient-funds' });
    expect(runtime.treasury.balanceMinorUnits, 'a refused purchase must not spend').toBe(before);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);
  });

  it('carries a delivery in flight through a real save, so paid-for goods are not lost', () => {
    /*
     * The reason `EncodedEconomy` carries the pending queue at all: `purchase`
     * spends immediately, so a save taken between the payment and the arrival
     * holds the only record that the money bought anything. Dropping it would
     * take the player's money and deliver nothing.
     *
     * Through `captureSessionSnapshot` and `restoreSimulationRuntime`, not by
     * calling `procurement.restore(procurement.snapshot())`. The first draft
     * did the latter and **the mutation pass caught it**: deleting the
     * `economy` section from `captureSessionSystems` entirely, and separately
     * making `restoreSessionSystems` ignore it, both left that version green.
     * A round trip that does not go through the save boundary proves the
     * codec and says nothing about whether the save carries it.
     */
    const runtime = createNewSimulationRuntime(7);
    runtime.procurement.purchase('buy-1', 'item.brick', 10, runtime.kernel.tick);
    expect(runtime.treasury.balanceMinorUnits).toBeLessThan(TREASURY_STARTING_BALANCE_MINOR_UNITS);

    const bundle = captureSessionSnapshot(runtime);
    // JSON round trip: a stored save is a plain value by the time it is read
    // back, so an object identity or a non-JSON type would not survive.
    const restored = restoreSimulationRuntime(
      JSON.parse(JSON.stringify(bundle)) as SessionSnapshotBundle,
      7,
    ).runtime;

    expect(restored.treasury.balanceMinorUnits).toBe(runtime.treasury.balanceMinorUnits);
    expect(restored.procurement.pendingDeliveries).toEqual(runtime.procurement.pendingDeliveries);

    const materials = restored.containers.getById(CONSTRUCTION_MATERIALS_CONTAINER_ID)!;
    expect(stepUntil(restored, () => materials.quantityOf('item.brick') === 10)).toBeGreaterThan(0);
  });

  it('refunds exactly what a cancelled delivery cost, and stops it arriving', () => {
    /*
     * `cancel` **now has a caller in `src/`** -- `CancelMaterialPurchase`
     * reaches it through `createSessionCommandHandler`, and the Build panel's
     * buy disclosure is what aims it (#285). This case predates that and stays
     * as the unit-level guard on the arithmetic: the mutation pass found the
     * refund completely unguarded, and replacing it with `credit(0)` passed
     * everything. `tests/integration/economy-purchase-cancellation.test.ts`
     * drives the same refund through the real command pipeline instead.
     *
     * The refund is the *recorded* `paidMinorUnits`, never a recomputation
     * from the catalog. Recomputing would refund today's price for a purchase
     * made at yesterday's, which is a bug the moment prices move -- and prices
     * not moving yet is a property of this slice, not of the design.
     */
    const runtime = createNewSimulationRuntime(7);
    const before = runtime.treasury.balanceMinorUnits;

    const outcome = runtime.procurement.purchase('buy-1', 'item.brick', 5, 0);
    expect(outcome.ok).toBe(true);
    const spent = before - runtime.treasury.balanceMinorUnits;
    expect(spent, 'the fixture must actually have spent something').toBeGreaterThan(0);

    // 5 bricks at 40 is 200, and the outcome states what came back rather than
    // leaving the caller to infer it from a balance -- which is what
    // `session-commands.ts` needs in order to tell a refused cancellation from a
    // silent one.
    expect(runtime.procurement.cancel('buy-1')).toEqual({ ok: true, refundedMinorUnits: 200 });
    expect(spent, 'the fixture must have spent exactly the catalog price of five bricks').toBe(200);
    expect(runtime.treasury.balanceMinorUnits, 'a cancellation must refund exactly what was paid').toBe(before);
    expect(runtime.procurement.pendingDeliveries).toHaveLength(0);

    // And nothing arrives afterwards -- a refund that left the delivery
    // queued would hand over the goods for free.
    const materials = runtime.containers.getById(CONSTRUCTION_MATERIALS_CONTAINER_ID)!;
    for (let step = 0; step < PROCUREMENT_DELIVERY_DELAY_TICKS * 2; step += 1) runtime.kernel.step();
    expect(materials.quantityOf('item.brick')).toBe(0);

    expect(runtime.procurement.cancel('buy-1'), 'cancelling twice must not refund twice').toEqual({
      ok: false,
      reason: 'not-pending',
    });
    expect(runtime.treasury.balanceMinorUnits).toBe(before);
  });

  it('delivers same-tick arrivals in id order, whatever order they were bought in', () => {
    /*
     * `docs/DETERMINISM.md`: anything feeding simulation state iterates in a
     * canonical order, never insertion order. Two purchases made on the same
     * tick arrive on the same tick, so the tick alone does not order them and
     * `orderId` breaks the tie.
     *
     * Asserted because the mutation pass showed nothing else does: deleting
     * `sortPending`'s body left every other test here and the whole
     * determinism suite green. Same-tick deliveries of the *same* item are
     * indistinguishable once deposited, so this buys two different items and
     * reads the queue.
     */
    const forwards = createNewSimulationRuntime(7);
    forwards.procurement.purchase('b-second', 'item.brick', 1, 0);
    forwards.procurement.purchase('a-first', 'item.wood-plank', 1, 0);

    const backwards = createNewSimulationRuntime(7);
    backwards.procurement.purchase('a-first', 'item.wood-plank', 1, 0);
    backwards.procurement.purchase('b-second', 'item.brick', 1, 0);

    const ids = (runtime: SimulationRuntime): readonly string[] =>
      runtime.procurement.pendingDeliveries.map((delivery) => delivery.orderId);

    expect(ids(forwards), 'the queue must be in id order, not purchase order').toEqual(['a-first', 'b-second']);
    expect(ids(backwards)).toEqual(ids(forwards));
  });
});
