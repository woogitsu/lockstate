import type { SaveResult } from '../../src/persistence/local/repository';
import type { PrisonSlotMetadata } from '../../src/persistence/local/store';
import type { ActiveSession, SessionLoadOutcome } from '../../src/persistence/session/session-controller';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { type HudIntent, type HudViewModel, mountHud } from '../../src/ui/hud';
import { SavePanel, type SavePanelSessions } from '../../src/ui/save-panel';
import type { BuildProbe, ButtonState, HudProbe, LayoutBox, LayoutProbe, LockstateUiHarness } from './ui-harness-api';
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

class StubSessions implements SavePanelSessions {
  public createCalls = 0;
  public saveCalls = 0;
  private readonly prisons: PrisonSlotMetadata[] = [];
  private pendingCreate: Pending | undefined;

  public async listPrisons(): Promise<readonly PrisonSlotMetadata[]> {
    return [...this.prisons];
  }

  public getActiveSession(): ActiveSession | undefined {
    return undefined;
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

  public async loadPrison(): Promise<SessionLoadOutcome> {
    return { ok: false, reason: 'not-found' };
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

const unhandledRejections: string[] = [];
window.addEventListener('unhandledrejection', (event) => {
  unhandledRejections.push(event.reason instanceof Error ? event.reason.message : String(event.reason));
});

const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

const BASE_VIEW_MODEL: HudViewModel = {
  counts: { prisoners: 142, prisonerCapacity: 180, staff: 27, rooms: 61, activeIncidents: 0, contrabandFound: 4 },
  clock: { day: 3, minuteOfDay: 7 * 60 + 45, mode: 'paused', speed: 1 },
  alerts: [],
};

/**
 * The same two entries `src/main.ts` projects out of `BUILDABLE_REGISTRY`,
 * as plain view-model data. Kept here rather than imported from the registry
 * so the spec exercises the *panel*, not the catalog.
 */
const BUILD_MODEL: HudBuildViewModel = {
  buildables: [
    { definitionId: 'wall-brick', labelKey: HUD_MESSAGE_KEY.buildableWallBrick, occupiesEdge: true },
    { definitionId: 'door-wooden', labelKey: HUD_MESSAGE_KEY.buildableDoorWooden, occupiesEdge: false },
  ],
  origin: { x: 16, y: 16 },
};

const root = document.getElementById('ui-root');
if (root === null) throw new Error('ui-harness: #ui-root is missing');

let sessions: StubSessions | undefined;
let panel: SavePanel | undefined;
let hud: ReturnType<typeof mountHud> | undefined;
const intents: string[] = [];
let holdClock = false;
let heldClockIntent: (() => void) | undefined;

function findSaveButton(label: string): HTMLButtonElement | undefined {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.save-panel__button')];
  return buttons.find((button) => button.textContent === label);
}

window.lockstateUiHarness = {
  mountSavePanel(): void {
    panel?.dispose();
    sessions = new StubSessions();
    panel = new SavePanel(sessions, root);
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

  createCalls(): number {
    return sessions?.createCalls ?? -1;
  },

  prisonRowCount(): number {
    return sessions?.prisonCount() ?? -1;
  },

  releaseCreate(outcome: 'ok' | 'worker-timeout'): void {
    sessions?.releaseCreate(outcome);
  },

  async settleSavePanel(): Promise<void> {
    await panel?.whenSettled();
    // One extra turn so the handler's trailing `refresh()` repaints.
    await new Promise((resolve) => setTimeout(resolve, 0));
  },

  mountHudShell(): void {
    hud?.destroy();
    intents.length = 0;
    hud = mountHud(root, {
      localizer,
      viewModel: BASE_VIEW_MODEL,
      build: BUILD_MODEL,
      onIntent: (intent: HudIntent) => {
        intents.push(JSON.stringify(intent));
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
    const arm = document.querySelector<HTMLButtonElement>('.hud-build__map .ui-action');
    const submit = document.querySelector<HTMLButtonElement>('.hud-build .ui-section__body .ui-action');
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
      texts: [...(panel?.querySelectorAll<HTMLElement>('button, label, span, h2') ?? [])]
        .map((node) => (node.textContent ?? '').trim())
        .filter((text) => text.length > 0),
    };
  },

  clickArmBuild(): boolean {
    const arm = document.querySelector<HTMLButtonElement>('.hud-build__map .ui-action');
    if (arm === null) return false;
    arm.click();
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

  clickPlaceOrder(): boolean {
    // The numeric route's button, inside the folded section -- not the arm
    // toggle, which is now the panel's first `.ui-action`.
    const submit = document.querySelector<HTMLButtonElement>('.hud-build .ui-section__body .ui-action');
    if (submit === null) return false;
    // A real click, so a disabled button genuinely does not fire.
    submit.click();
    return true;
  },

  takeUnhandledRejections(): readonly string[] {
    return unhandledRejections.splice(0, unhandledRejections.length);
  },
};
