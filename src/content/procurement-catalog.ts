/**
 * What a material costs to buy, and how long it takes to arrive.
 *
 * A data module rather than a condition chain, per `AGENTS.md` boundary 6:
 * adding a purchasable material is a row here, never an edit to the
 * procurement system. The system reads this table and knows nothing about
 * `item.brick`.
 *
 * ## Every number here is a placeholder
 *
 * Issue #96 decided the *hierarchy* -- money is primary, materials are
 * procured -- and that decision needs no approval. It left three questions
 * open, and ADR 0017 answers them **as recommendations pending approval**.
 * These figures decide none of them: they exist to make the loop run, and
 * they are chosen to be obviously provisional rather than obviously balanced.
 *
 * Specifically, and deliberately:
 *
 * - **One price per unit, and it never moves.** ADR 0017's recommendation on
 *   the buffer question is "just-in-time by default, with holding permitted
 *   but never required", and a price that does not vary is what makes that
 *   true rather than merely stated: there is nothing to gain by buying early.
 *   Price variation is the addition that would make a buffer a real choice,
 *   and it is not made here.
 * - **One delivery delay, shared.** Same reason. A per-material delay would
 *   start rewarding somebody for planning ahead, which is the same decision
 *   under another name.
 *
 * When the owner takes ADR 0017's answers, this table is where a real economy
 * starts, and none of it is load-bearing for anything else.
 */

export interface ProcurableMaterial {
  /** An `item.*` id from `src/content/item-catalog.ts`. */
  readonly itemId: string;
  /**
   * Cost of one unit, in the treasury's minor units.
   *
   * An integer, and that is not a formatting preference: this multiplies into
   * simulation state that a save carries and a determinism fingerprint hashes.
   * A fractional currency would put a float there, and
   * `docs/DETERMINISM.md` does not make an exception for money.
   */
  readonly unitPriceMinorUnits: number;
}

/**
 * How long a purchase takes to arrive, in ticks.
 *
 * Non-zero on purpose. An instant delivery would make the pending-delivery
 * queue unreachable, and with it every question about what a save does with
 * one in flight -- which is exactly the kind of state that is cheap to carry
 * from the start and expensive to add once saves exist in the wild.
 *
 * 100 ticks is 5 seconds at the kernel's 50 ms step. Long enough to be a real
 * wait a test can observe, short enough not to be a balance statement.
 */
export const PROCUREMENT_DELIVERY_DELAY_TICKS = 100;

/**
 * The materials a prison can buy.
 *
 * Exactly the two the buildable registry consumes today
 * (`src/simulation/construction/definition.ts`): `wall-brick` needs
 * `item.brick`, `door-wooden` needs `item.wood-plank`. Nothing else is
 * purchasable, because nothing else is buildable -- a catalog of materials no
 * buildable requires would be the declared-and-unconsumed content #141
 * inventories.
 */
export const PROCURABLE_MATERIALS: readonly ProcurableMaterial[] = Object.freeze([
  Object.freeze({ itemId: 'item.brick', unitPriceMinorUnits: 40 }),
  Object.freeze({ itemId: 'item.wood-plank', unitPriceMinorUnits: 65 }),
]);

/** The row for an item id, or `undefined` when it cannot be bought. */
export function procurableMaterial(itemId: string): ProcurableMaterial | undefined {
  return PROCURABLE_MATERIALS.find((material) => material.itemId === itemId);
}
