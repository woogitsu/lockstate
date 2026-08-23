import type { SaveResult } from '../../src/persistence/local/repository';
import type { PrisonSlotMetadata } from '../../src/persistence/local/store';
import type { ActiveSession, SessionLoadOutcome } from '../../src/persistence/session/session-controller';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { type HudIntent, type HudViewModel, mountHud } from '../../src/ui/hud';
import { SavePanel, type SavePanelSessions } from '../../src/ui/save-panel';
import type { ButtonState, HudProbe, LayoutBox, LayoutProbe, LockstateUiHarness } from './ui-harness-api';
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
      alertsCollapsed: document.querySelector('.ui-section')?.getAttribute('data-collapsed') ?? null,
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
    const header = document.querySelector<HTMLButtonElement>('.ui-section__header');
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

  takeUnhandledRejections(): readonly string[] {
    return unhandledRejections.splice(0, unhandledRejections.length);
  },
};
