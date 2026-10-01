import { expect, test } from './network-changed-fixture';
import type {} from './oblique-art-runtime';

test('authored furniture stays visible, turns, and scales with the angled camera at Full HD', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-art-runtime.html');
  await page.evaluate(() => window.lockstateObliqueArtRuntime.ready());
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueArtRuntime.imageCount())).toBe(1);
  await page.evaluate(() => window.lockstateObliqueArtRuntime.setPose(180, 20));
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueArtRuntime.key()))
    .toBe('oblique:furniture.medical-bed.variants:180:20');
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueArtRuntime.imageCount())).toBe(1);
  expect(await page.evaluate(() => window.lockstateObliqueArtRuntime.imageOriginY())).toBe(0.5);
  expect(await page.evaluate(() => window.lockstateObliqueArtRuntime.fallbackCommands())).toBe(0);
  const width = await page.evaluate(() => window.lockstateObliqueArtRuntime.imageWidth());
  await page.evaluate(() => window.lockstateObliqueArtRuntime.zoomIn());
  expect(await page.evaluate(() => window.lockstateObliqueArtRuntime.imageWidth())).toBeCloseTo(width! * 1.25, 5);
});

test('built storage rack consumes its Blender frame in the angled scene', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-art-runtime.html?asset=storage-rack');
  await page.evaluate(() => window.lockstateObliqueArtRuntime.ready());
  await page.evaluate(() => window.lockstateObliqueArtRuntime.setPose(45, 45));
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueArtRuntime.key()))
    .toBe('oblique:furniture.storage.rack.wooden:45:45');
  await expect.poll(() => page.evaluate(() => window.lockstateObliqueArtRuntime.imageCount())).toBe(1);
  expect(await page.evaluate(() => window.lockstateObliqueArtRuntime.fallbackCommands())).toBe(0);
});
