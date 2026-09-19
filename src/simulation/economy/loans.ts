import { DAY_LENGTH_TICKS } from '../prisoners/regime';
import type { Treasury } from './treasury';

/**
 * Borrowing, and paying it back out of what arrives.
 *
 * [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 2's second half. The first half is `Treasury`'s: the balance may go
 * negative and nothing ends the session. This is the instrument that decision
 * calls *"not a nice-to-have beside the ladder … what keeps decision 8
 * honest"*, because without a way back up a prison can fall for ever, which is
 * the hard lock again in slower clothes.
 *
 * ## The shape is the owner's, ruled on 2026-08-29, and is not this module's
 *
 * Quoted rather than paraphrased, because every branch below implements one
 * clause of it:
 *
 * > a loan is repaid by **diverting a fixed percentage of positive inflows** —
 * > state payments, grants, contract rewards — until principal plus a **fixed
 * > fee** is cleared. **There is no fixed daily instalment.**
 *
 * with the reason on the record: a fixed instalment billed against an
 * already-insolvent prison drives it further under with nothing the player can
 * do to stop it, which is a loss condition reached by arithmetic, and ADR 0017
 * decision 8 refused a loss condition. **A repayment that takes a share of
 * what arrives cannot bill a prison that is earning nothing**, and that
 * property is the whole of why `divert` is called from an inflow rather than
 * from a schedule.
 *
 * The two named mitigations are the other two members of `LoanTerms`: a
 * **fixed fee rather than compounding interest**, so the total is known at
 * drawdown, and a **maximum duration after which the diversion rate rises**.
 *
 * ## What this module deliberately does not hold
 *
 * **No magnitudes.** The diversion percentage, the fee and the duration are
 * [#29](https://github.com/matmaxalez/lockstate/issues/29)'s under ADR 0017
 * decision 5, and ADR 0075 names them as the reason its own weakest claim
 * stands: *"recovery from any reachable position remains unproved until those
 * numbers exist."* So `LoanTerms` is a parameter and there is no default
 * anywhere in `src/`. The candidate triples that have been *priced* against a
 * real locked prison, and what each costs a player in in-game days, are in
 * `docs/research/2026-08-30-pricing-the-way-out.md`; the choice between them
 * is the owner's.
 *
 * **Three of the four have since been chosen and the fourth was never asked
 * for.** The owner's ruling 10 of 2026-08-31 on
 * [#703](https://github.com/matmaxalez/lockstate/issues/703) sets the diversion
 * at **25%**, the fee at **15%** and the duration at **45 in-game days** --
 * which is that research record's candidate C. It says nothing about
 * `escalatedDiversionRateBasisPoints`, because nobody put it to them, so the
 * step this class implements still has no ruled magnitude and there is still no
 * default here.
 * [ADR 0083](../../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * measures what the step is worth at the ruled terms -- below about 30% it
 * removes single days from a tail of a hundred -- and proposes 50% (*"the
 * diversion doubles"*, which halves the remaining repayment time) with 45% as
 * the priced alternative. It proposes rather than sets, because ADR 0017
 * decision 5 reserves the magnitude and two values are defensible.
 *
 * **The fourth has now been ruled as well, and the paragraph above is kept
 * because it is what the ADR was written under.** The owner chose **50%
 * (5,000 basis points)** on 2026-08-31 -- *"the diversion doubles"* -- over the
 * priced 45%, recorded in ADR 0083 §3. Two values were defensible and one is
 * now chosen, so ADR 0017 decision 5's reservation is satisfied by a ruling
 * rather than bypassed.
 *
 * **It is a recorded magnitude and not a default, and that is deliberate.**
 * There is still no `LoanTerms` value anywhere in `src/`: ruling 10 chose the
 * loan's *terms* and left the loan itself **disabled**, `LoanBook` is built
 * only when `options.loanTerms !== undefined`
 * (`src/simulation/runtime/new-session.ts`) and nothing in `src/` passes it, so
 * no session has a ledger at all. Wiring one is a separate piece of work that
 * needs the control, the refusal sentence and the readout ADR 0075 decision 2
 * names -- all of which are the owner's copy under `AGENTS.md` -- plus the save
 * section this module calls a gap below. The four ruled numbers are therefore
 * written down here, where `LoanTerms` declares its members, so that whoever
 * enables it does not have to re-derive them:
 *
 * | member | ruled value | basis points |
 * | --- | --- | --- |
 * | `diversionRateBasisPoints` | 25% | 2,500 |
 * | `feeRateBasisPoints` | 15% | 1,500 |
 * | `maximumDurationDays` | 45 in-game days | -- |
 * | `escalatedDiversionRateBasisPoints` | **50%** | **5,000** |
 *
 * **No command and no interface.** A player-facing loan needs a control, a
 * refusal sentence and a readout that keeps a drawdown distinguishable from
 * income, and `AGENTS.md` reserves that copy to the owner. Nothing here is
 * reachable from `simulationCommandSchema`; the measurement drives `draw`
 * directly.
 *
 * **No persistence yet, and this one is a gap rather than a boundary.**
 * ADR 0075's consequences say it plainly — *"outstanding principal has to
 * survive a save or a player reloads out of their debt"* — and `snapshot`
 * and `restore` below exist so that whoever adds the save section has
 * something to call. Adding it is a save-format change and is named as such
 * in the research record rather than smuggled in here.
 *
 * ## Integers, for the reason `Treasury` already gives
 *
 * Rates are basis points and every product is floored or ceiled to an integer,
 * because a fractional currency would put a float into state
 * `docs/DETERMINISM.md`'s fingerprint hashes, and floating-point addition is
 * not associative. The rounding direction is stated at each site: the fee
 * rounds **up** so the prison never gains a minor unit from a rounding, and a
 * diversion rounds **down** so it never takes one the terms do not entitle it
 * to.
 */

