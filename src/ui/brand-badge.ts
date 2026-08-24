import type { LocalizationKey } from '../content/localization';
import type { MessageParameters } from '../services/localization/format';
import { type BuildIdentity, BUILD_IDENTITY } from '../shared/build-identity';
import { element, screenReaderText } from './primitives/dom';
import { createIcon } from './primitives/icon';
import { BRAND_MESSAGE_KEY } from './brand-messages';

/**
 * The wordmark and the build, in the top-left corner.
 *
 * It exists so a player -- and a bug report -- can always say which build is on
 * screen. Nothing in the page said so before: the version lived in three
 * hard-coded placeholders (see `src/shared/build-identity.ts`) and none of them
 * was rendered anywhere, so "which version were you playing" had no answer
 * short of reading the bundle.
 *
 * ## Where it lives, and why it is not part of the HUD
 *
 * It is a top-level `src/ui/` module that the **HUD lays out**: the status
 * strip exposes a box at its left end (`StatusStrip.brandSlot`, reached through
 * `HudHandle.brandSlot`) and `src/main.ts` mounts this into it. Exactly the
 * arrangement the save panel already has with the rail's `asideSlot`, and for
 * the same reason.
 *
 * A slot rather than a widget the strip builds, because the strip is a
 * *projection*: `StatusStrip.update` repaints it from `HudViewModel` on every
 * snapshot, and a build identity is neither prison state nor something that
 * changes. Having the strip build it would put a compile-time constant inside
 * the structure that exists to carry changing state, and would give
 * `src/ui/hud/**` an import of `src/shared/build-identity.ts` that it has no
 * use for.
 *
 * A slot rather than a `position: fixed` layer of its own, because the corner
 * it belongs in is the corner the strip already occupies. Two independently
 * positioned layers competing for the same pixels is precisely the defect
 * issue #88 was -- the save panel and the Build panel each `fixed`, one
 * covering 91% of the other -- and the fix there was to move the panel into
 * the HUD's grid. Reaching for `fixed` again would be re-introducing it.
 *
 * The badge is not interactive: no control, no focus stop, no hover-only
 * content. So it is outside the 44px tap-target rule by not being a target,
 * and `brand.css` gives it `pointer-events: none`.
 */

/**
 * The localization surface this badge uses.
 *
 * A structural port, the third of its shape after `HudLocalizer` and
 * `SavePanelLocalizer`. `format` only: the badge renders no number that wants
 * locale-aware grouping -- a semantic version and a commit hash are
 * identifiers, and `formatNumber` on either would be wrong rather than merely
 * unnecessary.
 */
export interface BrandLocalizer {
  format(key: LocalizationKey, parameters?: MessageParameters): string;
}

export interface BrandBadgeOptions {
  readonly localizer: BrandLocalizer;
  /**
   * Which build to name. Defaults to this build.
   *
   * A parameter and not a direct read, so a test can render an `unknown` commit
   * or a long version without a `define`, and so the module has no compile-time
   * global of its own. The default is what the one production caller wants and
   * is the reason the caller does not have to know the module exists.
   */
  readonly identity?: BuildIdentity;
}

export interface BrandBadge {
  readonly element: HTMLElement;
}

export function createBrandBadge(options: BrandBadgeOptions): BrandBadge {
  const { localizer } = options;
  const identity = options.identity ?? BUILD_IDENTITY;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  const mark = createIcon('brand', 'md');
  const wordmark = element('span', { className: 'brand__wordmark', text: t(BRAND_MESSAGE_KEY.wordmark) });
  const stage = element('span', { className: 'brand__stage', text: t(BRAND_MESSAGE_KEY.stage) });
  const build = element('span', {
    className: 'brand__build',
    text: t(BRAND_MESSAGE_KEY.build, { version: identity.version, commit: identity.commit }),
  });

  // The three visible fragments are hidden from the accessibility tree and the
  // row carries one sentence instead. "PRE-ALPHA", "v0.0.7" and a bare hex
  // string read out in sequence are close to meaningless; the sentence names
  // what each is. Every fragment stays on screen -- this replaces nothing
  // visible.
  // `createIcon` already sets `aria-hidden` on every glyph it builds, so the
  // mark is not in this loop.
  for (const fragment of [wordmark, stage, build]) fragment.setAttribute('aria-hidden', 'true');

  const root = element('div', {
    className: 'brand',
    attributes: {
      // `role="note"` rather than `status` or `region`: it is a standing
      // annotation on the page, not something that updates (`status` would
      // make a screen reader announce it as a change) and not a navigable
      // landmark (a two-word constant does not deserve a stop in the landmark
      // list).
      role: 'note',
      'aria-label': t(BRAND_MESSAGE_KEY.region),
    },
    dataset: {
      // Read by `tests/browser/app-shell.spec.ts`, and useful in a screenshot
      // attached to a bug report: the whole identity in one attribute, in the
      // same spelling that reaches `SaveEnvelope.gameVersion` and the worker
      // handshake, so three places cannot drift apart unnoticed.
      buildId: identity.id,
    },
    children: [
      mark,
      wordmark,
      stage,
      build,
      screenReaderText(
        t(BRAND_MESSAGE_KEY.description, {
          stage: t(BRAND_MESSAGE_KEY.stage),
          version: identity.version,
          commit: identity.commit,
        }),
      ),
    ],
  });

  return { element: root };
}
