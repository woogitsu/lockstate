/**
 * The single place the UI layer is allowed to start an asynchronous action
 * from a user gesture.
 *
 * Issue #65 is what this exists for. Every save-panel handler was wired as
 * `() => void this.handleX()`, which has two defects that always travel
 * together:
 *
 *   1. **Re-entrancy.** Nothing stopped a second click from starting a
 *      second request while the first was still in flight. Two "New prison"
 *      clicks in quick succession wrote a slot row, then blocked for 15s on
 *      a simulation worker that was already busy with the first session, and
 *      left a `New Prison (0 gen)` orphan behind.
 *   2. **A discarded promise.** `void promise` is precisely the construct
 *      that lets a rejection reach `window.onunhandledrejection`. The
 *      existing `handleCreate` proved the hazard: its `try/catch` wrapped
 *      the call it expected to fail and left the following `await
 *      this.refresh()` outside, so it caught the error it anticipated and
 *      not the one it did not.
 *
 * A gate fixes both at once, and it is a *primitive* rather than a
 * save-panel detail because every later panel and the HUD's own transport
 * controls need exactly the same discipline. A gate is single-slot on
 * purpose: a queue would still run the refused action, just later, which is
 * not what "the button is busy" means to a player.
 */

import {
  type FocusOwner,
  type FocusableControl,
  ambientFocusOwner,
  canTakeFocus,
  handOffFocus,
  holdsFocus,
  keyboardIsUnclaimed,
} from './focus-handoff';

export type AsyncActionOutcome = 'started' | 'refused-busy' | 'refused-disposed';

export interface AsyncActionFailure {
  /** The `actionId` passed to `run`, so a report names which control failed. */
  readonly actionId: string;
  readonly error: unknown;
}

export interface AsyncActionGateOptions {
  /**
   * Called on every busy transition, and only on transitions. Wire this to
   * whatever disables the controls -- one signal, so the enabled state
   * cannot drift out of sync with what is actually in flight.
   */
  readonly onBusyChange?: (busy: boolean) => void;
  /**
   * Called for every failure, synchronous throw or rejection alike. It is
   * required: a gate with nowhere to report to would be the same silent
   * discard this class exists to remove.
   */
  readonly onError: (failure: AsyncActionFailure) => void;
}

export class AsyncActionGate {
  private active: string | undefined;
  private disposed = false;
  private settled: Promise<void> = Promise.resolve();

  public constructor(private readonly options: AsyncActionGateOptions) {}

  public get busy(): boolean {
    return this.active !== undefined;
  }

  /** Which action is in flight, for a status line or a test assertion. */
  public get activeActionId(): string | undefined {
    return this.active;
  }

  /**
   * Runs `action` unless one is already in flight.
   *
   * Returns synchronously so a click handler never has a promise to
   * discard, and reports the refusal explicitly rather than silently doing
   * nothing -- a caller that wants to say "already saving" can.
   */
  public run(actionId: string, action: () => Promise<void>): AsyncActionOutcome {
    if (this.disposed) return 'refused-disposed';
    if (this.active !== undefined) return 'refused-busy';

    this.active = actionId;
    this.options.onBusyChange?.(true);

    // `action()` may throw synchronously (a bad argument, a null element)
    // before it ever returns a promise; that must clear the gate too, or one
    // programming error leaves every control disabled forever.
    let running: Promise<void>;
    try {
      running = action();
    } catch (error) {
      this.finish(actionId, true, error);
      return 'started';
    }

    this.settled = running.then(
      () => {
        this.finish(actionId, false, undefined);
      },
      (error: unknown) => {
        // A rejection value of `undefined` is still a rejection, so failure
        // is carried by its own flag rather than inferred from the value.
        this.finish(actionId, true, error);
      },
    );
    return 'started';
  }

  /**
   * Resolves once the in-flight action has settled (or immediately when
   * idle). A test hook and a disposal hook -- never a way for a caller to
   * wait out the gate and then re-issue a refused action.
   */
  public async whenSettled(): Promise<void> {
    await this.settled;
  }

  /** After disposal every `run` is refused and no callback fires again. */
  public dispose(): void {
    this.disposed = true;
    this.active = undefined;
  }

  private finish(actionId: string, failed: boolean, error: unknown): void {
    if (this.active !== actionId) return; // disposed mid-flight
    this.active = undefined;
    if (this.disposed) return;
    if (failed) this.options.onError({ actionId, error });
    this.options.onBusyChange?.(false);
  }
}

/**
 * Anything the gate can disable. Deliberately structural, so a fieldset or a
 * link-button fits.
 *
 * It is a `FocusableControl` as well, because disabling the control a player
 * is standing on is how the group takes the keyboard away and giving it back
 * is the same object's job. Every part of that half is optional, so the stubs
 * that only ever needed `disabled` and `setAttribute` still satisfy this.
 */
export interface BusyControl extends FocusableControl {
  disabled: boolean;
  setAttribute(name: string, value: string): void;
}

