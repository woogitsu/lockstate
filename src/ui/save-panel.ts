import type { LocalizationKey } from '../content/localization';
import { readableGenerationIds } from '../persistence/local/generation-policy';
import type { DeletedPrison, RestoreOutcome, SaveImportResult, SaveInventory, SaveResult } from '../persistence/local/repository';
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
import { ambientFocusOwner, handOffFocus, keyboardIsUnclaimed } from './primitives/focus-handoff';
import {
  type DeleteArming,
  describeDeleteConfirmation,
  describeDeletedPrison,
  describeRestoreOutcome,
  describeSaveAge,
  pressDeleteConfirmation,
  retainDeleteArming,
} from './save-panel-delete';
import { SAVE_PANEL_MESSAGE_KEY } from './save-panel-messages';
import { protocolFaultMessageKeyOf } from './simulation-alerts';

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
 * What goes into a failure sentence's `{detail}`.
 *
 * ## The defect this closes
 *
 * `{detail}` used to be `describeActionError(error)` unconditionally, which
 * is `Error.message` -- and on the paths that matter most that message is
 * built by `WorkerSessionHost`'s `WorkerFaultError` as
 * `` `Simulation worker fault (${code}): ${detail}` ``. So a player running
 * the game in any language read
 * `Could not create a prison: Simulation worker fault (already-initialized):
 * Kernel is already initialized.` -- engine English inside a localised
 * template, which no translation can ever reach. The pseudo-locale sweep
 * behind issue #680 measured it on the real page, under
 * §"What the sweep also found about how it is reported", and named seven
 * splice sites in this file.
 *
 * The catalogue already ships a sentence for every one of the twelve protocol
 * fault codes, and the HUD one panel over already renders them: `hud.ts`'s
 * `reportError` maps a failure to a key and paints the key. This does the
 * same thing at the same boundary -- it resolves the code to that key and
 * hands the *resolved sentence* to the template, exactly as `{restored}` and
 * `{notCarried}` are resolved before being joined (#226).
 *
 * ## What is deliberately left as it was, and why that is the whole design
 *
 * **`{detail}` is not removed and no sentence is authored here.** That is not
 * caution, it is the reason the sweep marked this "not fixed here": it judged
 * that every route out produces player-facing copy, and new player-facing
 * copy is the owner's (`AGENTS.md`, exclusion 4). This route produces none.
 * It resolves a key that has shipped since #283 for a code the protocol
 * already declares; the catalogue file is untouched, and so is every
 * template.
 *
 * So an error that declares no protocol fault code still contributes its raw
 * message, exactly as before. A storage `DOMException`, a reply timeout
 * ("did not reply within 15000ms" -- issue #65's own example) and a file the
 * browser would not read carry no code, so there is no shipped sentence to
 * resolve and nothing changes for them. The comment at
 * `describeActionFailure` has said since #65 that hiding the detail costs the
 * player the one thing that names what went wrong; that argument is untouched
 * and now applies exactly where nothing better exists.
 */
export function describeFailureDetail(error: unknown, localizer: SavePanelLocalizer): string {
  const key = protocolFaultMessageKeyOf(error);
  return key === undefined ? describeActionError(error) : localizer.format(key);
}


/**
 * Distinct user-facing recovery/failure states -- issue #19's "quota,
 * private-mode and transaction-abort errors are distinct recoverable
 * states" and "storage quota/error handling and user-facing recovery
 * states." Each maps to different advice, so they must not collapse into
 * one "save failed" string.
 */
export type SaveStatusKind =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'recovered'
  | 'quota-exceeded'
  | 'transaction-aborted'
  /** A save refused because the prison was written by something else (ADR 0109). Recoverable, and distinct advice: reload it, do not retry. */
  | 'changed-elsewhere'
  | 'storage-unavailable'
  | 'error';

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
 *
 * **That last sentence is true and was not enough, and it is kept rather than
 * replaced because it is still the property this interface guarantees.** It is
 * a claim about the *template*; the pseudo-locale sweep of 2026-08-30 showed
 * what reaches the screen, and a `{detail}` that is a `WorkerFaultError`'s
 * message is untranslated engine English wherever it lands (#680). So the rule
 * this file now follows is one line longer: a `{detail}` that *can* be a
 * catalogue sentence is resolved into one before it is spliced, by
 * `describeFailureDetail`, and only the residue that declares no fault code
 * travels as a raw message.
 *
 * Three of this module's `{detail}` producers are outside that rule, and they
 * are outside it because their input is already a `string`:
 * `describeSaveResult` receives `SaveWriteError.message` and
 * `describeImportResult` receives `SaveDecodeError.message`. Neither type
 * carries a code from the protocol, so there is nothing to look a sentence up
 * by -- see the note at each.
 */
export interface SaveMessage {
  readonly messageKey: LocalizationKey;
  readonly messageParameters?: MessageParameters;
}

export interface SaveStatus extends SaveMessage {
  readonly kind: SaveStatusKind;
}

/** The panel's actions, named so a failure can say which one failed. */
export type SavePanelActionId = 'create' | 'save' | 'load' | 'delete' | 'export' | 'import' | 'restore' | 'forget';

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
    case 'stale-revision':
      /*
       * ADR 0109 Decisions 4 and 5. The sentence behind this key is the
       * owner's ruling of 2026-09-11, verbatim:
       *
       *   "Could not save: this prison was changed elsewhere."
       *
       * No `{detail}`, deliberately. `SaveWriteError.message` on this arm
       * carries the two revision numbers, which are diagnostic English for a
       * log and say nothing to a player; `SaveResult.stale` carries the same
       * numbers as data for anything that wants to act on them.
       */
      return { kind: 'changed-elsewhere', messageKey: SAVE_PANEL_MESSAGE_KEY.statusChangedElsewhere };
    default:
      /*
       * A raw message, and the one place in this file where that is not a
       * choice this module can make differently (#680).
       *
       * `SaveWriteError` is `{ code, message }` over three *storage* codes, so
       * a protocol fault that reached here has already been flattened into
       * prose: `SessionController.saveNow` catches a failed capture and
       * reports `` `Could not capture simulation state: ${error.message}` ``
       * under `code: 'unknown-error'`. Recovering the fault code from that
       * string would be message matching, which is exactly what #431 removed
       * from the restore path. Closing it properly means carrying the original
       * error beside the classified one -- a `cause` on `SaveWriteError` --
       * which is a change to a persistence contract and not to this panel.
       */
      return {
        kind: 'error',
        messageKey: SAVE_PANEL_MESSAGE_KEY.statusSaveFailed,
        messageParameters: { detail: result.error.message },
      };
  }
}

/**
 * Why a load found nothing to load.
 *
 * Shared by the Load button and by the Import control, which loads the
 * generation it has just written: two callers reporting the same two outcomes
 * must not drift into two vocabularies for them.
 */
export function describeLoadFailure(reason: 'not-found' | 'no-valid-generation'): SaveStatus {
  return {
    kind: 'error',
    messageKey:
      reason === 'not-found'
        ? SAVE_PANEL_MESSAGE_KEY.statusNotFound
        : SAVE_PANEL_MESSAGE_KEY.statusNoReadableGeneration,
  };
}

/** A chosen file's bytes, either as something to hand to the importer or as the reason not to. */
export type ParsedImportFile =
  | { readonly ok: true; readonly raw: unknown }
  | { readonly ok: false; readonly status: SaveStatus };

/**
 * The one thing the interface layer does to an imported file before the
 * persistence layer sees it: turn text into a value.
 *
 * A file that is not JSON at all is not a Lockstate save, and saying so here
 * costs nothing and reaches the player in their own terms. Everything past
 * that -- what the value *is* -- is `decodeSaveEnvelope`'s question and is
 * deliberately not asked here: a second opinion about the save format living
 * in `src/ui/` is the shape of defect ADR 0011 and `AGENTS.md` boundary 5
 * both exist to prevent, and it would be the copy that rots.
 *
 * Pure, so it is provable in the default `node` Vitest environment while the
 * DOM half of the control needs a browser.
 */
export function parseImportedSave(text: string): ParsedImportFile {
  try {
    return { ok: true, raw: JSON.parse(text) };
  } catch {
    // The `SyntaxError` is deliberately dropped rather than spliced in as a
    // `{detail}`: "Unexpected token < in JSON at position 0" describes the
    // parser's disappointment, not the player's mistake, which is that this is
    // not a save file.
    return { ok: false, status: { kind: 'error', messageKey: SAVE_PANEL_MESSAGE_KEY.statusImportNotASave } };
  }
}

/**
 * What an import did, or why it was refused (#287).
 *
 * Four refusals, four sentences, from the decode error the persistence layer
 * hands up rather than from a string it built:
 *
 * - **`unsupported-version`** -- the save is fine and this build is too old.
 * - **`checksum-mismatch`** -- the file was damaged or edited after export.
 * - **`invalid-shape` with no `atVersion`** -- the value never declared a
 *   numeric `saveSchemaVersion`, so nothing in it identifies it as a Lockstate
 *   save at all. `atVersion` is what separates this from the case below:
 *   `decodeSaveEnvelope` reports the missing-version refusal before any schema
 *   runs and therefore without a version, while every structural failure is
 *   raised *at* the version the file declared and carries it.
 * - **`invalid-shape` at a version, `no-migration-path`,
 *   `migration-produced-invalid-output`, `migration-step-threw`** -- it
 *   declares itself a save of a version this build knows and its contents do
 *   not hold up. The decoder's own message rides along as `{detail}`, the same
 *   convention every other spliced diagnostic in this panel uses. The last of
 *   the four is reached when a migration step threw rather than returning;
 *   it says the same sentence to the player deliberately, because what the
 *   player can do about it is identical, and the distinction it preserves is
 *   for whoever reads the `{detail}`.
 *
 * A failure with no `rejected` at all is a *write* failure -- the envelope
 * decoded and storage refused it -- so it goes to `describeSaveResult`, which
 * already tells quota, abort and unknown apart (#19). Nothing about that
 * mapping is duplicated here.
 */
export function describeImportResult(result: SaveImportResult): SaveStatus {
  if (result.ok) {
    return {
      kind: 'saved',
      messageKey: result.migrated
        ? SAVE_PANEL_MESSAGE_KEY.statusImportedMigrated
        : SAVE_PANEL_MESSAGE_KEY.statusImported,
      messageParameters: { generation: result.generationId },
    };
  }

  const rejected = result.rejected;
  if (rejected === undefined) return describeSaveResult(result);

  /*
   * `rejected.message` travels raw at both sites below, and unlike the
   * failure sentences it has nothing to route through (#680).
   * `SaveDecodeError` is the *save schema's* verdict about a file the player
   * chose, not the simulation protocol's about a message; its four codes are
   * already mapped to four whole sentences here, and `invalid-shape` with a
   * declared version is the residue the sweep left -- a structural complaint
   * about somebody's file, in whatever words `decodeSaveEnvelope` used.
   */
  switch (rejected.code) {
    case 'unsupported-version':
      return { kind: 'error', messageKey: SAVE_PANEL_MESSAGE_KEY.statusImportUnsupportedVersion };
    case 'checksum-mismatch':
      return { kind: 'error', messageKey: SAVE_PANEL_MESSAGE_KEY.statusImportCorrupt };
    case 'invalid-shape':
      // No declared version at all: nothing in the value says it is a save.
      if (rejected.atVersion === undefined) {
        return { kind: 'error', messageKey: SAVE_PANEL_MESSAGE_KEY.statusImportNotASave };
      }
      return {
        kind: 'error',
        messageKey: SAVE_PANEL_MESSAGE_KEY.statusImportInvalid,
        messageParameters: { detail: rejected.message },
      };
    default:
      return {
        kind: 'error',
        messageKey: SAVE_PANEL_MESSAGE_KEY.statusImportInvalid,
        messageParameters: { detail: rejected.message },
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
  import: SAVE_PANEL_MESSAGE_KEY.failureImport,
  restore: SAVE_PANEL_MESSAGE_KEY.failureRestore,
  forget: SAVE_PANEL_MESSAGE_KEY.failureForget,
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
export function describeActionFailure(failure: AsyncActionFailure, localizer: SavePanelLocalizer): SaveStatus {
  const actionId = failure.actionId as SavePanelActionId;
  return {
    kind: 'error',
    messageKey: ACTION_FAILURE_KEYS[actionId] ?? SAVE_PANEL_MESSAGE_KEY.failureUnknown,
    // **The detail is a catalogue sentence wherever the failure declared a
    // protocol fault code, and the thrown message only where it did not.**
    //
    // This comment used to read, in full: *"The thrown message is diagnostic
    // English from `src/persistence/**`, so it travels as a parameter rather
    // than as part of the translatable sentence. Hiding it would cost the
    // player the one detail that names what actually went wrong (issue #65's
    // `did not reply within 15000ms`)."* Both sentences are still true of the
    // fallback and that is why they are kept -- what was wrong is the word
    // *is*. A `WorkerFaultError`'s message is diagnostic English the catalogue
    // already has a translation for, and printing it walked past that
    // translation (#680). `describeFailureDetail` states the whole rule.
    messageParameters: { detail: describeFailureDetail(failure.error, localizer) },
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
  /**
   * Everything the list shows, from one read.
   *
   * One call rather than a prisons call and a tombstones call, for the two
   * reasons `PrisonSaveRepository.listSaves` states: a second transaction on
   * every repaint was measured as a real cost in the browser reachability
   * sweep, and two reads are two snapshots that a deletion landing between them
   * can fall through entirely.
   */
  listSaves(): Promise<SaveInventory>;
  getActiveSession(): ActiveSession | undefined;
  createPrison(prisonId: string, displayName?: string): Promise<SaveResult>;
  saveNow(): Promise<SaveResult>;
  loadPrison(prisonId: string): Promise<SessionLoadOutcome>;
  deletePrison(prisonId: string): Promise<void>;
  /**
   * The undo window's three calls (ADR 0114).
   *
   * On this port rather than reached for directly, exactly as `deletePrison`
   * is: the panel renders outcomes the persistence layer reports and calls
   * nothing under `src/persistence/` itself, which is what the
   * `tests/unit/ui-orchestration-boundaries.test.ts` manifest records for this
   * file. `listDeletedPrisons` is also the sweep -- it deletes every copy whose
   * window has closed as it reads -- so the panel's existing `refresh()` is
   * what enforces expiry, with no timer anywhere.
   */
  listDeletedPrisons(): Promise<readonly DeletedPrison[]>;
  restoreDeletedPrison(prisonId: string): Promise<RestoreOutcome>;
  forgetDeletedPrison(prisonId: string): Promise<void>;
  exportActive(): Promise<SaveEnvelope | undefined>;
  importInto(prisonId: string, raw: unknown): Promise<SaveImportResult>;
}

/**
 * The slice of `File` the import path reads.
 *
 * Structural, and one method, for the same reason `SavePanelSessions` is: it
 * is what lets the parse-and-report half of an import be driven without a
 * file picker, a `FileList` or a real `File`. A `File` satisfies it as
 * written, so `requestImport` hands one straight over.
 */
export interface SavePanelImportFile {
  text(): Promise<string>;
}

/**
 * Mints the id of a new prison: the local repository's primary key, and the
 * same value the cloud slot is created under.
 *
 * **It must be a UUID, and that is a schema requirement rather than a style
 * preference.** `prisons.id` is `uuid`
 * (`supabase/migrations/20260822190100_create_prisons.sql`), and every cloud
 * operation passes this value into a `uuid` parameter or compares it against a
 * `uuid` column -- `create_prison(p_prison_id uuid, ...)`,
 * `create_save_version(p_prison_id uuid, ...)`, `.eq('id', ...)` on `prisons`
 * and `.eq('prison_id', ...)` on `save_versions`. PostgreSQL raises `22P02`
 * *during argument coercion*, so a non-UUID id fails before the function body
 * runs: before the `auth.uid()` fail-closed check, before the advisory lock and
 * before the slot-capacity trigger.
 *
 * This minted `prison-${Date.now().toString(36)}`, which no `uuid` column
 * accepts, so every cloud-save call was unreachable for every prison the game
 * created (#338). It was latent only because nothing constructs a
 * `SupabaseCloudSaveClient` yet.
 *
 * The id is caller-supplied rather than server-generated on purpose. The
 * migration's own header states why -- "so a client can create the cloud slot
 * with the prison id its local repository already uses" -- and this is a
 * local-first stack: `SessionController.createPrison` writes the slot and
 * generation 1 to IndexedDB before any network call exists, so the id has to
 * exist offline. `create_prison` does accept `null` and generate one, but
 * adopting a server id would mean either forbidding offline creation or
 * rewriting a local primary key after a round trip.
 *
 * `crypto.randomUUID()` is the repository's convention for main-thread ids
 * (`src/persistence/session/worker-session-host.ts`,
 * `src/ui/simulation-commands.ts`). It does not endanger determinism: a prison
 * id never enters simulation state -- `prisonId` appears nowhere under
 * `src/simulation/` -- and this module is not in the import closure
 * `tests/determinism/ambient-nondeterminism-contract.test.ts` walks out of
 * `src/simulation/`. It also removes a quieter property of the old scheme:
 * `Date.now().toString(36)` is guessable to the millisecond, which is a bad
 * thing to hand a table whose primary key is global across every account.
 */
export function newPrisonId(): string {
  return crypto.randomUUID();
}

/**
 * The order the prison list is rendered in: **most recently played first**.
 *
 * A separate exported function rather than an inline `sort` inside `refresh`
 * because that is the only shape this rule can be proven in `pnpm test`:
 * `refresh` writes to a real `document`, so the sole place it runs is
 * `tests/browser/`, and the ordering therefore had no assertion anywhere
 * (issue #445). Reversing the comparator survived the entire suite while
 * sorting the player's most recent prison to the bottom of their own list.
 *
 * The input is copied before sorting. `SessionController.listPrisons` hands
 * back a `readonly` view of a list it may keep, and sorting in place would
 * reorder the caller's array as a side effect of rendering.
 *
 * Ties keep the order storage listed them in -- `Array.prototype.sort` is
 * required to be stable -- which is a real outcome only for two saves written
 * inside the same millisecond.
 */
export function orderPrisonsForDisplay(prisons: readonly PrisonSlotMetadata[]): readonly PrisonSlotMetadata[] {
  return [...prisons].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * The order the deleted prisons are rendered in: **most recently deleted
 * first** (ADR 0114).
 *
 * `orderPrisonsForDisplay`'s shape and its reasons, on a different field. A
 * separate exported function rather than an inline `sort` because `refresh`
 * writes to a real `document` and is therefore unreachable from `pnpm test`
 * (`environment: 'node'`), which is how #445 shipped a list sorted backwards
 * with the whole suite green. The input is copied before sorting, because the
 * caller hands back a `readonly` view of a list it may keep.
 *
 * `deletedAt` rather than `expiresAt`: the two order identically while one
 * window length is in force, and this one keeps ordering by the thing the
 * player did if a per-deletion window ever exists.
 */
export function orderDeletedPrisonsForDisplay(deleted: readonly DeletedPrison[]): readonly DeletedPrison[] {
  return [...deleted].sort((a, b) => b.deletedAt - a.deletedAt);
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

  /**
   * The deletion the player has asked about and not yet answered for (#1142).
   *
   * `undefined` is the resting state and the only state in which the panel
   * renders no confirmation. Every rule about it -- which press may spend it,
   * when it stops being about anybody -- is in `save-panel-delete.ts`, where
   * `pnpm test` can reach it.
   */
  private armedDeletion: DeleteArming | undefined;

  /** The confirmation's own `<li>`, or `undefined` when nothing is armed. */
  private confirmationRow: HTMLElement | undefined;

  /**
   * Where the keyboard goes after a deletion actually happens.
   *
   * The controls it was standing on -- the row's Delete, then the
   * confirmation's own pair -- are all gone by then, so constitution article
   * 16 (*"Zamknięcie okna oddaje fokus dostępnemu wyzwalaczowi lub mapie"* --
   * closing returns focus to an available trigger) has nothing to give it
   * back to in the list. This is the panel's first always-present control, and
   * it is captured rather than looked up so nothing has to query the document
   * for it.
   */
  private readonly createButton: HTMLButtonElement;

  /** Set by a completed deletion, spent once the gate has re-enabled the controls. */
  private focusAfterDeletion = false;

  private readonly now: () => number;

  public constructor(
    private readonly controller: SavePanelSessions,
    parent: HTMLElement,
    localizer: SavePanelLocalizer,
    /**
     * The clock the confirmation's age is measured against.
     *
     * Injected and defaulted rather than read from `Date` at the call site, so
     * a browser spec can put a save at a known age without waiting for one --
     * and defaulted so `src/main.ts`'s single construction is untouched, which
     * `tests/foundation/composition-root-contract.test.ts` pins verbatim.
     */
    now: () => number = () => Date.now(),
  ) {
    this.localizer = localizer;
    this.now = now;
    this.gate = new AsyncActionGate({
      onBusyChange: (busy) => {
        this.busy.setBusy(busy);
        this.rowBusy.setBusy(busy);
        // After both groups, never before: the control this hands the keyboard
        // to is one of the ones `setBusy` has just re-enabled, and a focus call
        // on a still-`disabled` button does nothing at all.
        if (!busy) this.settleFocusAfterDeletion();
      },
      // The backstop issue #65 was missing. A handler is expected to
      // classify its own failures; anything that escapes still reaches the
      // player instead of `window.onunhandledrejection`.
      onError: (failure) => {
        this.setStatus(describeActionFailure(failure, this.localizer));
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
    this.createButton = this.button(this.busy, SAVE_PANEL_MESSAGE_KEY.actionCreate, () => this.requestCreate());
    actions.append(
      this.createButton,
      this.button(this.busy, SAVE_PANEL_MESSAGE_KEY.actionSave, () => this.requestSaveNow()),
      this.button(this.busy, SAVE_PANEL_MESSAGE_KEY.actionExport, () => this.requestExport()),
      // Beside Export, in the same always-visible row and behind no
      // disclosure: measured on the assembled page, the row wraps to a second
      // line of `--tap-target` and the panel is a scroll container whose
      // height the rail decides, so the fourth button costs the Build panel
      // nothing at any of the five viewports the browser suite visits. See
      // `docs/PERSISTENCE.md`.
      this.button(this.busy, SAVE_PANEL_MESSAGE_KEY.actionImport, () => this.requestImport()),
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
    let deleted: readonly DeletedPrison[];
    try {
      // One read for both halves, and it is also the sweep: the call deletes
      // every copy whose undo window has closed as it reads (ADR 0114 §3), so
      // this repaint is what enforces the window with no timer anywhere.
      ({ prisons, deleted } = await this.controller.listSaves());
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
        messageParameters: { detail: describeFailureDetail(error, this.localizer) },
      });
      return;
    }

    if (token !== this.refreshToken) return; // a newer refresh started while this one was reading

    this.listElement.replaceChildren();
    // The row buttons about to be discarded are also dropped from the busy
    // group, so it does not accumulate a reference to every button the panel
    // has ever rendered.
    this.rowBusy.clear();
    // The confirmation's own controls were in that group too, and its element
    // was in the list that has just been emptied. Both are rebuilt below if the
    // arm survives; the field is cleared here so nothing holds a detached node.
    this.confirmationRow = undefined;
    // A question about a prison this list no longer holds is a question about
    // nobody -- it was deleted here, in another tab, or its slot record stopped
    // validating. `retainDeleteArming` is the one rule for all three.
    this.armedDeletion = retainDeleteArming(this.armedDeletion, prisons.map((prison) => prison.prisonId));
    const activeId = this.controller.getActiveSession()?.prisonId;

    // "No prisons yet" is false while a deleted one is still standing there to
    // be brought back, so the empty row is drawn only when the list is empty of
    // both kinds.
    if (prisons.length === 0 && deleted.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'save-panel__empty';
      empty.textContent = this.text(SAVE_PANEL_MESSAGE_KEY.listEmpty);
      this.listElement.append(empty);
      return;
    }

    for (const prison of orderPrisonsForDisplay(prisons)) {
      const item = document.createElement('li');
      item.className = 'save-panel__item';
      // Which prison this row is for, so the confirmation can be inserted
      // directly beneath the row that raised it without the panel having to
      // remember an index into a list it rebuilds wholesale.
      item.dataset.prison = prison.prisonId;
      if (prison.prisonId === activeId) item.dataset.active = 'true';

      const label = document.createElement('span');
      label.className = 'save-panel__item-label';
      label.textContent = this.text(SAVE_PANEL_MESSAGE_KEY.listItem, {
        // A prison's display name is player-authored and a prison id is a
        // stable identifier: neither is translatable, and both are data.
        name: prison.displayName ?? prison.prisonId,
        // Readable generations only (#432): a quarantined generation is one
        // this build refused and kept for a later build, so counting it here
        // would tell the player they have a save this build cannot offer them.
        count: this.localizer.formatNumber(readableGenerationIds(prison.generationIds).length),
      });
      item.append(label);

      item.append(
        // The `focusKey` is what carries the keyboard across the rebuild.
        // `requestLoad` refreshes the list from inside its own action, so by
        // the time the gate clears, the button that was pressed is a detached
        // node and the group cannot focus it again. Keyed by what the control
        // does and which prison it does it to, the row that replaces this one
        // inherits the focus -- and a *deleted* prison has no replacement row,
        // which is a control that is really gone rather than one that moved,
        // so nothing is focused and the keyboard stays where the browser left
        // it.
        this.button(
          this.rowBusy,
          SAVE_PANEL_MESSAGE_KEY.actionLoad,
          () => this.requestLoad(prison.prisonId),
          `load:${prison.prisonId}`,
        ),
        this.button(
          this.rowBusy,
          SAVE_PANEL_MESSAGE_KEY.actionDelete,
          // The arming is built from the row that is being drawn, so what the
          // confirmation names is what this row named -- `{name}` here is the
          // same value `save.list.item` interpolated one element above.
          () =>
            this.requestDelete({
              prisonId: prison.prisonId,
              named: prison.displayName ?? prison.prisonId,
              updatedAt: prison.updatedAt,
            }),
          `delete:${prison.prisonId}`,
        ),
      );
      this.listElement.append(item);
    }

    this.renderDeleteConfirmation();

    // Beneath the live prisons, in one pass, after the confirmation has been
    // placed: these rows are about prisons that are gone, and putting them
    // above the ones the player still has would sort the list by recency of
    // *loss* rather than by what they can play.
    for (const gone of orderDeletedPrisonsForDisplay(deleted)) {
      this.listElement.append(this.deletedPrisonRow(gone));
    }
  }

  /**
   * One deleted prison's row: what it was, and the two things that can be done
   * about it (ADR 0114).
   *
   * The name is the copy's own -- the tombstone kept the slot record verbatim,
   * so this is the name the row had before the deletion rather than one
   * reconstructed afterwards.
   *
   * Both controls join `rowBusy` for the reason every other per-row control
   * does: they are discarded and rebuilt on every `refresh`, and a control
   * rebuilt during a busy period must come back disabled rather than live. The
   * `focusKey`s carry the keyboard across that rebuild, and a prison that was
   * brought back or freed has no replacement row -- which is a control that is
   * really gone rather than one that moved, so nothing is focused and the
   * keyboard stays where the browser left it.
   */
  private deletedPrisonRow(gone: DeletedPrison): HTMLElement {
    const item = document.createElement('li');
    item.className = 'save-panel__item';
    item.dataset.deletedPrison = gone.prisonId;

    const label = document.createElement('span');
    label.className = 'save-panel__item-label';
    const sentence = describeDeletedPrison(gone.displayName ?? gone.prisonId);
    label.textContent = this.text(sentence.messageKey, sentence.messageParameters);
    item.append(label);

    item.append(
      this.button(
        this.rowBusy,
        SAVE_PANEL_MESSAGE_KEY.actionTombstoneRestore,
        () => this.requestRestore(gone.prisonId, gone.displayName ?? gone.prisonId),
        `restore:${gone.prisonId}`,
      ),
      this.button(
        this.rowBusy,
        SAVE_PANEL_MESSAGE_KEY.actionTombstoneForget,
        () => this.requestForget(gone.prisonId),
        `forget:${gone.prisonId}`,
      ),
    );
    return item;
  }

  /**
   * Draws the confirmation beneath the row it belongs to, or takes it away.
   *
   * Called from `refresh` and from each of the three presses that change what
   * is armed, so there is one place that turns `armedDeletion` into elements
   * and no state the two paths could disagree about.
   *
   * It does **not** re-read the prison list. Arming is a question about a row
   * the player is looking at, and re-reading storage to draw a question would
   * make the confirmation appear a transaction later than the press that asked
   * for it -- and would race the very `refresh` guard that exists to stop a
   * slower earlier read repainting over a newer one.
   */
  private renderDeleteConfirmation(): void {
    this.confirmationRow?.remove();
    this.confirmationRow = undefined;

    const armed = this.armedDeletion;
    if (armed === undefined) return;

    const row = this.listElement.querySelector<HTMLElement>(`[data-prison="${CSS.escape(armed.prisonId)}"]`);
    if (row === null) return; // the row is not drawn, so there is nothing to ask about

    const confirmation = document.createElement('li');
    confirmation.className = 'save-panel__item';
    confirmation.dataset.deleteConfirm = armed.prisonId;

    const question = document.createElement('span');
    // The list row's own label class, so the sentence inherits the styling a
    // row's text already has. `src/styles.css` belongs to another change in
    // flight and this one adds no rule to it.
    question.className = 'save-panel__item-label';
    question.id = `save-panel-delete-confirm-${armed.prisonId}`;
    const age = this.resolveMessage(describeSaveAge(this.now() - armed.updatedAt));
    const sentence = describeDeleteConfirmation(armed, age);
    question.textContent = this.text(sentence.messageKey, sentence.messageParameters);
    confirmation.append(question);

    const confirm = this.button(
      this.rowBusy,
      SAVE_PANEL_MESSAGE_KEY.actionDeleteConfirm,
      () => this.confirmDelete(armed.prisonId),
    );
    const cancel = this.button(
      this.rowBusy,
      SAVE_PANEL_MESSAGE_KEY.actionDeleteCancel,
      () => this.cancelDelete(),
    );
    // The question is the description of both controls rather than a live
    // region: a live region announces once, into whatever the player was
    // doing, while a description is re-read every time either control is
    // reached -- and the keyboard is put on one of them immediately below.
    confirm.setAttribute('aria-describedby', question.id);
    cancel.setAttribute('aria-describedby', question.id);
    confirmation.append(confirm, cancel);

    row.after(confirmation);
    this.confirmationRow = confirmation;
  }

  /** Resolves a `SaveMessage` to text. The same last-moment resolution `text` does. */
  private resolveMessage(message: SaveMessage): string {
    return this.text(message.messageKey, message.messageParameters);
  }

  /**
   * Hands the keyboard to the create button after a deletion has emptied the
   * place it was standing.
   *
   * Guarded on `keyboardIsUnclaimed`, which is `focus-handoff.ts`'s rule and
   * not an optimisation: a player who tabbed somewhere else while the delete
   * was in flight put the keyboard where it now is, and moving it would be a
   * worse defect than the one this is fixing.
   */
  private settleFocusAfterDeletion(): void {
    if (!this.focusAfterDeletion) return;
    this.focusAfterDeletion = false;
    if (!keyboardIsUnclaimed(ambientFocusOwner())) return;
    handOffFocus(this.createButton);
  }

  /*
   * The public request API. Each returns synchronously, so no caller ever
   * has a promise to discard, and returns the gate's decision so a test (or
   * the browser harness) can assert that a second attempt was *refused*
   * rather than issued.
   */

  public requestCreate(): AsyncActionOutcome {
    return this.start('create', async () => {
      const prisonId = newPrisonId();
      this.setStatus({ kind: 'saving', messageKey: SAVE_PANEL_MESSAGE_KEY.statusCreating });
      try {
        this.setStatus(describeSaveResult(await this.controller.createPrison(prisonId, 'New Prison')));
      } catch (error) {
        this.setStatus({
          kind: 'error',
          messageKey: SAVE_PANEL_MESSAGE_KEY.statusCreateFailed,
          messageParameters: { detail: describeFailureDetail(error, this.localizer) },
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
        this.setStatus(describeLoadFailure(outcome.reason));
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

  /**
   * Asks the question. **It deletes nothing** (#1142).
   *
   * ## What this used to be
   *
   * ```ts
   * public requestDelete(prisonId: string): AsyncActionOutcome {
   *   return this.start('delete', async () => {
   *     await this.controller.deletePrison(prisonId);
   * ```
   *
   * One press of a row's Delete control and the prison was gone: every
   * retained generation and the slot record, in one transaction
   * (`PrisonSaveRepository.delete`, `src/persistence/local/repository.ts:637`),
   * with nothing in between that could have been read, hesitated over or
   * refused. That is the whole of issue #1142, and it is quoted here rather
   * than described because the shape of the old code is the reason the new
   * code is shaped the way it is: the deletion is unchanged and still
   * unconditional, and what moved is where the intent is formed.
   *
   * ## Why the signature changed, rather than keeping `(prisonId: string)`
   *
   * Two reasons, and both are about not being able to lie.
   *
   * The **return type** went from `AsyncActionOutcome` to `void` because this
   * press no longer starts an action. Returning `'started'` for a press that
   * issues nothing would be a value a test could assert and be wrong about.
   * `confirmDelete` returns the gate's decision, because that is the press
   * that has one.
   *
   * The **parameter** is the whole arming rather than an id because the
   * confirmation has to say what is about to be lost, and the row that was
   * pressed is the only place that is known without a second read of storage.
   * Capturing it here is also what stops the question drifting: the name and
   * the timestamp are what the player was looking at when they pressed, and
   * nothing re-reads them while the question stands
   * (`src/ui/save-panel-delete.ts` carries the argument).
   *
   * ## Not gated, and that is deliberate
   *
   * `AsyncActionGate` exists to stop two overlapping *requests* reaching
   * storage (issue #65). Arming touches no storage and awaits nothing, so
   * running it through the gate would buy nothing and would cost something
   * real: the gate disables every control for the duration, so an armed
   * confirmation would appear with both of its own buttons disabled. The
   * protection a player needs here is the one the gate already gives -- the
   * row's Delete button is disabled while any action is in flight, so a press
   * cannot arrive during one.
   */
  public requestDelete(arming: DeleteArming): void {
    this.armedDeletion = arming;
    this.renderDeleteConfirmation();
    // Onto the control that changes nothing. A confirmation that opens with
    // the keyboard on its destructive control is one stray Enter away from
    // being no confirmation at all, and the player who needs the keyboard
    // route is exactly the player who cannot see where it landed.
    handOffFocus(this.confirmationRow?.querySelector<HTMLButtonElement>('button:last-of-type') ?? undefined);
  }

  /**
   * Spends the arm: the one press in this panel that destroys a prison.
   *
   * `pressDeleteConfirmation` decides whether it may, and the answer is `no`
   * for every state except "this exact prison is armed" -- nothing armed, or
   * an arm naming a different prison. The refusal is returned rather than
   * swallowed, in the shape every other request here uses, so a test asserts
   * that the intent was *refused* rather than inferring it from a prison still
   * being on the list.
   *
   * `'refused-unconfirmed'` is its own value beside `AsyncActionOutcome`'s
   * three and is not folded into `'refused-busy'`: they are different facts
   * about different states, and issue #19's argument against collapsing
   * distinct refusals into one sentence applies to return values for the same
   * reason it applies to strings.
   */
  public confirmDelete(prisonId: string): AsyncActionOutcome | 'refused-unconfirmed' {
    const press = pressDeleteConfirmation(this.armedDeletion, prisonId);
    if (press.kind === 'refuses') return 'refused-unconfirmed';

    return this.start('delete', async () => {
      await this.controller.deletePrison(press.prisonId);
      // Cleared before the repaint, so `refresh` draws a list with no question
      // standing over it even in the window before `retainDeleteArming` would
      // have reached the same answer from the rows.
      this.armedDeletion = undefined;
      this.setStatus({ kind: 'idle', messageKey: SAVE_PANEL_MESSAGE_KEY.statusDeleted });
      this.setDetail(undefined);
      // Article 16 of the constitution: the controls the player was standing
      // on have just ceased to exist, so the keyboard is handed to one that
      // has not. Spent by `settleFocusAfterDeletion` once the gate lets go.
      this.focusAfterDeletion = true;
      await this.refresh();
    });
  }

  /**
   * Backs out. Nothing was deleted, and the status line says exactly that and
   * nothing more.
   *
   * The keyboard goes back to the Delete control the question came from, which
   * is `focus-handoff.ts`'s rule and constitution article 16's: the row is
   * still on the page, so there is a real trigger to return to and no reason
   * to drop the player at the top of the panel.
   */
  public cancelDelete(): void {
    const armed = this.armedDeletion;
    this.armedDeletion = undefined;
    this.renderDeleteConfirmation();
    this.setStatus({ kind: 'idle', messageKey: SAVE_PANEL_MESSAGE_KEY.statusDeleteKept });
    if (armed === undefined) return;
    const row = this.listElement.querySelector<HTMLElement>(`[data-prison="${CSS.escape(armed.prisonId)}"]`);
    handOffFocus(row?.querySelector<HTMLButtonElement>('button:last-of-type') ?? undefined);
  }

  /**
   * Brings a deleted prison back (ADR 0114).
   *
   * **The press is not the gate and this method does not pretend to be one.**
   * It asks the repository, which re-reads the stored `expiresAt` against its
   * own clock inside the transaction that would do the writing. So a row left
   * on screen while the player went to make tea cannot let a late press
   * through, and the sentence the player then reads is chosen from what
   * actually happened rather than from what the row believed.
   *
   * `named` is captured from the row the player pressed rather than re-read,
   * which is `requestDelete`'s discipline one method up: the success sentence
   * names the prison, and by the time it is said the copy that held the name
   * has been spent.
   */
  public requestRestore(prisonId: string, named: string): AsyncActionOutcome {
    return this.start('restore', async () => {
      const outcome = await this.controller.restoreDeletedPrison(prisonId);
      this.setStatus({
        // A refusal is not a failure of the action -- nothing went wrong, the
        // window closed -- so it carries `'idle'` rather than `'error'`, the
        // same distinction `statusDeleteKept` draws for a deletion the player
        // backed out of.
        kind: outcome === 'restored' ? 'saved' : 'idle',
        ...describeRestoreOutcome(outcome, named),
      });
      this.setDetail(undefined);
      await this.refresh();
    });
  }

  /**
   * Throws the held copy away now, without waiting for the window to close
   * (ADR 0114, the owner's ruling of 2026-09-14).
   *
   * **No confirmation, and that is deliberate rather than an oversight.** The
   * gesture this panel already guards is deleting a prison the player still
   * has, and it guards it because one press used to destroy it with nothing in
   * between. This press acts on a prison the player has *already* confirmed the
   * deletion of, one dialog ago; asking a second time would make the undo
   * window a thing to be escaped rather than a thing to be spent, and the
   * player who presses this is the one who wants their bytes back now.
   */
  public requestForget(prisonId: string): AsyncActionOutcome {
    return this.start('forget', async () => {
      await this.controller.forgetDeletedPrison(prisonId);
      this.setStatus({ kind: 'idle', messageKey: SAVE_PANEL_MESSAGE_KEY.statusTombstoneForgotten });
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

  /**
   * Asks the player for a file, and hands whatever they choose to
   * `requestImportFile`.
   *
   * The other half of Export (#287), and the reason `importInto` existed with
   * no caller: the application could write a save file it could not read
   * back.
   *
   * **The `<input type="file">` is created for this one gesture and removed
   * with it.** A file picker is a DOM affordance and belongs here rather than
   * anywhere the simulation can see it, but a *permanent* hidden input would
   * also be a permanent control that is never laid out, and
   * `tests/browser/app-shell.spec.ts`'s reachability sweep requires every
   * control on the page to be laid out in some state it visits -- an input
   * matching `INTERACTIVE_SELECTOR` and never having a box would fail that
   * accounting rather than pass it. Transient is also the honest shape: the
   * element is a mechanism for one choice, not a part of the panel.
   *
   * **Deliberately outside the action gate.** A file dialog stays open for as
   * long as the player likes and can be dismissed without producing any event
   * at all in older engines, so gating the *choosing* would disable every
   * control in the panel for an unbounded time and, on a cancel, until the
   * page was reloaded. The gate opens when the bytes arrive, which is when
   * work actually starts -- so this returns nothing to refuse.
   */
  public requestImport(): void {
    const chooser = document.createElement('input');
    chooser.type = 'file';
    // A hint to the picker, never a gate: the player can still choose
    // anything, and a wrong choice is reported rather than prevented -- which
    // is the behaviour that has to work, since a save file copied off another
    // machine may well arrive with no extension at all.
    chooser.accept = 'application/json,.json';
    chooser.hidden = true;
    chooser.addEventListener(
      'change',
      () => {
        const file = chooser.files?.[0];
        chooser.remove();
        if (file !== undefined) this.requestImportFile(file);
      },
      { once: true },
    );
    // Dismissing the dialog leaves nothing to do and nothing to say; the
    // element still has to go.
    chooser.addEventListener('cancel', () => chooser.remove(), { once: true });
    this.root.append(chooser);
    chooser.click();
  }

  /**
   * Imports one chosen file into the active prison and makes it the live
   * session.
   *
   * Public and taking a `SavePanelImportFile` rather than being buried in the
   * picker's `change` handler, for the same reason every other action here is
   * a public `request*`: it is the seam a test drives, and it returns the
   * gate's decision so a refusal can be asserted rather than inferred.
   *
   * **Into the active prison, as a new generation.** That is the symmetry
   * `exportActive` sets: the file the player exported came from the active
   * prison and it goes back into one, and `importInto` requires an existing
   * slot in any case (`PrisonSaveRepository.save` refuses a prison that was
   * never created). With no active prison the panel says so in the sentence
   * it already has for that state.
   *
   * **What an import costs the player, stated because this comment used to
   * get it wrong.** It said "nothing is overwritten destructively -- the
   * pre-import state stays in the retained generation window", which was
   * true of the *newest* pre-import generation and false of the oldest: the
   * write went through the ordinary retention rule, so the oldest generation
   * was deleted the moment the imported bytes landed, before anything had
   * asked whether they restore. Three imports of a file this build cannot
   * restore emptied the window (#438). An import now takes the window's spare
   * slot and pays for it only once it has restored, so a refused import costs
   * the player nothing and a working one costs the oldest generation, then --
   * which is what `docs/PERSISTENCE.md` records under "Export/import".
   *
   * **Then it loads.** An import that only wrote a generation would leave the
   * player looking at their old game with a new save on disk, which is not
   * what pressing Import means. Writing and loading stay two calls
   * (`SessionController.importInto` explains why) so that each half reports
   * for itself: a save that reaches storage and then fails to restore says
   * *that*, rather than reporting a clean import over a game that never
   * changed.
   */
  public requestImportFile(file: SavePanelImportFile): AsyncActionOutcome {
    return this.start('import', async () => {
      const session = this.controller.getActiveSession();
      if (session === undefined) {
        this.setStatus({ kind: 'idle', messageKey: SAVE_PANEL_MESSAGE_KEY.statusNoActivePrison });
        return;
      }

      this.setStatus({ kind: 'saving', messageKey: SAVE_PANEL_MESSAGE_KEY.statusImporting });
      // A read that fails -- a file the player deleted between choosing it and
      // this line, a permission the browser withdrew -- is the action's own
      // failure sentence rather than an escape to the gate's backstop.
      let text: string;
      try {
        text = await file.text();
      } catch (error) {
        this.setStatus({
          kind: 'error',
          messageKey: SAVE_PANEL_MESSAGE_KEY.failureImport,
          messageParameters: { detail: describeFailureDetail(error, this.localizer) },
        });
        return;
      }

      const parsed = parseImportedSave(text);
      if (!parsed.ok) {
        this.setStatus(parsed.status);
        return;
      }

      // Schema, migration and checksum all happen behind this call
      // (`PrisonSaveRepository.importSave`), so a save from an older version
      // is migrated on the way in and an invalid one never reaches storage.
      const result = await this.controller.importInto(session.prisonId, parsed.raw);
      if (!result.ok) {
        this.setStatus(describeImportResult(result));
        await this.refresh();
        return;
      }

      const outcome = await this.controller.loadPrison(session.prisonId);
      if (!outcome.ok) {
        this.setStatus(describeLoadFailure(outcome.reason));
        this.setDetail(undefined);
        await this.refresh();
        return;
      }

      // The import sentence, not the load's: the player pressed Import, and
      // whether the file was migrated on the way in is the part of the outcome
      // they cannot see anywhere else. The detail line still reports what the
      // restore actually carried, from the bundle that was restored.
      this.setStatus(describeImportResult(result));
      this.setDetail(describeRestoredScope(outcome.scope, this.localizer));
      await this.refresh();
    });
  }

  private start(actionId: SavePanelActionId, action: () => Promise<void>): AsyncActionOutcome {
    return this.gate.run(actionId, action);
  }

  private button(
    group: BusyGroup,
    labelKey: LocalizationKey,
    onClick: () => void,
    focusKey?: string,
  ): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = this.text(labelKey);
    element.className = 'save-panel__button';
    element.addEventListener('click', onClick);
    // Registered at creation, so a row rebuilt by `refresh` during a busy
    // period comes back disabled rather than live -- and, with a `focusKey`,
    // so the rebuilt row takes back the keyboard the pressed one was holding.
    if (focusKey === undefined) group.add(element);
    else group.add(element, focusKey);
    return element;
  }
}
