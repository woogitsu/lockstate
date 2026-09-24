import type { DeletedPrison, RestoreOutcome, SaveImportResult, SaveInventory, SaveResult } from '../../src/persistence/local/repository';
import type { PrisonSlotMetadata } from '../../src/persistence/local/store';
import type { ActiveSession, SessionLoadOutcome } from '../../src/persistence/session/session-controller';
import {
  Localizer,
  PSEUDO_LOCALE,
  buildPseudoLocaleCatalog,
  defaultMessageCatalogEn,
} from '../../src/services/localization';
import {
  EMPTY_HUD_VIEW_MODEL,
  type HudBuildEdge,
  type HudCountsViewModel,
  type HudBuildOrder,
  type HudHistoryDirection,
  type HudIntent,
  type HudLocalizer,
  type HudRoomArea,
  type HudRoomGesture,
  type HudBuildQueueViewModel,
  type HudPendingDeliveriesViewModel,
  type HudPrisonerDetailViewModel,
  type HudPrisonerRosterViewModel,
  type HudRegimeViewModel,
  type HudRoomNeedsViewModel,
  type HudRoomsViewModel,
  type HudViewModel,
  type HudZoningNoticeViewModel,
  mountHud,
} from '../../src/ui/hud';
import { SavePanel, type SavePanelSessions } from '../../src/ui/save-panel';
import { CURRENT_SAVE_RESTORED_SCOPE } from '../../src/simulation/runtime/restore-session';
import type {
  ActionLabelFitProbe,
  AlertProbe,
  AlertRowProbe,
  BuildLayoutProbe,
  BuildProbe,
  ButtonState,
  StaffProbe,
  ImportOutcomeName,
  HudProbe,
  IntakeProbe,
  OverviewProbe,
  BuildQueueProbe,
  BuildQueueRowProbe,
  HeldGuardRowProbe,
  HeldGuardsProbe,
  StaffCoverageProbe,
  PendingDeliveriesProbe,
  PendingDeliveryRowProbe,
  LayoutBox,
  LayoutProbe,
  LockstateUiHarness,
  RefusalProbe,
  RegimeBlockProbe,
  RegimeDetailNeedProbe,
  RegimeProbe,
  RegimeRosterRowProbe,
  RepaintFormatterCost,
  RoomsLayoutProbe,
  RoomsProbe,
} from './ui-harness-api';
import {
  HUD_MESSAGE_KEY,
  type HudBuildViewModel,
  type HudHeldGuardsViewModel,
  type HudIntakePipelineViewModel,
  type HudStaffCoverageViewModel,
  type HudStaffViewModel,
} from '../../src/ui/hud';
import '../../src/styles.css';

/**
 * In-page driver for `ui-shell.spec.ts`.
 *
 * It mounts the *real* `SavePanel` and the *real* `mountHud` against a
 * controllable session stub, so the specs observe production DOM in a
 * production browser. The stub is what lets the #65 race be reproduced
 * deterministically: `createPrison` records the slot row immediately and
 * then blocks until the spec releases it, which is exactly the shape of the
 * defect (`SessionController.createPrison` writes the row, then waits 15s on
 * a simulation worker that is already busy, then rejects).
 *
 * This file is test-only. It is never imported by `src/**` and is not part
 * of any production entry point.
 */

const GAME_VERSION = 'lockstate-ui-harness';

interface Pending {
  resolve(result: SaveResult): void;
  reject(error: unknown): void;
}

/**
 * One `SaveImportResult` per branch the panel's mapping has to tell apart.
 *
 * Built here from the real type rather than in a spec, so a change to
 * `SaveImportResult` is a compile error in one place. The decode codes and the
 * presence or absence of `atVersion` are the whole point: `invalid-shape`
 * without a version is "not a Lockstate save" and with one is "a save whose
 * contents do not hold up", and the panel is required to say two different
 * things about them.
 */
const IMPORT_OUTCOMES: Readonly<Record<ImportOutcomeName, SaveImportResult>> = {
  ok: { ok: true, generationId: 'imported-gen-1', revision: 1, migrated: false },
  'ok-migrated': { ok: true, generationId: 'imported-gen-2', revision: 1, migrated: true },
  'not-a-save': {
    ok: false,
    error: { code: 'unknown-error', message: 'Import rejected: Save envelope is missing a numeric saveSchemaVersion.' },
    rejected: { code: 'invalid-shape', message: 'Save envelope is missing a numeric saveSchemaVersion.' },
  },
  'unsupported-version': {
    ok: false,
    error: { code: 'unknown-error', message: 'Import rejected: Version 99 is newer than the latest supported version 4.' },
    rejected: {
      code: 'unsupported-version',
      message: 'Version 99 is newer than the latest supported version 4.',
      atVersion: 99,
    },
  },
  'invalid-shape': {
    ok: false,
    error: { code: 'unknown-error', message: 'Import rejected: Version 4 payload failed validation: kernel: Required' },
    rejected: {
      code: 'invalid-shape',
      message: 'Version 4 payload failed validation: kernel: Required',
      atVersion: 4,
    },
  },
  'checksum-mismatch': {
    ok: false,
    error: { code: 'unknown-error', message: 'Import rejected: Save checksum does not match its payload; the save is corrupt.' },
    rejected: {
      code: 'checksum-mismatch',
      message: 'Save checksum does not match its payload; the save is corrupt.',
      atVersion: 4,
    },
  },
  // A decoded envelope that storage refused: no `rejected`, so the panel must
  // fall back to the save vocabulary (#19) rather than invent an import one.
  'quota-exceeded': { ok: false, error: { code: 'quota-exceeded', message: '' } },
};

class StubSessions implements SavePanelSessions {
  public createCalls = 0;
  public saveCalls = 0;
  public readonly importedRaw: string[] = [];
  public readonly loadedPrisons: string[] = [];
  /**
   * Every prison the panel has actually asked to delete, in order (#1142).
   *
   * The proof a confirmation is real: a Delete control that armed nothing and
   * deleted immediately leaves the same list on screen as one that asks first,
   * right up until the moment this array is read.
   */
  public readonly deletedPrisons: string[] = [];
  /** Every prison whose copy the panel has asked to free, in order (ADR 0114). */
  public readonly forgottenPrisons: string[] = [];
  private readonly prisons: PrisonSlotMetadata[] = [];
  /**
   * The stub's `tombstones` store (ADR 0114).
   *
   * A real move rather than a list of names: `deletePrison` takes the slot out
   * of `prisons` and puts it here, `restoreDeletedPrison` puts it back, and
   * both lists are read by the panel through the same port the real controller
   * satisfies. A stub that only recorded the call would leave a panel that
   * drew no row at all looking identical to one that drew the row correctly.
   */
  private readonly deleted: { readonly slot: PrisonSlotMetadata; readonly deletedAt: number; expiresAt: number }[] = [];
  /** What the stub's next restore will report, so all four arms are reachable from a spec. */
  private restoreOutcome: RestoreOutcome | undefined;
  private pendingCreate: Pending | undefined;
  private session: ActiveSession | undefined;
  private importOutcome: ImportOutcomeName = 'ok';

  public async listPrisons(): Promise<readonly PrisonSlotMetadata[]> {
    return [...this.prisons];
  }

  public getActiveSession(): ActiveSession | undefined {
    return this.session;
  }

  public activateSession(prisonId: string): void {
    this.session = { prisonId, revision: 1, createdAt: Date.now() };
  }

  public setImportOutcome(outcome: ImportOutcomeName): void {
    this.importOutcome = outcome;
  }

  public async importInto(prisonId: string, raw: unknown): Promise<SaveImportResult> {
    // Recorded as JSON so a spec can assert that *this* file's contents
    // arrived, not merely that something did.
    this.importedRaw.push(JSON.stringify(raw));
    void prisonId;
    return IMPORT_OUTCOMES[this.importOutcome];
  }

  public createPrison(prisonId: string, displayName?: string): Promise<SaveResult> {
    this.createCalls += 1;
    const now = Date.now();
    // The row is written *before* the slow step, exactly as the controller
    // does. Without the UI guard a second click lands here again and leaves a
    // second `New Prison (0 gen)` orphan.
    this.prisons.push({
      prisonId,
      gameVersion: GAME_VERSION,
      ...(displayName === undefined ? {} : { displayName }),
      currentGenerationId: undefined,
      generationIds: [],
      createdAt: now,
      updatedAt: now,
    });
    return new Promise<SaveResult>((resolve, reject) => {
      this.pendingCreate = { resolve, reject };
    });
  }

  public async saveNow(): Promise<SaveResult> {
    this.saveCalls += 1;
    return { ok: false, error: { code: 'unknown-error', message: 'No active session to save.' } };
  }

  public async loadPrison(prisonId: string): Promise<SessionLoadOutcome> {
    this.loadedPrisons.push(prisonId);
    // A session is what an import has just written into, so a load of one
    // succeeds here; the not-found path is the panel's own Load button and is
    // covered by `describeLoadFailure`'s unit tests.
    if (this.session?.prisonId !== prisonId) return { ok: false, reason: 'not-found' };
    return { ok: true, recovered: false, scope: CURRENT_SAVE_RESTORED_SCOPE };
  }

  public async deletePrison(prisonId: string): Promise<void> {
    this.deletedPrisons.push(prisonId);
    const index = this.prisons.findIndex((prison) => prison.prisonId === prisonId);
    if (index < 0) return;
    const [slot] = this.prisons.splice(index, 1);
    if (slot === undefined) return;
    const deletedAt = Date.now();
    this.deleted.push({ slot, deletedAt, expiresAt: deletedAt + 24 * 60 * 60 * 1000 });
  }

  /** One read for both halves, exactly as the real controller does it. */
  public async listSaves(): Promise<SaveInventory> {
    return { prisons: await this.listPrisons(), deleted: await this.listDeletedPrisons() };
  }

  public async listDeletedPrisons(): Promise<readonly DeletedPrison[]> {
    // The sweep, mirrored: the real repository deletes an expired copy in the
    // transaction that reads it, so a stub that returned expired rows would
    // let a spec assert a row the application can never draw.
    const now = Date.now();
    for (let index = this.deleted.length - 1; index >= 0; index -= 1) {
      if (now >= (this.deleted[index]?.expiresAt ?? 0)) this.deleted.splice(index, 1);
    }
    return this.deleted.map((entry) => ({
      prisonId: entry.slot.prisonId,
      ...(entry.slot.displayName === undefined ? {} : { displayName: entry.slot.displayName }),
      deletedAt: entry.deletedAt,
      expiresAt: entry.expiresAt,
    }));
  }

  public async restoreDeletedPrison(prisonId: string): Promise<RestoreOutcome> {
    const forced = this.restoreOutcome;
    this.restoreOutcome = undefined;
    const index = this.deleted.findIndex((entry) => entry.slot.prisonId === prisonId);
    if (forced !== undefined && forced !== 'restored') {
      // Every refusal arm of the real method also destroys or declines to touch
      // the copy; `'window-closed'` is the one that deletes it, which is what
      // makes its sentence true.
      if (forced === 'window-closed' && index >= 0) this.deleted.splice(index, 1);
      return forced;
    }
    if (index < 0) return 'not-found';
    const [entry] = this.deleted.splice(index, 1);
    if (entry !== undefined) this.prisons.push(entry.slot);
    return 'restored';
  }

  public async forgetDeletedPrison(prisonId: string): Promise<void> {
    this.forgottenPrisons.push(prisonId);
    const index = this.deleted.findIndex((entry) => entry.slot.prisonId === prisonId);
    if (index >= 0) this.deleted.splice(index, 1);
  }

  /** Makes the next restore report this outcome, so a spec can reach all four. */
  public setRestoreOutcome(outcome: RestoreOutcome): void {
    this.restoreOutcome = outcome;
  }

  /** How many deleted prisons are still restorable, read without the DOM. */
  public deletedCount(): number {
    return this.deleted.length;
  }

  /**
   * Puts a prison on the list with a chosen name and a chosen age (#1142).
   *
   * `createPrison` cannot do this: it stamps `Date.now()` and blocks on a
   * pending promise, so every prison it makes is seconds old and the
   * confirmation's age sentence would only ever have one reachable form.
   */
  public seedPrison(prisonId: string, displayName: string, updatedAt: number): void {
    this.prisons.push({
      prisonId,
      gameVersion: GAME_VERSION,
      displayName,
      currentGenerationId: 'gen-1',
      generationIds: ['gen-1'],
      createdAt: updatedAt,
      updatedAt,
    });
  }

  public async exportActive(): Promise<undefined> {
    return undefined;
  }

  public releaseCreate(outcome: 'ok' | 'worker-timeout'): void {
    const pending = this.pendingCreate;
    this.pendingCreate = undefined;
    if (pending === undefined) return;
    if (outcome === 'ok') pending.resolve({ ok: true, generationId: 'gen-1', revision: 1 });
    // The exact rejection issue #65 leaked to the console.
    else pending.reject(new Error('The simulation worker did not reply within 15000ms'));
  }

  public prisonCount(): number {
    return this.prisons.length;
  }
}

/**
 * The alert rows the page is showing right now, in DOM order.
 *
 * Scoped to the alerts list because `data-alert` is also on the empty-list
 * row, which lives in the same list and is not an alert.
 */
const alertRowNodes = (): readonly HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('.hud-alerts__list [data-alert]:not([data-alert="empty"])'),
];

/** Live node references, so `alertProbe().reused` compares identity and not markup. */
let markedAlertRows: readonly HTMLElement[] = [];

const unhandledRejections: string[] = [];
window.addEventListener('unhandledrejection', (event) => {
  unhandledRejections.push(event.reason instanceof Error ? event.reason.message : String(event.reason));
});

const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

/**
 * The pseudo-locale, derived mechanically from the same catalog (ADR 0011).
 *
 * Every resolved string comes back bracketed and accented, so any text a
 * module hard-codes instead of resolving stands out immediately -- which is
 * exactly the defect issue #208 reported in `src/ui/save-panel.ts`.
 */
