import { SEVERITY_EVICTION_ORDER, type HudEventNoticeViewModel } from './view-model';

/**
 * How long the events band owes a sentence before anything of equal or lower
 * severity may take the line.
 *
 * ## Where the number comes from
 *
 * Two bounds, measured rather than chosen, and 600 ms is the room between
 * them.
 *
 * **The lower bound is what a test in this repository already calls seen.**
 * `tests/browser/ui-escape-sentence-survival.spec.ts` defines `SEEN_MS` as 250
 * -- *"What this file is willing to call 'a player could have read it'.
 * Roughly fifteen frames at 60 Hz."* A floor has to clear that with room to
 * spare or it guarantees nothing a player would notice; 600 ms is 2.4x it, and
 * about 36 animation frames.
 *
 * **The upper bound is the spacing of real events, so that the floor delays
 * almost nothing.** Two prisons were driven through the real kernel for this
 * decision and every event's tick recorded:
 *
 * | prison | ticks run | events | shortest gap | pairs closer than 600 ms at x4 |
 * | --- | --- | --- | --- | --- |
 * | 48 cells, 120 admitted | 200,000 (83 in-game days) | 64 | 50 ticks | 0 of 63 |
 * | 24 cells, 40 admitted | 90,000 (37 in-game days) | 54 | 10 ticks | 1 of 53 |
 *
 * A tick is 50 ms (`src/simulation/clock/fixed-step-clock.ts`,
 * `stepMilliseconds`), so x4 -- the fastest speed the game offers, and the one
 * the #700 playtest ran at -- is 12.5 ms of wall clock per tick. The shortest
 * gap in the larger prison is therefore 625 ms, and 600 ms is the largest round
 * number under it: **1 consecutive pair in 116 across both runs is delayed at
 * all, and none at x1 in the larger run.** That is the "silently slows every
 * event down" cost the band could not afford, priced instead of asserted.
 *
 * The one figure this codebase had before those runs agrees with them: ADR 0084
 * Finding 4 measured a terminal outcome standing *"about 6.3 s at x1 and 1.6 s
 * at x4"* before the next event of any kind, and the 2026-08-31 playtest's
 * shortest observed spacing between two *different* band sentences was 70 ticks
 * -- 875 ms at x4 (`docs/research/2026-08-31-playing-the-nine-changes.md`
 * section 6). Both are above this floor.
 *
 * **What the floor is not.** It is not the time it takes to read the sentence.
 * *"A riot has broken out -- {count} prisoners have stopped taking orders."* is
 * eleven words and no plausible reading rate finishes it in 600 ms. Reading is
 * the alerts list's job, and since the owner's decisions 1 to 3 of the same day
 * that list counts repeats, dates them and survives a reload. The band's job is
 * that a player who is looking at it **sees the sentence exist**, which is
 * exactly what the escape sentence did not do: written three times, painted
 * zero times.
 */
export const EVENT_BAND_DWELL_FLOOR_MS = 600;

/**
 * What the band is holding: the sentence on the line, when it took the line,
 * and at most one sentence waiting behind it.
 *
 * **Presentational, and deliberately nowhere near a snapshot.** Nothing here
 * is read by the simulation, reaches a command, or is captured by
 * `SessionRuntimeHost.capture()`; the wall clock this state is compared against
 * is supplied by the caller and never enters a tick. A dwell floor that could
 * change simulation state would be a determinism defect
 * (`docs/DETERMINISM.md`, [ADR 0020](../../../docs/adr/0020-deterministic-kernel.md)),
 * which is why the decision is a pure function of a passed-in reading of the
 * clock rather than a module that reads one.
 */
export interface EventBandDwellState {
  readonly showing: HudEventNoticeViewModel | undefined;
  /** The caller's clock reading when `showing` took the line. Meaningless while `showing` is `undefined`. */
  readonly shownAt: number;
  /**
   * The one sentence that arrived inside the floor and did not outrank what was
   * on the line.
   *
   * One slot rather than a queue, and it is arbitrated by
   * `SEVERITY_EVICTION_ORDER` exactly as the alerts list's cap is: a band shows
   * one message and replaces it, so a queue would be a promise to show every
   * sentence eventually, which this channel has never made. What a sentence
   * that loses the slot keeps is the log -- the same thing an event pushed off
   * the line has always kept.
   */
  readonly waiting: HudEventNoticeViewModel | undefined;
}

/** Before this session has had anything to say, and again once it has ended. */
export const EMPTY_EVENT_BAND_DWELL_STATE: EventBandDwellState = {
  showing: undefined,
  shownAt: 0,
  waiting: undefined,
};

export interface EventBandDwellDecision {
  readonly state: EventBandDwellState;
  /** What the band must say now -- `undefined` for "say nothing and be hidden". */
  readonly paint: HudEventNoticeViewModel | undefined;
  /**
   * How long until the caller must come back so that a waiting sentence takes
   * the line, or `undefined` when nothing is waiting.
   *
   * The caller owns the timer, because a timer is a DOM concern and this module
   * is a decision. Never negative: a caller that is late is told to come back
   * at once rather than handed a number it would have to sanitise.
   */
  readonly wakeInMs: number | undefined;
}

