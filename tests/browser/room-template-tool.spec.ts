import { expect, test } from './network-changed-fixture';

test('template placement UI checks every square before enabling one submit', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/room-template-tool-harness.html');
  await page.getByRole('button', { name: 'Room plans' }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  const x = dialog.getByRole('spinbutton', { name: 'Plan origin X' });
  const y = dialog.getByRole('spinbutton', { name: 'Plan origin Y' });
  const place = dialog.getByRole('button', { name: 'Place room plan' });
  await x.fill('5');
  await y.fill('7');
  await expect(dialog.getByRole('status')).toContainText('blocked');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--blocked')).toHaveCount(1);
  await expect(place).toBeDisabled();
  await x.fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await expect(place).toBeEnabled();
  await dialog.getByRole('button', { name: 'Large cell' }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('6 × 7');
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally' }).check();
  expect(await dialog.locator('.hud-template__diagram').evaluate((grid) => grid.children[39]?.classList.contains('hud-template__tile--door'))).toBe(true);
  await expect(place).toBeEnabled();
  await page.screenshot({ path: 'test-results/room-template-placement-ui-fullhd.png' });
  await place.click();
  expect(await page.evaluate(() => (window as unknown as { templateRequests: unknown[] }).templateRequests)).toEqual([
    { templateId: 'cell-large', origin: { x: 10, y: 7 }, mirrorX: true },
  ]);
});