const pseudoLocalizer = new Localizer({
  locale: PSEUDO_LOCALE,
  catalogs: [defaultMessageCatalogEn, buildPseudoLocaleCatalog(defaultMessageCatalogEn)],
});

/**
 * The real `Localizer`, with a counter around the one method issue #136 is
 * about.
 *
 * `HudLocalizer` is the three-method port the HUD depends on, so this is a
 * legitimate implementation of it rather than a mock: every call still goes
 * to the real localizer. The counter is what lets `ui-shell.spec.ts` report
 * how many values one repaint formats instead of asserting a number somebody
 * counted by reading the code.
 */
let formatNumberCalls = 0;
const countingLocalizer: HudLocalizer = {
  format: (key, parameters) => (parameters === undefined ? localizer.format(key) : localizer.format(key, parameters)),
  // Forwarded uncounted: the counter above exists for issue #136's
  // `Intl.NumberFormat` construction cost, and nothing in the HUD selects a
  // plural form yet, so counting this one would report a zero that looks like
  // a measurement.
  formatPlural: (key, count, parameters) =>
    parameters === undefined ? localizer.formatPlural(key, count) : localizer.formatPlural(key, count, parameters),
  formatNumber: (value, options) => {
    formatNumberCalls += 1;
    return options === undefined ? localizer.formatNumber(value) : localizer.formatNumber(value, options);
  },
};

// `stateIncomeAccruedTodayMinorUnits` is what this fixture's own clock and
// population would actually have earned by now, rather than a round number:
// 142 occupied places at 300 minor units a prisoner-day, a quarter of the way
// through a 2,400-tick day, is `floor(300 x 142 x 601 / 2400)` = 10,667 (#29).
/*
 * Lifted out of `BASE_VIEW_MODEL` below by issue #1191, which made
 * `HudViewModel.counts` optional: a fixture that reads a figure back off the
 * view model would otherwise have to assert the field's presence at every use.
 * The row itself is unchanged, and this fixture is deliberately a prison that
 * *has* reported -- the absent case is what `mountHudShell({ empty: true })`
 * drives, through `EMPTY_HUD_VIEW_MODEL`.
 */
const BASE_COUNTS: HudCountsViewModel = {
  prisoners: 142,
  prisonerCapacity: 180,
  // Everybody housed, which is what the accrual above already assumes: 142
  // occupied places is where `10_667` comes from. A fixture whose accrual
  // said 142 and whose place count said otherwise would put the strip's
  // "N not housed" badge (#609, the noun since #961) on every spec in this file for a prison
  // the same fixture is paying full price for.
  occupiedPlaces: 142,
  staff: 27,
  // Not painted by anything this harness drives (issue #870): the field
  // exists on `HudCountsViewModel` and needs a value to satisfy the type,
  // and it is deliberately not a fraction of `staff` above so a future
  // reader that confused the two would not get a plausible-looking number
  // by accident.
  staffUnassigned: 5,
  rooms: 61,
  // The three coverage rungs sum to 142, this fixture's own population, and
  // no two of them are equal -- so a strip that read the wrong one, or
  // derived one by subtraction, renders a number this fixture never gave it
  // (issue #588).
  prisonersCovered: 100,
  prisonersUnderstaffed: 30,
  prisonersUnguarded: 12,
  prisonersHighRisk: 0,
  activeIncidents: 0,
  contrabandFound: 4,
  treasuryMinorUnits: 24_920,
  stateIncomeAccruedTodayMinorUnits: 10_667,
};

const BASE_VIEW_MODEL: HudViewModel = {
  counts: BASE_COUNTS,
  // Day 3, a quarter of the way through a 2,400-tick day, paused.
  clock: { day: 3, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
  alerts: [],
  /*
   * The Overview section's readout (issue #1183), present here because this
   * fixture is a prison that *has* reported -- which is the state the panel's
   * figures are for.
   *
   * The first two repeat `counts` above deliberately rather than being
   * different numbers: they are the same two published figures the status
   * strip states, and a fixture that gave the panel a different balance from
   * the chip would hide exactly the defect a reader of this screen would care
   * about. `4_800` is a third distinct number, so a row wired to the wrong
   * field is visible.
   *
   * `EMPTY_HUD_VIEW_MODEL` carries no `overview` at all, which is what
   * `mountHudShell({ empty: true })` drives: no prison has reported, and the
   * panel says so in words rather than in zeros.
   */
  overview: {
    treasuryMinorUnits: 24_920,
    stateIncomeAccruedTodayMinorUnits: 10_667,
    dailyWageBillMinorUnits: 4_800,
  },
};

/** A screened day-three offer; the harness supplies data, while the real browser spec checks generation. */
const CANDIDATE_VIEW_MODEL: HudViewModel = {
  ...BASE_VIEW_MODEL,
  intakePipeline: {
    waiting: 0, failed: 0, total: 0, waitingWithoutPlace: 0, stages: [],
    candidates: [{
      id: 'fixture-1', riskTier: 1, sentenceLengthTicks: 12_000,
      contrabandRolled: false, bountyMinorUnits: 150,
      expiresAtTick: 4 * 2_400, status: 'new',
    }],
  },
};

/**
 * A room catalogue in the shape `roomCatalogue()` in `src/main.ts` projects,
 * written out here rather than imported so the specs exercise the *panel* and
 * not the content catalogue -- the same rule `BUILD_MODEL` below follows.
 *
 * Three entries and not eighteen, chosen so every branch of the panel's rule
 * rendering is reachable: a room with a minimum bigger than one tile
 * (`room.cell`, 2x3, `enclosed`), a room with a much bigger one (`room.canteen`,
 * 6x6, `enclosed`) and a room that is authored `outdoors` (`room.yard`, 8x8).
 * The real eighteen are driven in `tests/browser/app-shell.spec.ts`, which is
 * where the real projection runs.
 *
 * The tints are the categories' own from `src/rendering/world/appearance.ts`,
 * because the panel puts them on screen and a wrong number here would make a
 * legend assertion pass against the wrong colour.
 *
 * **`objectRequirements` is copied from the real catalogue, and is exactly the
 * kind of figure this harness must not be trusted for.** The three rooms happen
 * to cover the three branches #529 added -- objects with a quantity above one
 * (`room.canteen`: two dining tables, four benches), objects with a quantity of
 * one (`room.cell`), and none at all (`room.yard`) -- and every one of those
 * numbers is written out here by hand. A spec asserting "the canteen states 4 x
 * Bench" against this fixture proves the *panel* renders what it is given and
 * proves **nothing at all** about what `roomCatalogue()` in `src/main.ts`
 * derives: both could be wrong in the same direction and every assertion here
 * would stay green. That is precisely how a defect survives a full suite. The
 * assertion that can actually fail is in `app-shell.spec.ts`, against the real
 * projection; this one is a layout fixture and nothing more.
 */
const ROOMS_MODEL: HudRoomsViewModel = {
  rooms: [
    {
      roomId: 'room.cell',
      labelKey: 'room.cell.name',
      tint: 0x4f7fd0,
      minimum: { width: 2, height: 3 },
      enclosure: 'enclosed',
      objectRequirements: [
        { objectId: 'object.bed', labelKey: 'object.bed.name', quantity: 1 },
        { objectId: 'object.toilet', labelKey: 'object.toilet.name', quantity: 1 },
      ],
    },
    {
      roomId: 'room.canteen',
      labelKey: 'room.canteen.name',
      tint: 0xd0854f,
      minimum: { width: 6, height: 6 },
      enclosure: 'enclosed',
      objectRequirements: [
        { objectId: 'object.dining-table', labelKey: 'object.dining-table.name', quantity: 2 },
        { objectId: 'object.bench', labelKey: 'object.bench.name', quantity: 4 },
      ],
    },
    {
      roomId: 'room.yard',
      labelKey: 'room.yard.name',
      tint: 0x76d04f,
      minimum: { width: 8, height: 8 },
      enclosure: 'outdoors',
      // Authored with no object requirement at all, which is what makes the
      // "no objects needed" line reachable from this harness.
      objectRequirements: [],
    },
  ],
};

/**
 * Two of the twenty-one entries `src/main.ts` projects out of
 * `BUILDABLE_REGISTRY`, as plain view-model data. Kept here rather than
 * imported from the registry so the spec exercises the *panel*, not the catalog.
 *
 * Two rather than twenty-one, and unchanged as the registry grew from two rows
 * to twenty-one across ADR 0028 phases 1, 2 and 4: every measurement in this
 * harness is about the panel's controls and its height budget rather than about
 * how many things a prison can build. That the fixture never needed touching as
 * seventeen rows landed is the evidence that it is measuring the panel. `tests/browser/app-shell.spec.ts` drives
 * the real projection, and `buildModelWithCatalogueOf` below is how a longer
 * list is measured.
 */
const BUILD_MODEL: HudBuildViewModel = {
  buildables: [
    {
      definitionId: 'wall-brick',
      labelKey: HUD_MESSAGE_KEY.buildableWallBrick,
      occupiesEdge: true,
      placesObject: false,
      // The group `src/main.ts` mints for the two buildables that place no
      // object, and the one both of this fixture's rows fall into -- which is
      // what the real projection says of exactly these two ids (ADR 0035).
      //
      // So this harness has **one** group, `buildCategoryOptions` answers with
      // no options at all, and the panel measured here draws no category filter.
      // That is the useful half rather than a gap: every height this harness
      // pins is measured on a panel without the control, and every one of them
      // is unchanged, which is the other half of the evidence that the control
      // costs nothing. The filtered panel is measured on the assembled page,
      // against the real eight-group projection.
      categoryId: 'structure',
      categoryLabelKey: HUD_MESSAGE_KEY.buildCategoryStructure,
      // The same figures `src/main.ts` projects for this buildable: two
      // bricks per wall at 40 minor units each, bounded by the simulation's
      // own `MAX_PURCHASE_QUANTITY`. Written out rather than imported for the
      // reason above -- the spec exercises the panel, not the catalog -- and
      // `tests/browser/app-shell.spec.ts` is where the real projection is
      // driven.
      material: {
        itemId: 'item.brick',
        labelKey: 'item.brick.name',
        unitPriceMinorUnits: 40,
        quantityPerPlacement: 2,
        maxQuantity: 100_000,
      },
      // What `placementCostMinorUnits` (`src/simulation/economy/placement-cost.ts`)
      // answers for this buildable's one requirement, which is what
      // `buildCatalogue` in `src/main.ts` now puts on the row.
      //
      // **It is a separate figure from `material` above rather than a
      // derivation of it, which is the whole reason the field exists** (issue
      // #1160): the panel used to multiply that material's two numbers itself,
      // over the first purchasable requirement rather than all of them. A
      // fixture that omits this renders a row with no price at all -- measured,
      // when it was omitted: `is reachable from the Build tab and hidden from
      // every other one` failed on `Brick wall · 80 per segment`.
      //
      // Written out rather than imported for the reason the prices above are:
      // this harness exercises the panel, and `app-shell.spec.ts` plus
      // `ui-build-catalogue-price.spec.ts` drive the real projection.
      placementCostMinorUnits: 80,
    },
    {
      definitionId: 'door-wooden',
      labelKey: HUD_MESSAGE_KEY.buildableDoorWooden,
      // `true` and `false`, which is why the two flags are not opposites: a
      // door occupies a tile edge and places no *object* -- what it places is a
      // door, which is a fact about that edge.
      //
      // This row read `occupiesEdge: false`, with the note: *"`occupiesEdge` is
      // derived from `category === 'wall'` there, so the panel hides its edge
      // chooser for one. That second half is a known gap rather than a fact
      // about doors ... This fixture mirrors what the composition root produces
      // today; it moves when that does."* It has moved. `src/main.ts` derives
      // this from `occupiesTileEdge` since issue #531, so the projection this
      // fixture mirrors now answers `true` for a door, and a fixture left at
      // `false` would be an assertion agreeing with the defect.
      occupiesEdge: true,
      categoryId: 'structure',
      categoryLabelKey: HUD_MESSAGE_KEY.buildCategoryStructure,
      placesObject: false,
      material: {
        itemId: 'item.wood-plank',
        labelKey: 'item.wood-plank.name',
        unitPriceMinorUnits: 65,
        quantityPerPlacement: 1,
        maxQuantity: 100_000,
      },
      // One plank at 65, the same way the row above carries two bricks at 40.
      placementCostMinorUnits: 65,
    },
  ],
  origin: { x: 16, y: 16 },
};

/**
 * The one role `src/main.ts` projects out of the staff-role catalogue, as
 * plain view-model data (ADR 0025).
 *
 * The wage is the guard's authored `wageBand.minPerDay`, written out rather
 * than imported for the reason `BUILD_MODEL` writes its prices out: the spec
 * exercises the *panel*, not the catalogue, and
 * `tests/browser/app-shell.spec.ts` is where the real projection is driven.
 */
const STAFF_MODEL: HudStaffViewModel = {
  /*
   * **The two money figures are deliberately different, and content makes them
   * the same** (issue #639 ruling 2).
   *
   * The shipped guard is authored `wageBand: { minPerDay: 80 }`, and both
   * `staffHireCostMinorUnits` and `staffDailyWageMinorUnits` read it -- so in
   * the real application a hire costs 80 and bills 80 a day, which is what
   * `app-shell.spec.ts` drives through the real projection and what
   * `ui-shell.spec.ts` pins as `Hire Guard · 80`.
   *
   * A fixture that copied that pair would let a panel render
   * `hireChargeMinorUnits` twice and never read the wage at all, and every
   * assertion would still pass -- a fixture supplying both sides of the
   * comparison, which `docs/TESTING.md` forbids. So `hireChargeMinorUnits`
   * stays 80, because specs in this file assert the button's own label against
   * it, and the daily wage is 55: a figure no catalogue authors, chosen so that
   * one standing in for the other is a visible failure.
   */
  roles: [
    {
      staffRoleId: 'staff-role.guard',
      labelKey: 'staff-role.guard.name',
      hireChargeMinorUnits: 80,
      dailyWageMinorUnits: 55,
    },
  ],
};

/**
 * A catalogue of `count` entries, for issue #143.
 *
 * `BUILDABLE_REGISTRY` holds twenty-one buildables, and **the condition is now
 * reachable through the real app**, which it was not when this was written.
 * This docblock used to say "four is still three fewer than it takes to push
 * the panel's last section below the fold at 1280x720, so the condition cannot
 * be reached through the real app at all today", and ADR 0028 phase 4's
 * seventeen object rows falsified it: seven is the number that first overflows
 * the panel here, and the real catalogue is three times that. #143's fix is
 * what keeps that from being a defect a player meets.
 *
 * The synthetic list stays, and is now the *smaller* of the two routes: it
 * varies the row count on demand, which the real registry cannot, so a
 * regression is measured at several lengths rather than at whatever length the
 * catalogue happens to be.
 *
 * The two label keys repeat down the list because the content catalogue
 * defines exactly two, and inventing a third key here would put a key with no
 * translation on screen. The row count is what this varies; the labels are
 * not the subject.
 */
function buildModelWithCatalogueOf(count: number): HudBuildViewModel {
  return {
    buildables: Array.from({ length: count }, (_, index) => ({
      definitionId: index === 0 ? 'wall-brick' : index === 1 ? 'door-wooden' : `buildable-${index}`,
      labelKey: index % 2 === 0 ? HUD_MESSAGE_KEY.buildableWallBrick : HUD_MESSAGE_KEY.buildableDoorWooden,
      // Alternating, so this list always holds a row that sits on no edge --
      // which `ui-shell.spec.ts` uses to measure a hidden edge chooser now that
      // the two-row fixture's door does sit on one (#531). It does **not**
      // describe the real registry, and the `door-wooden` id at index 1 is not
      // claiming to: the ids repeat because the content catalogue defines two
      // label keys and inventing a third would put an untranslated key on
      // screen, exactly as the note above this function says. Read
      // `BUILD_MODEL` for what the composition root actually projects.
      occupiesEdge: index % 2 === 0,
      // Every row is a wall route here: what this function varies is the row
      // *count*, and a mixture of gestures would make the measurement about
      // something else.
      placesObject: false,
      // One group for the whole synthetic list, for the same reason every row
      // is a wall route: this varies the row *count*, and a list divided into
      // groups would make "the panel at twelve rows" a measurement of the
      // filter's division rather than of twelve rows (ADR 0035). One group
      // means no filter is drawn, so these measurements are of the panel
      // without it -- see `BUILD_MODEL` above.
      categoryId: 'structure',
      categoryLabelKey: HUD_MESSAGE_KEY.buildCategoryStructure,
      // The first two entries are the real ones and carry the real priced
      // material, so the panel this measures has the controls the
      // application's does -- the buy disclosure costs no height either way,
      // sharing the arm button's row, and a list whose entries silently
      // lacked one would be measuring a panel nobody ships.
      //
      // Everything past them is an invented `buildable-N` that no content
      // module defines, so it gets **no** material: inventing a price for an
      // id nothing sells is the same mistake as inventing a label for it, and
      // the absence is itself a case worth having on screen (the panel must
      // offer no purchase at all for a buildable nobody sells).
      ...(index < 2 ? { material: BUILD_MODEL.buildables[index]!.material! } : {}),
    })),
    origin: { x: 16, y: 16 },
  };
}

/**
 * One element's rectangle, rounded, or `null` when the browser gave it none.
 *
 * A zero-area box is not laid out at all -- the element itself, or an
 * ancestor, is `display: none`. Reported as absent rather than as a 0x0
 * rectangle at the origin, which would silently satisfy an overlap check.
 *
 * Module-level because four probes need the same answer, and a per-probe copy
 * of this rule is a rule that can drift between them.
 */
function layoutBoxOf(node: Element | null): LayoutBox | null {
  if (node === null) return null;
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
  };
}

