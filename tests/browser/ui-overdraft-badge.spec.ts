import type { HudCountsViewModel } from '../../src/ui/hud';
import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS } from '../../src/simulation/economy';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * *"{remaining} left"* on the FUNDS chip, in a real browser -- the owner's
 * ruling 18 of 2026-08-31, re-based onto the deliveries rung by the owner's
 * ruling of 2026-09-01.
 *
 * **Every figure below moved on 2026-09-01 and none of the reasoning did.**
 * The badge stated `balance - overdraftFloor`, the room to -2,500; ruling 19
 * had given ADR 0017 decision 8's rungs three thresholds inside that overdraft,
 * so between -1,250 and -2,500 the number was room no press could spend. It now
 * states the room to the `'deliveries'` rung -- the same
 * `HOST_PRESS_FLOOR_MINOR_UNITS` `judgeAffordability` refuses a press against.
 *
 * ## What this covers that `pnpm test` cannot
 *
 * The decision is pure and is proven headlessly in
 * `tests/unit/ui-hud-projection.test.ts`: when the badge exists, which tone it
 * takes, and the arithmetic of `{remaining}` at the floor and past it. What
 * that cannot reach is **the rendered number**. `vitest.config.ts` is
 * `environment: 'node'` with no jsdom, so `status-strip.ts` is unreachable
 * there -- and the whole point of `HudMetricBadge.numberParameters` is that
 * this figure goes through the strip's own `Intl` formatter rather than
 * `String()`. `2,400 left` and `2400 left` are indistinguishable to every unit
 * test in this repository and different on screen, beside a chip that writes
 * its own number the first way.
 *
 * It is also where the geometry is settled, for
 * `ui-prisoners-without-bed.spec.ts`'s reason: `.hud-strip__metrics` is
 * `overflow-x: auto` with the scrollbar suppressed, so a badge that does not
 * fit is present in the DOM and visible to nobody, which #629 says does not
 * count. The FUNDS chip is eighth of nine, which is the worst place on the row
 * to be when the row is short.
 *
 * ## Why the harness page
 *
 * A prison at -2,480 is hours of play away from anything the assembled page can
 * be driven into in a test, and `setHudViewModel` is the only lever that
 * reaches it. What the harness cannot answer is the *refusal* half of ruling 18
 * -- `hud.refusal.purchase-materials-past-floor` is raised by `src/main.ts`, so
 * it needs the assembled page and a real session that has spent its facility.
 * That assertion belongs in `tests/browser/app-shell.spec.ts` beside the
 * existing negative-balance cases and is deliberately not attempted here.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * A populated prison, so the row is the width a player really sees: a strip
 * whose other eight chips read zero is a narrower strip than any of them.
 * Only the treasury moves between cases.
 */
function counts(treasuryMinorUnits: number, floor = TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS): HudCountsViewModel {
  return {
    prisoners: 42,
    prisonerCapacity: 48,
    occupiedPlaces: 42,
    staff: 11,
    staffUnassigned: 0,
    rooms: 23,
    prisonersCovered: 42,
    prisonersUnderstaffed: 0,
    prisonersUnguarded: 0,
    prisonersHighRisk: 6,
    activeIncidents: 0,
    contrabandFound: 3,
    treasuryMinorUnits,
    treasuryOverdraftFloorMinorUnits: floor,
    stateIncomeAccruedTodayMinorUnits: 10_667,
  };
}

interface ChipReading {
  /** `null` when the strip drew no badge on the FUNDS chip at all. */
  readonly badgeText: string | null;
  readonly badgeTone: string | null;
  readonly chipTone: string | null;
  readonly chipValue: string | null;
  /** Whether the badge's box lies inside the metrics row's own visible box. */
  readonly badgeOnScreen: boolean | null;
  readonly chipOnScreen: boolean;
  /** The chip's `title` attribute -- the tooltip a hover reads. */
  readonly chipTitle: string | null;
}

