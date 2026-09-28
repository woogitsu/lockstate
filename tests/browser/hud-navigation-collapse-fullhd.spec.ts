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

test('Full HD section rail reads as a labelled tool list', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  const tabs = page.locator('.hud[data-layout-navigation-placement="rail"] .hud-tabs__inner > .ui-tab');
  await expect(tabs).toHaveCount(6);
  for (const tab of await tabs.all()) {
    const icon = await tab.locator('.ui-icon').boundingBox();
    const label = await tab.locator('.ui-tab__label').boundingBox();
    expect(icon).not.toBeNull();
    expect(label).not.toBeNull();
    expect(label!.x).toBeGreaterThan(icon!.x + icon!.width);
  }
  await page.screenshot({ path: testInfo.outputPath('fullhd-navigation-list.png') });
});

test.describe('Polish Full HD tool list', () => {
  test.use({ locale: 'pl-PL' });

  test('keeps all six section names legible', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    const labels = page.locator('.hud[data-layout-navigation-placement="rail"] .ui-tab__label');
    await expect(labels).toHaveCount(6);
    for (const label of await labels.all()) {
      const width = await label.evaluate((element) => ({ visible: element.clientWidth, content: element.scrollWidth }));
      expect(width.content).toBeLessThanOrEqual(width.visible);
    }
  });
});
