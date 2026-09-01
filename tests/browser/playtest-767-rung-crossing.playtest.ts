import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { buildAndPopulate, installTee, openApp, fastForwardToMax, runUntilTick, currentTick, panelText } from './playtest-harness';

/**
 * Issue #767, played rather than only asserted: drive a real session's
 * treasury down through the deliveries rung (-1,250) and the construction
 * rung (-2,000) via ordinary hiring and building, and watch what the screen
 * says at the moment it happens.
 *
 * Not a CI gate -- `.playtest.ts`, collected only by
 * `playwright.playtest.config.ts`.
 */

interface RawStatusCounts {
  readonly tick?: number;
  readonly treasuryMinorUnits?: number;
  readonly dailyWageBillMinorUnits?: number;
  readonly unpaidWagesMinorUnits?: number;
  readonly conditions?: readonly string[];
}

async function statusCountsSeries(page: Page): Promise<readonly RawStatusCounts[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/status-counts')
      .map((message) => {
        const payload = (message as { payload: { tick: number; counts: Record<string, unknown> } }).payload;
        return {
          tick: payload.tick,
          treasuryMinorUnits: payload.counts['treasuryMinorUnits'] as number,
          dailyWageBillMinorUnits: payload.counts['dailyWageBillMinorUnits'] as number,
          unpaidWagesMinorUnits: payload.counts['unpaidWagesMinorUnits'] as number,
          conditions: (payload.counts['conditions'] as readonly string[] | undefined) ?? [],
        };
      }),
  );
}

async function crossingEvents(page: Page): Promise<readonly { tick: number; type: string }[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/event')
      .map((message) => (message as { payload: { event: { tick: number; type: string } } }).payload.event)
      .filter((event) => event.type === 'economy.deliveries-refused' || event.type === 'economy.construction-refused'),
  );
}

test('a payroll tick crossing two rungs at once tells the player, live (#767)', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);

  // Small prison, deliberately overstaffed: the wage bill is what does the
  // work here, not the build. Two cells, two admits, a heavy guard roster.
  await buildAndPopulate(page, { beds: 2, admits: 2, guards: 25, label: '767' });

  const afterHiring = (await statusCountsSeries(page)).at(-1);
  console.log(`after build+hire: tick=${afterHiring?.tick} funds=${afterHiring?.treasuryMinorUnits} dailyBill=${afterHiring?.dailyWageBillMinorUnits} conditions=${JSON.stringify(afterHiring?.conditions)}`);

  await fastForwardToMax(page);

  let lastConditions: readonly string[] = [];
  let lastLogged = -1;
  const deadline = Date.now() + 480_000;
  let crossed = false;
  while (Date.now() < deadline && !crossed) {
    await page.waitForTimeout(3_000);
    const series = await statusCountsSeries(page);
    const latest = series.at(-1);
    if (latest === undefined) continue;
    if (latest.tick !== lastLogged) {
      lastLogged = latest.tick ?? -1;
      console.log(
        `tick=${latest.tick} funds=${latest.treasuryMinorUnits} unpaidWages=${latest.unpaidWagesMinorUnits} conditions=${JSON.stringify(latest.conditions)}`,
      );
    }
    const conditions = latest.conditions ?? [];
    if (conditions.length > lastConditions.length) {
      // A new condition just appeared -- screenshot the live screen at the
      // exact moment, before anything else changes it.
      console.log(`NEW CONDITION(S) at tick ${latest.tick}: ${JSON.stringify(conditions)} (was ${JSON.stringify(lastConditions)})`);
      console.log(`FUNDS strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
      console.log(`Event band: ${await panelText(page, '.hud__event')}`);
      console.log(`Alerts log: ${await panelText(page, '.hud-alerts')}`);
      await page.screenshot({ path: `/tmp/claude-0/-workspace-lockstate/4ce06045-59df-5454-8f9c-d57846358c5a/scratchpad/767-crossing-tick-${latest.tick}.png`, fullPage: false });
      lastConditions = conditions;
    }
    if (conditions.includes('treasury.deliveries-refused') && conditions.includes('treasury.construction-refused')) {
      crossed = true;
    }
  }

  const finalSeries = await statusCountsSeries(page);
  const finalTick = await currentTick(page);
  console.log(`stopped at tick=${finalTick}, published series length=${finalSeries.length}`);
  console.log(`crossing events on the wire: ${JSON.stringify(await crossingEvents(page))}`);
  console.log(`final FUNDS strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  console.log(`final event band: ${await panelText(page, '.hud__event')}`);
  console.log(`final alerts log: ${await panelText(page, '.hud-alerts')}`);
  await page.screenshot({ path: '/tmp/claude-0/-workspace-lockstate/4ce06045-59df-5454-8f9c-d57846358c5a/scratchpad/767-final.png', fullPage: false });

  expect(crossed, 'both rungs should have been crossed within the playtest window').toBe(true);
});
