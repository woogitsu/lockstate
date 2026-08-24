import type { LocalizationKey } from '../content/localization';
import type { SaveResult } from '../persistence/local/repository';
import type { PrisonSlotMetadata } from '../persistence/local/store';
import type { SaveEnvelope } from '../persistence/save-schema';
import type { ActiveSession, SessionLoadOutcome } from '../persistence/session/session-controller';
import type { MessageParameters } from '../services/localization/format';
import type { RestoredScope, RestoredScopeEntry } from '../simulation/runtime/restore-session';
import {
  type AsyncActionFailure,
  type AsyncActionOutcome,
  type BusyGroup,
  AsyncActionGate,
  createBusyGroup,
  describeActionError,
} from './primitives/async-action';
import { SAVE_PANEL_MESSAGE_KEY } from './save-panel-messages';

/**
 * The localization surface this panel uses.
 *
 * A structural port rather than the concrete `Localizer`, exactly as
 * `HudLocalizer` is: two methods, so the panel is drivable from a test stub,
 * and `Localizer` satisfies it as written.
 */
export interface SavePanelLocalizer {
  format(key: LocalizationKey, parameters?: MessageParameters): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
}


/**
 * Distinct user-facing recovery/failure states -- issue #19's "quota,
 * private-mode and transaction-abort errors are distinct recoverable
 * states" and "storage quota/error handling and user-facing recovery
 * states." Each maps to different advice, so they must not collapse into
 * one "save failed" string.
 */
export type SaveStatusKind = 'idle' | 'saving' | 'saved' | 'recovered' | 'quota-exceeded' | 'transaction-aborted' | 'storage-unavailable' | 'error';

/**
 * A message key and its parameters (ADR 0011).
 *
 * The panel's pure mapping functions produce these and the DOM resolves them
 * at the last possible moment, the same split `src/ui/hud/projection.ts` and
 * `src/ui/hud/hud.ts` already use. It is what makes the mappings provable in
 * the default `node` Vitest environment while the text they choose stays a
 * catalog entry rather than a literal in a module.
 *
 * The **key** is never text. A *parameter* may be, and two are: `{detail}`
 * carries a thrown `Error.message`, which is diagnostic English from
 * `src/persistence/**` travelling as data; and `{restored}`/`{notCarried}`
 * carry scope labels already resolved through the same localizer (#226),
 * because a list spliced into a sentence has to be resolved before it can be
 * joined. Neither is a literal authored in this module, which is the property
 * that matters.
 */
export interface SaveMessage {
  readonly messageKey: LocalizationKey;
  readonly messageParameters?: MessageParameters;
}

export interface SaveStatus extends SaveMessage {
  readonly kind: SaveStatusKind;
}

/** The panel's actions, named so a failure can say which one failed. */
export type SavePanelActionId = 'create' | 'save' | 'load' | 'delete' | 'export';

export function describeSaveResult(result: SaveResult): SaveStatus {
  if (result.ok) {
    return {
      kind: 'saved',
      messageKey: SAVE_PANEL_MESSAGE_KEY.statusSaved,
      // A generation id is a stable identifier, not copy: it is shown so a
      // player reporting a problem can name the exact save.
      messageParameters: { generation: result.generationId },
    };
  }
  switch (result.error.code) {
    case 'quota-exceeded':
      return { kind: 'quota-exceeded', messageKey: SAVE_PANEL_MESSAGE_KEY.statusQuotaExceeded };
    case 'transaction-aborted':
      return { kind: 'transaction-aborted', messageKey: SAVE_PANEL_MESSAGE_KEY.statusTransactionAborted };
    default:
      return {
        kind: 'error',
        messageKey: SAVE_PANEL_MESSAGE_KEY.statusSaveFailed,
        messageParameters: { detail: result.error.message },
      };
  }
}

/**
 * `', '` is the separator #208 shipped, and #226 keeps it deliberately:
 * moving the entries into the catalog must not change a character of what the
 * panel prints. A locale wanting a different list separator -- or
 * `Intl.ListFormat`, which would also add "and" before the last item -- is a
 * change to what the player reads and belongs to its own decision, not to a
 * compliance fix.
 */
function joinScopeLabels(entries: readonly RestoredScopeEntry[], localizer: SavePanelLocalizer): string {
  return entries.map((entry) => localizer.format(entry.labelKey)).join(', ');
}

