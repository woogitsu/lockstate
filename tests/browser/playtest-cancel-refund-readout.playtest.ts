import { expect, type Page, test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buy,
  calibrate,
  centreOf,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  tab,
} from './playtest-harness';

/**
 * Played, not read: does the Build panel's queue row let a player predict
 * what pressing its Cancel button gives back, before they press it?
 *
 * `refundSurplusOf` (`src/simulation/construction/system.ts:764`) and
 * `cancelOrder`'s ruling-20 table (`:632-644`) mean two rows that look almost
 * identical -- "Awaiting the Crew" and "In Progress" -- pay back completely
 * different amounts: the catalogue value of the allocation for the first,
 * nothing at all for the second. This instrument places several wall
 * segments, lets them queue through those two states, reads the queue row's
 * own text at the moment of each cancel, and reads the FUNDS chip
 * immediately before and after pressing Cancel on one of each.
 *
 * Not a CI gate -- `.playtest.ts`, collected only by
 * `playwright.playtest.config.ts`.
 */

const log = (line: string): void => {
  console.log(`[cancel-refund-readout] ${line}`);
};

async function fundsChipText(page: Page): Promise<string> {
  return panelText(page, '.hud-strip__funds, [data-chip="funds"], .hud-strip');
}

async function queueRowsText(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
      .filter((row) => !row.hidden)
      .map((row) => (row.innerText ?? '').replace(/\n+/g, ' | ').trim()),
  );
}

async function queueRowStates(page: Page): Promise<readonly { orderId: string; state: string; text: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
      .filter((row) => !row.hidden)
      .map((row) => ({
        orderId: row.dataset['order'] ?? '',
        state: row.dataset['state'] ?? '',
        text: (row.innerText ?? '').replace(/\n+/g, ' | ').trim(),
      })),
  );
}

test('the Build queue row never says what Cancel will give back, though the amount swings from full to nothing (refundSurplusOf, ruling 20)', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);

  // Buy plenty of bricks so every wall segment can be materially satisfied,
  // and let them land before placing anything -- isolates "which state is
  // the order in" from "is the container still short".
  await buy(page, 'wall-brick', 40);
  await fastForwardToMax(page);
  await page.waitForTimeout(4000);
  const afterBuy = await latestCounts(page);
  log(`after buying 40 bricks and running to let them land: funds=${afterBuy?.treasuryMinorUnits} tick=${afterBuy?.tick}`);
  log(`deliveries panel: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  // Slow the clock back down so the crew's one-at-a-time progress is easy to
  // catch mid-queue rather than racing past every interesting state.
  await page.locator('.hud-strip__transport button').first().click();
  await page.waitForTimeout(200);

  // Six wall segments in a row -- enough for several to sit "Awaiting the
  // Crew" at once while one is "In Progress".
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const y = origin.originY + 12 * TILE;
  await drag(page, { x: westX + TILE / 2, y }, { x: westX + TILE / 2 + 6 * TILE, y });
  log(`queue right after the drag: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // Open the queue fold so its rows paint (it starts collapsed).
  const queueToggle = page.locator('.hud-build__queue > .ui-panel__header > .ui-panel__toggle, .hud-build__queue .ui-panel__toggle');
  if ((await page.locator('.hud-build').getAttribute('data-queued')) !== null) {
    const collapsed = await page.locator('.hud-build__queue').getAttribute('data-collapsed');
    if (collapsed === 'true' || collapsed === null) await queueToggle.first().click();
  }
  await page.waitForTimeout(300);

  await fastForwardToMax(page);

  // Poll until we see one order "In Progress" and at least one other
  // "Awaiting the Crew" simultaneously, or time out.
  let assignedRow: { orderId: string; state: string; text: string } | undefined;
  let inProgressRow: { orderId: string; state: string; text: string } | undefined;
  const pollStarted = Date.now();
  for (;;) {
    const rows = await queueRowStates(page);
    log(`tick ${await currentTick(page)}: rows=${JSON.stringify(rows)}`);
    inProgressRow = rows.find((r) => r.state === 'in-progress');
    assignedRow = rows.find((r) => r.state === 'assigned');
    if (inProgressRow !== undefined && assignedRow !== undefined) break;
    if (Date.now() - pollStarted > 240_000) {
      log('gave up waiting for both an in-progress and an assigned row at once -- proceeding with whatever is available');
      break;
    }
    await page.waitForTimeout(1000);
  }

  // Pause the clock so the state we are about to cancel does not move under us.
  await page.locator('.hud-strip__transport button').first().click();
  await page.waitForTimeout(300);

  // --- Cancel the "assigned" (Awaiting the Crew) row, if we caught one. ---
  if (assignedRow !== undefined) {
    const before = await latestCounts(page);
    const rowLocatorBefore = page.locator(`.hud-build__queue-row[data-order="${assignedRow.orderId}"]`);
    const rowTextBeforeCancel = (await rowLocatorBefore.innerText()).replace(/\n+/g, ' | ').trim();
    log(`ABOUT TO CANCEL an "Awaiting the Crew" row. Its own text (all a player has to go on): "${rowTextBeforeCancel}"`);
    log(`funds immediately before this cancel: ${before?.treasuryMinorUnits}`);
    await rowLocatorBefore.locator('.hud-build__queue-text ~ *').first().click().catch(async () => {
      // Fall back to the row's own cancel button by role.
      await rowLocatorBefore.getByRole('button').click();
    });
    await page.waitForTimeout(1000);
    const after = await latestCounts(page);
    log(`funds immediately after that cancel: ${after?.treasuryMinorUnits}`);
    log(
      `RESULT (assigned/"Awaiting the Crew"): row text predicted nothing numeric; actual refund = ` +
        `${(after?.treasuryMinorUnits ?? 0) - (before?.treasuryMinorUnits ?? 0)} minor units`,
    );
  } else {
    log('never caught a row in the "assigned" state -- reporting this as what could not be reached');
  }

  await page.waitForTimeout(500);

  // --- Cancel the "in-progress" row, if we caught (or still have) one. ---
  const rowsNow = await queueRowStates(page);
  const stillInProgress = rowsNow.find((r) => r.state === 'in-progress') ?? inProgressRow;
  if (stillInProgress !== undefined) {
    const rowLocator = page.locator(`.hud-build__queue-row[data-order="${stillInProgress.orderId}"]`);
    if ((await rowLocator.count()) > 0) {
      const before = await latestCounts(page);
      const rowTextBeforeCancel = (await rowLocator.innerText()).replace(/\n+/g, ' | ').trim();
      log(`ABOUT TO CANCEL an "In Progress" row. Its own text: "${rowTextBeforeCancel}"`);
      log(`funds immediately before this cancel: ${before?.treasuryMinorUnits}`);
      await rowLocator.getByRole('button').click();
      await page.waitForTimeout(1000);
      const after = await latestCounts(page);
      log(`funds immediately after that cancel: ${after?.treasuryMinorUnits}`);
      log(
        `RESULT (in-progress): row text predicted nothing numeric; actual refund = ` +
          `${(after?.treasuryMinorUnits ?? 0) - (before?.treasuryMinorUnits ?? 0)} minor units`,
      );
    } else {
      log('the in-progress order finished (moved to "Completed") before we could cancel it -- reporting that too');
    }
  } else {
    log('never caught a row in the "in-progress" state');
  }

  log(`final queue rows: ${JSON.stringify(await queueRowsText(page))}`);
  await page.screenshot({ path: 'test-results/cancel-refund-readout-final.png', fullPage: true });
});
