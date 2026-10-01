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

test('square Build ghost follows a stationary cursor when the camera turns', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  await page.evaluate(() => window.lockstateObliqueWorldHarness.armSquareBuild(true));
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setPose(0, 45));
  const pointer = { x: 1100, y: 580 };
  await page.mouse.move(pointer.x, pointer.y);
  const initial = await page.evaluate(() => window.lockstateObliqueWorldHarness.targetSquares());
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setPose(37, 25));
  const expected = (() => {
    const yaw = 37 * Math.PI / 180;
    const elevation = 25 * Math.PI / 180;
    const across = (pointer.x - 960) / 1.25;
    const depth = (pointer.y - 540) / (1.25 * Math.sin(elevation));
    return [{
      x: Math.floor((4 * 64 + Math.cos(yaw) * across + Math.sin(yaw) * depth) / 64),
      y: Math.floor((4 * 64 - Math.sin(yaw) * across + Math.cos(yaw) * depth) / 64),
    }];
  })();
  expect(initial).not.toEqual(expected);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.targetSquares()),
    'the preview still addressed the old ground square without pointer motion').toEqual(expected);
  await page.mouse.click(pointer.x, pointer.y);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.placedSquares().at(-1))).toEqual(expected);
});

test('square Build preview and command agree across intermediate angles, drag directions and map edge', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  await page.evaluate(() => window.lockstateObliqueWorldHarness.armSquareBuild(true));
  for (const [yaw, elevation] of [[37, 25], [-63, 65]] as const) {
    await page.evaluate(([y, e]) => window.lockstateObliqueWorldHarness.setPose(y, e), [yaw, elevation] as const);
    for (const [from, to] of [
      [{ x: 2, y: 2 }, { x: 5, y: 2 }],
      [{ x: 5, y: 2 }, { x: 2, y: 2 }],
      [{ x: 2, y: 2 }, { x: 2, y: 5 }],
      [{ x: 2, y: 5 }, { x: 2, y: 2 }],
      [{ x: 0, y: 0 }, { x: 0, y: 3 }],
      [{ x: 7, y: 7 }, { x: 7, y: 4 }],
    ] as const) {
      const start = await page.evaluate((tile) => window.lockstateObliqueWorldHarness.pointAtTile(tile.x, tile.y), from);
      const end = await page.evaluate((tile) => window.lockstateObliqueWorldHarness.pointAtTile(tile.x, tile.y), to);
      const count = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + 1;
      const expected = Array.from({ length: count }, (_, index) => ({
        x: from.x + Math.sign(to.x - from.x) * index,
        y: from.y + Math.sign(to.y - from.y) * index,
      }));
      await page.mouse.move(start.x, start.y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(end.x, end.y, { steps: 6 });
      expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.targetSquares()),
        `preview mismatch yaw ${yaw}, elevation ${elevation}, ${JSON.stringify(from)} to ${JSON.stringify(to)}`)
        .toEqual(expected);
      await page.mouse.up({ button: 'left' });
      expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.placedSquares().at(-1)),
        `placed footprint mismatch yaw ${yaw}, elevation ${elevation}`).toEqual(expected);
    }
  }
});
