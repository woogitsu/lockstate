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
 * ADR 0017 is Accepted, and its decisions 6 and 8 answer two things this class
 * deliberately does not implement. The omissions are the point, and they are
 * now omissions against a settled answer rather than against an open question:
 *
 * - **No income.** Nothing here credits the treasury on a schedule. `credit`
 *   exists because a refund needs it, not because anything pays. Decision 6
 *   settles the basis an income line would use -- per prisoner-day, accrued
 *   per occupied place -- and building it is #29's, not this slice's.
 * - **No insolvency policy.** The balance cannot go negative: `spend` refuses
 *   rather than overdrawing, which is a validation answer and not a policy.
 *   Decision 8 settles that a negative balance should degrade the prison in a
 *   defined order rather than end the run, and that ladder is unbuilt — and
 *   unreachable, because with nothing paying in and `spend` refusing, no
 *   negative balance can occur for it to respond to. That is why this slice
 *   does not need it.
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
 * **A placeholder, and load-bearing for nothing.** It is not an income
 * policy — a starting balance says what you begin with, never what the state
 * pays you for, which is the question ADR 0017 leaves open. It is set to buy
 * a few hundred bricks so that #89's loop can be driven end to end without
 * anyone having to top it up, and it should be replaced the moment a real
 * income line exists.
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
   * Puts money back.
   *
   * Its only caller is a refund — a purchase whose delivery was cancelled.
   * It is **not** an income line: nothing calls this on a schedule. Adding
   * something that does means implementing ADR 0017 decision 6's accrual, and
   * belongs with #29's ledger rather than here.
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
