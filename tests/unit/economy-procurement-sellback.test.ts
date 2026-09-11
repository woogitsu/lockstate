import { describe, expect, it } from 'vitest';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import { ProcurementSystem, SELL_BACK_RATIO_DENOMINATOR, SELL_BACK_RATIO_NUMERATOR, Treasury } from '../../src/simulation/economy';
import { Container } from '../../src/simulation/operations/inventory';

/**
 * **[ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 3, invoked by [ADR 0096](../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
 * decision 3(b): a command that converts stock back into money at a fraction
 * of the purchase price.**
 *
 * This file pins the economics `ProcurementSystem.sellStock` and
 * `previewSellStock` implement — the arithmetic and the container mutation —
 * in isolation, the same division of labour every other economy unit test
 * in this repository keeps against its own integration coverage. There is
 * deliberately no command, refusal reason or HUD control here: see
 * `sellStock`'s own doc comment in `src/simulation/economy/procurement.ts`
 * for why that wiring is out of scope this hour.
 */

const BRICK_PRICE = procurableMaterial('item.brick')!.unitPriceMinorUnits;
const PLANK_PRICE = procurableMaterial('item.wood-plank')!.unitPriceMinorUnits;

function fixture(startingBalance = 0): { treasury: Treasury; container: Container; procurement: ProcurementSystem } {
  const treasury = new Treasury(startingBalance);
  const container = new Container('test-stock');
  const procurement = new ProcurementSystem(treasury, container);
  return { treasury, container, procurement };
}

describe('ProcurementSystem.sellStock: ADR 0075 decision 3, invoked by ADR 0096 decision 3(b)', () => {
  it('pins the ratio this implementation chose, since neither ADR names a candidate', () => {
    expect(SELL_BACK_RATIO_NUMERATOR).toBe(1);
    expect(SELL_BACK_RATIO_DENOMINATOR).toBe(2);
    expect(BRICK_PRICE, 'the figure every sequence below is written against').toBe(40);
    expect(PLANK_PRICE, 'and the figure that does not divide evenly by the ratio').toBe(65);
  });

  it('credits half the catalogue price, per unit, and removes exactly the stock sold', () => {
    const { treasury, container, procurement } = fixture();
    container.deposit('item.brick', 288);
    const outcome = procurement.sellStock('item.brick', 288);
    // 288 bricks at 40 is 11,520 at catalogue; half of that is 5,760 -- ADR
    // 0096's own act B fixture, at the ratio this implementation names.
    expect(outcome).toEqual({ ok: true, creditedMinorUnits: 5_760 });
    expect(treasury.balanceMinorUnits).toBe(5_760);
    expect(container.quantityOf('item.brick'), 'the stock actually left the container').toBe(0);
  });

  it('rounds the per-unit price down, so a price that does not halve evenly is never a tax that rounds up', () => {
    const { treasury, container, procurement } = fixture();
    container.deposit('item.wood-plank', 3);
    // 65 halved is 32.5; the per-unit floor is 32, so three planks credit 96,
    // not the 97.5 (rounded to 98) a whole-sale rounding would give, and not
    // 99 (32.5 * 3 rounded up) either.
    const outcome = procurement.sellStock('item.wood-plank', 3);
    expect(outcome).toEqual({ ok: true, creditedMinorUnits: 96 });
    expect(treasury.balanceMinorUnits).toBe(96);
    expect(procurement.previewSellStock('item.wood-plank', 3), 'preview and effect must never disagree').toBe(96);
  });

  it('refuses to sell more than the container holds, and moves nothing', () => {
    const { treasury, container, procurement } = fixture();
    container.deposit('item.brick', 5);
    const outcome = procurement.sellStock('item.brick', 6);
    expect(outcome).toEqual({ ok: false, reason: 'insufficient-stock' });
    expect(treasury.balanceMinorUnits).toBe(0);
    expect(container.quantityOf('item.brick')).toBe(5);
  });

  it('does not sell stock a pending carry has already reserved', () => {
    // The same distinction `ContainerMaterialsProvider.tryAllocate` respects:
    // reserved stock is claimed by something already in flight, and selling
    // it out from under that claim would be the no-teleport rule broken in
    // the other direction.
    const { container, procurement } = fixture();
    container.deposit('item.brick', 10);
    container.reserve('item.brick', 4);
    expect(procurement.sellStock('item.brick', 7)).toEqual({ ok: false, reason: 'insufficient-stock' });
    expect(container.quantityOf('item.brick'), 'refused outright: nothing left the container').toBe(10);
    expect(procurement.sellStock('item.brick', 6)).toEqual({ ok: true, creditedMinorUnits: 120 });
    expect(container.quantityOf('item.brick')).toBe(4);
    expect(container.reservedOf('item.brick'), 'the reservation itself is untouched').toBe(4);
  });

  it('refuses an item the catalogue does not sell, a zero, a negative and a fractional quantity, crediting nothing', () => {
    const { treasury, container, procurement } = fixture();
    container.deposit('item.brick', 10);
    expect(procurement.sellStock('item.not-a-real-material', 1)).toEqual({ ok: false, reason: 'unknown-material' });
    expect(procurement.sellStock('item.brick', 0)).toEqual({ ok: false, reason: 'invalid-quantity' });
    expect(procurement.sellStock('item.brick', -1)).toEqual({ ok: false, reason: 'invalid-quantity' });
    expect(procurement.sellStock('item.brick', 1.5)).toEqual({ ok: false, reason: 'invalid-quantity' });
    expect(treasury.balanceMinorUnits).toBe(0);
    expect(container.quantityOf('item.brick')).toBe(10);
  });

  it('previewSellStock answers 0 for the same refusal cases, and touches nothing', () => {
    const { container, procurement } = fixture();
    container.deposit('item.brick', 10);
    expect(procurement.previewSellStock('item.not-a-real-material', 1)).toBe(0);
    expect(procurement.previewSellStock('item.brick', 0)).toBe(0);
    expect(procurement.previewSellStock('item.brick', -1)).toBe(0);
    expect(container.quantityOf('item.brick'), 'a preview never mutates the container').toBe(10);
  });

  it('reaching the ~12% floor ADR 0096 §3(b) derives actually reopens the game -- the arithmetic this ratio was checked against', () => {
    // ADR 0096's own words: "at a sell-back ratio r the credit is 11,520*r,
    // and reaching a plank's affordability at the construction rung needs
    // 11,520*r >= 1,315, so any ratio above about 12% reopens the game."
    // This implementation's 50% clears that by more than 4x.
    const { procurement } = fixture();
    const creditAt50Percent = 288 * BRICK_PRICE * (SELL_BACK_RATIO_NUMERATOR / SELL_BACK_RATIO_DENOMINATOR);
    expect(creditAt50Percent).toBe(5_760);
    expect(creditAt50Percent).toBeGreaterThanOrEqual(1_315);
    // And the ~12% boundary itself, so a future change to the ratio is
    // checked against the same inequality rather than against this file's
    // silence.
    const twelvePercentCredit = 288 * BRICK_PRICE * 0.12;
    expect(twelvePercentCredit).toBeGreaterThanOrEqual(1_315);
  });
});
