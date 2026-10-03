import { expect, test, type Page, type TestInfo } from './network-changed-fixture';
import { createRequire } from 'node:module';
import type {} from './oblique-preset-art-qa';

// Playwright already ships this PNG decoder and exports this package subpath.
// Resolve from the declared @playwright/test dependency, including pnpm's
// isolated dependency layout; no additional package is needed.
const requirePlaywright = createRequire(createRequire(import.meta.url).resolve('@playwright/test/package.json'));
const { PNG } = requirePlaywright('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } };
};

interface PixelRegion {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function countCapturedChanges(shown: Buffer, hidden: Buffer, regions: readonly PixelRegion[]): number[] {
  const a = PNG.sync.read(shown), b = PNG.sync.read(hidden);
  if (a.width !== b.width || a.height !== b.height) throw new Error('Actor screenshot dimensions changed');
  // Chromium's canvas screenshots here are opaque. Require that boundary so
  // browser canvas alpha compositing cannot change RGB values in diagnostics.
  for (const image of [a, b]) {
    for (let at = 3; at < image.data.length; at += 4) {
      if (image.data[at] !== 255) throw new Error('Actor screenshot must contain opaque captured pixels');
    }
  }
  return regions.map(region => {
    if (![region.left, region.right, region.top, region.bottom].every(Number.isInteger) ||
        region.left < 0 || region.right > a.width || region.top < 0 || region.bottom > a.height ||
        region.right <= region.left || region.bottom <= region.top) throw new Error('Actor pixel region is outside the captured canvas');
    let changed = 0;
    for (let y = region.top; y < region.bottom; y += 1) {
      for (let x = region.left; x < region.right; x += 1) {
        const at = (y * a.width + x) * 4;
        if ([0, 1, 2].some(channel => Math.abs(a.data[at + channel]! - b.data[at + channel]!) > 8)) changed += 1;
      }
    }
    return changed;
  });
}

async function capturedChanges(page: Page, testInfo: TestInfo, shown: Buffer, hidden: Buffer,
  regions: readonly PixelRegion[]): Promise<number[]> {
  const start = performance.now();
  const counts = countCapturedChanges(shown, hidden, regions);
  const nodeDecodeAndSampleMs = performance.now() - start;
  // Explicit diagnostic mode compares both decoders on the SAME real captures.
  // Normal acceptance does not send megabytes of PNGs back to the game thread.
  let browserCounts: number[] | undefined;
  let browserDecodeAndSampleMs: number | undefined;
  if (process.env['LOCKSTATE_ACTOR_PNG_EQUIVALENCE'] === '1') {
    const browserStart = performance.now();
    browserCounts = await page.evaluate(async ({ shown, hidden, regions }) => {
      async function pixels(base64: string) {
        const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
        return { width: canvas.width, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
      }
      const a = await pixels(shown), b = await pixels(hidden);
      return regions.map(region => {
        let changed = 0;
        for (let y = region.top; y < region.bottom; y += 1) {
          for (let x = region.left; x < region.right; x += 1) {
            const at = (y * a.width + x) * 4;
            if ([0, 1, 2].some(channel => Math.abs(a.data[at + channel]! - b.data[at + channel]!) > 8)) changed += 1;
          }
        }
        return changed;
      });
    }, { shown: shown.toString('base64'), hidden: hidden.toString('base64'), regions });
    browserDecodeAndSampleMs = performance.now() - browserStart;
    expect(counts, 'Node and original browser RGB sampling must agree on the same captured PNGs').toEqual(browserCounts);
  }
  await testInfo.attach('captured-actor-pixel-counts', {
    body: Buffer.from(JSON.stringify({ regions, counts, nodeDecodeAndSampleMs, browserCounts, browserDecodeAndSampleMs })),
    contentType: 'application/json',
  });
  return counts;
}

test('canonical cook medic and staff frames produce visible Blender pixels', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-preset-art-qa.html?preset=kitchen-basic&actorDepth=1&actorArt=1');
  await expect.poll(() => page.evaluate(() => typeof window.lockstatePresetArtQA?.ready)).toBe('function');
  await page.evaluate(() => window.lockstatePresetArtQA.ready());
  await page.evaluate(() => window.lockstatePresetArtQA.setPose(45, 45));
  await page.evaluate(() => window.lockstatePresetArtQA.setActors(['cook', 'medic', 'staff'].map((role, id) => ({
    id: id + 10, assetId: `actor.${role}.base`, tileX: 10 + id * 2, tileY: 12, deltaX: 0, deltaY: 0,
  }))));
  await expect.poll(() => page.evaluate(() => [...window.lockstatePresetArtQA.report().actorImages].sort()))
    .toEqual(['cook', 'medic', 'staff'].map(role => `oblique:actor.${role}.base:45:45`));
  const shown = await page.locator('canvas').screenshot();
  await page.screenshot({ path: testInfo.outputPath('blender-role-actors-fullhd.png') });
  await page.evaluate(() => window.lockstatePresetArtQA.setActorImagesVisible(false));
  const hidden = await page.locator('canvas').screenshot();
  const actors = await page.evaluate(() => window.lockstatePresetArtQA.report().actors);
  const changes = await capturedChanges(page, testInfo, shown, hidden, actors.map(actor => ({
    left: Math.floor(actor.foot.x) - 30, right: Math.floor(actor.foot.x) + 30,
    top: Math.floor(actor.foot.y) - 100, bottom: Math.floor(actor.foot.y) + 10,
  })));
  for (const changed of changes) expect(changed).toBeGreaterThan(100);
});

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
  const actors = await page.evaluate(() => window.lockstatePresetArtQA.report().actors);
  // Feet/lower legs must be hidden behind the wall; the head may extend above it.
  const counts = await capturedChanges(page, testInfo, shown, hidden, actors.map(actor => {
    const broad = actor.id === 3;
    return { left: Math.floor(actor.foot.x) - (broad ? 25 : 4), right: Math.floor(actor.foot.x) + (broad ? 25 : 4),
      top: Math.floor(actor.foot.y) - (broad ? 100 : 10), bottom: Math.floor(actor.foot.y) - 3 };
  }));
  const changes = Object.fromEntries(actors.map((actor, index) => [actor.id, counts[index]]));
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

test('moving actors keep authored solid images while their depth order changes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-preset-art-qa.html?preset=kitchen-basic&actorDepth=1&actorArt=1');
  await expect.poll(() => page.evaluate(() => typeof window.lockstatePresetArtQA?.ready)).toBe('function');
  await page.evaluate(() => window.lockstatePresetArtQA.ready());
  await page.evaluate(() => window.lockstatePresetArtQA.setPose(45, 45));
  await expect.poll(() => page.evaluate(() => window.lockstatePresetArtQA.report().solidSlots.length)).toBeGreaterThan(0);
  const initial = await page.evaluate(() => window.lockstatePresetArtQA.report().solidSlots);
  const identity = (slots: typeof initial) => slots.map(({ id, token }) => ({ id, token })).sort((a, b) => a.id.localeCompare(b.id));
  for (const actors of [
    [{ id: 1, assetId: 'actor.prisoner', tileX: 10, tileY: 8, deltaX: 0, deltaY: 0 }],
    [{ id: 1, assetId: 'actor.prisoner', tileX: 3.5, tileY: 5.5, deltaX: 0, deltaY: 0 }],
  ]) {
    await page.evaluate(next => window.lockstatePresetArtQA.setActors(next), actors);
    const slots = await page.evaluate(() => window.lockstatePresetArtQA.report().solidSlots);
    expect(identity(slots), 'actor-only frames must not recreate authored wall and fixture images').toEqual(identity(initial));
  }
  const final = await page.evaluate(() => window.lockstatePresetArtQA.report());
  expect(final.solidSlots.some((slot, index) => Math.abs(slot.depth - initial[index]!.depth) > 0.001),
    'crossing actors should change the sort depth of at least one solid').toBe(true);

