import { expect, test } from './network-changed-fixture';

test('Escape puts down an armed room plan in the Full HD angled view', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Canteen' }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  await page.mouse.move(960, 540);
  const ghost = page.locator('.oblique-template-ghost');
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(page.locator('.hud-build__list [aria-checked="true"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(ghost).toBeHidden();
  await expect(page.locator('.hud-build__list [data-buildable="wall-brick"]')).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: testInfo.outputPath('angled-template-after-escape-1920x1080.png') });
});
