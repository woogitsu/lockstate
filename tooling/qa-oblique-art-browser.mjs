/** Full HD Chromium proof for selected-frame streaming and a fixed sprite pivot. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5187';
const browser = await chromium.launch({ headless: true });
const preview = (name) => join(tmpdir(), `lockstate-oblique-${name}.png`);
const stem = (slug, yaw, elevation) => `${slug}-yaw${yaw < 0 ? '-' : '+'}${String(Math.abs(yaw)).padStart(2, '0')}-elev${elevation}`;

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const failures = [];
  const images = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/assets/environment/oblique/')) images.push(response);
  });
  await page.goto(`${origin}/art-angle-preview.html`, { waitUntil: 'networkidle' });
  await page.locator('body[data-loaded-frame]').waitFor();
  const initial = await page.locator('body').getAttribute('data-loaded-frame');
  if (!initial?.includes(stem('wall-module-full', 0, 45))) throw new Error(`Wrong initial frame: ${initial}`);
  if (images.length !== 1) throw new Error(`Startup should stream one texture, loaded ${images.length}.`);
  const initialBytes = (await images[0].body()).length;
  const yawAngles = Array.from({ length: 24 }, (_, index) => -180 + index * 15);
  const latenciesMs = [];
  const captures = [];
  await page.mouse.move(1370, 585);
  for (const yaw of yawAngles) {
    const started = performance.now();
    await page.locator(`[data-axis="yaw"][data-angle="${yaw}"]`).click();
    await page.waitForFunction((expected) => document.body.dataset.loadedFrame?.includes(expected),
      stem('wall-module-full', yaw, 45));
    latenciesMs.push(performance.now() - started);
    const pivot = await page.locator('body').getAttribute('data-pivot-screen');
    if (pivot !== '1370,585') throw new Error(`Sprite pivot drifted at yaw ${yaw}: ${pivot}`);
    if ([-180, -90, 0, 90, 165].includes(yaw)) {
      const path = preview(`wall-yaw${yaw}-elev45`);
      await page.screenshot({ path });
      captures.push(path);
    }
  }
  if (images.length !== 24) throw new Error(`Full yaw sweep should fetch 24 wall frames, got ${images.length}.`);
  const beforeCacheHit = images.length;
  await page.locator('[data-axis="yaw"][data-angle="-180"]').click();
  await page.waitForFunction(() => document.body.dataset.loadedFrame?.includes('yaw-180-elev45'));
  if (images.length !== beforeCacheHit) throw new Error('Returning to a cached yaw fetched another image.');

  await page.locator('[data-axis="elevation"][data-angle="25"]').click();
  await page.waitForFunction(() => document.body.dataset.loadedFrame?.includes('yaw-180-elev25'));
  await page.locator('[data-axis="elevation"][data-angle="65"]').click();
  await page.waitForFunction(() => document.body.dataset.loadedFrame?.includes('yaw-180-elev65'));
  const otherModules = [
    ['furniture.cell.bed.single.variants', 'cell-bed'],
    ['door.interior.open.full', 'cell-door-open'],
    ['fixture.cell.toilet_sink', 'cell-toilet'],
    ['furniture.storage.rack.wooden', 'cell-storage-rack'],
    ['furniture.chair.wooden', 'cell-chair'],
  ];
  await page.locator('[data-axis="yaw"][data-angle="45"]').click();
  await page.locator('[data-axis="elevation"][data-angle="25"]').click();
  for (const [assetId, slug] of otherModules) {
    await page.locator(`[data-asset-id="${assetId}"]`).click();
    await page.waitForFunction((expected) => document.body.dataset.loadedFrame?.includes(expected), stem(slug, 45, 25));
    const path = preview(`${slug}-yaw45-elev25`);
    await page.screenshot({ path });
    captures.push(path);
  }
  const beforeCutaway = images.length;
  await page.locator('[data-asset-id="wall.interior.module.cutaway"]').click();
  for (const elevation of [25, 65]) {
    await page.locator(`[data-axis="elevation"][data-angle="${elevation}"]`).click();
    for (const yaw of yawAngles) {
      await page.locator(`[data-axis="yaw"][data-angle="${yaw}"]`).click();
      await page.waitForFunction((expected) => document.body.dataset.loadedFrame?.includes(expected),
        stem('wall-module-cutaway', yaw, elevation));
      const pivot = await page.locator('body').getAttribute('data-pivot-screen');
      if (pivot !== '1370,585') throw new Error(`Cutaway pivot drifted at ${yaw}°/${elevation}°: ${pivot}`);
      if ([-90, 0, 90].includes(yaw)) {
        const path = preview(`wall-cutaway-yaw${yaw}-elev${elevation}`);
        await page.screenshot({ path });
        captures.push(path);
      }
    }
  }
  if (images.length !== beforeCutaway + 48) throw new Error(`Cutaway should load 48 selected frames, got ${images.length - beforeCutaway}.`);
  const beforeWest = images.length;
  await page.locator('[data-asset-id="wall.interior.module.west.full"]').click();
  for (const elevation of [25, 65]) {
    await page.locator(`[data-axis="elevation"][data-angle="${elevation}"]`).click();
    for (const yaw of yawAngles) {
      await page.locator(`[data-axis="yaw"][data-angle="${yaw}"]`).click();
      await page.waitForFunction((expected) => document.body.dataset.loadedFrame?.includes(expected),
        stem('wall-module-west-full', yaw, elevation));
      if (await page.locator('body').getAttribute('data-pivot-screen') !== '1370,585') {
        throw new Error(`West-wall pivot drifted at ${yaw}°/${elevation}°.`);
      }
      if ([-90, -45, 0, 45, 90].includes(yaw)) {
        const path = preview(`wall-west-yaw${yaw}-elev${elevation}`);
        await page.screenshot({ path });
        captures.push(path);
      }
    }
  }
  if (images.length !== beforeWest + 48) throw new Error(`West wall should load 48 selected frames, got ${images.length - beforeWest}.`);
  if (images.some((response) => response.status() !== 200)) throw new Error('An oblique image failed HTTP 200.');
  if (failures.length > 0) throw new Error(`Browser errors: ${failures.join('; ')}`);
  const bytes = (await Promise.all(images.map((response) => response.body()))).map((body) => body.length);
  console.log(JSON.stringify({ viewport: '1920x1080', startupTextures: 1, initialBytes,
    yawPosesVisited: yawAngles.length, cutawayPosesVisited: 48,
    cutawayImagesFetched: beforeWest - beforeCutaway,
    cutawayBytes: (await Promise.all(images.slice(beforeCutaway, beforeWest).map((response) => response.body())))
      .reduce((sum, body) => sum + body.length, 0),
    westImagesFetched: images.length - beforeWest,
    westBytes: (await Promise.all(images.slice(beforeWest).map((response) => response.body())))
      .reduce((sum, body) => sum + body.length, 0),
    pivotScreen: '1370,585', texturesFetched: images.length,
    transferredImageBytes: bytes.reduce((sum, value) => sum + value, 0),
    yawLoadMs: { min: Math.min(...latenciesMs), median: [...latenciesMs].sort((a, b) => a - b)[12],
      max: Math.max(...latenciesMs) }, captures }, null, 2));
} finally {
  await browser.close();
}
