import { describe, expect, it } from 'vitest';
import {
  Treasury,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  TREASURY_STARTING_BALANCE_MINOR_UNITS,
} from '../../src/simulation/economy';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';

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

/**
 * The other end of the same comparison, opened by
 * [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 2: **the balance may go negative.**
 *
 * The block above is untouched and that is the load-bearing half of this one.
 * `canAfford` was `amountMinorUnits <= this.balance` and is now
 * `this.balance - amountMinorUnits >= this.floor`; with the default floor of
 * `0` those are the same comparison, so every boundary #416 pinned still holds
 * to the minor unit and a session that has borrowed nothing is unchanged.
 *
 * **What the old code asserted three times and this file asserted nowhere.**
 * The non-negative invariant was written out in the constructor, in `restore`
 * and in `save-schema.ts`, and removing all three broke **no test in the
 * repository** — measured, 349 files green. So the invariant that had to be
 * removed was guarded only at the spend boundary, which is preserved, and the
 * cases below are the guard the other two ends never had.
 */
describe('Treasury: the room a facility opens below zero', () => {
  /**
   * **The title said *"which is every shipped session"* and that stopped being
   * true on 2026-08-31.** It was correct for the whole life of this class:
   * `setOverdraftFloor` had no caller in `src/`. #703 ruling A gave it one --
   * `createNewSimulationRuntime` opens `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` on
   * the treasury it builds -- so a *shipped session* now has a facility and a
   * bare `new Treasury()` still does not. The default of `0` is what this case
   * is about and it has not moved; the case below it is the one about the
   * shipped configuration.
   */
  it('refuses to go below zero while no facility is open, which is a bare `new Treasury`', () => {
    const treasury = new Treasury(40);

    expect(treasury.overdraftFloorMinorUnits, 'the class default is still no room at all').toBe(0);
    // A plank is 65 and the prison holds 40: ADR 0075's lock, unchanged.
    expect(treasury.spend(65)).toBe(false);
    expect(treasury.balanceMinorUnits).toBe(40);
  });

  it('spends into the room a facility opened, and stops at its far edge', () => {
    const treasury = new Treasury(40);
    treasury.setOverdraftFloor(-100);

    // 40 - 65 = -25, which is above -100.
    expect(treasury.canAfford(65)).toBe(true);
    expect(treasury.spend(65)).toBe(true);
    expect(treasury.balanceMinorUnits).toBe(-25);

    // 75 more lands exactly on the floor and is allowed; 76 is not.
    expect(treasury.canAfford(75)).toBe(true);
    expect(treasury.canAfford(76)).toBe(false);
    expect(treasury.spend(76)).toBe(false);
    expect(treasury.balanceMinorUnits, 'a refusal at the floor changes nothing').toBe(-25);
    expect(treasury.spend(75)).toBe(true);
    expect(treasury.balanceMinorUnits).toBe(-100);
  });

  it('credits a negative balance upward without any special case', () => {
    const treasury = new Treasury(-500);

    treasury.credit(300);
    expect(treasury.balanceMinorUnits).toBe(-200);
    treasury.credit(300);
    expect(treasury.balanceMinorUnits).toBe(100);
  });

  it('carries a negative balance through a snapshot and back', () => {
    // ADR 0075: a prison that saved under water must load under water, or a
    // reload is a way out of the debt.
    const treasury = new Treasury(0);
    treasury.restore({ balanceMinorUnits: -1_234 });

    expect(treasury.balanceMinorUnits).toBe(-1_234);
    expect(treasury.snapshot()).toEqual({ balanceMinorUnits: -1_234 });
  });

  it('refuses a floor above zero, which would be a minimum balance and a different mechanic', () => {
    const treasury = new Treasury(1_000);

    expect(() => treasury.setOverdraftFloor(1)).toThrow(RangeError);
    expect(() => treasury.setOverdraftFloor(-0.5)).toThrow(RangeError);
    expect(treasury.overdraftFloorMinorUnits).toBe(0);
  });

  it('still refuses a fractional or negative amount with a facility open', () => {
    // The other two terms of `canAfford`'s chain survive the change: a floor
    // must not turn "spend minus one" into a credit.
    const treasury = new Treasury(1_000);
    treasury.setOverdraftFloor(-1_000);

    expect(treasury.canAfford(-1)).toBe(false);
    expect(treasury.spend(-1)).toBe(false);
    expect(treasury.canAfford(0.5)).toBe(false);
    expect(treasury.balanceMinorUnits).toBe(1_000);
  });
});

/**
 * **The shipped configuration, which is a different claim from anything above.**
 *
 * Everything in this file until here is about `Treasury` in isolation, and every
 * case builds one by hand. #703 ruling A of 2026-08-31 made the floor a standing
 * facility applied at the composition root
 * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * §2), so there is now a second question -- *what does a real session get* --
 * and it is answered here rather than left to be inferred from the class default
 * of `0`.
 *
 * Two things are pinned, and the reason for each:
 *
 * - **The magnitude, as a rule and not as a literal.** The constant is
 *   `-TREASURY_STARTING_BALANCE_MINOR_UNITS / 10`, so the derivation is asserted
 *   beside the value. A change to the opening grant should move the floor; a
 *   change to the *ratio* is a decision and fails here.
 * - **That a session actually gets it, on both paths.** Nine test files write
 *   balances against this figure, and each of them would fail for its own
 *   confusing reason if the composition root stopped calling
 *   `setOverdraftFloor`. This is the case that says why.
 */
describe('what a shipped session gets (#703 ruling A)', () => {
  it('is one tenth of the opening grant, derived rather than written down', () => {
    expect(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS).toBe(-2_500);
    expect(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS * 10).toBe(-TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(Number.isSafeInteger(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS)).toBe(true);
    expect(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, 'a floor above zero would be a minimum balance').toBeLessThan(0);
  });

  it('opens the facility on a new session, unpressed', () => {
    const runtime = createNewSimulationRuntime(0x703);

    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(runtime.treasury.overdraftFloorMinorUnits).toBe(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    expect(
      runtime.treasury.canAfford(TREASURY_STARTING_BALANCE_MINOR_UNITS - TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS),
      'spending power is the grant plus the facility, to the minor unit',
    ).toBe(true);
    expect(
      runtime.treasury.canAfford(TREASURY_STARTING_BALANCE_MINOR_UNITS - TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS + 1),
      'and not one unit more',
    ).toBe(false);
  });

  it('opens it on a restored session too, with nothing persisted to carry it', () => {
    /*
     * `restoreSimulationRuntime` builds through `createNewSimulationRuntime`, and
     * `Treasury.restore` writes the balance and never touches the floor -- which
     * is the whole reason no `SAVE_SCHEMA_VERSION` bump was needed (ADR 0083
     * §(e)). Asserted here as well as in `tests/migrations/`, because this is
     * the claim the composition root's placement is *for*.
     */
    const runtime = createNewSimulationRuntime(0x703);
    runtime.treasury.spend(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    const restored = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;

    expect(restored.treasury.balanceMinorUnits).toBe(0);
    expect(restored.treasury.overdraftFloorMinorUnits).toBe(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    expect(
      JSON.stringify(captureSessionSnapshot(runtime)),
      'and no floor is written to the save, at any depth',
    ).not.toContain('overdraft');
  });
});
