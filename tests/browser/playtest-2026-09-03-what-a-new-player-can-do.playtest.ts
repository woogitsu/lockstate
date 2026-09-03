import { expect, test, type Page } from '@playwright/test';
import {
  TILE,
  armBuildable,
  calibrate,
  centreOf,
  drag,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  sentCommands,
  tab,
} from './playtest-harness';

/**
 * **What a player who has never seen this game can actually do, in order.**
 *
 * Not a gate. Run with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5251 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-what-a-new-player-can-do.playtest.ts
 * ```
 */

const TABS = ['overview', 'build', 'rooms', 'security', 'regime'] as const;

async function inventory(page: Page, log: (l: string) => void): Promise<void> {
  for (const id of TABS) {
    await tab(page, id).click();
    await page.waitForTimeout(250);
    log(`--- TAB ${id} ---`);
    log(`  text: ${(await panelText(page, '.hud__rail')).replace(/\n/g, ' | ')}`);
    const controls = await page.evaluate(() => {
      const rail = document.querySelector('.hud__rail');
      if (rail === null) return [];
      return [...rail.querySelectorAll('button, input, select')]
        .filter((n) => (n as HTMLElement).getClientRects().length > 0)
        .map((n) => {
          const el = n as HTMLElement & { disabled?: boolean; value?: string };
          const label = (el.innerText ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('title') || `<${el.tagName.toLowerCase()}>`;
          return `${label.replace(/\n/g, '/')}${el.disabled === true ? ' [DISABLED]' : ''}`;
        });
    });
    log(`  ${controls.length} visible control(s): ${JSON.stringify(controls)}`);
  }
}

test.describe('what a new player can do', () => {
  test('act 1: arrival, and every control the game offers on day 1', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[new-player] ${line}`);
    };
    await installTee(page);
    await openApp(page);

    log(`before New prison, rail: ${(await panelText(page, '.save-panel')).replace(/\n/g, ' | ')}`);
    log(`before New prison, any hud? ${(await panelText(page, '.hud__rail')).replace(/\n/g, ' | ')}`);

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    log(`status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    log(`event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
    log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`alerts: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
    log(`clock speed reads: ${JSON.stringify(await panelText(page, '.hud-clock__speed'))}`);

    await inventory(page, log);

    // Does the game say anywhere what to do first?
    const allText = await page.evaluate(() => (document.body.innerText ?? '').replace(/\n+/g, ' | '));
    log(`WHOLE SCREEN TEXT: ${allText}`);
  });

  test('act 2: the naive attempts a new player makes first', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[naive] ${line}`);
    };
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // 1. Press Admit with nothing built. What does the game say?
    await tab(page, 'overview').click();
    log(`intake panel on arrival: ${(await panelText(page, '.hud-intake')).replace(/\n/g, ' | ')}`);
    const admit = page.locator('.hud-intake__admit');
    log(`Admit disabled? ${await admit.getAttribute('disabled')}`);
    await admit.click({ trial: true }).catch((error: Error) => log(`Admit not clickable: ${error.message.split('\n')[0]}`));
    await admit.click({ force: true });
    await page.waitForTimeout(1200);
    log(`after pressing Admit with no cells -- refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`  alerts: ${JSON.stringify((await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' | '))}`);
    log(`  intake panel: ${(await panelText(page, '.hud-intake')).replace(/\n/g, ' | ')}`);
    log(`  counts: ${JSON.stringify(await latestCounts(page))}`);

    // 2. Go to Build and try to place a wall without buying anything.
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    log(`origin ${JSON.stringify(origin)}`);
    log(`build panel on arrival: ${(await panelText(page, '.hud-build')).replace(/\n/g, ' | ')}`);
    await armBuildable(page, 'wall-brick');
    const point = centreOf(origin, 8, 11);
    const produced = await press(page, point.x, point.y);
    log(`one wall press with nothing bought: ${produced.length} command(s) ${JSON.stringify(produced)}`);
    await page.waitForTimeout(1500);
    log(`  refusal: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`  queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    log(`  deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    // 3. The naive enclosure: four drags along tile CENTRES, which is what a
    //    player who thinks walls fill tiles would draw.
    const before = (await sentCommands(page)).length;
    await drag(page, centreOf(origin, 6, 11), centreOf(origin, 11, 11));
    await drag(page, centreOf(origin, 6, 16), centreOf(origin, 11, 16));
    await drag(page, centreOf(origin, 6, 11), centreOf(origin, 6, 16));
    await drag(page, centreOf(origin, 11, 11), centreOf(origin, 11, 16));
    const perimeter = (await sentCommands(page)).slice(before);
    log(`four centre-line drags around (6,11)-(11,16): ${perimeter.length} command(s)`);
    log(`  ${JSON.stringify(perimeter.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'] ?? '-')}`))}`);

    // Let them build (there is money; just-in-time buys the bricks).
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(20_000);
    log(`queue after 20s at x4: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    log(`funds now: ${await page.locator('[data-metric="funds"] .ui-stat__value').innerText()}`);

    // 4. Now try to designate a cell over it, the way the panel invites.
    await tab(page, 'rooms').click();
    log(`rooms panel on arrival: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ')}`);
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 6, 11), centreOf(origin, 11, 16));
    log(`rooms panel with the rectangle drawn: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ')}`);
    log(`  enclosure readout: ${JSON.stringify(await panelText(page, '.hud-rooms__enclosure'))}`);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1500);
    log(`after Confirm: rooms=${(await latestCounts(page))?.rooms}`);
    log(`  refusal: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`  alerts: ${JSON.stringify((await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' | '))}`);
    log(`  rooms panel: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ')}`);
  });

  test('act 3: clicking things in the world', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[world-click] ${line}`);
    };
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    const origin = await calibrate(page);

    // With no tool armed: does clicking the world do anything at all?
    await tab(page, 'overview').click();
    const before = (await sentCommands(page)).length;
    const p = centreOf(origin, 8, 13);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(600);
    log(`bare left-click on empty ground produced ${(await sentCommands(page)).length - before} command(s)`);
    log(`  screen text after: ${(await page.evaluate(() => (document.body.innerText ?? '').replace(/\n+/g, ' | '))).slice(0, 600)}`);

    // Right-click? Hover?
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.waitForTimeout(400);
    log(`after right-click, commands ${(await sentCommands(page)).length - before}`);
    log(`  any selection element? ${await page.evaluate(() => [...document.querySelectorAll('[class*="select"],[class*="inspect"],[class*="detail"]')].map((n) => n.className).join(', ') || 'NONE')}`);

    // What keys are bound, per the app's own binding table?
    log(`keyboard bindings visible anywhere on screen? ${await page.evaluate(() => (document.body.innerText ?? '').match(/[A-Z] +[-–—] +\w+/g)?.join(' ; ') ?? 'none matched')}`);

    // Minimap: does clicking it move the camera (a player's only overview)?
    const minimap = page.locator('.hud-minimap__surface');
    log(`minimap present? ${await minimap.count()}`);
    if ((await minimap.count()) > 0) {
      const box = await minimap.boundingBox();
      log(`minimap box ${JSON.stringify(box)}`);
    }
    expect(true).toBe(true);
  });
});
