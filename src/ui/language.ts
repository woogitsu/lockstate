import type { LocalizationKey } from '../content/localization';
import {
  type LanguagePreference,
  type OfferedLocale,
  nextLanguagePreference,
} from '../input/language-preference';
import type { MessageParameters } from '../services/localization/format';
import { element, eyebrowText } from './primitives/dom';
import { createIcon } from './primitives/icon';
import { LANGUAGE_MESSAGE_KEY } from './language-messages';

/**
 * The interface language, on screen and remembered (#663).
 *
 * **There is no controller half here, and its absence is the design rather
 * than an omission.** `src/ui/theme.ts` has three parts because a theme can be
 * applied to a live page: one attribute write repaints everything, so a
 * controller can own "which theme is showing" and change it under the player.
 * A language cannot be applied that way. `Localizer`'s own contract is that
 * *"catalogs are loaded before a `Localizer` is constructed, so rendering
 * never awaits a translation"*, and every mounted surface in this interface
 * holds the one instance built at boot -- so the thing that "applies" a
 * language is the page load itself. The composition root persists the
 * preference and reloads; the reasoning, the measurement behind it and the
 * alternative it rejects are in
 * `docs/adr/0119-how-a-language-change-reaches-a-running-page.md`.
 *
 * So this module is the control and nothing else: it reports which preference
 * the player asked for, and it renders which one is in force.
 */

/** The localization surface this control uses -- a structural port, like `ThemeLocalizer`. */
export interface LanguageLocalizer {
  format(key: LocalizationKey, parameters?: MessageParameters): string;
}

/**
 * Each offered locale's name **in itself**.
 *
 * The table is here rather than derived from `Intl.DisplayNames` deliberately.
 * `Intl.DisplayNames` would answer `of('pl')` with the name of Polish *in the
 * page's locale*, which is the failure mode the endonym convention exists to
 * avoid; asking it in the target locale instead (`new
 * Intl.DisplayNames(['pl'], …)`) returns `polski` -- lower case, because that
 * is how Polish writes a language in running text and not how a menu entry is
 * written -- and does so only where the browser ships that locale's display
 * names at all. A five-entry table is smaller than the code to correct for
 * either, and `src/ui/language-messages.ts` records what keeps the values
 * honest across catalogues.
 */
const ENDONYM_KEY: Readonly<Record<OfferedLocale, LocalizationKey>> = {
  en: LANGUAGE_MESSAGE_KEY.english,
  pl: LANGUAGE_MESSAGE_KEY.polish,
};

export interface LanguageControlOptions {
  readonly localizer: LanguageLocalizer;
  readonly preference: LanguagePreference;
  /**
   * The locale the page is actually in, which is what `'auto'` has to name.
   *
   * Passed in rather than read off the localizer, because the two are not the
   * same question: `Localizer.locale` can be a tag with no entry in
   * `ENDONYM_KEY` -- the pseudo-locale is one, and a region subtag like
   * `pl-PL` would be another -- and this control must render the *offered*
   * locale that resolved. The composition root already knows which that was.
   */
  readonly resolved: OfferedLocale;
  /** Reports the preference the player asked for. The owner persists it and reloads. */
  readonly onSelect: (preference: LanguagePreference) => void;
}

export interface LanguageControl {
  readonly element: HTMLElement;
  readonly controls: readonly HTMLButtonElement[];
  setPreference(preference: LanguagePreference): void;
}

