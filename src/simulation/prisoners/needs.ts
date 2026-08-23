/**
 * Core, representative need set (issue #24): hunger, sleep, hygiene,
 * bladder, safety and recreation. Each is a 0-255 level -- 0 critical,
 * 255 fully satisfied -- stored as a flat `Uint8Array` per need (SoA,
 * matching `src/simulation/entity/component.ts`'s existing prototype
 * components), never one allocated object per prisoner.
 */
export const NEED_IDS = ['hunger', 'sleep', 'hygiene', 'bladder', 'safety', 'recreation'] as const;
export type NeedId = (typeof NEED_IDS)[number];

export const NEED_MAX = 255;
export const NEED_MIN = 0;

/** Level lost per tick while a need is not being actively fulfilled -- data, not an if-chain per need. */
export const NEED_DECAY_PER_TICK: Readonly<Record<NeedId, number>> = {
  hunger: 0.05,
  sleep: 0.03,
  hygiene: 0.02,
  bladder: 0.08,
  safety: 0.01,
  recreation: 0.015,
};

export class NeedsComponent {
  public readonly levels: Readonly<Record<NeedId, Uint8Array>>;

  public constructor(public readonly capacity: number) {
    const levels: Partial<Record<NeedId, Uint8Array>> = {};
    for (const needId of NEED_IDS) {
      levels[needId] = new Uint8Array(capacity).fill(NEED_MAX);
    }
    this.levels = levels as Record<NeedId, Uint8Array>;
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
      this.levels[needId][index] = NEED_MAX;
    }
  }

  public get(index: number, needId: NeedId): number {
    return this.levels[needId][index]!;
  }

  public set(index: number, needId: NeedId, value: number): void {
    this.levels[needId][index] = Math.max(NEED_MIN, Math.min(NEED_MAX, Math.round(value)));
  }

  public adjust(index: number, needId: NeedId, delta: number): void {
    this.set(index, needId, this.get(index, needId) + delta);
  }

  public getSnapshot(): Readonly<Record<NeedId, Uint8Array>> {
    const snapshot: Partial<Record<NeedId, Uint8Array>> = {};
    for (const needId of NEED_IDS) {
      snapshot[needId] = new Uint8Array(this.levels[needId]);
    }
    return snapshot as Record<NeedId, Uint8Array>;
  }

  public loadSnapshot(snapshot: Readonly<Record<NeedId, Uint8Array>>): void {
    for (const needId of NEED_IDS) {
      if (snapshot[needId].length !== this.capacity) {
        throw new RangeError(`Needs snapshot capacity mismatch for "${needId}".`);
      }
      this.levels[needId].set(snapshot[needId]);
    }
  }
}

/**
 * Deterministic decay for one need over `ticksElapsed` whole ticks.
 * Whole-tick, integer-accumulating math (never fractional per-frame decay)
 * so repeated identical scenarios decay identically regardless of how
 * often this is called, as long as `ticksElapsed` sums the same.
 */
export function decayNeed(currentLevel: number, needId: NeedId, ticksElapsed: number): number {
  const decayed = currentLevel - NEED_DECAY_PER_TICK[needId] * ticksElapsed;
  return Math.max(NEED_MIN, Math.min(NEED_MAX, Math.round(decayed)));
}
