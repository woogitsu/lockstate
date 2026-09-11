import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS } from '../../src/content/procurement-catalog';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';

/**
 * **The `SellMaterials` command reaches `ProcurementSystem.sellStock` through
 * the real kernel** ([ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 3, invoked by
 * [ADR 0096](../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
 * decision 3(b)).
 *
 * ## What was wrong, and what was not
 *
 * Not the arithmetic. `sellStock` and `previewSellStock` have credited the
 * treasury and withdrawn the container exactly since #1127, and
 * `tests/unit/economy-procurement-sellback.test.ts` pins that at the
 * `ProcurementSystem` layer. What was missing is the same gap #285 closed for
 * `ProcurementSystem.cancel`: no command, no schema, no session-command
 * route and no producer, so the only caller in the repository was a test.
 * This file is `economy-purchase-cancellation.test.ts`'s own method, applied
 * to the command that closed that gap for selling.
 *
 * ## Why every figure here is a literal
 *
 * `docs/TESTING.md`'s rule, and `economy-purchase-cancellation.test.ts`'s own
 * practice: a figure computed from the code under test would agree with a
 * credit of the wrong amount. `item.brick` is **40**
 * (`src/content/procurement-catalog.ts`), `SELL_BACK_RATIO_NUMERATOR /
 * SELL_BACK_RATIO_DENOMINATOR` is **1/2**, and `Math.floor(40 * 1/2) = 20`
 * per brick -- pinned below rather than re-derived.
 *
 * ## Why it goes through the kernel
 *
 * Every command is packed with the real `packCommand`, submitted to the real
 * kernel and dispatched by `Kernel.step()` through
 * `createSessionCommandHandler`. Calling `procurement.sellStock` directly
 * cannot see the schema, the decoder, the router or the refusal route, which
 * are exactly the parts #1127 left unbuilt.
 */

const SEED = 29;

/** One command, packed and dispatched, exactly as the worker would. */
function send(runtime: SimulationRuntime, id: string, command: SimulationCommand): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

const brickStock = (runtime: SimulationRuntime): number =>
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick');

/** Buys `quantity` bricks and steps until the delivery has landed in the container. */
function buyAndReceiveBricks(runtime: SimulationRuntime, orderId: string, quantity: number): void {
  send(runtime, `cmd-${orderId}`, { type: 'PurchaseMaterials', orderId, itemId: 'item.brick', quantity });
  for (let step = 0; step < PROCUREMENT_DELIVERY_DELAY_TICKS + 1; step += 1) runtime.kernel.step();
}

