import type { LocalizationKey } from '../content/localization';

/**
 * Every string the interface-scale control renders.
 *
 * Shaped like `src/ui/brand-messages.ts` and `src/ui/save-panel-messages.ts`,
 * and for the reason those exist: one frozen object is what lets a test assert
 * that the bundled default catalog resolves *every* key (ADR 0011). A key
 * spelled inline somewhere else would be checked by nothing, and an unresolved
 * key renders as itself.
 *
 * The `display.` namespace rather than `hud.`: like the brand badge, this is
 * page chrome. It projects no prison state, it is not in `HudViewModel`, and
 * what it changes is a browser preference rather than anything the simulation
 * has an opinion about.
 *
 * **Three keys, and no key for the readout.** What the control displays is the
 * scale itself, and a percentage is a *number*: it goes through
 * `localizer.formatNumber(value, { style: 'percent' })`, so the per-cent sign,
 * its spacing and the digits follow the player's locale rather than an English
 * literal glued together here. There is nothing to translate, so there is
 * nothing to author.
 */
export const DISPLAY_SCALE_MESSAGE_KEY = {
  /**
   * The accessible name of the group.
   *
   * Load-bearing rather than decorative: the two visible controls are `−` and
   * `+`, which are symbols and say nothing on their own, and this game already
   * has a *camera* zoom. Without this name a screen-reader user -- and a
   * sighted one reading the tooltip -- could reasonably read the pair as a
   * world zoom. It says "interface", which is the distinction.
   */
  region: 'display.scale.region',
  decrease: 'display.scale.decrease',
  increase: 'display.scale.increase',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

export type DisplayScaleMessageKey = (typeof DISPLAY_SCALE_MESSAGE_KEY)[keyof typeof DISPLAY_SCALE_MESSAGE_KEY];

export const DISPLAY_SCALE_MESSAGE_KEYS: readonly DisplayScaleMessageKey[] = Object.values(DISPLAY_SCALE_MESSAGE_KEY);
