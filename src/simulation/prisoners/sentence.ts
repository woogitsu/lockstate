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
 * is settled; **the bounds below are not, and are a proposal for review** in
 * exactly the sense `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` and
 * `DEFAULT_ASSAULT_POLICY` carry -- directional numbers, standing until the
 * owner replaces them, and ADR 0017 decision 5 keeps balance values out of
 * ADRs and in the code beside their derivation.
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
 * **Proposed, not settled** -- see the module comment. The derivation, against
 * numbers measured on this tree rather than assumed:
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
 * the other four are served by a furnished cell and a canteen. They are the
 * needs the withholding schedule exists to charge for, and at the old fixed
 * 10,000 ticks **neither could ever be charged**: the prisoner left before
 * either crossed.
 *
 * Crossing is not enough on its own. `StateIncomeSystem` samples once a day,
 * at `tick % DAY_LENGTH_TICKS === DAY_LENGTH_TICKS - 1`, and only for a
 * prisoner still holding an occupied place -- so the sentence has to outlast
 * the *first day boundary after* the crossing, which is up to a further
 * `DAY_LENGTH_TICKS`. That makes 5.24 days the floor at which `hygiene` can
 * cost anything and 6.65 the floor at which `recreation` can, and it is why
 * the bounds below are stated in whole days and not in a round number of
 * ticks.
 *
 * - **The minimum, 2 days (4,800 ticks).** Short, and deliberately shorter than
 *   the old constant: a prison that never turns anybody over is the ratchet ADR
 *   0050 removed, and a batch of arrivals that all leave together is what
 *   `PrisonerRosterPage.everAdmitted` was added to disambiguate. Two days is
 *   still two full grant payments and roughly 250 reconsideration cycles, so a
 *   short-sentence prisoner is a person who lived in the prison, not a
 *   flicker.
 * - **The maximum, 16 days (38,400 ticks).** Twice the 8-day mark, which is
 *   what makes the tail bite rather than merely qualify: at 16 days `hygiene`
 *   is unmet for 11.8 of them and `recreation` for 10.3, so a neglected
 *   long-sentence prisoner costs the prison 40 a day on each for most of their
 *   stay instead of on one boundary at the very end.
 * - **Uniform over the 15 whole-day values.** 11 of the 15 (73%) are longer
 *   than 13,600 ticks, which is the share the owner's decision asks for;
 *   12 of 15 can reach the `hygiene` threshold and 10 of 15 the `recreation`
 *   one. A skewed draw -- many short sentences, a thin long tail -- is more
 *   like a real remand population and is the obvious alternative; it is not
 *   taken here because it needs a shape nobody has picked, and uniform is the
 *   distribution whose consequences can be read straight off the table above.
 * - **Whole days rather than arbitrary ticks**, so the unit the draw speaks is
 *   the unit the income boundary, the regime timetable and
 *   `CLASSIFICATION_REVIEW_INTERVAL_TICKS` all speak, and so a change to
 *   `DAY_LENGTH_TICKS` -- itself *"a candidate value, not a locked balance
 *   decision"* -- carries sentences with it instead of silently reshaping
 *   them.
 * - **Far below `LONG_SENTENCE_THRESHOLD_TICKS`** (200,000, in
 *   `classification.ts`), which is load-bearing rather than incidental: that
 *   threshold is the one place `classifyPrisoner` reads the sentence, so a
 *   range entirely below it leaves every risk tier this game has ever drawn
 *   from a given seed **bit-identical**. A range that crossed it would couple
 *   sentence length to classification -- arguably a good mechanic, and a
 *   different decision, taken deliberately or not at all.
 */
export const MIN_SENTENCE_DAYS = 2;
export const MAX_SENTENCE_DAYS = 16;

/** The bounds above in ticks, derived rather than authored twice. */
export const MIN_SENTENCE_LENGTH_TICKS = MIN_SENTENCE_DAYS * DAY_LENGTH_TICKS;
export const MAX_SENTENCE_LENGTH_TICKS_DRAWN = MAX_SENTENCE_DAYS * DAY_LENGTH_TICKS;

/**
 * One sentence, in ticks, from the stream the caller hands over.
 *
 * Exactly one `nextInt` per call, and never a `nextFloat` scaled into a range:
 * `nextInt` rejects the unrepresentable tail of the uint32 space
 * (`Xoshiro128StarStar.nextInt`'s `limit` loop), so the 15 outcomes are
 * equally likely rather than 14 of them being very slightly more likely than
 * the fifteenth. One draw also means a caller can reason about how far the
 * stream advanced per admission without reading this body.
 */
export function drawSentenceLengthTicks(rng: Xoshiro128StarStar): number {
  return (MIN_SENTENCE_DAYS + rng.nextInt(MAX_SENTENCE_DAYS - MIN_SENTENCE_DAYS + 1)) * DAY_LENGTH_TICKS;
}
