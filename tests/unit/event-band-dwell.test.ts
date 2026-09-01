import { describe, expect, it } from 'vitest';
import type { HudEventNoticeViewModel } from '../../src/ui/hud/view-model';
import {
  EMPTY_EVENT_BAND_DWELL_STATE,
  EVENT_BAND_DWELL_FLOOR_MS,
  admitToEventBand,
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
      expect(decision.wakeInMs).toBeUndefined();
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
    expect(released.wakeInMs).toBeUndefined();
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
    // The floor restarts for the sentence now on the line, but nothing is
    // waiting behind it, so there is nothing to wake up for.
    expect(promoted.wakeInMs).toBeUndefined();

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
    expect(released.wakeInMs).toBeUndefined();
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
  });
});
