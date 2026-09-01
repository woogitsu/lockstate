import { describe, expect, it } from 'vitest';
import {
  INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
} from '../../src/simulation/economy';
import { HOST_PRESS_FLOOR_MINOR_UNITS, judgeAffordability } from '../../src/ui/affordability';

/**
 * **The host's pre-flight on the two intents that cost money.**
 *
 * `src/main.ts` refuses a `purchase-materials` or a `hire-staff` before it
 * sends the command, so the answer lands on the control the player pressed
 * rather than arriving from the worker some ticks later. Until #703 ruling A
 * that refusal was two inline comparisons -- `total > counts.treasuryMinorUnits`
 * at `src/main.ts` and the same shape for the wage -- which is
 * `Treasury.canAfford` with the floor hard-coded at zero.
 *
 * **Why this file exists at all, and it is not "for coverage".**
 * `vitest.config.ts` sets `environment: 'node'` and `src/main.ts` touches
 * `document`, so that file is unreachable from the suite: a mutation inside it
 * survives because nothing can observe it, not because nothing tests it
 * (`docs/AGENT_WORKFLOW.md`). Ruling A opened a standing overdraft of 2,500 in
 * every session, and those two comparisons would then have **refused presses
 * the simulation accepts** -- with no test in the repository able to go red.
 * `judgeAffordability` is the extraction that makes the decision observable,
 * exactly as `orderPrisonsForDisplay` (#445) was.
 *
 * **What is deliberately not asserted here.** That the verdict reaches a
 * rendered refusal band is a claim about the assembled page and belongs to
 * `tests/browser/app-shell.spec.ts`, which already takes that route for a
 * refused build order. This file is the arithmetic.
 */

/** The shipped facility, pinned so a change to it fails here with the reason named. */
const FLOOR = -2_500;

/**
 * **The floor a *press* is judged against, which since the owner's ruling 19 of
 * 2026-08-31 is not `FLOOR`.**
 *
 * Ruling 19 -- *"Dać szczeblom własne progi wewnątrz debetu"*, drafted as ADR
 * 0017's "Amendment, 2026-09-01" -- gives ADR 0017 decision 8's rungs their own
 * thresholds inside the overdraft. Both intents this module serves are refused
 * at the first rung: `purchase-materials` is `'deliveries'` and `hire-staff` is
 * `'hiring'`, which shares its threshold.
 *
 * **Every figure below that used to be 2,500 or -2,480 is now 1,250 or -1,230,
 * and the old ones are kept in the case comments.** The shape of each assertion
 * is unchanged; only the depth the host will carry to has moved. Pinned as a
 * literal here for the reason `FLOOR` is: a change to the rung fails in this
 * file, by name, rather than somewhere downstream.
 */
const PRESS_FLOOR = -1_250;