/** Strictly more severe -- the promotion rule, and the only thing that takes the line early. */
function outranks(candidate: HudEventNoticeViewModel, incumbent: HudEventNoticeViewModel): boolean {
  return SEVERITY_EVICTION_ORDER[candidate.severity] > SEVERITY_EVICTION_ORDER[incumbent.severity];
}

/**
 * Which of two sentences keeps the waiting slot: the more severe, and the newer
 * of two equals.
 *
 * The same ordering the list's cap applies to the rows it drops -- severity
 * first, and *oldest-within-band* goes -- read from the other end. There is one
 * comparison in the game for "which of these two matters more", and this is it.
 */
function moreImportant(
  waiting: HudEventNoticeViewModel | undefined,
  arriving: HudEventNoticeViewModel,
): HudEventNoticeViewModel {
  if (waiting === undefined) return arriving;
  return outranks(waiting, arriving) ? waiting : arriving;
}

function remainingFloorMs(state: EventBandDwellState, now: number): number {
  return Math.max(0, EVENT_BAND_DWELL_FLOOR_MS - (now - state.shownAt));
}

/** The band keeps saying what it is saying; the caller repaints it unchanged, as it always has. */
function hold(state: EventBandDwellState, now: number): EventBandDwellDecision {
  return {
    state,
    paint: state.showing,
    wakeInMs: state.waiting === undefined ? undefined : remainingFloorMs(state, now),
  };
}

function show(
  notice: HudEventNoticeViewModel,
  now: number,
  waiting: HudEventNoticeViewModel | undefined,
): EventBandDwellDecision {
  return {
    state: { showing: notice, shownAt: now, waiting },
    paint: notice,
    wakeInMs: waiting === undefined ? undefined : EVENT_BAND_DWELL_FLOOR_MS,
  };
}

/**
 * The floor has lapsed: whatever waited takes the line.
 *
 * Called from the caller's timer. Answers `hold` when nothing is waiting, so a
 * timer that fires against a state something else already emptied repaints what
 * is there rather than blanking the band.
 */
export function releaseEventBandFloor(state: EventBandDwellState, now: number): EventBandDwellDecision {
  if (state.waiting === undefined) return hold(state, now);
  return show(state.waiting, now, undefined);
}

/**
 * What the events band does with the notice the view model is now carrying.
 *
 * **This is ADR 0084 decision 4, taken by the owner on 2026-09-01**: a terminal
 * outcome gets a minimum dwell, and when a second event arrives inside that
 * floor *"the more severe one wins the band immediately; an equal or less
 * severe one waits."*
 *
 * ## The rule, in the order the branches take it
 *
 * - **No notice at all** -- the session ended (`simulation/stopped` empties the
 *   field). The floor protects a sentence about a live session and there is no
 *   longer one, so everything is dropped including anything waiting.
 * - **Nothing on the line** -- it goes up at once. A first event is never
 *   delayed, at any severity.
 * - **The sentence already on the line** -- `src/main.ts` rebuilds the view
 *   model and repaints on every worker message, so most calls here are
 *   re-renders of what is already showing. They must not restart the floor,
 *   or a busy clock channel would extend it indefinitely. Recognised by the
 *   event's own ordinal, which is what `HudEventNoticeViewModel.sequence` is
 *   for; a new session's ordinals start again at 1, and cannot collide with
 *   these, because loading a prison over a running one goes through
 *   `simulation/stopped` first and empties this state.
 * - **The floor has lapsed** -- the band behaves exactly as it did before this
 *   change: the newest event takes the line. Anything still waiting is released
 *   first, so the older sentence is never shown *after* the newer one.
 * - **Inside the floor, and more severe** -- it takes the line immediately.
 *   This is the half of the ruling that keeps the band the thing a player
 *   watches without opening anything (`hud.ts`, the `.hud__event` docblock,
 *   #507 and #220): an escape never waits behind a discharge.
 * - **Inside the floor, equal or less severe** -- it waits, and the band is
 *   repainted with what it was already saying.
 *
 * `now` is the caller's reading of a wall clock. It is a parameter and not a
 * call to one, so that this decision is provable without a DOM, a browser or a
 * frame, and so that nothing here can become a second source of time.
 */
export function admitToEventBand(
  state: EventBandDwellState,
  arriving: HudEventNoticeViewModel | undefined,
  now: number,
): EventBandDwellDecision {
  if (arriving === undefined) return { state: EMPTY_EVENT_BAND_DWELL_STATE, paint: undefined, wakeInMs: undefined };
  if (state.showing === undefined) return show(arriving, now, state.waiting);
  if (arriving === state.showing || arriving.sequence === state.showing.sequence) return hold(state, now);

  if (now - state.shownAt >= EVENT_BAND_DWELL_FLOOR_MS) {
    const released = releaseEventBandFloor(state, now);
    // At most one step of recursion: `released` either changed nothing, or put
    // the waiting sentence on the line with `shownAt` set to `now`, which makes
    // the floor unlapsed and sends the arrival down one of the branches below.
    if (released.state.showing === state.showing) return show(arriving, now, undefined);
    return admitToEventBand(released.state, arriving, now);
  }

  if (outranks(arriving, state.showing)) return show(arriving, now, state.waiting);
  return {
    state: { ...state, waiting: moreImportant(state.waiting, arriving) },
    paint: state.showing,
    wakeInMs: remainingFloorMs(state, now),
  };
}