/**
 * What a load restored, and what it did not carry.
 *
 * Both lists arrive as message keys: since #226 `RestoredScope` carries
 * `labelKey`s and never prose, because
 * `src/simulation/runtime/restore-session.ts` is the tier ADR 0011 says
 * translated text may never live in. This function is where they become text
 * -- each key resolved through the panel's own localizer, the results joined
 * into `{restored}` and `{notCarried}`. That is the same last-possible-moment
 * resolution `docs/HUD_PROJECTIONS.md` contract 3 requires of every
 * projection, applied to the one structure that used to be exempt.
 *
 * The localizer is a parameter rather than a module singleton, so this stays a
 * pure function of `(scope, localizer)`, testable in the default `node`
 * environment, and the panel keeps handing it the single instance `main.ts`
 * built (#229) rather than a second one of its own.
 */
export function describeRestoredScope(scope: RestoredScope, localizer: SavePanelLocalizer): SaveMessage {
  return {
    messageKey: SAVE_PANEL_MESSAGE_KEY.detailRestoredScope,
    messageParameters: {
      restored: joinScopeLabels(scope.restored, localizer),
      notCarried: joinScopeLabels(scope.notCarriedByThisSaveVersion, localizer),
    },
  };
}

/**
 * One whole sentence per action, rather than a prefix concatenated with
 * `': '`. A translated prefix glued to punctuation in code assumes English
 * sentence structure in a place no translator can reach.
 */
