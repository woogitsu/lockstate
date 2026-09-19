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
 *
 * **`'caution'` was added for issue #788's ruling of 2026-09-02**, the risk
 * roster's third tone, and it is the same shape of ruling in the other
 * direction: a state *weaker* than `'warning'`, for a prisoner at risk tier 2
 * (`Medium`). Before it, tiers 0, 1 and 2 all read `'neutral'` -- because the
 * roster badge's tone was the classification *group* and the group is
 * `riskTier >= 3` -- so the tier ADR 0090's `ClassificationEarlyWarningSystem`
 * exists to make visible arrived with no change of colour at all.
 *
 * Ordered here between `'success'` and `'warning'` because that is where it
 * sits on the ladder, and named for the convention that already orders the two
 * words this way outside this repository: on safety signage NOTICE precedes
 * CAUTION precedes WARNING precedes DANGER, which is the same direction
 * `'warning'`, `'danger'` and `'critical'` already run in here.
 *
 * **No existing tone would do**, and each was considered rather than skipped:
 * `'warning'` is what the high-risk group reads, so tier 2 taking it would
 * make `Medium` and `High` the same colour -- the very thing the ruling names;
 * `'danger'` and `'critical'` are both *stronger* than `'warning'` and would
 * say a tier-2 prisoner is worse than a tier-3 one; `'info'` is what the same
 * badge already says for a prisoner still in intake, so it would collide
 * inside one column; and `'success'` is not a claim anybody has made about a
 * risk tier.
 */
export type BadgeTone = 'neutral' | 'success' | 'caution' | 'warning' | 'danger' | 'critical' | 'info';

export const BADGE_TONES: readonly BadgeTone[] = ['neutral', 'success', 'caution', 'warning', 'danger', 'critical', 'info'];

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
