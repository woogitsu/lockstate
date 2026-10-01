import { expect, test } from './network-changed-fixture';
import type {} from './oblique-world-harness';

test('real render feed cell keeps one build square under the cursor while the scene turns', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.medicalObliqueInspection())).toEqual([
    { objectId: 'object.medical-bed', assetId: 'furniture.medical-bed.variants', footprint: { width: 1, height: 2 } },
    { objectId: 'object.medicine-cabinet', assetId: 'fixture.medicine-cabinet.variants', footprint: { width: 1, height: 1 } },
  ]);
  let previousGroundPaints = 0;
  for (const [yaw, elevation] of [[-45, 25], [0, 45], [45, 65]] as const) {
    await page.evaluate(([y, e]) => window.lockstateObliqueWorldHarness.setPose(y, e), [yaw, elevation] as const);
    const point = await page.evaluate(() => window.lockstateObliqueWorldHarness.pointAtTile(3, 3));
    await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.selected())).toEqual({ tileX: 3, tileY: 3 });
    const painted = await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts());
    expect(painted.ground).toBeGreaterThan(previousGroundPaints);
    previousGroundPaints = painted.ground;
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts())).toEqual(painted);
    await page.screenshot({ path: testInfo.outputPath(`render-feed-yaw${yaw}-elev${elevation}-fullhd.png`) });
  }
});

test('near wall pixels lower around a furnished cell as yaw and elevation change', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  for (const [yaw, elevation, nearY] of [[0, 45, 4], [180, 65, 2]] as const) {
    await page.evaluate(([y, e]) => window.lockstateObliqueWorldHarness.setPose(y, e), [yaw, elevation] as const);
    const clip = await page.evaluate((tileY) => window.lockstateObliqueWorldHarness.wallClip(3, tileY), nearY);
    expect(clip.width).toBeGreaterThan(0);
    expect(clip.height).toBeGreaterThan(0);
    await page.evaluate(() => window.lockstateObliqueWorldHarness.setCellInterior(false));
    const full = await page.screenshot({ clip });
    await page.evaluate(() => window.lockstateObliqueWorldHarness.setCellInterior(true));
    const cutaway = await page.screenshot({ clip });
    expect(cutaway.equals(full), `near wall pixels did not change at yaw ${yaw}, elevation ${elevation}`).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`furnished-cell-yaw${yaw}-elev${elevation}-cutaway-fullhd.png`) });
  }
});
