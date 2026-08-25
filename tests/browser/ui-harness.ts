import type { SaveImportResult, SaveResult } from '../../src/persistence/local/repository';
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
  type HudBuildOrder,
  type HudHistoryDirection,
  type HudIntent,
  type HudLocalizer,
  type HudRoomArea,
  type HudRoomGesture,
  type HudRoomsViewModel,
  type HudViewModel,
  type HudZoningNoticeViewModel,
  mountHud,
} from '../../src/ui/hud';
import { SavePanel, type SavePanelSessions } from '../../src/ui/save-panel';
import { CURRENT_SAVE_RESTORED_SCOPE } from '../../src/simulation/runtime/restore-session';
import type {
  AlertProbe,
  BuildLayoutProbe,
  BuildProbe,
  ButtonState,
  ImportOutcomeName,
  HudProbe,
  LayoutBox,
  LayoutProbe,
  LockstateUiHarness,
  RefusalProbe,
  RepaintFormatterCost,
  RoomsLayoutProbe,
  RoomsProbe,
} from './ui-harness-api';
import { HUD_MESSAGE_KEY, type HudBuildViewModel } from '../../src/ui/hud';
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
  ok: { ok: true, generationId: 'imported-gen-1', migrated: false },
  'ok-migrated': { ok: true, generationId: 'imported-gen-2', migrated: true },
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
  private readonly prisons: PrisonSlotMetadata[] = [];
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
    const index = this.prisons.findIndex((prison) => prison.prisonId === prisonId);
    if (index >= 0) this.prisons.splice(index, 1);
  }

  public async exportActive(): Promise<undefined> {
    return undefined;
  }

  public releaseCreate(outcome: 'ok' | 'worker-timeout'): void {
    const pending = this.pendingCreate;
    this.pendingCreate = undefined;
    if (pending === undefined) return;
    if (outcome === 'ok') pending.resolve({ ok: true, generationId: 'gen-1' });
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
 * `HudLocalizer` is the two-method port the HUD depends on, so this is a
 * legitimate implementation of it rather than a mock: every call still goes
 * to the real localizer. The counter is what lets `ui-shell.spec.ts` report
 * how many values one repaint formats instead of asserting a number somebody
 * counted by reading the code.
 */
let formatNumberCalls = 0;
const countingLocalizer: HudLocalizer = {
  format: (key, parameters) => (parameters === undefined ? localizer.format(key) : localizer.format(key, parameters)),
  formatNumber: (value, options) => {
    formatNumberCalls += 1;
    return options === undefined ? localizer.formatNumber(value) : localizer.formatNumber(value, options);
  },
};

const BASE_VIEW_MODEL: HudViewModel = {
  counts: { prisoners: 142, prisonerCapacity: 180, staff: 27, rooms: 61, activeIncidents: 0, contrabandFound: 4, treasuryMinorUnits: 24_920 },
  // Day 3, a quarter of the way through a 2,400-tick day, paused.
  clock: { day: 3, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
  alerts: [],
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
 */
const ROOMS_MODEL: HudRoomsViewModel = {
  rooms: [
    {
      roomId: 'room.cell',
      labelKey: 'room.cell.name',
      tint: 0x4f7fd0,
      minimum: { width: 2, height: 3 },
      enclosure: 'enclosed',
    },
    {
      roomId: 'room.canteen',
      labelKey: 'room.canteen.name',
      tint: 0xd0854f,
      minimum: { width: 6, height: 6 },
      enclosure: 'enclosed',
    },
    {
      roomId: 'room.yard',
      labelKey: 'room.yard.name',
      tint: 0x76d04f,
      minimum: { width: 8, height: 8 },
      enclosure: 'outdoors',
    },
  ],
};

/**
 * The same two entries `src/main.ts` projects out of `BUILDABLE_REGISTRY`,
 * as plain view-model data. Kept here rather than imported from the registry
 * so the spec exercises the *panel*, not the catalog.
 */
const BUILD_MODEL: HudBuildViewModel = {
  buildables: [
    {
      definitionId: 'wall-brick',
      labelKey: HUD_MESSAGE_KEY.buildableWallBrick,
      occupiesEdge: true,
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
    },
    {
      definitionId: 'door-wooden',
      labelKey: HUD_MESSAGE_KEY.buildableDoorWooden,
      occupiesEdge: false,
      material: {
        itemId: 'item.wood-plank',
        labelKey: 'item.wood-plank.name',
        unitPriceMinorUnits: 65,
        quantityPerPlacement: 1,
        maxQuantity: 100_000,
      },
    },
  ],
  origin: { x: 16, y: 16 },
};

/**
 * A catalogue of `count` entries, for issue #143.
 *
 * `BUILDABLE_REGISTRY` holds two buildables, and two is one fewer than it
 * takes to push the panel's last section below the fold at 1280x720, so the
 * condition cannot be reached through the real app at all today. The panel
 * takes its option list as view-model data, so the honest way to reach it is
 * to hand the real panel a longer list -- which is what the economy work
 * (#29) will do to it for real.
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
      occupiesEdge: index % 2 === 0,
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

  mountSavePanel(options?: { readonly pseudoLocale?: boolean }): void {
    panel?.dispose();
    sessions = new StubSessions();
    // The host's localizer is passed in rather than left to the panel's
    // default, which is what `src/main.ts` should also do (issue #208).
    // `en-XA` is ADR 0011's own tool for the question this panel failed: a
    // string that is not in the catalog stays unaccented and unbracketed.
    panel = new SavePanel(sessions, root, options?.pseudoLocale === true ? pseudoLocalizer : localizer);
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

  mountHudShell(options?: { readonly empty?: boolean; readonly buildables?: number }): void {
    hud?.destroy();
    intents.length = 0;
    // The previous mount's sink belongs to a destroyed HUD; a gesture sent to
    // it would report intents into a shell that is no longer on the page.
    worldBuildPlace = undefined;
    worldHistoryRequest = undefined;
    worldRoomPlace = undefined;
    worldRoomReadout = undefined;
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
      },
      localizer: countingLocalizer,
      // `empty` mounts the shipped default instead of a populated prison --
      // the state the real app paints before any session exists.
      viewModel: options?.empty === true ? EMPTY_HUD_VIEW_MODEL : BASE_VIEW_MODEL,
      build: options?.buildables === undefined ? BUILD_MODEL : buildModelWithCatalogueOf(options.buildables),
      rooms: ROOMS_MODEL,
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
    const values = [...document.querySelectorAll<HTMLElement>('.hud-strip .ui-value')];
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
      // Scoped to the minimap frame: the Build panel uses the same section
      // primitive, so an unscoped selector would depend on document order.
      alertsCollapsed: document.querySelector('.hud-minimap .ui-section')?.getAttribute('data-collapsed') ?? null,
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
      failedControls: marked.map((control) => control.getAttribute('title') ?? control.textContent ?? ''),
      describedByRefusal:
        line !== null &&
        marked.length > 0 &&
        marked.every((control) => control.getAttribute('aria-describedby') === line.id),
      role: line?.getAttribute('role') ?? null,
      ariaLive: line?.getAttribute('aria-live') ?? null,
    };
  },

  hudText(): string {
    return document.querySelector<HTMLElement>('.hud')?.innerText ?? '';
  },

  layoutProbe(): LayoutProbe {
    const box = (selector: string): LayoutBox | null => {
      const node = document.querySelector(selector);
      if (node === null) return null;
      const rect = node.getBoundingClientRect();
      // A zero-area box is not laid out at all -- the element itself, or an
      // ancestor, is `display: none`. Reported as absent rather than as a
      // 0x0 rectangle at the origin, which would silently satisfy an
      // overlap check.
      if (rect.width === 0 && rect.height === 0) return null;
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      };
    };

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
    const submit = document.querySelector<HTMLButtonElement>('.hud-build .ui-section__body .ui-action');
    const buyToggle = document.querySelector<HTMLButtonElement>('.hud-build__buy-toggle');
    const buyRow = document.querySelector<HTMLElement>('.hud-build__buy');
    const buySubmit = document.querySelector<HTMLButtonElement>('.hud-build__buy-submit');
    const buyQuantity = document.querySelector<HTMLInputElement>('.hud-build__buy .ui-number__input');
    const target = document.querySelector<HTMLElement>('.hud-build__target');
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
      coordinatesCollapsed: coordinates?.dataset['collapsed'] === 'true',
      targetReadout: target?.dataset['target'] ?? null,
      targetText: target?.querySelector('.hud-build__target-value')?.textContent?.trim() ?? '',
      // `offsetParent`, not the `hidden` attribute: an author `display` beats
      // the user agent's `display: none`, and this row is laid out by a rule
      // that has to opt out of that (`hud.css`). Reading the attribute would
      // report the row as folded away while it was on screen.
      buyToggleVisible: buyToggle !== null && buyToggle.offsetParent !== null,
      buyOpen: buyToggle?.getAttribute('aria-expanded') === 'true',
      buyRowVisible: buyRow !== null && buyRow.offsetParent !== null,
      buyLabel: buySubmit?.textContent?.trim() ?? '',
      buyQuantity: buyQuantity?.value ?? '',
      texts: [...(panel?.querySelectorAll<HTMLElement>('button, label, span, h2') ?? [])]
        .map((node) => (node.textContent ?? '').trim())
        .filter((text) => text.length > 0),
    };
  },

  clickArmBuild(): boolean {
    const arm = document.querySelector<HTMLButtonElement>('.hud-build__arm');
    if (arm === null) return false;
    arm.click();
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

  clickRoomType(roomId: string): boolean {
    const row = document.querySelector<HTMLButtonElement>(`.hud-rooms__list [data-room="${roomId}"]`);
    if (row === null) return false;
    row.click();
    return true;
  },

  clickRoomsControl(control: 'arm' | 'remove' | 'confirm' | 'cancel'): boolean {
    const button = document.querySelector<HTMLButtonElement>(`.hud-rooms__${control}`);
    if (button === null) return false;
    // A real click, so a disabled or `hidden` control genuinely does not fire.
    button.click();
    return true;
  },

  /** Publishes a zoning notice, which in the real app arrives on `simulation/status-counts`. */
  reportZoning(notice: HudZoningNoticeViewModel | undefined): void {
    hud?.update({
      ...BASE_VIEW_MODEL,
      ...(notice === undefined ? {} : { zoning: notice }),
    });
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
      noteText: note?.textContent?.trim() ?? '',
      noteTone: note?.dataset['tone'] ?? '',
      ruleText: [...document.querySelectorAll<HTMLElement>('.hud-rooms__rule')].map(
        (line) => line.textContent?.trim() ?? '',
      ),
      enclosureText:
        document.querySelector<HTMLElement>('.hud-rooms__enclosure-value')?.textContent?.trim() ?? '',
      // Laid out, not merely present: `paintActions` uses `hidden`, so a control
      // that is not showing must have no box at all and be out of the tab order.
      armLaidOut: laidOut('.hud-rooms__arm'),
      removeLaidOut: laidOut('.hud-rooms__remove'),
      confirmLaidOut: laidOut('.hud-rooms__confirm'),
      cancelLaidOut: laidOut('.hud-rooms__cancel'),
      confirmText: document.querySelector<HTMLElement>('.hud-rooms__confirm')?.textContent?.trim() ?? '',
      confirmDisabled: document.querySelector<HTMLButtonElement>('.hud-rooms__confirm')?.disabled ?? false,
      armPressed: document.querySelector<HTMLElement>('.hud-rooms__arm')?.getAttribute('aria-pressed') ?? '',
      removePressed:
        document.querySelector<HTMLElement>('.hud-rooms__remove')?.getAttribute('aria-pressed') ?? '',
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

    const box = (node: Element | null): LayoutBox | null => {
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
    };

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
    // toggle, which is now the panel's first `.ui-action`.
    const submit = document.querySelector<HTMLButtonElement>('.hud-build .ui-section__body .ui-action');
    if (submit === null) return false;
    // A real click, so a disabled button genuinely does not fire.
    submit.click();
    return true;
  },

  buildLayoutProbe(): BuildLayoutProbe {
    const panel = document.querySelector<HTMLElement>('.hud-build');
    const list = document.querySelector<HTMLElement>('.hud-build__list');
    // The panel's last section is the numeric fallback -- "Enter coordinates".
    // Found as the last `.ui-section` inside the panel rather than by a
    // hard-coded index, so it stays the *last* one if another is ever added.
    const sections = [...document.querySelectorAll<HTMLElement>('.hud-build .ui-section')];
    const header = sections[sections.length - 1]?.querySelector<HTMLElement>('.ui-section__header') ?? null;

    const box = (node: Element | null): LayoutBox | null => {
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
    };

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
        counts: { ...BASE_VIEW_MODEL.counts, prisoners: BASE_VIEW_MODEL.counts.prisoners + 1 },
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
