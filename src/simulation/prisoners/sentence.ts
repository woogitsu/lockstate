import { DAY_LENGTH_TICKS } from './regime';
import type { Xoshiro128StarStar } from '../rng/xoshiro128starstar';

/**
 * How long a prisoner is held for, drawn at intake (issue #535 decision 5).
 *
 * ## What the owner decided, and what is left here
 *
 * The owner's call, recorded in #535 decision 5, is one sentence: *"sentences
 * are drawn from a range at admission, with some clearly longer than 13,600
 * ticks."* A single longer constant, a player-chosen sentence and leaving
 * 10,000 alone were each offered and each rejected. So *that* there is a range
 * came from there.
 *
 * **This paragraph used to continue "the bounds below are not [settled], and
 * are a proposal for review", and that is no longer true.** The bounds are
 * settled: the owner ruled on
 * [#593](https://github.com/matmaxalez/lockstate/issues/593) on 2026-08-30
 * that a sentence is 14 to 90 in-game days, and the ruling is recorded in
 * [ADR 0079](../../../docs/adr/0079-a-sentence-long-enough-to-be-a-history.md).
 * The old standing is kept in view rather than deleted because it is what the
 * derivation below was written under, and because ADR 0017 decision 5 still
 * governs *where* the numbers live: balance values stay out of ADRs and in the
 * code beside their derivation, which is why the arithmetic is here and the
 * decision is there.
 *
 * ## Why the draw is here and not in `src/main.ts`
 *
 * `ADMISSION_REQUEST` used to hand the worker a hard-coded `10_000` and its
 * own comment said why it could not do anything else: *"`Math.random` on this
 * thread would make two runs of the same seed produce different prisoners,
 * which is exactly what `docs/DETERMINISM.md` forbids."* That reasoning is
 * right and it rules out a main-thread draw of any kind, seeded or not -- the
 * seed the simulation is reproducible from lives in the worker
 * (`createNewSimulationRuntime`'s `masterSeed`), and a composition root that
 * drew its own numbers would be deciding simulation state on the main thread,
 * which is the thing `admitPrisonerSchema`'s own comment already refuses for
 * the risk tier and the prisoner's name.
 *
 * So the draw is where those two are: inside `IntakeSystem`, at the
 * `classification` stage, from a named stream. See that method for the tick
 * ordering that makes the draw order a function of state rather than of the
 * order a player happened to press Admit.
 */

/** The stream sentence lengths are drawn from. Registered by `createNewSimulationRuntime`; `NamedRngStreams.get` throws for a session that did not. */
export const PRISONER_SENTENCE_RNG_STREAM = 'prisoners.sentence';

/**
 * What a `PrisonerRecordComponent.sentenceLengthTicks` slot reads when the
 * admission did not name a length.
 *
 * `0` rather than a new flag, for the reason `sentenceEndTick` and
 * `solitarySanctionEndTick` both already give in `components.ts`: it is what a
 * never-occupied slot holds and what `records.reset` restores, and no legal
 * sentence is zero -- `admitPrisonerSchema` requires `.positive()` of the
 * length it *does* carry. So "no length was named" and "this slot has not been
 * written" are the same fact, and there is no second field that can disagree
 * with the first.
 */
export const SENTENCE_UNSET_TICKS = 0;

