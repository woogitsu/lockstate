import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import {
  type AsyncActionFailure,
  AsyncActionGate,
  createBusyGroup,
  runReported,
} from '../primitives/async-action';
import { element, eyebrowText, nextUiId } from '../primitives/dom';
import type { IconId } from '../primitives/icon';
import { type CollapsibleSection, createCollapsibleSection } from '../primitives/collapsible-section';
import { type ListRow, createListRow } from '../primitives/list-row';
import { type Panel, createPanel } from '../primitives/panel';
import { type TabButton, createTabButton } from '../primitives/tab-button';
import { type BuildPanel, type BuildPanelTarget, createBuildPanel } from './build-panel';
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
import { nextFastForwardSpeed, refusalMessageKey, severityLabelKey, severityTone } from './projection';
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
 * corner, and nothing at all in the middle. Two more bands can appear
 * directly under the strip -- the unavailable line, `hidden` unless the host
 * says this page has no simulation behind it (issue #220), and below it the
 * refusal line, empty and `hidden` until a control's action is refused
 * (issue #207). Each is a grid row of its own rather than an overlay, so
 * even then the HUD shrinks the world's space instead of covering it. The
 * root is `pointer-events: none` so every pixel that is not a control passes
 * clicks straight through to the renderer's canvas.
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
    }
  /**
   * The player handed the world pointer to the build tool, or took it back.
   *
   * *Chrome*, not a command: it changes what a click on the world means and
   * asks the simulation for nothing, so it is never gated -- blocking it
   * while a build order was in flight would leave the player unable to put
   * the pointer down.
   */
  | {
      readonly kind: 'arm-build-tool';
      readonly armed: boolean;
      readonly definitionId: string | undefined;
    };

/**
 * Why this page cannot run a simulation at all.
 *
 * A key and nothing else: text never crosses into the HUD (ADR 0011).
 *
 * The field is `labelKey`, matching `HudAlertViewModel`'s, so that
 * `tests/foundation/localization-key-completeness.test.ts` covers it without
 * being extended: that gate matches `*Key:` fields by name, proves each
 * declared key resolves in the bundled default locale, and pins the exact
 * set of field names it finds -- so inventing a name here would be a change
 * to the gate rather than a use of it.
 */
export interface HudUnavailableNotice {
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
}

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
   * A standing sentence about the page itself, in a band of its own directly
   * under the status strip (issue #220).
   *
   * Omitted -- the ordinary case -- the band is `hidden` and its grid row
   * costs nothing. Supplied, it is laid out at every viewport and needs no
   * control pressed and no section opened to be read.
   *
   * Deliberately **not** an entry in `HudViewModel.alerts`, and deliberately
   * not settable afterwards. See the comment on the element in `mountHud`.
   */
  readonly unavailable?: HudUnavailableNotice;
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
  /**
   * Receives every failure, for the host's own diagnostics.
   *
   * It is **not** how the player is told. The HUD reports a refused command
   * itself -- on the control that was pressed and in its own live region --
   * because this callback used to be the only consumer of a failure and the
   * one production handler wrote it to `console.warn`, so a "Place order"
   * with no session left the HUD byte-identical (issue #207).
   * A host that omits this still shows the player a refusal; what it loses
   * is the thrown `Error`, which is diagnostic English and deliberately
   * never reaches the screen (ADR 0011).
   */
  readonly onError?: (failure: AsyncActionFailure) => void;
}

export interface HudHandle {
  readonly element: HTMLElement;
  /**
   * A slot at the top of the HUD's right rail for a panel the **host** owns.
   *
   * The HUD lays it out and nothing more: it never renders into it, never
   * reads it, and does not know what goes there. That separation is not
   * fussiness -- the save panel that occupies it in the running app type-imports
   * from `src/persistence/**` and `src/simulation/runtime/**`, and the HUD may
   * import neither (`AGENTS.md` boundary 1). So the host mounts its own panel
   * here and the HUD supplies only a box that participates in the HUD's grid.
   *
   * The slot is *not* tab-scoped. What sits here is available on every tab,
   * which is the point: saving is not a Build-tab activity (issue #88).
   *
   * **Its height is the rail's to give, not the panel's to take.** The slot
   * asks for no height of its own and receives whatever the Build panel below
   * it does not need, with a floor of a quarter of the rail (`hud.css`). A
   * panel mounted here should therefore be able to scroll its own content --
   * it will regularly be shorter than that content on a short window -- and
   * should not set a height of its own, least of all one in `vh`, which is a
   * budget the rail never agreed to.
   *
   * Empty, it collapses to nothing and the rail is exactly what it was before.
   */
  readonly asideSlot: HTMLElement;
  /**
   * The status strip's left-hand chrome slot, passed straight through.
   *
   * `StatusStrip.brandSlot` documents the arrangement; this is the handle the
   * composition root reaches it by, exactly as `asideSlot` is for the rail. The
   * HUD supplies a box in its own layout and never looks inside it.
   */
  readonly brandSlot: HTMLElement;
  update(viewModel: HudViewModel): void;
  /**
   * Live feedback from the world pointer into the Build panel's readout.
   *
   * Deliberately not part of `HudViewModel`: it changes on every pointer
   * move, and folding it into the snapshot-shaped view model would make a
   * mouse wiggle look like a simulation update.
   */
  setBuildTarget(target: BuildPanelTarget | undefined): void;
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

  /**
   * Where "this page has no simulation behind it" is put on screen (issue
   * #220).
   *
   * A grid row of its own, immediately under the status strip and above the
   * refusal line, `hidden` -- and therefore costing exactly zero -- unless
   * the host supplied `MountHudOptions.unavailable`. It is the same shape
   * issue #207 built for the refusal line, and for the first two of the same
   * three reasons:
   *
   *   - **It is there at every viewport.** `hud.css` drops `.hud__corner`
   *     entirely at 720px and below, so a message routed to the alerts list
   *     does not exist on a phone at all.
   *   - **It is there without being opened.** The alerts section starts
   *     folded (`INITIAL_HUD_SHELL_STATE`) and `createCollapsibleSection`
   *     sets `body.hidden` while it is, so a row appended to that list is
   *     `offsetParent === null` with a 0x0 box on *every* viewport, not only
   *     on a phone. Measured in Chromium at 1280x800 and at 375x812 with
   *     `Worker` construction blocked, on the shipped page, before this row
   *     existed: `.hud` innerText did not contain the sentence at either
   *     size (#220).
   *
   * The third reason #207 gave does **not** apply here and is why this is a
   * second row rather than a second use of the first: a refusal is a fact
   * about this HUD's own interaction and clears the moment the same action
   * succeeds (`clearRefusal`), whereas "this browser cannot start a worker"
   * belongs to no control and cannot stop being true while the page is
   * loaded. Sharing one band would need a rule deciding which sentence wins.
   *
   * Set once, at mount, with no setter: the host learns this before it
   * mounts the HUD -- a `Worker` constructor that threw does not un-throw --
   * so a `setUnavailable` would be an API for a transition that cannot
   * happen.
   */
  const unavailableText = element('span', { className: 'hud-unavailable__text' });
  const unavailable = element('div', {
    className: 'hud__unavailable',
    // `role="status"` already implies `aria-live="polite"`; both are written
    // out to match the refusal line exactly. Neither *announces* this
    // sentence, because a live region announces changes and this text is
    // present at first paint -- what the role buys is that a screen reader
    // reaching it reads it as a status rather than as unlabelled prose.
    attributes: { role: 'status', 'aria-live': 'polite' },
    children: [unavailableText],
  });
  if (options.unavailable === undefined) unavailable.hidden = true;
  else unavailableText.textContent = t(options.unavailable.labelKey);

  /**
   * Where a refused command is reported to the player (issue #207).
   *
   * A live region of the HUD's own, in a grid row directly under the status
   * strip, `hidden` while there is nothing to say. Three properties earned it
   * that place rather than a row in the alerts list:
   *
   *   - **It is there at every viewport.** `hud.css` drops `.hud__corner`
   *     entirely at 720px and below, so the alerts list -- the region issue
   *     #82 established as "reaching the player" -- does not exist on a
   *     phone. A refusal surface that vanishes on the smallest screen is the
   *     same defect in a narrower window.
   *   - **It is there without being opened.** The alerts section starts
   *     folded (`INITIAL_HUD_SHELL_STATE`) and its body is `hidden` while it
   *     is, so appending a row to it changes nothing a player can see.
   *   - **It is not simulation state.** `HudViewModel.alerts` is what the
   *     host says about the prison; a control the host refused is a fact
   *     about this HUD's own interaction, and folding it into the view model
   *     would mean the HUD writing into the data it is a view over.
   *
   * It does **not** auto-dismiss. A message that clears itself on a timer is
   * a race against how fast the player reads, and there is no press to
   * acknowledge it -- so it stays until the same action later succeeds, which
   * is the first moment its sentence stops being true.
   */
  const refusalId = nextUiId('hud-refusal');
  const refusalText = element('span', { className: 'hud-refusal__text' });
  const refusal = element('div', {
    className: 'hud__refusal',
    attributes: { id: refusalId, role: 'status', 'aria-live': 'polite' },
    children: [refusalText],
  });
  refusal.hidden = true;

  /**
   * The control that last asked for each command kind, so a report lands *on
   * the control that was pressed* rather than merely somewhere on screen.
   *
   * `AsyncActionFailure.actionId` is the intent kind and the gate is
   * single-slot, so one entry per kind is enough to name the button. Both
   * controls registered here carry no `aria-describedby` of their own; one
   * that gained one would need this to merge rather than replace.
   */
  const commandControls = new Map<string, HTMLElement>();

  /**
   * One refusal at a time, because there is one line to say it in.
   *
   * A second refusal of a *different* command replaces the first and unmarks
   * its control: the player pressed the second button, so the second is what
   * the line is about, and leaving the first marked would point
   * `aria-describedby` at a sentence about something else.
   */
  let refusedAction: string | undefined;

  const markControl = (actionId: string, refused: boolean): void => {
    const control = commandControls.get(actionId);
    if (control === undefined) return;
    if (refused) {
      control.dataset['actionFailed'] = 'true';
      control.setAttribute('aria-describedby', refusalId);
      return;
    }
    delete control.dataset['actionFailed'];
    control.removeAttribute('aria-describedby');
  };

  /**
   * Reports a failure to the player, then hands it to the host.
   *
   * In that order deliberately: a host handler that throws must not be able
   * to swallow the player's half of the report.
   */
  const reportError = (failure: AsyncActionFailure): void => {
    const messageKey = refusalMessageKey(failure.actionId);
    // `undefined` is a chrome intent, which has already been applied locally
    // -- see `refusalMessageKey`. Nothing is shown, and the host still hears.
    if (messageKey !== undefined) {
      if (refusedAction !== undefined && refusedAction !== failure.actionId) markControl(refusedAction, false);
      refusedAction = failure.actionId;
      refusalText.textContent = t(messageKey);
      refusal.dataset['action'] = failure.actionId;
      refusal.hidden = false;
      markControl(failure.actionId, true);
    }
    options.onError?.(failure);
  };

  /** The refusal stops being true the moment the same action succeeds. */
  const clearRefusal = (actionId: string): void => {
    if (refusedAction !== actionId) return;
    refusedAction = undefined;
    markControl(actionId, false);
    refusalText.textContent = '';
    delete refusal.dataset['action'];
    refusal.hidden = true;
  };

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
  const dispatchCommand = (intent: HudIntent, control: HTMLElement): void => {
    commandControls.set(intent.kind, control);
    gate.run(intent.kind, async () => {
      await options.onIntent?.(intent);
      // Reached only when the host did not throw or reject, which is the one
      // moment a standing refusal for this action becomes false.
      clearRefusal(intent.kind);
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
      dispatchCommand(transportIntent(kind, viewModel), strip.controlFor(kind));
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
      dispatchCommand({ kind: 'place-build-order', ...intent }, buildPanel.submitControl);
    },
    onArm: (armed, definitionId) => {
      runReported('arm-build-tool', () => options.onIntent?.({ kind: 'arm-build-tool', armed, definitionId }), reportError);
    },
  });
  const side = element('div', { className: 'hud__side', children: [buildPanel.element] });

  /**
   * The right rail: one column, holding the host's aside slot at the top and
   * the Build panel at the bottom.
   *
   * It exists because two panels down the right-hand edge have to be laid out
   * *relative to each other*, and before issue #88 they were not: the save
   * panel was its own `position: fixed` layer at `z-index: 10` and the HUD was
   * another at `z-index: 20`, so on the Build tab the Build panel sat on top
   * of the save panel and swallowed every click on it. Sharing one flow column
   * makes that impossible rather than merely fixed -- two boxes stacked in a
   * flex column cannot overlap at any viewport size, and nothing has to
   * remember to check.
   */
  const aside = element('div', { className: 'hud__aside' });
  const rail = element('div', { className: 'hud__rail', children: [aside, side] });

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
    // DOM order matches grid order, so reading order and tab order agree with
    // what is painted: the standing "no simulation" band first, then the
    // refusal line about the last press, then the world's furniture.
    children: [strip.element, unavailable, refusal, corner, rail, tabBar],
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
    asideSlot: aside,
    brandSlot: strip.brandSlot,
    update,
    setBuildTarget: (target) => buildPanel.setTarget(target),
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
