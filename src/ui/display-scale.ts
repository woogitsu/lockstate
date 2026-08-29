import type { LocalizationKey } from '../content/localization';
import {
  type AccessibilitySettings,
  canStepUiScale,
  snapUiScaleToStep,
  stepUiScale,
} from '../input/accessibility';
import type { MessageParameters } from '../services/localization/format';
import { element } from './primitives/dom';
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
 * invents a scale: every value it reports has come out of `stepUiScale`.
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
  /** The two step buttons, for an owner that wants to gate them. */
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
  root.style.setProperty('--ui-scale', String(snapUiScaleToStep(scale)));
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
   * `role="status"` and not `aria-live="assertive"`: the readout is the answer
   * to a press the player just made, so it should be announced, and it should
   * wait its turn behind anything more urgent. `ui-value` gives it the
   * monospace tabular figures every number in the strip is set in -- without
   * them the group would change width between "75%" and "100%" and shove the
   * `+` button under the player's finger between two presses.
   */
  const readout = element('span', {
    className: 'ui-value display-scale__value',
    attributes: { role: 'status' },
  });

  const step = (direction: 1 | -1, labelKey: LocalizationKey, symbol: string): HTMLButtonElement =>
    element('button', {
      className: 'display-scale__step',
      attributes: { type: 'button', 'aria-label': t(labelKey) },
      dataset: { direction: direction === 1 ? 'increase' : 'decrease' },
      children: [
        // A symbol for the eye and a sentence for everything else. `title` is
        // a bonus for a pointer; the `aria-label` above is the real name,
        // because touch has no hover.
        element('span', { attributes: { 'aria-hidden': 'true' }, text: symbol }),
      ],
    });

  // U+2212 MINUS SIGN, not a hyphen: the same call `number-field.ts` makes.
  const decrease = step(-1, DISPLAY_SCALE_MESSAGE_KEY.decrease, '−');
  const increase = step(1, DISPLAY_SCALE_MESSAGE_KEY.increase, '+');
  decrease.title = t(DISPLAY_SCALE_MESSAGE_KEY.decrease);
  increase.title = t(DISPLAY_SCALE_MESSAGE_KEY.increase);

  const apply = (): void => {
    // Through the localizer, so the per-cent sign, its spacing and the digits
    // follow the player's locale. `maximumFractionDigits: 0` because every
    // step is a whole percentage by construction -- it guards the *format*
    // against a locale default, not the arithmetic.
    readout.textContent = localizer.formatNumber(current, { style: 'percent', maximumFractionDigits: 0 });
    // Disabled at the ends rather than inert there. A control that takes a
    // press and changes nothing is the defect this whole issue is about, one
    // level down.
    decrease.disabled = !canStepUiScale(current, -1);
    increase.disabled = !canStepUiScale(current, 1);
  };
  apply();

  for (const [button, direction] of [
    [decrease, -1],
    [increase, 1],
  ] as const) {
    button.addEventListener('click', () => {
      const next = stepUiScale(current, direction);
      if (next === current) return;
      options.onSelect(next);
    });
  }

  const root = element('div', {
    className: 'display-scale',
    attributes: {
      role: 'group',
      // Names the pair "interface scale" rather than leaving two bare symbols
      // beside a game that also has a camera zoom.
      'aria-label': t(DISPLAY_SCALE_MESSAGE_KEY.region),
    },
    children: [
      // Two letters at two sizes: the universal "text size" glyph, and the
      // only visible thing that distinguishes this pair from the world's zoom
      // for a player who is not using a screen reader. `createIcon` marks
      // every glyph `aria-hidden`, so it adds nothing to the group's name --
      // which is `aria-label` above, and is not repeated as content here.
      createIcon('ui-scale', 'sm'),
      decrease,
      readout,
      increase,
    ],
  });

  return {
    element: root,
    controls: [decrease, increase],
    setScale(scale: number): void {
      const next = snapUiScaleToStep(scale);
      if (next === current) return;
      current = next;
      apply();
    },
  };
}
