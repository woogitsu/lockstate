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

  // The one sentence the Build panel offers about what a cancellation gives
  // back is the Remove tool's arm hint -- read it live, before anything else,
  // because `src/content/default-locale-en.ts:1049-1051` says in a comment
  // beside the string that it has been false since ruling 20 (2026-08-31):
  // "its materials come back" names the wrong currency (money, not materials,
  // per `refundSurplusOf`) and has no clause at all for the in-progress case,
  // where nothing comes back.
  await page.locator('.hud-build__remove').click();
  const removeHintText = await panelText(page, '.hud-build__map > .hud-build__note');
  log(`REMOVE HINT, as rendered on the real page right now: "${removeHintText}"`);
  await page.locator('.hud-build__remove').click(); // back off, as `calibrate` does

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

  // Fifteen wall segments in a row -- one crew builds one at a time (#348),
  // so with this many queued, most of them sit "Awaiting the Crew" for the
  // whole time it takes to build every order ahead of them: a long plateau
  // next to the short "In Progress" window, easy to poll into.
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const y = origin.originY + 12 * TILE;
  await drag(page, { x: westX + TILE / 2, y }, { x: westX + TILE / 2 + 15 * TILE, y });
  log(`queue right after the drag: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // Open the queue fold so its rows paint (it starts collapsed).
  const queueFold = page.locator('.hud-build__queue > .ui-section__header');
  await queueFold.click();
  await page.waitForTimeout(300);
  log(`queue-list visible after opening the fold: ${await page.locator('.hud-build__queue-list').isVisible()}`);

  // Resume at ×1 -- the slowest speed on offer -- rather than fast-forwarding:
  // the first attempt at this instrument fast-forwarded here and the whole
  // fifteen-order run completed inside a single 1s poll interval, so every
  // sample it took read an empty queue. Poll every 150ms instead of every
  // 1000ms, for the same reason.
  await page.locator('.hud-strip__transport button').nth(1).click();

  // Poll until we have seen at least one "In Progress" row and at least one
  // "Awaiting the Crew" row -- not necessarily on the same sample, since a
  // slow poll can still straddle the instant the crew moves on -- or time out.
  let assignedRow: { orderId: string; state: string; text: string } | undefined;
  let inProgressRow: { orderId: string; state: string; text: string } | undefined;
  let samples = 0;
  const pollStarted = Date.now();
  for (;;) {
    const rows = await queueRowStates(page);
    samples += 1;
    if (samples <= 5 || samples % 20 === 0 || rows.length === 0) {
      log(`sample ${samples}, tick ${await currentTick(page)}: rows=${JSON.stringify(rows)}`);
    }
    const foundInProgress = rows.find((r) => r.state === 'in-progress');
    const foundAssigned = rows.find((r) => r.state === 'assigned');
    if (foundInProgress !== undefined) inProgressRow = foundInProgress;
    if (foundAssigned !== undefined) assignedRow = foundAssigned;
    if (inProgressRow !== undefined && assignedRow !== undefined) {
      log(`caught both at sample ${samples}: in-progress=${JSON.stringify(inProgressRow)} assigned=${JSON.stringify(assignedRow)}`);
      break;
    }
    if (rows.length === 0 && samples > 5) {
      log('the queue emptied before both states were caught -- proceeding with whatever was seen');
      break;
    }
    if (Date.now() - pollStarted > 120_000) {
      log('gave up after 120s of polling -- proceeding with whatever was seen');
      break;
    }
    await page.waitForTimeout(150);
  }

  // Pause the clock so the state we are about to cancel does not move under us.
  await page.locator('.hud-strip__transport button').first().click();
  await page.waitForTimeout(300);

  // --- Cancel the "assigned" (Awaiting the Crew) row, if we caught one. ---
  // Re-read its *current* state right before pressing Cancel: it was captured
  // during the poll above and the clock kept running until the pause a moment
  // ago, so it may have moved on since -- the row text logged is always live,
  // read fresh off the DOM, never the stale sample.
  if (assignedRow !== undefined) {
    const before = await latestCounts(page);
    const rowLocatorBefore = page.locator(`.hud-build__queue-row[data-order="${assignedRow.orderId}"]`);
    const rowTextBeforeCancel = (await rowLocatorBefore.innerText()).replace(/\n+/g, ' | ').trim();
    const liveState = await rowLocatorBefore.getAttribute('data-state');
    log(`ABOUT TO CANCEL a row caught as "Awaiting the Crew"; its state right now is "${liveState}". Its own text (all a player has to go on): "${rowTextBeforeCancel}"`);
    log(`funds immediately before this cancel: ${before?.treasuryMinorUnits}`);
    await rowLocatorBefore.locator('.ui-action').click();
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
      const liveState = await rowLocator.getAttribute('data-state');
      log(`ABOUT TO CANCEL a row caught as "In Progress"; its state right now is "${liveState}". Its own text: "${rowTextBeforeCancel}"`);
      log(`funds immediately before this cancel: ${before?.treasuryMinorUnits}`);
      await rowLocator.locator('.ui-action').click();
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
