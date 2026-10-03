import { writeFileSync } from 'node:fs';
import { expect, test } from '../../../tests/browser/network-changed-fixture';
import { reviewCameraVariant } from './camera-variant-native-recipe';
import { readMinimapGeometry } from './minimap-geometry-probe';

test('original minimap200: retain exact public empty-list failure', async ({ page }, testInfo) => {
  const workers: string[] = [];
  page.on('worker', worker => workers.push(worker.url()));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
  for (let step = 0; step < 4; step++) await page.locator('.display-scale__cycle').click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  const toggle = page.locator('.hud-minimap .ui-panel__toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: testInfo.outputPath('original200-build-expanded.png') });
  await page.locator('.ui-tab[data-tab="overview"]').click();
  const geometry = await page.evaluate(readMinimapGeometry);
  writeFileSync(testInfo.outputPath('original200-overview.json'), JSON.stringify({ workers, geometry }, null, 2));
  await page.screenshot({ path: testInfo.outputPath('original200-overview.png') });
  await expect(page.locator('.hud-minimap .hud-alerts__list')).toBeVisible();
});

for (const variant of ['disclosure', 'toolbox'] as const) {
  test(`owner review: actual public ${variant} camera controls`, async ({ page }, testInfo) => {
    await reviewCameraVariant(page, variant, name => testInfo.outputPath(name));
  });
}
