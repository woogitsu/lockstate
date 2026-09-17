import { expect, type Page, test } from '@playwright/test';
import {
  armBuildable,
  buy,
  calibrate,
  centreOf,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  runUntilTick,
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **Playing the owner's second ruling on #771 -- a fresh, unfurnished prison
 * can always afford its first plank -- with the mouse.**
 *
 * `tests/integration/economy-liquidity-hard-lock.test.ts` proves this through
 * the command router. This file drives the exact same shape -- a one-press,
 * 656-brick purchase that used to spend a brand-new prison out of the game
 * (ADR 0075's ECON-002) -- through the real Build panel, so the starter rung
 * is watched refusing the press, funding the queue instead, and the prison
 * recovering, on screen rather than only in an assertion.
 *
 * **What one run showed, transcribed from its own console output:**
 *
 * 1. The 656-brick press is refused outright at the host's own pre-flight --
 *    `HostRefusalError: The last reported balance of 25000 cannot cover
 *    26240` -- before the command even reaches the kernel. Balance stays
 *    25,000.
 * 2. 654 bricks is bought (`-1,160`), and the FUNDS badge reads **"25 left"**.
 * 3. A direct press for the one plank a bed needs (65) is refused --
 *    `HostRefusalError: The last reported balance of -1160 cannot cover 65`
 *    -- **and the badge already said only 25 was left**, which is short of
 *    the 65 the press asked for. The two agree: a player reading the badge
 *    could see the press was going to fail before pressing.
 * 4. The bed is placed as a queued build order instead (the construction
 *    rung, unaffected by freshness) and completes: balance **-1,225**, room
 *    capacity 1. The badge now reads **"25 left"** -- correct throughout,
 *    because furnishing the bed ended the exemption and both the true floor
 *    and the badge's floor are the same -1,250 from here on.
 * 5. A prisoner is admitted, and one in-game day later the balance has risen
 *    on its own, with no further press: -1,225 to -925, +300, exactly
 *    `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS`. The loop ECON-002 opens
 *    with -- a balance that can never earn again -- is broken, on screen.
 *
 * **Steps 2 and 3 above are corrected, not transcribed.** The run that wrote
 * this file first found the badge reading **"90 left"** at step 2 -- computed
 * against the mature -1,250 rung (`90 = -1,160 - (-1,250)`) while the balance
 * was actually judged against the starter rung's -1,185
 * (`25 = -1,160 - (-1,185)`) -- so step 3's refusal landed with "the badge
 * just said 90 was left" and no explanation for why a purchase inside that
 * figure failed. That was `AGENTS.md`'s fourth exclusion, reported rather
 * than patched because this file's own brief was to play the starter rung,
 * not to touch the chip. The owner's follow-up ruling threaded the same
 * freshness signal `pressFloorMinorUnits` already reads
 * (`counts.roomCapacity === 0`) through `overdraftRemaining` and
 * `overdraftTone` in `src/ui/hud/projection.ts`, and a re-run transcribed
 * above now reads "25 left" at step 2, in agreement with step 3 from the
 * first press onward. One transient is new and is not a defect: immediately
 * after the bed order is placed (before it completes) the badge reads **"0
 * left"** at -1,225 -- correct for that instant, because the room is still
 * unfurnished (`roomCapacity` has not moved yet) and -1,225 has in fact
 * already passed the starter floor (-1,185); it reads "25 left" again a few
 * hundred milliseconds later once the bed completes and the mature floor
 * takes over.
 *
 * Not a gate: nothing in CI collects `.playtest.ts`, only
 * `tests/browser/playwright.playtest.config.ts` does, and that is run by
 * hand:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5301 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-771-starter-rung.playtest.ts --reporter=line
 * ```
 */

async function fundsChip(page: Page): Promise<string> {
  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('.hud-strip__metrics [data-metric="funds"]');
    return chip === null ? 'ABSENT' : (chip.innerText ?? '').replace(/\n+/g, ' | ').trim();
  });
}

test('a fresh, unfurnished prison presses itself to the starter rung, is refused the 656-brick purchase, and still buys and recovers', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);

  console.log(`[start] FUNDS chip: ${await fundsChip(page)}`);

  // The exact press ECON-002 used to be reached with: 656 bricks in one Buy,
  // landing on -1,240 under the mature rung. A fresh, unfurnished prison's
  // starter rung (-1,185) refuses it outright.
  await buy(page, 'wall-brick', 656);
  console.log(`[656 bricks pressed] refusal band: ${await panelText(page, '.hud__refusal')}`);
  console.log(`[656 bricks pressed] FUNDS chip: ${await fundsChip(page)}`);
  console.log(`[656 bricks pressed] deliveries: ${await panelText(page, '.hud-build__deliveries')}`);

  // The largest press the starter rung actually allows: 654 bricks, landing
  // on -1,160.
  await buy(page, 'wall-brick', 654);
  await page.waitForTimeout(500);
  console.log(`[654 bricks pressed] FUNDS chip: ${await fundsChip(page)}`);
  console.log(`[654 bricks pressed] deliveries: ${await panelText(page, '.hud-build__deliveries')}`);

  // A direct press for the one plank a bed needs is still refused -- the
  // starter rung reserves that room for the *queue*, not for a second press.
  await buy(page, 'bed-wooden', 1);
  console.log(`[direct plank press] refusal band: ${await panelText(page, '.hud__refusal')}`);
  console.log(`[direct plank press] FUNDS chip: ${await fundsChip(page)}`);

  await fastForwardToMax(page);
  await page.waitForTimeout(3000);

  // Zone a 6x6 cell and draw its walls with bricks already in stock -- no
  // further press needed, so nothing here can move the balance off the
  // starter rung. Tile bounds and drag geometry match
  // `playtest-harness.ts`'s own `buildAndPopulate`, which this repository's
  // other playtests already rely on.
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * 64;
  const eastX = origin.originX + 18 * 64;
  const northY = origin.originY + 12 * 64;
  const southY = origin.originY + 18 * 64;
  for (const run of [
    { name: 'north', a: { x: westX + 32, y: northY }, b: { x: eastX - 32, y: northY } },
    { name: 'south', a: { x: westX + 32, y: southY }, b: { x: eastX - 32, y: southY } },
    { name: 'west', a: { x: westX, y: northY + 32 }, b: { x: westX, y: southY - 32 } },
    { name: 'east', a: { x: eastX, y: northY + 32 }, b: { x: eastX, y: southY - 32 } },
  ]) {
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    const produced = (await sentCommands(page)).slice(before);
    console.log(`[wall run ${run.name}] ${produced.length} command(s)`);
  }
  console.log(`[walls drawn] queue right after: ${await panelText(page, '.hud-build__queue')}`);
  console.log(`[walls drawn] FUNDS chip: ${await fundsChip(page)}`);

  const queueEmptyAt = await waitForQueueEmpty(page);
  console.log(`[walls up] Build panel says the queue is empty at page t=${queueEmptyAt}ms`);
  console.log(`[walls up] FUNDS chip: ${await fundsChip(page)}`);

  let zonedRooms = 0;
  for (let attempt = 1; attempt <= 12 && zonedRooms === 0; attempt += 1) {
    await tab(page, 'zones').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    zonedRooms = (await latestCounts(page))?.rooms ?? 0;
    console.log(`[zone attempt ${attempt}] rooms=${zonedRooms}`);
    if (zonedRooms === 0) await page.waitForTimeout(3000);
  }
  const zoned = await latestCounts(page);
  console.log(`[zoned] rooms=${zoned?.rooms} at tick ${zoned?.tick}`);

  // The bed: the queue's own procurement, at the *unaffected* construction
  // rung. This is the purchase ECON-002 says a fresh prison must always be
  // able to make.
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  await press(page, centreOf(origin, 13, 13).x, centreOf(origin, 13, 13).y);
  console.log(`[bed placed] queue: ${await panelText(page, '.hud-build__queue')}`);
  console.log(`[bed placed] FUNDS chip immediately after: ${await fundsChip(page)}`);

  await page.waitForTimeout(4000);
  const afterBed = await latestCounts(page);
  console.log(`[bed settled at tick ${afterBed?.tick}] roomCapacity=${afterBed?.roomCapacity} funds=${afterBed?.treasuryMinorUnits}`);
  console.log(`[bed settled] FUNDS chip: ${await fundsChip(page)}`);
  console.log(`[bed settled] queue: ${await panelText(page, '.hud-build__queue')}`);

  // Admit, and let a day of income land.
  await tab(page, 'overview').click();
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(1500);
  console.log(`[admitted] intake panel: ${await panelText(page, '.hud-intake')}`);
  console.log(`[admitted] FUNDS chip: ${await fundsChip(page)}`);

  const beforeIncome = await latestCounts(page);
  await runUntilTick(page, (beforeIncome?.tick ?? 0) + 2_600);
  await page.waitForTimeout(500);
  const afterIncome = await latestCounts(page);
  console.log(
    `[one day later, tick ${afterIncome?.tick}] treasury before=${beforeIncome?.treasuryMinorUnits} after=${afterIncome?.treasuryMinorUnits}`,
  );
  console.log(`[one day later] FUNDS chip: ${await fundsChip(page)}`);

  expect(afterIncome?.treasuryMinorUnits ?? -Infinity, 'the balance moves upward on its own, with no further press').toBeGreaterThan(
    beforeIncome?.treasuryMinorUnits ?? Infinity,
  );
});
