import { expect, test } from '@playwright/test';
import {
  buildAndPopulate,
  countsSeries,
  currentClock,
  currentTick,
  latestCounts,
  installTee,
  openApp,
  panelText,
  tab,
} from './playtest-harness';

/**
 * **Once a prison is built, staffed and populated, does it ever ask the player
 * for anything?**
 *
 * The loop question. `buildAndPopulate` gets a six-bed cell, six prisoners and
 * two guards standing; from there this file only *watches*, sampling every
 * panel and every band once per in-game hour-ish for three in-game days, and
 * records what changed without a press.
 *
 * Not a gate. Run with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5274 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-does-the-prison-ask-anything-of-me.playtest.ts
 * ```
 */

test.describe('does the prison ask anything of me', () => {
  test('three in-game days of a built, staffed, populated prison, watched and not touched', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[loop] ${line}`);
    };
    await installTee(page);
    await openApp(page);
    await buildAndPopulate(page, { beds: 6, admits: 6, guards: 2, label: 'loop-setup' });

    log(`=== SETUP DONE at tick ${await currentTick(page)} ===`);

    const sample = async (label: string): Promise<void> => {
      const counts = await latestCounts(page);
      log(`--- ${label} | tick ${await currentTick(page)} | clock ${JSON.stringify(await currentClock(page))}`);
      log(`  counts: ${JSON.stringify(counts)}`);
      log(`  strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
      log(`  event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
      log(`  refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
      await tab(page, 'overview').click();
      log(`  alerts: ${JSON.stringify((await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' | '))}`);
      log(`  intake: ${(await panelText(page, '.hud-intake')).replace(/\n/g, ' | ')}`);
      await tab(page, 'regime').click();
      log(`  regime: ${(await panelText(page, '.hud-regime')).replace(/\n/g, ' | ')}`);
      await tab(page, 'security').click();
      log(`  staff: ${(await panelText(page, '.hud-staff')).replace(/\n/g, ' | ')}`);
      await tab(page, 'rooms').click();
      log(`  rooms: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ')}`);
    };

    await sample('T0, right after setup');

    // Run. `buildAndPopulate` already pressed fast-forward twice, so the clock
    // is at x4 unless something paused it.
    const startTick = await currentTick(page);
    const target = startTick + 3 * 2400;
    const started = Date.now();
    let nextSample = startTick + 400;
    for (;;) {
      const tick = await currentTick(page);
      if (tick >= nextSample) {
        await sample(`t+${tick - startTick} ticks`);
        nextSample = tick + 400;
      }
      if (tick >= target) break;
      if (Date.now() - started > 420_000) {
        log(`GAVE UP at tick ${tick}, wanted ${target}, after ${Date.now() - started}ms of wall clock`);
        break;
      }
      await page.waitForTimeout(2000);
    }

    await sample('FINAL');

    // The whole counts series, so the shape of the run is legible in one place.
    const series = await countsSeries(page);
    log(`=== ${series.length} counts publications over the run ===`);
    for (const entry of series) {
      log(
        `  tick ${entry.tick}: prisoners=${entry.prisoners} intake=${entry.prisonersInIntake}` +
          ` highRisk=${entry.prisonersHighRisk} staff=${entry.staff} rooms=${entry.rooms}` +
          ` accomCap=${entry.accommodationCapacity} occupants=${entry.roomOccupants}` +
          ` treasury=${entry.treasuryMinorUnits} accrued=${entry.stateIncomeAccruedTodayMinorUnits}` +
          ` wageBill=${entry.dailyWageBillMinorUnits} unpaid=${entry.unpaidWagesMinorUnits}`,
      );
    }

    // Everything the worker told the main thread, by kind, so a mechanic that
    // fired without a panel is still visible.
    const kinds = await page.evaluate(() => {
      const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
      const byKind = new Map<string, number>();
      for (const message of messages) {
        const kind = (message as { kind?: string }).kind ?? '<none>';
        byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
      }
      return [...byKind.entries()];
    });
    log(`WORKER MESSAGE KINDS: ${JSON.stringify(kinds)}`);

    const events = await page.evaluate(() => {
      const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
      return messages
        .filter((message) => /event|alert|incident/i.test((message as { kind?: string }).kind ?? ''))
        .map((message) => JSON.stringify(message).slice(0, 400));
    });
    log(`=== ${events.length} event-ish messages ===`);
    for (const entry of events) log(`  ${entry}`);

    expect(series.length).toBeGreaterThan(0);
  });
});
