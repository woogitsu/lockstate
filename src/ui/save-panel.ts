import type { SaveResult } from '../persistence/local/repository';
import type { PrisonSlotMetadata } from '../persistence/local/store';
import type { SessionController } from '../persistence/session/session-controller';
import type { RestoredScope } from '../simulation/runtime/restore-session';

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

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.className = 'save-panel__button';
  element.addEventListener('click', onClick);
  return element;
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
 */
export class SavePanel {
  private readonly root: HTMLElement;
  private readonly statusElement: HTMLElement;
  private readonly listElement: HTMLElement;
  private readonly detailElement: HTMLElement;
  /** Monotonic guard so an older in-flight `refresh` can never repaint over a newer one. */
  private refreshToken = 0;

  public constructor(
    private readonly controller: SessionController,
    parent: HTMLElement,
  ) {
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
      button('New prison', () => void this.handleCreate()),
      button('Save now', () => void this.handleSaveNow()),
      button('Export', () => void this.handleExport()),
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
   */
  public async refresh(): Promise<void> {
    const token = ++this.refreshToken;

    let prisons: readonly PrisonSlotMetadata[];
    try {
      prisons = await this.controller.listPrisons();
    } catch (error) {
      if (token !== this.refreshToken) return;
      this.setStatus({ kind: 'storage-unavailable', message: `Local storage is unavailable (private browsing can cause this): ${error instanceof Error ? error.message : String(error)}` });
      return;
    }

    if (token !== this.refreshToken) return; // a newer refresh started while this one was reading

    this.listElement.replaceChildren();
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
        button('Load', () => void this.handleLoad(prison.prisonId)),
        button('Delete', () => void this.handleDelete(prison.prisonId)),
      );
      this.listElement.append(item);
    }
  }

  private async handleCreate(): Promise<void> {
    const prisonId = `prison-${Date.now().toString(36)}`;
    this.setStatus({ kind: 'saving', message: 'Creating prison…' });
    try {
      const result = await this.controller.createPrison(prisonId, 'New Prison');
      this.setStatus(describeSaveResult(result));
    } catch (error) {
      this.setStatus({ kind: 'storage-unavailable', message: `Could not create a prison: ${error instanceof Error ? error.message : String(error)}` });
    }
    await this.refresh();
  }

  private async handleSaveNow(): Promise<void> {
    if (this.controller.getActiveSession() === undefined) {
      this.setStatus({ kind: 'idle', message: 'No active prison — create or load one first.' });
      return;
    }
    this.setStatus({ kind: 'saving', message: 'Saving…' });
    const result = await this.controller.saveNow();
    this.setStatus(describeSaveResult(result));
    await this.refresh();
  }

  private async handleLoad(prisonId: string): Promise<void> {
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
  }

  private async handleDelete(prisonId: string): Promise<void> {
    await this.controller.deletePrison(prisonId);
    this.setStatus({ kind: 'idle', message: 'Prison deleted.' });
    this.setDetail('');
    await this.refresh();
  }

  /**
   * Serializes the active prison to a downloadable file. The export itself
   * round-trips through the repository's schema/checksum validation before
   * it is ever offered, so a corrupt save can never be exported as if it
   * were good.
   */
  private async handleExport(): Promise<void> {
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
  }
}