async function show(page: Page, next: HudCountsViewModel): Promise<ChipReading> {
  await page.evaluate(
    (model) =>
      window.lockstateUiHarness.setHudViewModel({
        counts: model,
        clock: { day: 9, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
        alerts: [],
      }),
    next,
  );

  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.ui-stat[data-metric="funds"]');
    const row = document.querySelector<HTMLElement>('.hud-strip__metrics');
    if (chip === null || row === null) throw new Error('no FUNDS chip in the mounted HUD');
    const badge = chip.querySelector<HTMLElement>('.ui-badge');
    const rowBox = row.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const box = badge?.getBoundingClientRect();
    return {
      badgeText: badge?.textContent?.trim() ?? null,
      badgeTone: badge?.dataset['tone'] ?? null,
      chipTone: chip.dataset['tone'] ?? null,
      chipValue: chip.querySelector<HTMLElement>('.ui-stat__value')?.textContent ?? null,
      badgeOnScreen: box === undefined ? null : box.left >= rowBox.left - 0.5 && box.right <= rowBox.right + 0.5,
      chipOnScreen: chipBox.left >= rowBox.left - 0.5 && chipBox.right <= rowBox.right + 0.5,
      chipTitle: chip.getAttribute('title'),
    };
  });
}

test.describe('the FUNDS chip says how much of the overdraft is left (ruling 18)', () => {
  // The binding viewport, as every layout decision in this repository is
  // argued against.
  test.use({ viewport: { width: 900, height: 600 } });

  test('renders the remainder the way it renders the balance, and only while the balance is negative', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    /*
     * **The grouping, which is the whole reason this file is a browser test.**
     * A balance of -100 leaves 2,400 of the facility, and the chip above the
     * badge writes its own number with a separator. A badge reading `2400 left`
     * there would be the strip contradicting itself about how it writes a
     * number -- and it is exactly what `String(2400)` produces, which is what
     * the badge did before `numberParameters` existed.
     */
    const shallow = await show(page, counts(-100));
    // 1,150 and not 2,400: the room to -1,250, not to the floor. Still four
    // digits, which is what this assertion is actually for.
    expect(shallow.badgeText, 'the remainder is formatted, not stringified').toBe('1,150 left');
    expect(shallow.chipValue, 'and the chip above it is formatted the same way').toBe('-100');
    expect(shallow.badgeTone).toBe('warning');
    expect(shallow.chipTone, 'the chip and its badge state one severity').toBe('warning');
    /*
     * **The #629 check, and it asserts the opposite of what it was written to
     * assert, because 900x600 is where the strip has never had room.**
     *
     * The first draft required the badge to be on screen here and CI refused
     * it. That was the test being wrong about the world rather than the badge
     * being wrong: at 900x600 the metrics row shows **1 of 9 chips**
     * (measured 2026-08-31, `hud.css`'s two-row block and issue #719), and
     * `funds` is the eighth. It has been off the edge at this width since long
     * before ruling 18 put a badge on it.
     *
     * So this pins both halves of the truth. The badge is *built* correctly at
     * this viewport -- its text and tone are asserted above and they pass --
     * and it is **unreachable**, which is #719's subject and not this
     * ruling's.
     *
     * **The on-screen half of #629 is therefore still owed, and is not
     * asserted anywhere yet.** It needs a width where the FUNDS chip survives
     * the row, and #719 is precisely the open question of whether any width
     * below 1920 does once every badge is drawn -- this ruling's badge being
     * one more of them. Writing that assertion before measuring it would be
     * guessing at the answer to #719.
     */
    /*
     * #719 changes the premise above: FUNDS now has first display priority.
     * At 900x600 its badge and the chip carrying it must both be visible.
     */
    expect(shallow.badgeOnScreen, 'the overdraft badge is visible at 900x600 after #719').toBe(true);
    expect(shallow.chipOnScreen, 'the FUNDS chip carrying it is visible too').toBe(true);

    /*
     * The worked example. **`counts(-2_480)` until the re-basing**, where the
     * same twenty was the room to the floor; -1,230 is where twenty of room
     * lives now, and it is `judgeAffordability`'s own probe
     * (`tests/unit/ui-affordability.test.ts`), so the badge and the pre-flight
     * are read against one number.
     */
    expect((await show(page, counts(-1_230))).badgeText).toBe('20 left');

    /*
     * **And the position the 2026-09-01 ruling was argued from**, in a real
     * browser: a prison at -1,300 has had a delivery and a hire refused
     * already. It read `1,200 left` in amber and reads nothing left, in red.
     */
    const pastTheRung = await show(page, counts(-1_300));
    expect(pastTheRung.badgeText).toBe('0 left');
    expect(pastTheRung.badgeTone).toBe('danger');
    expect(pastTheRung.chipTone).toBe('danger');
    expect(pastTheRung.chipTitle, 'danger reads the deliveries-stopped sentence').toMatch(/deliver/i);

    /*
     * **At the floor: `0 left`, a third tone, and now a third sentence**
     * (issue #768's ruling, closed on 2026-09-01). Still `0 left` -- the
     * remainder cannot go negative however deep the balance goes, and that
     * number is unchanged by this ruling on purpose: it states room against
     * the deliveries rung, which is nothing at and below that rung alike, in
     * both bands. What changed is the *words*: `overdraftDescription` used to
     * fall back to the same `fundsDeliveriesStopped` sentence `danger` reads,
     * and now asks `atTreasuryFloor` directly, on the same boundary the tone
     * itself is painted on, so a colour-blind player or a screen reader hears
     * the floor named as its own state rather than reusing "deliveries have
     * stopped".
     */
    const stuck = await show(page, counts(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS));
    expect(stuck.badgeText).toBe('0 left');
    expect(stuck.badgeTone).toBe('critical');
    expect(stuck.chipTone).toBe('critical');
    expect(stuck.chipTitle, 'critical no longer reads the danger sentence').not.toBe(pastTheRung.chipTitle);
    /*
     * **Pinned on the property, not on the vocabulary.** This assertion read
     * `toMatch(/exhaust/i)` until the copy pass this commit belongs to, and
     * that is the same defect the pass was written to remove: the sentence it
     * matched said the state owed money it did not owe, and a gate that
     * requires a word fails whoever fixes the sentence carrying it. The word
     * moved -- `The treasury is exhausted` became `The treasury is at its
     * floor` -- and the *property* the comment above argues for did not.
     *
     * So the floor sentence must name the floor as its own state, must say
     * that spending has stopped altogether rather than only deliveries, and
     * must not promise a payment: under `AGENTS.md` reservation 4 as the owner
     * released it on 2026-09-04 the choice of words is ours and the
     * requirement that the sentence be true is not.
     */
    expect(stuck.chipTitle, 'names the floor as its own state').toMatch(/floor/i);
    expect(stuck.chipTitle, 'and says spending has stopped altogether, not just deliveries').toMatch(
      /nothing can be spent/i,
    );
    expect(stuck.chipTitle, 'and promises no payment the state does not owe').not.toMatch(/owes|owed/i);
    // #719 gives FUNDS first display priority at this viewport regardless of
    // the overdraft tone, so the floor warning stays visible too.
    expect(stuck.badgeOnScreen, 'the treasury-floor badge remains visible at 900x600').toBe(true);

    // And solvent is exactly what it was: no badge, no tone, nothing added to
    // the row a player spends the game looking at.
    const solvent = await show(page, counts(25_000));
    expect(solvent.badgeText).toBeNull();
    expect(solvent.chipTone).toBeNull();
    expect(solvent.chipValue).toBe('25,000');
  });

  test('says nothing about a facility the worker did not publish', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    // Every payload written before ruling 18 carries no floor, and a closed
    // floor says the same thing. Neither may invent a remainder.
    const noFloor = await show(page, counts(-2_480, 0));
    expect(noFloor.badgeText).toBeNull();
    expect(noFloor.chipTone).toBeNull();
    expect(noFloor.chipValue, 'the balance is still on screen, and still negative').toBe('-2,480');
  });
});

