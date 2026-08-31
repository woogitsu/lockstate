import { describe, expect, it } from 'vitest';
import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS } from '../../src/simulation/economy';
import { judgeAffordability } from '../../src/ui/affordability';

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

describe('judgeAffordability: the one comparison the host makes about money', () => {
  it('is the same boundary `Treasury.canAfford` decides, to the minor unit', () => {
    expect(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, '#703 ruling A: one tenth of the opening grant').toBe(FLOOR);

    // A prison at zero can still spend the whole facility, and not one unit more.
    expect(judgeAffordability(2_500, 0).refused).toBe(false);
    expect(judgeAffordability(2_501, 0).refused).toBe(true);

    // And from a balance already under water, the room left is what decides.
    expect(judgeAffordability(20, -2_480).refused).toBe(false);
    expect(judgeAffordability(21, -2_480).refused).toBe(true);
    expect(judgeAffordability(0, FLOOR), 'buying nothing at the floor is legal').toMatchObject({ refused: false });
    expect(judgeAffordability(1, FLOOR).refused).toBe(true);
  });

  /**
   * The regression the extraction exists for, stated as its own case: these are
   * the presses the inline `total > balance` would have refused and the
   * simulation would have accepted.
   */
  it('accepts the presses the pre-ruling comparison would have refused', () => {
    for (const [charge, balance] of [[65, 40], [80, 0], [40, -1_000], [65, -2_435]] as const) {
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
    expect(judgeAffordability(65, -2_480)).toEqual({
      refused: true,
      chargeMinorUnits: 65,
      balanceMinorUnits: -2_480,
      spendableMinorUnits: 20,
    });
    expect(judgeAffordability(65, 25_000).spendableMinorUnits, 'the grant plus the facility').toBe(27_500);
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
