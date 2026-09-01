import { describe, expect, it } from 'vitest';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import {
  INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS,
  Treasury,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  TREASURY_STARTING_BALANCE_MINOR_UNITS,
  rungFloorMinorUnits,
  type SpendClass,
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
 *
 * ## Why every call below passes `'wages'`
 *
 * The owner's ruling 19 of 2026-08-31 -- drafted as ADR 0017's "Amendment,
 * 2026-09-01" -- made the `SpendClass` a **required** argument on `canAfford`
 * and `spend`, so that no spend can reach the treasury without saying which of
 * ADR 0017 decision 8's rungs it belongs to. Every case above the ruling's own
 * describe is about the treasury's floor rather than about a rung, and
 * `'wages'` is the class whose threshold **is** the floor -- so it reproduces
 * every boundary this file has ever pinned, to the minor unit, and none of the
 * expected values below moved.
 *
 * The last describe is the one about the rungs themselves.
 */
describe('Treasury: the exact-balance boundary', () => {
  const BALANCE = 1_000;

  it('can afford exactly the balance, and one minor unit more than it cannot', () => {
    const treasury = new Treasury(BALANCE);

    // The boundary itself, from both sides and with the step between them
    // spelled out. `<=` says the first is true; `<` says it is false, and only
    // this input tells the two apart.
    expect(treasury.canAfford(BALANCE, 'wages'), 'a prison must be able to spend its last coin').toBe(true);
    expect(treasury.canAfford(BALANCE - 1, 'wages')).toBe(true);
    expect(treasury.canAfford(BALANCE + 1, 'wages'), 'nothing may be affordable past the balance').toBe(false);
  });

  it('spends the exact balance down to zero rather than refusing it', () => {
    const treasury = new Treasury(BALANCE);

    expect(treasury.spend(BALANCE, 'wages'), 'spending exactly the balance is a purchase, not an overdraft').toBe(true);
    expect(treasury.balanceMinorUnits).toBe(0);
    // And the account is now empty rather than negative: the refusal contract
    // holds at the far end of the same boundary, where every further spend --
    // including a spend of nothing -- must leave the balance where it is.
    expect(treasury.spend(1, 'wages')).toBe(false);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('refuses a spend of one more than the balance and changes nothing', () => {
    const treasury = new Treasury(BALANCE);

    expect(treasury.spend(BALANCE + 1, 'wages')).toBe(false);
    // The refusal is total: `spend` returns before the subtraction, so a
    // partial debit is the failure this pins against.
    expect(treasury.balanceMinorUnits).toBe(BALANCE);
  });

  it('holds the same boundary at the opening balance a new prison starts with', () => {
    // The figure a session actually has, so the boundary is pinned at the
    // number a player can reach rather than only at a round fixture value.
    const treasury = new Treasury();

    expect(treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(treasury.canAfford(TREASURY_STARTING_BALANCE_MINOR_UNITS, 'wages')).toBe(true);
    expect(treasury.canAfford(TREASURY_STARTING_BALANCE_MINOR_UNITS + 1, 'wages')).toBe(false);
  });

  it('holds the boundary again after a credit moves it', () => {
    // The boundary is a property of the *current* balance, not of the opening
    // one: a refund or an income payment moves it, and the next spend must be
    // measured against where it moved to.
    const treasury = new Treasury(BALANCE);
    treasury.credit(500);

    expect(treasury.canAfford(1_500, 'wages')).toBe(true);
    expect(treasury.canAfford(1_501, 'wages')).toBe(false);
    expect(treasury.spend(1_500, 'wages')).toBe(true);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('holds the boundary at a restored balance, so a loaded prison can spend its last coin too', () => {
    const treasury = new Treasury(BALANCE);
    treasury.restore({ balanceMinorUnits: 7 });

    expect(treasury.canAfford(7, 'wages')).toBe(true);
    expect(treasury.canAfford(8, 'wages')).toBe(false);
    expect(treasury.spend(7, 'wages')).toBe(true);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('is a zero balance that refuses everything except nothing', () => {
    // The degenerate end of the same comparison, and the reason `spend(0)` is
    // asserted rather than left undefined: `0 <= 0` is what makes a free
    // purchase legal, and a `<` would make "buy nothing" a refusal too.
    const treasury = new Treasury(0);

    expect(treasury.canAfford(0, 'wages')).toBe(true);
    expect(treasury.canAfford(1, 'wages')).toBe(false);
    expect(treasury.spend(0, 'wages')).toBe(true);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('refuses a fractional, negative or unsafe amount without touching the balance', () => {
    // The other two terms of the same chain, so a guard on `<=` does not stand
    // alone in this file.
    const treasury = new Treasury(BALANCE);

    expect(treasury.canAfford(0.5, 'wages')).toBe(false);
    expect(treasury.canAfford(-1, 'wages')).toBe(false);
    expect(treasury.canAfford(Number.NaN, 'wages')).toBe(false);
    expect(treasury.canAfford(Number.POSITIVE_INFINITY, 'wages')).toBe(false);
    expect(treasury.spend(0.5, 'wages')).toBe(false);
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
    expect(treasury.spend(65, 'wages')).toBe(false);
    expect(treasury.balanceMinorUnits).toBe(40);
  });

  it('spends into the room a facility opened, and stops at its far edge', () => {
    const treasury = new Treasury(40);
    treasury.setOverdraftFloor(-100);

    // 40 - 65 = -25, which is above -100.
    expect(treasury.canAfford(65, 'wages')).toBe(true);
    expect(treasury.spend(65, 'wages')).toBe(true);
    expect(treasury.balanceMinorUnits).toBe(-25);

    // 75 more lands exactly on the floor and is allowed; 76 is not.
    expect(treasury.canAfford(75, 'wages')).toBe(true);
    expect(treasury.canAfford(76, 'wages')).toBe(false);
    expect(treasury.spend(76, 'wages')).toBe(false);
    expect(treasury.balanceMinorUnits, 'a refusal at the floor changes nothing').toBe(-25);
    expect(treasury.spend(75, 'wages')).toBe(true);
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

    expect(treasury.canAfford(-1, 'wages')).toBe(false);
    expect(treasury.spend(-1, 'wages')).toBe(false);
    expect(treasury.canAfford(0.5, 'wages')).toBe(false);
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
      runtime.treasury.canAfford(TREASURY_STARTING_BALANCE_MINOR_UNITS - TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, 'wages'),
      'spending power is the grant plus the facility, to the minor unit',
    ).toBe(true);
    expect(
      runtime.treasury.canAfford(TREASURY_STARTING_BALANCE_MINOR_UNITS - TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS + 1, 'wages'),
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
    runtime.treasury.spend(TREASURY_STARTING_BALANCE_MINOR_UNITS, 'wages');
    const restored = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;

    expect(restored.treasury.balanceMinorUnits).toBe(0);
    expect(restored.treasury.overdraftFloorMinorUnits).toBe(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    expect(
      JSON.stringify(captureSessionSnapshot(runtime)),
      'and no floor is written to the save, at any depth',
    ).not.toContain('overdraft');
  });
});


/**
 * **The rungs the owner's ruling 19 of 2026-08-31 gives ADR 0017 decision 8,
 * as equalised by the owner's ruling on #771 (2026-09-01).**
 *
 * Ruling 19 -- *"Dać szczeblom własne progi wewnątrz debetu"*, give the rungs
 * their own thresholds inside the overdraft -- gave -1,250 (deliveries),
 * -2,000 (construction) and -2,500 (wages, the floor). #771 found a 750-wide
 * band in which the shop refused a purchase the build queue could still fund
 * with the same materials, and the owner ruled *"buying and building stop at
 * the same place"*: construction now reads the same -1,250 deliveries does.
 * Both rulings are recorded at `docs/adr/0017-money-primary-resource-model.md`
 * ("Amendment, 2026-09-01", both of them -- ruling 19's and the equalisation
 * that follows it), **Accepted**.
 *
 * Everything above this describe is about a treasury with no facility open, and
 * every one of those expectations is unchanged -- which is the first thing
 * asserted here, because it is what "inside the overdraft" has to mean.
 */
describe('Treasury: the rungs inside the overdraft (ruling 19)', () => {
  const CLASSES: readonly SpendClass[] = ['deliveries', 'construction', 'wages', 'hiring'];

  it('has no rungs at all while no facility is open, on any class', () => {
    const treasury = new Treasury(100);

    for (const spendClass of CLASSES) {
      expect(treasury.floorFor(spendClass), spendClass).toBe(0);
      expect(treasury.canAfford(100, spendClass), spendClass).toBe(true);
      expect(treasury.canAfford(101, spendClass), spendClass).toBe(false);
    }
  });

  it('is the owner`s numbers at the shipped floor -- deliveries and construction equalised, and the third is the floor itself', () => {
    const treasury = new Treasury(0);
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);

    expect(treasury.floorFor('deliveries')).toBe(-1_250);
    // Equalised by the owner's ruling on #771 (2026-09-01): construction no
    // longer has a rung of its own 750 minor units deeper than deliveries'.
    expect(treasury.floorFor('construction'), 'the same balance a Buy press stops at').toBe(-1_250);
    expect(treasury.floorFor('wages')).toBe(-2_500);
    // Not a fourth threshold and not the deepest: see `SpendClass`.
    expect(treasury.floorFor('hiring')).toBe(-1_250);

    // Deliveries and construction are the same constant, not two constants
    // that happen to agree -- see `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS`.
    expect(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS).toBe(-1_250);
    expect(INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS).toBe(-1_250);
    expect(INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS).toBe(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS);
    // And the third carries no constant of its own -- it tracks the floor.
    treasury.setOverdraftFloor(-4_000);
    expect(treasury.floorFor('wages'), 'the wage rung is the floor, wherever the floor is').toBe(-4_000);
  });

  it('refuses each class one minor unit past its own rung, and not before', () => {
    const boundaries = [
      ['deliveries', -1_250],
      ['construction', -1_250],
      ['wages', -2_500],
      ['hiring', -1_250],
    ] as const;

    for (const [spendClass, rung] of boundaries) {
      const treasury = new Treasury(0);
      treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);

      expect(treasury.canAfford(-rung, spendClass), `${spendClass}: landing on the rung is legal`).toBe(true);
      expect(treasury.canAfford(-rung + 1, spendClass), `${spendClass}: one unit past it is not`).toBe(false);
      expect(treasury.spend(-rung + 1, spendClass), `${spendClass}: and the refusal changes nothing`).toBe(false);
      expect(treasury.balanceMinorUnits).toBe(0);
      expect(treasury.spend(-rung, spendClass)).toBe(true);
      expect(treasury.balanceMinorUnits).toBe(rung);
    }
  });

  it('clamps every rung to the floor, so a shallower floor cannot leave a rung unreachable below it', () => {
    /*
     * The property that keeps the ladder coherent if the floor is ever
     * reconfigured. It is deliberately a clamp and **not** a scaling: ruling 19
     * gave three magnitudes (now two, since #771's equalisation) and no
     * ratios, and whether the rungs should move with the floor is marked in
     * the amendment as the owner's. What the clamp guarantees is only that no
     * rung is ever deeper than the floor, so the rungs collapse onto it in
     * order instead of being dead below it.
     */
    const treasury = new Treasury(0);
    treasury.setOverdraftFloor(-1_000);

    // Both discretionary rungs are below this floor and collapse onto it
    // together -- the property #771's equalisation adds: there is no longer a
    // floor position at which they can be told apart by the clamp.
    expect(treasury.floorFor('deliveries'), 'below this floor, collapses onto it').toBe(-1_000);
    expect(treasury.floorFor('construction'), 'and so does construction, onto the same floor').toBe(-1_000);
    expect(treasury.floorFor('wages')).toBe(-1_000);

    // At a floor deep enough for the rung to stand on its own, deliveries and
    // construction still agree with each other, above the floor.
    treasury.setOverdraftFloor(-1_600);
    expect(treasury.floorFor('deliveries'), 'the rung is above this floor and stands').toBe(-1_250);
    expect(treasury.floorFor('construction'), 'and construction stands with it, at the same value').toBe(-1_250);
    expect(treasury.floorFor('wages')).toBe(-1_600);

    // And the ordering survives the collapse, which is the point of the clamp.
    expect(treasury.floorFor('deliveries')).toBeGreaterThanOrEqual(treasury.floorFor('construction'));
    expect(treasury.floorFor('construction')).toBeGreaterThanOrEqual(treasury.floorFor('wages'));
  });

  it('is one definition of the clamp, shared with the host`s pre-flight', () => {
    /*
     * `judgeAffordability` (`src/ui/affordability.ts`) sits on the other side of
     * `sender.submit` and has no `Treasury` to ask, so it composes its floor
     * through `rungFloorMinorUnits`. This is the pin that says the two agree:
     * that module exists because a second copy of this comparison was wrong for
     * a whole ruling and nothing could see it.
     */
    for (const floor of [0, -100, -1_250, -1_600, -2_500, -10_000]) {
      const treasury = new Treasury(0);
      treasury.setOverdraftFloor(floor);
      for (const spendClass of CLASSES) {
        expect(treasury.floorFor(spendClass), `${spendClass} at ${String(floor)}`).toBe(
          rungFloorMinorUnits(spendClass, floor),
        );
      }
    }
  });

  it('still refuses a fractional or negative amount on every rung', () => {
    const treasury = new Treasury(1_000);
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);

    for (const spendClass of CLASSES) {
      expect(treasury.canAfford(-1, spendClass), spendClass).toBe(false);
      expect(treasury.canAfford(0.5, spendClass), spendClass).toBe(false);
      expect(treasury.canAfford(Number.NaN, spendClass), spendClass).toBe(false);
      expect(treasury.spend(-1, spendClass), spendClass).toBe(false);
    }
    expect(treasury.balanceMinorUnits).toBe(1_000);
  });
});

/**
 * **The starter rung: the owner's second ruling on #771 (2026-09-01)**, drafted
 * as ADR 0017's "Amendment, 2026-09-01: a starter rung for a fresh,
 * unfurnished prison" -- the second of the three remedies that amendment's §9
 * named without choosing.
 *
 * `tests/integration/economy-liquidity-hard-lock.test.ts` is the gate that
 * proves this closes ECON-002 through the real kernel; this file pins the
 * arithmetic in isolation, the same division of labour every other rung in
 * this file already keeps.
 */
describe('Treasury: the starter rung for a fresh, unfurnished prison (#771 remedy 2)', () => {
  const PLANK_PRICE = procurableMaterial('item.wood-plank')!.unitPriceMinorUnits;

  it('is the mature deliveries rung, shallower by exactly one plank', () => {
    // Written out as the arithmetic rather than trusted as a name: the whole
    // proof this rung closes ECON-002 rests on this being *exactly* one
    // plank's price, no more and no less.
    expect(PLANK_PRICE, 'the figure the hard-lock test pins').toBe(65);
    expect(INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS).toBe(
      INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS + PLANK_PRICE,
    );
    expect(INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS, 'shallower, not deeper').toBe(-1_185);
  });

  it('only moves deliveries and hiring -- construction and wages are exactly what a mature prison sees', () => {
    const fresh = new Treasury(0);
    fresh.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);

    expect(fresh.floorFor('deliveries', true), 'shallower while fresh').toBe(-1_185);
    expect(fresh.floorFor('hiring', true), 'shares the shallower threshold, exactly as it shares the mature one').toBe(
      -1_185,
    );
    expect(fresh.floorFor('construction', true), 'unaffected -- this is the room the starter rung reserves').toBe(
      -1_250,
    );
    expect(fresh.floorFor('wages', true), 'unaffected -- the floor is the floor, fresh or not').toBe(-2_500);

    // And the flag is what moves it: the same treasury, the same balance,
    // asked without it, reads the mature rungs exactly as every test above
    // this describe already pins.
    expect(fresh.floorFor('deliveries', false)).toBe(-1_250);
    expect(fresh.floorFor('hiring', false)).toBe(-1_250);
  });

  it('defaults to the mature rungs when the flag is omitted, on every class', () => {
    // The property that makes the default safe despite not being required
    // the way `SpendClass` is (see `rungFloorMinorUnits`'s own docblock):
    // every existing caller and every test written before this rung existed
    // gets the identical behaviour it always had.
    const treasury = new Treasury(0);
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    const classes: readonly SpendClass[] = ['deliveries', 'construction', 'wages', 'hiring'];
    for (const spendClass of classes) {
      expect(treasury.floorFor(spendClass), spendClass).toBe(treasury.floorFor(spendClass, false));
    }
    expect(rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS)).toBe(
      rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, false),
    );
  });

  it('proves the transition is never a cliff: any balance a fresh prison can reach can still afford one plank at the mature construction rung', () => {
    /*
     * The general proof, not a single fixture: `Treasury.canAfford` enforces
     * `balance - amount >= floor` on *every* spend, so a `'deliveries'`/
     * `'hiring'` balance can never go below whichever floor was active when
     * it was spent. Sweeping every balance a fresh press could have reached
     * -- the rung itself and every value above it -- and checking that a
     * one-plank construction spend still clears the (unaffected, deeper)
     * construction rung from there is the property, not an instance of it.
     */
    const overdraftFloor = TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS;
    const freshFloor = rungFloorMinorUnits('deliveries', overdraftFloor, true);
    const constructionFloor = rungFloorMinorUnits('construction', overdraftFloor, false);

    for (let balance = freshFloor; balance <= freshFloor + 500; balance += 5) {
      const treasury = new Treasury(balance);
      treasury.setOverdraftFloor(overdraftFloor);
      expect(
        treasury.canAfford(PLANK_PRICE, 'construction'),
        `balance ${String(balance)}, the worst case a fresh prison could reach or better`,
      ).toBe(true);
    }

    // And the worst case, named rather than swept: exactly at the fresh
    // floor, a plank spent at the construction rung lands exactly on it too
    // -- the transition has zero margin at the boundary and never negative
    // margin, which is what "not a cliff" means arithmetically.
    expect(freshFloor - PLANK_PRICE, 'lands exactly on the unaffected construction rung').toBe(constructionFloor);
  });

  it('one minor unit below the fresh floor is exactly where the mature rung would already be refusing too', () => {
    // The starter rung is *shallower*, so it cannot be reached from below --
    // `canAfford` never lets a fresh 'deliveries'/'hiring' balance pass it in
    // the first place. This pins that the one balance the sweep above does
    // not cover -- one unit short of the fresh floor -- is unreachable via a
    // fresh spend at all, which is what makes the sweep exhaustive rather
    // than merely wide.
    const treasury = new Treasury(rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, true) + 1);
    treasury.setOverdraftFloor(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    expect(treasury.canAfford(1, 'deliveries', true), 'the last minor unit before the fresh floor').toBe(true);
    expect(treasury.canAfford(2, 'deliveries', true), 'one past it is refused, same as any other rung').toBe(false);
  });
});
