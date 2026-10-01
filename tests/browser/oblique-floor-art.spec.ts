import { expect, test } from './network-changed-fixture';
import type {} from './oblique-preset-art-qa';

test('Blender Yard ground remains textured on exact quads at intermediate camera poses', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-preset-art-qa.html?preset=yard-basic');
  await expect.poll(() => page.evaluate(() => typeof window.lockstatePresetArtQA?.ready)).toBe('function');
  await page.evaluate(() => window.lockstatePresetArtQA.ready());
  for (const [yaw, elevation] of [[37, 53], [-63, 25], [135, 65]] as const) {
    await page.evaluate(([yaw, elevation]) => window.lockstatePresetArtQA.setPose(yaw!, elevation!), [yaw, elevation]);
    const report = await page.evaluate(() => window.lockstatePresetArtQA.report());
    expect(report.floorTextures).toContain('oblique-floor:floor.yard.compacted-earth');
    expect(report.floorMeshCount).toBeGreaterThan(0);
    expect(report.floorTiles).toHaveLength(64);
    expect(report.floorTiles.every((tile) => tile.sprite === 'env.floor.yard')).toBe(true);
    const shot = await page.locator('canvas').screenshot();
    const spread = await page.evaluate(async ({ base64, quad }) => {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const brightness: number[] = [];
      for (const u of [0.2, 0.35, 0.5, 0.65, 0.8]) for (const v of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        const x = Math.round(quad[0]!.x + u * (quad[1]!.x - quad[0]!.x) + v * (quad[3]!.x - quad[0]!.x));
        const y = Math.round(quad[0]!.y + u * (quad[1]!.y - quad[0]!.y) + v * (quad[3]!.y - quad[0]!.y));
        const at = (y * canvas.width + x) * 4;
        brightness.push(pixels[at]! + pixels[at + 1]! + pixels[at + 2]!);
      }
      bitmap.close();
      return Math.max(...brightness) - Math.min(...brightness);
    }, { base64: shot.toString('base64'), quad: report.floorTiles[27]!.quad });
    expect(spread, 'authored mineral/grass detail inside a tile must replace a flat fill').toBeGreaterThan(15);
    await page.screenshot({ path: testInfo.outputPath(`yard-floor-yaw${yaw}-elev${elevation}.png`) });
  }
});
