import { expect, test } from './network-changed-fixture';
import type {} from './oblique-world-harness';

test('real render feed cell keeps one build square under the cursor while the scene turns', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  await expect(page.locator('canvas')).toBeVisible();
  const loadedArt = await page.evaluate(() => window.lockstateObliqueWorldHarness.artTextureKeys());
  expect(loadedArt.some((key) => key.includes('wall-module-full'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('wall-module-west-full'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('cell-door-open'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('cell-bed'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('floor-cell'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('actor-prisoner'))).toBe(true);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.loadedArtTextureCount())).toBeLessThanOrEqual(15);
  let previousGroundPaints = 0;
  for (const [yaw, elevation] of [[-45, 25], [0, 45], [45, 65]] as const) {
    await page.evaluate(([y, e]) => window.lockstateObliqueWorldHarness.setPose(y, e), [yaw, elevation] as const);
    const angleCode = `yaw${yaw < 0 ? '-' : '+'}${Math.abs(yaw).toString().padStart(2, '0')}-elev${elevation}`;
    const artBeforeSelection = await page.evaluate(() => window.lockstateObliqueWorldHarness.artTextureKeys());
    expect(artBeforeSelection
      .some((key) => key.includes(`cell-bed-${angleCode}`))).toBe(true);
    const point = await page.evaluate(() => window.lockstateObliqueWorldHarness.pointAtTile(3, 3));
    await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.selected())).toEqual({ tileX: 3, tileY: 3 });
    if (yaw === -45) {
      const artAfterSelection = await page.evaluate(() => window.lockstateObliqueWorldHarness.artTextureKeys());
      expect(artAfterSelection.length).toBeLessThan(artBeforeSelection.length);
      expect(artAfterSelection.some((key) => key.includes('cell-bed'))).toBe(true);
      expect(artAfterSelection.some((key) => key.includes('wall-module-cutaway'))).toBe(true);
      const cutaway = await page.evaluate(() => window.lockstateObliqueWorldHarness.cutawayWallIds());
      expect(cutaway).toContain('north-edge:3:5');
      expect(cutaway).not.toContain('north-edge:2:1');
    }
    const painted = await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts());
    expect(painted.ground).toBeGreaterThan(previousGroundPaints);
    previousGroundPaints = painted.ground;
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts())).toEqual(painted);
    await page.screenshot({ path: testInfo.outputPath(`render-feed-yaw${yaw}-elev${elevation}-fullhd.png`) });
  }
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.loadedArtTextureCount())).toBeLessThan(70);
  const actorBefore = await page.evaluate(() => window.lockstateObliqueWorldHarness.actorArtPosition());
  const staticPaints = await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts().ground);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.moveActorToTile(4));
  const actorAfter = await page.evaluate(() => window.lockstateObliqueWorldHarness.actorArtPosition());
  expect(actorAfter?.x).not.toBe(actorBefore?.x);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts().ground)).toBe(staticPaints);
});