/**
 * What the Build panel's queue block is actually showing, measured rather than
 * read off attributes.
 *
 * Module-level beside `layoutBoxOf`, because the row walk and the "is this
 * reachable" rule are two things a per-probe copy would let drift -- and the
 * rule is the whole point of the probe. #220's finding was that a row in a
 * folded section inside a container `hud.css` drops at 720px is
 * `offsetParent === null` with a 0x0 box at *every* viewport while
 * `toContainText` passes. Every field below is one of the two answers that
 * would have caught it.
 */
function buildQueueProbe(): BuildQueueProbe {
  const section = document.querySelector<HTMLElement>('.hud-build__queue');
  const header = section?.querySelector<HTMLButtonElement>('.ui-section__header') ?? null;
  const shortfall = document.querySelector<HTMLElement>('.hud-build__queue-shortfall');
  const rows = [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')].filter(
    // Laid out, not merely present: the rows are pooled, so the ones with no
    // order in them are `hidden` and still in the DOM. A probe that reported
    // them would count three rows for a queue of one.
    (row) => row.getClientRects().length > 0,
  );
  return {
    sectionLaidOut: section !== null && section.getClientRects().length > 0,
    open: header?.getAttribute('aria-expanded') === 'true',
    countText: section?.querySelector<HTMLElement>('.hud-build__queue-count')?.textContent?.trim() ?? '',
    sectionBox: layoutBoxOf(section),
    rows: rows.map((row): BuildQueueRowProbe => {
      const cancel = row.querySelector<HTMLButtonElement>('.ui-action');
      return {
        orderId: row.dataset['order'] ?? '',
        state: row.dataset['state'] ?? '',
        labelText: row.querySelector<HTMLElement>('.hud-build__queue-label')?.textContent?.trim() ?? '',
        stateText: row.querySelector<HTMLElement>('.hud-build__queue-state')?.textContent?.trim() ?? '',
        cancelAccessibleName: cancel?.getAttribute('aria-label') ?? '',
        cancelBox: layoutBoxOf(cancel),
        cancelHasOffsetParent: cancel !== null && cancel.offsetParent !== null,
        cancelDisabled: cancel?.disabled ?? true,
      };
    }),
    moreText:
      [...(section?.querySelectorAll<HTMLElement>('.hud-build__note') ?? [])]
        .filter((line) => line.getClientRects().length > 0)
        .map((line) => (line.textContent ?? '').trim())
        .find((text) => text.length > 0) ?? '',
    // Queried from the document and not from `section`, deliberately: the node
    // is a sibling of the block rather than a child of it, so that a collapsed
    // fold cannot hide it. A probe that looked inside `section` would report
    // this line as absent while it was on screen.
    shortfallText: shortfall?.textContent?.trim() ?? '',
    shortfallLaidOut: shortfall !== null && shortfall.getClientRects().length > 0,
    shortfallHasOffsetParent: shortfall !== null && shortfall.offsetParent !== null,
    shortfallBox: layoutBoxOf(shortfall),
  };
}

/**
 * What the buy disclosure says is on its way (#285).
 *
 * Rows are filtered by `getClientRects()` and not by presence, for the reason
 * `buildQueueProbe` filters its own: the rows are pooled, so the ones with no
 * delivery in them are `hidden` and still in the DOM, and a probe that reported
 * them would count three rows for a list of one.
 */
/**
 * The held-guards section, measured rather than read off attributes (ADR 0034).
 *
 * Rows are filtered by `getClientRects().length > 0` for `pendingDeliveriesProbe`'s
 * reason: the rows are pooled, so a row with no guard in it is present in the DOM
 * and must not be reported as one the player can see.
 */
/**
 * The coverage block, measured rather than read off attributes (ADR 0048).
 *
 * The badge's own `data-tone` is reported beside the block's, and not folded
 * into one field: they are written by two different lines of `paintCoverage`,
 * and a block tinted for a shortage over a badge still reading "Covered" is
 * exactly the disagreement a single field would hide.
 */
function staffCoverageProbe(): StaffCoverageProbe {
  const block = document.querySelector<HTMLElement>('.hud-staff__coverage');
  const badge = block?.querySelector<HTMLElement>('.ui-badge') ?? null;
  const consequence = block?.querySelector<HTMLElement>('.hud-staff__coverage-consequence') ?? null;
  return {
    blockLaidOut: block !== null && block.getClientRects().length > 0,
    tone: block?.dataset['tone'] ?? null,
    summaryText: block?.querySelector<HTMLElement>('.hud-staff__coverage-summary')?.textContent?.trim() ?? '',
    badgeText: badge?.querySelector<HTMLElement>('.ui-badge__text')?.textContent?.trim() ?? '',
    badgeTone: badge?.dataset['tone'] ?? null,
    hintText:
      [...(block?.querySelectorAll<HTMLElement>('.hud-staff__note') ?? [])]
        // `.hud-staff__coverage-consequence` is a `.hud-staff__note` too and it
        // is *below* the hint, so `find` still lands on the hint. Excluded
        // anyway rather than relying on document order, because the order of
        // two siblings is not the claim this field is making.
        .filter((line) => !line.classList.contains('hud-staff__coverage-consequence'))
        .filter((line) => line.getClientRects().length > 0)
        .map((line) => (line.textContent ?? '').trim())
        .find((text) => text.length > 0) ?? '',
    consequenceText: consequence !== null && consequence.getClientRects().length > 0 ? (consequence.textContent ?? '').trim() : '',
    blockBox: layoutBoxOf(block),
  };
}

/**
 * The Regime panel's two blocks and the bottom of the lower one (issue #451).
 *
 * Module-level beside `heldGuardsProbe`, and it follows that function's one
 * load-bearing rule: **every list is filtered by `getClientRects()`**. Both
 * lists here have a way of holding words a player cannot see -- the roster's
 * rows are pooled and merely hidden when the reply is shorter, and the two note
 * lines carry `.hud-regime__note`, which `hud.css` gives an author `display`
 * under `max-height: 700px`. Reading `textContent` off either would report the
 * previous tick's prisoners as though they were still on the roster.
 */
