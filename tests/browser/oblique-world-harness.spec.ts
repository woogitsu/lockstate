import { expect, test } from './network-changed-fixture';
import type {} from './oblique-world-harness';

test('small angled viewport culls and caches static ground', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 300 });
  await page.goto('/tests/browser/oblique-world-harness.html?ground-stress=1');
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  const counts = await page.evaluate(() => ({
    projected: window.lockstateObliqueWorldHarness.projectedGroundTileCount(),
    sprites: window.lockstateObliqueWorldHarness.groundArtImageCount(),
    painted: window.lockstateObliqueWorldHarness.paintedGroundTileCount(),
  }));
  expect(counts.projected).toBeGreaterThan(0);
  expect(counts.sprites).toBeGreaterThan(0);
  expect(counts.sprites).toBeLessThan(counts.projected);
  expect(counts.painted).toBeLessThan(counts.projected);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.visibleUncachedGroundObjectCount())).toBe(0);
});

test('hover reports the logical whole square under the pointer to the build HUD', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  const point = await page.evaluate(() => window.lockstateObliqueWorldHarness.pointAtTile(3, 3));
  await page.mouse.move(point.x, point.y);
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueWorldHarness.hovered())).toEqual({ tileX: 3, tileY: 3 });
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setPose(90, 25));
  const expected = await page.evaluate((screen) => window.lockstateObliqueWorldHarness.tileAtScreen(screen), point);
  expect(expected).not.toEqual({ tileX: 3, tileY: 3 });
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.hovered())).toEqual(expected);
});

test('build mode blocks right-drag turning and the HUD observes allowed turns', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  const before = await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraAngles());
  const countBefore = await page.evaluate(() => window.lockstateObliqueWorldHarness.poseChangeCount());
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setRotationEnabled(false));
  await page.mouse.move(950, 540);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1020, 580, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraAngles())).toEqual(before);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.poseChangeCount())).toBe(countBefore);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setRotationEnabled(true));
  await page.mouse.move(950, 540);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1020, 580, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const after = await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraAngles());
  expect(after.yawRadians).not.toBe(before.yawRadians);
  expect(after.elevationRadians).not.toBe(before.elevationRadians);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.poseChangeCount())).toBeGreaterThan(countBefore);
});

test('angled zoom and minimap navigation act on the visible scene', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.waitForFunction(() => window.lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  const before = await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraTargetAndZoom());
  await page.evaluate(() => window.lockstateObliqueWorldHarness.stepCameraZoom('in'));
  const zoomed = await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraTargetAndZoom());
  expect(zoomed.zoom).toBeGreaterThan(before.zoom);
  expect({ x: zoomed.x, y: zoomed.y }).toEqual({ x: before.x, y: before.y });
  await page.evaluate(() => window.lockstateObliqueWorldHarness.stepCameraZoom('out'));
  expect((await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraTargetAndZoom())).zoom).toBeCloseTo(before.zoom);
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueWorldHarness.navigateToMinimapPoint(1, 1))).toBe(true);
  const moved = await page.evaluate(() => window.lockstateObliqueWorldHarness.cameraTargetAndZoom());
  expect(moved.x).toBeGreaterThan(before.x);
  expect(moved.y).toBeGreaterThan(before.y);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.navigateToMinimapPoint(Number.NaN, 0))).toBe(false);
});

test('one camera turn batches newly loaded Blender frames into one ground repaint', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.waitForFunction(() => window.lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  const before = await page.evaluate(() => window.lockstateObliqueWorldHarness.groundArtPaintCount());
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setPose(90, 25));
  const after = await page.evaluate(() => window.lockstateObliqueWorldHarness.groundArtPaintCount());
  expect(after - before).toBeLessThanOrEqual(3);
  expect(after - before).toBeGreaterThanOrEqual(1);
});