describe('selling stock back through SellMaterials', () => {
  it('pins the two figures every credit below is written from', () => {
    expect(TREASURY_STARTING_BALANCE_MINOR_UNITS).toBe(25_000);
    expect(packCommand({ type: 'SellMaterials', itemId: 'item.brick', quantity: 5 }).data).toEqual({
      type: 'SellMaterials',
      itemId: 'item.brick',
      quantity: 5,
    });
  });

  it('sells bricks back at exactly half the catalogue price, and withdraws them from the container', () => {
    const runtime = createNewSimulationRuntime(SEED);
    buyAndReceiveBricks(runtime, 'buy-1', 10);
    const balanceAfterBuying = runtime.treasury.balanceMinorUnits;
    expect(balanceAfterBuying, '25,000 - 10 x 40').toBe(24_600);
    expect(brickStock(runtime)).toBe(10);

    send(runtime, 'cmd-sell', { type: 'SellMaterials', itemId: 'item.brick', quantity: 6 });

    // Math.floor(40 * 1/2) = 20 per brick, 6 bricks = 120.
    expect(runtime.treasury.balanceMinorUnits, 'the credit must be exact').toBe(balanceAfterBuying + 120);
    expect(brickStock(runtime), 'the sold bricks leave the container').toBe(4);
    expect(runtime.refusals.last, 'a sale that worked must refuse nothing').toBeUndefined();
  });

  it('refuses to sell more than the container holds, and credits nothing', () => {
    const runtime = createNewSimulationRuntime(SEED);
    buyAndReceiveBricks(runtime, 'buy-1', 3);
    const balanceBeforeSale = runtime.treasury.balanceMinorUnits;

    send(runtime, 'cmd-sell', { type: 'SellMaterials', itemId: 'item.brick', quantity: 4 });

    expect(runtime.treasury.balanceMinorUnits, 'nothing was credited').toBe(balanceBeforeSale);
    expect(brickStock(runtime), 'and nothing left the container').toBe(3);
    expect(runtime.refusals.last?.reason).toBe('sell.insufficient-stock');
    expect(runtime.refusals.count).toBe(1);
  });

  it('refuses an item the catalogue does not sell, and a malformed quantity, each its own refusal', () => {
    const runtime = createNewSimulationRuntime(SEED);

    send(runtime, 'cmd-unknown', { type: 'SellMaterials', itemId: 'item.does-not-exist', quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('sell.unknown-material');
    expect(runtime.refusals.count).toBe(1);

    // `quantity` is `z.number().int().positive()` at the schema, so a
    // non-positive value never reaches the kernel as `SellMaterials` at all --
    // `unpackCommand` answers `null` and `packCommand` throws on `.parse`
    // first. What this measures is the system's own guard, reached the way a
    // queued command from a restored save (or a future producer that composes
    // the union member directly, bypassing the schema) could still reach it:
    // `session-commands.ts` dispatches on `simCommand.type` after
    // `unpackCommand`, so a payload the schema itself refuses never gets this
    // far, and `ProcurementSystem.sellStock`'s own `invalid-quantity` guard
    // is what a malformed value from any other route would meet.
    expect(() => packCommand({ type: 'SellMaterials', itemId: 'item.brick', quantity: -1 })).toThrow();
  });

  it('does not supersede a standing refusal about a different quantity, and does supersede its own (#492)', () => {
    // Issue #492's rule, applied to `sell.*` exactly as `purchaseSupersessionKey`
    // is applied to `purchase.*`: the key is the item and the quantity, not
    // an id `SellMaterials` does not carry.
    const runtime = createNewSimulationRuntime(SEED);
    buyAndReceiveBricks(runtime, 'buy-1', 2);
    const balanceAfterBuyingTwo = runtime.treasury.balanceMinorUnits;

    send(runtime, 'cmd-sell-five', { type: 'SellMaterials', itemId: 'item.brick', quantity: 5 });
    expect(runtime.refusals.last?.reason, 'only 2 in stock, 5 asked for').toBe('sell.insufficient-stock');
    expect(runtime.refusals.count).toBe(1);

    // A *different* quantity of the same item succeeding must not clear the
    // standing refusal about the first: `RefusalLog.supersede` misses
    // silently on a key mismatch, and that silent miss is exactly what this
    // asserts rather than assumes.
    send(runtime, 'cmd-sell-two', { type: 'SellMaterials', itemId: 'item.brick', quantity: 2 });
    expect(runtime.treasury.balanceMinorUnits, 'this sale did credit -- 2 x 20').toBe(balanceAfterBuyingTwo + 40);
    expect(brickStock(runtime)).toBe(0);
    expect(
      runtime.refusals.last?.reason,
      'a different quantity`s success does not withdraw the standing refusal about 5',
    ).toBe('sell.insufficient-stock');
    expect(runtime.refusals.count, 'no new refusal was recorded by the successful sale').toBe(1);

    // Restock, then press the *exact same* request the standing refusal was
    // about. This time it succeeds, and the matching key is what withdraws it.
    buyAndReceiveBricks(runtime, 'buy-2', 10);
    send(runtime, 'cmd-sell-five-again', { type: 'SellMaterials', itemId: 'item.brick', quantity: 5 });
    expect(runtime.refusals.last, 'the identical request succeeding withdraws its own standing refusal').toBeUndefined();
    expect(runtime.refusals.count, 'withdrawing a refusal is not a new one').toBe(1);
  });
});
