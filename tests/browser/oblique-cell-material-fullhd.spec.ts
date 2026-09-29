import { expect, test } from './network-changed-fixture';
import type {} from './oblique-world-harness';

test('warm Blender cell wall and floor render in the real Full HD scene at three yaws', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.waitForFunction(() => window.lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());

  for (const [yaw, elevation] of [[-45, 25], [0, 45], [45, 65]] as const) {
    await page.evaluate(([angle, pitch]) => window.lockstateObliqueWorldHarness.setPose(angle, pitch),
      [yaw, elevation] as const);
    const cell = await page.evaluate(() => window.lockstateObliqueWorldHarness.pointAtTile(3, 3));
    await page.mouse.click(cell.x, cell.y);
    await expect.poll(() => page.evaluate(() => window.lockstateObliqueWorldHarness.selected()))
      .toEqual({ tileX: 3, tileY: 3 });
    await expect.poll(() => page.evaluate(() => window.lockstateObliqueWorldHarness.artTextureKeys()))
      .toEqual(expect.arrayContaining([expect.stringContaining('floor-cell')]));
    const keys = await page.evaluate(() => window.lockstateObliqueWorldHarness.artTextureKeys());
    expect(keys.some((key) => key.includes('wall-module-full') || key.includes('wall-module-cutaway'))).toBe(true);
    expect(keys.some((key) => key.includes('cell-bed'))).toBe(true);
    if (yaw === -45) {
      expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.cutawayWallIds()))
        .toContain('north-edge:3:5');
    }
    await page.screenshot({ path: testInfo.outputPath(`warm-cell-yaw${yaw}-elev${elevation}-fullhd.png`) });
  }
  expect(pageErrors).toEqual([]);
});
