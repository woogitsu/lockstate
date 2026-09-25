import {
  type LayoutRegion,
  type LayoutSettings,
  isRegionCollapsed,
  isMapOnly,
  resetLayoutSettings,
  withLayoutSize,
  withRegionCollapsed,
} from '../../input/layout-preference';
import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { element, eyebrowText, screenReaderText, valueText } from '../primitives/dom';
import { handOffFocus } from '../primitives/focus-handoff';
import { createIcon } from '../primitives/icon';
import { type IconButton, createIconButton } from '../primitives/icon-button';
import {
  type ResizeSeparator,
  type SeparatorRange,
  type SeparatorResizeReason,
  createResizeSeparator,
} from '../primitives/resize-separator';
import {
  type HudLayoutGeometry,
  type LayoutViewport,
  layoutCustomProperties,
  resolveHudLayout,
  sizeFieldFor,
} from './hud-layout';
import { HUD_MESSAGE_KEY } from './messages';
import { UNKNOWN_READOUT_TEXT, dayProgressPercent, displayDay } from './projection';
import type { HudClockViewModel, HudLocalizer } from './view-model';

/**
 * The HUD shell's layout: three collapse arrows, two drag-resizable
 * separators, and the Layout menu that reaches all of it without a pointer
 * (#1159, stage 3 of the 2026-09-13 identity rollout).
 *
 * ## What this module is, and what it deliberately is not
 *
 * It is the **wiring**, and it decides nothing. Every limit comes from
 * `./hud-layout.ts`, every gesture decision from
 * `src/ui/primitives/resize-separator.ts` and `src/input/pointer-gesture.ts`,
 * and the persisted record's shape from `src/input/layout-preference.ts`. What
 * lives here is the part that needs a document: which element gets `hidden`,
 * which custom property carries a width, and where the keyboard goes when a
 * panel folds under it.
 *
 * That split is the same one `resize-separator.ts` draws about itself and it
 * exists for the same reason: `vitest.config.ts` runs `environment: 'node'`
 * with no jsdom, so a rule written into a listener body here would be
 * unobservable from the unit suite and could not be watched going red. The
 * rules are therefore all one module down, and
 * `tests/browser/hud-layout-shell.spec.ts` proves that this wiring reaches them
 * with real events on the assembled page.
 *
 * ## Constitution article 16, which is the one this file is answerable for
 *
 * *"Panel przywraca widoczny uchwyt. Zamknięcie okna oddaje fokus dostępnemu
 * wyzwalaczowi lub mapie. ... Ukryty panel nie przechwytuje klawiatury."* -- a
 * panel restores a visible handle, closing gives focus to a reachable trigger,
 * and a hidden panel does not capture the keyboard. Three things follow, and
 * all three are enforced here rather than described:
 *
 *   1. **The arrow is never inside what it hides.** Each region is a container
 *      that stays, holding a toggle that stays, plus the content that folds.
 *      `collapse` sets `hidden` on the content and never on the container.
 *   2. **`hidden`, not a class.** A panel moved off-screen by CSS is still in
 *      the tab order, which is exactly the keyboard capture the article
 *      forbids; `hidden` takes it out of the accessibility tree as well as out
 *      of the layout.
 *   3. **The keyboard is handed back.** A fold that happens while focus is
 *      inside the folded content moves focus to that region's own toggle --
 *      `handOffFocus`, the same helper the Rooms panel's confirm row uses --
 *      because the browser's answer is to blur to `<body>`, and a player on a
 *      keyboard has then lost the only position they had.
 *
 * ## How geometry reaches the stylesheet
 *
 * Three custom properties on the `.hud` element and three data attributes
 * beside them. Custom properties rather than inline `width`/`height`, for the
 * reason `applyUiScale` writes `--ui-scale` rather than a font size: the
 * stylesheet then decides *what* a width means at each tier -- on a phone the
 * inspector's number is a height and the navigation's is not used at all --
 * and this module never has to know which media query is in force. The one
 * thing it does know is the tier, because the *ranges* differ by tier, and
 * `isPhoneLayout` reads the same 720 px boundary `hud.css` does, asserted
 * against the stylesheet in `tests/unit/hud-layout.test.ts`.
 */

/** The two surfaces a region is made of, as this module needs them. */
export interface LayoutRegionElements {
  /**
   * Stays laid out whatever the fold does.
   *
   * For the navigation and the inspector it is also where the arrow is mounted,
   * so the arrow is a sibling of what it hides. The metric strip's arrow is
   * mounted in the Layout menu instead -- see `toggleHosts` -- so for that
   * region this is only the box that survives the fold.
   */
  readonly container: HTMLElement;
  /** Hidden by the fold. Never contains the toggle. */
  readonly content: readonly HTMLElement[];
}

