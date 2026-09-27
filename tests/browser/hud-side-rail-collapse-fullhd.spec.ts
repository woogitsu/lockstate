import { expect, test } from './network-changed-fixture';

test('Full HD inspector collapse hides its contents and restores them', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const aside = page.locator('.hud__aside');
  const side = page.locator('.hud__side');
  const toggle = page.locator('.hud-layout__arrow[data-layout-region="inspector"]');
  await expect(aside).toBeVisible();
  await expect(side).toBeVisible();
  await toggle.click();

  await expect(aside).toHaveAttribute('hidden', '');
  await expect(side).toHaveAttribute('hidden', '');
  await expect(aside).toBeHidden();
  await expect(side).toBeHidden();
  expect(await page.locator('.hud__rail').evaluate((rail) => rail.getBoundingClientRect().width)).toBeLessThan(60);
  await expect(toggle).toBeInViewport();

  await toggle.click();
  await expect(aside).toBeVisible();
  await expect(side).toBeVisible();
  await expect(page.getByRole('button', { name: /New prison|Nowe więzienie/ })).toBeVisible();
});
