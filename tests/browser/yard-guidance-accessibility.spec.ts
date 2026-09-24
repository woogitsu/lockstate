import { expect, test } from '@playwright/test';
import { installTee, latestCounts, openApp, tab } from './playtest-harness';

for (const viewport of [{ width: 720, height: 450 }, { width: 1024, height: 768 }]) {
  test(`Yard guidance audit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'zones').click();
    const rooms = page.locator('.hud-rooms');
    if ((await rooms.getAttribute('data-collapsed')) === 'true') await rooms.locator('> .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.yard"]').click();
    const guidance = page.locator(viewport.width <= 720 ? '.hud-rooms__yard-guidance--narrow' : '.hud-rooms__yard-guidance--desktop');
    await expect(guidance).toBeVisible();
    await guidance.scrollIntoViewIfNeeded();
    const after = await guidance.boundingBox();
    const textFits = await guidance.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    const coordinates = page.locator('.hud-rooms__coordinates');
    const zoom = page.locator('.hud-zoom__out');
    expect(after).not.toBeNull();
    expect(textFits).toBe(true);
    expect(after!.y + after!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    expect(await zoom.isVisible()).toBe(viewport.width > 720);
    expect(await coordinates.isVisible()).toBe(true);
    await coordinates.locator('> .ui-section__header').click();
    for (const [selector, value] of [
      ['.hud-rooms__coord-x', '22'], ['.hud-rooms__coord-y', '20'],
      ['.hud-rooms__coord-width', '8'], ['.hud-rooms__coord-height', '8'],
    ] as const) await page.locator(`${selector} .ui-number__input`).fill(value);
    const beforeRooms = (await latestCounts(page))?.rooms ?? 0;
    await page.locator('.hud-rooms__coordinates-submit').press('Enter');
    await expect(page.locator('.hud-rooms__confirm')).toBeEnabled();
    await page.locator('.hud-rooms__confirm').press('Enter');
    await expect.poll(async () => (await latestCounts(page))?.rooms).toBe(beforeRooms + 1);
  });
}
