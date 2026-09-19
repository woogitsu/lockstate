import { describe, expect, it } from 'vitest';
import type { HudEventNoticeViewModel } from '../../src/ui/hud/view-model';
import {
  EMPTY_EVENT_BAND_DWELL_STATE,
  EVENT_BAND_DWELL_FLOOR_MS,
  EVENT_BAND_HOLD_CEILING_MS,
  admitToEventBand,
  advanceEventBand,
  releaseEventBandFloor,
  type EventBandDwellState,
} from '../../src/ui/hud/event-band-dwell';

/**
 * ADR 0084 decision 4, taken by the owner on 2026-09-01: `.hud__event` gets a
 * minimum dwell, and a second event arriving inside it is arbitrated by
 * severity promotion -- the more severe wins the band at once, an equal or
 * less severe one waits.
 *
 * **Pure, and tested here rather than in a browser, for the same reason
 * `ui-hud-alert-row-label.test.ts` gives**: `admitToEventBand` and
 * `releaseEventBandFloor` are ordinary functions of a state and a caller-
 * supplied clock reading, with no DOM and no timer, so a vitest run can
 * decide every branch directly rather than through `hud.ts`'s wiring. The two
 * browser tests this decision also needs --
 * `tests/browser/ui-escape-sentence-survival.spec.ts`'s "the dwell floor
 * keeps the escape sentence on screen..." and "a more severe event still
 * takes the band immediately..." -- prove the same two properties through the
 * real kernel, the real translators and a real `setTimeout`; this file proves
 * them as a property of the decision itself, independent of how `hud.ts`
 * happens to wire it up.
 *
 * Notices are built by hand rather than through a translator, because the
 * decision under test never reads a notice's content -- only `.sequence` and
 * `.severity` -- and a hand-built value keeps each case legible without a
 * kernel run standing between the test and the branch it exercises.
 */

function notice(sequence: number, severity: HudEventNoticeViewModel['severity']): HudEventNoticeViewModel {
  return { sequence, labelKey: `hud.alert.event.test.${String(sequence)}`, severity };
}

