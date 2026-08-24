import type { SaveResult } from '../persistence/local/repository';
import type { PrisonSlotMetadata } from '../persistence/local/store';
import type { SaveEnvelope } from '../persistence/save-schema';
import type { ActiveSession, SessionLoadOutcome } from '../persistence/session/session-controller';
import type { RestoredScope } from '../simulation/runtime/restore-session';
import {
  type AsyncActionFailure,
  type AsyncActionOutcome,
  type BusyGroup,
  AsyncActionGate,
  createBusyGroup,
  describeActionError,
} from './primitives/async-action';

/**
 * Distinct user-facing recovery/failure states -- issue #19's "quota,
 * private-mode and transaction-abort errors are distinct recoverable
 * states" and "storage quota/error handling and user-facing recovery
 * states." Each maps to different advice, so they must not collapse into
 * one "save failed" string.
 */
export type SaveStatusKind = 'idle' | 'saving' | 'saved' | 'recovered' | 'quota-exceeded' | 'transaction-aborted' | 'storage-unavailable' | 'error';

export interface SaveStatus {
  readonly kind: SaveStatusKind;
  readonly message: string;
}

/** The panel's actions, named so a failure can say which one failed. */
export type SavePanelActionId = 'create' | 'save' | 'load' | 'delete' | 'export';

export function describeSaveResult(result: SaveResult): SaveStatus {
  if (result.ok) return { kind: 'saved', message: `Saved (generation ${result.generationId}).` };
  switch (result.error.code) {
    case 'quota-exceeded':
      return { kind: 'quota-exceeded', message: 'Storage is full. Delete an old prison or export and remove saves to free space. Your previous save is intact.' };
    case 'transaction-aborted':
      return { kind: 'transaction-aborted', message: 'The browser interrupted the save. Your previous save is intact — try saving again.' };
    default:
      return { kind: 'error', message: `Save failed: ${result.error.message}` };
  }
}

export function describeRestoredScope(scope: RestoredScope): string {
  return `Restored: ${scope.restored.join(', ')}. Not carried by this save version: ${scope.notCarriedByThisSaveVersion.join(', ')}.`;
}

const ACTION_DESCRIPTIONS: Readonly<Record<SavePanelActionId, string>> = {
  create: 'Creating the prison failed',
  save: 'Saving failed',
  load: 'Loading failed',
  delete: 'Deleting failed',
  export: 'Exporting failed',
};

/**
 * Turns an escaped failure into a status line.
 *
 * Nothing should reach this: every handler classifies the failures it
 * expects. It exists because "should not happen" is not a guarantee, and the
 * alternative -- issue #65's `void this.handleX()` -- put the message in the
 * developer console where a player never sees it while the UI sat silently
 * on a stale state.
 */
export function describeActionFailure(failure: AsyncActionFailure): SaveStatus {
  const actionId = failure.actionId as SavePanelActionId;
  const prefix = ACTION_DESCRIPTIONS[actionId] ?? 'The action failed';
  return { kind: 'error', message: `${prefix}: ${describeActionError(failure.error)}` };
}

/**
 * The slice of `SessionController` this panel uses.
 *
 * Structural rather than the concrete class, so the panel can be driven by a
 * stub in a browser test without standing up IndexedDB and a simulation
 * worker. `SessionController` satisfies it as written, so `main.ts` needs no
 * change.
 */
export interface SavePanelSessions {
  listPrisons(): Promise<readonly PrisonSlotMetadata[]>;
  getActiveSession(): ActiveSession | undefined;
  createPrison(prisonId: string, displayName?: string): Promise<SaveResult>;
  saveNow(): Promise<SaveResult>;
  loadPrison(prisonId: string): Promise<SessionLoadOutcome>;
  deletePrison(prisonId: string): Promise<void>;
  exportActive(): Promise<SaveEnvelope | undefined>;
}

/**
 * A deliberately minimal DOM save/load panel -- the first real consumer of
 * the local-first persistence stack, and the piece issue #19 was left open
 * for ("wiring the repository into the app... there's no session/save UI
 * yet to drive create/save/load").
 *
 * This is plain DOM sitting beside the Phaser canvas, not a Phaser UI
 * scene: `AGENTS.md` requires that "the main thread owns rendering,
 * browser UI and input orchestration" and that "rendering is not
 * simulation." Save/load is browser UI over persistence, so it has no
 * business inside the renderer's scene graph. It reads only the
 * controller's own projections and never reaches into simulation state.
 *
 * **Concurrency (issue #65).** Every action runs through one
 * `AsyncActionGate`. That is the single piece of panel state deciding
 * whether the controls are live: while a request is outstanding the buttons
 * are disabled *and* a request that somehow still arrives is refused, and
 * every rejection is reported rather than discarded. Two "New prison" taps
 * in quick succession used to write a slot row, block 15s on a simulation
 * worker already busy with the first session, and leave a `New Prison (0
 * gen)` orphan behind with the timeout escaping to the console.
 */
