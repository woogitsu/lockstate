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
 * open, and ADR 0017 answers them: they are its decisions 6, 7 and 8, and the
 * owner has accepted them, so that ADR is Accepted in full. **What it still
 * decides is no price and no balance value** -- its own decision 5 reserves
 * those to issue #29, which is why every figure here is a placeholder even
 * with nothing left to approve. These figures decide none of #29's questions:
 * they exist to make the loop run, and they are chosen to be obviously
 * provisional rather than obviously balanced.
 *
 * Specifically, and deliberately:
 *
 * - **One price per unit, and it never moves.** ADR 0017's decision 7 on the
 *   buffer question is "just-in-time by default, with holding permitted
 *   but never required", and a price that does not vary is what makes that
 *   true rather than merely stated: there is nothing to gain by buying early.
 *   Price variation is the addition that would make a buffer a real choice,
 *   and it is not made here.
 * - **One delivery delay, shared.** Same reason. A per-material delay would
 *   start rewarding somebody for planning ahead, which is the same decision
 *   under another name.
 *
 * When #29 sets real prices, this table is where a real economy starts, and
 * none of it is load-bearing for anything else.
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
 * Exactly the item ids the buildable registry consumes
 * (`src/simulation/construction/definition.ts`): `item.brick` and
 * `item.wood-plank`, and nothing else. Nothing else is purchasable, because no
 * buildable requires anything else -- a catalog of materials no buildable
 * requires would be the declared-and-unconsumed content #141 inventories.
 *
 * **This paragraph has now been wrong twice, in the same way, and the second
 * time was inside the correction of the first.** It first read "because
 * nothing else is buildable": when this table shipped the registry held two
 * rows, so "no other material is required" and "no other thing is buildable"
 * were the same statement and the shorter one got written. ADR 0028 phases 1
 * and 2 added `bed-wooden` and `toilet-brick` without adding a material, and
 * the sentence became a false claim about the Build panel while the table it
 * justified stayed correct.
 *
 * The fix for that reintroduced a tally one sentence above it -- "across all
 * four of its rows", naming `wall-brick`, `door-wooden`, `bed-wooden` and
 * `toilet-brick` -- and ADR 0028 phase 4 took the registry to **21** rows
 * (`grep -cE "^  \['[a-z0-9-]+'" src/simulation/construction/definition.ts`).
 * A companion sentence about "a fifth buildable" went stale with it. So the
 * tally is **deleted rather than updated**, per `docs/AGENT_WORKFLOW.md` §4:
 * *"A sentence asserting an absence or a count rots first... Prefer a sentence
 * that states a subject over one that states a tally."* Replacing 4 with 21
 * would buy exactly as long as replacing 2 with 4 did.
 *
 * The rule that governs this list was correct both times and is unaffected by
 * either error: it is the demand side's **materials**, not its row count. A
 * further buildable made of plank or brick needs no row here however many
 * there are, and one made of anything else needs a row before it can be built
 * at all, because `validateBuildableItemReferences` only checks that a
 * requirement names a declared item and never that anyone sells it.
 */
export const PROCURABLE_MATERIALS: readonly ProcurableMaterial[] = Object.freeze([
  Object.freeze({ itemId: 'item.brick', unitPriceMinorUnits: 40 }),
  Object.freeze({ itemId: 'item.wood-plank', unitPriceMinorUnits: 65 }),
]);

/** The row for an item id, or `undefined` when it cannot be bought. */
export function procurableMaterial(itemId: string): ProcurableMaterial | undefined {
  return PROCURABLE_MATERIALS.find((material) => material.itemId === itemId);
}
