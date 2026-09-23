import type { SaveInventory } from '../../persistence/local/repository';
import type { ActiveSession, SessionLoadOutcome } from '../../persistence/session/session-controller';
import type { SavePanelLocalizer, SaveStatus } from '../save-panel';
import { describeLoadFailure, describeFailureDetail } from '../save-panel';
import { describeDeleteConfirmation, describeRestoreOutcome, describeSaveAge } from '../save-panel-delete';
import { SAVE_PANEL_MESSAGE_KEY as KEY } from '../save-panel-messages';
import { INITIAL_ACCOUNT_SESSION_STATE } from './account-session';
import { projectSaveList } from './save-list-projection';

/** Only the local routes that are connected in the shipped application. */
export interface ManageSavesSessions {
  listSaves(): Promise<SaveInventory>;
  getActiveSession(): ActiveSession | undefined;
  loadPrison(prisonId: string): Promise<SessionLoadOutcome>;
  deletePrison(prisonId: string): Promise<void>;
  restoreDeletedPrison(prisonId: string): Promise<'restored' | 'not-found' | 'window-closed' | 'slot-taken'>;
}

/**
 * The Manage tab's real local inventory. Cloud remains a sentence, never a
 * sign-in button: the application has no configured cloud client or sync flow.
 * The always-available quick-save panel stays in the rail on every tab.
 */
export class ManageSavesPanel {
  private readonly root: HTMLDetailsElement;
  private readonly list: HTMLUListElement;
  private readonly status: HTMLParagraphElement;
  private refreshToken = 0;
  private busy = false;
  private armedId: string | undefined;
  private lastRenderedSignature: string | undefined;
  private focusAfterRefresh: { readonly prisonId: string; readonly action: string } | 'summary' | undefined;

  constructor(
    private readonly sessions: ManageSavesSessions,
    parent: HTMLElement,
    private readonly localizer: SavePanelLocalizer,
    private readonly onInventoryChanged: () => Promise<void>,
  ) {
    this.root = document.createElement('details');
    this.root.className = 'manage-saves';
    const summary = document.createElement('summary');
    summary.textContent = this.text(KEY.manageTitle);
    this.root.append(summary);

    const local = document.createElement('h3');
    local.textContent = this.text(KEY.manageLocal);
    this.root.append(local);
    this.list = document.createElement('ul');
    this.list.className = 'manage-saves__list';
    this.root.append(this.list);

    this.status = document.createElement('p');
    this.status.className = 'manage-saves__status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.root.append(this.status);

    const cloud = document.createElement('p');
    cloud.className = 'manage-saves__cloud';
    cloud.textContent = this.text(KEY.manageCloudUnavailable);
    this.root.append(cloud);
    parent.append(this.root);
  }

  private text(key: Parameters<SavePanelLocalizer['format']>[0], parameters?: Parameters<SavePanelLocalizer['format']>[1]): string {
    return this.localizer.format(key, parameters);
  }

  private button(label: string, action: () => void, focusAction: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'manage-saves__button';
    button.textContent = label;
    button.dataset['focusAction'] = focusAction;
    button.disabled = this.busy;
    button.addEventListener('click', action);
    return button;
  }

  private setStatus(status: SaveStatus): void {
    this.status.textContent = this.text(status.messageKey, status.messageParameters);
    this.status.dataset['kind'] = status.kind;
  }

  private restoreFocus(): void {
    const target = this.focusAfterRefresh;
    this.focusAfterRefresh = undefined;
    if (target === undefined) return;
    if (target === 'summary') {
      this.root.querySelector('summary')?.focus();
      return;
    }
    const row = [...this.list.querySelectorAll<HTMLElement>('[data-prison-id]')]
      .find((item) => item.dataset['prisonId'] === target.prisonId);
    row?.querySelector<HTMLButtonElement>(`[data-focus-action="${target.action}"]`)?.focus();
  }