/**
 * One button that cycles `Automatic` -> `English` -> `Polski`, in the same row
 * shape as the theme control beside it.
 *
 * **A cycling button rather than a `createChoiceGroup`, and the reason is the
 * one already measured next door.** `src/ui/theme.ts` records what a
 * three-option group cost the rail when it was tried there: a click in the
 * middle of a 375x812 viewport reached the HUD instead of the world, 26
 * controls on the Build tab were covered at 1280x720 (#88), and the rail
 * scrolled at 200 %. This control does not sit in the rail at all -- the rail
 * refused it twice and `src/main.ts` carries both measurements -- but it sits
 * in a drawer that a player opens, and a group of three options is three
 * things to lay out where one button is one.
 *
 * **What a cycling button costs is a different thing in a drawer than it is on
 * a rail, and it is worth being exact.** On a rail the cost is that two of the
 * three values are hidden behind a press. In a drawer the control is *already*
 * behind a press, so a player who has opened it is one press from the next
 * value and two from any value. That is the trade this takes.
 *
 * **What it costs, stated rather than glossed, because it costs more here than
 * it does for the theme.** Two of the three values are behind a press at any
 * moment. For a theme that is a mild inconvenience. For a language it is the
 * thing a language picker exists to avoid -- a player who cannot read the page
 * has to press a button whose label is in a language they cannot read. Three
 * things hold it up, and they are why this is judged acceptable rather than
 * merely cheap:
 *
 *   - **The icon says "language" without words.** A globe is the glyph a
 *     player already reads as a language choice in every other application,
 *     which is what makes the control findable when the legend beside it is
 *     not readable.
 *   - **The readout is always an endonym**, so the moment a press reaches the
 *     player's own language they can read it -- `Polski` is `Polski` on an
 *     English page. At most two presses reach any value.
 *   - **A player whose browser asks for Polish never needs the control at
 *     all.** The default preference is `'auto'`, and #662 already boots such a
 *     player into Polish. The control exists for the player who wants
 *     *something other* than what their browser asked for, and that player can
 *     by definition read at least one of the two names.
 *
 * **Controlled**, like every other control here: a press reports the *next*
 * preference and changes nothing. The composition root applies it -- which for
 * this control means persisting it and reloading the page -- and a preference
 * that could not be stored never reaches `setPreference`, so the readout
 * cannot claim a language the page will not come back in.
 */
export function createLanguageControl(options: LanguageControlOptions): LanguageControl {
  const { localizer } = options;
  let current = options.preference;

  /*
   * The readout is the button's own content, and therefore its accessible
   * name: a screen reader announces "Language, Polski, button" from the
   * group's label plus this. `role="status"` on top of that is what makes a
   * *change* announced -- a button whose name changes under a press says
   * nothing by itself. The same arrangement as the theme control's readout.
   */
  const readout = element('span', {
    className: 'language-control__value',
    attributes: { role: 'status' },
  });

  const button = element('button', {
    className: 'language-control__cycle',
    attributes: { type: 'button', title: localizer.format(LANGUAGE_MESSAGE_KEY.cycle) },
    children: [readout],
  });

  const apply = (): void => {
    readout.textContent =
      current === 'auto'
        ? localizer.format(LANGUAGE_MESSAGE_KEY.automatic, {
            language: localizer.format(ENDONYM_KEY[options.resolved]),
          })
        : localizer.format(ENDONYM_KEY[current]);
    // The value a test or a stylesheet can read without parsing a language
    // name in whatever locale the page is in.
    button.dataset['preference'] = current;
    // And the locale that preference resolved to, which is the only place the
    // two differ: `auto` is a preference and never a language.
    button.dataset['locale'] = current === 'auto' ? options.resolved : current;
  };
  apply();

  button.addEventListener('click', () => {
    options.onSelect(nextLanguagePreference(current));
  });

  const legend = eyebrowText(localizer.format(LANGUAGE_MESSAGE_KEY.region), 'language-control__legend');
  legend.setAttribute('aria-hidden', 'true');

  const root = element('div', {
    className: 'language-control',
    attributes: {
      role: 'group',
      // Names the control "language" rather than leaving a bare word like
      // "Polski" beside a game that also has a theme and an interface scale.
      // The same words are on screen in the legend below, so this is a
      // machine-readable copy of a visible label rather than the only place
      // the meaning exists.
      'aria-label': localizer.format(LANGUAGE_MESSAGE_KEY.region),
    },
    children: [createIcon('language', 'sm'), legend, button],
  });

  return {
    element: root,
    controls: [button],
    setPreference(preference: LanguagePreference): void {
      if (preference === current) return;
      current = preference;
      apply();
    },
  };
}
