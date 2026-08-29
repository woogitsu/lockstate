import type { LocalizationKey } from '../content/localization';
import {
  type AccessibilitySettings,
  isUiScaleEnlarged,
  nextUiScaleStep,
  snapUiScaleToStep,
} from '../input/accessibility';
import type { MessageParameters } from '../services/localization/format';
import { element, eyebrowText } from './primitives/dom';
import { createIcon } from './primitives/icon';
import { DISPLAY_SCALE_MESSAGE_KEY } from './display-scale-messages';

/**
 * The interface scale, on screen at last (#545).
 *
 * `uiScale` has been declared, range-checked, defaulted and written to
 * `lockstate.settings.accessibility` since the accessibility record was
 * written, and until this module existed **nothing read it back**: no control
 * set it, no consumer applied it, and no stylesheet had a hook for it. A value
 * that survived a reload and changed nothing on screen.
 *
 * Two halves live here, and they are deliberately separable:
 *
 *   1. `applyUiScale` -- one line that writes the chosen step to the `:root`
 *      custom property `--ui-scale`. `src/ui/tokens.css` multiplies every
 *      length token by it, so this single write is the whole of *applying* a
 *      scale: type, spacing, icons, tap targets, panel width, strip height and
 *      the `calc()` floors in `hud.css` that are sums of those tokens all move
 *      together. Nothing else in the tree needs to know a scale exists.
 *   2. `createDisplayScaleControl` -- the control that chooses one.
 *
 * **The steps are fixed and they live in `src/input/accessibility.ts`**, beside
 * the range a persisted record is checked against, because which values are
 * legal is a property of the record and not of this control. This module never
 * invents a scale: every value it reports has come out of `nextUiScaleStep`.
 *
 * The control is **controlled**, in the sense `createChoiceGroup` and
 * `createNumberField` already use here: pressing a step reports the value that
 * was asked for and changes nothing. The owner applies it and calls `setScale`.
 * That is what stops the DOM becoming a second source of truth about a setting
 * whose real home is a storage key -- and it is what lets the composition root
 * persist first and paint second, so a refused write cannot leave the readout
 * claiming a scale that will not survive the reload.
 */

/** The localization surface this control uses -- a structural port, like `SavePanelLocalizer`. */
export interface DisplayScaleLocalizer {
  format(key: LocalizationKey, parameters?: MessageParameters): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
}

export interface DisplayScaleControlOptions {
  readonly localizer: DisplayScaleLocalizer;
  /** The scale to show first. Snapped, so a value restored from an older build is legal on arrival. */
  readonly scale: number;
  /** Reports the step the player asked for. The owner persists it and calls `setScale`. */
  readonly onSelect: (scale: number) => void;
}

export interface DisplayScaleControl {
  readonly element: HTMLElement;
  /** The one button, for an owner that wants to gate it. */
  readonly controls: readonly HTMLButtonElement[];
  setScale(scale: number): void;
}

/**
 * Writes the scale to the DOM, and is the only place in the tree that does.
 *
 * An **inline** custom property on the element passed in -- in the running app
 * `document.documentElement`, which is what `:root` selects -- so it beats the
 * `--ui-scale: 1` default `tokens.css` declares and needs no stylesheet of its
 * own. Taking the element as a parameter rather than reaching for
 * `document.documentElement` here is what makes the write drivable from a test
 * against a detached element, and keeps the module free of a DOM global at
 * import time (issue #199's lesson: a top-level browser access is a boot
 * failure waiting for a hostile store).
 *
 * The value is snapped before it is written. A caller cannot install a scale
 * that is not one of the six steps by handing this function a number, which
 * means the CSS custom property and the persisted record can never hold
 * different vocabularies.
 */
export function applyUiScale(root: HTMLElement, scale: number): void {
  const step = snapUiScaleToStep(scale);
  root.style.setProperty('--ui-scale', String(step));
  /*
   * And one attribute beside it, for the single rule a multiplier cannot
   * express.
   *
   * `hud.css` lets the tab bar wrap to a second row, which it has to above
   * 100 % or the tabs are clipped away by their own `overflow: hidden`. But a
   * flex line breaks on max-content and never on the shrunk size, so a bar
   * that is *allowed* to wrap also wraps at 375x812 at 100 %, where shrinking
   * fitted it perfectly well -- and that is a 55px band taken out of the world
   * at the default scale, which no player asked for. CSS has no way to say
   * "wrap only if you would otherwise clip", so the condition that is actually
   * meant -- the player asked for a bigger interface -- is stated instead.
   *
   * `isUiScaleEnlarged` and not `step > 1` here: it is a layout decision, it
   * is made in two places, and only one of them is testable in `node`.
   */
  if (isUiScaleEnlarged(step)) root.dataset['uiScaleEnlarged'] = 'true';
  else delete root.dataset['uiScaleEnlarged'];
}

