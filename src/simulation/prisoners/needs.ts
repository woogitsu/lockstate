import { SECTOR_COVERAGE_STATES, type SectorCoverageState } from '../security/coverage-state';

/**
 * Core, representative need set (issue #24): hunger, sleep, hygiene,
 * bladder, safety and recreation. Each is a 0-255 level -- 0 critical,
 * 255 fully satisfied -- at the API boundary, stored internally as a flat
 * `Uint16Array` per need holding that level multiplied by `NEED_SCALE`
 * (SoA, matching `src/simulation/entity/component.ts`'s existing prototype
 * components), never one allocated object per prisoner.
 */
export const NEED_IDS = ['hunger', 'sleep', 'hygiene', 'bladder', 'safety', 'recreation'] as const;
export type NeedId = (typeof NEED_IDS)[number];

export const NEED_MAX = 255;
export const NEED_MIN = 0;

/**
 * Sub-level resolution of the stored representation, in stored units per
 * whole level (issue #259).
 *
 * Why the levels are stored scaled at all: every rate in
 * `NEED_DECAY_PER_TICK` is far below one level per tick, so rounding a decay
 * step to a whole level made most of them a **fixed point** --
 * `Math.round(n - d) === n` for any integer `n` whenever `d <= 0.5`, so at
 * `NeedsDecaySystem`'s ten-tick cadence five of the six needs never moved at
 * all -- `hunger` included, whose step of exactly `0.5` fell on the boundary
 * and rounded back up, JS rounding halves away from zero. Only `bladder`, at
 * `0.8` per interval, decayed. Storing the level scaled moves the quantum
 * below every step instead of above most of them.
 *
 * Why exactly 200: it is the smallest scale at which
 * `NEED_DECAY_PER_TICK[need] * NEED_SCALE` is a whole number for *every*
 * need (the rates are all multiples of `0.005`, and `1 / 0.005 = 200`).
 * That makes decay exactly linear in `ticksElapsed` -- integer arithmetic
 * throughout, with no rounding step anywhere -- which is what lets
 * `decayNeed` keep the promise its own doc comment makes: a scenario decays
 * identically no matter how the same total of ticks is split across calls.
 * The practical consequence is that `NeedsDecaySystem.schedule.intervalTicks`
 * is a **scheduling** choice, like every other multi-rate cadence, and not a
 * balance one.
 *
 * `tests/unit/prisoners-needs.test.ts` pins both properties, so a need added
 * with a rate this scale cannot represent fails there rather than silently
 * rounding.
 */
export const NEED_SCALE = 200;

/** `NEED_MIN`/`NEED_MAX` in stored units. `NEED_MAX_SCALED` is 51,000, well inside `Uint16Array`'s 65,535. */
export const NEED_MIN_SCALED = NEED_MIN * NEED_SCALE;
export const NEED_MAX_SCALED = NEED_MAX * NEED_SCALE;