describe('judgeAffordability: the one comparison the host makes about money', () => {
  it('is the same boundary `Treasury.canAfford` decides, to the minor unit', () => {
    expect(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, '#703 ruling A: one tenth of the opening grant').toBe(FLOOR);
    expect(INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS, 'ruling 19: the first rung').toBe(PRESS_FLOOR);
    expect(HOST_PRESS_FLOOR_MINOR_UNITS, 'and it is the rung the host judges a press against').toBe(PRESS_FLOOR);

    // A prison at zero can still spend down to the first rung, and not one unit
    // more. Before ruling 19 this read 2,500 / 2,501 against the floor itself.
    expect(judgeAffordability(1_250, 0).refused).toBe(false);
    expect(judgeAffordability(1_251, 0).refused).toBe(true);

    // And from a balance already under water, the room left is what decides.
    // Before ruling 19: 20 / 21 against -2,480.
    expect(judgeAffordability(20, -1_230).refused).toBe(false);
    expect(judgeAffordability(21, -1_230).refused).toBe(true);
    expect(judgeAffordability(0, PRESS_FLOOR), 'buying nothing at the rung is legal').toMatchObject({
      refused: false,
    });
    expect(judgeAffordability(1, PRESS_FLOOR).refused).toBe(true);

    /*
     * **The rung is above the floor, so a press is now refused while the
     * treasury would still carry it**, and that is the ladder rather than a
     * disagreement between the two sides of `sender.submit`: `Treasury.spend`
     * refuses the same press, at the same depth, because the command handler
     * spends at the `'deliveries'` rung too
     * (`src/simulation/runtime/session-commands.ts`).
     */
    expect(judgeAffordability(1, FLOOR).refused, 'a press at the overdraft floor is long past its rung').toBe(true);
    expect(judgeAffordability(1_251, 0, FLOOR).refused, 'and the deep floor is still reachable by argument').toBe(
      false,
    );
  });

  /**
   * The regression the extraction exists for, stated as its own case: these are
   * the presses the inline `total > balance` would have refused and the
   * simulation would have accepted.
   */
  it('accepts the presses the pre-ruling comparison would have refused', () => {
    // `[65, -2_435]` was here until ruling 19 and is now past the first rung;
    // `[65, -1_185]` is the same probe one rung up.
    for (const [charge, balance] of [[65, 40], [80, 0], [40, -1_000], [65, -1_185]] as const) {
      const verdict = judgeAffordability(charge, balance);
      expect(charge > balance, 'the old comparison refused this').toBe(true);
      expect(verdict.refused, `${String(charge)} against ${String(balance)} is affordable`).toBe(false);
    }
  });

  it('is the old comparison exactly when the floor is zero, which is what a bare `new Treasury` has', () => {
    /*
     * The other direction, and the reason the floor is a parameter rather than a
     * closed-over constant: at a floor of zero this function must be
     * indistinguishable from the two lines it replaced, so the extraction cannot
     * have changed behaviour for any session that predates the ruling.
     */
    for (const balance of [0, 1, 40, 65, 1_000, 25_000]) {
      for (const charge of [0, 1, 39, 40, 64, 65, 999, 1_000, 25_000, 25_001]) {
        expect(
          judgeAffordability(charge, balance, 0).refused,
          `charge ${String(charge)} against ${String(balance)} at a floor of zero`,
        ).toBe(charge > balance);
      }
    }
  });

  it('reports the room left, which is what makes a refusal legible', () => {
    // Before ruling 19 this probe was `(65, -2_480)` with `spendableMinorUnits: 20`.
    expect(judgeAffordability(65, -1_230)).toEqual({
      refused: true,
      refusal: 'past-the-floor',
      chargeMinorUnits: 65,
      balanceMinorUnits: -1_230,
      spendableMinorUnits: 20,
    });
    /*
     * **And `spendableMinorUnits` is now the room to the *rung*, which is a
     * player-visible figure this file cannot settle.** It read 27,500 -- the
     * grant plus the whole facility -- and reads 26,250, the grant plus the
     * first rung. `hud.status.funds-remaining` (`{remaining} left`) is computed
     * elsewhere, from the *published* floor, and still says 27,500: reporting
     * that divergence is this branch's job, and choosing what the chip should
     * say is the owner's under `AGENTS.md`'s fourth exclusion.
     */
    expect(judgeAffordability(65, 25_000).spendableMinorUnits, 'the grant plus the first rung').toBe(26_250);
    expect(
      judgeAffordability(65, 25_000, TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS).spendableMinorUnits,
      'the grant plus the whole facility, which is what the FUNDS chip still shows',
    ).toBe(27_500);
  });

  /**
   * **The owner's ruling 18 of 2026-08-31 needs this verdict to say *why*, and
   * until it did the interface could not tell the two cases apart at all.**
   *
   * The ruling gives a charge that would cross the floor its own sentence --
   * *"that would go past what the state will carry"* -- against the generic
   * *"the purchase was refused and no money was spent"* every other host
   * refusal reads. One boolean cannot choose between them, so the branch that
   * decided is now named.
   *
   * **And the finding underneath it, which is worth more than the field:** with
   * a facility open there is no second money refusal to distinguish it from.
   * `refused` is `balance - charge < floor`, so *every* money refusal is a
   * floor crossing; "the money ran out" and "a limit was reached" are the same
   * event, and what the generic sentence is left covering is the refusals that
   * are not about money -- no session, an item nothing sells, a malformed
   * charge. That is why the vocabulary has two members and not three.
   */
  it('names the branch that refused, so a sentence can be chosen for it', () => {
    expect(judgeAffordability(65, 25_000).refusal, 'affordable names no branch').toBeUndefined();
    // 2,500 / 2,501 before ruling 19; the rung is what the press meets now.
    expect(judgeAffordability(1_250, 0).refusal, 'the whole first rung, exactly').toBeUndefined();

    expect(judgeAffordability(1_251, 0).refusal).toBe('past-the-floor');
    expect(judgeAffordability(1, PRESS_FLOOR).refusal, 'one unit past a balance already at the rung').toBe(
      'past-the-floor',
    );

    /*
     * **A malformed charge is not the state declining to carry it**, and this
     * is the assertion that keeps the new sentence honest: a quantity that
     * arrived as `NaN` is a defect on this thread, and telling the player the
     * state will not carry it would be a statement about the prison's finances
     * that is false. It falls back to the generic refusal.
     */
    for (const charge of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) {
      expect(judgeAffordability(charge, 25_000).refusal, `charge ${String(charge)}`).toBe('malformed-charge');
    }

    // `refused` is exactly "a branch refused", so no caller can read one field
    // and the other and get two different answers.
    for (const balance of [-2_500, -1_250, -1, 0, 40, 25_000]) {
      for (const charge of [-1, 0, 1, 65, 1_250, 2_500, 26_250, 26_251, 27_500, Number.NaN]) {
        const verdict = judgeAffordability(charge, balance);
        expect(verdict.refused, `charge ${String(charge)} against ${String(balance)}`).toBe(
          verdict.refusal !== undefined,
        );
      }
    }
  });

  it('calls a refusal at a floor of zero the same branch, because it is the same comparison', () => {
    /*
     * A bare `new Treasury()` has no facility, so "past the floor" there means
     * the money ran out. The branch is the same one and is named the same, and
     * the *sentence* is not this module's to choose: `src/main.ts` composes its
     * charges against the shipped constant, so the case a player can reach
     * always has the facility open. Recorded rather than special-cased, because
     * a reason that changed meaning with the floor would be a reason a caller
     * could not map to a string.
     */
    expect(judgeAffordability(1, 0, 0).refusal).toBe('past-the-floor');
    expect(judgeAffordability(0, 0, 0).refusal).toBeUndefined();
  });

  it('refuses a charge that is not a non-negative safe integer, in either direction', () => {
    /*
     * `canAfford`'s other two terms. Nothing in `src/main.ts` composes such a
     * charge -- both come from the catalogue -- and refusing is the answer that
     * cannot send a command the schema would reject. A `-1` accepted here would
     * be a purchase that credits the prison.
     */
    for (const charge of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) {
      expect(judgeAffordability(charge, 25_000).refused, `charge ${String(charge)}`).toBe(true);
    }
    expect(judgeAffordability(-1, 25_000, 0).refused, 'and at a floor of zero as well').toBe(true);
  });
});