const ACTION_FAILURE_KEYS: Readonly<Record<SavePanelActionId, LocalizationKey>> = {
  create: SAVE_PANEL_MESSAGE_KEY.failureCreate,
  save: SAVE_PANEL_MESSAGE_KEY.failureSave,
  load: SAVE_PANEL_MESSAGE_KEY.failureLoad,
  delete: SAVE_PANEL_MESSAGE_KEY.failureDelete,
  export: SAVE_PANEL_MESSAGE_KEY.failureExport,
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
  return {
    kind: 'error',
    messageKey: ACTION_FAILURE_KEYS[actionId] ?? SAVE_PANEL_MESSAGE_KEY.failureUnknown,
    // The thrown message is diagnostic English from `src/persistence/**`, so
    // it travels as a parameter rather than as part of the translatable
    // sentence. Hiding it would cost the player the one detail that names
    // what actually went wrong (issue #65's `did not reply within 15000ms`).
    messageParameters: { detail: describeActionError(failure.error) },
  };
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
 * **Every string it renders is a message key** (issue #208, ADR 0011). The
 * mapping functions above return a key and its parameters; this class
 * resolves them through the injected localizer at the moment it writes to the
 * DOM, and nothing resolved travels back out. Before that, all thirty-odd of
 * them were English literals in this file, which is what made it the one
 * player-facing UI module outside every localization gate.
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

  private readonly localizer: SavePanelLocalizer;

  public constructor(
    private readonly controller: SavePanelSessions,
    parent: HTMLElement,
    localizer: SavePanelLocalizer,
  ) {
    this.localizer = localizer;
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
    this.root.setAttribute('aria-label', this.text(SAVE_PANEL_MESSAGE_KEY.panelRegion));

    const heading = document.createElement('h2');
    heading.className = 'save-panel__heading';
    heading.textContent = this.text(SAVE_PANEL_MESSAGE_KEY.panelTitle);
    this.root.append(heading);

    const actions = document.createElement('div');
    actions.className = 'save-panel__actions';
    actions.append(
      this.button(this.busy, SAVE_PANEL_MESSAGE_KEY.actionCreate, () => this.requestCreate()),
      this.button(this.busy, SAVE_PANEL_MESSAGE_KEY.actionSave, () => this.requestSaveNow()),
      this.button(this.busy, SAVE_PANEL_MESSAGE_KEY.actionExport, () => this.requestExport()),
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
    this.setStatus({ kind: 'idle', messageKey: SAVE_PANEL_MESSAGE_KEY.statusIdle });
  }

  /** Resolves a key at the last possible moment; nothing resolved travels back out. */
  private text(key: LocalizationKey, parameters?: MessageParameters): string {
    return parameters === undefined ? this.localizer.format(key) : this.localizer.format(key, parameters);
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
    this.statusElement.textContent = this.text(status.messageKey, status.messageParameters);
    this.statusElement.dataset.kind = status.kind;
  }

  private setDetail(message: SaveMessage | undefined): void {
    this.detailElement.textContent = message === undefined ? '' : this.text(message.messageKey, message.messageParameters);
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
      this.setStatus({
        kind: 'storage-unavailable',
        messageKey: SAVE_PANEL_MESSAGE_KEY.statusListUnreadable,
        messageParameters: { detail: describeActionError(error) },
      });
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
      empty.textContent = this.text(SAVE_PANEL_MESSAGE_KEY.listEmpty);
      this.listElement.append(empty);
      return;
    }

    for (const prison of [...prisons].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const item = document.createElement('li');
      item.className = 'save-panel__item';
      if (prison.prisonId === activeId) item.dataset.active = 'true';

      const label = document.createElement('span');
      label.className = 'save-panel__item-label';
      label.textContent = this.text(SAVE_PANEL_MESSAGE_KEY.listItem, {
        // A prison's display name is player-authored and a prison id is a
        // stable identifier: neither is translatable, and both are data.
        name: prison.displayName ?? prison.prisonId,
        count: this.localizer.formatNumber(prison.generationIds.length),
      });
      item.append(label);

      item.append(
        this.button(this.rowBusy, SAVE_PANEL_MESSAGE_KEY.actionLoad, () => this.requestLoad(prison.prisonId)),
        this.button(this.rowBusy, SAVE_PANEL_MESSAGE_KEY.actionDelete, () => this.requestDelete(prison.prisonId)),
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
      this.setStatus({ kind: 'saving', messageKey: SAVE_PANEL_MESSAGE_KEY.statusCreating });
      try {
        this.setStatus(describeSaveResult(await this.controller.createPrison(prisonId, 'New Prison')));
      } catch (error) {
        this.setStatus({
          kind: 'error',
          messageKey: SAVE_PANEL_MESSAGE_KEY.statusCreateFailed,
          messageParameters: { detail: describeActionError(error) },
        });
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
        this.setStatus({ kind: 'idle', messageKey: SAVE_PANEL_MESSAGE_KEY.statusNoActivePrison });
        return;
      }
      this.setStatus({ kind: 'saving', messageKey: SAVE_PANEL_MESSAGE_KEY.statusSaving });
      this.setStatus(describeSaveResult(await this.controller.saveNow()));
      await this.refresh();
    });
  }

  public requestLoad(prisonId: string): AsyncActionOutcome {
    return this.start('load', async () => {
      this.setStatus({ kind: 'saving', messageKey: SAVE_PANEL_MESSAGE_KEY.statusLoading });
      const outcome = await this.controller.loadPrison(prisonId);

      if (!outcome.ok) {
        this.setStatus({
          kind: 'error',
          messageKey:
            outcome.reason === 'not-found'
              ? SAVE_PANEL_MESSAGE_KEY.statusNotFound
              : SAVE_PANEL_MESSAGE_KEY.statusNoReadableGeneration,
        });
        await this.refresh();
        return;
      }

      this.setStatus(
        outcome.recovered
          ? { kind: 'recovered', messageKey: SAVE_PANEL_MESSAGE_KEY.statusRecovered }
          : { kind: 'saved', messageKey: SAVE_PANEL_MESSAGE_KEY.statusLoaded },
      );
      this.setDetail(describeRestoredScope(outcome.scope, this.localizer));
      await this.refresh();
    });
  }

  public requestDelete(prisonId: string): AsyncActionOutcome {
    return this.start('delete', async () => {
      await this.controller.deletePrison(prisonId);
      this.setStatus({ kind: 'idle', messageKey: SAVE_PANEL_MESSAGE_KEY.statusDeleted });
      this.setDetail(undefined);
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
        this.setStatus({ kind: 'idle', messageKey: SAVE_PANEL_MESSAGE_KEY.statusNothingToExport });
        return;
      }

      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${envelope.prisonId}.lockstate.json`;
      link.click();
      URL.revokeObjectURL(url);
      this.setStatus({ kind: 'saved', messageKey: SAVE_PANEL_MESSAGE_KEY.statusExported });
    });
  }

  private start(actionId: SavePanelActionId, action: () => Promise<void>): AsyncActionOutcome {
    return this.gate.run(actionId, action);
  }

  private button(group: BusyGroup, labelKey: LocalizationKey, onClick: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = this.text(labelKey);
    element.className = 'save-panel__button';
    element.addEventListener('click', onClick);
    // Registered at creation, so a row rebuilt by `refresh` during a busy
    // period comes back disabled rather than live.
    group.add(element);
    return element;
  }
}
