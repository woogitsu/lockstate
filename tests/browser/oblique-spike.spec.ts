import { expect, test } from './network-changed-fixture';
import type {} from './oblique-spike';

test('one visible square stays clickable in the real Phaser preview across adjustable poses', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-spike.html');
  await page.evaluate(() => window.lockstateObliqueSpike.ready());
  await expect(page.locator('canvas')).toBeVisible();

  for (const [yaw, elevation] of [[-45, 25], [0, 45], [45, 65]] as const) {
    await page.evaluate(([y, e]) => window.lockstateObliqueSpike.setPose(y, e), [yaw, elevation] as const);
    const point = await page.evaluate(() => window.lockstateObliqueSpike.screenPointForTile(2, 2));
    await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => window.lockstateObliqueSpike.selection())).toEqual({ tileX: 2, tileY: 2 });
    expect(await page.evaluate(() => window.lockstateObliqueSpike.pose().elevationDegrees)).toBeCloseTo(elevation, 9);
    await page.screenshot({ path: testInfo.outputPath(`oblique-yaw${yaw}-elev${elevation}-fullhd.png`) });
  }
});
