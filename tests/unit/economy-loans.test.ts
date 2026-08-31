import { describe, expect, it } from 'vitest';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { BASIS_POINTS_PER_UNIT, LoanBook, Treasury, type LoanTerms } from '../../src/simulation/economy';

/**
 * [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 2's loan, in isolation: the fee is charged once, the diversion
 * takes a share of an inflow rather than billing a schedule, and the maximum
 * duration raises the share.
 *
 * **No figure below is a chosen magnitude.** Every rate here is a fixture
 * value picked so the arithmetic is checkable by eye — 5,000 basis points is
 * half, 1,000 is a tenth — and the terms a session should actually ship are
 * [#29](https://github.com/matmaxalez/lockstate/issues/29)'s. What is being
 * pinned is the *shape* the owner ruled on: a fixed percentage of positive
 * inflows, a fixed fee rather than compounding interest, and a duration after
 * which the percentage rises.
 *
 * **Every expected value is a literal, never a figure read back off the class
 * under test** (`docs/TESTING.md`): a fee computed by calling `feeFor` and
 * then compared against `outstandingMinorUnits` would agree with any fee.
 */

/** Half of every inflow, a tenth of the principal as the fee, escalating to three quarters after 10 days. */
const TERMS: LoanTerms = {
  diversionRateBasisPoints: 5_000,
  feeRateBasisPoints: 1_000,
  maximumDurationDays: 10,
  escalatedDiversionRateBasisPoints: 7_500,
};

const bookAt = (balance: number, terms: LoanTerms = TERMS): { treasury: Treasury; loans: LoanBook } => {
  const treasury = new Treasury(balance);
  return { treasury, loans: new LoanBook(treasury, terms) };
};

