import { expect, test } from '@playwright/test';
import { armBuildable, calibrate, centreOf, installTee, openApp, panelText, press, tab } from './playtest-harness';

/**
 * Three cheap questions the other playtests left open.
 *
 * 1. Is a wall ghost actually drawn under the pointer, or does
 *    `src/rendering/build/edge-picking.ts`'s repeated claim that "the ghost
 *    shows the answer before the player commits" describe an intention?
 *    Screenshots, so the answer is not inferred from code.
 * 2. Can the refusal band be dismissed, and does its alert row carry the
 *    `Clear this alert` control every other row carries?
 * 3. Is a Regime roster row interactive in the DOM as rendered?
 *
 * Not a gate. Run with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5295 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-what-the-screen-shows.playtest.ts
 * ```
 */

test.describe('what the screen shows', () => {
  test('the wall ghost, the stuck refusal, and whether a roster row can be pressed', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[screen] ${line}`);
    };
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    const origin = await calibrate(page);

    // ---- 1. the ghost ------------------------------------------------------
    await armBuildable(page, 'wall-brick');
    const centre = centreOf(origin, 16, 12);
    await page.mouse.move(centre.x, centre.y);
    await page.waitForTimeout(500);
    log(`target readout with the pointer on tile (16,12)'s centre: ${JSON.stringify(await panelText(page, '.hud-build__target'))}`);
    await page.screenshot({ path: 'ghost-centre.png', clip: { x: centre.x - 160, y: centre.y - 160, width: 320, height: 320 } });

    // A hair above the centre line, which should resolve to this tile's north
    // edge rather than the next tile's.
    await page.mouse.move(centre.x, centre.y - 24);
    await page.waitForTimeout(500);
    log(`target readout 24px above the centre: ${JSON.stringify(await panelText(page, '.hud-build__target'))}`);
    await page.screenshot({ path: 'ghost-above.png', clip: { x: centre.x - 160, y: centre.y - 160, width: 320, height: 320 } });

    // And what a press there actually orders, so the readout can be checked
    // against the command.
    const produced = await press(page, centre.x, centre.y - 24);
    log(`press 24px above the centre ordered: ${JSON.stringify(produced.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
    const producedCentre = await press(page, centre.x, centre.y);
    log(`press exactly on the centre ordered: ${JSON.stringify(producedCentre.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);

    // ---- 2. the refusal band ----------------------------------------------
    log(`refusal band text: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    const refusalDom = await page.evaluate(() => {
      const band = document.querySelector('.hud__refusal');
      if (band === null) return 'ABSENT';
      return {
        html: band.outerHTML.slice(0, 800),
        buttons: [...band.querySelectorAll('button')].map((b) => (b as HTMLElement).innerText.trim() || b.getAttribute('aria-label')),
      };
    });
    log(`refusal band DOM: ${JSON.stringify(refusalDom)}`);
    const alertRows = await page.evaluate(() =>
      [...document.querySelectorAll('.hud-alerts__list > *')].map((row) => {
        const el = row as HTMLElement;
        return {
          text: (el.innerText ?? '').replace(/\n/g, ' / ').slice(0, 120),
          buttons: [...el.querySelectorAll('button')].map((b) => (b as HTMLElement).innerText.trim() || b.getAttribute('aria-label')),
          data: JSON.stringify(el.dataset),
        };
      }),
    );
    log(`alert rows: ${JSON.stringify(alertRows, null, 1)}`);

    // ---- 3. a roster row ---------------------------------------------------
    await tab(page, 'regime').click();
    const rosterDom = await page.evaluate(() => {
      const list = document.querySelector('.hud-regime__roster-list');
      if (list === null) return 'ABSENT';
      const first = list.firstElementChild as HTMLElement | null;
      return {
        rowCount: list.children.length,
        firstTag: first?.tagName ?? 'none',
        firstRole: first?.getAttribute('role') ?? 'none',
        firstTabIndex: first?.getAttribute('tabindex') ?? 'none',
        buttonsInList: list.querySelectorAll('button').length,
        moreNote: (document.querySelector('.hud-regime__roster-more') as HTMLElement | null)?.innerText ?? 'none',
      };
    });
    log(`roster DOM with nobody admitted: ${JSON.stringify(rosterDom)}`);
    expect(true).toBe(true);
  });
});
