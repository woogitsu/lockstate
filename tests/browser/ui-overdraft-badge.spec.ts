import type { HudCountsViewModel } from '../../src/ui/hud';
import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS } from '../../src/simulation/economy';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * *"{remaining} left"* on the FUNDS chip, in a real browser -- the owner's
 * ruling 18 of 2026-08-31.
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
    expect(shallow.badgeText, 'the remainder is formatted, not stringified').toBe('2,400 left');
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

    // The owner's own worked example.
    expect((await show(page, counts(-2_480))).badgeText).toBe('20 left');

    /*
     * **At the floor: `0 left`, and red.** The prison can spend nothing until
     * the state pays it, which is the rung where the cheapest available action
     * stops changing the outcome -- `coverageTone`'s distinction, applied to
     * money. A `-0` or a negative here would be the one number on this strip
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
