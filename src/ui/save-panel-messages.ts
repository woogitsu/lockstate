import type { LocalizationKey } from '../content/localization';

/**
 * Every message key the save panel can render.
 *
 * ADR 0011, applied to the one player-facing UI module that was outside it
 * (issue #208). The panel used to hold about thirty English literals -- the
 * heading, the five buttons, the empty-list row and seventeen status
 * sentences -- and passed both localization gates while doing so: the HUD's
 * registry gate collects only `src/ui/hud/**` and `src/ui/primitives/**`, and
 * `tests/foundation/localization-key-completeness.test.ts` asks whether the
 * keys a file *declares* resolve, which a file declaring none satisfies
 * trivially.
 *
 * Shaped exactly like `src/ui/hud/messages.ts`, and for the same reason: one
 * frozen object is what lets a test assert that the bundled default catalog
 * resolves *every* key. A key spelled inline somewhere else would never be
 * checked, and an unresolved key renders as itself -- correct runtime
 * behaviour (ADR 0011) and the wrong thing to ship.
 *
 * The `save.` namespace rather than `hud.`: this panel is the host's, laid
 * out by the HUD's aside slot and owned by neither, and it type-imports
 * `src/persistence/**` where the HUD may not (`AGENTS.md` boundary 1).
 */
export const SAVE_PANEL_MESSAGE_KEY = {
  panelRegion: 'save.panel.region',
  panelTitle: 'save.panel.title',

  actionCreate: 'save.action.create',
  actionSave: 'save.action.save',
  actionExport: 'save.action.export',
  actionImport: 'save.action.import',
  actionLoad: 'save.action.load',
  actionDelete: 'save.action.delete',
  /**
   * The two controls the confirmation step adds (#1142), and they exist only
   * while a deletion is armed.
   *
   * Two controls rather than a second press of `actionDelete`, which is the
   * shape `src/ui/hud/dismiss-arming.ts` chose for the roster --
   * `src/ui/save-panel-delete.ts` carries the argument for the difference.
   * The labels name the outcome rather than answering a question ("Yes"/"No"),
   * because a control read out of context by a screen reader has to carry its
   * own meaning, and because the destructive one should be the one that reads
   * as destructive.
   */
  actionDeleteConfirm: 'save.action.delete-confirm',
  actionDeleteCancel: 'save.action.delete-cancel',

  listEmpty: 'save.list.empty',
  /**
   * One prison's row: its name and how many generations are retained.
   *
   * The count is interpolated rather than pluralized, and that is a real
   * limitation rather than an oversight. `src/content/default-locale-en.ts`
   * is a `Record<string, string>`, so a per-key plural form cannot be
   * authored there at all -- only `src/services/localization/default-catalog.ts`
   * carries `PluralForms`, and that file is the trusted-services layer's. "gen"
   * does not inflect in English, so nothing is wrong on screen today; the first
   * locale that needs `one`/`few`/`many` here needs this key moved to a
   * plural-capable catalog and `formatPlural` at the call site.
   */
  listItem: 'save.list.item',

  statusIdle: 'save.status.idle',
  statusSaved: 'save.status.saved',
  statusQuotaExceeded: 'save.status.quota-exceeded',
  statusTransactionAborted: 'save.status.transaction-aborted',
  /**
   * A save refused because the slot moved under this session (ADR 0109
   * Decisions 4 and 5).
   *
   * Its own key rather than `statusSaveFailed`'s `{detail}`, for the reason
   * issue #19 gave quota and abort their own: this is a distinct recoverable
   * state with distinct advice, and the alternative the ADR offers -- reporting
   * it through the generic failure status -- would tell the player "save
   * failed" while a truthful sentence naming the cause was available.
   */
  statusChangedElsewhere: 'save.status.changed-elsewhere',
  statusSaveFailed: 'save.status.save-failed',
  statusListUnreadable: 'save.status.list-unreadable',
  statusCreating: 'save.status.creating',
  statusCreateFailed: 'save.status.create-failed',
  statusNoActivePrison: 'save.status.no-active-prison',
  statusSaving: 'save.status.saving',
  statusLoading: 'save.status.loading',
  statusNotFound: 'save.status.not-found',
  statusNoReadableGeneration: 'save.status.no-readable-generation',
  statusRecovered: 'save.status.recovered',
  statusLoaded: 'save.status.loaded',
  statusDeleted: 'save.status.deleted',
  /** Reported when the player backs out of a confirmation (#1142). */
  statusDeleteKept: 'save.status.delete-kept',
  statusNothingToExport: 'save.status.nothing-to-export',
  statusExported: 'save.status.exported',

  /**
   * The import side of export (#287), and deliberately five sentences rather
   * than one.
   *
   * A file the player chose is refused for reasons that call for different
   * actions: a file that is not a Lockstate save at all (they picked the
   * wrong file), a save from a newer build (they need a newer game, and
   * nothing is wrong with the save), a structurally invalid one and one whose
   * checksum does not match its payload (it was damaged or edited after
   * export). `PrisonSaveRepository.importSave` distinguishes all four --
   * `SaveImportResult.rejected` carries `decodeSaveEnvelope`'s own code -- so
   * collapsing them here would throw away a distinction the layer below
   * already makes, exactly as issue #19 refused to collapse quota, abort and
   * unknown into one "save failed".
   *
   * `imported-migrated` is separate for the same kind of reason: a save from
   * an older schema version *did* load, and it was brought up to date on the
   * way in. That is a different fact from an ordinary import and the one the
   * player is most likely to be wondering about.
   */
  statusImporting: 'save.status.importing',
  statusImported: 'save.status.imported',
  statusImportedMigrated: 'save.status.imported-migrated',
  statusImportNotASave: 'save.status.import-not-a-save',
  statusImportUnsupportedVersion: 'save.status.import-unsupported-version',
  statusImportCorrupt: 'save.status.import-corrupt',
  statusImportInvalid: 'save.status.import-invalid',

  /**
   * One whole sentence per action, not a translated prefix glued to `': '`.
   *
   * The prefix form (`'Saving failed'` + `': '` + detail) assumes English
   * sentence structure and English punctuation in a place a translator cannot
   * reach, which is exactly the "source text as an identifier" failure ADR
   * 0011 rejects.
   */
  failureCreate: 'save.failure.create',
  failureSave: 'save.failure.save',
  failureLoad: 'save.failure.load',
  failureDelete: 'save.failure.delete',
  failureExport: 'save.failure.export',
  failureImport: 'save.failure.import',
  failureUnknown: 'save.failure.unknown',

  detailRestoredScope: 'save.detail.restored-scope',

  /**
   * The confirmation question, and the four ages it can end with (#1142).
   *
   * The age is four keys rather than a formatted timestamp because the
   * question is *how old is this*, not *when exactly was this*, and because
   * the panel's localizer port is `format`/`formatNumber` -- it has no date
   * formatter and this panel is not the place to introduce one.
   * `describeSaveAge` in `src/ui/save-panel-delete.ts` carries why the
   * sentence says "changed" rather than "saved", which is the half of this
   * that is a claim about the code rather than a choice of words.
   */
  deleteConfirm: 'save.delete.confirm',
  deleteAgeMoments: 'save.delete.age.moments',
  deleteAgeMinutes: 'save.delete.age.minutes',
  deleteAgeHours: 'save.delete.age.hours',
  deleteAgeDays: 'save.delete.age.days',

  /**
   * The undo window's row and its two controls (ADR 0114).
   *
   * Two controls, both named after their outcome, for
   * `actionDeleteConfirm`/`actionDeleteCancel`'s reason one screenful up: a
   * control read out of context by a screen reader has to carry its own
   * meaning, and neither of these is a "yes" or a "no" to anything.
   *
   * `tombstoneForget` is the owner's ruling of 2026-09-14 and is the reason
   * this feature is allowed to hold bytes at all --
   * `PrisonSaveRepository.forgetTombstone` carries the argument beside the code
   * that does it.
   */
  tombstoneItem: 'save.tombstone.item',
  actionTombstoneRestore: 'save.action.tombstone-restore',
  actionTombstoneForget: 'save.action.tombstone-forget',

  /**
   * One sentence per arm of `RestoreFromTombstoneResult`, plus the one
   * `forgetTombstone` produces.
   *
   * Not collapsed into a single "could not bring it back", on issue #19's
   * argument: a closed window, a slot somebody else took and a copy that is
   * simply not there call for three different things to be understood, and the
   * repository already distinguishes all three as data.
   */
  statusTombstoneRestored: 'save.status.tombstone-restored',
  statusTombstoneWindowClosed: 'save.status.tombstone-window-closed',
  statusTombstoneSlotTaken: 'save.status.tombstone-slot-taken',
  statusTombstoneGone: 'save.status.tombstone-gone',
  statusTombstoneForgotten: 'save.status.tombstone-forgotten',

  failureRestore: 'save.failure.restore',
  failureForget: 'save.failure.forget',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type SavePanelMessageKey = (typeof SAVE_PANEL_MESSAGE_KEY)[keyof typeof SAVE_PANEL_MESSAGE_KEY];

export const SAVE_PANEL_MESSAGE_KEYS: readonly SavePanelMessageKey[] = Object.values(SAVE_PANEL_MESSAGE_KEY);
