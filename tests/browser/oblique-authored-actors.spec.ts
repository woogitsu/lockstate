import { expect, test } from './network-changed-fixture';
import type {} from './oblique-preset-art-qa';

test('authored prisoner and guard pixels share wall depth at Full HD', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-preset-art-qa.html?preset=kitchen-basic&actorDepth=1&actorArt=1');
  await expect.poll(() => page.evaluate(() => typeof window.lockstatePresetArtQA?.ready)).toBe('function');
  await page.evaluate(() => window.lockstatePresetArtQA.ready());
  await page.evaluate(() => window.lockstatePresetArtQA.setPose(45, 45));
  await expect.poll(() => page.evaluate(() => window.lockstatePresetArtQA.report().actorImages.length)).toBe(3);
  const shown = await page.locator('canvas').screenshot();
  await page.screenshot({ path: testInfo.outputPath('blender-actors-wall-depth-fullhd.png') });
  await page.evaluate(() => window.lockstatePresetArtQA.setActorImagesVisible(false));
  const hidden = await page.locator('canvas').screenshot();
  const changes = await page.evaluate(async ({ shown, hidden }) => {
    async function pixels(base64: string) {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const result = { width: canvas.width, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
      bitmap.close();
      return result;
    }
    const a = await pixels(shown); const b = await pixels(hidden);
    const result: Record<number, number> = {};
    for (const actor of window.lockstatePresetArtQA.report().actors) {
      let changed = 0;
      // Feet/lower legs must be hidden behind the wall; the head may extend above it.
      const broad = actor.id === 3;
      for (let y = Math.floor(actor.foot.y) - (broad ? 100 : 10); y < Math.floor(actor.foot.y) - 3; y += 1) {
        for (let x = Math.floor(actor.foot.x) - (broad ? 25 : 4); x < Math.floor(actor.foot.x) + (broad ? 25 : 4); x += 1) {
          const at = (y * a.width + x) * 4;
          if ([0, 1, 2].some(channel => Math.abs(a.data[at + channel]! - b.data[at + channel]!) > 8)) changed += 1;
        }
      }
      result[actor.id] = changed;
    }
    return result;
  }, { shown: shown.toString('base64'), hidden: hidden.toString('base64') });
  expect(changes[1], 'rear actor lower body must remain covered by the wall').toBe(0);
  expect(changes[2], 'foreground prisoner must use visible authored pixels').toBeGreaterThan(10);
  expect(changes[3], 'guard must use visible authored pixels').toBeGreaterThan(100);
});

test('moving and replaced visible actors reuse actual Phaser images', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-preset-art-qa.html?preset=kitchen-basic&actorDepth=1&actorArt=1');
  await expect.poll(() => page.evaluate(() => typeof window.lockstatePresetArtQA?.ready)).toBe('function');
  await page.evaluate(() => window.lockstatePresetArtQA.ready());
  await page.evaluate(() => window.lockstatePresetArtQA.setPose(45, 45));
  await expect.poll(() => page.evaluate(() => window.lockstatePresetArtQA.report().actorSlots.length)).toBe(3);
  const slots = await page.evaluate(() => window.lockstatePresetArtQA.report().actorSlots);
  for (let step = 0; step < 5; step += 1) {
    await page.evaluate(async step => window.lockstatePresetArtQA.setActors([
      { id: 1, assetId: 'actor.prisoner', tileX: 3.5 + step / 10, tileY: 5.5, deltaX: 0, deltaY: 0 },
      { id: 2, assetId: 'actor.prisoner', tileX: 10 + step / 10, tileY: 8, deltaX: 0, deltaY: 0 },
      { id: 3, assetId: 'actor.guard', tileX: 11, tileY: 10 + step / 10, deltaX: 0, deltaY: 0 },
    ]), step);
    expect([...(await page.evaluate(() => window.lockstatePresetArtQA.report().actorSlots))].sort((a, b) => a.id - b.id))
      .toEqual([...slots].sort((a, b) => a.id - b.id));
  }
  await page.evaluate(async () => window.lockstatePresetArtQA.setActors([
    { id: 4, assetId: 'actor.guard', tileX: 11, tileY: 10, deltaX: 0, deltaY: 0 },
  ]));
  const replacement = await page.evaluate(() => window.lockstatePresetArtQA.report().actorSlots);
  expect(replacement).toHaveLength(1);
  expect(replacement[0]!.id).toBe(4);
  expect(slots.map(slot => slot.token)).toContain(replacement[0]!.token);
});
