/**
 * **Can a player press the thing the game just told them about?**
 *
 * **Not a CI gate** -- `.playtest.ts` is collected only by
 * `tests/browser/playwright.playtest.config.ts`.
 *
 * The owner's design directive of 2026-09-03 is *"gra ma być łatwa przyjazna
 * do grania, a nie jakieś ukryte funkcje"* -- easy and friendly, not a set of
 * hidden features -- and the cheapest way a simulation hides a feature is to
 * state a number and give the player nowhere to go with it.
 *
 * The status strip carries nine numbers. When one of them moves -- HIGH RISK
 * from 0 to 9 across the zero-guard run, INCIDENTS to 1 and back, CONTRABAND
 * naming an item -- the question is whether the player can act on it, or even
 * find out what it means. So this presses everything a player would press:
 *
 *  - every chip on the strip, by `data-metric`, recording whether the press
 *    changed the active tab, opened anything, or submitted a command;
 *  - every roster row on the Regime tab;
 *  - every room row on the Rooms tab, for contrast -- that one is known to do
 *    something, so it is the control that proves the instrument can tell the
 *    difference between "nothing happened" and "the probe cannot see".
 *
 * A press that changes nothing is recorded as changing nothing. That is the
 * measurement, not a failure.
 */
import { expect, test, type Page } from '@playwright/test';
import { installTee, openApp, sentCommands, tab } from './playtest-harness.ts';

const log = (line: string) => console.log(`[drill] ${line}`);

/** Everything a press could plausibly move, in one snapshot. */
async function snapshot(page: Page): Promise<string> {
  return page.evaluate(() => {
    const activeTab =
      document.querySelector<HTMLElement>('.hud-tabs [aria-selected="true"]')?.textContent?.trim() ??
      document.querySelector<HTMLElement>('.hud-tabs [data-active="true"]')?.textContent?.trim() ??
      'UNKNOWN';
    const panels = [...document.querySelectorAll<HTMLElement>('.ui-panel')]
      .map((panel) => `${panel.className}:${panel.getAttribute('data-collapsed') ?? '-'}`)
      .join('|');
    const dialogs = document.querySelectorAll('dialog[open], [role="dialog"]').length;
    const refusal = document.querySelector<HTMLElement>('.hud__refusal')?.innerText?.trim() ?? '';
    return JSON.stringify({ activeTab, panels, dialogs, refusal, length: document.querySelector<HTMLElement>('.hud')?.innerText?.length ?? 0 });
  });
}

async function pressAndReport(page: Page, label: string, selector: string): Promise<void> {
  const target = page.locator(selector).first();
  if ((await target.count()) === 0) {
    log(`${label}: NO SUCH ELEMENT (${selector})`);
    return;
  }
  const tagName = await target.evaluate((node) => `${node.tagName.toLowerCase()}${node.getAttribute('role') === null ? '' : `[role=${node.getAttribute('role')}]`}`);
  const cursor = await target.evaluate((node) => getComputedStyle(node).cursor);
  const before = await snapshot(page);
  const commandsBefore = (await sentCommands(page)).length;
  await target.click({ force: true, timeout: 5000 }).catch((error: unknown) => log(`${label}: click threw ${String(error).slice(0, 80)}`));
  await page.waitForTimeout(600);
  const after = await snapshot(page);
  const commandsAfter = (await sentCommands(page)).length;
  log(
    `${label} <${tagName}> cursor=${cursor} -> ${before === after ? 'NOTHING CHANGED' : 'CHANGED'}` +
      ` commands ${commandsBefore}->${commandsAfter}` +
      (before === after ? '' : ` | before ${before} | after ${after}`),
  );
}

test('can a player press the thing the game just told them about', async ({ page }) => {
  test.setTimeout(600_000);

  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  const metrics = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-metric]')].map((node) => node.getAttribute('data-metric') ?? '?'),
  );
  log(`the strip carries ${metrics.length} chip(s): ${JSON.stringify(metrics)}`);

  for (const metric of metrics) await pressAndReport(page, `chip "${metric}"`, `[data-metric="${metric}"]`);

  await tab(page, 'regime').click();
  await page.waitForTimeout(600);
  const rosterRows = await page.locator('.hud-regime__roster [data-entity], .hud-regime__roster li, .hud-regime__roster tr').count();
  log(`Regime tab: ${rosterRows} roster row(s) found`);
  await pressAndReport(page, 'first roster row', '.hud-regime__roster [data-entity], .hud-regime__roster li, .hud-regime__roster tr');
  log(`REGIME PANEL, VERBATIM: ${(await page.locator('.hud-regime').innerText().catch(() => 'ABSENT')).replace(/\n/g, ' | ')}`);

  // The control that is known to do something, so a row of "NOTHING CHANGED"
  // above cannot be blamed on the instrument.
  await tab(page, 'rooms').click();
  await page.waitForTimeout(600);
  await pressAndReport(page, 'CONTROL: a Rooms catalogue row', '.hud-rooms__list [data-room]');

  log(`every [data-metric] chip's tag: ${await page.evaluate(() => [...document.querySelectorAll('[data-metric]')].map((node) => node.tagName).join(','))}`);
  await page.screenshot({ path: 'playtest-out/drill-in.png' });
});