export class SavePanel {
  private readonly root: HTMLElement;
  private readonly statusElement: HTMLElement;
  private readonly listElement: HTMLElement;
  private readonly detailElement: HTMLElement;
  /** The three header actions, registered once. */
  private readonly busy = createBusyGroup();
  /** Per-row Load/Delete buttons, discarded and re-registered on every refresh. */
  private readonly rowBusy = createBusyGroup();
  private readonly gate: AsyncActionGate;
  /** Monotonic guard so an older in-flight `refresh` can never repaint over a newer one. */
  private refreshToken = 0;

  public constructor(
    private readonly controller: SavePanelSessions,
    parent: HTMLElement,
  ) {
    this.gate = new AsyncActionGate({
      onBusyChange: (busy) => {
        this.busy.setBusy(busy);
        this.rowBusy.setBusy(busy);
      },
      // The backstop issue #65 was missing. A handler is expected to
      // classify its own failures; anything that escapes still reaches the
      // player instead of `window.onunhandledrejection`.
      onError: (failure) => {
        this.setStatus(describeActionFailure(failure));
      },
    });

    this.root = document.createElement('aside');
    this.root.className = 'save-panel';
    this.root.setAttribute('aria-label', 'Prison saves');

    const heading = document.createElement('h2');
    heading.className = 'save-panel__heading';
    heading.textContent = 'Prisons';
    this.root.append(heading);

    const actions = document.createElement('div');
    actions.className = 'save-panel__actions';
    actions.append(
      this.button(this.busy, 'New prison', () => this.requestCreate()),
      this.button(this.busy, 'Save now', () => this.requestSaveNow()),
      this.button(this.busy, 'Export', () => this.requestExport()),
    );
    this.root.append(actions);

    this.listElement = document.createElement('ul');
    this.listElement.className = 'save-panel__list';
    this.root.append(this.listElement);

    this.statusElement = document.createElement('p');
    this.statusElement.className = 'save-panel__status';
    this.statusElement.setAttribute('role', 'status');
    this.statusElement.setAttribute('aria-live', 'polite');
    this.root.append(this.statusElement);

    this.detailElement = document.createElement('p');
    this.detailElement.className = 'save-panel__detail';
    this.root.append(this.detailElement);

    parent.append(this.root);
    this.setStatus({ kind: 'idle', message: 'Local saves only — no network required.' });
  }

  /** True while a request is outstanding. The one signal the controls are driven from. */
  public isBusy(): boolean {
    return this.gate.busy;
  }

  /** Resolves once the outstanding action has settled. A test and teardown hook. */
  public async whenSettled(): Promise<void> {
    await this.gate.whenSettled();
  }

  public dispose(): void {
    this.gate.dispose();
    this.root.remove();
  }

  public setStatus(status: SaveStatus): void {
    this.statusElement.textContent = status.message;
    this.statusElement.dataset.kind = status.kind;
  }

  private setDetail(text: string): void {
    this.detailElement.textContent = text;
  }

  /** Surfaces a background autosave outcome without stealing focus or clearing the detail line. */
  public reportBackgroundSave(result: SaveResult): void {
    this.setStatus(describeSaveResult(result));
  }

  /**
   * Re-reads the slot list and re-renders.
   *
   * Guarded by a monotonic token because `refresh` is async and callers
   * can overlap it (a click landing while an earlier action's refresh is
   * still awaiting storage). Without the guard, whichever read *resolves*
   * last wins rather than whichever *started* last, so a slower earlier
   * refresh can repaint stale data over a newer one — observed in a real
   * browser as a generation count that lagged one save behind.
   *
   * Deliberately *not* gated: every handler ends by calling it from inside
   * its own gated action, and a nested `run` would be refused as re-entrant.
   */
  public async refresh(): Promise<void> {
    const token = ++this.refreshToken;

    let prisons: readonly PrisonSlotMetadata[];
    try {
      prisons = await this.controller.listPrisons();
    } catch (error) {
      if (token !== this.refreshToken) return;
      // Two different causes reach here: local storage being unusable at all
      // (private browsing, a denied quota) and a slot record that fails
      // validation (`slot-metadata-schema.ts`, #105 finding 14), which refuses
      // the whole list rather than hiding a prison. The wording names the
      // outcome the player has rather than asserting one of the two causes;
      // the appended detail says which it was.
      this.setStatus({ kind: 'storage-unavailable', message: `Could not read the local prison list (private browsing or an unreadable slot record can cause this): ${describeActionError(error)}` });
      return;
    }

    if (token !== this.refreshToken) return; // a newer refresh started while this one was reading

    this.listElement.replaceChildren();
    // The row buttons about to be discarded are also dropped from the busy
    // group, so it does not accumulate a reference to every button the panel
    // has ever rendered.
    this.rowBusy.clear();
    const activeId = this.controller.getActiveSession()?.prisonId;

    if (prisons.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'save-panel__empty';
      empty.textContent = 'No prisons yet.';
      this.listElement.append(empty);
      return;
    }

    for (const prison of [...prisons].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const item = document.createElement('li');
      item.className = 'save-panel__item';
      if (prison.prisonId === activeId) item.dataset.active = 'true';

      const label = document.createElement('span');
      label.className = 'save-panel__item-label';
      label.textContent = `${prison.displayName ?? prison.prisonId} (${prison.generationIds.length} gen)`;
      item.append(label);

      item.append(
        this.button(this.rowBusy, 'Load', () => this.requestLoad(prison.prisonId)),
        this.button(this.rowBusy, 'Delete', () => this.requestDelete(prison.prisonId)),
      );
      this.listElement.append(item);
    }
  }

