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
  createResizeSeparator,
} from '../primitives/resize-separator';
import { type HudLayoutGeometry, type LayoutViewport, resolveHudLayout, sizeFieldFor } from './hud-layout';
import { HUD_MESSAGE_KEY } from './messages';
import { CLOCK_UNKNOWN_TEXT, dayProgressPercent, displayDay } from './projection';
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
 * rules are therefore all one module down, and `tests/browser/app-shell.spec.ts`
 * proves that this wiring reaches them with real events.
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

/** The three surfaces a region is made of, as this module needs them. */
export interface LayoutRegionElements {
  /** Stays laid out whatever the fold does. It is what carries the handle. */
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
  /** The Layout menu's root, for the strip to lay out. */
  readonly menu: HTMLElement;
  /** Re-resolves the geometry -- after a viewport change, or a restored preference. */
  refresh(): void;
  setSettings(settings: LayoutSettings): void;
  getSettings(): LayoutSettings;
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

function createLayoutSlider(id: string, onInput: (value: number) => void): LayoutSlider {
  const input = element('input', {
    className: 'hud-layout__slider',
    attributes: { type: 'range', step: '1', id },
  });
  const label = element('label', { className: 'hud-layout__slider-label', attributes: { for: id } });
  input.addEventListener('input', () => {
    const value = Number(input.value);
    if (Number.isFinite(value)) onInput(value);
  });
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
  /** True while a pointer drag is in flight, so its frames are not persisted. */
  let dragging = false;

  const regions: Readonly<Record<LayoutRegion, LayoutRegionElements>> = {
    navigation: options.navigation,
    inspector: options.inspector,
    metrics: options.metrics,
  };

  // ---- the three collapse arrows -----------------------------------
  const toggles = {} as Record<LayoutRegion, IconButton>;
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
    regions[region].container.prepend(toggle.element);
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
    onResize: (size) => {
      resize('navigation', size);
    },
    onCollapse: () => {
      collapse('navigation', true);
    },
    onGestureEnd: (end) => {
      dragging = false;
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
      onResize: (size) => {
        resize('inspector', size);
      },
      onCollapse: () => {
        collapse('inspector', true);
      },
      onGestureEnd: (end) => {
        dragging = false;
        if (end === 'released') options.onChange(settings);
      },
    });
    separator.element.classList.add('hud-layout__separator', 'hud-layout__separator--inspector');
    separator.element.addEventListener('pointerdown', () => {
      dragging = true;
    });
    (next.phone ? options.inspectorSheet : options.inspector.container).append(separator.element);
    return separator;
  }

  navigationSeparator.element.addEventListener('pointerdown', () => {
    dragging = true;
  });

  /**
   * One resize, from whichever of the three controls asked for it.
   *
   * Persisted unless a pointer is holding the handle, which is the whole of
   * *"an owner that persists a layout preference wants only `released`"*: the
   * in-memory record advances on every frame so the panel follows the hand,
   * and `localStorage` is written once, when the hand lets go.
   */
  function resize(region: LayoutRegion, size: number): void {
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
    apply(next, !dragging);
  }

  // ---- the Layout menu ---------------------------------------------
  const navigationSlider = createLayoutSlider('hud-layout-navigation', (value) => {
    resize('navigation', value);
  });
  const inspectorSlider = createLayoutSlider('hud-layout-inspector', (value) => {
    resize('inspector', value);
  });

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
  const clockDay = valueText(CLOCK_UNKNOWN_TEXT, 'hud-clock__day');
  const clockProgress = valueText(CLOCK_UNKNOWN_TEXT, 'hud-clock__day-progress');
  const clockSpeed = valueText('', 'hud-clock__speed');
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

  const menuBody = element('div', {
    className: 'hud-layout__body',
    children: [
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
      mapOnly,
      reset,
    ],
  });
  menuBody.hidden = true;

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

  function refresh(): void {
    const viewport = measureViewport();
    const previousPhone = geometry.phone;
    geometry = resolveHudLayout(settings, viewport, measureReserved());

    if (geometry.phone !== previousPhone) {
      inspectorSeparator.destroy();
      inspectorSeparator.element.remove();
      // Built against the new tier, and appended to that tier's own host: the
      // rail's leading edge on a desktop, the sheet's top edge on a phone.
      inspectorSeparator = createInspectorSeparator(geometry);
    }

    root.style.setProperty('--hud-navigation-width', `${geometry.navigationExtent}px`);
    root.style.setProperty('--hud-inspector-width', `${geometry.phone ? 0 : geometry.inspectorExtent}px`);
    root.style.setProperty('--hud-inspector-height', `${geometry.inspector.size}px`);
    root.dataset['layoutTier'] = geometry.phone ? 'phone' : 'desktop';
    root.dataset['layoutNavigationPlacement'] = geometry.navigationPlacement;
    root.dataset['layoutMapOnly'] = isMapOnly(settings) ? 'true' : 'false';

    for (const region of ['navigation', 'inspector', 'metrics'] as const) {
      const collapsed = isRegionCollapsed(settings, region);
      root.dataset[`layout${region[0]!.toUpperCase()}${region.slice(1)}`] = collapsed ? 'collapsed' : 'open';
      for (const node of regions[region].content) node.hidden = collapsed;
      const toggle = toggles[region];
      toggle.setLabel(t(collapsed ? REGION_MESSAGES[region].show : REGION_MESSAGES[region].hide));
      toggle.element.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.element.dataset['collapsed'] = collapsed ? 'true' : 'false';
    }

    navigationSeparator.setRange(geometry.navigation.range);
    navigationSeparator.setSize(geometry.navigation.size);
    navigationSeparator.element.hidden = geometry.navigationPlacement === 'bar' || geometry.navigation.collapsed;
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
  }

  const onWindowResize = (): void => {
    refresh();
  };
  window.addEventListener('resize', onWindowResize);

  refresh();

  return {
    controls: [
      toggles.navigation.element,
      toggles.inspector.element,
      toggles.metrics.element,
      menuButton.element,
      mapOnly,
      reset,
    ],
    menu,
    refresh,
    getSettings: () => settings,
    setSettings(next: LayoutSettings): void {
      settings = next;
      refresh();
    },
    setClock(clock: HudClockViewModel): void {
      const dayNumber = displayDay(clock.day);
      clockDay.textContent = dayNumber === undefined ? CLOCK_UNKNOWN_TEXT : localizer.formatNumber(dayNumber);
      const percent = dayProgressPercent(clock.tickOfDay, clock.dayLengthTicks);
      clockProgress.textContent =
        percent === undefined
          ? CLOCK_UNKNOWN_TEXT
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
