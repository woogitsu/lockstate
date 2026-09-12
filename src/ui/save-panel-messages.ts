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
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type SavePanelMessageKey = (typeof SAVE_PANEL_MESSAGE_KEY)[keyof typeof SAVE_PANEL_MESSAGE_KEY];

export const SAVE_PANEL_MESSAGE_KEYS: readonly SavePanelMessageKey[] = Object.values(SAVE_PANEL_MESSAGE_KEY);