/**
 * Applies the scale carried by an accessibility record.
 *
 * A named function rather than `applyUiScale(root, settings.uiScale)` at the
 * call site, because the composition root does this at boot and after every
 * change, and the two must not drift into reading different fields.
 */
export function applyAccessibilitySettings(root: HTMLElement, settings: AccessibilitySettings): void {
  applyUiScale(root, settings.uiScale);
}

export function createDisplayScaleControl(options: DisplayScaleControlOptions): DisplayScaleControl {
  const { localizer } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let current = snapUiScaleToStep(options.scale);

  /*
   * The readout is the button's own content, and therefore its accessible
   * name: a screen reader announces "Interface scale, 125 %, button" from the
   * group's label plus this. `role="status"` on top of that is what makes a
   * *change* announced -- a button whose name changes under a press says
   * nothing by itself.
   *
   * `ui-value` gives it the monospace tabular figures every number in the
   * strip is set in. That is not decoration here: without them the button
   * would change width between "75%" and "100%" and walk out from under the
   * finger that is pressing it.
   */
  const readout = element('span', {
    className: 'ui-value display-scale__value',
    attributes: { role: 'status' },
  });

  /*
   * One button that cycles, which is Minecraft's own GUI Scale control and is
   * here for a measured reason rather than a stylistic one. A `-`/readout/`+`
   * trio is 127px at 100 % before any label, and the status strip's first row
   * on a 375px phone has 134px left after the brand badge -- a margin that the
   * patch version gaining a digit would spend. Measured on the assembled page:
   * with the trio the Build panel arrived at 362px of box for 375px of content
   * at 375x812; with this button it is 379/379, which is what it was before
   * the control existed.
   *
   * `title` rather than `aria-label`, because an `aria-label` would *replace*
   * the accessible name and take the current scale out of it.
   */
  const button = element('button', {
    className: 'display-scale__cycle',
    attributes: { type: 'button', title: t(DISPLAY_SCALE_MESSAGE_KEY.cycle) },
    children: [readout],
  });

  const apply = (): void => {
    // Through the localizer, so the per-cent sign, its spacing and the digits
    // follow the player's locale. `maximumFractionDigits: 0` because every
    // step is a whole percentage by construction -- it guards the *format*
    // against a locale default, not the arithmetic.
    readout.textContent = localizer.formatNumber(current, { style: 'percent', maximumFractionDigits: 0 });
  };
  apply();

  button.addEventListener('click', () => {
    options.onSelect(nextUiScaleStep(current));
  });

  const legend = eyebrowText(t(DISPLAY_SCALE_MESSAGE_KEY.region), 'display-scale__legend');
  legend.setAttribute('aria-hidden', 'true');

  const root = element('div', {
    className: 'display-scale',
    attributes: {
      role: 'group',
      // Names the control "interface scale" rather than leaving a bare
      // percentage beside a game that also has a camera zoom. The same words
      // are on screen in the legend below, so this is a machine-readable copy
      // of a visible label rather than the only place the meaning exists.
      'aria-label': t(DISPLAY_SCALE_MESSAGE_KEY.region),
    },
    children: [
      // Two letters at two sizes: the glyph a player already reads as "text
      // size" everywhere else. `createIcon` marks every glyph `aria-hidden`,
      // so it adds nothing to the name.
      createIcon('ui-scale', 'sm'),
      // A *visible* legend, which the strip had no room for and the rail does.
      // Without it the row is a percentage beside a glyph, in a game whose
      // camera also zooms on `+`/`-`; `aria-hidden` because the group above
      // already carries the same words as its name and a screen reader would
      // otherwise read them twice.
      legend,
      button,
    ],
  });

  return {
    element: root,
    controls: [button],
    setScale(scale: number): void {
      const next = snapUiScaleToStep(scale);
      if (next === current) return;
      current = next;
      apply();
    },
  };
}
