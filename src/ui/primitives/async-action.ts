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

/** Anything the gate can disable. Deliberately structural, so a fieldset or a link-button fits. */
export interface BusyControl {
  disabled: boolean;
  setAttribute(name: string, value: string): void;
}

/**
 * Keeps a set of controls disabled for exactly as long as the gate is busy.
 *
 * `aria-busy` rather than `aria-disabled`: the controls really are disabled,
 * which assistive technology already reports, and `aria-busy` is what says
 * *why*.
 */
export interface BusyGroup {
  /** Registers a control. It immediately takes the group's current busy state. */
  add(control: BusyControl): void;
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

export function createBusyGroup(): BusyGroup {
  let controls: BusyControl[] = [];
  let busy = false;

  const apply = (control: BusyControl): void => {
    control.disabled = busy;
    control.setAttribute('aria-busy', busy ? 'true' : 'false');
  };

  return {
    add(control: BusyControl): void {
      controls.push(control);
      apply(control);
    },
    clear(): void {
      controls = [];
    },
    setBusy(next: boolean): void {
      busy = next;
      for (const control of controls) apply(control);
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
