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
 * How long a sentence keeps the band -- and therefore the **grid row** the band
 * is -- before the band lets go of both.
 *
 * ## What this reverses, and why it is written out rather than quietly changed
 *
 * `hud.ts`'s `.hud__event` docblock said, until 2026-09-05:
 *
 * > It does **not** auto-dismiss, for the reason the refusal band does not: a
 * > message that clears itself on a timer is a race against how fast the
 * > player reads. It is replaced by the next event or emptied when the session
 * > ends, and it is in the log either way.
 *
 * Every clause of that was a true description of this module, and the last one
 * is why it can now stop being true: **the band is not where a sentence is
 * kept.** ADR 0084's decisions 1 to 3 gave the alerts list a count, a time and
 * survival across a reload, and its own amendment says what that leaves the
 * band -- *"the band's job ... is narrower: that a player looking at it sees
 * the sentence exist"*. A surface whose job is "sees it exist" does not need
 * to hold a grid row for the rest of the session, and
 * [#985](https://github.com/matmaxalez/lockstate/issues/985) is the bill for
 * doing so.
 *
 * ## The bill, measured on the assembled application at 900x600
 *
 * `.hud__event` is `grid-area: event`, an `auto` row of `.hud`, so a raised
 * band costs the `minmax(0, 1fr)` middle row -- and the rail in it -- exactly
 * its own height. Measured on `index.html`, Rooms tab, one fresh prison:
 *
 * | state | `.hud__rail` | `.hud__aside` | `.hud-rooms` body | `.hud-build` panel |
 * | --- | --- | --- | --- | --- |
 * | no band | 482.8px | 120.7px | 291px | 336 client / 336 scroll |
 * | one band | 450.8px | 112.7px | 267px | **312 client / 336 scroll** |
 *
 * 32px off the rail, 8px of it off `.hud__aside`'s `min-height: 25%` floor and
 * the remaining **24px off the panel in `.hud__side`** -- and the Build panel,
 * whose body is on the floor #174 sized for it, cannot give the 24px back, so
 * it goes 24px past its own fold on arrival with `scrollTop` 0. That is #174's
 * defect returning, and the Rooms panel's 18px clip that #985 reports is the
 * same 24px against a body that had *"285.1px of content in a 291px box at
 * 900x600 -- 5.9px of slack"* (`hud.css`, `.hud-rooms[data-needs]`).
 *
 * **Lowering the band gives every pixel back, exactly and at once** -- 267 ->
 * 291, measured on the same page in the same run. So the whole of #985's
 * *permanence* is this module holding `showing` for ever, and the whole of the
 * repair is letting go.
 *
 * ## Where 8000 comes from
 *
 * A ceiling has to clear two things, and it is derived from both rather than
 * chosen.
 *
 * **It must clear the floor above it**, or the two rules would contradict each
 * other on the same sentence. `EVENT_BAND_DWELL_FLOOR_MS` is 600, and this is
 * 13.3x it, so a sentence released from `EventBandDwellState.waiting` still
 * gets a whole hold of its own from the moment it takes the line.
 *
 * **It must be long enough to read the longest thing the band can say.** That
 * is `'hud.alert.event.economy.construction-refused'` -- *"Construction halted
 * -- the treasury cannot fund the build queue right now."* -- twelve words. At
 * 100 words per minute, which is half an ordinary silent reading rate and the
 * right half for a player whose eyes are on the prison rather than on the
 * band, twelve words is 7.2s; plus the 250ms this repository already calls
 * seen (`tests/browser/ui-escape-sentence-survival.spec.ts`, `SEEN_MS`) that
 * is 7.45s, and 8000 is the round number above it.
 *
 * **What it is not:** a promise that a sentence is still on screen later. It
 * never was one -- the band holds *one* sentence and has always dropped the
 * previous one without ceremony. ADR 0084 Finding 4 measured a terminal
 * outcome standing *"about 6.3 s at x1"* before the next event of any kind
 * replaced it, so a ceiling above that fires mostly in a prison where nothing
 * else was coming: the case where the sentence on the line is oldest, least
 * current, and costing the most for the least.
 *
 * **What it costs, stated rather than left to be found.** At 720px and below
 * `.hud__corner` is `display: none` (`hud.css`, the `@media (max-width: 720px)`
 * block, whose own comment records #703 ruling 5 deferring the removal to a
 * mobile layout pass), so on a phone the alerts list is not on screen and this
 * band is the only surface an event has. A phone player who looks up more than
 * eight seconds later now sees nothing where they used to see the last event.
 * That is a real loss and it is the one this change buys the row back with;
 * the repair for it is that mobile layout pass, not a band that never lets go.
 * **Three docblocks in `hud.css` say the corner "is no longer hidden below
 * 720px" and the same file contradicts them at `@media (max-width: 720px)`;
 * the rule is what shipped.**
 */
export const EVENT_BAND_HOLD_CEILING_MS = 8_000;

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
  /**
   * The ordinal of the sentence this band let go of when its hold ran out, and
   * the reason letting go is not undone a fraction of a second later.
   *
   * `HudViewModel.event` is *sticky*: `src/main.ts` writes the field on the
   * message that carried the event and leaves it standing on every message
   * after -- only `'none'`, which is the session ending, deletes it. So
   * `hud.ts` re-offers the identical notice to `admitToEventBand` on every
   * publication, and the counts channel publishes up to twice a second. Without
   * this the band would empty on its timer and be raised again by the next
   * snapshot, which is a flicker rather than a release.
   *
   * An ordinal rather than the notice object, for the reason
   * `arriving.sequence === state.showing.sequence` is an ordinal: it survives
   * the view model being rebuilt, and it cannot collide across a session
   * boundary because `simulation/stopped` empties this state first.
   */
  readonly retired: number | undefined;
}

