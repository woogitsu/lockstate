import { expect, test } from './network-changed-fixture';
import type {} from './oblique-preset-art-qa';

test('actor depth probe at full HD', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-preset-art-qa.html?preset=kitchen-basic&actorDepth=1');
  await page.evaluate(() => window.lockstatePresetArtQA.ready());
  await page.evaluate(() => window.lockstatePresetArtQA.setPose(45, 45));
  await expect.poll(() => page.evaluate(() => window.lockstatePresetArtQA.report().imageCount)).toBeGreaterThan(0);
  const shot = await page.locator('canvas').screenshot();
  const bodyPixels = await page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts: Record<number, number> = {};
    for (const actor of window.lockstatePresetArtQA.report().actors) {
      let orange = 0;
      // Inspect only the lower torso: the head may legitimately extend above
      // a 0.75-tile wall. A foreground actor must remain visible in the same run.
      for (let y = Math.floor(actor.foot.y) - 10; y < Math.floor(actor.foot.y) - 3; y += 1) {
        for (let x = Math.floor(actor.foot.x) - 4; x < Math.floor(actor.foot.x) + 4; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (Math.abs(data[offset]! - 221) < 8 && Math.abs(data[offset + 1]! - 131) < 8 && Math.abs(data[offset + 2]! - 66) < 8) orange += 1;
        }
      }
      counts[actor.id] = orange;
    }
    bitmap.close();
    return counts;
  }, shot.toString('base64'));
  expect(bodyPixels[1], 'wall must cover the lower torso behind it').toBe(0);
  expect(bodyPixels[2], 'foreground actor must still be drawn').toBeGreaterThan(40);
  await page.screenshot({ path: testInfo.outputPath('actor-depth-yaw45-elev45.png') });
});
