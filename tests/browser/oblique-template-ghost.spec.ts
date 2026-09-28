import { expect, test } from '@playwright/test';

test('Full HD oblique plan ghost shows whole furniture, cost, and worker verdict before placement', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-template-ghost-harness.html');
  const ghost = page.locator('.oblique-template-ghost');
  await expect(ghost).toBeVisible();
  await expect(ghost.locator('polygon')).toHaveCount(64);
  await expect(ghost.locator('polygon[data-kind="furniture"]')).toHaveCount(20);
  await expect(ghost.locator('polygon[data-kind="door"]')).toHaveCount(0);
  await expect(ghost.locator('.oblique-template-ghost__cost')).toContainText('Catalogue value: 3,135');
  await page.evaluate(() => {
    const harness = (window as unknown as { ghostHarness: { view: { update: (...args: unknown[]) => void }; plan: unknown; pose: unknown; quote: unknown } }).ghostHarness;
    harness.view.update(harness.plan, harness.pose, { ok: true }, harness.quote);
  });
  await expect(ghost.locator('polygon[data-kind="door"]')).toHaveCount(1);
  await expect(ghost.getByRole('status')).toContainText('clear');
  await page.screenshot({ path: testInfo.outputPath('oblique-canteen-clear-1920x1080.png') });
  await page.evaluate(() => {
    const harness = (window as unknown as { ghostHarness: { view: { update: (...args: unknown[]) => void }; plan: unknown; pose: unknown; quote: unknown } }).ghostHarness;
    harness.view.update(harness.plan, harness.pose, { ok: false, reason: 'structure-occupied', tile: { x: 11, y: 11 } }, harness.quote);
  });
  await expect(ghost.locator('polygon[data-kind="door"]')).toHaveCount(0);
  await expect(ghost.locator('polygon[data-kind="blocked"]')).toHaveCount(1);
  await expect(ghost.getByRole('status')).toContainText('blocked');
});
