import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import {
  type AsyncActionFailure,
  AsyncActionGate,
  createBusyGroup,
  runReported,
} from '../primitives/async-action';
import { element, eyebrowText } from '../primitives/dom';
import type { IconId } from '../primitives/icon';
import { type CollapsibleSection, createCollapsibleSection } from '../primitives/collapsible-section';
import { type ListRow, createListRow } from '../primitives/list-row';
import { type Panel, createPanel } from '../primitives/panel';
import { type TabButton, createTabButton } from '../primitives/tab-button';
import { type BuildPanel, createBuildPanel } from './build-panel';
import {
  HUD_PANEL_IDS,
  type HudPanelId,
  type HudShellAction,
  type HudShellState,
  type HudTabId,
  INITIAL_HUD_SHELL_STATE,
  hudShellReducer,
  isPanelCollapsed,
} from './hud-state';
import { HUD_MESSAGE_KEY } from './messages';
import { nextFastForwardSpeed, severityLabelKey, severityTone } from './projection';
import { type TransportIntentKind, createStatusStrip } from './status-strip';
import {
  EMPTY_HUD_VIEW_MODEL,
  type HudBuildEdge,
  type HudBuildViewModel,
  type HudClockMode,
  type HudLocalizer,
  type HudSpeed,
  type HudViewModel,
} from './view-model';

/**
 * The persistent HUD shell.
 *
 * It frames the world and never covers it: a dense strip along the top, a
 * tab bar centred along the bottom, a minimap frame in the bottom-left
 * corner, and nothing at all in the middle. The root is `pointer-events:
 * none` so every pixel that is not a control passes clicks straight through
 * to the renderer's canvas.
 *
 * It renders from a plain `HudViewModel` and imports nothing from
 * `src/simulation/**` -- `AGENTS.md` boundary 1, restated: the HUD is a view
 * over snapshots and must never become a source of truth. Every player
 * action leaves as a `HudIntent` for the host to act on; the HUD changes no
 * game state itself, and it does not optimistically pretend the clock
 * changed before a snapshot says so.
 */

export interface HudTabDefinition {
  readonly id: HudTabId;
  readonly icon: IconId;
  readonly labelKey: LocalizationKey;
}

export const HUD_TABS: readonly HudTabDefinition[] = [
  { id: 'overview', icon: 'overview', labelKey: HUD_MESSAGE_KEY.tabOverview },
  { id: 'build', icon: 'build', labelKey: HUD_MESSAGE_KEY.tabBuild },
  { id: 'security', icon: 'security', labelKey: HUD_MESSAGE_KEY.tabSecurity },
  { id: 'regime', icon: 'regime', labelKey: HUD_MESSAGE_KEY.tabRegime },
];

export type HudIntent =
  | { readonly kind: 'select-tab'; readonly tab: HudTabId }
  | { readonly kind: 'set-clock'; readonly mode: HudClockMode; readonly speed: HudSpeed }
  | { readonly kind: 'toggle-panel'; readonly panel: HudPanelId; readonly collapsed: boolean }
  /**
   * The player asked for something to be built. Ids and numbers only -- the
   * host turns this into a `PlaceBuildOrder` command; the HUD does not know
   * that such a command exists.
   */
  | {
      readonly kind: 'place-build-order';
      readonly definitionId: string;
      readonly x: number;
      readonly y: number;
      readonly edge: HudBuildEdge;
    };

export interface MountHudOptions {
  readonly localizer: HudLocalizer;
  /** First paint. Defaults to an empty prison so the shell renders before any snapshot arrives. */
  readonly viewModel?: HudViewModel;
  readonly initialState?: HudShellState;
  /**
   * What the Build panel may offer.
   *
   * Omitted, the panel still renders and says there is nothing to build,
   * which is the honest picture of a host that has published no catalog. It
   * is deliberately not part of `HudViewModel`: the buildable catalog is
   * content, and rebuilding the panel on every snapshot would take focus off
   * a coordinate field mid-edit.
   */
  readonly build?: HudBuildViewModel;
  /**
   * Receives every player action, and may be async.
   *
   * A *command* (`set-clock`) is gated: while one is in flight the transport
   * controls are disabled and a further command is refused, so a slow or
   * wedged host cannot be handed duplicates (issue #65). A *chrome* change
   * (`select-tab`, `toggle-panel`) is never gated -- it has already happened
   * locally and blocking it would drop an interaction the host has nothing
   * to do with. Either way a rejection is reported to `onError` and never
   * discarded.
   */
  readonly onIntent?: (intent: HudIntent) => void | Promise<void>;
  readonly onError?: (failure: AsyncActionFailure) => void;
}

