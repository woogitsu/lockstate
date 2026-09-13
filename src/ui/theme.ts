import type { LocalizationKey } from '../content/localization';
import {
  type Theme,
  type ThemePreference,
  THEME_PREFERENCES,
  isThemePreference,
  resolveTheme,
} from '../input/theme-preference';
import type { MessageParameters } from '../services/localization/format';
import { createChoiceGroup, type ChoiceGroup } from './primitives/choice-group';
import { THEME_MESSAGE_KEY } from './theme-messages';

/**
 * The theme, on screen and remembered (#1157).
 *
 * Three halves, deliberately separable, exactly as `src/ui/display-scale.ts`
 * separates its own:
 *
 *   1. `applyTheme` -- one line that writes the resolved theme to the
 *      `data-theme` attribute `src/ui/tokens.css` selects on. Nothing else in
 *      the tree needs to know a theme exists: no component stylesheet names a
 *      colour, so the whole of *applying* a theme is this attribute.
 *   2. `createThemeController` -- the one place that decides which theme is
 *      showing. It owns the preference, the storage key, and the system
 *      subscription.
 *   3. `createThemeControl` -- the control that chooses a preference.
 *
 * **`prefers-color-scheme` is read here and nowhere else, and `tokens.css`
 * contains no media query at all.** The preference has three values and only
 * one of them is a media query, so a stylesheet that also decided would be a
 * second decider -- which is how a toggle and a system setting end up
 * disagreeing about what is on screen. The stylesheet paints what the
 * attribute says; this module is what says it.
 */

/**
 * The device's own preference, as a port rather than as a `MediaQueryList`.
 *
 * Two reasons, and the second is the one that matters. A structural port is
 * drivable from a `node` test with no DOM at all. And `matchMedia` is *itself*
 * a throwing operation in the environments this repository already defends
 * against -- it is absent in older embedded browsers and in some test
 * environments, and reaching for it at module scope is issue #199's failure
 * with a different global. `resolveSystemThemeQuery` answers both.
 */
export interface SystemThemeQuery {
  /** Whether the device is asking for a dark interface right now. */
  readonly matches: boolean;
  /** Subscribes to later changes. Optional: a device that cannot report one still gets a theme. */
  subscribe?(listener: (prefersDark: boolean) => void): void;
}

/**
 * The browser's `prefers-color-scheme` query, or a stand-in that always
 * answers "light" when it cannot be reached.
 *
 * The fallback is not a guess dressed as an answer: light **is** the default
 * theme (ADR 0112 decision 2), so a browser that cannot report a preference
 * gets exactly what a browser reporting no preference would get. The
 * difference is only that it will not be told when that changes.
 */
export function resolveSystemThemeQuery(): SystemThemeQuery {
  try {
    const query = globalThis.matchMedia('(prefers-color-scheme: dark)');
    return {
      get matches(): boolean {
        return query.matches;
      },
      subscribe(listener: (prefersDark: boolean) => void): void {
        query.addEventListener('change', (event) => {
          listener(event.matches);
        });
      },
    };
  } catch {
    return { matches: false };
  }
}

/**
 * Writes the theme to the DOM, and is the only place in the tree that does.
 *
 * The element is a parameter rather than `document.documentElement` reached
 * for here, which is what makes the write drivable against a detached element
 * and keeps this module free of a DOM global at import time -- the same
 * argument `applyUiScale` makes, for the same issue (#199).
 *
 * `dataset` rather than `setAttribute`, so the attribute name cannot be
 * misspelled at a second call site; `tokens.css` selects `[data-theme='dark']`
 * and `[data-theme='light']`, and both are written explicitly. Writing
 * `'light'` rather than removing the attribute matters: "the attribute is
 * absent" and "the player chose light" are the same pixels but not the same
 * fact, and a test that could not tell them apart would pass on a controller
 * that had stopped running.
 */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  root.dataset['theme'] = theme;
}

export interface ThemeControllerOptions {
  /** The element `:root` selects -- `document.documentElement` in the running app. */
  readonly root: HTMLElement;
  /**
   * The preference as it was last stored, read by the composition root.
   *
   * **Handed in rather than read here, and the reason is written down in this
   * repository already.** `tests/unit/ui-orchestration-boundaries.test.ts`
   * records, of `display-scale.ts`'s dependency on `src/input/`, that "a value
   * import of `src/input/storage.ts` would be the erosion to catch: it would
   * mean the control had started reading and writing the settings store itself
   * instead of being handed a scale by the composition root". An earlier draft
   * of this module did exactly that, and that gate is what found it.
   */
  readonly preference: ThemePreference;
  /**
   * Asked to remember a preference. `src/main.ts` satisfies it with
   * `saveThemeSettings`, which swallows a refusal by design -- so this returns
   * nothing and the switch does not depend on it landing.
   */
  readonly persist: (preference: ThemePreference) => void;
  readonly system: SystemThemeQuery;
  /** Told whenever the theme on screen changes, so a control can follow it. */
  readonly onChange?: (theme: Theme, preference: ThemePreference) => void;
}

