import { expect, test } from './network-changed-fixture';

test('Full HD navigation collapse hides section tabs and keeps its restore handle', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const tabs = page.locator('.hud-tabs__inner');
  const toggle = page.locator('.hud-layout__arrow[data-layout-region="navigation"]');
  await expect(tabs).toBeVisible();
  await toggle.click();

  await expect(tabs).toHaveAttribute('hidden', '');
  await expect(tabs).toBeHidden();
  await expect(toggle).toBeInViewport();
  await toggle.click();
  await expect(tabs).toBeVisible();
  await expect(page.getByRole('button', { name: /Build|Buduj/ })).toBeVisible();
});
