import { expect, test } from './network-changed-fixture';
import type {} from './oblique-preset-art-qa';

for (const preset of ['classroom-basic', 'kitchen-basic', 'infirmary-basic', 'laundry-basic'] as const) {
  test(`${preset} paints every built fixture and square wall with Blender frames at Full HD`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/tests/browser/oblique-preset-art-qa.html?preset=${preset}`);
    await page.evaluate(() => window.lockstatePresetArtQA.ready());
    await page.evaluate(() => window.lockstatePresetArtQA.setPose(45, 45));
    await expect.poll(() => page.evaluate(() => window.lockstatePresetArtQA.report().imageCount)).toBeGreaterThan(0);
    const report = await page.evaluate(() => window.lockstatePresetArtQA.report());
    expect(report.missingAssetIds).toEqual([]);
    expect(report.imageCount).toBe(report.builtFixtureCount + report.builtWallCount);
    expect(report.fallbackCommands).toBe(0);
    for (const id of report.projectedAssetIds) {
      expect(report.loadedTextureKeys).toContain(`oblique:${id}:45:45`);
    }
    await page.screenshot({ path: testInfo.outputPath(`${preset}-fullhd-45deg.png`) });
  });
}