function regimeProbe(): RegimeProbe {
  // Two panels since ADR 0115, laid out together on the Plan dnia tab: the
  // timetable's and the roster's. Every fold measurement below is the roster
  // panel's, because every line those measurements are about is inside it.
  const schedulePanel = document.querySelector<HTMLElement>('.hud-regime');
  const panel = document.querySelector<HTMLElement>('.hud-roster');
  const blocks = document.querySelector<HTMLElement>('.hud-regime__blocks');
  const roster = document.querySelector<HTMLElement>('.hud-regime__roster');
  const empty = [...(roster?.querySelectorAll<HTMLElement>('.hud-regime__note') ?? [])].find(
    (note) => !note.classList.contains('hud-regime__roster-more'),
  );
  const more = roster?.querySelector<HTMLElement>('.hud-regime__roster-more');
  const drawn = (node: Element | null | undefined): boolean =>
    node !== null && node !== undefined && node.getClientRects().length > 0;
  const textOf = (node: Element | null | undefined): string => (node?.textContent ?? '').trim();

  const rows = [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row')].filter((row) => drawn(row));

  return {
    // `offsetParent`, not `getClientRects()`: this is the rail question, and
    // `setVisible(false)` hides the panel's own element, so the answer has to
    // come from the ancestor chain the way `staffProbe` and `intakeProbe` take
    // it.
    laidOut: schedulePanel !== null && schedulePanel.offsetParent !== null,
    rosterPanelLaidOut: panel !== null && panel.offsetParent !== null,
    blocksLaidOut: drawn(blocks),
    blocks: [...(blocks?.querySelectorAll<HTMLElement>('.hud-regime__block-row') ?? [])].map(
      (row): RegimeBlockProbe => ({
        group: row.dataset['group'] ?? '',
        nameText: textOf(row.querySelector('.hud-regime__block-name')),
        progressText: textOf(row.querySelector('.hud-regime__block-progress')),
        allowsText: textOf(row.querySelector('.hud-regime__block-allows')),
        laidOut: drawn(row),
      }),
    ),
    rosterLaidOut: drawn(roster),
    total: roster?.dataset['total'] ?? null,
    everAdmitted: roster?.dataset['everAdmitted'] ?? null,
    countText: textOf(roster?.querySelector('.hud-regime__roster-count')),
    rows: rows.map((row): RegimeRosterRowProbe => {
      const badge = row.querySelector<HTMLElement>('.ui-badge');
      const bar = row.querySelector<HTMLElement>('.hud-regime__roster-need .ui-bar');
      return {
        prisoner: row.dataset['prisoner'] ?? '',
        classificationGroup: row.dataset['classificationGroup'] ?? null,
        riskTier: row.dataset['riskTier'] ?? null,
        // Whether the row is a control at all, and whether it is the chosen
        // one (issue #895). `getAttribute` for the two ARIA carriers, because
        // *absent* is a distinct state from `"false"` on both -- a vacated
        // pooled row has no `role` and no `aria-checked`, which is what keeps
        // it out of the #88 control sweep's inventory.
        role: row.getAttribute('role'),
        tabIndex: row.tabIndex,
        ariaChecked: row.getAttribute('aria-checked'),
        selected: row.dataset['selected'] ?? null,
        nameText: textOf(row.querySelector('.hud-regime__roster-name')),
        activityText: textOf(row.querySelector('.hud-regime__roster-activity')),
        badgeText: textOf(badge),
        badgeTone: badge?.dataset['tone'] ?? null,
        need: row.dataset['need'] ?? null,
        needPermille: row.dataset['needPermille'] ?? null,
        needUnmet: row.dataset['needUnmet'] ?? null,
        needText: textOf(row.querySelector('.hud-regime__roster-need-name')),
        needTone: bar?.dataset['tone'] ?? null,
        needValueText: bar?.getAttribute('aria-valuetext') ?? null,
        box: layoutBoxOf(row),
      };
    }),
    emptyLaidOut: drawn(empty),
    emptyText: textOf(empty),
    moreLaidOut: drawn(more),
    moreText: textOf(more),
    // `innerText`, so the answer is what was rendered: the pooled rows the
    // panel hid are left out of it, and a panel with no box at all reports
    // nothing rather than reporting its whole vocabulary.
    text: [schedulePanel, panel].map((box) => (box === null ? '' : box.innerText)).join('\n').trim(),
    panelVisibleBottom:
      panel === null ? 0 : panel.getBoundingClientRect().top + panel.clientTop + panel.clientHeight,
    panelOverflow: panel === null ? 0 : panel.scrollHeight - panel.clientHeight,
    panelScrollTop: panel?.scrollTop ?? 0,
    scheduleBox: layoutBoxOf(schedulePanel),
    scheduleOverflow: schedulePanel === null ? 0 : schedulePanel.scrollHeight - schedulePanel.clientHeight,
    scheduleLastLineBottom: [...(blocks?.querySelectorAll<HTMLElement>('.hud-regime__block-row') ?? [])]
      .filter((row) => drawn(row))
      .reduce((lowest, row) => Math.max(lowest, row.getBoundingClientRect().bottom), 0),
    // The lowest edge the panel actually drew, whichever line that is: the last
    // roster row on a full window, the "and N more" line when the population
    // outgrew it, or the empty sentence in a prison that holds nobody.
    lastLineBottom: [
      ...rows,
      ...(drawn(more) && more !== null && more !== undefined ? [more] : []),
      ...(drawn(empty) && empty !== undefined ? [empty] : []),
    ].reduce((lowest, node) => Math.max(lowest, node.getBoundingClientRect().bottom), 0),
    panelBox: layoutBoxOf(panel),
    // The inspector, and its need lines are filtered by `getClientRects()` for
    // the reason every list in this probe is: they are pooled, so a line with
    // no need in it is present in the DOM and must not be reported as one the
    // player can see.
    detail: (() => {
      const block = document.querySelector<HTMLElement>('.hud-regime__detail');
      const badge = block?.querySelector<HTMLElement>('.ui-badge') ?? null;
      const needs = [...(block?.querySelectorAll<HTMLElement>('.hud-regime__detail-need') ?? [])].filter((line) =>
        drawn(line),
      );
      return {
        laidOut: drawn(block),
        prisoner: block?.dataset['prisoner'] ?? null,
        nameText: textOf(block?.querySelector('.hud-regime__detail-name')),
        badgeText: textOf(badge),
        badgeTone: badge?.dataset['tone'] ?? null,
        needs: needs.map((line): RegimeDetailNeedProbe => {
          const bar = line.querySelector<HTMLElement>('.ui-bar');
          return {
            need: line.dataset['need'] ?? null,
            permille: line.dataset['needPermille'] ?? null,
            unmet: line.dataset['needUnmet'] ?? null,
            nameText: textOf(line.querySelector('.hud-regime__detail-need-name')),
            tone: bar?.dataset['tone'] ?? null,
            valueText: bar?.getAttribute('aria-valuetext') ?? null,
          };
        }),
        box: layoutBoxOf(block),
      };
    })(),
  };
}

function heldGuardsProbe(): HeldGuardsProbe {
  const block = document.querySelector<HTMLElement>('.hud-staff__held');
  const rows = [...document.querySelectorAll<HTMLElement>('.hud-staff__held-row')].filter(
    (row) => row.getClientRects().length > 0,
  );
  const visibleText = (selector: string): string =>
    [...(block?.querySelectorAll<HTMLElement>(selector) ?? [])]
      .filter((line) => line.getClientRects().length > 0)
      .map((line) => (line.textContent ?? '').trim())
      .find((text) => text.length > 0) ?? '';

  return {
    blockLaidOut: block !== null && block.getClientRects().length > 0,
    held: block?.dataset['held'] ?? null,
    summaryText: block?.querySelector<HTMLElement>('.hud-staff__held-summary')?.textContent?.trim() ?? '',
    blockBox: layoutBoxOf(block),
    rows: rows.map((row): HeldGuardRowProbe => {
      const release = row.querySelector<HTMLButtonElement>('.ui-action');
      return {
        guardId: row.dataset['guard'] ?? '',
        labelText: row.querySelector<HTMLElement>('.hud-staff__held-label')?.textContent?.trim() ?? '',
        releaseBox: layoutBoxOf(release),
        releaseHasOffsetParent: release !== null && release.offsetParent !== null,
        releaseDisabled: release?.disabled ?? true,
      };
    }),
    moreText: visibleText('.hud-staff__held-more'),
    emptyText:
      [...(block?.querySelectorAll<HTMLElement>('.hud-staff__note') ?? [])]
        .filter((line) => line.getClientRects().length > 0 && !line.classList.contains('hud-staff__held-more'))
        .map((line) => (line.textContent ?? '').trim())
        .find((text) => text.length > 0) ?? '',
  };
}

function pendingDeliveriesProbe(): PendingDeliveriesProbe {
  const block = document.querySelector<HTMLElement>('.hud-build__deliveries');
  const rows = [...document.querySelectorAll<HTMLElement>('.hud-build__delivery-row')].filter(
    (row) => row.getClientRects().length > 0,
  );
  return {
    blockLaidOut: block !== null && block.getClientRects().length > 0,
    pending: block?.dataset['pending'] ?? null,
    countText: block?.querySelector<HTMLElement>('.hud-build__deliveries-count')?.textContent?.trim() ?? '',
    blockBox: layoutBoxOf(block),
    rows: rows.map((row): PendingDeliveryRowProbe => {
      const cancel = row.querySelector<HTMLButtonElement>('.ui-action');
      return {
        orderId: row.dataset['delivery'] ?? '',
        labelText: row.querySelector<HTMLElement>('.hud-build__delivery-label')?.textContent?.trim() ?? '',
        cancelAccessibleName: cancel?.getAttribute('aria-label') ?? '',
        cancelBox: layoutBoxOf(cancel),
        cancelHasOffsetParent: cancel !== null && cancel.offsetParent !== null,
        cancelDisabled: cancel?.disabled ?? true,
      };
    }),
    moreText:
      [...(block?.querySelectorAll<HTMLElement>('.hud-build__deliveries-more') ?? [])]
        .filter((line) => line.getClientRects().length > 0)
        .map((line) => (line.textContent ?? '').trim())
        .find((text) => text.length > 0) ?? '',
  };
}

const root = document.getElementById('ui-root');
if (root === null) throw new Error('ui-harness: #ui-root is missing');

let sessions: StubSessions | undefined;
let panel: SavePanel | undefined;
let hud: ReturnType<typeof mountHud> | undefined;
const intents: string[] = [];
let holdClock = false;
let heldClockIntent: (() => void) | undefined;
let intentsFail = false;
/**
 * The sink `mountHud` registers for world build gestures (issue #225).
 *
 * Module-level and cleared on every mount, because it is the HUD's, not the
 * harness's: a stale one would report a gesture into a destroyed shell.
 */
let worldBuildPlace: ((order: HudBuildOrder) => void) | undefined;
/**
 * The sink `mountHud` registers for the world's undo and redo keys (#261).
 *
 * Module-level and cleared on every mount, for the same reason `worldBuildPlace`
 * is: it belongs to the HUD that registered it.
 */
let worldHistoryRequest: ((direction: HudHistoryDirection) => void) | undefined;
/**
 * The two sinks `mountHud` registers for world room gestures (ADR 0022).
 *
 * Module-level and cleared on every mount, for the reason the two above are:
 * they belong to the HUD that registered them.
 *
 * Two rather than one, matching the port: a finished rectangle and the live
 * readout are different reports, and the confirm step is why -- a release does
 * not designate anything, so the finished-gesture sink makes the rectangle
 * *pending* and the intent leaves later, from the control the player presses.
 */
let worldRoomPlace: ((gesture: HudRoomGesture) => void) | undefined;
let worldRoomReadout: ((area: HudRoomArea | undefined) => void) | undefined;

/**
 * What the room tool's stand-in reports for `classifyArea` (issue #493).
 *
 * The running application answers this from a real `WorldRenderView`, which
 * this harness has no scene to build. `'sealed'` by default -- **not** the
 * `'open'` answer a real, worldless `RoomTool` gives, and deliberately so:
 * this harness exists for specs that predate #493 and have no opinion about
 * enclosure at all, and every one of them drags an ordinary rectangle
 * expecting an ordinary designation to go through. `'open'` by default would
 * silently gate every one of those on a fact none of them set up, which is
 * exactly what broke on the first run of this change -- six pre-existing
 * specs failed for a reason none of them tests, because the harness's world
 * was reporting a state no real world with no walls yet is any more entitled
 * to than the state this default now gives it. Only the specs that ask about
 * enclosure call `setWorldRoomEnclosure`, and only they see anything else.
 */
let worldRoomEnclosure: 'sealed' | 'open' = 'sealed';

/** Which room row the panel currently shows as selected, read off the DOM. */
function roomsPanelSelection(): string | undefined {
  const row = document.querySelector<HTMLElement>('.hud-rooms__list [data-selected="true"]');
  return row?.dataset['room'];
}

function findSaveButton(label: string): HTMLButtonElement | undefined {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.save-panel__button')];
  return buttons.find((button) => button.textContent === label);
}

window.lockstateUiHarness = {
  /**
   * Whether every element matching `selector` was actually laid out.
   *
   * `getClientRects()` is empty exactly when the element -- or an ancestor --
   * is `display: none`, which is the same rule `layoutProbe`'s `box()` below
   * states as "a zero-area box is not laid out at all". `offsetParent`, the
   * idiom `refusalProbe` and `buildProbe` use, answers the same question for
   * the two elements they ask it about, but not in general: it is also `null`
   * for a `position: fixed` element that is perfectly visible, and `.hud` is
   * `position: fixed` (`hud.css`). Stating the property directly is what
   * makes this helper safe to point at any selector.
   *
   * Every match rather than the first, because a five-metric row with one
   * metric dropped is a defect and reading only `[0]` would miss it. Empty
   * selector means false: a pairing assertion that stopped matching anything
   * would otherwise pass by matching nothing.
   */
  laidOut(selector: string): boolean {
    const nodes = [...document.querySelectorAll(selector)];
    return nodes.length > 0 && nodes.every((node) => node.getClientRects().length > 0);
  },

  mountSavePanel(options?: { readonly pseudoLocale?: boolean; readonly nowMs?: number }): void {
    panel?.dispose();
    sessions = new StubSessions();
    // The host's localizer is passed in rather than left to the panel's
    // default, which is what `src/main.ts` should also do (issue #208).
    // `en-XA` is ADR 0011's own tool for the question this panel failed: a
    // string that is not in the catalog stays unaccented and unbracketed.
    // A frozen clock where one is asked for, so the confirmation's age
    // sentence is a function of the seeded timestamp and nothing else -- the
    // application's own construction passes no clock and gets `Date.now`.
    const nowMs = options?.nowMs;
    panel =
      nowMs === undefined
        ? new SavePanel(sessions, root, options?.pseudoLocale === true ? pseudoLocalizer : localizer)
        : new SavePanel(sessions, root, options?.pseudoLocale === true ? pseudoLocalizer : localizer, () => nowMs);
  },

  seedPrison(prisonId: string, displayName: string, updatedAt: number): void {
    sessions?.seedPrison(prisonId, displayName, updatedAt);
  },

  /**
   * Calls `SavePanel.confirmDelete` directly, with whatever is armed.
   *
   * The only way to reach the guard from a browser at all: the confirming
   * control exists only while a deletion is armed, so a press can never be the
   * unconfirmed case. `request*` methods are the panel's own test seam and
   * return the gate's decision for exactly this reason -- a refusal is
   * asserted rather than inferred from a prison still being on the list.
   */
  confirmDeleteDirect(prisonId: string): string {
    return panel?.confirmDelete(prisonId) ?? 'no-panel';
  },

  deletedPrisons(): readonly string[] {
    return [...(sessions?.deletedPrisons ?? [])];
  },

  forgottenPrisons(): readonly string[] {
    return [...(sessions?.forgottenPrisons ?? [])];
  },

  setRestoreOutcome(outcome: RestoreOutcome): void {
    sessions?.setRestoreOutcome(outcome);
  },

  /** Rows on the page for deleted prisons -- the DOM, not the stub's bookkeeping. */
  deletedPrisonRowCount(): number {
    return document.querySelectorAll('[data-deleted-prison]').length;
  },

  /** Copies the stub still holds, which is the half the DOM cannot show. */
  heldCopyCount(): number {
    return sessions?.deletedCount() ?? -1;
  },

  /** Clicks a control on one deleted prison's own row, by the row rather than by label. */
  clickDeletedPrisonButton(prisonId: string, label: string): boolean {
    const row = document.querySelector<HTMLElement>(`[data-deleted-prison="${CSS.escape(prisonId)}"]`);
    if (row === null) return false;
    const button = [...row.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
    if (button === undefined) return false;
    button.click();
    return true;
  },

  /** The text of the delete confirmation now on the page, or `''` if there is none. */
  deleteConfirmationText(): string {
    return document.querySelector('[data-delete-confirm] .save-panel__item-label')?.textContent ?? '';
  },

  /**
   * What the keyboard is standing on, as a label rather than an element.
   *
   * `''` for `<body>`, which is where the browser parks focus when the control
   * holding it is removed or disabled -- the exact state constitution article
   * 16 forbids leaving a player in, so it has to be distinguishable from a
   * real control rather than merely absent.
   */
  focusedControlLabel(): string {
    const active = document.activeElement;
    if (active === null || active === document.body) return '';
    return active.textContent ?? '';
  },

  clickSaveButton(label: string): boolean {
    const button = findSaveButton(label);
    if (button === undefined) return false;
    // A real click, so a disabled button genuinely does not fire -- the same
    // path a player's tap takes.
    button.click();
    return true;
  },

  saveButtonState(label: string): ButtonState {
    const button = findSaveButton(label);
    if (button === undefined) return { found: false, disabled: false, ariaBusy: null };
    return { found: true, disabled: button.disabled, ariaBusy: button.getAttribute('aria-busy') };
  },

  savePanelStatus(): string {
    return document.querySelector('.save-panel__status')?.textContent ?? '';
  },

  savePanelText(): readonly string[] {
    const panelRoot = document.querySelector<HTMLElement>('.save-panel');
    if (panelRoot === null) return [];
    const parts = [
      panelRoot.getAttribute('aria-label') ?? '',
      ...[...panelRoot.querySelectorAll<HTMLElement>(
        '.save-panel__heading, .save-panel__button, .save-panel__empty, .save-panel__status, .save-panel__item-label',
      )].map((node) => node.textContent ?? ''),
    ];
    // An empty string here would satisfy a "starts with the marker" check by
    // being vacuous, so blanks are dropped and the caller asserts the count.
    return parts.filter((text) => text.trim().length > 0);
  },

  createCalls(): number {
    return sessions?.createCalls ?? -1;
  },

  prisonRowCount(): number {
    return sessions?.prisonCount() ?? -1;
  },

  releaseCreate(outcome: 'ok' | 'worker-timeout'): void {
    sessions?.releaseCreate(outcome);
  },

  activateSession(prisonId: string): void {
    sessions?.activateSession(prisonId);
  },

  setImportOutcome(outcome: ImportOutcomeName): void {
    sessions?.setImportOutcome(outcome);
  },

  importedRaw(): readonly string[] {
    return [...(sessions?.importedRaw ?? [])];
  },

  loadedPrisons(): readonly string[] {
    return [...(sessions?.loadedPrisons ?? [])];
  },

  async refreshSavePanel(): Promise<void> {
    await panel?.refresh();
  },

  async settleSavePanel(): Promise<void> {
    await panel?.whenSettled();
    // One extra turn so the handler's trailing `refresh()` repaints.
    await new Promise((resolve) => setTimeout(resolve, 0));
  },

  mountHudShell(options?: { readonly empty?: boolean; readonly buildables?: number; readonly candidates?: boolean }): void {
    hud?.destroy();
    intents.length = 0;
    // The previous mount's sink belongs to a destroyed HUD; a gesture sent to
    // it would report intents into a shell that is no longer on the page.
    worldBuildPlace = undefined;
    worldHistoryRequest = undefined;
    worldRoomPlace = undefined;
    worldRoomReadout = undefined;
    worldRoomEnclosure = 'sealed';
    hud = mountHud(root, {
      // Stands in for `BuildTool`, which is the only implementation in the
      // application: the composition root hands the HUD a source, the HUD
      // registers a sink on it at mount, and a finished world drag calls it
      // (issue #225).
      worldBuild: {
        attachOrders: (place) => {
          worldBuildPlace = place;
        },
      },
      // Stands in for the same `BuildTool`, under its other port: the scene
      // reports a key press, the tool reports a direction, and the HUD
      // dispatches its own gated intent (#261).
      editHistory: {
        attachHistory: (request) => {
          worldHistoryRequest = request;
        },
      },
      // Stands in for `RoomTool`, the only implementation in the application,
      // under the port `mountHud` asks for: the scene reports the rectangle a
      // drag covered, the tool reports it here, and the panel holds it pending
      // a confirm (ADR 0022).
      worldRooms: {
        attachGestures: (place) => {
          worldRoomPlace = place;
        },
        attachReadout: (readout) => {
          worldRoomReadout = readout;
        },
        // Issue #493: the HUD asks this synchronously, for both producers of a
        // rectangle, rather than being told. `setWorldRoomEnclosure` is the
        // spec's one lever over the answer.
        classifyArea: () => worldRoomEnclosure,
      },
      localizer: countingLocalizer,
      // `empty` mounts the shipped default instead of a populated prison --
      // the state the real app paints before any session exists.
      viewModel: options?.empty === true ? EMPTY_HUD_VIEW_MODEL : options?.candidates === true ? CANDIDATE_VIEW_MODEL : BASE_VIEW_MODEL,
      build: options?.buildables === undefined ? BUILD_MODEL : buildModelWithCatalogueOf(options.buildables),
      rooms: ROOMS_MODEL,
      // `empty` is about the *view model* -- a prison with nothing in it --
      // and not about content, so the Staff panel is offered its one role in
      // both states, exactly as the Build panel is offered its catalogue.
      staff: STAFF_MODEL,
      onIntent: (intent: HudIntent) => {
        intents.push(JSON.stringify(intent));
        // Stands in for a host that refuses -- which in the real app is
        // `requireSimulation` with no worker, or a `submit` before the
        // simulation has reported its command sequence (issue #207). Thrown
        // rather than rejected, because that is the shape both of those take.
        if (intentsFail) throw new Error('ui-harness: the host refused this intent');
        // Stands in for a slow or wedged host, which is the condition the
        // command gate exists for.
        if (!holdClock || intent.kind !== 'set-clock') return undefined;
        return new Promise<void>((resolve) => {
          heldClockIntent = resolve;
        });
      },
    });
  },

  hudProbe(): HudProbe {
    /*
     * The strip's own readouts, which is what "every number" means here.
     *
     * `:not(.hud-layout__body *)` excludes the Layout menu's drawer (#1159).
     * The drawer hangs from the strip and holds a clock readout of its own --
     * it is there because folding the strip's readouts takes the strip's clock
     * with them -- but it is `hidden` until a player opens it, so
     * `expectLaidOut` below would report it as a number that is not on screen.
     * Its three values are monospace for the same reason every other value is
     * (they carry `ui-value`), and `tests/browser/hud-layout-shell.spec.ts`
     * asserts that where it can also assert the menu is open.
     */
    const values = [...document.querySelectorAll<HTMLElement>('.hud-strip .ui-value:not(.hud-layout__body *)')];
    const nonMonospace = values.filter((node) => {
      const style = window.getComputedStyle(node);
      // The rule is "every number uses a monospace face with tabular
      // figures", and the browser is the only place that can confirm the
      // computed value rather than the declaration.
      const tabular = style.fontVariantNumeric.includes('tabular-nums') || style.fontFeatureSettings.includes('tnum');
      return !style.fontFamily.includes('monospace') || !tabular;
    });

    // The centre of the screen must belong to the world. Hit-testing the
    // middle pixel is the only honest way to prove it.
    const centre = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const hudRoot = document.querySelector('.hud');

    return {
      activeTab: hudRoot?.getAttribute('data-active-tab') ?? null,
      metricIds: [...document.querySelectorAll<HTMLElement>('.ui-stat')].map((node) => node.dataset['metric'] ?? ''),
      metricValues: [...document.querySelectorAll<HTMLElement>('.ui-stat .ui-stat__value')].map(
        (node) => node.textContent ?? '',
      ),
      pressedTransport: [...document.querySelectorAll<HTMLElement>('.hud-strip__transport [aria-pressed="true"]')].map(
        (node) => node.getAttribute('title') ?? '',
      ),
      clockDay: document.querySelector('.hud-clock__day')?.textContent ?? '',
      clockDayProgress: document.querySelector('.hud-clock__day-progress')?.textContent ?? '',
      valueCount: values.length,
      nonMonospaceValues: nonMonospace.map((node) => node.textContent ?? ''),
      /*
       * Scoped by what the section CONTAINS rather than by where it sits, and
       * the change is #1201's (2026-09-16).
       *
       * It read `.hud-minimap .ui-section`, under the comment *"Scoped to the
       * minimap frame: the Build panel uses the same section primitive, so an
       * unscoped selector would depend on document order."* The reason was
       * right and the scope has stopped being available: below 720 px the
       * alerts fold is mounted in the Overview panel's `foldSlot` on the
       * owner's ruling, so at 375x812 that selector matched nothing and this
       * probe answered `null` for a section that is on screen and expanded --
       * which is exactly what `ui-shell.spec.ts`'s #220 case reported.
       *
       * `:has(.hud-alerts__list)` keeps the original reason intact: no other
       * `.ui-section` on this page holds that list, so the Build panel's
       * sections are still excluded, and the answer no longer depends on which
       * of the fold's two homes the viewport puts it in.
       */
      alertsCollapsed:
        document.querySelector('.ui-section:has(.hud-alerts__list)')?.getAttribute('data-collapsed') ?? null,
      centreIsClickThrough: centre === null || !(hudRoot?.contains(centre) ?? false),
    };
  },

  clickTab(tab: string): boolean {
    const button = document.querySelector<HTMLButtonElement>(`.ui-tab[data-tab="${tab}"]`);
    if (button === null) return false;
    button.click();
    return true;
  },

  clickTransport(label: string): boolean {
    const button = document.querySelector<HTMLButtonElement>(`.hud-strip__transport [title="${label}"]`);
    if (button === null) return false;
    button.click();
    return true;
  },

  toggleAlerts(): boolean {
    const header = document.querySelector<HTMLButtonElement>('.hud-minimap .ui-section__header');
    if (header === null) return false;
    header.click();
    return true;
  },

  markAlertRows(): void {
    markedAlertRows = alertRowNodes();
  },

  alertProbe(): AlertProbe {
    const rows = alertRowNodes();
    return {
      order: rows.map((row) => row.dataset['alert'] ?? ''),
      // `textContent` rather than `innerText`: the alerts section starts
      // folded, so a row's rendered text can legitimately be empty while the
      // row is exactly where it belongs. Whether the region is laid out is a
      // separate question, asked separately.
      texts: rows.map((row) => row.textContent ?? ''),
      reused: rows.filter((row) => markedAlertRows.includes(row)).map((row) => row.dataset['alert'] ?? ''),
    };
  },

  hudIntents(): readonly string[] {
    return [...intents];
  },

  setHudViewModel(viewModel: HudViewModel): void {
    hud?.update(viewModel);
  },

  holdClockIntents(enabled: boolean): void {
    holdClock = enabled;
  },

  releaseClockIntent(): void {
    const resolve = heldClockIntent;
    heldClockIntent = undefined;
    resolve?.();
  },

  failIntents(enabled: boolean): void {
    intentsFail = enabled;
  },

  refusalProbe(): RefusalProbe {
    const line = document.querySelector<HTMLElement>('.hud__refusal');
    const marked = [...document.querySelectorAll<HTMLElement>('.hud [data-action-failed="true"]')];
    return {
      // `offsetParent` is null for an element that is `hidden` or inside one,
      // which is the state the line starts in. A `hidden` element is still
      // found by `querySelector`, so presence alone would prove nothing.
      visible: line !== null && line.offsetParent !== null,
      text: line?.textContent ?? '',
      action: line?.dataset['action'] ?? null,
      source: line?.dataset['source'] ?? null,
      // The box, alongside `offsetParent` rather than instead of it. #220's
      // whole finding is that a message can satisfy a text assertion from
      // inside a 0x0 subtree, so the geometry is read and asserted.
      width: line?.getBoundingClientRect().width ?? 0,
      height: line?.getBoundingClientRect().height ?? 0,
      failedControls: marked.map((control) => control.getAttribute('title') ?? control.textContent ?? ''),
      // Token containment, not string equality. `aria-describedby` is a list
      // of ids, and a control may carry its own description beside the
      // refusal -- the Rooms panel's Confirm button carries the note that
      // says why it is disabled. This read used to be `=== line.id`, which
      // asserted "the refusal is the *only* thing describing this control",
      // a stronger claim than the property being tested and one that goes
      // false the moment any panel describes a control of its own.
      describedByRefusal:
        line !== null &&
        marked.length > 0 &&
        marked.every((control) =>
          (control.getAttribute('aria-describedby') ?? '').split(/\s+/u).includes(line.id),
        ),
      role: line?.getAttribute('role') ?? null,
      ariaLive: line?.getAttribute('aria-live') ?? null,
    };
  },

  alertRowProbe(): AlertRowProbe {
    // The empty-state row is excluded: it is the list saying it has nothing,
    // and counting it as a row would make "the refusal is not on screen"
    // unprovable.
    const row = document.querySelector<HTMLElement>('.hud-alerts__list [data-alert]:not([data-alert="empty"])');
    const rect = row?.getBoundingClientRect();
    return {
      present: row !== null,
      visible: row !== null && row.offsetParent !== null,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      text: row?.textContent ?? '',
    };
  },

  hudText(): string {
    return document.querySelector<HTMLElement>('.hud')?.innerText ?? '';
  },

  layoutProbe(): LayoutProbe {
    const box = (selector: string): LayoutBox | null => layoutBoxOf(document.querySelector(selector));

    const minimap = box('.hud-minimap');
    const tabs = box('.hud-tabs__inner');
    const metrics = document.querySelector('.hud-strip__metrics');

    return {
      viewport: [window.innerWidth, window.innerHeight],
      strip: box('.hud-strip'),
      tabs,
      minimap,
      minimapOverlapsTabs:
        minimap !== null &&
        tabs !== null &&
        minimap.right > tabs.x &&
        tabs.right > minimap.x &&
        minimap.bottom > tabs.y &&
        tabs.bottom > minimap.y,
      metricsScrollWidth: metrics?.scrollWidth ?? 0,
      metricsClientWidth: metrics?.clientWidth ?? 0,
    };
  },

  transportDisabled(): boolean {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.hud-strip__transport button')];
    return buttons.length > 0 && buttons.every((button) => button.disabled);
  },

  buildProbe(): BuildProbe {
    const panel = document.querySelector<HTMLElement>('.hud-build');
    const rows = [...document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')];
    const inputs = [...document.querySelectorAll<HTMLInputElement>('.hud-build__coords .ui-number__input')];
    const edgeChooser = document.querySelector<HTMLElement>('.hud-build .ui-choice');
    const arm = document.querySelector<HTMLButtonElement>('.hud-build__arm');
    const remove = document.querySelector<HTMLButtonElement>('.hud-build__remove');
    const actions = document.querySelector<HTMLElement>('.hud-build__actions');
    const body = document.querySelector<HTMLElement>('.hud-build > .ui-panel__body');
    const hint = document.querySelector<HTMLElement>('.hud-build__map > .hud-build__note');
    const submit = document.querySelector<HTMLButtonElement>('.hud-build__coordinates .ui-action');
    const buyToggle = document.querySelector<HTMLButtonElement>('.hud-build__buy-toggle');
    const buyRow = document.querySelector<HTMLElement>('.hud-build__buy');
    const buySubmit = document.querySelector<HTMLButtonElement>('.hud-build__buy-submit');
    const buyQuantity = document.querySelector<HTMLInputElement>('.hud-build__buy .ui-number__input');
    const buyShortfall = document.querySelector<HTMLElement>('.hud-build__buy-shortfall');
    const target = document.querySelector<HTMLElement>('.hud-build__target');
    const targetValue = document.querySelector<HTMLElement>('.hud-build__target .hud-build__target-value');
    const coordinates = [...document.querySelectorAll<HTMLElement>('.hud-build .ui-section')].find((section) =>
      section.querySelector('.hud-build__coords'),
    );

    return {
      // `hidden` is inherited through the DOM, so `offsetParent` is what the
      // browser actually decided -- not what the attribute claims.
      visible: panel !== null && panel.offsetParent !== null,
      options: rows.map((row) => row.dataset['buildable'] ?? ''),
      selected: rows.find((row) => row.dataset['selected'] === 'true')?.dataset['buildable'] ?? null,
      tileX: inputs[0]?.value ?? '',
      tileY: inputs[1]?.value ?? '',
      edge:
        document.querySelector<HTMLElement>('.hud-build .ui-choice__option[data-active="true"]')?.dataset['choice'] ??
        null,
      // The id and the *text* together, per option (#341). `textContent` and
      // not `data-choice`: the whole point is that an implementation labelling
      // every edge "North" reports the right id here and the wrong label, and
      // the id is what every existing assertion in this file reads.
      //
      // Scoped to `.hud-build` rather than to the document, for the reason
      // `hudProbe` scopes its section read: `createChoiceGroup` is a shared
      // primitive, and a second panel adopting it would silently fold its
      // options into this list in document order.
      edgeLabels: [...document.querySelectorAll<HTMLElement>('.hud-build .ui-choice__option')].map((option) => {
        const box = option.getBoundingClientRect();
        return {
          id: option.dataset['choice'] ?? '',
          label: (option.textContent ?? '').trim(),
          // `offsetParent`, not `hidden`: the attribute is inherited through
          // the DOM, and this control sits inside a collapsible body that
          // carries it while folded.
          laidOut: option.offsetParent !== null,
          widthPx: Math.round(box.width * 10) / 10,
          heightPx: Math.round(box.height * 10) / 10,
        };
      }),
      edgeChooserVisible: edgeChooser !== null && edgeChooser.offsetParent !== null,
      submitDisabled: submit?.disabled ?? true,
      armLabel: arm?.textContent?.trim() ?? '',
      armed: arm?.getAttribute('aria-pressed') === 'true',
      // The map route has to be the panel's one primary-tone control; the
      // numeric route must not compete with it for the eye.
      armIsPrimary:
        arm?.dataset['tone'] === 'primary' &&
        [...document.querySelectorAll<HTMLElement>('.hud-build .ui-action')].filter(
          (button) => button.dataset['tone'] === 'primary',
        ).length === 1,
      removeLabel: remove?.textContent?.trim() ?? '',
      // A box the browser actually gave it, not an attribute: the row this sits
      // in is the one ADR 0022 measured a third button overflowing.
      removeLaidOut: remove !== null && remove.getClientRects().length > 0,
      removing: remove?.getAttribute('aria-pressed') === 'true',
      // How far past the panel body's content edge the actions row's last
      // laid-out button reaches. Read off the *buttons* rather than off the
      // row's `scrollWidth`, because a flex row that overflows still reports its
      // own width as the container's -- which is exactly how a third button can
      // overflow without the row saying so.
      actionsOverflowPx: ((): number => {
        if (actions === null || body === null) return 0;
        const limit = body.getBoundingClientRect().right;
        const buttons = [...actions.querySelectorAll<HTMLElement>('.ui-action')].filter(
          (button) => button.getClientRects().length > 0,
        );
        const rightmost = buttons.reduce((widest, button) => Math.max(widest, button.getBoundingClientRect().right), 0);
        return buttons.length === 0 ? 0 : Math.round((rightmost - limit) * 10) / 10;
      })(),
      /*
       * Label against button, which is the measurement `actionsOverflowPx`
       * above cannot take (issue #926, and `ActionLabelFitProbe` carries the
       * argument).
       *
       * Rounded to a tenth like every other figure in this probe, and read in
       * one pass so the button, its label and its neighbour are all measured
       * against the same layout -- a second `evaluate` could observe a
       * different one.
       */
      actionLabelFits: ((): readonly ActionLabelFitProbe[] => {
        if (actions === null) return [];
        const laidOut = [...actions.querySelectorAll<HTMLElement>('.ui-action')].filter(
          (button) => button.getClientRects().length > 0,
        );
        // The class that names the control, rather than its index: an index
        // renumbers itself the moment the buy toggle leaves the row, and this
        // probe is read in both states.
        const nameOf = (button: HTMLElement): string =>
          [...button.classList].find((name) => name.startsWith('hud-build__')) ?? '';
        return laidOut.map((button, index) => {
          const buttonBox = button.getBoundingClientRect();
          const labelNode = button.querySelector<HTMLElement>('.ui-action__label');
          const labelBox = labelNode?.getBoundingClientRect() ?? null;
          const neighbour = laidOut[index + 1] ?? null;
          const neighbourLeft = neighbour === null ? null : neighbour.getBoundingClientRect().left;
          const round = (value: number): number => Math.round(value * 10) / 10;
          return {
            control: nameOf(button),
            label: labelNode?.textContent?.trim() ?? '',
            buttonWidthPx: round(buttonBox.width),
            buttonHeightPx: round(buttonBox.height),
            buttonRightPx: round(buttonBox.right),
            labelWidthPx: labelBox === null ? 0 : round(labelBox.width),
            labelHeightPx: labelBox === null ? 0 : round(labelBox.height),
            labelRightPx: labelBox === null ? 0 : round(labelBox.right),
            labelOverflowPx: labelBox === null ? 0 : round(labelBox.right - buttonBox.right),
            neighbourLeftPx: neighbourLeft === null ? null : round(neighbourLeft),
            neighbour: neighbour === null ? null : nameOf(neighbour),
            neighbourOverlapPx:
              labelBox === null || neighbourLeft === null ? 0 : round(labelBox.right - neighbourLeft),
            // `+ 0.5` rather than `>`: both figures are sub-pixel and a
            // fractional layout would otherwise report every label as wider
            // than its own box.
            labelWiderThanBox: labelNode !== null && labelNode.scrollWidth > labelNode.clientWidth + 0.5,
          };
        });
      })(),
      actionsHeightPx: actions === null ? 0 : Math.round(actions.getBoundingClientRect().height * 10) / 10,
      hint: hint?.textContent?.trim() ?? '',
      coordinatesCollapsed: coordinates?.dataset['collapsed'] === 'true',
      targetReadout: target?.dataset['target'] ?? null,
      targetText: targetValue?.textContent?.trim() ?? '',
      // The pairing `targetText` needs to mean anything: a `textContent` read
      // is identical on a readout that was never painted (#220).
      targetLaidOut: targetValue !== null && targetValue.offsetParent !== null,
      targetBox: layoutBoxOf(targetValue),
      // `offsetParent`, not the `hidden` attribute: an author `display` beats
      // the user agent's `display: none`, and this row is laid out by a rule
      // that has to opt out of that (`hud.css`). Reading the attribute would
      // report the row as folded away while it was on screen.
      buyToggleVisible: buyToggle !== null && buyToggle.offsetParent !== null,
      buyOpen: buyToggle?.getAttribute('aria-expanded') === 'true',
      buyRowVisible: buyRow !== null && buyRow.offsetParent !== null,
      buyLabel: buySubmit?.textContent?.trim() ?? '',
      // Two bits, not one, and the pair is the assertion (see
      // `BuildProbe.buyDisabled`). A missing button reads as unavailable
      // *and* disabled: both defaults say "no press is going to happen here",
      // which is what an absent control means, and neither default can make a
      // test about a present one pass by accident.
      buyUnavailable: (buySubmit?.getAttribute('aria-disabled') ?? 'true') === 'true',
      buyDisabled: buySubmit?.disabled ?? true,
      buyQuantity: buyQuantity?.value ?? '',
      // The sentence that says what stops a press (the owner's wording of
      // 2026-09-03). Three answers rather than one, on `BuildQueueProbe`'s
      // terms: the text, a box the browser actually gave it, and the
      // `aria-describedby` link -- a `textContent` read alone is identical on a
      // line that was painted and one that has no box, which is the defect
      // `.hud-build__buy-shortfall[hidden]` in `hud.css` exists to prevent.
      buyShortfallText: buyShortfall?.textContent?.trim() ?? '',
      buyShortfallLaidOut: buyShortfall !== null && buyShortfall.getClientRects().length > 0,
      buyDescribedBy: buySubmit?.getAttribute('aria-describedby') ?? '',
      texts: [...(panel?.querySelectorAll<HTMLElement>('button, label, span, h2') ?? [])]
        .map((node) => (node.textContent ?? '').trim())
        .filter((text) => text.length > 0),
      queue: buildQueueProbe(),
      deliveries: pendingDeliveriesProbe(),
    };
  },

  staffProbe(): StaffProbe {
    const panel = document.querySelector<HTMLElement>('.hud-staff');
    const rows = [...document.querySelectorAll<HTMLElement>('.hud-staff__list [data-staff-role]')];
    const hire = document.querySelector<HTMLButtonElement>('.hud-staff__hire');
    const hireShortfall = document.querySelector<HTMLElement>('.hud-staff__hire-shortfall');

    return {
      // `hidden` is inherited through the DOM, so `offsetParent` is what the
      // browser actually decided -- not what the attribute claims.
      visible: panel !== null && panel.offsetParent !== null,
      options: rows.map((row) => row.dataset['staffRole'] ?? ''),
      selected: rows.find((row) => row.dataset['selected'] === 'true')?.dataset['staffRole'] ?? null,
      hireLabel: hire?.textContent?.trim() ?? '',
      // Two bits, not one, and the pair is the assertion (see
      // `StaffProbe.hireDisabled`). A missing button reads as unavailable
      // *and* disabled, on `buildProbe`'s terms: both defaults say "no press
      // is going to happen here", which is what an absent control means, and
      // neither default can make a test about a present one pass by accident.
      hireUnavailable: (hire?.getAttribute('aria-disabled') ?? 'true') === 'true',
      hireDisabled: hire?.disabled ?? true,
      // The same three answers `buildProbe` gives for the Buy button's line,
      // for the same reason and about the same authored sentence.
      hireShortfallText: hireShortfall?.textContent?.trim() ?? '',
      hireShortfallLaidOut: hireShortfall !== null && hireShortfall.getClientRects().length > 0,
      hireDescribedBy: hire?.getAttribute('aria-describedby') ?? '',
      texts: [...(panel?.querySelectorAll<HTMLElement>('button, label, span, h2') ?? [])]
        .map((node) => (node.textContent ?? '').trim())
        .filter((text) => text.length > 0),
      held: heldGuardsProbe(),
      coverage: staffCoverageProbe(),
      // The fold, in the shape `buildLayoutProbe` reports the Build panel's: the
      // bottom of the *client* box, which is where content starts being clipped
      // and is unaffected by scrolling.
      panelVisibleBottom:
        panel === null ? 0 : panel.getBoundingClientRect().top + panel.clientTop + panel.clientHeight,
      panelOverflow: panel === null ? 0 : panel.scrollHeight - panel.clientHeight,
      panelBox: layoutBoxOf(panel),
    };
  },

  reportHeldGuards(held: HudHeldGuardsViewModel | undefined): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(held === undefined ? {} : { heldGuards: held }),
    });
  },

  reportStaffCoverage(coverage: HudStaffCoverageViewModel | undefined): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(coverage === undefined ? {} : { staffCoverage: coverage }),
    });
  },

  pressGuardRelease(guardId: number): boolean {
    const row = document.querySelector<HTMLElement>(`.hud-staff__held-row[data-guard="${String(guardId)}"]`);
    const release = row?.querySelector<HTMLButtonElement>('.ui-action');
    if (release === undefined || release === null) return false;
    // `offsetParent`, not the attribute: a press on a control the player cannot
    // see must not count as reaching it.
    if (release.offsetParent === null) return false;
    release.click();
    return true;
  },

  regimeProbe(): RegimeProbe {
    return regimeProbe();
  },

  /**
   * Publishes the timetable and the roster, which in the real app arrive over
   * `simulation/request-projection` on the counts cadence.
   *
   * Both in one call: they are the two blocks of one panel, their heights
   * interact, and a spec that could only set one at a time could never measure
   * the panel a player is actually given -- the reason `reportPendingDeliveries`
   * takes the queue beside the deliveries.
   *
   * Spread rather than passed as `undefined`, so "nothing has been asked" is an
   * absent property: `exactOptionalPropertyTypes` is on, and the panel branches
   * on the field being there at all.
   */
  reportRegime(
    regime: HudRegimeViewModel | undefined,
    roster?: HudPrisonerRosterViewModel,
    detail?: HudPrisonerDetailViewModel,
  ): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(regime === undefined ? {} : { regime }),
      ...(roster === undefined ? {} : { prisonerRoster: roster }),
      // The third block of the same panel (issue #895), on the same terms as
      // the two above and in the same call for the same reason: its height is
      // the panel's, so a spec measuring the selected state has to be able to
      // publish all three at once.
      ...(detail === undefined ? {} : { prisonerDetail: detail }),
    });
  },

  clearPrisonerSelection(): void {
    hud?.clearPrisonerSelection();
  },

  clickHireStaff(): boolean {
    const hire = document.querySelector<HTMLButtonElement>('.hud-staff__hire');
    if (hire === null) return false;
    hire.click();
    return true;
  },

  clickArmBuild(): boolean {
    const arm = document.querySelector<HTMLButtonElement>('.hud-build__arm');
    if (arm === null) return false;
    arm.click();
    return true;
  },

  clickRemoveObject(): boolean {
    const remove = document.querySelector<HTMLButtonElement>('.hud-build__remove');
    if (remove === null) return false;
    // A real click, so a disabled button genuinely does not fire -- the same
    // path a player's tap takes.
    remove.click();
    return true;
  },

  clickBuyToggle(): boolean {
    const toggle = document.querySelector<HTMLButtonElement>('.hud-build__buy-toggle');
    if (toggle === null) return false;
    toggle.click();
    return true;
  },

  stepBuyQuantity(direction: 'up' | 'down'): boolean {
    const steps = document.querySelectorAll<HTMLButtonElement>('.hud-build__buy .ui-number__step');
    const button = direction === 'down' ? steps[0] : steps[1];
    if (button === undefined) return false;
    button.click();
    return true;
  },

  typeBuyQuantity(value: string): boolean {
    const input = document.querySelector<HTMLInputElement>('.hud-build__buy .ui-number__input');
    if (input === null) return false;
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },

  clickBuy(): boolean {
    const buy = document.querySelector<HTMLButtonElement>('.hud-build__buy-submit');
    if (buy === null) return false;
    buy.click();
    return true;
  },

  expandBuildCoordinates(): boolean {
    const header = [...document.querySelectorAll<HTMLElement>('.hud-build .ui-section')]
      .find((section) => section.querySelector('.hud-build__coords'))
      ?.querySelector<HTMLButtonElement>('.ui-section__header');
    if (header === undefined || header === null) return false;
    header.click();
    return true;
  },

  clickAdmitPrisoner(): boolean {
    // Candidate offers replaced the unlimited direct admission control (#594).
    const button = document.querySelector<HTMLButtonElement>('.hud-intake [data-candidate-accept]');
    if (button === null) return false;
    button.click();
    return true;
  },

  overviewProbe(): OverviewProbe {
    const panel = document.querySelector<HTMLElement>('.hud-overview');
    const figures = panel?.querySelector<HTMLElement>('.hud-overview__figures') ?? null;
    const none = panel?.querySelector<HTMLElement>('.hud-overview__none') ?? null;
    const rows = [...(figures?.querySelectorAll<HTMLElement>('.hud-overview__row') ?? [])];
    const values: Record<string, string> = {};
    for (const row of rows) {
      const id = row.dataset['figure'] ?? '';
      values[id] = row.querySelector<HTMLElement>('.hud-overview__value')?.dataset['value'] ?? '';
    }
    return {
      // `offsetParent` for the same reason `intakeProbe` below uses it: a
      // control inside a `hidden` panel is reachable by a keyboard and
      // invisible to a player, so "present" is not the claim worth making.
      laidOut: panel !== null && panel.offsetParent !== null,
      figures: values,
      rowTexts: rows.map((row) => (row.textContent ?? '').trim()),
      figuresLaidOut: figures !== null && figures.offsetParent !== null,
      noneLaidOut: none !== null && none.offsetParent !== null,
      noneText: none !== null && none.offsetParent !== null ? (none.textContent ?? '').trim() : '',
    };
  },

  intakeProbe(): IntakeProbe {
    const panel = document.querySelector<HTMLElement>('.hud-intake');
    const body = panel?.querySelector<HTMLElement>('.ui-panel__body') ?? null;
    const admit = document.querySelector<HTMLButtonElement>('.hud-intake [data-candidate-accept]');
    const noPlace = panel?.querySelector<HTMLElement>('.hud-intake__no-place') ?? null;
    const pipeline = panel?.querySelector<HTMLElement>('.hud-intake__pipeline') ?? null;
    return {
      // `offsetParent` is null for an element that is `hidden` or inside one,
      // which is what `setVisible(false)` leaves the panel in. Presence alone
      // would prove nothing: a `hidden` panel is still found by
      // `querySelector`, and a control a keyboard could reach inside one is
      // the defect `paintState` calls out.
      laidOut: panel !== null && panel.offsetParent !== null,
      admitLaidOut: admit !== null && admit.offsetParent !== null,
      admitLabel: admit?.textContent ?? '',
      admitDisabled: admit?.disabled ?? null,
      hint: document.querySelector<HTMLElement>('.hud-intake__note')?.textContent ?? '',
      // The box, never the attribute -- see `IntakeProbe.noPlaceBox`.
      noPlaceBox: layoutBoxOf(noPlace),
      noPlaceText: noPlace === null ? '' : (noPlace.textContent ?? ''),
      noPlaceCount: noPlace?.dataset['withoutPlace'] ?? null,
      // Computed, so a declaration that never reached the element cannot pass:
      // the tone is what separates this line from the untoned readout below it.
      noPlaceColor: noPlace === null ? '' : window.getComputedStyle(noPlace).color,
      pipelineBox: layoutBoxOf(pipeline),
      pipelineWaiting: pipeline?.dataset['waiting'] ?? null,
      pipelineFailed: pipeline?.dataset['failed'] ?? null,
      pipelineStages: [...(pipeline?.querySelectorAll<HTMLElement>('.hud-intake__pipeline-stage') ?? [])].map(
        (line) => ({ stage: line.dataset['stage'] ?? '', text: line.textContent ?? '' }),
      ),
      panelBox: layoutBoxOf(panel),
      panelOverflow: panel === null ? 0 : panel.scrollHeight - panel.clientHeight,
      bodyOverflow: body === null ? 0 : body.scrollHeight - body.clientHeight,
      // `innerText`, so the answer is what was rendered: a folded line is left
      // out of it rather than contributing its text.
      text: panel === null ? '' : panel.innerText,
    };
  },

  /**
   * Publishes where the prison's arrivals are, which in the real app arrives
   * over `simulation/request-projection` (`hud/prisoner-population`) while the
   * Overview tab is the one showing.
   *
   * Spread rather than passed as `undefined`, so "nothing has asked" is an
   * absent property: `exactOptionalPropertyTypes` is on and the panel branches
   * on the field being there at all.
   */
  reportIntakePipeline(pipeline: HudIntakePipelineViewModel | undefined): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(pipeline === undefined ? {} : { intakePipeline: pipeline }),
    });
  },

  clickBuildable(definitionId: string): boolean {
    const row = document.querySelector<HTMLButtonElement>(`.hud-build__list [data-buildable="${definitionId}"]`);
    if (row === null) return false;
    row.click();
    return true;
  },

  stepBuildCoordinate(axis: 'x' | 'y', direction: 'up' | 'down'): boolean {
    const field = document.querySelectorAll<HTMLElement>('.hud-build__coords .ui-number')[axis === 'x' ? 0 : 1];
    if (field === undefined) return false;
    const steps = field.querySelectorAll<HTMLButtonElement>('.ui-number__step');
    const button = direction === 'down' ? steps[0] : steps[1];
    if (button === undefined) return false;
    button.click();
    return true;
  },

  aimBuildTarget(target: {
    readonly x: number;
    readonly y: number;
    readonly edge: string;
    readonly segments: number;
  } | null): boolean {
    if (hud === undefined) return false;
    // `HudHandle.setBuildTarget` is exactly what `main.ts` wires
    // `BuildTool.attachReadout` into, so this is the production path minus the
    // Phaser pointer that produces the coordinates. `mountHud` offers no
    // readout port for build aims the way it does for room gestures, so there
    // is no sink to register instead.
    hud.setBuildTarget(
      target === null
        ? undefined
        : { x: target.x, y: target.y, edge: target.edge as HudBuildEdge, segments: target.segments },
    );
    return true;
  },

  clickBuildEdge(edge: string): boolean {
    const option = document.querySelector<HTMLButtonElement>(`.hud-build .ui-choice__option[data-choice="${edge}"]`);
    if (option === null) return false;
    option.click();
    return true;
  },

  dragWorldBuild(definitionId: string, edges: readonly { x: number; y: number; edge: string }[]): boolean {
    if (worldBuildPlace === undefined) return false;
    worldBuildPlace({
      definitionId,
      edges: edges.map((edge) => ({ x: edge.x, y: edge.y, edge: edge.edge as HudBuildEdge })),
    });
    return true;
  },

  /**
   * A finished room gesture, in the shape the scene reports one.
   *
   * The rectangle becomes *pending*: nothing is dispatched, which is the whole
   * of the confirm step and the reason this returns without an intent. The spec
   * then reads the panel and presses the confirm control.
   */
  dragWorldRoom(area: { x: number; y: number; width: number; height: number }, removing = false): boolean {
    if (worldRoomPlace === undefined) return false;
    worldRoomPlace(
      removing
        ? { kind: 'remove', area }
        : { kind: 'designate', roomId: roomsPanelSelection() ?? 'room.cell', area },
    );
    return true;
  },

  /** The live readout, as the pointer moves. `undefined` clears it. */
  hoverWorldRoom(area: { x: number; y: number; width: number; height: number } | undefined): boolean {
    if (worldRoomReadout === undefined) return false;
    worldRoomReadout(area);
    return true;
  },

  setWorldRoomEnclosure(enclosure: 'sealed' | 'open'): void {
    worldRoomEnclosure = enclosure;
  },

  clickRoomType(roomId: string): boolean {
    const row = document.querySelector<HTMLButtonElement>(`.hud-rooms__list [data-room="${roomId}"]`);
    if (row === null) return false;
    row.click();
    return true;
  },

  clickRoomsControl(
    control: 'arm' | 'remove' | 'confirm' | 'cancel' | 'fold' | 'coordinates' | 'coordinates-submit',
  ): boolean {
    // `fold` is the panel's own header control rather than one of the four in
    // the actions row, and it is reached by class because that is what it is:
    // `.ui-panel__toggle` is not unique on a mounted HUD, so it is scoped to
    // this panel the same way every other selector here is. `coordinates` is
    // the same kind of exception one level down: the typed route's disclosure
    // header is a `.ui-section__header`, of which the panel has two.
    const button =
      control === 'fold'
        ? document.querySelector<HTMLButtonElement>('.hud-rooms > .ui-panel__header > .ui-panel__toggle')
        : control === 'coordinates'
          ? document.querySelector<HTMLButtonElement>('.hud-rooms__coordinates > .ui-section__header')
          : document.querySelector<HTMLButtonElement>(`.hud-rooms__${control}`);
    if (button === null) return false;
    // A real click, so a disabled or `hidden` control genuinely does not fire.
    button.click();
    return true;
  },

  typeRoomCoordinates(values: { x?: number; y?: number; width?: number; height?: number }): boolean {
    const fields: readonly (readonly ['x' | 'y' | 'width' | 'height', string])[] = [
      ['x', '.hud-rooms__coord-x input'],
      ['y', '.hud-rooms__coord-y input'],
      ['width', '.hud-rooms__coord-width input'],
      ['height', '.hud-rooms__coord-height input'],
    ];
    for (const [name, selector] of fields) {
      const value = values[name];
      if (value === undefined) continue;
      const input = document.querySelector<HTMLInputElement>(selector);
      if (input === null) return false;
      input.value = String(value);
      // What a browser does when a typed field loses focus. Bubbling, because
      // that is how the real one travels.
      //
      // It used to be the *only* event `NumberField` listened to; since #548 it
      // also reports on `input`, which is what makes a control pressed without
      // an intervening blur act on the number on screen. This helper still
      // drives `change` alone, deliberately: it exists to put a settled value
      // into a field, and the keystroke-by-keystroke half is asserted with real
      // key presses in `tests/browser/ui-shell.spec.ts` instead.
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  },

  /** Publishes a zoning notice, which in the real app arrives on `simulation/status-counts`. */
  reportEditHistory(pair: { readonly undo: boolean; readonly redo: boolean } | undefined): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(pair === undefined ? {} : { editHistory: pair }),
    });
  },

  reportZoning(notice: HudZoningNoticeViewModel | undefined): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(notice === undefined ? {} : { zoning: notice }),
    });
  },

  /**
   * Publishes what the designated rooms are still missing, which in the real
   * app arrives over `simulation/request-projection`.
   *
   * Spread rather than passed as `undefined`, so "nothing has been asked" is an
   * absent property: `exactOptionalPropertyTypes` is on, and the panel branches
   * on the field being there at all.
   */
  reportRoomNeeds(needs: HudRoomNeedsViewModel | undefined): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(needs === undefined ? {} : { roomNeeds: needs }),
    });
  },

  /**
   * Publishes the build queue, which in the real app arrives over
   * `simulation/request-projection` on the counts cadence.
   *
   * Spread rather than passed as `undefined`, so "nothing has been asked" is an
   * absent property: `exactOptionalPropertyTypes` is on, and the panel branches
   * on the field being there at all.
   */
  reportBuildQueue(queue: HudBuildQueueViewModel | undefined): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(queue === undefined ? {} : { buildQueue: queue }),
    });
  },

  /**
   * Publishes what has been bought and has not arrived (#285), optionally beside
   * a queue, because the two surfaces share a panel and their heights interact.
   *
   * Spread rather than passed as `undefined`, so "nothing has been asked" is an
   * absent property: `exactOptionalPropertyTypes` is on, and the panel branches
   * on the field being there at all.
   */
  reportPendingDeliveries(
    deliveries: HudPendingDeliveriesViewModel | undefined,
    queue?: HudBuildQueueViewModel,
  ): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(deliveries === undefined ? {} : { pendingDeliveries: deliveries }),
      ...(queue === undefined ? {} : { buildQueue: queue }),
    });
  },

  pressPendingDeliveryCancel(orderId: string): boolean {
    const row = document.querySelector<HTMLElement>(`.hud-build__delivery-row[data-delivery="${orderId}"]`);
    const cancel = row?.querySelector<HTMLButtonElement>('.ui-action');
    if (cancel === undefined || cancel === null) return false;
    // `offsetParent`, not the attribute: a press on a control the player cannot
    // see must not count as reaching it.
    //
    // The reason used to be that "the row sits inside the buy disclosure, which
    // carries `hidden` while closed". It does not any more -- issue #703 ruling
    // 2, 2026-08-31, moved the block out of that fold -- and the check is
    // *more* useful now rather than redundant: with the block laid out on the
    // panel itself, what hides a row is `paintDeliveries` hiding the pooled row
    // it is not using, and a press on one of those would name a delivery that
    // has already landed.
    if (cancel.offsetParent === null) return false;
    cancel.click();
    return true;
  },

  toggleBuildQueue(): boolean {
    const header = document.querySelector<HTMLButtonElement>('.hud-build__queue .ui-section__header');
    if (header === null || header.getClientRects().length === 0) return false;
    // A real click, so a control inside a `hidden` section genuinely does not fire.
    header.click();
    return true;
  },

  pressBuildQueueCancel(orderId: string): boolean {
    const row = document.querySelector<HTMLElement>(`.hud-build__queue-row[data-order="${orderId}"]`);
    const cancel = row?.querySelector<HTMLButtonElement>('.ui-action');
    if (cancel === undefined || cancel === null) return false;
    // `offsetParent`, not the attribute: the row sits inside a collapsible body
    // that carries `hidden` while folded, and a press on a control the player
    // cannot see must not count as reaching it.
    if (cancel.offsetParent === null) return false;
    cancel.click();
    return true;
  },

  roomsProbe(): RoomsProbe {
    const panel = document.querySelector<HTMLElement>('.hud-rooms');
    const note = document.querySelector<HTMLElement>('.hud-rooms__note');
    const laidOut = (selector: string): boolean => {
      const node = document.querySelector<HTMLElement>(selector);
      return node !== null && node.getClientRects().length > 0;
    };
    return {
      panelLaidOut: panel !== null && panel.getClientRects().length > 0,
      rows: [...document.querySelectorAll<HTMLElement>('.hud-rooms__list [data-room]')].map(
        (row) => row.dataset['room'] ?? '',
      ),
      selected: roomsPanelSelection() ?? '',
      area: document.querySelector<HTMLElement>('.hud-rooms__area')?.dataset['area'] ?? '',
      areaText: document.querySelector<HTMLElement>('.hud-rooms__area-value')?.textContent?.trim() ?? '',
      areaLaidOut: laidOut('.hud-rooms__area'),
      noteText: note?.textContent?.trim() ?? '',
      noteTone: note?.dataset['tone'] ?? '',
      ruleText: [...document.querySelectorAll<HTMLElement>('.hud-rooms__rule')].map(
        (line) => line.textContent?.trim() ?? '',
      ),
      enclosureText:
        document.querySelector<HTMLElement>('.hud-rooms__enclosure-value')?.textContent?.trim() ?? '',
      enclosureLaidOut: laidOut('.hud-rooms__enclosure'),
      panelNeeds: panel?.dataset['needs'] ?? '',
      panelFull: panel?.dataset['full'] ?? '',
      // Laid out, not merely present: `paintActions` uses `hidden`, so a control
      // that is not showing must have no box at all and be out of the tab order.
      armLaidOut: laidOut('.hud-rooms__arm'),
      removeLaidOut: laidOut('.hud-rooms__remove'),
      confirmLaidOut: laidOut('.hud-rooms__confirm'),
      cancelLaidOut: laidOut('.hud-rooms__cancel'),
      confirmText: document.querySelector<HTMLElement>('.hud-rooms__confirm')?.textContent?.trim() ?? '',
      confirmDisabled: document.querySelector<HTMLButtonElement>('.hud-rooms__confirm')?.disabled ?? false,
      // Resolved rather than compared: the note's id is generated
      // (`nextUiId`), so a test may not name it, and what is being asserted is
      // that the id Confirm points at *is the note* -- and that it still is
      // once a refusal has joined the list.
      confirmDescribedBy: (() => {
        const confirm = document.querySelector<HTMLElement>('.hud-rooms__confirm');
        if (confirm === null) return [];
        return (confirm.getAttribute('aria-describedby') ?? '')
          .split(/\s+/u)
          .filter((token) => token !== '')
          .map((id) => {
            const target = document.getElementById(id);
            if (target === null) return 'dangling';
            if (target.classList.contains('hud-rooms__note')) return 'note';
            if (target.classList.contains('hud__refusal')) return 'refusal';
            return 'other';
          });
      })(),
      coordinates: [
        '.hud-rooms__coord-x input',
        '.hud-rooms__coord-y input',
        '.hud-rooms__coord-width input',
        '.hud-rooms__coord-height input',
      ].map((selector) => document.querySelector<HTMLInputElement>(selector)?.value ?? ''),
      coordinatesFolded:
        document.querySelector<HTMLElement>('.hud-rooms__coordinates')?.dataset['collapsed'] ?? '',
      armPressed: document.querySelector<HTMLElement>('.hud-rooms__arm')?.getAttribute('aria-pressed') ?? '',
      armText: document.querySelector<HTMLElement>('.hud-rooms__arm')?.textContent?.trim() ?? '',
      removePressed:
        document.querySelector<HTMLElement>('.hud-rooms__remove')?.getAttribute('aria-pressed') ?? '',
      folded: panel?.dataset['collapsed'] ?? '',
      bodyLaidOut: (() => {
        const body = document.querySelector<HTMLElement>('.hud-rooms > .ui-panel__body');
        return body !== null && body.getClientRects().length > 0;
      })(),
      needsLaidOut: laidOut('.hud-rooms__needs'),
      needsLabelText:
        document.querySelector<HTMLElement>('.hud-rooms__needs-label')?.textContent?.trim() ?? '',
      needsFull: document.querySelector<HTMLElement>('.hud-rooms__needs')?.dataset['full'] ?? '',
      needsUnfinished: document.querySelector<HTMLElement>('.hud-rooms__needs')?.dataset['unfinished'] ?? '',
      needsTotal: document.querySelector<HTMLElement>('.hud-rooms__needs')?.dataset['needs'] ?? '',
      needsCountText:
        document.querySelector<HTMLElement>('.hud-rooms__needs-count')?.textContent?.trim() ?? '',
      // `textContent` and not `innerText`: the line is styled from `.ui-eyebrow`
      // and the panel undoes that class's uppercasing, so reading the rendered
      // text would make this assertion depend on a CSS rule it is not about.
      needsLineText: document.querySelector<HTMLElement>('.hud-rooms__needs-line')?.textContent?.trim() ?? '',
      /** One entry per thing the named room is short, in the order drawn (#529). */
      needsItemText: [...document.querySelectorAll<HTMLElement>('.hud-rooms__needs-item')].map(
        (item) => item.textContent?.trim() ?? '',
      ),
      /** The same lines' `data-kind`, so a spec need not read English to tell an object line from a doorway one (#938). */
      needsItemKinds: [...document.querySelectorAll<HTMLElement>('.hud-rooms__needs-item')].map(
        (item) => item.dataset['kind'] ?? '',
      ),
      /** Distinct top edges among those lines, so a wrapping row can be measured as rows (#938). */
      needsItemRows: new Set(
        [...document.querySelectorAll<HTMLElement>('.hud-rooms__needs-item')].map((item) =>
          Math.round(item.getBoundingClientRect().top),
        ),
      ).size,
      /**
       * The readout's own height, so a spec can measure what the block costs the
       * panel rather than asserting a line count and hoping.
       * `ROOM_NEEDS_NAMED_LIMIT` is a budget in pixels, and this is what spends
       * it.
       */
      needsHeight:
        Math.round((document.querySelector('.hud-rooms__needs')?.getBoundingClientRect().height ?? 0) * 10) / 10,
    };
  },

  /**
   * The Rooms panel's geometry, in the shape `buildLayoutProbe` reports the
   * Build panel's.
   *
   * `lastControlBottom` is the number the reachability assertion turns on: the
   * *last block in the panel* is the status block, and a floor that is too small
   * pushes it past `panelVisibleBottom` rather than clipping it visibly. Reading
   * the enclosure readout's own bottom edge is what makes "the last control is
   * reachable" a measurement instead of a screenshot.
   */
  roomsLayoutProbe(): RoomsLayoutProbe {
    const panel = document.querySelector<HTMLElement>('.hud-rooms');
    const list = document.querySelector<HTMLElement>('.hud-rooms__list');
    const status = document.querySelector<HTMLElement>('.hud-rooms__status');
    const body = document.querySelector<HTMLElement>('.hud-rooms > .ui-panel__body');

    const box = layoutBoxOf;

    const panelRect = panel?.getBoundingClientRect();

    return {
      viewport: [window.innerWidth, window.innerHeight],
      panel: box(panel),
      panelVisibleBottom:
        panel === null || panelRect === undefined
          ? 0
          : Math.round(panelRect.top + panel.clientTop + panel.clientHeight),
      panelOverflow: panel === null ? 0 : panel.scrollHeight - panel.clientHeight,
      panelScrollTop: panel?.scrollTop ?? 0,
      bodyOverflow: body === null ? 0 : body.scrollHeight - body.clientHeight,
      list: box(list),
      listOverflow: list === null ? 0 : list.scrollHeight - list.clientHeight,
      status: box(status),
      lastControlBottom: box(document.querySelector('.hud-rooms__enclosure'))?.bottom ?? 0,
    };
  },

  pressWorldUndo(direction: string): boolean {
    if (worldHistoryRequest === undefined) return false;
    worldHistoryRequest(direction as HudHistoryDirection);
    return true;
  },

  clickPlaceOrder(): boolean {
    // The numeric route's button, inside the folded section -- not the arm
    // toggle, which is the panel's first `.ui-action`, and not a queue row's
    // cancel, which is the panel's last (#348). Scoped to
    // `.hud-build__coordinates` so it names the section rather than a position.
    const submit = document.querySelector<HTMLButtonElement>('.hud-build__coordinates .ui-action');
    if (submit === null) return false;
    // A real click, so a disabled button genuinely does not fire.
    submit.click();
    return true;
  },

  buildLayoutProbe(): BuildLayoutProbe {
    const panel = document.querySelector<HTMLElement>('.hud-build');
    const list = document.querySelector<HTMLElement>('.hud-build__list');
    // The panel's last *laid-out* section, which in the arrival state is the
    // numeric fallback -- "Enter coordinates". Found by walking rather than by a
    // hard-coded index, so it stays the last one if another is ever added.
    //
    // **`getClientRects()`, and that filter is load-bearing.** The queue block
    // (#348) is a `.ui-section` appended *after* the numeric fallback and
    // `hidden` whenever nothing is queued -- which is every state the reachability
    // assertions in `ui-shell.spec.ts` measure. Taking the last node in document
    // order would report a section with no box as "the panel's last section", so
    // `lastSectionHeader` would be `null` and `lastSectionHeaderText` would read
    // "Queued": the fold assertion would go vacuous and the text assertion would
    // fail, both for a block that is not on screen. What those assertions are
    // about is the last thing the player can actually see.
    const sections = [...document.querySelectorAll<HTMLElement>('.hud-build .ui-section')].filter(
      (section) => section.getClientRects().length > 0,
    );
    const header = sections[sections.length - 1]?.querySelector<HTMLElement>('.ui-section__header') ?? null;

    const box = layoutBoxOf;

    const panelRect = panel?.getBoundingClientRect();

    return {
      viewport: [window.innerWidth, window.innerHeight],
      rows: document.querySelectorAll('.hud-build__list [data-buildable]').length,
      panel: box(panel),
      panelVisibleBottom:
        panel === undefined || panel === null || panelRect === undefined
          ? 0
          : Math.round(panelRect.top + panel.clientTop + panel.clientHeight),
      panelOverflow: panel === null ? 0 : panel.scrollHeight - panel.clientHeight,
      panelScrollTop: panel?.scrollTop ?? 0,
      list: box(list),
      listOverflow: list === null ? 0 : list.scrollHeight - list.clientHeight,
      listOverflowY: list === null ? '' : getComputedStyle(list).overflowY,
      lastSectionHeader: box(header),
      lastSectionHeaderText: header?.textContent?.trim() ?? '',
    };
  },

  measureRepaintFormatterCost(): RepaintFormatterCost {
    const original = Intl.NumberFormat;
    let constructions = 0;
    Intl.NumberFormat = new Proxy(original, {
      construct: (target, args: readonly unknown[]) => {
        constructions += 1;
        return Reflect.construct(target, args);
      },
    });
    formatNumberCalls = 0;
    try {
      // A *changed* view model, so nothing short-circuits: this is the repaint
      // the worker's 250 ms clock publication drives.
      hud?.update({
        ...BASE_VIEW_MODEL,
        counts: { ...BASE_COUNTS, prisoners: BASE_COUNTS.prisoners + 1 },
        clock: { ...BASE_VIEW_MODEL.clock, tickOfDay: BASE_VIEW_MODEL.clock.tickOfDay + 5 },
      });
    } finally {
      Intl.NumberFormat = original;
    }
    return { formatNumberCalls, numberFormatConstructions: constructions };
  },

  takeUnhandledRejections(): readonly string[] {
    return unhandledRejections.splice(0, unhandledRejections.length);
  },
};