/** One hundred per cent, in the basis points every rate below is expressed in. */
export const BASIS_POINTS_PER_UNIT = 10_000;

export interface LoanTerms {
  /**
   * The share of every positive inflow that goes to the debt instead of to the
   * treasury, in basis points.
   */
  readonly diversionRateBasisPoints: number;
  /**
   * The fixed fee, in basis points of the principal, charged once at drawdown.
   *
   * Fixed rather than compounding is ADR 0075 decision 2's first named
   * mitigation, and its stated purpose is that **the total is known at
   * drawdown** — so this is applied exactly once, in `draw`, and nothing in
   * this class touches `outstanding` upward afterwards.
   */
  readonly feeRateBasisPoints: number;
  /**
   * How many in-game days the diversion runs at `diversionRateBasisPoints`
   * before rising to `escalatedDiversionRateBasisPoints`.
   *
   * ADR 0075 decision 2's second named mitigation, against the accepted cost
   * that *"revenue-share debt feels nearly free while income is low and can
   * linger a long time."*
   */
  readonly maximumDurationDays: number;
  /**
   * What the diversion rises to once `maximumDurationDays` have passed since
   * drawdown.
   *
   * **Ruled at 5,000 basis points -- 50%, *"the diversion doubles"* -- on
   * 2026-08-31 (#703, ADR 0083 §3), and not set as a default here.** It is the
   * one member of the four that was never put to the owner with the other
   * three, and it is the one whose value is hardest to argue from feel: at or
   * below 30% the step is decoration (26% removes two days from a 128-day
   * tail), while 50% halves the remaining repayment time exactly -- measured
   * against the real `LoanBook` and the real `StateIncomeSystem`, not derived
   * on paper.
   *
   * There is no default because **the loan is still disabled**: see this
   * module's docblock for why the four ruled numbers are recorded rather than
   * wired. The sweep the 50% comes from is ADR 0083 §(c)'s table -- three
   * principals against seven escalated rates -- and
   * `scripts/report-loan-recovery-pricing.mjs` §7 is the committed instrument
   * for the half of it that asks whether the duration bites at all.
   */
  readonly escalatedDiversionRateBasisPoints: number;
}

export interface LoanSnapshot {
  /** Principal plus fee, less everything diverted so far. `0` when nothing is owed. */
  readonly outstandingMinorUnits: number;
  /** What was handed over at drawdown, kept so a readout can say what the fee was. */
  readonly principalMinorUnits: number;
  /** The tick `draw` credited on, which is what `maximumDurationDays` is measured from. `null` while no loan is open. */
  readonly drawnAtTick: number | null;
}

function assertBasisPoints(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > BASIS_POINTS_PER_UNIT) {
    throw new RangeError(`${label} must be an integer between 0 and ${BASIS_POINTS_PER_UNIT} basis points.`);
  }
}

export class LoanBook {
  private outstanding = 0;
  private principal = 0;
  private drawnAt: number | null = null;
  private divertedTotal = 0;

  public constructor(
    private readonly treasury: Treasury,
    private readonly terms: LoanTerms,
  ) {
    assertBasisPoints(terms.diversionRateBasisPoints, 'A diversion rate');
    assertBasisPoints(terms.feeRateBasisPoints, 'A fee rate');
    assertBasisPoints(terms.escalatedDiversionRateBasisPoints, 'An escalated diversion rate');
    if (!Number.isSafeInteger(terms.maximumDurationDays) || terms.maximumDurationDays < 0) {
      throw new RangeError('A maximum duration must be a non-negative whole number of in-game days.');
    }
  }

  public get outstandingMinorUnits(): number {
    return this.outstanding;
  }

  public get principalMinorUnits(): number {
    return this.principal;
  }

