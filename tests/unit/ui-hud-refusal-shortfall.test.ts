import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { judgeAffordability, pressAffordabilityVerdict } from '../../src/ui/affordability';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';

/**
 * **The sentence a refused Buy or Hire press shows, pinned to the owner's own
 * words.**
 *
 * Issue [#772](https://github.com/matmaxalez/lockstate/issues/772) split itself
 * in two and said so: *"the cheap, obviously-correct half is to use the number
 * that already exists"*, and *"the half that is a decision, and so is not an
 * agent's to take: what the control says"*. PR #799 shipped the first half on
 * the Buy button and PR #807 shipped it on Hire; both left the wording alone
 * and recorded why -- `AGENTS.md`'s fourth exclusion reserves a player-facing
 * sentence to the owner.
 *
 * The owner ruled on **2026-09-03**, choosing between four candidate wordings
 * put to them as a clickable decision:
 *
 * > **"Not enough money — you need {amount} more."**
 *
 * This file is why that sentence cannot drift. It is the mechanism the locale
 * file's own rule names for two keys that must stay identical -- *"what keeps
 * identical text identical is a test, not a shared key"* -- and the em dash is
 * asserted by codepoint, because an editor that helpfully replaced it with a
 * hyphen would change the owner's sentence and nothing else here would notice.
 */

/**
 * The owner's string, written out once.
 *
 * Not read out of the catalogue and compared to itself: a fixture that took its
 * expected value from the code under test would hold for any sentence at all
 * (`docs/TESTING.md`). This is the ruling, transcribed.
 */
const OWNER_SENTENCE = 'Not enough money — you need {amount} more.';

const SHORTFALL_KEYS = [HUD_MESSAGE_KEY.buildBuyShortfall, HUD_MESSAGE_KEY.securityStaffHireShortfall] as const;

function localizer(): Localizer {
  return new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
}

describe("the refusal shortfall sentence is the owner's, on both controls that spend money", () => {
  it('carries the ruling of 2026-09-03 verbatim, em dash and all', () => {
    const messages = defaultMessageCatalogEn.messages as Record<string, unknown>;
    for (const key of SHORTFALL_KEYS) {
      expect(messages[key], `${key} is not the owner's sentence`).toBe(OWNER_SENTENCE);
    }
    // The em dash is U+2014 and is *the owner's*, so it is asserted as a
    // codepoint rather than left to a byte comparison against a literal that a
    // tool could rewrite in this file too.
    expect([...OWNER_SENTENCE].filter((character) => character.codePointAt(0)! > 0x7f)).toEqual(['—']);
  });

  it('is one sentence and two call sites, and the two cannot drift apart', () => {
    /*
     * Two keys rather than one, on the locale file's own standing rule: *"a key
     * here is a call site and never a string pool"*, with `hud.build.step-up` /
     * `hud.rooms.step-up` as the precedent. The rule's cost is that two entries
     * can be edited independently, and this is the assertion that stops it --
     * the owner ruled **one** sentence, so a player who meets it on the Build
     * panel and again on the Security tab must meet the same words.
     */
    expect(messagesOf(SHORTFALL_KEYS[0])).toBe(messagesOf(SHORTFALL_KEYS[1]));
  });

  it('renders the shortfall into it, with the money formatter every other figure uses', () => {
    /*
     * The figure is the **shortfall**, not the charge and not the balance, and
     * the case is chosen so that the three are three different numbers: 2,000
     * against a balance of 100 at the mature `'deliveries'` rung leaves 1,350
     * of room, so the player is 650 short.
     *
     * `formatNumber` is the same call `paintBuyTotal` and `paintHire` make --
     * there is no second formatter -- and it is what puts the separator in
     * `1,650` below, which is the half of "formatted like every other money
     * figure" that a bare template would lose.
     */
    const t = localizer();
    const verdict = judgeAffordability(2_000, 100);
    expect(verdict.shortfallMinorUnits).toBe(650);
    for (const key of SHORTFALL_KEYS) {
      expect(t.format(key, { amount: t.formatNumber(verdict.shortfallMinorUnits) })).toBe(
        'Not enough money — you need 650 more.',
      );
    }

    // A four-figure shortfall, so the thousands separator is asserted rather
    // than assumed: 3,000 against a balance of 100 is 1,650 short.
    const thousands = judgeAffordability(3_000, 100);
    expect(thousands.shortfallMinorUnits).toBe(1_650);
    expect(t.format(SHORTFALL_KEYS[0], { amount: t.formatNumber(thousands.shortfallMinorUnits) })).toBe(
      'Not enough money — you need 1,650 more.',
    );
  });

  it('leaves no placeholder on screen, which is what an unfilled parameter looks like', () => {
    const missing: string[] = [];
    const reporting = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      onMissingKey: (report) => missing.push(`${report.kind}:${report.key}`),
    });
    for (const key of SHORTFALL_KEYS) {
      const text = reporting.format(key, { amount: '650' });
      expect(text, `${key} left a template on screen`).not.toContain('{');
      expect(text, `${key} left a template on screen`).not.toContain('}');
    }
    expect(missing, 'the sentence declares a parameter the panels do not pass').toEqual([]);
  });

  it('is drawn on exactly the verdicts the panels draw it on', () => {
    /*
     * Both panels condition the line on `verdict.refusal === 'past-the-floor'`
     * rather than on `verdict.refused`, because *"Not enough money"* is false
     * about a malformed charge -- and `shortfallMinorUnits` is `0` there, so a
     * panel that used the figure as its condition would agree. This pins the
     * two conditions to each other through the composed function the panels
     * actually call, at the fresh and mature rungs both.
     */
    for (const fresh of [false, true]) {
      for (const balance of [-1_250, -1_185, -1_000, 0, 100, 25_000]) {
        for (const charge of [0, 1, 65, 2_000, 26_250, 26_251]) {
          const verdict = pressAffordabilityVerdict(charge, balance, fresh);
          expect(
            verdict.shortfallMinorUnits > 0,
            `charge ${String(charge)} against ${String(balance)} (fresh: ${String(fresh)})`,
          ).toBe(verdict.refusal === 'past-the-floor');
        }
      }
    }
  });
});

/** The raw catalogue entry, so the two keys are compared as authored text rather than as rendered output. */
function messagesOf(key: string): unknown {
  return (defaultMessageCatalogEn.messages as Record<string, unknown>)[key];
}