export interface HudLayoutShellOptions {
  readonly localizer: HudLocalizer;
  /** The `.hud` root: every custom property and data attribute is written here. */
  readonly root: HTMLElement;
  readonly settings: LayoutSettings;
  readonly navigation: LayoutRegionElements;
  readonly inspector: LayoutRegionElements;
  readonly metrics: LayoutRegionElements;
  /**
   * The element the phone's height drag sizes: the rail's bottom block, which
   * is the "dolny [panel] na telefonie" the delivery gives a height drag to.
   *
   * A second element rather than the rail itself, because on a phone the rail
   * holds two things and only one of them is the sheet: the host's aside slot
   * (the save panel and the chrome row) sits above, and capping the *rail*
   * pushed that slot down over the centre of the screen -- measured at 375x812
   * as the save panel covering the pixel *"a click in the middle of the screen
   * reaches the world"* presses.
   */
  readonly inspectorSheet: HTMLElement;
  /**
   * The status strip itself, measured rather than modelled.
   *
   * It is the one thing between the window's top edge and the navigation
   * column, it wraps to two and three rows under rules spread across four
   * media queries, and whether the column fits at all is decided against it
   * (`navigationPlacement`). Handed over as an element so the answer comes
   * from the page rather than from a fourth copy of those rules.
   */
  readonly strip: HTMLElement;
  /**
   * Reports a settled preference for the host to persist.
   *
   * Called on a fold, on a keyboard or slider resize, on a reset -- and for a
   * pointer drag **only when the gesture ends**, which is the distinction
   * `ResizeSeparatorOptions.onGestureEnd` exists to make. A drag reports sixty
   * sizes a second and exactly one of them is a decision.
   */
  readonly onChange: (settings: LayoutSettings) => void;
  /**
   * The device tier, reported when it is first resolved and again whenever it
   * changes (issue #1201).
   *
   * This shell already owns the answer -- `resolveHudLayout` reads
   * `PHONE_MAX_WIDTH_PX`, which is `hud.css`'s own `@media (max-width: 720px)`
   * boundary and not a second opinion about where a phone starts -- and it
   * already acts on a change, by rebuilding the inspector's separator against
   * the new drag axis. A caller that needs to *move a node* across the same
   * boundary cannot do it in a stylesheet, so it gets told rather than adding
   * a second `matchMedia` or a second `resize` listener that could disagree
   * with this one about which side of 720 px the page is on.
   *
   * Called during construction, before `createHudLayoutShell` returns, so a
   * caller never has to ask what the tier was before the first change.
   * It is therefore **not** safe for the handler to close over the shell.
   */
  readonly onTierChange?: (phone: boolean) => void;
  /**
   * The viewport, injected. Defaults to the window.
   *
   * A parameter for the reason `applyUiScale` takes its root element as one: a
   * browser global reached for at module scope is a boot failure waiting for a
   * hostile environment (#199), and a seam here is what lets a browser spec
   * drive a tier without resizing the window under Playwright.
   */
  readonly measureViewport?: () => LayoutViewport;
}

export interface HudLayoutShell {
  /** Every control, for a caller that wants to walk them. Never gated by the busy group. */
  readonly controls: readonly HTMLButtonElement[];
  /** The settings menu's root, for the strip to lay out. */
  readonly menu: HTMLElement;
  /**
   * The host's own box inside the menu, below everything the shell puts there
   * (#663).
   *
   * The same arrangement `HudHandle.asideSlot` is for the rail, and for the
   * same reason: a preference the composition root owns end to end -- it reads
   * the store, it decides what a press does -- has no business being
   * constructed in here, and this shell has no business knowing a language
   * exists. What it does own is *where* things sit, which is this box.
   *
   * It is in this menu rather than in the rail because the rail has no room,
   * and that is a measurement rather than a preference: `src/styles.css` and
   * the pull request carry it. A drawer is also the right home for a control
   * a player uses once -- the clock beside it is here for the mirror-image
   * reason, that folding the strip must not cost a player the ability to read
   * the time.
   */
  readonly preferencesSlot: HTMLElement;
  /** Re-resolves the geometry -- after a viewport change, or a restored preference. */
  refresh(): void;
  setSettings(settings: LayoutSettings): void;
  getSettings(): LayoutSettings;
  /** Close the temporary navigation drawer after choosing a section. */
  closeNavigationDrawer(): void;
  /** The clock readout inside the menu, which is what keeps it reachable with the strip folded. */
  setClock(clock: HudClockViewModel): void;
  destroy(): void;
}

