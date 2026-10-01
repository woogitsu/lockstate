import { expect, test } from './network-changed-fixture';
import type {} from './oblique-preset-art-qa';

for (const preset of ['classroom-basic', 'kitchen-basic', 'infirmary-basic', 'laundry-basic'] as const) {
  test(`${preset} paints every built fixture and square wall with Blender frames at Full HD`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/tests/browser/oblique-preset-art-qa.html?preset=${preset}`);
    await page.evaluate(() => window.lockstatePresetArtQA.ready());
    for (const [yaw, elevation] of [[45, 45], [135, 65], [-45, 25]] as const) {
      await page.evaluate(([yawDegrees, elevationDegrees]: [number, number]) =>
        window.lockstatePresetArtQA.setPose(yawDegrees, elevationDegrees), [yaw, elevation] as [number, number]);
      await expect.poll(() => page.evaluate(() => {
        const report = window.lockstatePresetArtQA.report();
        return report.imageCount === report.builtFixtureCount + report.builtWallCount
          && report.expectedTextureKeys.every((key) => report.loadedTextureKeys.includes(key));
      })).toBe(true);
      const report = await page.evaluate(() => window.lockstatePresetArtQA.report());
      expect(report.missingAssetIds).toEqual([]);
      expect(report.imageCount).toBe(report.builtFixtureCount + report.builtWallCount);
      expect(report.fallbackCommands).toBe(0);
      for (const key of report.expectedTextureKeys) expect(report.loadedTextureKeys).toContain(key);
      if (yaw === 45 || preset === 'kitchen-basic' && yaw === 135) {
        await page.screenshot({ path: testInfo.outputPath(`${preset}-fullhd-yaw${yaw}-elev${elevation}.png`) });
      }
    }
  });
}
