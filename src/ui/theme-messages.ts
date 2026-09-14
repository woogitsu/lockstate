import type { LocalizationKey } from '../content/localization';

/**
 * Every string the theme control renders.
 *
 * Shaped like `src/ui/display-scale-messages.ts`, and in the same `display.`
 * namespace for the same reason: this is page chrome. It projects no prison
 * state, it is not in `HudViewModel`, and what it changes is a browser
 * preference rather than anything the simulation has an opinion about.
 *
 * **"Light" and "Dark", not "Day" and "Night"**, although the delivery names
 * the two palettes Day and Night and this repository's own documents follow
 * it. Constitution article 19 says a theme does not change the simulated time
 * of day, and a control offering a player "Day" in a prison whose clock says
 * 23:40 is precisely the sentence that article exists to forbid -- the label
 * would be making a claim about the world that the code does not keep. The
 * palettes keep their names in `tokens.css` and in `docs/VISUAL_IDENTITY.md`,
 * where the reader is a developer and the claim is about colour.
 */
export const THEME_MESSAGE_KEY = {
  /** The small-caps legend above the row, and the group's accessible name. */
  region: 'display.theme.region',
  /** Follow whatever the device asks for, and keep following it if it changes. */
  system: 'display.theme.system',
  light: 'display.theme.light',
  dark: 'display.theme.dark',
  /**
   * The `title` on the one button, which is what says the button *does*
   * something.
   *
   * The button's accessible name is its own content -- the theme it is on --
   * so that a screen reader announces the current one, and this is the tooltip
   * beside it rather than an `aria-label`, which would replace that name
   * instead of adding to it. The same arrangement as
   * `display.scale.cycle`, for the same reason.
   */
  cycle: 'display.theme.cycle',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type ThemeMessageKey = (typeof THEME_MESSAGE_KEY)[keyof typeof THEME_MESSAGE_KEY];

export const THEME_MESSAGE_KEYS: readonly ThemeMessageKey[] = Object.values(THEME_MESSAGE_KEY);