/** Which message names each region's two directions, and its separator. */
const REGION_MESSAGES: Readonly<
  Record<LayoutRegion, { readonly hide: LocalizationKey; readonly show: LocalizationKey }>
> = {
  navigation: { hide: HUD_MESSAGE_KEY.layoutHideNavigation, show: HUD_MESSAGE_KEY.layoutShowNavigation },
  inspector: { hide: HUD_MESSAGE_KEY.layoutHideInspector, show: HUD_MESSAGE_KEY.layoutShowInspector },
  metrics: { hide: HUD_MESSAGE_KEY.layoutHideMetrics, show: HUD_MESSAGE_KEY.layoutShowMetrics },
};

/**
 * A slider over the same range its separator is dragged through.
 *
 * `<input type="range">` and not a second implementation of a separator: the
 * exit criterion is *"resize works by pointer, by keyboard and by the slider,
 * with identical limits"*, and the cheapest way for three controls to have
 * identical limits is for the limits to be written once and applied to each.
 * `min`, `max` and `value` here are the `SeparatorRange` and the size
 * `resolveHudLayout` produced, so a slider cannot offer a width the drag
 * refuses.
 */
interface LayoutSlider {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  readonly label: HTMLElement;
}

function createLayoutSlider(
  id: string,
  onInput: (value: number) => void,
  onSettled: () => void,
): LayoutSlider {
  const input = element('input', {
    className: 'hud-layout__slider',
    attributes: { type: 'range', step: '1', id },
  });
  const label = element('label', { className: 'hud-layout__slider-label', attributes: { for: id } });
  // `input` is every frame of a slider drag and `change` is the one the player
  // meant, which is the same distinction a separator draws between its moves
  // and its release. The panel follows the thumb; `localStorage` is written
  // once.
  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (Number.isFinite(value)) onInput(value);
  });
  input.addEventListener('change', onSettled);
  return { root: element('div', { className: 'hud-layout__row', children: [label, input] }), input, label };
}

