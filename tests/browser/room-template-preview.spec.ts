import { expect, test } from './network-changed-fixture';
import { installTee, openApp, sentCommands, tab } from './playtest-harness';

test('Full HD Build previews authored room plans without submitting until confirmed', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await tab(page, 'build').click();

  const open = page.getByRole('button', { name: 'Room plans', exact: true });
  const before = (await sentCommands(page)).length;
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Choose an origin');
  await expect(dialog.getByRole('button', { name: 'Basic cell' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Large cell' }).click();
  await expect(dialog.getByRole('button', { name: 'Large cell' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('6 × 7');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(42);
  await expect(dialog.getByRole('status')).toContainText('clear');
  expect((await sentCommands(page)).length).toBe(before);
  await page.screenshot({ path: 'test-results/room-template-preview-fullhd.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});