test('real render feed cell keeps one build square under the cursor while the scene turns', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.waitForFunction(() => window.lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  await expect(page.locator('canvas')).toBeVisible();
  const loadedArt = await page.evaluate(() => window.lockstateObliqueWorldHarness.artTextureKeys());
  expect(loadedArt.some((key) => key.includes('wall-module-full'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('wall-module-west-full'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('cell-door-open'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('cell-bed'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('cell-sink'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('cell-waste-bin'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('dining-table'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('corridor-bench'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('prep-counter'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('kitchen-stove'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('floor-cell'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('floor-terrain-dirt'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('floor-terrain-grass'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('floor-dirt-grass-edge-north'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('floor-shower'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('shower-head'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('shower-privacy-door-full'))).toBe(true);
  expect(loadedArt.some((key) => key.includes('actor-prisoner'))).toBe(true);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.loadedArtTextureCount()))
    .toBeLessThanOrEqual(await page.evaluate(() => window.lockstateObliqueWorldHarness.artCatalogCount()));
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
      expect(artAfterSelection.filter((key) => key.includes('wall-module-full')).length)
        .toBeLessThan(artBeforeSelection.filter((key) => key.includes('wall-module-full')).length);
      expect(artAfterSelection.some((key) => key.includes('cell-bed'))).toBe(true);
      expect(artAfterSelection.some((key) => key.includes('cell-sink'))).toBe(true);
      expect(artAfterSelection.some((key) => key.includes('cell-waste-bin'))).toBe(true);
      expect(artAfterSelection.some((key) => key.includes('dining-table'))).toBe(true);
      expect(artAfterSelection.some((key) => key.includes('corridor-bench'))).toBe(true);
      expect(artAfterSelection.some((key) => key.includes('prep-counter'))).toBe(true);
      expect(artAfterSelection.some((key) => key.includes('kitchen-stove'))).toBe(true);
      expect(artAfterSelection.some((key) => key.includes('wall-module-cutaway'))).toBe(true);
      expect(artAfterSelection.some((key) => key.includes('wall-module-west-cutaway'))).toBe(true);
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
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.loadedArtTextureCount()))
    .toBeLessThanOrEqual(4 * await page.evaluate(() => window.lockstateObliqueWorldHarness.artCatalogCount()));
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setPose(0, 45));
  const showerPoint = await page.evaluate(() => window.lockstateObliqueWorldHarness.pointAtTile(6, 2));
  await page.mouse.click(showerPoint.x, showerPoint.y);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.cutawayWallIds())).toContain('north-edge:6:3');
  expect((await page.evaluate(() => window.lockstateObliqueWorldHarness.artTextureKeys()))
    .some((key) => key.includes('shower-privacy-door-cutaway'))).toBe(true);
  const actorBefore = await page.evaluate(() => window.lockstateObliqueWorldHarness.actorArtPosition());
  const staticPaints = await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts().ground);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.moveActorToTile(4));
  const actorAfter = await page.evaluate(() => window.lockstateObliqueWorldHarness.actorArtPosition());
  expect(actorAfter?.x).not.toBe(actorBefore?.x);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts().ground)).toBe(staticPaints);
});

test('Full HD scene selects both corner orientations and one T without doubling the shared wall', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.waitForFunction(() => window.lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  for (const yaw of [-45, 0, 45]) {
    await page.evaluate((angle) => window.lockstateObliqueWorldHarness.setPose(angle, 45), yaw);
    const keys = await page.evaluate(() => window.lockstateObliqueWorldHarness.artTextureKeys());
    expect(keys.filter((key) => key.includes('wall-junction-t-west-full'))).toHaveLength(1);
    expect(keys.filter((key) => key.includes('wall-corner-north-east-full'))).toHaveLength(1);
    expect(keys.filter((key) => key.includes('wall-corner-south-east-full'))).toHaveLength(1);
    expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.artErrors())).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`junction-yaw${yaw}-fullhd.png`) });
  }
});

