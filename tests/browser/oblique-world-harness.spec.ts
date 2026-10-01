import { expect, test } from './network-changed-fixture';
import type {} from './oblique-world-harness';

test('real render feed cell keeps one build square under the cursor while the scene turns', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraPorts())).toEqual({ tile: true, minimap: true, zoom: true, sink: true });
  await expect(page.locator('canvas')).toBeVisible();
  const beforeDrag = await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraPose());
  await page.mouse.move(960, 540);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1040, 500);
  await page.mouse.up({ button: 'right' });
  const afterDrag = await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraPose());
  expect(afterDrag.yawDegrees).not.toBeCloseTo(beforeDrag.yawDegrees, 3);
  expect(afterDrag.elevationDegrees).not.toBeCloseTo(beforeDrag.elevationDegrees, 3);
  expect(afterDrag.elevationDegrees).toBeGreaterThanOrEqual(20);
  expect(afterDrag.elevationDegrees).toBeLessThanOrEqual(80);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.medicalObliqueInspection())).toEqual([
    { objectId: 'object.medical-bed', assetId: 'furniture.medical-bed.variants', footprint: { width: 1, height: 2 } },
    { objectId: 'object.medicine-cabinet', assetId: 'fixture.medicine-cabinet.variants', footprint: { width: 1, height: 1 } },
  ]);
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueWorldHarness.registryStatus())).toBe('loaded');
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueWorldHarness.furnitureSpriteFrame('medical-bed-1'))).toMatch(/\.png$/);
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
