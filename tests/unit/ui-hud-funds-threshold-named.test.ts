import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';

/**
 * **A tooltip is not a hiding place**, gated.
 *
 * ## The ruling this file exists to hold
 *
 * The `FUNDS` chip's badge counts down to a threshold. The owner first chose to
 * put the threshold's *name* into the badge itself --
 * `{remaining} left before deliveries stop` -- and then reversed that choice on
 * 2026-09-01 after `tests/browser/ui-overdraft-badge.spec.ts` measured what it
 * costs: **+133px of chip**, which pushes the FUNDS chip (eighth of nine, on a
 * row whose scrollbar `hud.css` suppresses) off the visible edge at 1280x800 for
 * the whole four-digit range of the remainder. The ruling, in its own terms:
 * *"the chip keeps the short wording, because it fits; the name of the
 * threshold is said elsewhere, where there is room for a full sentence -- in
 * the hover tooltip on the chip, and in the alert. Nothing is to disappear from
 * the screen."*
 *
 * ## Why the second half needs a gate of its own
 *
 * The owner's standing design directive is *"the game must be easy and friendly
 * to play -- no hidden functionality"*. A hover tooltip is unreachable on touch
 * and unseen by a player who never hovers, so a threshold named **only** there
 * has been hidden rather than moved. That is why the ruling names two places,
 * and why this file fails when either one stops naming it: the tooltip alone is
 * not compliance, and neither is the alert alone.
 *
 * ## What is asserted, and what deliberately is not
 *
 * Asserted: that the word for what stops appears in the chip's two description
 * sentences and in the four refusal sentences a player meets when it has
 * stopped, and that the badge does **not** carry it. Not asserted: any of the
 * six sentences verbatim. Pinning the prose would make this file a copy of the
 * catalogue rather than a check on it, and the copy is the owner's
 * (`AGENTS.md`'s fourth exclusion). What is pinned is the property the ruling
 * is about -- *said in full somewhere a player will actually meet it* -- which
 * survives a rewrite of any of the six.
 *
 * The **width** half of the ruling is not gated here and cannot be: a character
 * count is a derivation and the thing that failed was a measurement.
 * `tests/browser/ui-overdraft-badge.spec.ts` measures the badge and the chip
 * carrying it at 1280x720, 1280x800, 1440x900 and 1920x1080, at both ends of
 * the remainder range, and refuses a wording that leaves the row.
 */

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

/** What stops at this rung, in the word a player reads. */
const WHAT_STOPS = /deliver/i;

/**
 * The two sentences the chip carries on its `title` and in its screen-reader
 * text -- `overdraftDescription` in `src/ui/hud/projection.ts` chooses between
 * them on the same boundary `overdraftTone` chooses amber from red on.
 */
const CHIP_DESCRIPTION_KEYS = [
  HUD_MESSAGE_KEY.fundsBeforeDeliveriesStop,
  HUD_MESSAGE_KEY.fundsDeliveriesStopped,
] as const;

/**
 * Every sentence a player meets when the rung has actually refused them, on
 * both sides of `sender.submit`.
 *
 * Four rather than one because a refusal at this rung is decided by the host's
 * pre-flight (`judgeAffordability`) *or* by the worker's treasury, and the
 * owner's ruling 23 of 2026-08-31 -- *"Te same slowa co host"* -- requires the
 * pair to read identically. Listing all four here means a rewrite that fixes
 * the wording in one place and forgets the other is caught by this file as well
 * as by `tests/unit/ui-simulation-alerts.test.ts`.
 */
const DELIVERY_REFUSAL_KEYS = [
  'hud.alert.refusal.purchase.insufficient-funds',
  'hud.refusal.purchase-materials-past-floor',
  'hud.alert.refusal.construction.materials-unfunded',
  'hud.refusal.hire-staff-past-floor',
] as const;

describe('the deliveries rung is named where a player will meet it (the ruling of 2026-09-01)', () => {
  it('says it on the chip, in a full sentence rather than a fragment', () => {
    for (const key of CHIP_DESCRIPTION_KEYS) {
      const sentence = localizer.format(key, { remaining: '1,249' });
      expect(sentence, `${key} does not say what stops`).toMatch(WHAT_STOPS);
      /*
       * A full sentence, because that is what the ruling bought by moving the
       * text off the badge: the badge had room for a fragment and this has room
       * for prose. Ends in a stop and is longer than the badge it explains --
       * the two cheapest checks that somebody has not quietly pasted the badge's
       * own three words in here and called the rung named.
       */
      expect(sentence.endsWith('.'), `${key} is not a sentence`).toBe(true);
      expect(sentence.length, `${key} is no longer than the badge it explains`).toBeGreaterThan(
        localizer.format(HUD_MESSAGE_KEY.fundsRemaining, { remaining: '1,249' }).length,
      );
    }
  });

  it('says it again in the refusals, so a player who never hovers still meets it', () => {
    /*
     * This is the assertion the standing directive against hidden functionality
     * is actually made of. Hover is not available on touch and is not
     * discovered by everyone who has it; the refusal sentence is unavoidable,
     * because the player pressed something to get it.
     */
    for (const key of DELIVERY_REFUSAL_KEYS) {
      const sentence = defaultMessageCatalogEn.messages[key];
      expect(sentence, `${key} is not in the default catalogue`).toBeTypeOf('string');
      expect(String(sentence), `${key} does not say what has stopped`).toMatch(/deliver|hiring|build queue/i);
      expect(String(sentence), `${key} does not say what would lift it`).toMatch(/until the state pays what it owes/);
    }
    /*
     * And the one that is about deliveries names them, rather than the whole
     * set passing on the `hiring` alternative above. Two of the four are the
     * host/worker pair for a Buy press and both must say it.
     */
    for (const key of ['hud.alert.refusal.purchase.insufficient-funds', 'hud.refusal.purchase-materials-past-floor']) {
      expect(String(defaultMessageCatalogEn.messages[key]), key).toMatch(WHAT_STOPS);
    }
  });

  it('does not say it on the badge, which has no room for it', () => {
    /*
     * The reversal, held. `{remaining} left before deliveries stop` was
     * measured and does not fit; a later pass that "improves" the badge by
     * naming the rung on it would undo the ruling silently, because nothing
     * about the resulting screen looks broken -- the chip simply is not there
     * any more at 1280.
     *
     * The failure message carries the number, because the next person to read
     * it will be the person about to make this change.
     */
    expect(
      localizer.format(HUD_MESSAGE_KEY.fundsRemaining, { remaining: '1,249' }),
      'the badge names the rung again: measured at +133px of chip, which puts the FUNDS chip off the row at 1280 -- see tests/browser/ui-overdraft-badge.spec.ts',
    ).not.toMatch(WHAT_STOPS);
  });
});