test('whole-square dirt grid stays legible above Blender ground at three yaw angles', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.waitForFunction(() => window.lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setBuildGrid(true));
  for (const yaw of [-45, 0, 45]) {
    await page.evaluate((angle) => window.lockstateObliqueWorldHarness.setPose(angle, 45), yaw);
    const points = await page.evaluate(() => ({
      edge: window.lockstateObliqueWorldHarness.pointAtGround(7, 6.5),
      left: window.lockstateObliqueWorldHarness.pointAtGround(6.8, 6.5),
      right: window.lockstateObliqueWorldHarness.pointAtGround(7.2, 6.5),
    }));
    const screenshot = await page.screenshot({ path: testInfo.outputPath(`dirt-grid-yaw${yaw}-fullhd.png`) });
    const contrast = await page.evaluate(async ({ data, points }) => {
      const image = new Image();
      image.src = data;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('Screenshot canvas unavailable');
      context.drawImage(image, 0, 0);
      const luminance = (x: number, y: number): number => {
        const pixel = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return 0.2126 * pixel[0]! + 0.7152 * pixel[1]! + 0.0722 * pixel[2]!;
      };
      const edge = Math.min(...[-1, 0, 1].flatMap((dx) => [-1, 0, 1]
        .map((dy) => luminance(points.edge.x + dx, points.edge.y + dy))));
      return Math.min(luminance(points.left.x, points.left.y),
        luminance(points.right.x, points.right.y)) - edge;
    }, { data: `data:image/png;base64,${screenshot.toString('base64')}`, points });
    expect(contrast, `yaw ${yaw}° grid contrast`).toBeGreaterThan(18);
  }
});

test('selected cell shows the north door cutaway Blender module', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.waitForFunction(() => window.lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  for (const yaw of [-45, 0, 45]) {
    await page.evaluate((angle) => window.lockstateObliqueWorldHarness.setPose(angle, 45), yaw);
    const point = await page.evaluate(() => window.lockstateObliqueWorldHarness.pointAtTile(3, 3));
    await page.mouse.click(point.x, point.y);
    expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.selected())).toEqual({ tileX: 3, tileY: 3 });
    const textures = await page.evaluate(() => window.lockstateObliqueWorldHarness.artTextureKeys());
    expect(textures.some((key) => key.includes('cell-door-north-cutaway')), `yaw ${yaw}° cutaway door`).toBe(true);
    expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.artErrors())).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`north-door-cutaway-yaw${yaw}-fullhd.png`) });
  }
});

test('built cell keeps a quiet browse grid and a strong build hover', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html');
  await page.waitForFunction(() => window.lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setPose(-45, 45));
  const points = await page.evaluate(() => ({
    edge: window.lockstateObliqueWorldHarness.pointAtGround(7, 6.5),
    left: window.lockstateObliqueWorldHarness.pointAtGround(6.8, 6.5),
    right: window.lockstateObliqueWorldHarness.pointAtGround(7.2, 6.5),
  }));
  const screenshot = await page.screenshot({ path: testInfo.outputPath('browse-grid-before-fullhd.png') });
  const contrast = await page.evaluate(async ({ data, points }) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Screenshot canvas unavailable');
    context.drawImage(image, 0, 0);
    const luminance = (x: number, y: number): number => {
      const pixel = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return 0.2126 * pixel[0]! + 0.7152 * pixel[1]! + 0.0722 * pixel[2]!;
    };
    const edge = Math.min(...[-1, 0, 1].flatMap((dx) => [-1, 0, 1]
      .map((dy) => luminance(points.edge.x + dx, points.edge.y + dy))));
    return Math.min(luminance(points.left.x, points.left.y),
      luminance(points.right.x, points.right.y)) - edge;
  }, { data: `data:image/png;base64,${screenshot.toString('base64')}`, points });
  expect(contrast).toBeLessThan(12);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setPose(0, 45));
  await page.screenshot({ path: testInfo.outputPath('browse-grid-yaw0-fullhd.png') });
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setPose(45, 45));
  const browseYaw45 = await page.screenshot({ path: testInfo.outputPath('browse-grid-yaw45-fullhd.png') });
  const beforeToggle = await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts().ground);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.setBuildGrid(true));
  const build = await page.screenshot({ path: testInfo.outputPath('build-grid-yaw45-fullhd.png') });
  expect(build.equals(browseYaw45)).toBe(false);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.paintCounts().ground)).toBe(beforeToggle);
  const hover = await page.evaluate(() => window.lockstateObliqueWorldHarness.pointAtTile(6, 6));
  await page.mouse.move(hover.x, hover.y);
  const active = await page.screenshot({ path: testInfo.outputPath('build-hover-yaw45-fullhd.png') });
  expect(active.equals(build)).toBe(false);
});