/**
 * The shortest and longest sentence the draw can produce, in whole in-game
 * days.
 *
 * ## Settled by the owner on 2026-08-30, and what that replaced
 *
 * This block opened **"Proposed, not settled"** and proposed `[2, 16]` days.
 * The owner ruled on
 * [#593](https://github.com/matmaxalez/lockstate/issues/593) that sentences
 * become **14 to 90 days**, having first asked how long an in-game day is in
 * real time and been answered at the constants: a tick is 50 ms
 * (`state-machine.ts`) and a day is `DAY_LENGTH_TICKS` = 2,400, so **one
 * in-game day is two real minutes at x1**. The old range was therefore a
 * sentence of between four and thirty-two real minutes, which is the whole of
 * why nothing downstream of it worked. The ruling is recorded in
 * [ADR 0079](../../../docs/adr/0079-a-sentence-long-enough-to-be-a-history.md).
 *
 * The old bounds and their derivation are kept below rather than overwritten,
 * because what they were derived *against* has not changed and because the
 * property they bought is exactly what this ruling spends.
 *
 * | | ticks | real time at x1 |
 * | --- | --- | --- |
 * | minimum, 14 days | 33,600 | 28 minutes |
 * | mean, 52 days | 124,800 | 1 h 44 m |
 * | maximum, 90 days | 216,000 | 3 hours |
 *
 * ## What the range has to clear, measured on this tree rather than assumed
 *
 * A need falls from `NEED_MAX` (255) to `STATE_INCOME_UNMET_NEED_LEVEL` (51)
 * at `NEED_DECAY_PER_TICK`, in `NeedsDecaySystem`'s ten-tick batches, from the
 * moment `admitPrisoner` resets the slot. Stepping the real `NeedsComponent`
 * through the real `decayNeed` at the real cadence, the first tick at which
 * `NeedsComponent.get` reads at or below the threshold is:
 *
 * | need | rate | first unmet tick | in days |
 * | --- | --- | --- | --- |
 * | bladder | 0.08 | 2,550 | 1.06 |
 * | hunger | 0.05 | 4,080 | 1.70 |
 * | sleep | 0.03 | 6,790 | 2.83 |
 * | **hygiene** | 0.02 | **10,180** | **4.24** |
 * | **recreation** | 0.015 | **13,570** | **5.65** |
 * | safety | 0.01 | 20,360 | 8.48 |
 *
 * The two in bold are the ones [ADR 0054](../../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
 * decision 1 rules **room-gated**: a prison with no shower room or laundry
 * cannot serve `hygiene`, and one with no yard, common room or classroom
 * cannot serve `recreation`, so those two decay to zero and stay there while
 * the other four are served by a furnished cell and a canteen.
 *
 * `StateIncomeSystem` samples once a day, at
 * `tick % DAY_LENGTH_TICKS === DAY_LENGTH_TICKS - 1`, and only for a prisoner
 * still holding an occupied place -- so a sentence has to outlast the *first
 * day boundary after* the crossing for the crossing to cost anything, which
 * made 5.24 days the floor for `hygiene` and 6.65 for `recreation`. **Under
 * `[2, 16]` those floors were the interesting edge of the range; under
 * `[14, 90]` the shortest drawable sentence clears both by more than eight
 * days**, so a neglected prison is charged for both needs on essentially every
 * day of essentially every sentence rather than on one boundary at the end of
 * a lucky draw. That is a deliberate consequence of the ruling, not a side
 * effect of it: the withholding schedule was built to be paid, and now it is.
 *
 * ## The bounds
 *
 * - **The minimum, 14 days (33,600 ticks).** Two in-game weeks, 28 real
 *   minutes at x1. It is above `CLASSIFICATION_REVIEW_INTERVAL_TICKS`
 *   (24,000), which is the point: the first review becomes *possible* for
 *   every drawable sentence rather than for seven of fifteen. It does not make
 *   the first review certain, because the review schedule is global and
 *   eligibility is per record -- see the measurement two sections down.
 * - **The maximum, 90 days (216,000 ticks).** Three in-game months, three real
 *   hours at x1, and **above `LONG_SENTENCE_THRESHOLD_TICKS`** (200,000). See
 *   the next section: crossing that threshold is the reason this number is 90
 *   and not 84 or 60.
 * - **Uniform over the 77 whole-day values.** A skewed draw -- many short
 *   sentences, a thin long tail -- is more like a real remand population and is
 *   still the obvious alternative; it is still not taken here, and for the same
 *   reason as before: it needs a shape nobody has picked, and uniform is the
 *   distribution whose consequences can be read straight off the tables here.
 * - **Whole days rather than arbitrary ticks**, so the unit the draw speaks is
 *   the unit the income boundary, the regime timetable and
 *   `CLASSIFICATION_REVIEW_INTERVAL_TICKS` all speak, and so a change to
 *   `DAY_LENGTH_TICKS` -- itself *"a candidate value, not a locked balance
 *   decision"* -- carries sentences with it instead of silently reshaping
 *   them.
 *
 * ## What this does to classification review, measured
 *
 * `ClassificationReviewSystem` is globally scheduled -- `intervalTicks: 24,000`,
 * `phaseTicks: 23,999` -- while eligibility is per record, so a prisoner
 * classified at `c` with sentence `s` is reviewed only when a scheduled tick
 * falls in `[c + 24,000, c + s]`. Measured by running the real system in the
 * real kernel over every drawable length at 100 arrival phases, counting each
 * prisoner's reviews and removing them at `sentenceEndTick`:
 *
 * | | old `[2, 16]` | new `[14, 90]` |
 * | --- | --- | --- |
 * | reach a first review | 14.00% | **97.27%** |
 * | reach a second | 0% | **85.06%** |
 * | mean reviews per prisoner | 0.14 | **4.20** |
 *
 * So `CLASSIFICATION_REVIEW_INTERVAL_TICKS` does **not** need to move, and is
 * not moved. What survives is the phase lottery at the bottom of the range: at
 * 14 days the window is 9,601 ticks inside a 24,000-tick period, so 40% of
 * 14-day arrivals are reviewed and **2.73% of all prisoners still get no review
 * at all**. Every length from 20 in-game days up is reviewed whatever tick it
 * arrives on, and from 30 up, twice.
 * `tests/unit/prisoners-classification-review.test.ts` pins that cross-section
 * against the real system rather than restating these figures.
 *
 * ## The threshold this range now crosses, and the sentence that said it must not
 *
 * The bullet this replaces read, in full:
 *
 * > **Far below `LONG_SENTENCE_THRESHOLD_TICKS`** (200,000, in
 * > `classification.ts`), which is load-bearing rather than incidental: that
 * > threshold is the one place `classifyPrisoner` reads the sentence, so a
 * > range entirely below it leaves every risk tier this game has ever drawn
 * > from a given seed **bit-identical**. A range that crossed it would couple
 * > sentence length to classification -- arguably a good mechanic, and a
 * > different decision, taken deliberately or not at all.
 *
 * **That is the decision the owner has now taken, deliberately.** Both halves
 * of the old sentence survive intact as statements of cost: the coupling is
 * real, and the bit-identical-tiers property is gone. What changed is that
 * `ClassificationFactors.sentence` -- dead at `0` for the whole life of this
 * game, in both `classifyPrisoner` and `reviewClassification` -- is now
 * reachable.
 *
 * **The threshold itself does not move**, and that is the narrowest change
 * that implements the ruling: 216,000 > 200,000, so the arithmetic requires
 * nothing of `classification.ts`. The consequence is worth stating rather than
 * leaving to be rediscovered: 200,000 ticks is 83.33 days, so the first whole
 * day at or above it is **84**, and **7 of the 77 drawable lengths (9.1%)**
 * carry the `+1`. A thin tail rather than a common case, which is what a
 * long-sentence tier should be.
 */