/**
 * **How wide the badge is, at the four widths a player might have.**
 *
 * ## The ruling this block measured, and the ruling that followed
 *
 * The owner first chose `{remaining} left before deliveries stop` for this
 * badge, on the condition that the badge be measured, because the research pass
 * that put the candidate up -- *"Copy variants for two rulings"*, 2026-09-01 --
 * recorded in its §2c that **no measurement of this badge's width existed
 * anywhere in this repository**. `hud.css` measures the FUNDS *value* chip;
 * nothing measured the badge under it. This block was that measurement, and the
 * wording did not survive it:
 *
 * | wording | balance | badge | FUNDS chip | row client / scroll @1280 | chips on screen | FUNDS chip visible |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | `{remaining} left` | -1,300 | 46.95px | 125.77px | 1256 / 1262 | 8 of 9 | yes |
 * | `{remaining} left` | -1 | 73.20px | 150.97px | 1256 / 1287 | 8 of 9 | yes |
 * | `{remaining} left before deliveries stop` | -1,300 | 179.94px | 258.75px | 1256 / 1395 | 8 of 9 | yes |
 * | `{remaining} left before deliveries stop` | -1 | 206.19px | 283.95px | 1256 / 1420 | 7 of 9 | **no** |
 *
 * A separate research pass, on a different branch not yet merged here, re-took
 * every one of those figures by a different method (editing the DOM rather
 * than the locale catalogue) on a different tree and reported reproducing them
 * to the hundredth of a pixel -- so this table rests on two independent
 * measurements agreeing rather than one. Not cited by path: that document lives
 * on a branch this one has not merged, and
 * `tests/foundation/documentation-links-contract.test.ts` is right to refuse a
 * citation this tree cannot resolve.
 *
 * **The owner then ruled, reversing their own earlier choice**: *"the chip keeps
 * the short wording, because it fits; the name of the threshold -- that it is
 * deliveries that will stop -- is said elsewhere, where there is room for a full
 * sentence: in the hover tooltip on the chip, and in the alert. Nothing is to
 * disappear from the screen."* So the badge is `{remaining} left`, the sentence
 * is on the chip's `title` and in its screen-reader text
 * (`StatChip.setDescription`), and it is in the refusal alert as well because a
 * hover tooltip is unreachable on touch and unseen by a player who never hovers.
 *
 * ## What this block asserts now
 *
 * Four viewports rather than one. 1280x800 is where the long wording failed;
 * 1280x720, 1440x900 and 1920x1080 are the rest of the desktop range every
 * layout decision in this repository is argued against, and a wording that fits
 * at 1280 and is never checked at 1280x720 is a wording checked at one height.
 * 900x600 is deliberately excluded: the FUNDS chip is off the row's edge there
 * under *every* wording including the incumbent, which is #719 and not this
 * ruling -- the first `describe` in this file pins that state rather than
 * pretending it away.
 *
 * At each viewport, both ends of the remainder range: -1,300 renders the
 * **shortest** number (`0`, and the position the re-basing ruling was argued
 * from) and -1 the **widest** the shipped floor allows (`1,249`). The prison is
 * `ui-strip-badged-width.spec.ts`'s `POPULATED` taken below the deliveries rung,
 * which is the only state that draws this badge at all; its seven-figure
 * treasury cannot be used, because a chip cannot be at seven figures and below
 * zero at once.
 *
 * Asserted: the badge is not clipped or wrapped inside its own chip
 * (`scrollWidth <= clientWidth`, one line box), the FUNDS chip carrying it is
 * **on screen**, and the chip's description sentence is present and **costs the
 * row no width** -- measured by blanking the screen-reader span and re-reading
 * the chip, not by trusting `.ui-sr-only`'s declared `position: absolute`. The
 * last of those is what makes the ruling's arrangement possible at all: if the
 * tooltip channel had a width, moving the sentence off the badge would have
 * bought nothing.
 *
 * Reported and deliberately not asserted: how many chips of the nine are on
 * screen. That is #719's subject, it was already short at 1280 before this badge
 * had any words, and an expectation pinning it here would make the next person's
 * fix fail this file -- the rule `ui-strip-badged-width.spec.ts` states for the
 * same row. The on-screen assertion cannot fire on a #719 fix either, because a
 * fix to #719 puts *more* of the row on screen, never less.
 */