  /*
   * The public request API. Each returns synchronously, so no caller ever
   * has a promise to discard, and returns the gate's decision so a test (or
   * the browser harness) can assert that a second attempt was *refused*
   * rather than issued.
   */

  public requestCreate(): AsyncActionOutcome {
    return this.start('create', async () => {
      const prisonId = `prison-${Date.now().toString(36)}`;
      this.setStatus({ kind: 'saving', message: 'Creating prison…' });
      try {
        this.setStatus(describeSaveResult(await this.controller.createPrison(prisonId, 'New Prison')));
      } catch (error) {
        this.setStatus({ kind: 'error', message: `Could not create a prison: ${describeActionError(error)}` });
      }
      // Inside the try/catch-protected action, so a failure here reaches the
      // player too. Issue #65: the old code left this call outside the
      // `try`, which caught the error it expected and not the one it did not.
      await this.refresh();
    });
  }

  public requestSaveNow(): AsyncActionOutcome {
    return this.start('save', async () => {
      if (this.controller.getActiveSession() === undefined) {
        this.setStatus({ kind: 'idle', message: 'No active prison — create or load one first.' });
        return;
      }
      this.setStatus({ kind: 'saving', message: 'Saving…' });
      this.setStatus(describeSaveResult(await this.controller.saveNow()));
      await this.refresh();
    });
  }

  public requestLoad(prisonId: string): AsyncActionOutcome {
    return this.start('load', async () => {
      this.setStatus({ kind: 'saving', message: 'Loading…' });
      const outcome = await this.controller.loadPrison(prisonId);

      if (!outcome.ok) {
        this.setStatus({
          kind: 'error',
          message: outcome.reason === 'not-found'
            ? 'That prison no longer exists.'
            : 'No readable save generation remains for this prison. Every retained copy failed validation.',
        });
        await this.refresh();
        return;
      }

      this.setStatus(
        outcome.recovered
          ? { kind: 'recovered', message: 'The most recent save was unreadable — recovered an earlier verified generation.' }
          : { kind: 'saved', message: 'Loaded.' },
      );
      this.setDetail(describeRestoredScope(outcome.scope));
      await this.refresh();
    });
  }

  public requestDelete(prisonId: string): AsyncActionOutcome {
    return this.start('delete', async () => {
      await this.controller.deletePrison(prisonId);
      this.setStatus({ kind: 'idle', message: 'Prison deleted.' });
      this.setDetail('');
      await this.refresh();
    });
  }

  /**
   * Serializes the active prison to a downloadable file. The export itself
   * round-trips through the repository's schema/checksum validation before
   * it is ever offered, so a corrupt save can never be exported as if it
   * were good.
   */
  public requestExport(): AsyncActionOutcome {
    return this.start('export', async () => {
      const envelope = await this.controller.exportActive();
      if (envelope === undefined) {
        this.setStatus({ kind: 'idle', message: 'Nothing to export — no valid active save.' });
        return;
      }

      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${envelope.prisonId}.lockstate.json`;
      link.click();
      URL.revokeObjectURL(url);
      this.setStatus({ kind: 'saved', message: 'Exported the current save.' });
    });
  }

  private start(actionId: SavePanelActionId, action: () => Promise<void>): AsyncActionOutcome {
    return this.gate.run(actionId, action);
  }

  private button(group: BusyGroup, label: string, onClick: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.className = 'save-panel__button';
    element.addEventListener('click', onClick);
    // Registered at creation, so a row rebuilt by `refresh` during a busy
    // period comes back disabled rather than live.
    group.add(element);
    return element;
  }
}