/**
 * **Why `safety` decays at 0.05 and not at 0.01.**
 * "What keeps a prisoner safe" (the ADR of that title) decision 2, issue #588,
 * and the owner's ruling on issue #599.
 *
 * The ruling separates `safety` from the other two needs a normal sentence
 * cannot finish: *"Safety is a bug. Guards exist, sectors exist, the HUD
 * already reads `Unguarded` -> `Understaffed` -> `Covered`."* What follows
 * mechanically is that coverage becomes the provisioner
 * (`SAFETY_COVERAGE_PROVISION_SCALED_PER_TICK` and `provisionSafety` below,
 * applied by `SafetyCoverageSystem`) and that
 * **"the 20,400-tick safety requirement is discarded, or demoted to a
 * long-stay accumulator"**.
 *
 * 20,400 is `204 / 0.01`: the ticks a need falling at the old rate takes to
 * cross `STATE_INCOME_UNMET_NEED_LEVEL` (51) from `NEED_MAX`
 * (`docs/research/2026-08-29-sentence-length-at-admission.md` measures the
 * batching-and-rounding correction at 20,360). Sentences were drawn from 2 to
 * 16 in-game days -- 4,800 to 38,400 ticks
 * (`src/simulation/prisoners/sentence.ts`) -- so at 0.01 more than half the
 * population left before an *entirely unguarded* prison could have cost them
 * anything, and coverage would have been an instrument with nothing on the
 * other end of it.
 *
 * **That premise is gone since the owner's 2026-08-30 ruling on
 * [#593](https://github.com/matmaxalez/lockstate/issues/593)
 * ([ADR 0079](../../../docs/adr/0079-a-sentence-long-enough-to-be-a-history.md)):
 * the range is 14 to 90 in-game days, 33,600 to 216,000 ticks, so 20,400 is
 * now inside every drawable sentence and 0.01 would have a population after
 * all.** Recorded rather than rewritten, and **no rate is changed here**: the
 * decay stays 0.05 and the provision stays 0.08. Whether ADR 0078 decision 2
 * is still the best answer at the new range is a balance question for the
 * owner, raised here and in ADR 0078's own margin rather than settled inside
 * an implementation file.
 *
 * 0.05 is `hunger`'s rate, which is this module's existing statement of "a
 * need a prison has to attend to about daily": 4,080 ticks, one and seven
 * tenths of an in-game day, from full to unmet. Every sentence outlasts it,
 * so an unguarded prison starts paying for it on the second day of every
 * prisoner's stay rather than never.
 *
 * **What did not change, deliberately.** `hygiene`'s 0.02 (10,200 ticks) and
 * `recreation`'s 0.015 (13,600) stand exactly as they were. That is the other
 * half of the same ruling and it is quoted in it: *"If you make all six needs
 * finishable in a few thousand ticks, every prisoner is the same again."*
 *
 * **A finding the ruling was not given, recorded here because this is where
 * anybody would look for it.** The issues describe the old 0.01 as making
 * *"40 of the withholding a permanent constant that no play can move"*.
 * Measured on the tree this changed, it was a permanent **zero** rather than a
 * permanent 40: `action.sleep` carried `safety: 0.2`, twenty times the decay,
 * so any prisoner with a bed sat at 237 or above for ever
 * (`tests/integration/room-gated-needs.test.ts` pinned `safety: 237.1` over
 * ten in-game days) and the state withheld nothing for `safety` in any prison
 * that had furnished a cell. Both readings agree on the conclusion the ruling
 * drew -- the number was a constant and no play moved it -- and disagree about
 * its sign, which is why the bed's contribution had to go for coverage to
 * become the instrument. See `DEFAULT_ACTIONS` in `./actions.ts`.
 */
/** Level lost per tick while a need is not being actively fulfilled -- data, not an if-chain per need. Authored in whole levels; `NEED_DECAY_SCALED_PER_TICK` is the form the arithmetic uses. */
export const NEED_DECAY_PER_TICK: Readonly<Record<NeedId, number>> = {
  hunger: 0.05,
  sleep: 0.03,
  hygiene: 0.02,
  bladder: 0.08,
  safety: 0.05,
  recreation: 0.015,
};

/**
 * `NEED_DECAY_PER_TICK` in stored units, derived rather than authored twice.
 * Every entry is a whole number at `NEED_SCALE` = 200, which is the property
 * that makes `decayNeed` exact; `Math.round` here only clears the
 * floating-point residue of the multiplication, and the test module asserts
 * that it never has anything else to clear.
 */
export const NEED_DECAY_SCALED_PER_TICK: Readonly<Record<NeedId, number>> = Object.freeze(
  Object.fromEntries(NEED_IDS.map((needId) => [needId, Math.round(NEED_DECAY_PER_TICK[needId] * NEED_SCALE)])) as Record<NeedId, number>,
);

/**
 * **What a fully covered sector puts back into `safety`, per tick** (issue
 * #588).
 *
 * 0.08 whole levels, against a decay of 0.05, and the three rungs of
 * `SECTOR_COVERAGE_STATES` take it at full, half and nothing
 * (`SAFETY_COVERAGE_PROVISION_MULTIPLIER`). The **net** rate is the thing
 * worth reading, because it is what a player experiences:
 *
 * | coverage | provision | net per tick | full to unmet |
 * | --- | --- | --- | --- |
 * | `covered` | 0.08 | **+0.03** | never; 1,700 ticks back *out* of the unmet band, 8,500 from empty to full |
 * | `understaffed` | 0.04 | **-0.01** | **20,400 ticks** |
 * | `unguarded` | 0 | **-0.05** | 4,080 ticks |
 *
 * That middle row is the decision this constant records, and it is why 0.08
 * rather than a rounder number. The owner's ruling on issue #599 offered two
 * dispositions for the 20,400-tick figure -- *"discarded, or demoted to a
 * long-stay accumulator"* -- and at these rates it is **both, on different
 * rungs**: discarded for the unguarded prison, which now pays inside every
 * sentence; and preserved exactly, to the tick, as the long-stay accumulator
 * for the understaffed one, where only a prisoner held more than eight and a
 * half in-game days ever crosses the line. A prison that is short of guards
 * does not stop being safe; it stops being safe *for its long-stayers*.
 *
 * **The bracket, so a later balance pass can see what it is moving inside
 * of.** Three rungs stay three distinct outcomes only while
 * `provision / 2 < decay < provision` -- below the lower bound `understaffed`
 * recovers and stops costing anything, above the upper `covered` drains and
 * the instrument reads backwards. With `safety` decaying at 0.05 and
 * `NEED_SCALE` admitting only multiples of 0.005 (and the *half* rate having
 * to be representable too, which restricts this constant to multiples of
 * 0.01), the whole of the available range is 0.06, 0.07, 0.08 and 0.09.
 * Their long-stay accumulators are 10,200, 13,600, 20,400 and 40,800 ticks;
 * the first two are `hygiene`'s and `recreation`'s numbers, which would read as
 * a coincidence rather than a decision.
 *
 * **This sentence also said of 40,800 that "the last is past the 38,400-tick
 * maximum sentence, so it is an accumulator that never accumulates", and that
 * is false since #593 re-ranged sentences to 33,600..216,000.** 40,800 is
 * inside all but the shortest eleven of the seventy-seven drawable lengths, so
 * 0.09 would accumulate for most of the population. It is left out of the
 * bracket on the *other* ground only: the legibility argument above is
 * untouched by the re-range. Both directions are marked because the reason a
 * rung was set aside is the thing a later balance pass needs.
 *
 * A **directional default, not a committed balance decision**, in the sense
 * `DEFAULT_SECTOR_RISK_POLICY` uses the phrase.
 */
