import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { APP_SHELL_MESSAGE_KEY, APP_SHELL_MESSAGE_KEYS } from '../../src/ui/app-shell-messages';

/**
 * The accessible name of `<main id="app">`.
 *
 * Shaped like `tests/unit/ui-brand-badge.test.ts`'s "message registry"
 * `describe`, and for the same reason: `APP_SHELL_MESSAGE_KEY`'s field is
 * `label`, which does not end in `Key`, so
 * `tests/foundation/localization-key-completeness.test.ts` -- which scans for
 * `<name>Key: '<literal>'` -- does not see it. A registry check per registry
 * is how that hole gets closed, the same way it was closed for
 * `SAVE_PANEL_MESSAGE_KEY` (#208) and `BRAND_MESSAGE_KEY`.
 *
 * `index.html` used to carry this string as a hard-coded `aria-label` on
 * `<main id="app">`, invisible to the catalogue, to `localization-key-
 * completeness.test.ts`, and to `tests/browser/pseudo-locale-sweep.spec.ts`.
 * `src/main.ts` now sets the attribute at runtime from this key, which is
 * what makes the wording reachable by a test at all.
 */
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

describe('the app-shell message registry', () => {
  it('resolves every key against the bundled default locale', () => {
    // A key that resolves to itself is what an unregistered key renders as
    // (ADR 0011): correct runtime behaviour and the wrong thing to ship.
    expect(APP_SHELL_MESSAGE_KEYS.length).toBe(1);
    for (const key of APP_SHELL_MESSAGE_KEYS) {
      expect(localizer.format(key), `${key} has no default-locale entry`).not.toBe(key);
    }
  });

  it('spells the key in the app namespace', () => {
    // The claim the namespace makes: this is shell-level chrome, the
    // accessible name of the element every region -- HUD, brand badge,
    // display-scale control -- mounts inside, and not a projection of any one
    // of them.
    for (const key of APP_SHELL_MESSAGE_KEYS) expect(key).toMatch(/^app\./u);
  });

  it('carries the pre-existing English across unchanged, rather than authoring new copy', () => {
    // The owner ruled on the mechanism -- route it through the catalogue --
    // not on new wording. This pins the sentence `index.html` used to hard-code
    // as `aria-label="Lockstate game application"`, so a future edit to this
    // entry has to be a deliberate word choice and not a silent one.
    expect(localizer.format(APP_SHELL_MESSAGE_KEY.label)).toBe('Lockstate game application');
  });
});