/** Before this session has had anything to say, and again once it has ended. */
export const EMPTY_EVENT_BAND_DWELL_STATE: EventBandDwellState = {
  showing: undefined,
  shownAt: 0,
  waiting: undefined,
  retired: undefined,
};

export interface EventBandDwellDecision {
  readonly state: EventBandDwellState;
  /** What the band must say now -- `undefined` for "say nothing and be hidden". */
  readonly paint: HudEventNoticeViewModel | undefined;
  /**
   * How long until the caller must call `advanceEventBand`, or `undefined`
   * when nothing is due.
   *
   * **Two things are due now, not one**, and the caller does not need to know
   * which: a waiting sentence takes the line when the floor lapses, and the
   * band lets the row go when the hold ceiling does. Whichever is nearer is
   * what this asks for, and `advanceEventBand` does whichever it turns out to
   * be. `undefined` therefore means the band is saying nothing at all -- while
   * a sentence is on the line there is always a ceiling ahead of it.
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

function remainingCeilingMs(state: EventBandDwellState, now: number): number {
  return Math.max(0, EVENT_BAND_HOLD_CEILING_MS - (now - state.shownAt));
}

/**
 * Whichever of the two deadlines on the sentence currently on the line comes
 * first, measured from the same `shownAt` as both.
 *
 * A waiting sentence is always the nearer one, because the floor is under the
 * ceiling and a sentence can only start waiting inside the floor -- so this is
 * a `min` written as the branch that decides it, rather than as arithmetic
 * whose ordering a reader has to re-derive.
 */
function nextWakeMs(state: EventBandDwellState, now: number): number | undefined {
  if (state.showing === undefined) return undefined;
  return state.waiting === undefined ? remainingCeilingMs(state, now) : remainingFloorMs(state, now);
}

/** The band keeps saying what it is saying; the caller repaints it unchanged, as it always has. */
function hold(state: EventBandDwellState, now: number): EventBandDwellDecision {
  return { state, paint: state.showing, wakeInMs: nextWakeMs(state, now) };
}

function show(
  notice: HudEventNoticeViewModel,
  now: number,
  waiting: HudEventNoticeViewModel | undefined,
): EventBandDwellDecision {
  // `retired` is deliberately dropped: a sentence taking the line is the band
  // speaking again, and what it let go of before has no bearing on the ordinal
  // now on it. Only the guard in `admitToEventBand` reads that field, and it
  // runs before this does.
  const state: EventBandDwellState = { showing: notice, shownAt: now, waiting, retired: undefined };
  return { state, paint: notice, wakeInMs: nextWakeMs(state, now) };
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
 * The hold has run out: the band says nothing and gives the row back.
 *
 * **The row is the point.** `.hud__event` is one `auto` row of `.hud`'s grid
 * and `hud.css` gives it `display: none` while `[hidden]`, so a band the caller
 * paints as `undefined` costs the middle row nothing at all -- 32px of rail,
 * 24px of whichever panel is in `.hud__side`, handed back in the same layout
 * pass. See `EVENT_BAND_HOLD_CEILING_MS` for the measurement and for what this
 * reverses.
 *
 * The ordinal is kept so the next publication of the same sticky
 * `HudViewModel.event` does not raise it again (`EventBandDwellState.retired`).
 * `shownAt` is kept as it was rather than moved to `now`: nothing reads it
 * while `showing` is `undefined`, and leaving it alone keeps this function a
 * statement about one field.
 */
function expire(state: EventBandDwellState, showing: HudEventNoticeViewModel): EventBandDwellDecision {
  return {
    state: { ...state, showing: undefined, waiting: undefined, retired: showing.sequence },
    paint: undefined,
    wakeInMs: undefined,
  };
}

/**
 * What the band does when the timer the last decision asked for fires.
 *
 * One entry point for both deadlines, because the caller arms one timer and
 * cannot be asked to know which of the two it is serving
 * (`EventBandDwellDecision.wakeInMs`). In the order the branches take it:
 *
 * - **Nothing on the line** -- a timer that fired against a state something
 *   else already emptied. Repaints what is there rather than blanking the band,
 *   exactly as `releaseEventBandFloor` did alone.
 * - **The floor has lapsed and something is waiting** -- the waiting sentence
 *   takes the line, with a whole hold of its own from this moment. Checked
 *   before the ceiling so that a release is never overtaken by an expiry, which
 *   would drop a sentence that had never been painted at all.
 * - **The ceiling has lapsed** -- the band lets go. `waiting` is necessarily
 *   `undefined` here, the floor being the shorter of the two, so nothing is
 *   thrown away by this branch that the branch above would have shown.
 * - **Neither** -- the caller was early, or another decision has since moved
 *   `shownAt`. The band keeps saying what it is saying and asks again for
 *   whatever is left.
 */
export function advanceEventBand(state: EventBandDwellState, now: number): EventBandDwellDecision {
  const showing = state.showing;
  if (showing === undefined) return hold(state, now);
  if (state.waiting !== undefined && now - state.shownAt >= EVENT_BAND_DWELL_FLOOR_MS) {
    return releaseEventBandFloor(state, now);
  }
  if (now - state.shownAt >= EVENT_BAND_HOLD_CEILING_MS) return expire(state, showing);
  return hold(state, now);
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
 * - **The sentence this band already let go of** -- nothing. `HudViewModel.event`
 *   is sticky (see `EventBandDwellState.retired`), so the identical notice is
 *   re-offered on every publication for the rest of the session; without this
 *   branch the hold ceiling would empty the band and the next snapshot would
 *   put it straight back. Checked before *"nothing on the line"*, because after
 *   an expiry there is nothing on the line and that branch would show it.
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
 *   first, so the older sentence is never shown *after* the newer one. The hold
 *   ceiling is deliberately *not* consulted here: a live arrival replaces the
 *   incumbent whatever its age, and an incumbent old enough to have expired has
 *   already been taken down by `advanceEventBand` on its own timer.
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
  if (arriving.sequence === state.retired) return { state, paint: undefined, wakeInMs: undefined };
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