export const MIN_SENTENCE_DAYS = 14;
export const MAX_SENTENCE_DAYS = 90;

/** The bounds above in ticks, derived rather than authored twice. */
export const MIN_SENTENCE_LENGTH_TICKS = MIN_SENTENCE_DAYS * DAY_LENGTH_TICKS;
export const MAX_SENTENCE_LENGTH_TICKS_DRAWN = MAX_SENTENCE_DAYS * DAY_LENGTH_TICKS;

/**
 * One sentence, in ticks, from the stream the caller hands over.
 *
 * Exactly one `nextInt` per call, and never a `nextFloat` scaled into a range:
 * `nextInt` rejects the unrepresentable tail of the uint32 space
 * (`Xoshiro128StarStar.nextInt`'s `limit` loop), so the 77 outcomes are
 * equally likely rather than 76 of them being very slightly more likely than
 * the seventy-seventh. One draw also means a caller can reason about how far
 * the stream advanced per admission without reading this body.
 *
 * **The rejection loop does not make the draw cost a variable number of
 * `nextUint32` calls in practice, at either range.** At a bound of 15 exactly
 * one uint32 value of 2^32 was rejected; at a bound of 77 exactly four are. A
 * second iteration is therefore a 1-in-a-billion event rather than a routine
 * one, which is why widening the range moves no stream state that anybody will
 * ever observe -- what moves is the *value* the draw returns, and that is the
 * whole of why the determinism fingerprints had to be re-baselined.
 */
export function drawSentenceLengthTicks(rng: Xoshiro128StarStar): number {
  return (MIN_SENTENCE_DAYS + rng.nextInt(MAX_SENTENCE_DAYS - MIN_SENTENCE_DAYS + 1)) * DAY_LENGTH_TICKS;
}