export function createHudLayoutShell(options: HudLayoutShellOptions): HudLayoutShell {
  const { localizer, root } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);
  /**
   * The viewport **and** the interface scale, which is one reading because the
   * two are only meaningful together (`LayoutViewport` says why).
   *
   * `--ui-scale` is read off the root element rather than imported from
   * `src/input/accessibility.ts`: the composition root writes it there and the
   * whole token file is multiplied by it, so the document is the single source
   * of what scale is actually in force -- and a HUD that kept its own copy
   * would be a second one to get out of step. A root that carries no value
   * (a harness, a first frame) reads as 1, which is the token's own default.
   */
  const measureViewport =
    options.measureViewport ??
    ((): LayoutViewport => ({
      width: window.innerWidth,
      height: window.innerHeight,
      uiScale: Number.parseFloat(getComputedStyle(root).getPropertyValue('--ui-scale')) || 1,
    }));

  let settings = options.settings;
  const measureReserved = (): number => options.strip.getBoundingClientRect().height;
  let geometry: HudLayoutGeometry = resolveHudLayout(settings, measureViewport(), measureReserved());

  const regions: Readonly<Record<LayoutRegion, LayoutRegionElements>> = {
    navigation: options.navigation,
    inspector: options.inspector,
    metrics: options.metrics,
  };

  let drawerOpen = false;
  const drawerButton = createIconButton({
    icon: 'overview',
    label: t(HUD_MESSAGE_KEY.layoutShowNavigation),
    variant: 'bordered',
    size: 'sm',
    onActivate: () => {
      if (!drawerOpen && geometry.navigationPlacement === 'drawer' && geometry.navigation.collapsed) {
        apply(withRegionCollapsed(settings, 'navigation', false), true);
      }
      setDrawerOpen(!drawerOpen);
    },
  });
  drawerButton.element.classList.add('hud-navigation-drawer__trigger');
  const drawerButtonText = element('span', { text: t(HUD_MESSAGE_KEY.layoutShowNavigation) });
  drawerButton.element.append(drawerButtonText);
  drawerButton.element.setAttribute('aria-expanded', 'false');
  drawerButton.element.setAttribute('aria-controls', 'hud-navigation-sections');
  options.navigation.container.prepend(drawerButton.element);

  function restoreDrawerFocusIfHidden(): void {
    if (
      geometry.navigationPlacement === 'drawer' &&
      !drawerOpen &&
      regions.navigation.content.some((node) => node.contains(document.activeElement))
    ) {
      handOffFocus(drawerButton.element);
    }
  }

  function setDrawerOpen(open: boolean): void {
    drawerOpen = open && geometry.navigationPlacement === 'drawer' && !geometry.navigation.collapsed;
    root.dataset['navigationDrawerOpen'] = drawerOpen ? 'true' : 'false';
    drawerButton.element.setAttribute('aria-expanded', drawerOpen ? 'true' : 'false');
    drawerButton.setLabel(t(drawerOpen ? HUD_MESSAGE_KEY.layoutHideNavigation : HUD_MESSAGE_KEY.layoutShowNavigation));
    drawerButtonText.textContent = t(drawerOpen ? HUD_MESSAGE_KEY.layoutHideNavigation : HUD_MESSAGE_KEY.layoutShowNavigation);
    if (geometry.navigationPlacement === 'drawer') {
      for (const node of regions.navigation.content) node.hidden = geometry.navigation.collapsed || !drawerOpen;
    }
    restoreDrawerFocusIfHidden();
  }

  const onDrawerKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !drawerOpen) return;
    event.preventDefault();
    setDrawerOpen(false);
  };
  options.navigation.container.addEventListener('keydown', onDrawerKeyDown);

  /**
   * The Layout menu's own drawer, built before the arrows because one of them
   * lives in it (see `metricsRow` below).
   */
  const menuBody = element('div', { className: 'hud-layout__body' });
  menuBody.hidden = true;
  /** Where the metric strip's fold control sits, since the strip has no room for it. */
  const metricsRow = element('div', { className: 'hud-layout__row hud-layout__row--fold' });

  // ---- the three collapse arrows -----------------------------------
  const toggles = {} as Record<LayoutRegion, IconButton>;
  /**
   * Where each arrow is mounted, and the third entry is the one that is not
   * obvious.
   *
   * The navigation's and the inspector's go on their own regions, as siblings
   * of the content they hide -- constitution article 16 by construction. **The
   * metric strip's goes inside the Layout menu instead, because the strip is
   * the one region with no pixels to give.** The strip is a wrapping flex whose
   * rows are already full, so a second control in it needs a reserved gutter,
   * and that gutter is `2 x --tap-target` -- 182px of a 720px window at 175 %.
   * Measured across 36 viewport x interface-scale combinations at a 200 %
   * browser page zoom: two controls in the strip cost one combination that
   * passes without them (1440x900 at 175 %), one control costs none.
   *
   * The strip's handle is therefore the Layout button, which is visible at
   * every layout including "map only" and never folds. That still satisfies
   * article 16 -- *"Panel przywraca widoczny uchwyt"* -- and it is a weaker
   * reading of the delivery's *"Strzałki zwijają ... górny pasek metryk"* than
   * an arrow on the strip itself, which is why it is written out here rather
   * than done quietly.
   */
  const toggleHosts: Readonly<Record<LayoutRegion, HTMLElement>> = {
    navigation: options.navigation.container,
    inspector: options.inspector.container,
    metrics: metricsRow,
  };
  for (const region of ['navigation', 'inspector', 'metrics'] as const) {
    const toggle = createIconButton({
      icon: 'chevron',
      label: t(REGION_MESSAGES[region].hide),
      variant: 'quiet',
      size: 'sm',
      onActivate: () => {
        collapse(region, !isRegionCollapsed(settings, region));
      },
    });
    toggle.element.classList.add('hud-layout__arrow');
    toggle.element.dataset['layoutRegion'] = region;
    toggles[region] = toggle;
    // **First**, not last. The arrow reads before what it hides, so the tab
    // order meets it first and a keyboard player folding a region is already
    // standing on the control that brings it back -- which is the same
    // requirement `handOffFocus` below answers for the pointer case. It also
    // costs the region's flexible children less: appended last in the rail it
    // sat under `.hud__side`'s `margin-top: auto` and took its 44px straight
    // out of the Build panel.
    toggleHosts[region].prepend(toggle.element);
  }

  /**
   * Fold or unfold one region.
   *
   * The order is the article-16 order and is not interchangeable: the settings
   * move first, the DOM is repainted from them, and only then is the keyboard
   * handed back -- because the control focus is handed *to* is the toggle,
   * whose own label has just changed, and handing focus to a control that is
   * about to be relabelled reads the old sentence out.
   */
  function collapse(region: LayoutRegion, collapsed: boolean): void {
    const next = withRegionCollapsed(settings, region, collapsed);
    if (next === settings) return;
    const focusWasInside =
      collapsed && regions[region].content.some((node) => node.contains(document.activeElement));
    apply(next, true);
    if (focusWasInside) handOffFocus(toggles[region].element);
  }

  // ---- the two separators ------------------------------------------
  /**
   * The navigation's handle sits on its **right** edge, so rightwards makes it
   * wider: `growth: 1`. The inspector's sits on its **left** edge on a desktop
   * and on its **top** edge on a phone, and both of those make it *smaller* as
   * the coordinate grows: `growth: -1`. `readSeparatorKey` turns that single
   * multiplier into the keyboard agreeing with the pointer, which is article
   * 17's *"Limity klawiatury i myszy są spójne"*.
   */
  const navigationSeparator: ResizeSeparator = createResizeSeparator({
    axis: 'x',
    growth: 1,
    size: geometry.navigation.size,
    range: geometry.navigation.range,
    defaultSize: geometry.navigation.range.max,
    label: t(HUD_MESSAGE_KEY.layoutResizeNavigation),
    onResize: (size, reason) => {
      resize('navigation', size, settles(reason));
    },
    onCollapse: () => {
      collapse('navigation', true);
    },
    onGestureEnd: (end) => {
      if (end === 'released') options.onChange(settings);
    },
  });
  navigationSeparator.element.classList.add('hud-layout__separator', 'hud-layout__separator--navigation');
  options.navigation.container.append(navigationSeparator.element);

  let inspectorSeparator: ResizeSeparator = createInspectorSeparator(geometry);

  /**
   * The inspector's separator is **rebuilt when the tier changes**, and that is
   * a real constraint rather than a shortcut.
   *
   * `axis` fixes which coordinate a drag reads and which `aria-orientation` is
   * announced, and the primitive takes it at construction because it is not a
   * property that changes under a live gesture -- a separator that swapped axis
   * mid-drag would be reading `clientY` against an origin taken from
   * `clientX`. Crossing 720 px is exactly the event that changes it, so the
   * control is torn down (which cancels any drag, like every other teardown)
   * and built again.
   */
  function createInspectorSeparator(next: HudLayoutGeometry): ResizeSeparator {
    const separator = createResizeSeparator({
      axis: next.phone ? 'y' : 'x',
      growth: -1,
      size: next.inspector.size,
      range: next.inspector.range,
      defaultSize: next.phone ? next.inspector.range.max : DEFAULT_INSPECTOR_RESET_PX,
      label: t(HUD_MESSAGE_KEY.layoutResizeInspector),
      onResize: (size, reason) => {
        resize('inspector', size, settles(reason));
      },
      onCollapse: () => {
        collapse('inspector', true);
      },
      onGestureEnd: (end) => {
        if (end === 'released') options.onChange(settings);
      },
    });
    separator.element.classList.add('hud-layout__separator', 'hud-layout__separator--inspector');
    (next.phone ? options.inspectorSheet : options.inspector.container).append(separator.element);
    return separator;
  }

  /**
   * One resize, from whichever of the three controls asked for it.
   *
   * Persisted unless a pointer is holding the handle, which is the whole of
   * *"an owner that persists a layout preference wants only `released`"*: the
   * in-memory record advances on every frame so the panel follows the hand,
   * and `localStorage` is written once, when the hand lets go.
   */
  function resize(region: LayoutRegion, size: number, persist: boolean): void {
    const viewport = measureViewport();
    const field = sizeFieldFor(region, viewport);
    if (field === undefined) return;
    // Stored in **design** pixels, painted in scaled ones. A width chosen on a
    // 100 % desktop then means the same panel at 150 % rather than a panel two
    // thirds the size, which is the contract `hud-layout.ts` states and the
    // reason a stored size survives a change of interface scale at all.
    const scale = viewport.uiScale > 0 ? viewport.uiScale : 1;
    const next = withLayoutSize(settings, field, size / scale);
    if (next === settings) return;
    apply(next, persist);
  }

  /**
   * Whether a reported resize is one to write down.
   *
   * **Read off the reason the control gives rather than off a flag this module
   * keeps**, and the flag is what this replaced: a `dragging` boolean set on
   * `pointerdown` stayed true forever after a middle-button press, because that
   * press is refused before a gesture starts and so no gesture ever ends to
   * clear it -- and every later keyboard resize then silently stopped being
   * persisted.
   *
   * `'pointer'` is a frame of a drag and `'cancel'` is a drag that was thrown
   * away; neither is a decision. The drag's one decision arrives separately, as
   * `onGestureEnd('released')`.
   */
  const settles = (reason: SeparatorResizeReason): boolean => reason === 'keyboard' || reason === 'reset';

  // ---- the Layout menu ---------------------------------------------
  const navigationSlider = createLayoutSlider(
    'hud-layout-navigation',
    (value) => {
      resize('navigation', value, false);
    },
    () => {
      options.onChange(settings);
    },
  );
  const inspectorSlider = createLayoutSlider(
    'hud-layout-inspector',
    (value) => {
      resize('inspector', value, false);
    },
    () => {
      options.onChange(settings);
    },
  );

  const mapOnly = element('button', {
    className: 'ui-action hud-layout__map-only',
    attributes: { type: 'button', 'aria-pressed': 'false' },
    children: [document.createTextNode(t(HUD_MESSAGE_KEY.layoutMapOnly))],
  });
  mapOnly.addEventListener('click', () => {
    // A toggle, so the control that folds everything is also the one that
    // brings it back -- article 16's "visible handle" for the mode as a whole,
    // rather than three arrows the player has to find one at a time.
    const wanted = !isMapOnly(settings);
    let next = settings;
    for (const region of ['navigation', 'inspector', 'metrics'] as const) {
      next = withRegionCollapsed(next, region, wanted);
    }
    if (next === settings) return;
    const focusWasInside = ['navigation', 'inspector', 'metrics'].some((region) =>
      regions[region as LayoutRegion].content.some((node) => node.contains(document.activeElement)),
    );
    apply(next, true);
    if (focusWasInside) handOffFocus(mapOnly);
  });

  const reset = element('button', {
    className: 'ui-action hud-layout__reset',
    attributes: { type: 'button' },
    children: [document.createTextNode(t(HUD_MESSAGE_KEY.layoutReset))],
  });
  reset.addEventListener('click', () => {
    apply(resetLayoutSettings(), true);
  });

  /**
   * The clock, inside the menu.
   *
   * It is here because the metric strip's fold takes the strip's own clock
   * away with it, and constitution article 10 makes the pace the player's --
   * a layout preference may not cost them the ability to read the time. The
   * transport buttons are **not** duplicated: they issue commands, and a
   * second set of controls for the same command is two things to keep in
   * agreement about `disabled` while one is in flight. Unfolding the strip is
   * one press away and brings them back.
   */
  /*
   * Classes of its **own**, not the strip's.
   *
   * Reusing `.hud-clock__day` and its two siblings was the obvious way to
   * inherit the strip's tabular figures and its paused greying, and it broke
   * three existing specs the moment it shipped: `page.locator('.hud-clock__day')`
   * in `app-shell.spec.ts` resolved to two elements and Playwright's strict
   * mode refused it. A second element answering a selector that named exactly
   * one thing is the same class of defect as a second source of truth, one
   * layer down -- so these carry `hud-layout__clock-*` names with rules of
   * their own in `hud.css`, and the strip's three selectors stay unambiguous.
   */
  const clockDay = valueText(UNKNOWN_READOUT_TEXT, 'hud-layout__clock-day');
  const clockProgress = valueText(UNKNOWN_READOUT_TEXT, 'hud-layout__clock-progress');
  const clockSpeed = valueText('', 'hud-layout__clock-speed');
  const clockRow = element('div', {
    className: 'hud-layout__clock',
    children: [
      createIcon('clock', 'sm'),
      eyebrowText(t(HUD_MESSAGE_KEY.clockDay)),
      clockDay,
      screenReaderText(t(HUD_MESSAGE_KEY.clockDayProgress)),
      clockProgress,
      clockSpeed,
    ],
  });

  /**
   * Where the host puts its own preference controls (#663). Empty unless one
   * is mounted, and `:empty` costs nothing.
   */
  const preferencesSlot = element('div', { className: 'hud-layout__preferences' });

  menuBody.append(
    ...[
      // The visible legend lives **here**, not beside the button.
      // `display-scale.ts` puts its own next to its control and records why --
      // a bare glyph is ambiguous in a game that has an interface scale and a
      // camera zoom -- and the same argument applies to this one. What does
      // not apply is the room: the strip is a wrapping flex whose rows are
      // already full, and at 900x600 and 200 % the legend made the slot 295.7px
      // wide and took a whole 88px row of the strip, which comes straight out
      // of the rail below. Inside the menu the words are still on screen the
      // moment a player opens it, and the button keeps them as its `title` and
      // its group's `aria-label` in the meantime.
      eyebrowText(t(HUD_MESSAGE_KEY.layoutRegion), 'hud-layout__legend'),
      clockRow,
      navigationSlider.root,
      inspectorSlider.root,
      metricsRow,
      preferencesSlot,
      mapOnly,
      reset,
    ],
  );

  const menuButton = createIconButton({
    icon: 'overview',
    label: t(HUD_MESSAGE_KEY.layoutMenu),
    variant: 'bordered',
    size: 'sm',
    onActivate: () => {
      // `hidden` is `boolean | 'until-found'` in the DOM lib; `!== false` is
      // the reading that treats every hiding value as hidden.
      setMenuOpen(menuBody.hidden !== false);
    },
  });
  menuButton.element.setAttribute('aria-expanded', 'false');
  menuButton.element.classList.add('hud-layout__button');

  const menu = element('div', {
    className: 'hud-layout',
    attributes: { role: 'group', 'aria-label': t(HUD_MESSAGE_KEY.layoutRegion) },
    children: [menuButton.element, menuBody],
  });

  function setMenuOpen(open: boolean): void {
    menuBody.hidden = !open;
    menuButton.element.setAttribute('aria-expanded', open ? 'true' : 'false');
    // A menu that closes under the keyboard it is holding is the same defect
    // article 16 names for a panel, one control smaller.
    if (!open && menuBody.contains(document.activeElement)) handOffFocus(menuButton.element);
  }

  const onMenuKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || menuBody.hidden !== false) return;
    event.preventDefault();
    setMenuOpen(false);
  };
  menu.addEventListener('keydown', onMenuKeyDown);

  // ---- applying a preference ---------------------------------------
  function paintSlider(
    slider: LayoutSlider,
    key: LocalizationKey,
    range: SeparatorRange,
    size: number,
    enabled: boolean,
  ): void {
    slider.label.textContent = t(key);
    slider.input.min = String(Math.round(range.min));
    // `Math.max` for the inverted range the map reserve can produce: an
    // `<input type="range">` whose max is below its min reports its min for
    // every position, which is the same answer `clampSeparatorSize` gives and
    // is reached here rather than left to the browser.
    slider.input.max = String(Math.round(Math.max(range.max, range.min)));
    slider.input.value = String(size);
    slider.input.disabled = !enabled;
    slider.root.hidden = !enabled;
  }

  function apply(next: LayoutSettings, persist: boolean): void {
    settings = next;
    refresh();
    if (persist) options.onChange(settings);
  }

  /** Which tier `onTierChange` has last been told about; `undefined` until the first `refresh`. */
  let announcedTier: boolean | undefined;

  function refresh(): void {
    const viewport = measureViewport();
    const previousPhone = geometry.phone;
    // The drawer shows all nine metrics, which makes the strip taller. Measure
    // the strip before that presentation rule when choosing a placement;
    // otherwise a resize from a short window keeps the drawer because its own
    // previous height makes the bar appear not to fit (a 200px hysteresis at
    // 960 CSS pixels wide and 200% interface scale).
    const previousPlacement = root.dataset['layoutNavigationPlacement'];
    if (previousPlacement === 'drawer') delete root.dataset['layoutNavigationPlacement'];
    const reservedHeight = measureReserved();
    if (previousPlacement === 'drawer') root.dataset['layoutNavigationPlacement'] = previousPlacement;
    geometry = resolveHudLayout(settings, viewport, reservedHeight);
    if (geometry.navigationPlacement !== 'drawer' || geometry.navigation.collapsed) setDrawerOpen(false);

    if (geometry.phone !== previousPhone) {
      inspectorSeparator.destroy();
      inspectorSeparator.element.remove();
      // Built against the new tier, and appended to that tier's own host: the
      // rail's leading edge on a desktop, the sheet's top edge on a phone.
      inspectorSeparator = createInspectorSeparator(geometry);
    }

    /*
     * Each of the three from `layoutCustomProperties`, which resolves it for
     * the tier that *reads* it rather than the tier the window is in. The
     * frame between CSS crossing 720px and this function hearing about it is
     * what #529 failed in; that module's header carries the measurement.
     */
    const lengths = layoutCustomProperties(geometry, settings, viewport);
    root.style.setProperty('--hud-navigation-width', `${lengths.navigationWidth}px`);
    root.style.setProperty('--hud-inspector-width', `${lengths.inspectorWidth}px`);
    root.style.setProperty('--hud-inspector-height', `${lengths.inspectorHeight}px`);
    root.dataset['layoutTier'] = geometry.phone ? 'phone' : 'desktop';
    root.dataset['layoutNavigationPlacement'] = geometry.navigationPlacement;
    root.dataset['navigationDrawerOpen'] = drawerOpen ? 'true' : 'false';
    drawerButton.element.setAttribute('aria-expanded', drawerOpen ? 'true' : 'false');
    root.dataset['layoutMapOnly'] = isMapOnly(settings) ? 'true' : 'false';

    for (const region of ['navigation', 'inspector', 'metrics'] as const) {
      const collapsed = isRegionCollapsed(settings, region);
      root.dataset[`layout${region[0]!.toUpperCase()}${region.slice(1)}`] = collapsed ? 'collapsed' : 'open';
      for (const node of regions[region].content) {
        node.hidden = collapsed || (region === 'navigation' && geometry.navigationPlacement === 'drawer' && !drawerOpen);
      }
      const toggle = toggles[region];
      toggle.setLabel(t(collapsed ? REGION_MESSAGES[region].show : REGION_MESSAGES[region].hide));
      toggle.element.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.element.dataset['collapsed'] = collapsed ? 'true' : 'false';
    }
    restoreDrawerFocusIfHidden();

    navigationSeparator.setRange(geometry.navigation.range);
    navigationSeparator.setSize(geometry.navigation.size);
    navigationSeparator.element.hidden = geometry.navigationPlacement !== 'rail' || geometry.navigation.collapsed;
    inspectorSeparator.setRange(geometry.inspector.range);
    inspectorSeparator.setSize(geometry.inspector.size);
    inspectorSeparator.element.hidden = geometry.inspector.collapsed;

    paintSlider(
      navigationSlider,
      HUD_MESSAGE_KEY.layoutNavigationWidth,
      geometry.navigation.range,
      geometry.navigation.size,
      geometry.navigationPlacement === 'rail' && !geometry.navigation.collapsed,
    );
    paintSlider(
      inspectorSlider,
      geometry.phone ? HUD_MESSAGE_KEY.layoutInspectorHeight : HUD_MESSAGE_KEY.layoutInspectorWidth,
      geometry.inspector.range,
      geometry.inspector.size,
      !geometry.inspector.collapsed,
    );
    mapOnly.setAttribute('aria-pressed', isMapOnly(settings) ? 'true' : 'false');

    /*
     * LAST IN THIS FUNCTION, AND ONLY ON A CHANGE.
     *
     * Last, because the handler is outside this shell and may move nodes: it
     * must see the page this pass produced rather than a half-applied one, and
     * `root.dataset['layoutTier']` above is the attribute that says the same
     * thing to a stylesheet, so nothing here reads back what the handler did.
     *
     * Only on a change, because `refresh` runs on every `resize` event -- a
     * handler that reparents a node would otherwise move it many times a second
     * through a window drag, taking focus out of anything inside it each time.
     *
     * `announcedTier` rather than the `previousPhone` above: that one is seeded
     * from the geometry this pass is replacing, so it says "unchanged" on the
     * very first run, which is the run a caller most needs to hear about.
     */
    if (geometry.phone !== announcedTier) {
      announcedTier = geometry.phone;
      options.onTierChange?.(geometry.phone);
    }
  }

  const onWindowResize = (): void => {
    refresh();
  };
  window.addEventListener('resize', onWindowResize);

  refresh();

  return {
    controls: [
      toggles.navigation.element,
      drawerButton.element,
      toggles.inspector.element,
      toggles.metrics.element,
      menuButton.element,
      mapOnly,
      reset,
    ],
    menu,
    preferencesSlot,
    refresh,
    getSettings: () => settings,
    closeNavigationDrawer(): void {
      if (geometry.navigationPlacement === 'drawer') setDrawerOpen(false);
    },
    setSettings(next: LayoutSettings): void {
      settings = next;
      refresh();
    },
    setClock(clock: HudClockViewModel): void {
      const dayNumber = displayDay(clock.day);
      clockDay.textContent = dayNumber === undefined ? UNKNOWN_READOUT_TEXT : localizer.formatNumber(dayNumber);
      const percent = dayProgressPercent(clock.tickOfDay, clock.dayLengthTicks);
      clockProgress.textContent =
        percent === undefined
          ? UNKNOWN_READOUT_TEXT
          : localizer.formatNumber(percent / 100, { style: 'percent', maximumFractionDigits: 0 });
      // The same two-channel rule the strip's own readout follows (#639): the
      // word, and the `data-clock-mode` the stylesheet greys the row by. A
      // player who does not read the word still sees it go dim.
      clockSpeed.textContent =
        clock.mode === 'paused'
          ? t(HUD_MESSAGE_KEY.clockPaused)
          : `×${localizer.formatNumber(clock.speed)}`;
      clockRow.dataset['clockMode'] = clock.mode;
    },
    destroy(): void {
      window.removeEventListener('resize', onWindowResize);
      menu.removeEventListener('keydown', onMenuKeyDown);
      options.navigation.container.removeEventListener('keydown', onDrawerKeyDown);
      navigationSeparator.destroy();
      inspectorSeparator.destroy();
    },
  };
}

/**
 * What a double-click on the inspector's handle restores on a desktop.
 *
 * The width this repository has always drawn the rail at, so "back to the
 * default" means the layout every pinned measurement in
 * `tests/browser/app-shell.spec.ts` was taken against, rather than the widest
 * the range allows. On a phone the sheet's default is the range's maximum
 * instead, because "as tall as the tier allows" is what an unsized sheet is --
 * see `resolveLayoutSize`.
 */
const DEFAULT_INSPECTOR_RESET_PX = 264;