export interface ThemeController {
  readonly preference: ThemePreference;
  readonly theme: Theme;
  /** Persists the preference, applies the theme it resolves to, and reports both. */
  select(preference: ThemePreference): void;
}

/**
 * The one thing that decides which theme is showing.
 *
 * It applies a theme **on construction**, before any control exists, so the
 * first paint is already the player's theme rather than snapping to it a frame
 * later -- the same ordering `main.ts` uses for the interface scale.
 *
 * **A refused write does not refuse the switch.** `persist` is a `void`
 * callback on purpose: a browser with
 * site data blocked must still be able to switch themes, it merely must not
 * remember (#1157's own requirement, and `src/input/storage.ts`'s standing
 * position that losing a settings write is recoverable and crashing a control
 * mid-session is not). The preference is held in memory here either way, so
 * within one page load the control and the page agree.
 *
 * **The system subscription is live, and only while the preference is
 * `'system'`.** A player who has chosen light does not get moved by their
 * laptop switching at sunset; a player who has chosen nothing does. That
 * asymmetry is the entire reason the preference has three values rather than
 * two, so it is the behaviour worth testing.
 */
export function createThemeController(options: ThemeControllerOptions): ThemeController {
  const { root, system } = options;
  let preference = options.preference;
  let theme = resolveTheme(preference, system.matches);
  applyTheme(root, theme);

  const settle = (next: ThemePreference, prefersDark: boolean): void => {
    preference = next;
    const resolved = resolveTheme(preference, prefersDark);
    if (resolved !== theme) {
      theme = resolved;
      applyTheme(root, theme);
    }
    options.onChange?.(theme, preference);
  };

  system.subscribe?.((prefersDark) => {
    // Only the players who have expressed no preference follow the device.
    if (preference !== 'system') return;
    settle(preference, prefersDark);
  });

  return {
    get preference(): ThemePreference {
      return preference;
    },
    get theme(): Theme {
      return theme;
    },
    select(next: ThemePreference): void {
      // Persist first and paint second, so a store that ever reports a refusal
      // cannot leave the page showing a theme that will not survive a reload
      // without anything having noticed -- the ordering `main.ts` already uses
      // for the interface scale, kept here for the same reason.
      options.persist(next);
      settle(next, system.matches);
    },
  };
}

/** The localization surface this control uses -- a structural port, like `DisplayScaleLocalizer`. */
export interface ThemeLocalizer {
  format(key: LocalizationKey, parameters?: MessageParameters): string;
}

export interface ThemeControlOptions {
  readonly localizer: ThemeLocalizer;
  readonly preference: ThemePreference;
  /** Reports the preference the player asked for. The owner applies it and calls `setPreference`. */
  readonly onSelect: (preference: ThemePreference) => void;
}

export interface ThemeControl {
  readonly element: HTMLElement;
  readonly controls: readonly HTMLButtonElement[];
  setPreference(preference: ThemePreference): void;
}

const LABEL_KEY: Readonly<Record<ThemePreference, LocalizationKey>> = {
  system: THEME_MESSAGE_KEY.system,
  light: THEME_MESSAGE_KEY.light,
  dark: THEME_MESSAGE_KEY.dark,
};

/**
 * Three options, all visible: system, light, dark.
 *
 * `createChoiceGroup` rather than a cycling button of the kind the interface
 * scale uses, and rather than a two-state toggle. A toggle cannot express the
 * third value at all -- "follow the device" is not the absence of a choice,
 * it is a choice -- and a cycling button would hide two thirds of a vocabulary
 * whose options are one word each. It is also already styled and already
 * keyboard- and touch-reachable, so this control adds no CSS.
 *
 * **Controlled**, like every other choice group here: a tap reports what was
 * asked for and changes nothing. The owner applies it and calls
 * `setPreference`, which is what stops the DOM becoming a second source of
 * truth about a setting whose real home is a storage key.
 */
export function createThemeControl(options: ThemeControlOptions): ThemeControl {
  const { localizer } = options;
  const group: ChoiceGroup = createChoiceGroup({
    legend: localizer.format(THEME_MESSAGE_KEY.region),
    options: THEME_PREFERENCES.map((preference) => ({
      id: preference,
      label: localizer.format(LABEL_KEY[preference]),
    })),
    selectedId: options.preference,
    onSelect: (id) => {
      // The group hands back the id it was given, so this can only fail if the
      // vocabulary and the options drift apart -- in which case doing nothing
      // is better than writing a preference nothing can decode.
      if (isThemePreference(id)) options.onSelect(id);
    },
  });

  return {
    element: group.element,
    controls: group.controls,
    setPreference(preference: ThemePreference): void {
      group.setSelected(preference);
    },
  };
}
