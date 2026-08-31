import type { LocalizationKey } from '../../content/localization';
import type { HudRefusalNoticeViewModel } from './view-model';

/**
 * What is on the refusal band, and what retires it (issues #207, #220, #492,
 * and the playtest of 2026-08-31).
 *
 * ## Why this is a module and not four `let`s inside `mountHud`
 *
 * It was four `let`s inside `mountHud` until this file existed, and the cost
 * was that **the band's lifetime rule could not be tested at all**.
 * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so every line
 * of `mountHud` is unreachable from `pnpm test` -- a mutation of the clearing
 * rule survived not because a test was missing but because no headless test
 * could observe it, and the only guard was `tests/browser/ui-shell.spec.ts`.
 * `docs/AGENT_WORKFLOW.md` names the answer for exactly this shape: "extract
 * the decision into a pure function, not to report a survivor: that is how
 * `orderPrisonsForDisplay` came to exist." This is the band's decision,
 * extracted. `hud.ts` keeps the DOM half and decides nothing.
 *
 * Pure, so proving it needs neither a browser nor a DOM: every function here
 * takes the state and an event and answers the next state.
 *
 * ## The three things that can happen to the line
 *
 * There is one line, so there is one sentence, and the most recently decided
 * refusal is the one on it. The producers are the two `RefusalLineSource`
 * members -- a command *this thread* threw on before sending it, and a
 * refusal the *simulation* decided after accepting one -- and the events are:
 *
 *   - **The host refused a command.** `refusalLineAfterHostRefusal`.
 *   - **The session published what it last refused.** `refusalLineAfterSimulationNotice`,
 *     which is called on every snapshot and therefore has to tell a
 *     republication of the sentence already showing from a new decision. That
 *     is what `seenSimulationSequence` is for.
 *   - **The player issued another command.** `refusalLineAfterCommandIssued`.
 *     See below -- this one is new.
 *
 * ## Why a new command retires the sentence
 *
 * **Both halves of this are corrections of a rule that shipped, and both are
 * marked rather than overwritten.** The rule was: a host refusal stands until
 * *the same action* later succeeds, and a simulation refusal until another
 * replaces it, the session ends, or (since #492) the simulation supersedes it
 * by later accepting the very command it refused. `hud.ts` argued that those
 * "are the first moments each sentence stops being true", and that is still
 * the right account of when a refusal stops being *true*.
 *
 * It is not the right account of how long it is worth *saying*, and the
 * playtest of 2026-08-31 measured the gap
 * (the record under `docs/research/` titled *Playing the twelve changes of
 * 2026-08-31*, §9 -- unmerged at the time of writing, which is why it is named
 * rather than linked): one *Remove* pressed on an empty tile left "Nothing was
 * removed -- there is no object on that tile, and none being built there."
 * across the top of the world for the rest of the session, still there four
 * in-game days later at 1280x800 and at 1920x1080, while the player was doing
 * something else entirely.
 *
 * The mechanism is not that #492's withdrawal is broken -- it works, and it is
 * keyed per target on purpose so that zoning room B cannot silence a still-true
 * refusal about room A. It is that **for a whole class of refusal the key can
 * never match again**, because the condition is a permanent property of the
 * target: `remove-object.nothing-to-remove` is withdrawn by a *successful
 * removal at that same tile*, which requires the player to build something
 * there and take it away. `zone.below-minimum-size` and `unzone.invalid-area`
 * are stronger still -- the key names the very rectangle whose shape is the
 * refusal, so the success that would withdraw them cannot exist. Truth was
 * never going to retire those sentences, and nothing else was trying to.
 *
 * So the band gains a second, weaker retirement that answers a different
 * question: **the band describes the player's most recent command, and the
 * next command is a newer one.** A sentence about the previous press is stale
 * the moment there is a later press to be about, whether or not it is still
 * true.
 *
 * Four properties are why this is the rule and not a timer:
 *
 *   - **Nothing clears without the player acting.** `hud.ts`'s objection to
 *     auto-dismissal is untouched and is quoted where it stands: a message
 *     that clears itself on a timer is a race against how fast the player
 *     reads. This clears on a press, which is not a race.
 *   - **The log is not touched.** `src/ui/simulation-alerts.ts` splits these
 *     surfaces -- "the band is the notice and the list is the log" -- and this
 *     is main-thread bookkeeping about the band alone. The alerts row keeps
 *     standing under its ordinal, so nothing is lost, only stopped being
 *     shouted. That is also why this is *not* done by clearing `RefusalLog`
 *     in the worker: `hudAlertsFromWorkerMessage` drops the log row when the
 *     wire says there is no refusal, so a worker-side retirement would delete
 *     the entry as well as the notice.
 *   - **It cannot be undone by the cadence.** `seenSimulationSequence`
 *     survives the retirement, so the counts channel republishing the same
 *     refusal beside a changed count -- up to twice a second -- does not put
 *     it back. A retirement that the next snapshot reversed would be worse
 *     than none.
 *   - **`aria-describedby` is given up at a moment the player is not reading
 *     it.** A host refusal marks the control that was pressed and points its
 *     description at this line, and the danger of any shortening is taking
 *     that description away mid-read. It is given up here only when the player
 *     has issued *another* command -- so the press that removes the
 *     description is the player's own move away from the control that had it,
 *     never the clock. A simulation refusal marks no control at all
 *     (`HudRefusalNoticeViewModel` names none, deliberately), which is the
 *     other half of why this is safe: the sentence the playtest measured had
 *     no accessible description hanging off it in the first place.
 *
 * A *chrome* change -- selecting a tab, folding a panel -- deliberately does
 * **not** retire the sentence. It is not a command, nothing was asked of the
 * prison, and the tab a player switches to is very often the one the refusal
 * just sent them to: taking the explanation away as they arrive at the control
 * that answers it is the opposite of the fix.
 */