describe('admitToEventBand', () => {
  it('never delays a first event, at any severity', () => {
    for (const severity of ['info', 'warning', 'danger'] as const) {
      const arriving = notice(1, severity);
      const decision = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, arriving, 0);
      expect(decision.paint).toBe(arriving);
      // Nothing is waiting, so the wake this asks for is the hold ceiling and
      // not the floor: while a sentence is on the line there is always a
      // deadline ahead of it, which is what makes `undefined` here mean "the
      // band is saying nothing" (#985).
      expect(decision.wakeInMs).toBe(EVENT_BAND_HOLD_CEILING_MS);
      expect(decision.state.waiting).toBeUndefined();
    }
  });

  /**
   * **The escape/all-clear collision from Finding 4, as the decision sees
   * it.** An `incidents.escape-succeeded` (`danger`) and the same tick's
   * `incidents.all-clear` (`info`) arrive back to back -- `now` barely moved
   * between them, both comfortably inside the floor. Before this decision
   * existed the second replaced the first outright, at 0 ms; the owner's
   * ruling says the less severe one waits instead.
   */
  it('holds the escape sentence through the same-tick all-clear, and releases the all-clear once the floor lapses', () => {
    const escape = notice(1, 'danger');
    const allClear = notice(2, 'info');

    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, escape, 0);
    expect(shown.paint).toBe(escape);

    // The all-clear arrives 1 ms later -- the gap #700's own measurement
    // recorded -- comfortably inside `EVENT_BAND_DWELL_FLOOR_MS`.
    const collided = admitToEventBand(shown.state, allClear, 1);

    // Not lost: the band still shows the escape, unchanged.
    expect(collided.paint).toBe(escape);
    // Not dropped either: it is remembered, waiting for the floor.
    expect(collided.state.waiting).toBe(allClear);
    // And the caller is told exactly when to come back for it -- `hud.ts`
    // arms its one `setTimeout` for exactly this many milliseconds, which is
    // what makes calling `releaseEventBandFloor` at all mean the floor has
    // lapsed; the function trusts that contract rather than re-checking `now`
    // itself.
    expect(collided.wakeInMs).toBe(EVENT_BAND_DWELL_FLOOR_MS - 1);

    // The timer fires: the sentence that waited takes the line -- the escape
    // sentence was seen, and nothing that arrived is silently discarded.
    const released = releaseEventBandFloor(collided.state, EVENT_BAND_DWELL_FLOOR_MS);
    expect(released.paint).toBe(allClear);
    expect(released.state.waiting).toBeUndefined();
    // The all-clear now holds the line, so what it asks for is its own hold
    // ceiling, measured from the moment it took the line rather than from the
    // escape's arrival.
    expect(released.wakeInMs).toBe(EVENT_BAND_HOLD_CEILING_MS);
  });

  /**
   * **The other half of the same ruling.** A `danger` event arriving inside
   * another event's floor does not wait for it -- it takes the line at the
   * instant it arrives, with no `wakeInMs` of its own unless something is
   * left waiting behind it. This is the property that keeps the floor from
   * becoming a universal input lag on the one band a player watches without
   * opening anything.
   */
  it('lets a more severe event take the band immediately, with no floor-imposed delay', () => {
    const discharge = notice(1, 'info');
    const riot = notice(2, 'danger');

    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, discharge, 0);
    expect(shown.paint).toBe(discharge);

    // Arrives 1 ms later, deep inside the discharge's own floor.
    const promoted = admitToEventBand(shown.state, riot, 1);

    expect(promoted.paint).toBe(riot);
    expect(promoted.state.showing).toBe(riot);
    // The floor restarts for the sentence now on the line and nothing is
    // waiting behind it, so the next thing due is the riot's own hold ceiling.
    expect(promoted.wakeInMs).toBe(EVENT_BAND_HOLD_CEILING_MS);

    // And the promotion is immediate regardless of how little of the
    // discharge's own floor had elapsed -- arriving at `now = 0` (the same
    // instant) promotes exactly as arriving at `now = 1` does.
    const atOnce = admitToEventBand(shown.state, riot, 0);
    expect(atOnce.paint).toBe(riot);
  });

  it('promotes a more severe event even while something else is already waiting, and carries the waiting sentence forward', () => {
    // `discharge` is the lowest severity, so a second `info` arrival does not
    // outrank it and takes the waiting slot instead of promoting -- this is
    // what puts something in the slot for `riot` to inherit.
    const discharge = notice(1, 'info');
    const anotherDischarge = notice(2, 'info');
    const riot = notice(3, 'danger');

    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, discharge, 0);
    const waiting = admitToEventBand(shown.state, anotherDischarge, 1);
    expect(waiting.state.waiting).toBe(anotherDischarge);

    const promoted = admitToEventBand(waiting.state, riot, 2);
    expect(promoted.paint).toBe(riot);
    // The riot outranks the discharge on the line and takes it at once --
    // decision 4's other half. What was already waiting keeps its claim: the
    // slot is a reservation on the *floor*, not a property of the sentence
    // that happened to be showing when it was made.
    expect(promoted.state.waiting).toBe(anotherDischarge);
  });

  it('keeps only the more severe of two sentences that arrive inside the same floor', () => {
    // `danger` is the highest severity, so nothing below it can promote past
    // it -- both arrivals below are funnelled into the waiting-slot
    // arbitration instead, which is the branch this test is about.
    const riot = notice(1, 'danger');
    const contraband = notice(2, 'warning');
    const discharge = notice(3, 'info');

    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, riot, 0);
    const firstWait = admitToEventBand(shown.state, contraband, 1);
    expect(firstWait.state.waiting).toBe(contraband);

    // A second, less severe arrival must not bump the warning already
    // holding the waiting slot -- `SEVERITY_EVICTION_ORDER` decides who keeps
    // it, the same ordering the alerts list's cap already runs.
    const secondWait = admitToEventBand(firstWait.state, discharge, 2);
    expect(secondWait.state.waiting).toBe(contraband);
  });

  it('repaints the same event unchanged rather than restarting its floor', () => {
    const escape = notice(1, 'danger');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, escape, 0);

    // `main.ts` repaints on every worker message; a re-render of the same
    // event, long after it would otherwise have lapsed, must not extend the
    // floor or a busy render loop could hold a sentence forever.
    const repainted = admitToEventBand(shown.state, notice(1, 'danger'), EVENT_BAND_DWELL_FLOOR_MS * 10);
    expect(repainted.paint).toBe(escape);
    expect(repainted.state.shownAt).toBe(0);
  });

  it('shows the newest event outright once the floor has lapsed, releasing anything waiting first', () => {
    const first = notice(1, 'warning');
    const waiting = notice(2, 'warning');
    const third = notice(3, 'danger');

    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, first, 0);
    const held = admitToEventBand(shown.state, waiting, 1);
    expect(held.state.waiting).toBe(waiting);

    // `third` arrives after the floor has fully lapsed -- ordinary
    // replacement resumes, and what was waiting is released rather than
    // shown after something newer than it.
    const after = admitToEventBand(held.state, third, EVENT_BAND_DWELL_FLOOR_MS + 5);
    expect(after.paint).toBe(third);
    expect(after.state.waiting).toBeUndefined();
  });

  it('empties the band, including anything waiting, when the session ends', () => {
    const escape = notice(1, 'danger');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, escape, 0);
    const held = admitToEventBand(shown.state, notice(2, 'info'), 1);
    expect(held.state.waiting).toBeDefined();

    const ended = admitToEventBand(held.state, undefined, 2);
    expect(ended.paint).toBeUndefined();
    expect(ended.state).toEqual(EMPTY_EVENT_BAND_DWELL_STATE);
    expect(ended.wakeInMs).toBeUndefined();
  });

  it('repaints what is showing, rather than blanking the band, when the floor releases with nothing waiting', () => {
    const escape = notice(1, 'danger');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, escape, 0);

    const released = releaseEventBandFloor(shown.state, EVENT_BAND_DWELL_FLOOR_MS);
    expect(released.paint).toBe(escape);
    expect(released.state).toBe(shown.state);
    // The state is untouched, so `shownAt` is still 0 and what is left of the
    // escape's hold is the ceiling less the floor already spent.
    expect(released.wakeInMs).toBe(EVENT_BAND_HOLD_CEILING_MS - EVENT_BAND_DWELL_FLOOR_MS);
  });

  /**
   * **The half of #985 this module owns.** `HudViewModel.event` is sticky --
   * `src/main.ts` writes the field on the message that carried the event and
   * leaves it standing on every message after -- so the identical notice is
   * offered here on every publication for the rest of the session. Without the
   * `retired` guard the band would be emptied by its ceiling and raised again
   * by the next snapshot, up to twice a second, which is a flicker and not a
   * release: the grid row would come back, and #985's 24px with it.
   */
  it('does not raise a sentence the band has already let go of, however often it is re-offered', () => {
    const halted = notice(1, 'warning');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, halted, 0);
    const expired = advanceEventBand(shown.state, EVENT_BAND_HOLD_CEILING_MS);
    expect(expired.paint).toBeUndefined();

    let state = expired.state;
    for (const at of [EVENT_BAND_HOLD_CEILING_MS + 1, EVENT_BAND_HOLD_CEILING_MS + 500, 60_000]) {
      // A *different object* carrying the same ordinal, which is what a
      // rebuilt view model hands back: the guard is on the ordinal, not on
      // object identity.
      const decision = admitToEventBand(state, notice(1, 'warning'), at);
      expect(decision.paint, `the retired sentence was raised again at ${String(at)}`).toBeUndefined();
      expect(decision.state.showing).toBeUndefined();
      expect(decision.wakeInMs).toBeUndefined();
      state = decision.state;
    }
  });

  it('still shows a newer event after one has been let go of', () => {
    const halted = notice(1, 'warning');
    const riot = notice(2, 'danger');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, halted, 0);
    const expired = advanceEventBand(shown.state, EVENT_BAND_HOLD_CEILING_MS);

    const next = admitToEventBand(expired.state, riot, EVENT_BAND_HOLD_CEILING_MS + 10);
    expect(next.paint).toBe(riot);
    expect(next.state.showing).toBe(riot);
    expect(next.state.retired, 'a band that is speaking again is not retired').toBeUndefined();
    expect(next.wakeInMs).toBe(EVENT_BAND_HOLD_CEILING_MS);
  });

  it('ends the session cleanly from an expired band, so a reload starts at ordinal 1 again', () => {
    const halted = notice(1, 'warning');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, halted, 0);
    const expired = advanceEventBand(shown.state, EVENT_BAND_HOLD_CEILING_MS);
    expect(expired.state.retired).toBe(1);

    // `simulation/stopped` empties the field, and the next session's ordinals
    // start at 1 -- so the retirement has to go with the session or the first
    // event of the next prison would be swallowed by it.
    const ended = admitToEventBand(expired.state, undefined, EVENT_BAND_HOLD_CEILING_MS + 1);
    expect(ended.state).toEqual(EMPTY_EVENT_BAND_DWELL_STATE);
    expect(ended.state.retired).toBeUndefined();

    const reborn = admitToEventBand(ended.state, notice(1, 'info'), EVENT_BAND_HOLD_CEILING_MS + 2);
    expect(reborn.paint, 'the new session`s first event was swallowed by the old one`s retirement').toBeDefined();
  });
});

