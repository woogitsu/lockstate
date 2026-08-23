import { DAY_LENGTH_TICKS } from '../prisoners/regime';

/**
 * Where a tick sits in the in-game day.
 *
 * The one piece of clock arithmetic in the codebase, so a caller cannot
 * disagree with the status strip about which day it is. Both the status-strip
 * projection (inside the worker) and the composition root (which turns a
 * `simulation/clock-state` message into a HUD view model) read it from here.
 *
 * Deliberately **not** an hour-of-day or a wall clock. `DAY_LENGTH_TICKS` is
 * a tick budget that `regime.ts` calls a candidate value, not a 24-hour
 * mapping, so this reports the position and lets a view decide how to draw
 * it (`docs/HUD_PROJECTIONS.md`, gap 5).
 *
 * Pure: same tick in, same values out, no clock and no ambient state.
 */
export interface ClockPosition {
  readonly tick: number;
  /** 1-based, so the first simulated day is "day 1" rather than "day 0". */
  readonly dayNumber: number;
  /** `0 .. dayLengthTicks - 1`. */
  readonly tickOfDay: number;
  readonly dayLengthTicks: number;
}

export function projectClockPosition(tick: number, dayLengthTicks: number = DAY_LENGTH_TICKS): ClockPosition {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(`A tick must be a non-negative safe integer, got ${String(tick)}.`);
  }
  if (!Number.isSafeInteger(dayLengthTicks) || dayLengthTicks <= 0) {
    throw new RangeError(`A day must be a positive whole number of ticks, got ${String(dayLengthTicks)}.`);
  }

  return {
    tick,
    dayNumber: Math.floor(tick / dayLengthTicks) + 1,
    tickOfDay: tick % dayLengthTicks,
    dayLengthTicks,
  };
}
