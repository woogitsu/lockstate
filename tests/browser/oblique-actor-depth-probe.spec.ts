import { expect, test } from './network-changed-fixture';
import type {} from './oblique-preset-art-qa';

test('actor depth probe at full HD', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-preset-art-qa.html?preset=kitchen-basic&actorDepth=1');
  await page.evaluate(() => window.lockstatePresetArtQA.ready());
  await page.evaluate(() => window.lockstatePresetArtQA.setPose(45, 45));
  await expect.poll(() => page.evaluate(() => window.lockstatePresetArtQA.report().imageCount)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('actor-depth-yaw45-elev45.png') });
});