export interface HudHandle {
  readonly element: HTMLElement;
  update(viewModel: HudViewModel): void;
  getState(): HudShellState;
  /** Applies a shell action programmatically -- restoring a saved UI state, or a test. */
  dispatch(action: HudShellAction): void;
  destroy(): void;
}

export function mountHud(root: HTMLElement, options: MountHudOptions): HudHandle {
  const { localizer } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let state = options.initialState ?? INITIAL_HUD_SHELL_STATE;
  let viewModel = options.viewModel ?? EMPTY_HUD_VIEW_MODEL;

  const reportError = (failure: AsyncActionFailure): void => options.onError?.(failure);

  const busy = createBusyGroup();
  const gate = new AsyncActionGate({
    onBusyChange: (isBusy) => busy.setBusy(isBusy),
    onError: reportError,
  });

  /**
   * A *command*: it asks the host to change the simulation, and the host owns
   * the result. Gated, so two rapid taps cannot hand a busy host two clock
   * commands, and so a rejection is reported rather than discarded (issue
   * #65). Nothing changes locally -- the HUD waits for the next snapshot.
   */
  const dispatchCommand = (intent: HudIntent): void => {
    gate.run(intent.kind, async () => {
      await options.onIntent?.(intent);
    });
  };

  /**
   * A *chrome change*: which tab is showing, which panel is folded. It is
   * the HUD's own state, so it applies immediately and unconditionally, and
   * the host is merely told.
   *
   * Deliberately not gated. Blocking a tab tap because a clock command is
   * still in flight would drop an interaction that has nothing to do with
   * the host, which is a worse bug than the one the gate exists to prevent.
   * The notification still cannot reject into the void.
   */
  const dispatchShell = (action: HudShellAction, intent: HudIntent): void => {
    applyState(hudShellReducer(state, action));
    runReported(intent.kind, () => options.onIntent?.(intent), reportError);
  };

  // ---- top status strip --------------------------------------------
  const strip = createStatusStrip({
    localizer,
    onTransport: (kind: TransportIntentKind) => {
      dispatchCommand(transportIntent(kind, viewModel));
    },
  });

  // ---- bottom-left minimap frame -----------------------------------
  // A placeholder, honestly labelled in visible text. Minimap *rendering*
  // belongs to the renderer, not to the HUD; this is the frame it will draw
  // into.
  const minimapSurface = element('div', {
    className: 'hud-minimap__surface',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.minimapPlaceholder), 'hud-minimap__placeholder')],
  });

  const alertList = element('div', { className: 'hud-alerts__list' });
  const alertsSection: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.alertsTitle),
    collapsed: isPanelCollapsed(state, 'alerts'),
    onToggle: (collapsed) => {
      dispatchShell(
        { kind: 'set-panel-collapsed', panel: 'alerts', collapsed },
        { kind: 'toggle-panel', panel: 'alerts', collapsed },
      );
    },
  });
  alertsSection.body.append(alertList);

  const minimapPanel: Panel = createPanel({
    title: t(HUD_MESSAGE_KEY.minimapTitle),
    icon: 'minimap',
    className: 'hud-minimap',
    collapse: {
      collapseLabel: t(HUD_MESSAGE_KEY.panelCollapse),
      expandLabel: t(HUD_MESSAGE_KEY.panelExpand),
      collapsed: isPanelCollapsed(state, 'minimap'),
      onToggle: () => {
        const collapsed = !isPanelCollapsed(state, 'minimap');
        dispatchShell(
          { kind: 'toggle-panel', panel: 'minimap' },
          { kind: 'toggle-panel', panel: 'minimap', collapsed },
        );
      },
    },
  });
  minimapPanel.body.append(minimapSurface, alertsSection.element);

  const corner = element('div', { className: 'hud__corner', children: [minimapPanel.element] });

  // ---- bottom-right build panel ------------------------------------
  // Placing an order is a *command*: it asks the host to change the
  // simulation, so it goes through the same gate as the transport controls
  // and a rejection is reported rather than dropped. Nothing changes locally
  // -- the wall appears when a snapshot says it was built.
  const buildPanel: BuildPanel = createBuildPanel({
    localizer,
    model: options.build ?? { buildables: [], origin: { x: 0, y: 0 } },
    onPlace: (intent) => {
      dispatchCommand({ kind: 'place-build-order', ...intent });
    },
  });
  const side = element('div', { className: 'hud__side', children: [buildPanel.element] });

  // ---- bottom-centre tab bar ---------------------------------------
  const tabs: TabButton[] = HUD_TABS.map((definition) =>
    createTabButton({
      id: definition.id,
      icon: definition.icon,
      label: t(definition.labelKey),
      selection: 'aria-current',
      onSelect: (id: string) => {
        const tab = id as HudTabId;
        dispatchShell({ kind: 'select-tab', tab }, { kind: 'select-tab', tab });
      },
    }),
  );

  const tabBar = element('nav', {
    className: 'hud__tabs',
    attributes: { 'aria-label': t(HUD_MESSAGE_KEY.tabsRegion) },
    children: [element('div', { className: 'hud-tabs__inner', children: tabs.map((tab) => tab.element) })],
  });

  const hud = element('div', {
    className: 'hud',
    children: [strip.element, corner, side, tabBar],
  });

  // Only the controls that issue a *command* are disabled while one is in
  // flight. One busy signal for the three of them, so they can never
  // disagree about whether the clock is being changed. Chrome controls are
  // deliberately absent: see `dispatchShell`.
  for (const control of strip.controls) busy.add(control);
  // The Build panel's controls join the same group: its "Place order" is a
  // command too, so a second tap while one is in flight must not queue a
  // duplicate build order.
  for (const control of buildPanel.controls) busy.add(control);

  // ---- state application -------------------------------------------
  function applyState(next: HudShellState): void {
    if (next === state) return; // the reducer returns the same object for a no-op
    state = next;
    paintState();
  }

  function paintState(): void {
    hud.dataset['activeTab'] = state.activeTab;
    for (const tab of tabs) tab.setActive(tab.id === state.activeTab);
    // Hidden, not merely unstyled: a panel that is off-screen but still in the
    // tab order is a control a keyboard can reach and a player cannot see.
    buildPanel.setVisible(state.activeTab === 'build');
    for (const panel of HUD_PANEL_IDS) {
      const collapsed = isPanelCollapsed(state, panel);
      if (panel === 'minimap') minimapPanel.setCollapsed(collapsed);
      else alertsSection.setCollapsed(collapsed);
    }
  }

  // ---- alerts ------------------------------------------------------
  const alertRows = new Map<string, ListRow>();
  let emptyRow: ListRow | undefined;

  function paintAlerts(): void {
    const seen = new Set<string>();
    for (const alert of viewModel.alerts) {
      seen.add(alert.id);
      const text = t(alert.labelKey, alert.labelParameters);
      const badge = { tone: severityTone(alert.severity), text: t(severityLabelKey(alert.severity)) };
      const existing = alertRows.get(alert.id);
      if (existing === undefined) {
        const row = createListRow({ icon: 'incident', label: text, badge });
        row.element.dataset['alert'] = alert.id;
        alertRows.set(alert.id, row);
        alertList.append(row.element);
      } else {
        existing.setLabel(text);
        existing.setBadge(badge);
      }
    }

    for (const [id, row] of alertRows) {
      if (seen.has(id)) continue;
      row.element.remove();
      alertRows.delete(id);
    }

    // An empty list must say it is empty. A blank rectangle is indistinguishable
    // from a broken one.
    if (viewModel.alerts.length === 0 && emptyRow === undefined) {
      emptyRow = createListRow({ icon: 'check', label: t(HUD_MESSAGE_KEY.alertsEmpty) });
      emptyRow.element.dataset['alert'] = 'empty';
      alertList.append(emptyRow.element);
    } else if (viewModel.alerts.length > 0 && emptyRow !== undefined) {
      emptyRow.element.remove();
      emptyRow = undefined;
    }
  }

  const update = (next: HudViewModel): void => {
    viewModel = next;
    strip.update(next);
    paintAlerts();
  };

  paintState();
  update(viewModel);
  root.append(hud);

  return {
    element: hud,
    update,
    getState: () => state,
    dispatch: (action: HudShellAction) => {
      applyState(hudShellReducer(state, action));
    },
    destroy: () => {
      gate.dispose();
      hud.remove();
    },
  };
}

/**
 * What each transport button asks for, given what the clock is doing now.
 *
 * Pause never changes the speed, so unpausing resumes at the speed the
 * player chose rather than silently resetting to ×1.
 */
export function transportIntent(kind: TransportIntentKind, viewModel: HudViewModel): HudIntent {
  switch (kind) {
    case 'pause':
      return { kind: 'set-clock', mode: 'paused', speed: viewModel.clock.speed };
    case 'play':
      return { kind: 'set-clock', mode: 'running', speed: 1 };
    case 'fast-forward':
      return { kind: 'set-clock', mode: 'running', speed: nextFastForwardSpeed(viewModel.clock.speed) };
  }
}