/** Which producer decided the sentence on the line. */
export type RefusalLineSource = 'host' | 'simulation';

/** The sentence on the line, and what it is about. */
export interface RefusalLineNotice {
  readonly source: RefusalLineSource;
  /** A message key, never text. `hud.ts` resolves it (ADR 0011). */
  readonly labelKey: LocalizationKey;
  /**
   * The command kind behind a *host* refusal, which is what names the control
   * to mark. Absent for a simulation refusal: that command was accepted, and
   * was refused ticks later, possibly for a drag with no button behind it.
   */
  readonly action?: string;
}

export interface RefusalLineState {
  /** Absent while the band has nothing to say. */
  readonly notice?: RefusalLineNotice;
  /**
   * The ordinal of the simulation refusal last *taken from the view model* --
   * which is not the same as the one on the line, and outliving the notice is
   * the point. See the module comment's third bullet.
   */
  readonly seenSimulationSequence?: number;
}

/** Nothing has been refused yet, and nothing has been read off the wire. */
export const EMPTY_REFUSAL_LINE: RefusalLineState = {};

/**
 * The host threw on a command before it was sent, so the line is about the
 * control that was pressed.
 *
 * The newest refusal is the one on the line, so this replaces whatever was
 * there, including a simulation refusal. The ordinal is kept: taking the line
 * says nothing about which simulation refusal has been read.
 */
export function refusalLineAfterHostRefusal(
  state: RefusalLineState,
  actionId: string,
  labelKey: LocalizationKey,
): RefusalLineState {
  return { ...state, notice: { source: 'host', action: actionId, labelKey } };
}

/**
 * What the session says it last refused, from the snapshot the counts channel
 * publishes.
 *
 * Three cases, and the ordinal is what separates the middle one:
 *
 *   - **`undefined`** -- the session has refused nothing, has withdrawn what
 *     it refused (#492's supersession), or has ended. The line is emptied only
 *     if the simulation is what is on it: a host refusal decided on this
 *     thread is not the session's to withdraw.
 *   - **The same ordinal again.** A republication beside a changed count.
 *     Nothing happens -- in particular the line is not taken back from a host
 *     refusal the player has caused since, and a sentence this thread has
 *     already retired stays retired.
 *   - **A new ordinal.** The most recently decided refusal, so it takes the
 *     line.
 */
export function refusalLineAfterSimulationNotice(
  state: RefusalLineState,
  notice: HudRefusalNoticeViewModel | undefined,
): RefusalLineState {
  if (notice === undefined) {
    if (state.notice?.source === 'simulation') return EMPTY_REFUSAL_LINE;
    // `state` itself when there is nothing to change, and that is load-bearing
    // rather than an optimisation: this runs on every snapshot, and a fresh
    // object carrying the same sentence would have `hud.ts` rewrite the live
    // region's text twice a second, which is an announcement each time.
    if (state.seenSimulationSequence === undefined) return state;
    // The ordinal goes and the host's sentence stays. Written as two returns
    // rather than one spread because `exactOptionalPropertyTypes` is on: an
    // explicit `notice: undefined` is not the same type as an absent one.
    return state.notice === undefined ? EMPTY_REFUSAL_LINE : { notice: state.notice };
  }
  if (notice.sequence === state.seenSimulationSequence) return state;
  return {
    notice: { source: 'simulation', labelKey: notice.labelKey },
    seenSimulationSequence: notice.sequence,
  };
}

/**
 * The player asked the prison for something else, so whatever the band was
 * saying about the previous command stops being the notice.
 *
 * Called when a command is *issued* rather than when it succeeds, and the
 * difference is the case the success rule could not reach: a command that is
 * itself refused replaces the sentence anyway, and one that is accepted and
 * then refused ticks later would otherwise leave the previous press's sentence
 * standing over the wait. Issuing is also the only moment that is the
 * player's own, which is what the `aria-describedby` argument in the module
 * comment turns on.
 *
 * **A press that will be refused again empties the line and refills it**, and
 * that is the intended reading rather than a flicker to be designed out: a
 * band that never blanks cannot tell the player whether the sentence answers
 * the press they just made or the one before it. For a host refusal there is
 * nothing to see -- the throw rejects in a microtask, before the browser
 * paints -- and for a simulation refusal the gap is the round trip the answer
 * actually takes.
 *
 * The ordinal survives, or the next republication would undo this.
 */
export function refusalLineAfterCommandIssued(state: RefusalLineState): RefusalLineState {
  if (state.notice === undefined) return state;
  if (state.seenSimulationSequence === undefined) return EMPTY_REFUSAL_LINE;
  return { seenSimulationSequence: state.seenSimulationSequence };
}
