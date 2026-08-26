import { describe, expect, it } from 'vitest';
import { Treasury, TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';

/**
 * The treasury's affordability boundary (#416).
 *
 * `Treasury.canAfford` is the single gate every spend in the simulation goes
 * through, and the whole of its content is one chain of three comparisons. The
 * measurement that produced this file: changing `amountMinorUnits <=
 * this.balance` to `<` left **238 files / 2,696 tests green**, because the
 * suite's only direct `spend()` call spends `TREASURY_STARTING_BALANCE_MINOR_UNITS -
 * (WAGE - 1)` and every purchase it drives is either comfortably affordable or
 * comfortably not. Nothing in the repository ever spent the exact balance, so
 * the one input that separates `<=` from `<` was never supplied.
 *
 * What that mutation ships is a prison that cannot spend its last coin: the
 * player watches a purchase they can exactly afford be refused as
 * `purchase.insufficient-funds`, and the same off-by-one silently sits under
 * hiring (`StaffHiringService`) and every future payment. It is not an
 * arithmetic nicety -- "you have exactly enough" is the most likely balance a
 * player reaches deliberately.
 *
 * Every expected value here is a literal or an argument derived from the
 * *constructor's* input, never from `canAfford`, `spend` or `balanceMinorUnits`
 * read back after the operation under test. The class is asked a question whose
 * answer was decided before it ran.
 *
 * The player-reachable half of the same boundary -- a real `PurchaseMaterials`
 * command for exactly the opening balance, through the real kernel -- is in
 * `tests/integration/economy-money-conservation.test.ts`, because what that
 * boundary must not break is the conservation equation.
 */
describe('Treasury: the exact-balance boundary', () => {
  const BALANCE = 1_000;

  it('can afford exactly the balance, and one minor unit more than it cannot', () => {
    const treasury = new Treasury(BALANCE);

    // The boundary itself, from both sides and with the step between them
    // spelled out. `<=` says the first is true; `<` says it is false, and only
    // this input tells the two apart.
    expect(treasury.canAfford(BALANCE), 'a prison must be able to spend its last coin').toBe(true);
    expect(treasury.canAfford(BALANCE - 1)).toBe(true);
    expect(treasury.canAfford(BALANCE + 1), 'nothing may be affordable past the balance').toBe(false);
  });

  it('spends the exact balance down to zero rather than refusing it', () => {
    const treasury = new Treasury(BALANCE);

    expect(treasury.spend(BALANCE), 'spending exactly the balance is a purchase, not an overdraft').toBe(true);
    expect(treasury.balanceMinorUnits).toBe(0);
    // And the account is now empty rather than negative: the refusal contract
    // holds at the far end of the same boundary, where every further spend --
    // including a spend of nothing -- must leave the balance where it is.
    expect(treasury.spend(1)).toBe(false);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('refuses a spend of one more than the balance and changes nothing', () => {
    const treasury = new Treasury(BALANCE);

    expect(treasury.spend(BALANCE + 1)).toBe(false);
    // The refusal is total: `spend` returns before the subtraction, so a
    // partial debit is the failure this pins against.
    expect(treasury.balanceMinorUnits).toBe(BALANCE);
  });

  it('holds the same boundary at the opening balance a new prison starts with', () => {
    // The figure a session actually has, so the boundary is pinned at the
    // number a player can reach rather than only at a round fixture value.
    const treasury = new Treasury();

    expect(treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(treasury.canAfford(TREASURY_STARTING_BALANCE_MINOR_UNITS)).toBe(true);
    expect(treasury.canAfford(TREASURY_STARTING_BALANCE_MINOR_UNITS + 1)).toBe(false);
  });

  it('holds the boundary again after a credit moves it', () => {
    // The boundary is a property of the *current* balance, not of the opening
    // one: a refund or an income payment moves it, and the next spend must be
    // measured against where it moved to.
    const treasury = new Treasury(BALANCE);
    treasury.credit(500);

    expect(treasury.canAfford(1_500)).toBe(true);
    expect(treasury.canAfford(1_501)).toBe(false);
    expect(treasury.spend(1_500)).toBe(true);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('holds the boundary at a restored balance, so a loaded prison can spend its last coin too', () => {
    const treasury = new Treasury(BALANCE);
    treasury.restore({ balanceMinorUnits: 7 });

    expect(treasury.canAfford(7)).toBe(true);
    expect(treasury.canAfford(8)).toBe(false);
    expect(treasury.spend(7)).toBe(true);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('is a zero balance that refuses everything except nothing', () => {
    // The degenerate end of the same comparison, and the reason `spend(0)` is
    // asserted rather than left undefined: `0 <= 0` is what makes a free
    // purchase legal, and a `<` would make "buy nothing" a refusal too.
    const treasury = new Treasury(0);

    expect(treasury.canAfford(0)).toBe(true);
    expect(treasury.canAfford(1)).toBe(false);
    expect(treasury.spend(0)).toBe(true);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('refuses a fractional, negative or unsafe amount without touching the balance', () => {
    // The other two terms of the same chain, so a guard on `<=` does not stand
    // alone in this file.
    const treasury = new Treasury(BALANCE);

    expect(treasury.canAfford(0.5)).toBe(false);
    expect(treasury.canAfford(-1)).toBe(false);
    expect(treasury.canAfford(Number.NaN)).toBe(false);
    expect(treasury.canAfford(Number.POSITIVE_INFINITY)).toBe(false);
    expect(treasury.spend(0.5)).toBe(false);
    expect(treasury.balanceMinorUnits).toBe(BALANCE);
  });
});