/**
 * Keeps a set of controls disabled for exactly as long as the gate is busy.
 *
 * `aria-busy` rather than `aria-disabled`: the controls really are disabled,
 * which assistive technology already reports, and `aria-busy` is what says
 * *why*.
 *
 * ### And gives the keyboard back (the accessibility playtest of 2026-08-29)
 *
 * Disabling the element that holds focus blurs it, and re-enabling it does not
 * undo that. Every command-issuing control in the HUD shares one group
 * (`src/ui/hud/hud.ts`), so before this a keyboard player was returned to the
 * top of the document by *every command in the game* -- Buy, Place order,
 * Designate, Hire, Admit and every transport press -- whether it succeeded or
 * was refused. Measured on the assembled page, keyboard-only: focus was on
 * `<body>` after each of them.
 *
 * So the group remembers which of *its own* controls held the keyboard when it
 * disabled them, and puts it back when it re-enables them. Three conditions,
 * and each is a case that really occurs here rather than a defensive nicety --
 * see `src/ui/primitives/focus-handoff.ts` for the predicates and
 * `tests/unit/ui-async-action-gate.test.ts` for what each one costs if it is
 * dropped:
 *
 *   - **Only focus the group actually took.** If nothing it disabled held the
 *     keyboard, it has nothing to give back. The Rooms panel's confirm control
 *     hides itself before it dispatches, so it is already blurred by the time
 *     the group sees it; that hand-off is the panel's, not this one's.
 *   - **Only while the keyboard is still going spare.** A player who tabbed
 *     away during the request has put focus somewhere deliberately, and taking
 *     it back would be a worse bug than the one this fixes.
 *   - **Only onto a control that can hold it.** Detached, hidden or still
 *     disabled for a reason of its own -- nothing is focused and the keyboard
 *     is left where the browser put it.
 *
 * The optional `focusKey` on `add` covers the fourth case: a group whose
 * members are *rebuilt* during the busy period. The save panel re-renders its
 * rows inside the action (`src/ui/save-panel.ts`), so the button that was
 * pressed is detached by the time the group re-enables and the element the
 * group remembered can never be focused again. A key names the control by what
 * it *does* rather than by which DOM node is currently doing it, so the
 * rebuilt row's own button inherits the keyboard.
 */
export interface BusyGroup {
  /**
   * Registers a control. It immediately takes the group's current busy state.
   *
   * `focusKey` is optional and only matters for a control that is rebuilt
   * rather than reused: two controls registered under the same key are the
   * same control as far as giving focus back is concerned. Omit it for a
   * control that is built once and lives as long as its panel.
   */
  add(control: BusyControl, focusKey?: string): void;
  /**
   * Forgets every registered control without changing the busy state.
   *
   * For a group whose members are rebuilt -- a list re-rendered on each
   * refresh. Without it the group would retain a reference to every button
   * the panel has ever created.
   */
  clear(): void;
  setBusy(busy: boolean): void;
}

export interface BusyGroupOptions {
  /**
   * Where the keyboard is. Defaults to the ambient document.
   *
   * A parameter so this is unit-testable headlessly, which is the point of the
   * seam `isTextEntryFocused` opens for the same reason (`src/input/focus.ts`).
   * The only production callers have no reason to name it.
   */
  readonly focusOwner?: FocusOwner | undefined;
}

interface BusyMember {
  readonly control: BusyControl;
  readonly focusKey: string | undefined;
}

export function createBusyGroup(options: BusyGroupOptions = {}): BusyGroup {
  let members: BusyMember[] = [];
  let busy = false;
  /** The member the group took the keyboard from, for as long as it holds it. */
  let borrowed: BusyMember | undefined;

  const focusOwner = (): FocusOwner | undefined => options.focusOwner ?? ambientFocusOwner();

  const apply = (control: BusyControl): void => {
    control.disabled = busy;
    control.setAttribute('aria-busy', busy ? 'true' : 'false');
  };

  /** Which member holds the keyboard right now, if any of them does. */
  const focusedMember = (): BusyMember | undefined => {
    const owner = focusOwner();
    return members.find((member) => holdsFocus(owner, member.control));
  };

  /**
   * Where the keyboard goes back to: the same control if it is still usable,
   * otherwise whichever member now answers to the same `focusKey`.
   *
   * The remembered element is looked up in `members` rather than used
   * directly, so a control that `clear()` dropped is not focused by a group
   * that no longer manages it -- and did not re-enable it either.
   */
  const restoreTarget = (memory: BusyMember): BusyControl | undefined => {
    const still = members.find((member) => member.control === memory.control);
    if (still !== undefined && canTakeFocus(still.control)) return still.control;
    if (memory.focusKey === undefined) return undefined;
    return members.find((member) => member.focusKey === memory.focusKey && canTakeFocus(member.control))
      ?.control;
  };

  const giveTheKeyboardBack = (): void => {
    const memory = borrowed;
    borrowed = undefined;
    if (memory === undefined) return;
    if (!keyboardIsUnclaimed(focusOwner())) return;
    handOffFocus(restoreTarget(memory));
  };

  return {
    add(control: BusyControl, focusKey?: string): void {
      members.push({ control, focusKey });
      apply(control);
    },
    clear(): void {
      members = [];
    },
    setBusy(next: boolean): void {
      // Read before anything is disabled: once `apply` has run, the browser has
      // already blurred whatever was standing on a control this group owns and
      // there is nothing left to remember.
      if (next && !busy) borrowed = focusedMember();
      busy = next;
      for (const member of members) apply(member.control);
      // And given back after every control is live again, or the control being
      // focused would be the one still carrying `disabled`.
      if (!next) giveTheKeyboardBack();
    },
  };
}

/**
 * Runs a fire-and-forget notification without letting a rejection escape.
 *
 * The counterpart to the gate, for the case where blocking would be *worse*
 * than a duplicate: telling the host that a tab was selected or a panel
 * folded. Those are chrome changes that have already happened locally, so
 * they must never wait on the host and must never be refused -- but they
 * still may not reject into the void, which is the other half of issue #65.
 */
export function runReported(
  actionId: string,
  action: () => void | Promise<void>,
  onError: (failure: AsyncActionFailure) => void,
): void {
  try {
    const result = action();
    if (result === undefined) return;
    void result.catch((error: unknown) => {
      onError({ actionId, error });
    });
  } catch (error) {
    onError({ actionId, error });
  }
}

/** Normalizes whatever a failure carried into something a status line can show. */
export function describeActionError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