const WIDTHS = [
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/**
 * The two ends of the remainder range, and nothing between them.
 *
 * The badge's width follows its number and the number has four digits at most,
 * so the widest and the narrowest bracket every state the shipped floor can
 * produce. -1,300 is also the position the 2026-09-01 re-basing was argued from
 * and the point where the chip turns red, so the two cases cover both of the
 * chip's tones and both of its description sentences.
 */
const BALANCES = [-1_300, -1] as const;

test.describe('the badge fits, and the sentence it cannot hold costs the row nothing', () => {
  test.use({ viewport: WIDTHS[0] });

  test('keeps the FUNDS chip on screen at every desktop width, at both ends of the remainder', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    const readings: Record<string, BadgeGeometry> = {};
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      for (const balance of BALANCES) {
        const at = `${String(viewport.width)}x${String(viewport.height)}@${String(balance)}`;
        const state = await measure(page, balance);
        readings[at] = state;

        expect(state.badgeText, `${at}: the badge is drawn at all`).not.toBeNull();
        expect(
          state.badgeScrollWidth,
          `${at}: "${String(state.badgeText)}" is clipped inside its own box`,
        ).toBeLessThanOrEqual(state.badgeClientWidth);
        expect(
          state.badgeLines,
          `${at}: "${String(state.badgeText)}" wrapped onto more than one line inside the chip`,
        ).toBe(1);
        // The chip grew to hold it rather than the badge overflowing the chip.
        expect(state.badgeWidth, `${at}: the badge is inside its chip`).toBeLessThanOrEqual(state.chipWidth + 0.5);
        /*
         * And the chip carrying it is reachable. This is the half of "does it
         * fit" that the long wording failed: a badge is only a badge if
         * somebody can see it, and `.hud-strip__metrics` is `overflow-x: auto`
         * with its scrollbar suppressed, so a chip past the right edge is a
         * chip that does not exist for the player.
         */
        expect(
          state.fundsChipOnScreen,
          `${at}: the FUNDS chip is reachable with "${String(state.badgeText)}" on it`,
        ).toBe(true);

        /*
         * **Nothing disappeared from the screen**, which is the sentence the
         * ruling ends on. The threshold's name is on the chip in both channels
         * -- `title` for a pointer, screen-reader text for everyone else -- and
         * it says what the badge has no room to say.
         */
        expect(state.chipTitle, `${at}: the chip has no tooltip`).toMatch(/deliver/i);
        expect(state.chipDescriptionText, `${at}: the tooltip is hover-only`).toBe(state.chipTitle);
        expect(
          String(state.chipTitle).length,
          `${at}: the tooltip says no more than the badge does`,
        ).toBeGreaterThan(String(state.badgeText).length);

        /*
         * **And it costs the row nothing**, measured rather than assumed. The
         * screen-reader span is blanked and the chip re-read: same width to the
         * hundredth of a pixel. If this ever stops holding, the ruling's whole
         * arrangement stops working -- the sentence would be back in the
         * layout, one indirection further away from anybody noticing.
         */
        expect(
          state.chipWidthWithoutDescription,
          `${at}: the chip's sentence has a width, so moving it off the badge bought nothing`,
        ).toBe(state.chipWidth);
      }
    }

    // eslint-disable-next-line no-console -- the measurement is the point of this test.
    console.log(`[funds-badge] ${JSON.stringify(readings, undefined, 2)}`);
  });
});

