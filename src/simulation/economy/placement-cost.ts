import { procurableMaterial } from '../../content/procurement-catalog';
import type { MaterialRequirement } from '../construction/definition';

/**
 * What one placement of a buildable costs at catalogue price, over **every**
 * material it requires.
 *
 * ## Why this is here and not in the interface
 *
 * The Build panel states a price beside each catalogue row, and until this
 * function existed it computed that price itself:
 * `material.unitPriceMinorUnits * material.quantityPerPlacement`, over the
 * **first purchasable** requirement only. Constitution article 4 and
 * `AGENTS.md` boundary 1 say the same thing from two directions -- the
 * interface consumes projections and does not recompute finances -- and issue
 * #1160's first exit criterion says it a third time: the catalogue must carry
 * *"the cost the simulation reports rather than one the panel computed"*.
 *
 * So the arithmetic lives beside the system that charges for it. `unitPrice x
 * quantity` is the same expression `ProcurementSystem.purchase` runs at
 * `procurement.ts:358` to decide `paidMinorUnits`, and a placement's charge is
 * that expression once per requirement -- which is what
 * `JustInTimeMaterialsService.procureForPendingOrders` buys at the press
 * (#640, `a87b0d3`: a build order buys what it needs at the press, from the
 * treasury, at catalogue price).
 *
 * ## `undefined` is a real answer, and it is the honest one
 *
 * A requirement naming a material `src/content/procurement-catalog.ts` does not
 * sell has no price, so a placement that needs one has no total. The sum of the
 * *priced* requirements is not that total -- it is a smaller number that reads
 * like one, which is `AGENTS.md`'s fourth reservation exactly: a sentence the
 * code does not keep. The caller shows no price at all in that case, which is
 * what the panel already did for a buildable with nothing purchasable in it.
 *
 * **This differs from what the panel used to do, and the difference is only
 * reachable in a registry that does not exist yet.** All twenty-one rows of
 * `BUILDABLE_REGISTRY` name exactly one requirement and every one of them is
 * priced (`tests/foundation/object-buildable-cost-contract.test.ts` pins the
 * count for the object rows), so "first purchasable" and "all of them" agree
 * today to the minor unit. They stop agreeing the moment a row names two
 * materials or an unpriced one, and the panel's version would then understate
 * a placement rather than decline to price it.
 *
 * ## What this figure is, and what it is not
 *
 * It is the **catalogue** cost of one placement: what the materials for it are
 * worth. It is not a prediction of what the treasury will actually move at the
 * press, because the just-in-time pass nets the order's demand off stock
 * already held and deliveries already paid for (`procureForPendingOrders`), so
 * a player who pre-bought is charged less or nothing. No string in this
 * repository claims otherwise: `hud.build.catalogue-row-price` renders
 * `{buildable} · {total}` and `hud.build.catalogue-row-price-segment` renders
 * `{buildable} · {total} per segment`, both of which state a price rather than
 * promise a debit.
 *
 * Minor units and integers throughout, for the reason `ProcurableMaterial`
 * states at its own declaration: this arithmetic reaches simulation state a
 * save carries and a determinism fingerprint hashes, and `docs/DETERMINISM.md`
 * makes no exception for money.
 */
export function placementCostMinorUnits(
  requirements: readonly MaterialRequirement[],
): number | undefined {
  let total = 0;
  for (const requirement of requirements) {
    const material = procurableMaterial(requirement.itemId);
    if (material === undefined) return undefined;
    total += material.unitPriceMinorUnits * requirement.quantity;
  }
  return total;
}
