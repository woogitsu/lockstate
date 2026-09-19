import { loadThemeSettings, resolveBrowserKeyValueStore, saveThemeSettings } from '../../src/input/storage';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { createThemeControl, createThemeController, resolveSystemThemeQuery } from '../../src/ui/theme';
import { BADGE_TONES, createStatusBadge } from '../../src/ui/primitives/status-badge';
import { element } from '../../src/ui/primitives/dom';
import '../../src/styles.css';

/**
 * The theme, wired the way `src/main.ts` wires it, in a page small enough to
 * measure (#1157).
 *
 * **The same four calls in the same order as `mountInterface`** --
 * `resolveBrowserKeyValueStore`, `loadThemeSettings`, `createThemeController`,
 * `createThemeControl` -- because the properties this harness exists to prove
 * are properties of that wiring: that a blocked store still switches, that the
 * device's preference is followed until a player says otherwise, and that the
 * attribute really repaints. A harness that called `applyTheme` directly would
 * prove the stylesheet and nothing else, and the stylesheet is the half that
 * `tests/unit/ui-design-tokens.test.ts` already holds.
 *
 * It is not the app: the app boots a worker, a Phaser canvas and a HUD, and
 * none of that is what a theme switch is about. It carries one badge of every
 * tone so that a spec can read a *painted* colour off a real chip rather than
 * reading back the custom property it was set from.
 */
const store = resolveBrowserKeyValueStore();
const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
const root = document.getElementById('theme-root') as HTMLElement;

const themeControl = createThemeControl({
  localizer,
  preference: 'system',
  onSelect: (preference) => {
    controller.select(preference);
  },
});
const controller = createThemeController({
  root: document.documentElement,
  preference: loadThemeSettings(store).preference,
  persist: (preference) => {
    saveThemeSettings(store, { version: 1, preference });
  },
  system: resolveSystemThemeQuery(),
  onChange: (_theme, preference) => {
    themeControl.setPreference(preference);
  },
});
themeControl.setPreference(controller.preference);

root.append(
  themeControl.element,
  element('div', {
    className: 'ui-panel',
    attributes: { id: 'theme-specimens' },
    children: [
      element('p', { className: 'ui-body', text: 'Body text on a raised surface.' }),
      ...BADGE_TONES.map((tone) => createStatusBadge({ tone, text: tone }).element),
      element('button', { className: 'ui-action', attributes: { type: 'button' }, dataset: { tone: 'primary' }, text: 'Confirm' }),
    ],
  }),
);
