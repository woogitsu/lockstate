import { expect, test } from './network-changed-fixture';

test('template placement UI checks every square before enabling one submit', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/room-template-tool-harness.html');
  await page.getByRole('button', { name: 'Room plans' }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByText('Enter coordinates', { exact: true }).click();
  const x = dialog.getByRole('spinbutton', { name: 'Plan origin X' });
  const y = dialog.getByRole('spinbutton', { name: 'Plan origin Y' });
  const place = dialog.getByRole('button', { name: 'Place room plan' });
  await x.fill('5');
  await y.fill('7');
  await expect(dialog.getByRole('status')).toContainText('blocked');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile.hud-template__tile--blocked')).toHaveCount(1);
  // The same blocked square marks its complete fixture overlay so furniture
  // cannot conceal the worker verdict. Both markers refer to one map tile.
  await expect(dialog.locator('.hud-template__diagram .hud-template__fixture.hud-template__tile--blocked')).toHaveCount(1);
  await expect(place).toBeDisabled();
  await x.fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await expect(place).toBeEnabled();
  await dialog.getByRole('button', { name: 'Large cell' }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('6 × 7');
  await expect(place).toBeEnabled();
  await place.click();
  expect(await page.evaluate(() => (window as unknown as { templateRequests: unknown[] }).templateRequests)).toEqual([
    { templateId: 'cell-large', origin: { x: 10, y: 7 } },
  ]);
});
