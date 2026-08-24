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

/** Level lost per tick while a need is not being actively fulfilled -- data, not an if-chain per need. Authored in whole levels; `NEED_DECAY_SCALED_PER_TICK` is the form the arithmetic uses. */
export const NEED_DECAY_PER_TICK: Readonly<Record<NeedId, number>> = {
  hunger: 0.05,
  sleep: 0.03,
  hygiene: 0.02,
  bladder: 0.08,
  safety: 0.01,
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
 */
export function decayNeed(currentScaledLevel: number, needId: NeedId, ticksElapsed: number): number {
  return clampScaled(currentScaledLevel - NEED_DECAY_SCALED_PER_TICK[needId] * ticksElapsed);
}
