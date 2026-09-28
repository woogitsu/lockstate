import { expect, test } from './network-changed-fixture';

test('Full HD angled camera leaves a modified browser shortcut alone', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  const reading = page.locator('.hud-camera-angle output');
  await expect(reading).toContainText('-45°');
  const before = await reading.textContent();
  const cancelled = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', ctrlKey: true, bubbles: true, cancelable: true });
    return !window.dispatchEvent(event);
  });
  expect(cancelled).toBe(false);
  await expect(reading).toHaveText(before ?? '');
  await page.keyboard.press('e');
  await expect(reading).toContainText('-30°');
});
