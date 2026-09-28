import { expect, test } from './network-changed-fixture';

test('Build purchase quantities use Polish grouping at Full HD', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Kup', exact: true }).click();

  await page.locator('.hud-build__buy input[type="number"]').fill('10000');
  await page.screenshot({ path: testInfo.outputPath('build-purchase-quantity-1920x1080.png') });
  const grouped = new Intl.NumberFormat('pl').format(10000);
  await expect(page.locator('.hud-build__buy-submit')).toContainText(grouped);
  await expect(page.locator('.hud-build__sell-submit')).toContainText(grouped);
});
