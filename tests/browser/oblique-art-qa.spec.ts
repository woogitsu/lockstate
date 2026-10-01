import { expect, test } from './network-changed-fixture';
import type {} from './oblique-art-qa';

test('three authored furniture textures follow camera yaw and elevation at Full HD', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-art-qa.html');
  await page.evaluate(() => window.lockstateObliqueArtQa.ready());
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueArtQa.shownImages())).toBe(3);
  for (const [yaw, elevation] of [[0, 20], [90, 70], [180, 20], [270, 70]] as const) {
    await page.evaluate(({ nextYaw, nextElevation }) => window.lockstateObliqueArtQa.setPose(nextYaw, nextElevation), { nextYaw: yaw, nextElevation: elevation });
    await expect.poll(() => page.evaluate(() => window.lockstateObliqueArtQa.keys())).toEqual({
      'fixture.cell.waste_bin': `oblique:fixture.cell.waste_bin:${yaw}:${elevation}`,
      'furniture.office.desk.generic': `oblique:furniture.office.desk.generic:${yaw}:${elevation}`,
      'fixture.cell.sink.handwash': `oblique:fixture.cell.sink.handwash:${yaw}:${elevation}`,
    });
    await expect.poll(() => page.evaluate(() => window.lockstateObliqueArtQa.shownImages())).toBe(3);
    expect(await page.evaluate(() => window.lockstateObliqueArtQa.fallbackCommands())).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`models-yaw-${yaw}-elev-${elevation}-fullhd.png`) });
  }
  const widths = await page.evaluate(() => window.lockstateObliqueArtQa.imageWidths());
  await page.evaluate(() => window.lockstateObliqueArtQa.zoomIn());
  const zoomedWidths = await page.evaluate(() => window.lockstateObliqueArtQa.imageWidths());
  expect(zoomedWidths).toHaveLength(widths.length);
  for (let index = 0; index < widths.length; index += 1) {
    expect(zoomedWidths[index]).toBeCloseTo(widths[index]! * 1.25, 5);
  }
});
