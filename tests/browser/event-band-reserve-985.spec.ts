import { expect, test } from './network-changed-fixture';

test('the hidden event band keeps its 900x600 row reservation (#985)', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/index.html');
  await page.waitForSelector('.hud');
  const rows = await page.locator('.hud').evaluate((element) => getComputedStyle(element).gridTemplateRows.split(' '));
  expect(rows[3], 'event row remains reserved before any alert').not.toBe('0px');
  const event = page.locator('.hud__event');
  await expect(event).toBeHidden();
  const after = await page.locator('.hud').evaluate((element) => getComputedStyle(element).gridTemplateRows.split(' '));
  expect(after[3], 'event row remains reserved while the band is hidden').not.toBe('0px');
});
