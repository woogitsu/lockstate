/**
 * The prison's money.
 *
 * Issue #96's decision, which needs no approval and is the owner's own:
 * **money is the primary resource and materials are procured.** There is no
 * gathering and no production; a wall exists because somebody paid for the
 * bricks and they were delivered.
 *
 * ## What this deliberately does not decide
 *
 * ADR 0017 is Accepted, and its decision 8 answers something this class still
 * deliberately does not implement. The omission is the point, and it is an
 * omission against a settled answer rather than against an open question:
 *
 * - **No insolvency policy.** The balance cannot go negative: `spend` refuses
 *   rather than overdrawing, which is a validation answer and not a policy.
 *   Decision 8 settles that a negative balance should degrade the prison in a
 *   defined order rather than end the run, and that ladder is unbuilt — and
 *   still unreachable, because `spend` refuses rather than overdrawing and
 *   nothing debits the balance on a schedule, so no negative balance can occur
 *   for it to respond to. That is why this slice does not need it. Note that
 *   #29's income line does **not** change this: paying in cannot produce a
 *   negative balance. What makes decision 8 reachable is a recurring *charge*
 *   the player cannot decline — wages are the obvious one, and `wageBand`
 *   exists in content with no payroll behind it.
 *
 * ## Integer minor units, and why that is not a formatting choice
 *
 * The balance is authoritative simulation state: a save carries it and
 * `docs/DETERMINISM.md`'s fingerprint hashes it. A fractional currency would
 * put a float there, and floating-point addition is not associative — two
 * runs that applied the same purchases in a different order could disagree.
 * `docs/DETERMINISM.md` states its rule for simulation state without an
 * exception for money.
 *
 * "Minor units" rather than a named currency because naming one is a product
 * decision this slice does not need. The HUD will have to choose a symbol and
 * a locale format eventually; nothing in the simulation cares.
 */

/**
 * What a new prison starts with.
 *
 * **No longer a placeholder: 25,000 is the owner's decision, and the decision
 * was to leave it where it was.** It used to say here that this figure should
 * be replaced the moment a real income line existed. That line landed with
 * #29, the question was put, and the answer was to keep 25,000 — so this
 * constant is now a chosen opening balance rather than a number waiting to be
 * chosen. It is still not an income policy; a starting balance says what you
 * begin with, never what the state pays you for, and ADR 0017 decision 5
 * keeps both out of the architecture record and in #29.
 *
 * What it buys, in the game's own units, so the figure can be argued with
 * rather than merely trusted: at the shipped catalog prices it is a few
 * hundred bricks, or roughly 22 standalone 2×3 cells' worth of wall and door
 * at 1,105 each — and it is 83 prisoner-days of income at 300
 * (`STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS`). That second reading is the
 * one #29 added: the opening balance is now expressible as a number of days
 * of running the place, which is what makes "keep it" a judgement rather than
 * an omission.
 */
export const TREASURY_STARTING_BALANCE_MINOR_UNITS = 25_000;

export interface TreasurySnapshot {
  readonly balanceMinorUnits: number;
}

export class Treasury {
  private balance: number;

  public constructor(startingBalanceMinorUnits: number = TREASURY_STARTING_BALANCE_MINOR_UNITS) {
    if (!Number.isSafeInteger(startingBalanceMinorUnits) || startingBalanceMinorUnits < 0) {
      throw new RangeError('Treasury balance must be a non-negative safe integer of minor units.');
    }
    this.balance = startingBalanceMinorUnits;
  }

  public get balanceMinorUnits(): number {
    return this.balance;
  }

  public canAfford(amountMinorUnits: number): boolean {
    return Number.isSafeInteger(amountMinorUnits) && amountMinorUnits >= 0 && amountMinorUnits <= this.balance;
  }

  /**
   * Spends, or refuses and changes nothing.
   *
   * Returns whether it spent, rather than throwing. A purchase the player
   * cannot afford is an ordinary refusal the interface reports, not an
   * exceptional condition — the same reading `ConstructionSystem.submitOrder`
   * takes of an order on unowned land (#215).
   */
  public spend(amountMinorUnits: number): boolean {
    if (!this.canAfford(amountMinorUnits)) return false;
    this.balance -= amountMinorUnits;
    return true;
  }

  /**
   * Puts money in.
   *
   * Two callers, and only one of them is an income line — the distinction is
   * worth keeping at the method, because this is where a future third caller
   * arrives:
   *
   * - `ProcurementSystem.cancel`, a **refund** of a purchase whose delivery
   *   was cancelled. Not income; it returns money that was already the
   *   prison's.
   * - `StateIncomeSystem.update`, which **is** the income line: ADR 0017
   *   decision 3 on decision 6's basis, once per in-game day, per occupied
   *   place (#29).
   *
   * `tests/foundation/documentation-claims-contract.test.ts` enumerates both
   * against the source, so a third caller cannot arrive without this list and
   * `docs/HUD_PROJECTIONS.md` gap 21 being brought with it.
   */
  public credit(amountMinorUnits: number): void {
    if (!Number.isSafeInteger(amountMinorUnits) || amountMinorUnits < 0) {
      throw new RangeError('A credit must be a non-negative safe integer of minor units.');
    }
    if (!Number.isSafeInteger(this.balance + amountMinorUnits)) {
      throw new RangeError('A credit would take the balance past the safe integer range.');
    }
    this.balance += amountMinorUnits;
  }

  public snapshot(): TreasurySnapshot {
    return { balanceMinorUnits: this.balance };
  }

  public restore(snapshot: TreasurySnapshot): void {
    if (!Number.isSafeInteger(snapshot.balanceMinorUnits) || snapshot.balanceMinorUnits < 0) {
      throw new RangeError('A restored treasury balance must be a non-negative safe integer.');
    }
    this.balance = snapshot.balanceMinorUnits;
  }
}
