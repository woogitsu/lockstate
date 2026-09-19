import { describe, expect, it } from 'vitest';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { placementCostMinorUnits } from '../../src/simulation/economy';

/**
 * **What one placement costs, decided where the charge is decided** (issue
 * #1160, constitution article 4).
 *
 * The Build panel used to compute its catalogue row's price itself, as
 * `material.unitPriceMinorUnits * material.quantityPerPlacement` over the
 * *first purchasable* requirement (`src/ui/hud/build-panel.ts`, before
 * 2026-09-14). Two things were wrong with that and only one of them is
 * visible today: the interface was recomputing a finance figure, which article
 * 4 and `AGENTS.md` boundary 1 both forbid; and it priced one requirement of
 * however many a buildable names.
 *
 * Every row in `BUILDABLE_REGISTRY` names exactly one priced requirement, so
 * the second fault is unreachable from the shipped catalogue and the two
 * spellings agree to the minor unit. The first two cases below are therefore
 * driven with requirement lists of this test's own making: they are the states
 * a registry edit reaches, and the point of moving the arithmetic is that they
 * are answered correctly when it does.
 */
describe('placementCostMinorUnits', () => {
  const brick = procurableMaterial('item.brick');
  const plank = procurableMaterial('item.wood-plank');
  if (brick === undefined || plank === undefined) {
    throw new Error('the two materials the buildable registry consumes must be procurable');
  }

  it('sums every requirement, not the first one it can price', () => {
    // The case the panel's own arithmetic got wrong: a buildable made of two
    // materials was quoted the price of one of them.
    const cost = placementCostMinorUnits([
      { itemId: 'item.brick', quantity: 2 },
      { itemId: 'item.wood-plank', quantity: 3 },
    ]);
    expect(cost).toBe(brick.unitPriceMinorUnits * 2 + plank.unitPriceMinorUnits * 3);
  });

  it('states no price at all when one requirement names a material nothing sells', () => {
    // A partial sum is a smaller number that reads like a total, which is
    // `AGENTS.md`'s fourth reservation exactly. The panel renders no price for
    // `undefined`, which is the honest rendering.
    expect(placementCostMinorUnits([
      { itemId: 'item.brick', quantity: 1 },
      { itemId: 'item.nothing-sells-this', quantity: 1 },
    ])).toBeUndefined();
  });

  it('prices a buildable that needs nothing at nothing', () => {
    expect(placementCostMinorUnits([])).toBe(0);
  });

  it('prices every shipped buildable, so no catalogue row is left without one', () => {
    // The first exit criterion of #1160 is that *every* buildable is reachable
    // through the catalogue with the cost the simulation reports. A row the
    // simulation cannot price renders no price, so this is what keeps the
    // criterion true of the registry as it actually ships.
    const unpriced = [...BUILDABLE_REGISTRY.values()]
      .filter((definition) => placementCostMinorUnits(definition.materialsRequired) === undefined)
      .map((definition) => definition.id);
    expect(unpriced).toEqual([]);
  });

  it('agrees with what ProcurementSystem.purchase charges for the same materials', () => {
    // `purchase` sets `paidMinorUnits = material.unitPriceMinorUnits * quantity`
    // (`src/simulation/economy/procurement.ts`). A placement is that expression
    // once per requirement, which is what the just-in-time pass buys at the
    // press. Asserted per shipped row rather than in prose.
    for (const definition of BUILDABLE_REGISTRY.values()) {
      const charged = definition.materialsRequired.reduce(
        (total, requirement) => total + procurableMaterial(requirement.itemId)!.unitPriceMinorUnits * requirement.quantity,
        0,
      );
      expect(placementCostMinorUnits(definition.materialsRequired), definition.id).toBe(charged);
    }
  });

  it('keeps every price an integer, which determinism requires of money', () => {
    for (const definition of BUILDABLE_REGISTRY.values()) {
      expect(Number.isSafeInteger(placementCostMinorUnits(definition.materialsRequired)), definition.id).toBe(true);
    }
  });
});