  // The same actor is now behind the wall. A pixel comparison against hidden
  // actor art proves that retaining Phaser images did not uncover its lower body.
  const shown = await page.locator('canvas').screenshot();
  await page.evaluate(() => window.lockstatePresetArtQA.setActorImagesVisible(false));
  const hidden = await page.locator('canvas').screenshot();
  const actor = await page.evaluate(() => window.lockstatePresetArtQA.report().actors.find(item => item.id === 1)!);
  const [visibleLowerBodyPixels] = await capturedChanges(page, testInfo, shown, hidden, [{
    left: Math.floor(actor.foot.x) - 4, right: Math.floor(actor.foot.x) + 4,
    top: Math.floor(actor.foot.y) - 10, bottom: Math.floor(actor.foot.y) - 3,
  }]);
  expect(visibleLowerBodyPixels, 'the wall still hides an actor behind it after movement').toBe(0);
  for (const slot of final.solidSlots) expect(slot.depth, `depth of ${slot.id}`).toBeCloseTo(slot.expectedDepth, 8);
});


test('same-role actor headings remain independent and update while standing still', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/oblique-preset-art-qa.html?preset=kitchen-basic&actorDepth=1&actorArt=1');
  await expect.poll(() => page.evaluate(() => typeof window.lockstatePresetArtQA?.ready)).toBe('function');
  await page.evaluate(() => window.lockstatePresetArtQA.ready());
  await page.evaluate(() => window.lockstatePresetArtQA.setPose(90, 45));
  await page.evaluate(() => window.lockstatePresetArtQA.setActors([
    { id: 10, assetId: 'actor.guard.base', tileX: 9, tileY: 12, deltaX: 1, deltaY: 0 },
    { id: 11, assetId: 'actor.guard.base', tileX: 11, tileY: 12, deltaX: 0, deltaY: 0, facing: 'north' },
    { id: 12, assetId: 'actor.guard.base', tileX: 13, tileY: 12, deltaX: 0, deltaY: 1 },
  ]));
  await expect.poll(() => page.evaluate(() => window.lockstatePresetArtQA.report().actorImages.slice().sort()))
    .toEqual([-90, 0, 90].map(yaw => `oblique:actor.guard.base:${yaw}:45`).sort());
  const before = await page.locator('canvas').screenshot();
  await page.screenshot({ path: testInfo.outputPath('guard-independent-world-headings.png') });
  await page.evaluate(() => window.lockstatePresetArtQA.setActors([
    { id: 10, assetId: 'actor.guard.base', tileX: 9, tileY: 12, deltaX: 1, deltaY: 0 },
    { id: 11, assetId: 'actor.guard.base', tileX: 11, tileY: 12, deltaX: 0, deltaY: 0, facing: 'south' },
    { id: 12, assetId: 'actor.guard.base', tileX: 13, tileY: 12, deltaX: 0, deltaY: 1 },
  ]));
  await expect.poll(() => page.evaluate(() => window.lockstatePresetArtQA.report().actorImages.slice().sort()))
    .toEqual([0, 90, 90].map(yaw => `oblique:actor.guard.base:${yaw}:45`).sort());
  expect((await page.locator('canvas').screenshot()).equals(before)).toBe(false);
});
