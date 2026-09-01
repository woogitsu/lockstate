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
    expect(shallow.badgeOnScreen, 'still off the edge at 900x600 -- see #719').toBe(false);
    expect(shallow.chipOnScreen, 'and so is the chip carrying it').toBe(false);

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

    /*
     * **At the floor: `0 left`, and red.** Still true a rung further down, and
     * still clamped: the remainder cannot go negative however deep the balance
     * goes. A `-0` or a negative here would be the one number on this strip
     * that a player would believe and act on.
     */
    const stuck = await show(page, counts(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS));
    expect(stuck.badgeText).toBe('0 left');
    expect(stuck.badgeTone).toBe('danger');
    expect(stuck.chipTone).toBe('danger');
    // Off the edge for the same reason as the shallow case above, and for a
    // reason that has nothing to do with the tone: at 900x600 the FUNDS chip
    // is the eighth of nine on a row that shows one. See #719.
    expect(stuck.badgeOnScreen, 'still off the edge at 900x600 -- see #719').toBe(false);

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
 * **How wide the badge is, at the width the strip's defect lives at.**
 *
 * The owner's ruling of 2026-09-01 gives this badge words that name what the
 * number protects -- `{remaining} left before deliveries stop` -- and the
 * research pass that put the candidate up -- *"Copy variants for two rulings"*,
 * 2026-09-01, on the `docs/copy-variants-for-the-owner` branch -- recorded in
 * its §2c that **no measurement of this badge's width existed anywhere in this
 * repository**.
 * `hud.css:2865` measures the FUNDS *value* chip; nothing measured the badge
 * under it. That absence is why the wording was not to ship unmeasured, and
 * this block is the measurement.
 *
 * 1280x800 because that is the viewport `ui-strip-badged-width.spec.ts` calls
 * "the width the defect lives at and the commonest laptop", and because the
 * FUNDS chip is eighth of nine on a row that is `overflow-x: auto` with the
 * scrollbar suppressed -- so a badge that does not fit is present in the DOM
 * and visible to nobody, which #629 says does not count.
 *
 * The prison is `ui-strip-badged-width.spec.ts`'s `POPULATED` with the treasury
 * taken below the deliveries rung, which is the only way this badge draws at
 * all. Its seven-figure treasury cannot be used: a chip cannot be at seven
 * figures and below zero at once, and that is exactly why that file leaves this
 * state to this one.
 *
 * ## The numbers, and the ruling they were taken for
 *
 * Selector `.ui-stat[data-metric="funds"] .ui-badge`, harness page, the
 * populated prison below, treasury floor -2,500. Two balances, because the
 * badge's width follows its number: -1,300 is where the ruling was argued from
 * and renders the **shortest** remainder (`0`), and -1 renders the **widest**
 * the shipped floor allows (`1,249`).
 *
 * | wording | balance | badge | FUNDS chip | row client / scroll @1280 | chips on screen | FUNDS chip visible |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | `{remaining} left` | -1,300 | 46.95px | 125.77px | 1256 / 1262 | 8 of 9 | yes |
 * | `{remaining} left` | -1 | 73.20px | 150.97px | 1256 / 1287 | 8 of 9 | yes |
 * | `{remaining} left before deliveries stop` | -1,300 | 179.94px | 258.75px | 1256 / 1395 | 8 of 9 | yes |
 * | `{remaining} left before deliveries stop` | -1 | 206.19px | 283.95px | 1256 / 1420 | 7 of 9 | **no** |
 *
 * At 1440x800 the long wording survives at -1,300 (9 of 9, no overflow) and at
 * -1 (8 of 9, chip still visible), and fails in the every-badge state (7 of 9,
 * chip off). At 1920x800 it fits in every state measured.
 *
 * **The verdict, which is the owner's to act on.** The long wording never wraps
 * and is never clipped -- it is one legible line at every width measured, so
 * the objection is not legibility. It costs **+133px** of chip, and at 1280x800
 * that is enough to push the FUNDS chip itself past the right edge of
 * `.hud-strip__metrics` for the whole four-digit range of the remainder, on a
 * container whose scrollbar `hud.css` suppresses: present in the DOM and
 * visible to nobody, which #629 says does not count. The incumbent wording
 * keeps that chip on screen at the same viewport in the same states. So the
 * incumbent ships and the wording goes back to the owner with these figures
 * beside it, recorded at `src/content/default-locale-en.ts`.
 *
 * ## What is asserted, and what is only reported
 *
 * Asserted: the badge is not clipped or wrapped *inside its own chip*
 * (`scrollWidth <= clientWidth`, one line box), and the FUNDS chip and its
 * badge are both **on screen** at 1280x800 in both states. The second is the
 * gate the long wording fails, which is what makes it a real assertion rather
 * than a restatement of today -- and it cannot fire on somebody's #719 fix,
 * because a fix to #719 puts *more* of the row on screen, never less.
 *
 * Reported and deliberately not asserted: how many chips of the nine are on
 * screen. That is #719's subject, it was already short at this viewport before
 * this badge had any words at all, and an expectation pinning it here would
 * make the next person's fix fail this file -- the rule
 * `ui-strip-badged-width.spec.ts` states for the same row.
 */
test.describe('the badge is legible where the strip is tightest', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('draws the whole sentence on one line inside the FUNDS chip at 1280x800', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    /*
     * A populated prison, below the deliveries rung. -1,300 is the position the
     * ruling was argued from: a delivery and a hire have both been refused, so
     * the badge reads nothing left, which is also its **shortest** number and
     * therefore not the worst case for width. -1 is the widest number this
     * badge can carry at the shipped floor (1,249), and both are measured.
     */
    const reading = await measure(page, -1_300);
    const widest = await measure(page, -1);

    // eslint-disable-next-line no-console -- the measurement is the point of this test.
    console.log(`[funds-badge@1280x800] ${JSON.stringify({ reading, widest }, undefined, 2)}`);

    for (const state of [reading, widest]) {
      expect(state.badgeText, 'the badge is drawn at all').not.toBeNull();
      expect(
        state.badgeScrollWidth,
        `"${String(state.badgeText)}" is clipped inside its own box`,
      ).toBeLessThanOrEqual(state.badgeClientWidth);
      expect(
        state.badgeLines,
        `"${String(state.badgeText)}" wrapped onto more than one line inside the chip`,
      ).toBe(1);
      // The chip grew to hold it rather than the badge overflowing the chip.
      expect(state.badgeWidth, 'the badge is inside its chip').toBeLessThanOrEqual(state.chipWidth + 0.5);
      /*
       * And the chip carrying it is reachable. This is the half of "does it
       * fit" that the long wording failed: a badge is only a badge if somebody
       * can see it, and `.hud-strip__metrics` is `overflow-x: auto` with its
       * scrollbar suppressed, so a chip past the right edge is a chip that does
       * not exist for the player.
       */
      expect(state.fundsChipOnScreen, `the FUNDS chip is reachable with "${String(state.badgeText)}" on it`).toBe(
        true,
      );
    }
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
    };
  });
}