  private async perform(action: () => Promise<void>, failureKey: Parameters<SavePanelLocalizer['format']>[0]): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    for (const control of this.root.querySelectorAll<HTMLButtonElement>('button')) control.disabled = true;
    try {
      await action();
    } catch (error) {
      this.setStatus({ kind: 'error', messageKey: failureKey, messageParameters: { detail: describeFailureDetail(error, this.localizer) } });
    } finally {
      this.busy = false;
      await this.refresh();
      for (const control of this.root.querySelectorAll<HTMLButtonElement>('button')) control.disabled = false;
    }
  }

  /** Metadata only; no prison payload is loaded to paint the list. */
  async refresh(): Promise<void> {
    const token = ++this.refreshToken;
    let inventory: SaveInventory;
    try {
      inventory = await this.sessions.listSaves();
    } catch (error) {
      if (token === this.refreshToken) {
        this.setStatus({ kind: 'storage-unavailable', messageKey: KEY.statusListUnreadable, messageParameters: { detail: describeFailureDetail(error, this.localizer) } });
      }
      return;
    }
    if (token !== this.refreshToken) return;
    const rows = projectSaveList({
      account: INITIAL_ACCOUNT_SESSION_STATE,
      local: inventory.prisons,
      cloud: [],
      connectivity: 'offline',
    });
    if (this.armedId !== undefined && !rows.some((row) => row.prisonId === this.armedId)) this.armedId = undefined;
    const signature = JSON.stringify({ rows, deleted: inventory.deleted, active: this.sessions.getActiveSession()?.prisonId, armed: this.armedId });
    if (signature === this.lastRenderedSignature) {
      this.restoreFocus();
      return;
    }
    this.lastRenderedSignature = signature;
    this.list.replaceChildren();
    if (rows.length === 0 && inventory.deleted.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = this.text(KEY.listEmpty);
      this.list.append(empty);
      this.restoreFocus();
    }
    for (const row of rows) {
      const item = document.createElement('li');
      item.className = 'manage-saves__item';
      item.dataset['prisonId'] = row.prisonId;
      const named = row.displayName ?? row.prisonId;
      const name = document.createElement('span');
      name.className = 'manage-saves__name';
      name.textContent = this.text(KEY.listItem, { name: named, count: row.retainedGenerations });
      if (this.sessions.getActiveSession()?.prisonId === row.prisonId) name.dataset['active'] = 'true';
      item.append(name);
      item.append(this.button(this.text(KEY.actionLoad), () => {
        this.focusAfterRefresh = { prisonId: row.prisonId, action: 'load' };
        void this.perform(async () => {
          const result = await this.sessions.loadPrison(row.prisonId);
          this.setStatus(result.ok ? { kind: result.recovered ? 'recovered' : 'saved', messageKey: result.recovered ? KEY.statusRecovered : KEY.statusLoaded } : describeLoadFailure(result.reason));
          await this.onInventoryChanged();
        }, KEY.failureLoad);
      }, 'load'));
      item.append(this.button(this.text(KEY.actionDelete), () => {
        this.armedId = row.prisonId;
        this.focusAfterRefresh = { prisonId: row.prisonId, action: 'keep' };
        void this.refresh();
      }, 'delete'));
      if (this.armedId === row.prisonId) {
        const original = inventory.prisons.find((prison) => prison.prisonId === row.prisonId);
        if (original !== undefined) {
          const age = describeSaveAge(Date.now() - original.updatedAt);
          const question = document.createElement('span');
          question.className = 'manage-saves__confirm';
          question.textContent = this.text(describeDeleteConfirmation({ prisonId: row.prisonId, named, updatedAt: original.updatedAt }, this.text(age.messageKey, age.messageParameters)).messageKey, { name: named, age: this.text(age.messageKey, age.messageParameters) });
          item.append(question);
          item.append(this.button(this.text(KEY.actionDeleteCancel), () => {
            this.armedId = undefined;
            this.focusAfterRefresh = { prisonId: row.prisonId, action: 'delete' };
            void this.refresh();
          }, 'keep'));
          item.append(this.button(this.text(KEY.actionDeleteConfirm), () => {
            if (this.armedId !== row.prisonId) return;
            this.focusAfterRefresh = 'summary';
            void this.perform(async () => {
              await this.sessions.deletePrison(row.prisonId);
              this.armedId = undefined;
              this.setStatus({ kind: 'saved', messageKey: KEY.statusDeleted });
              await this.onInventoryChanged();
            }, KEY.failureDelete);
          }, 'confirm-delete'));
        }
      }
      this.list.append(item);
    }
    for (const deleted of inventory.deleted) {
      const item = document.createElement('li');
      item.className = 'manage-saves__item';
      item.dataset['deletedPrisonId'] = deleted.prisonId;
      const named = deleted.displayName ?? deleted.prisonId;
      const name = document.createElement('span');
      name.className = 'manage-saves__name';
      name.textContent = this.text(KEY.tombstoneItem, { name: named });
      item.append(name);
      item.append(this.button(this.text(KEY.actionTombstoneRestore), () => {
        this.focusAfterRefresh = { prisonId: deleted.prisonId, action: 'load' };
        void this.perform(async () => {
          const outcome = await this.sessions.restoreDeletedPrison(deleted.prisonId);
          const message = describeRestoreOutcome(outcome, named);
          this.setStatus({ kind: outcome === 'restored' ? 'recovered' : 'error', ...message });
          await this.onInventoryChanged();
        }, KEY.failureRestore);
      }, 'restore'));
      this.list.append(item);
    }
    this.restoreFocus();
  }
}