interface BadgeGeometry {
  readonly badgeText: string | null;
  readonly badgeWidth: number;
  readonly badgeClientWidth: number;
  readonly badgeScrollWidth: number;
  readonly badgeLines: number;
  readonly chipWidth: number;
  readonly rowClientWidth: number;
  readonly rowScrollWidth: number;
  readonly chipsOnScreen: number;
  readonly chipCount: number;
  readonly fundsChipOnScreen: boolean;
  /** The chip's `title` attribute -- the pointer-hover channel. `null` when unset. */
  readonly chipTitle: string | null;
  /** The chip's screen-reader-only description text -- the touch/AT channel. `null` when unset. */
  readonly chipDescriptionText: string | null;
  /**
   * The chip's width with the screen-reader description span blanked, so it
   * can be compared against `chipWidth` (description intact) to prove the
   * sentence costs the row nothing. Equal to `chipWidth` when there is no
   * description to blank.
   */
  readonly chipWidthWithoutDescription: number;
}

/** The FUNDS chip's badge geometry on a populated prison at `treasuryMinorUnits`. */
async function measure(page: Page, treasuryMinorUnits: number): Promise<BadgeGeometry> {
  await page.evaluate(
    (balance) =>
      window.lockstateUiHarness.setHudViewModel({
        counts: {
          prisoners: 178,
          prisonerCapacity: 180,
          occupiedPlaces: 178,
          staff: 27,
          staffUnassigned: 0,
          rooms: 61,
          prisonersCovered: 178,
          prisonersUnderstaffed: 0,
          prisonersUnguarded: 0,
          prisonersHighRisk: 24,
          activeIncidents: 0,
          contrabandFound: 47,
          treasuryMinorUnits: balance,
          treasuryOverdraftFloorMinorUnits: -2_500,
          stateIncomeAccruedTodayMinorUnits: 284_500,
        },
        clock: { day: 17, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
        alerts: [],
      }),
    treasuryMinorUnits,
  );

  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('.hud-strip__metrics');
    const chip = document.querySelector<HTMLElement>('.ui-stat[data-metric="funds"]');
    if (row === null || chip === null) throw new Error('no FUNDS chip in the mounted HUD');
    const badge = chip.querySelector<HTMLElement>('.ui-badge');
    const rowBox = row.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const badgeBox = badge?.getBoundingClientRect();
    /*
     * Line boxes, counted as **distinct tops** rather than as a rect count.
     * A range's `getClientRects()` returns one rect per inline box, and this
     * badge has more than one (the pill's own span beside the text), so a count
     * answers 2 for a badge on a single line -- measured, on `0 left`. Distinct
     * `top` values answer the question actually being asked, and it needs no
     * `line-height` copied out of `hud.css`.
     */
    const range = document.createRange();
    if (badge !== null) range.selectNodeContents(badge);
    const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    const chips = [...row.querySelectorAll<HTMLElement>('[data-metric]')];
    const onScreen = (box: DOMRect): boolean => box.left >= rowBox.left - 0.5 && box.right <= rowBox.right + 0.5;

    /*
     * The screen-reader span is `.ui-sr-only`, always the chip's last child
     * (`createStatChip`'s comment: "Last child, always"). Blanking its text
     * and re-reading the chip's width, then restoring it, is how "costs the
     * row no width" is measured rather than assumed -- trusting
     * `.ui-sr-only`'s declared `position: absolute` would not catch a rule
     * that stopped applying.
     */
    const description = chip.querySelector<HTMLElement>('.ui-sr-only');
    const descriptionText = description?.textContent ?? null;
    let chipWidthWithoutDescription = Math.round(chipBox.width * 100) / 100;
    if (description !== null && descriptionText !== null && descriptionText !== '') {
      description.textContent = '';
      chipWidthWithoutDescription = Math.round(chip.getBoundingClientRect().width * 100) / 100;
      description.textContent = descriptionText;
    }

    return {
      badgeText: badge?.textContent?.trim() ?? null,
      badgeWidth: Math.round((badgeBox?.width ?? 0) * 100) / 100,
      badgeClientWidth: badge?.clientWidth ?? 0,
      badgeScrollWidth: badge?.scrollWidth ?? 0,
      badgeLines: badge === null ? 0 : tops.size,
      chipWidth: Math.round(chipBox.width * 100) / 100,
      rowClientWidth: row.clientWidth,
      rowScrollWidth: row.scrollWidth,
      chipsOnScreen: chips.filter((entry) => onScreen(entry.getBoundingClientRect())).length,
      chipCount: chips.length,
      fundsChipOnScreen: onScreen(chipBox),
      chipTitle: chip.getAttribute('title'),
      chipDescriptionText: descriptionText === '' ? null : descriptionText,
      chipWidthWithoutDescription,
    };
  });
}
