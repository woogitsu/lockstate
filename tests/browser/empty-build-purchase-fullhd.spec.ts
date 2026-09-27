import { expect, test } from './network-changed-fixture';

test('Build purchase waits for a prison session at Full HD', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.ui-tab[data-tab="build"]').click();

  const buy = page.getByRole('button', { name: 'Buy', exact: true });
  await expect(buy).toBeVisible();
  await expect(buy).toBeDisabled();

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(buy).toBeEnabled();
});
