import { expect, type Page, test } from '@playwright/test';
import {
  buildAndPopulate,
  buy,
  calibrate,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  runUntilTick,
  tab,
} from './playtest-harness';

/**
 * **Playing the third FUNDS tone (issue #768) through all three bands, for a
 * fresh prison and a furnished one -- with the mouse, on the merged branch.**
 *
 * Not a gate: nothing in CI collects `.playtest.ts`, only
 * `tests/browser/playwright.playtest.config.ts` does, and that is run by
 * hand:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5321 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-768-three-tone-bands.playtest.ts -g "fresh" --reporter=line
 * ```
 *
 * Every step narrates its reading of the FUNDS chip -- colour (`data-tone`),
 * number (the badge text) and sentence (the chip's `title`, which is what
 * `overdraftDescription` writes) -- to stdout, so the transcript is the
 * evidence rather than an assertion pass/fail summary.
 */

async function fundsChip(page: Page): Promise<{
  readonly value: string | null;
  readonly tone: string | null;
  readonly badgeText: string | null;
  readonly title: string | null;
}> {
  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.hud-strip__metrics [data-metric="funds"]');
    if (chip === null) return { value: null, tone: null, badgeText: null, title: null };
    const badge = chip.querySelector<HTMLElement>('.ui-badge');
    return {
      value: chip.querySelector<HTMLElement>('.ui-stat__value')?.textContent ?? null,
      tone: chip.dataset['tone'] ?? null,
      badgeText: badge?.textContent ?? null,
      title: chip.getAttribute('title'),
    };
  });
}

async function report(page: Page, label: string): Promise<void> {
  const counts = await latestCounts(page);
  const chip = await fundsChip(page);
  console.log(
    `[${label}] treasury=${String(counts?.treasuryMinorUnits)} roomCapacity=${String(counts?.roomCapacity)} ` +
      `| tone=${String(chip.tone)} | value=${JSON.stringify(chip.value)} | badge=${JSON.stringify(chip.badgeText)} ` +
      `| title=${JSON.stringify(chip.title)}`,
  );
}

test('fresh, unfurnished prison: warning, then danger, then critical, with the starter rung boundary', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  await calibrate(page);

  await report(page, 'fresh: on arrival');

  // Hire ten guards while still solvent -- each hire deducts an advance of
  // one day's wage, so this alone moves the balance without a Buy press and
  // sets up the daily wage bill that will drain the treasury past the
  // deliveries rung once the clock runs, which a Buy press cannot do (a
  // press is refused at the rung; a payday is not).
  await tab(page, 'manage').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let i = 0; i < 10; i += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1000);
  await report(page, 'fresh: after hiring 10 guards');

  // `buy` assumes the Build tab is already open -- it does not switch there
  // itself, unlike `tab(...)`. Switch back after hiring on the Security tab.
  await tab(page, 'build').click();

  // Buy bricks in two steps to land inside the warning band first (well
  // above the starter rung, -1,185), then cross it into danger.
  await buy(page, 'wall-brick', 500); // 20,000 of bricks
  await page.waitForTimeout(800);
  await report(page, 'fresh: warning band (after 500 bricks)');

  await buy(page, 'wall-brick', 150); // another 6,000: past -1,185 if room allows
  await page.waitForTimeout(800);
  await report(page, 'fresh: after a further 150 bricks (probing the rung)');

  // Whatever room is left, spend it: keep buying single bricks until the
  // press is refused, which lands exactly on or above the starter rung.
  for (let i = 0; i < 40; i += 1) {
    const before = await latestCounts(page);
    await buy(page, 'wall-brick', 1);
    await page.waitForTimeout(150);
    const after = await latestCounts(page);
    if (after?.treasuryMinorUnits === before?.treasuryMinorUnits) break;
  }
  await page.waitForTimeout(500);
  await report(page, 'fresh: danger band (deliveries rung reached by press)');

  // Now run the clock: the wage bill for ten guards drains the balance past
  // the rung and toward the treasury floor, which no press can do.
  await fastForwardToMax(page);
  const start = await latestCounts(page);
  for (let day = 1; day <= 8; day += 1) {
    await runUntilTick(page, (start?.tick ?? 0) + day * 2_600, 240_000);
    await page.waitForTimeout(500);
    await report(page, `fresh: day +${day} of automatic wage drain`);
  }
});

test('furnished prison: the same walk, with the mature rung', async ({ page }) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await buildAndPopulate(page, { beds: 1, admits: 0, guards: 10, label: 'furnished' });
  await tab(page, 'build').click();
  await report(page, 'furnished: after build + hires');

  for (let i = 0; i < 60; i += 1) {
    const before = await latestCounts(page);
    await buy(page, 'wall-brick', 5);
    await page.waitForTimeout(150);
    const after = await latestCounts(page);
    if (after?.treasuryMinorUnits === before?.treasuryMinorUnits) break;
  }
  await page.waitForTimeout(500);
  await report(page, 'furnished: danger band (mature deliveries rung reached by press)');

  await fastForwardToMax(page);
  const start = await latestCounts(page);
  for (let day = 1; day <= 8; day += 1) {
    await runUntilTick(page, (start?.tick ?? 0) + day * 2_600, 240_000);
    await page.waitForTimeout(500);
    await report(page, `furnished: day +${day} of automatic wage drain`);
  }
});