  public get drawnAtTick(): number | null {
    return this.drawnAt;
  }

  /**
   * Everything this book has taken out of inflows since drawdown.
   *
   * Kept because ADR 0075 decision 2 requires a loan to stay legible beside
   * operating income: without this figure a player watching the balance rise
   * more slowly than the prison earns has no way to see where the difference
   * went.
   */
  public get divertedTotalMinorUnits(): number {
    return this.divertedTotal;
  }

  /** The fee a loan of this size would carry, at these terms. A read: it touches nothing. */
  public feeFor(principalMinorUnits: number): number {
    // Ceiling, so a rounding never hands the prison a fraction of a minor unit
    // it did not earn.
    return Math.ceil((principalMinorUnits * this.terms.feeRateBasisPoints) / BASIS_POINTS_PER_UNIT);
  }

  /**
   * Takes a loan: the principal reaches the treasury now, principal plus fee
   * is what has to be cleared.
   *
   * Refuses a second loan while one is outstanding, and refuses a
   * non-positive or unsafe principal. One loan at a time is the simplest
   * thing that can be measured and is **not** a decision about whether a
   * prison may hold two; that is #29's along with the ceiling.
   */
  public draw(principalMinorUnits: number, tick: number): boolean {
    if (this.outstanding > 0) return false;
    if (!Number.isSafeInteger(principalMinorUnits) || principalMinorUnits <= 0) return false;
    const total = principalMinorUnits + this.feeFor(principalMinorUnits);
    if (!Number.isSafeInteger(total)) return false;
    this.principal = principalMinorUnits;
    this.outstanding = total;
    this.drawnAt = tick;
    this.divertedTotal = 0;
    this.treasury.credit(principalMinorUnits);
    return true;
  }

  /**
   * What share of an inflow the debt takes at this tick.
   *
   * The escalation is a step and not a ramp: below the duration the base rate,
   * at or past it the escalated one. A ramp would be a second magnitude to
   * choose and ADR 0075 names one.
   */
  public diversionRateBasisPointsAt(tick: number): number {
    if (this.outstanding === 0 || this.drawnAt === null) return 0;
    const elapsedDays = Math.floor((tick - this.drawnAt) / DAY_LENGTH_TICKS);
    return elapsedDays >= this.terms.maximumDurationDays
      ? this.terms.escalatedDiversionRateBasisPoints
      : this.terms.diversionRateBasisPoints;
  }

  /**
   * Takes the debt's share of one positive inflow and returns it, leaving the
   * caller to credit the remainder.
   *
   * The caller credits rather than this method, so that the two halves of an
   * income payment — what the prison keeps and what the debt took — are
   * separable at the one place that knows they were one payment. That is what
   * decision 2's *"reported separately from operating income"* needs, and a
   * `divert` that credited the difference itself would have thrown it away.
   */
  public divert(inflowMinorUnits: number, tick: number): number {
    if (this.outstanding === 0) return 0;
    if (!Number.isSafeInteger(inflowMinorUnits) || inflowMinorUnits <= 0) return 0;
    const rate = this.diversionRateBasisPointsAt(tick);
    // Floor, so the diversion never takes a minor unit the rate does not
    // entitle it to. The cost is that a rate small enough to floor to zero
    // against a small inflow takes nothing at all, which is a real property of
    // these terms and is measured rather than papered over.
    const share = Math.floor((inflowMinorUnits * rate) / BASIS_POINTS_PER_UNIT);
    const taken = Math.min(share, this.outstanding);
    this.outstanding -= taken;
    this.divertedTotal += taken;
    return taken;
  }

  public snapshot(): LoanSnapshot {
    return {
      outstandingMinorUnits: this.outstanding,
      principalMinorUnits: this.principal,
      drawnAtTick: this.drawnAt,
    };
  }

  public restore(snapshot: LoanSnapshot): void {
    if (!Number.isSafeInteger(snapshot.outstandingMinorUnits) || snapshot.outstandingMinorUnits < 0) {
      throw new RangeError('A restored loan balance must be a non-negative safe integer of minor units.');
    }
    if (!Number.isSafeInteger(snapshot.principalMinorUnits) || snapshot.principalMinorUnits < 0) {
      throw new RangeError('A restored loan principal must be a non-negative safe integer of minor units.');
    }
    if (snapshot.drawnAtTick !== null && (!Number.isSafeInteger(snapshot.drawnAtTick) || snapshot.drawnAtTick < 0)) {
      throw new RangeError('A restored loan drawdown tick must be null or a non-negative safe integer.');
    }
    this.outstanding = snapshot.outstandingMinorUnits;
    this.principal = snapshot.principalMinorUnits;
    this.drawnAt = snapshot.drawnAtTick;
    this.divertedTotal = 0;
  }
}
