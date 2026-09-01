import { element } from './dom';
import { type IconId, createIcon } from './icon';

/**
 * A soft background / solid foreground pair from the token layer.
 *
 * The tone is an *addition* to the text, never a replacement for it: a badge
 * always carries a word, so a red-green colour-blind player, a monochrome
 * display and a screen reader all get the same information.
 *
 * **`'critical'` was added for issue #768's ruling of 2026-09-01**, the FUNDS
 * chip's third tone: a state stronger than `'danger'` for the one place in this
 * repository that needs to say "further still" than the tone that already
 * means "urgent" everywhere else it appears (an active incident, an unguarded
 * sector, a prison over capacity). Ordered here past `'danger'` for that
 * reason -- it is the top of the ladder, not a rung between `'warning'` and
 * `'danger'` -- and nothing else in the HUD emits it yet.
 */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'critical' | 'info';

export const BADGE_TONES: readonly BadgeTone[] = ['neutral', 'success', 'warning', 'danger', 'critical', 'info'];

export interface StatusBadgeOptions {
  readonly tone: BadgeTone;
  readonly text: string;
  readonly icon?: IconId;
}

export interface StatusBadge {
  readonly element: HTMLElement;
  update(options: StatusBadgeOptions): void;
}

export function createStatusBadge(options: StatusBadgeOptions): StatusBadge {
  const label = element('span', { className: 'ui-badge__text' });
  const root = element('span', { className: 'ui-badge', children: [label] });
  let currentIcon: SVGSVGElement | undefined;

  const update = (next: StatusBadgeOptions): void => {
    root.dataset['tone'] = next.tone;
    label.textContent = next.text;

    const wantedIcon = next.icon;
    if (currentIcon?.dataset['icon'] !== wantedIcon) {
      currentIcon?.remove();
      currentIcon = wantedIcon === undefined ? undefined : createIcon(wantedIcon, 'sm');
      if (currentIcon !== undefined) root.prepend(currentIcon);
    }
  };

  update(options);
  return { element: root, update };
}
