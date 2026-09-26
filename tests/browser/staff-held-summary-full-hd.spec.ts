import { expect, test } from '@playwright/test';

test.use({ locale: 'pl-PL' });

test('the Polish guard assignment summary fits the Manage rail at Full HD', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.hud-tabs__inner button').filter({ hasText: 'ZARZĄDZAJ' }).click();

  const header = page.locator('.hud-staff__held-header');
  await expect(header).toBeVisible();
  expect(await header.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator('.hud-staff__held-summary')).toHaveText('0 · Bez przydziału: 0');
});
