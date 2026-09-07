import type { LocalizationKey } from '../content/localization';

/**
 * The one string the HTML shell itself renders, before any component mounts.
 *
 * Shaped like `src/ui/brand-messages.ts` and `src/ui/display-scale-messages.ts`,
 * and for the same reason those exist: a frozen object is what lets a test
 * assert that the bundled default catalog resolves *every* key it declares
 * (ADR 0011). A key spelled inline at a call site would be checked by nothing,
 * and an unresolved key renders as itself.
 *
 * **Authored here rather than derived.** `default-locale-en.ts` merges two
 * kinds of key: hand-written ones in its own `authoredMessages` object, and
 * ones `simulationEnumMessages()` computes from the census in
 * `simulation-message-keys.ts` -- ids the simulation owns (need types, risk
 * tiers, staff roles and the rest) which the catalogue must never re-type by
 * hand, on pain of the two drifting. `app.shell.label` names no simulation
 * id -- it is the accessible name of the whole page, exactly one thing the
 * shell itself owns -- so it is authored, the same way `brand.region` and
 * `display.scale.region` are: page chrome that is not a projection of any
 * census.
 *
 * The `app.` namespace rather than `hud.` or `brand.`: this is not a HUD
 * projection of prison state, and it is not the brand badge in the corner --
 * it is the accessible name of `<main id="app">`, the element every one of
 * those regions lives inside. One key today; the namespace is where a second
 * piece of shell-level chrome would go if one is ever added.
 */
export const APP_SHELL_MESSAGE_KEY = {
  /**
   * The accessible name of `<main id="app">`, the element the whole
   * application mounts into (`index.html`).
   *
   * Set at runtime rather than left as the HTML shell's own `aria-label`: the
   * shell loads before any `Localizer` exists, so a label baked into
   * `index.html` can never pass through the catalogue, the pseudo-locale sweep,
   * or a future locale switch -- it would be player-facing text no gate that
   * checks catalogue coverage can see. `src/main.ts` applies this key to the
   * element as soon as the page's one `Localizer` exists, which is the
   * earliest point a translated label can be produced at all.
   */
  label: 'app.shell.label',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type AppShellMessageKey = (typeof APP_SHELL_MESSAGE_KEY)[keyof typeof APP_SHELL_MESSAGE_KEY];

export const APP_SHELL_MESSAGE_KEYS: readonly AppShellMessageKey[] = Object.values(APP_SHELL_MESSAGE_KEY);