describe('LoanBook: what a drawdown costs and how it is repaid', () => {
  it('hands over the principal and owes principal plus the fixed fee', () => {
    const { treasury, loans } = bookAt(40);

    expect(loans.draw(1_000, 0)).toBe(true);
    // 1,000 in the hand on top of the 40 that was there.
    expect(treasury.balanceMinorUnits).toBe(1_040);
    // 1,000 + 10% = 1,100, known at drawdown and never rising again.
    expect(loans.outstandingMinorUnits).toBe(1_100);
    expect(loans.principalMinorUnits).toBe(1_000);
    expect(loans.drawnAtTick).toBe(0);
  });

  it('never adds to the debt after drawdown, however long it is held', () => {
    /*
     * The fixed-fee mitigation, stated as the property that separates it from
     * interest: ADR 0075 decision 2 chose a fixed fee *"so the total is known
     * at drawdown"*. A hundred in-game days of holding the debt, with the
     * diversion asked for its rate on every one of them, must leave the figure
     * exactly where the draw left it.
     */
    const { loans } = bookAt(0);
    loans.draw(1_000, 0);

    for (let day = 1; day <= 100; day += 1) loans.diversionRateBasisPointsAt(day * DAY_LENGTH_TICKS);

    expect(loans.outstandingMinorUnits, 'a fixed fee is charged once, not per day').toBe(1_100);
  });

  it('takes its share of an inflow and leaves the rest to the caller', () => {
    const { treasury, loans } = bookAt(0);
    loans.draw(1_000, 0);

    // Half of 300, at the fixture rate.
    expect(loans.divert(300, 0)).toBe(150);
    expect(loans.outstandingMinorUnits).toBe(950);
    expect(loans.divertedTotalMinorUnits).toBe(150);
    // And the diversion credited nothing of its own: the balance still holds
    // exactly the principal the drawdown put there, because crediting the
    // remainder is the caller's, so that a readout can tell the two halves of
    // one payment apart.
    expect(treasury.balanceMinorUnits).toBe(1_000);
  });

  it('takes nothing at all from a prison that earns nothing', () => {
    /*
     * The reason the owner ruled out a fixed daily instalment, as a
     * measurement: *"a repayment that takes a share of what arrives cannot
     * bill a prison that is earning nothing."* This is the assertion that a
     * loss condition reached by arithmetic is not reachable here.
     */
    const { loans } = bookAt(0);
    loans.draw(1_000, 0);

    expect(loans.divert(0, 0)).toBe(0);
    expect(loans.divert(-1, 0)).toBe(0);
    expect(loans.outstandingMinorUnits, 'an empty prison owes exactly what it owed').toBe(1_100);
  });

  it('takes the last instalment short rather than overshooting the debt', () => {
    const { loans } = bookAt(0);
    loans.draw(100, 0);
    expect(loans.outstandingMinorUnits).toBe(110);

    // Half of 1,000 is 500, and only 110 is owed.
    expect(loans.divert(1_000, 0)).toBe(110);
    expect(loans.outstandingMinorUnits).toBe(0);
    // Cleared: a further inflow is the prison's entirely.
    expect(loans.divert(1_000, 0)).toBe(0);
  });

  it('rounds a diversion down and a fee up, so neither side gains a minor unit', () => {
    const { loans } = bookAt(0, { ...TERMS, feeRateBasisPoints: 1, diversionRateBasisPoints: 1 });

    // 1 basis point of 1,001 is 0.1001, and the fee rounds up to 1.
    expect(loans.draw(1_001, 0)).toBe(true);
    expect(loans.outstandingMinorUnits).toBe(1_002);
    // 1 basis point of 9,999 is 0.9999, and a diversion rounds down to 0.
    expect(loans.divert(9_999, 0)).toBe(0);
    expect(loans.outstandingMinorUnits).toBe(1_002);
  });

  it('raises the share once the maximum duration has passed, and not a day before', () => {
    /*
     * The second named mitigation. The boundary is asserted from both sides
     * because a `>` for a `>=` moves it by a whole in-game day, and a day is
     * 2,400 ticks of a player watching.
     */
    const { loans } = bookAt(0);
    loans.draw(1_000, 0);

    expect(loans.diversionRateBasisPointsAt(9 * DAY_LENGTH_TICKS)).toBe(5_000);
    expect(loans.diversionRateBasisPointsAt(10 * DAY_LENGTH_TICKS - 1)).toBe(5_000);
    expect(loans.diversionRateBasisPointsAt(10 * DAY_LENGTH_TICKS)).toBe(7_500);
    // And the escalated rate is what a diversion on that day actually takes.
    expect(loans.divert(400, 10 * DAY_LENGTH_TICKS)).toBe(300);
  });

  it('measures the duration from the drawdown and not from tick zero', () => {
    // A prison that borrows on day 30 has its whole duration ahead of it.
    const { loans } = bookAt(0);
    loans.draw(1_000, 30 * DAY_LENGTH_TICKS);

    expect(loans.diversionRateBasisPointsAt(39 * DAY_LENGTH_TICKS)).toBe(5_000);
    expect(loans.diversionRateBasisPointsAt(40 * DAY_LENGTH_TICKS)).toBe(7_500);
  });

  it('has no share of anything while nothing is owed', () => {
    const { loans } = bookAt(0);

    expect(loans.diversionRateBasisPointsAt(0)).toBe(0);
    expect(loans.divert(1_000, 0)).toBe(0);
  });

  it('refuses a second loan while one is outstanding, and takes one once it is cleared', () => {
    const { treasury, loans } = bookAt(0);
    loans.draw(100, 0);

    expect(loans.draw(100, 0), 'one loan at a time').toBe(false);
    expect(treasury.balanceMinorUnits, 'and the refusal cost nothing').toBe(100);

    loans.divert(1_000, 0);
    expect(loans.outstandingMinorUnits).toBe(0);
    expect(loans.draw(100, 5), 'a cleared debt is borrowable against again').toBe(true);
    expect(loans.drawnAtTick, 'and the new duration runs from the new drawdown').toBe(5);
  });

  it('refuses a principal that is not a positive safe integer', () => {
    const { treasury, loans } = bookAt(0);

    expect(loans.draw(0, 0)).toBe(false);
    expect(loans.draw(-100, 0)).toBe(false);
    expect(loans.draw(0.5, 0)).toBe(false);
    expect(loans.draw(Number.NaN, 0)).toBe(false);
    expect(treasury.balanceMinorUnits).toBe(0);
    expect(loans.outstandingMinorUnits).toBe(0);
  });

  it('refuses terms outside the basis-point range rather than silently clamping', () => {
    const treasury = new Treasury(0);

    expect(() => new LoanBook(treasury, { ...TERMS, diversionRateBasisPoints: BASIS_POINTS_PER_UNIT + 1 })).toThrow(RangeError);
    expect(() => new LoanBook(treasury, { ...TERMS, feeRateBasisPoints: -1 })).toThrow(RangeError);
    expect(() => new LoanBook(treasury, { ...TERMS, escalatedDiversionRateBasisPoints: 10.5 })).toThrow(RangeError);
    expect(() => new LoanBook(treasury, { ...TERMS, maximumDurationDays: -1 })).toThrow(RangeError);
  });

  it('carries the debt through a snapshot and back', () => {
    /*
     * ADR 0075's consequences: *"outstanding principal has to survive a save
     * or a player reloads out of their debt."* This pins the pair that makes
     * that possible. **It does not pin that a save carries it** -- no save
     * section holds a loan yet, and adding one is a save-format change.
     */
    const { loans } = bookAt(0);
    loans.draw(1_000, 7);
    loans.divert(200, 7);

    const restored = new LoanBook(new Treasury(0), TERMS);
    restored.restore(loans.snapshot());

    expect(restored.outstandingMinorUnits).toBe(1_000);
    expect(restored.principalMinorUnits).toBe(1_000);
    expect(restored.drawnAtTick).toBe(7);
  });

  it('refuses a restored loan that is not a whole non-negative figure', () => {
    const { loans } = bookAt(0);

    expect(() => loans.restore({ outstandingMinorUnits: -1, principalMinorUnits: 0, drawnAtTick: null })).toThrow(RangeError);
    expect(() => loans.restore({ outstandingMinorUnits: 0, principalMinorUnits: 0.5, drawnAtTick: null })).toThrow(RangeError);
    expect(() => loans.restore({ outstandingMinorUnits: 0, principalMinorUnits: 0, drawnAtTick: -1 })).toThrow(RangeError);
  });
});