/**
 * The hold ceiling (#985): what the band does when nothing has replaced its
 * sentence and the row it occupies is still costing the rail 32px.
 *
 * Every case here is arithmetic on a passed-in clock reading, exactly as the
 * floor's are -- `advanceEventBand` is the one entry point `hud.ts`'s single
 * timer calls, and which of the two deadlines a firing serves is decided here
 * rather than in the DOM module.
 */
describe('advanceEventBand', () => {
  it('gives the row back once the hold ceiling has lapsed', () => {
    const halted = notice(1, 'warning');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, halted, 0);

    const expired = advanceEventBand(shown.state, EVENT_BAND_HOLD_CEILING_MS);

    // `undefined` is what `hud.ts` paints as `hidden`, and `.hud__event[hidden]`
    // is `display: none` -- so this value is the 32px of grid row, measured on
    // the assembled page at 900x600 as `.hud__rail` 450.8 -> 482.8 and the
    // Rooms panel's body 267 -> 291.
    expect(expired.paint).toBeUndefined();
    expect(expired.state.showing).toBeUndefined();
    expect(expired.state.waiting).toBeUndefined();
    expect(expired.state.retired).toBe(halted.sequence);
    expect(expired.wakeInMs, 'a band saying nothing has no deadline').toBeUndefined();
  });

  it('keeps the sentence, and asks for what is left, when the caller is early', () => {
    const halted = notice(1, 'warning');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, halted, 0);

    const early = advanceEventBand(shown.state, EVENT_BAND_HOLD_CEILING_MS - 1);

    expect(early.paint).toBe(halted);
    expect(early.state.showing).toBe(halted);
    expect(early.wakeInMs).toBe(1);
  });

  it('does not let a repaint extend the hold', () => {
    const halted = notice(1, 'warning');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, halted, 0);

    // The counts channel republishes the same sticky event up to twice a
    // second; each repaint asks for what is *left* of the hold, because
    // `shownAt` does not move.
    const repainted = admitToEventBand(shown.state, notice(1, 'warning'), 5_000);
    expect(repainted.paint).toBe(halted);
    expect(repainted.wakeInMs).toBe(EVENT_BAND_HOLD_CEILING_MS - 5_000);

    expect(advanceEventBand(repainted.state, EVENT_BAND_HOLD_CEILING_MS).paint).toBeUndefined();
  });

  it('releases a waiting sentence rather than expiring, when both deadlines have passed', () => {
    const escape = notice(1, 'danger');
    const allClear = notice(2, 'info');
    const shown = admitToEventBand(EMPTY_EVENT_BAND_DWELL_STATE, escape, 0);
    const held = admitToEventBand(shown.state, allClear, 1);
    expect(held.state.waiting).toBe(allClear);

    // A timer lost to a backgrounded tab is the case: both the floor and the
    // ceiling have lapsed by the time it fires. The waiting sentence has never
    // been painted at all, so it takes the line rather than being thrown away
    // with the row -- and it gets a whole hold of its own from this moment.
    const late = advanceEventBand(held.state, EVENT_BAND_HOLD_CEILING_MS + 1);

    expect(late.paint).toBe(allClear);
    expect(late.state.showing).toBe(allClear);
    expect(late.state.shownAt).toBe(EVENT_BAND_HOLD_CEILING_MS + 1);
    expect(late.wakeInMs).toBe(EVENT_BAND_HOLD_CEILING_MS);
  });

  it('repaints rather than blanking when it fires against a band that is already empty', () => {
    const decision = advanceEventBand(EMPTY_EVENT_BAND_DWELL_STATE, 10_000);
    expect(decision.paint).toBeUndefined();
    expect(decision.state).toBe(EMPTY_EVENT_BAND_DWELL_STATE);
    expect(decision.wakeInMs).toBeUndefined();
  });

  /**
   * The two numbers are one rule, and the ceiling being under the floor would
   * make them contradict each other on the same sentence: a sentence would be
   * owed the line by one and off it by the other. This is the assertion that
   * says so, rather than a reader having to compare two docblocks.
   */
  it('holds a sentence for longer than it owes it', () => {
    expect(EVENT_BAND_HOLD_CEILING_MS).toBeGreaterThan(EVENT_BAND_DWELL_FLOOR_MS);
  });
});

/**
 * `EventBandDwellState` is presentational, and this is the shape of that
 * claim: nothing in it is a branded simulation type, and the two clock-shaped
 * fields (`shownAt`, and `now` everywhere it is threaded through) are plain
 * numbers supplied by the caller. `tests/determinism/` is what actually
 * enforces the wall-clock boundary this state depends on; this test only
 * pins the shape so a future field cannot be added without being noticed
 * here first.
 */
describe('EMPTY_EVENT_BAND_DWELL_STATE', () => {
  it('has nothing showing and nothing waiting', () => {
    const empty: EventBandDwellState = EMPTY_EVENT_BAND_DWELL_STATE;
    expect(empty.showing).toBeUndefined();
    expect(empty.waiting).toBeUndefined();
    expect(empty.retired).toBeUndefined();
  });
});