export const SAFETY_COVERAGE_PROVISION_PER_TICK = 0.08;

/**
 * The share of `SAFETY_COVERAGE_PROVISION_PER_TICK` each rung provisions --
 * issue #588's mechanic in three numbers: *"`Covered` at full rate,
 * `Understaffed` at half, `Unguarded` at nothing."*
 *
 * Authored as multipliers rather than as three rates so that "half" is a fact
 * about the ladder and cannot drift into "half, roughly": the scaled table
 * below is derived from these, and `tests/unit/prisoners-needs.test.ts`
 * asserts every entry of it is a whole number at `NEED_SCALE` for the same
 * reason it asserts it of the decay table.
 */
export const SAFETY_COVERAGE_PROVISION_MULTIPLIER: Readonly<Record<SectorCoverageState, number>> = Object.freeze({
  covered: 1,
  understaffed: 0.5,
  unguarded: 0,
});

/** `SAFETY_COVERAGE_PROVISION_PER_TICK` times each multiplier, in the stored units the arithmetic uses. Derived, never authored twice. */
export const SAFETY_COVERAGE_PROVISION_SCALED_PER_TICK: Readonly<Record<SectorCoverageState, number>> = Object.freeze(
  Object.fromEntries(
    SECTOR_COVERAGE_STATES.map((state) => [
      state,
      Math.round(SAFETY_COVERAGE_PROVISION_PER_TICK * SAFETY_COVERAGE_PROVISION_MULTIPLIER[state] * NEED_SCALE),
    ]),
  ) as Record<SectorCoverageState, number>,
);

function clampScaled(scaledValue: number): number {
  return Math.max(NEED_MIN_SCALED, Math.min(NEED_MAX_SCALED, Math.round(scaledValue)));
}

export class NeedsComponent {
  /**
   * Per-need levels in **stored units** (`NEED_SCALE` per whole level), not
   * in the 0-255 levels `get`/`set` speak. The only production reader is the
   * save codec (`src/simulation/runtime/session-systems.ts`), which carries
   * the stored units verbatim so a restore is exact down to the sub-level
   * remainder; tests that pin the arrays themselves read it too. Everything
   * else goes through the accessors.
   */
  public readonly levels: Readonly<Record<NeedId, Uint16Array>>;

  public constructor(public readonly capacity: number) {
    const levels: Partial<Record<NeedId, Uint16Array>> = {};
    for (const needId of NEED_IDS) {
      levels[needId] = new Uint16Array(capacity).fill(NEED_MAX_SCALED);
    }
    this.levels = levels as Record<NeedId, Uint16Array>;
  }

  /**
   * Restores every need for one slot to `NEED_MAX`, the level a
   * never-occupied slot holds -- a new arrival is fully satisfied and decays
   * from there, rather than inheriting the previous occupant of the index.
   * Driven off `NEED_IDS`, so a need added to that list is covered here with
   * no second edit.
   */
  public reset(index: number): void {
    for (const needId of NEED_IDS) {
      this.levels[needId][index] = NEED_MAX_SCALED;
    }
  }

  /** The need's level in whole levels, `NEED_MIN`..`NEED_MAX` -- the unit every consumer outside the save codec works in. */
  public get(index: number, needId: NeedId): number {
    return Math.round(this.levels[needId][index]! / NEED_SCALE);
  }

