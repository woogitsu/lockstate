import { expect, test } from './network-changed-fixture';
import type {} from './oblique-world-harness';

test('Full HD angled 64 × 64 cell fixture keeps the large world visible', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-world-harness.html?large-stress=1');
  await page.waitForFunction(() => Boolean(window.lockstateObliqueWorldHarness));
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueWorldHarness.projectedGroundTileCount()))
    .toBeGreaterThan(0);
  const zoomRepaintMs = await page.evaluate(() => {
    const durations: number[] = [];
    for (let step = 0; step < 3; step += 1) {
      const start = performance.now();
      window.lockstateObliqueWorldHarness.stepCameraZoom('out');
      durations.push(performance.now() - start);
    }
    return durations;
  });
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(async () => {
    const harness = window.lockstateObliqueWorldHarness;
    const frames: number[] = [];
    let last = performance.now();
    for (let index = 0; index < 90; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now();
      frames.push(now - last);
      last = now;
    }
    frames.sort((a, b) => a - b);
    return {
      zoom: harness.cameraTargetAndZoom().zoom,
      projectedGround: harness.projectedGroundTileCount(),
      paintedGround: harness.paintedGroundTileCount(),
      groundArt: harness.groundArtImageCount(),
      projectedRaised: harness.projectedRaisedObjectCount(),
      raisedArt: harness.raisedArtImageCount(),
      visibleUncachedRaised: harness.visibleUncachedRaisedObjectCount(),
      visibleViewportComposites: harness.visibleViewportCompositeCount(),
      canvasAntialias: harness.canvasAntialiasEnabled(),
      loadedTextures: harness.loadedArtTextureCount(),
      estimatedTextureBytes: harness.estimatedTextureBytes(),
      artErrors: harness.artErrors(),
      frameMedianMs: frames[Math.floor(frames.length / 2)],
      frameP95Ms: frames[Math.floor(frames.length * 0.95)],
    };
  });
  const cdp = await page.context().newCDPSession(page);
  const heap = await cdp.send('Runtime.getHeapUsage');
  await page.screenshot({ path: testInfo.outputPath('oblique-large-64x64-fullhd.png') });
  console.log('OBLIQUE_LARGE_METRICS', JSON.stringify({ ...metrics, zoomRepaintMs, heapUsedBytes: heap.usedSize }));
  expect(metrics.zoom).toBeLessThan(0.7);
  expect(metrics.projectedGround).toBeGreaterThan(1_024);
  expect(metrics.projectedRaised).toBeGreaterThan(400);
  expect(metrics.raisedArt).toBeGreaterThan(100);
  expect(metrics.visibleUncachedRaised).toBe(0);
  expect(metrics.visibleViewportComposites).toBe(1);
  expect(metrics.canvasAntialias).toBe(false);
  expect(metrics.estimatedTextureBytes).toBeLessThan(64 * 1024 * 1024);
  expect(metrics.artErrors).toEqual([]);
  const pick = await page.evaluate(() => window.lockstateObliqueWorldHarness.pointAtTile(34, 34));
  await page.mouse.click(pick.x, pick.y);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.selected())).toEqual({ tileX: 34, tileY: 34 });
  expect((await page.evaluate(() => window.lockstateObliqueWorldHarness.cutawayWallIds())).length).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('oblique-large-64x64-cutaway-fullhd.png') });
  const actorBefore = await page.evaluate(() => window.lockstateObliqueWorldHarness.actorArtPosition());
  await page.evaluate(() => window.lockstateObliqueWorldHarness.moveActorToTile(34));
  const actorAfter = await page.evaluate(() => window.lockstateObliqueWorldHarness.actorArtPosition());
  expect(actorAfter).toBeDefined();
  expect(actorAfter?.x).not.toBe(actorBefore?.x);
  expect(await page.evaluate(() => window.lockstateObliqueWorldHarness.visibleUncachedRaisedObjectCount())).toBe(0);
});