  /** The need's level in stored units, `NEED_MIN_SCALED`..`NEED_MAX_SCALED`. Decay works here so a sub-level step is not rounded away. */
  public getScaled(index: number, needId: NeedId): number {
    return this.levels[needId][index]!;
  }

  /** Sets from a whole-level value; the sub-level part of a fractional `value` is kept rather than rounded off. */
  public set(index: number, needId: NeedId, value: number): void {
    this.levels[needId][index] = clampScaled(value * NEED_SCALE);
  }

  public setScaled(index: number, needId: NeedId, scaledValue: number): void {
    this.levels[needId][index] = clampScaled(scaledValue);
  }

  /** Applies a delta expressed in whole levels. Sub-level deltas accumulate rather than rounding away, for the same reason decay does. */
  public adjust(index: number, needId: NeedId, delta: number): void {
    this.setScaled(index, needId, this.getScaled(index, needId) + delta * NEED_SCALE);
  }

  public getSnapshot(): Readonly<Record<NeedId, Uint16Array>> {
    const snapshot: Partial<Record<NeedId, Uint16Array>> = {};
    for (const needId of NEED_IDS) {
      snapshot[needId] = new Uint16Array(this.levels[needId]);
    }
    return snapshot as Record<NeedId, Uint16Array>;
  }

  public loadSnapshot(snapshot: Readonly<Record<NeedId, Uint16Array>>): void {
    for (const needId of NEED_IDS) {
      if (snapshot[needId].length !== this.capacity) {
        throw new RangeError(`Needs snapshot capacity mismatch for "${needId}".`);
      }
      this.levels[needId].set(snapshot[needId]);
    }
  }
}

/**
 * Deterministic decay for one need over `ticksElapsed` whole ticks, in the
 * **stored units** `NeedsComponent.levels` holds (`NEED_SCALE` per level) --
 * pass and expect `getScaled`/`setScaled` values, never whole levels.
 *
 * Whole-tick, integer-accumulating math (never fractional per-frame decay)
 * so repeated identical scenarios decay identically regardless of how
 * often this is called, as long as `ticksElapsed` sums the same. Every
 * scaled rate is a whole number, so the subtraction below is exact and that
 * property holds for *any* split of the ticks, not merely for a fixed batch
 * size; `Math.round` inside the clamp is a no-op for whole `ticksElapsed`
 * and only guards a fractional argument.
 *
 * `extraScaledPerTick` is the crowding term (issue #586,
 * `crowdingExtraDecayScaledPerTick` in `./crowding.ts`), added to the base
 * rate rather than multiplied into it so that the rate stays a whole number of
 * stored units and the linearity above survives it: the caller holds it fixed
 * across the `ticksElapsed` it passes. Defaulted to `0`, which is every
 * uncrowded prison and every caller that is not `NeedsDecaySystem`.
 */
export function decayNeed(currentScaledLevel: number, needId: NeedId, ticksElapsed: number, extraScaledPerTick = 0): number {
  return clampScaled(currentScaledLevel - (NEED_DECAY_SCALED_PER_TICK[needId] + extraScaledPerTick) * ticksElapsed);
}

/**
 * Deterministic **provision** of one prisoner's `safety` over `ticksElapsed`
 * whole ticks at the coverage `state` of the sector they spent them in, in the
 * stored units `NeedsComponent` holds (issue #588).
 *
 * The counterpart of `decayNeed` and it is written to the same contract:
 * integer arithmetic on whole ticks, exactly linear in `ticksElapsed`, so a
 * scenario provisions identically no matter how the same total of ticks is
 * split across calls. `SafetyCoverageSystem`'s `intervalTicks` is therefore a
 * scheduling choice and not a balance one, exactly as `NeedsDecaySystem`'s is.
 *
 * **Provision only, never drain.** `unguarded` adds zero rather than
 * subtracting: what makes an unguarded prisoner unsafe is
 * `NEED_DECAY_SCALED_PER_TICK.safety` continuing unopposed, which is already
 * charged by `NeedsDecaySystem`. This is the same refinement the corpus's C22
 * carried into issue #588 -- the premium is *suspended* and never made
 * negative, so a security lapse cannot manufacture a debt -- and it is what
 * keeps the two systems' arithmetic independent of the order they run in.
 *
 * No RNG and no clock, so it takes no stream (`docs/DETERMINISM.md`).
 */
export function provisionSafety(currentScaledLevel: number, state: SectorCoverageState, ticksElapsed: number): number {
  return clampScaled(currentScaledLevel + SAFETY_COVERAGE_PROVISION_SCALED_PER_TICK[state] * ticksElapsed);
}
