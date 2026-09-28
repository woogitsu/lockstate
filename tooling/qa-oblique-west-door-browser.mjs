/** Full HD Phaser evidence for authored west door variants at multiple camera poses. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5187';
const browser = await chromium.launch({ headless: true });
const doors = [
  ['door.interior.open.west.full', 'cell-door-west-full'],
  ['door.interior.open.west.cutaway', 'cell-door-west-cutaway'],
];
const yawAngles = [-90, -45, 0, 45, 90];
const elevations = [25, 65];
const stem = (slug, yaw, elevation) =>
  `${slug}-yaw${yaw < 0 ? '-' : '+'}${String(Math.abs(yaw)).padStart(2, '0')}-elev${elevation}`;

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
  if (images.length !== 1) throw new Error(`Startup should request one image, got ${images.length}.`);
  const captures = [];
  const measurements = [];
  await page.mouse.move(1370, 585);
  for (const [assetId, slug] of doors) {
    const before = images.length;
    await page.locator(`[data-asset-id="${assetId}"]`).click();
    for (const elevation of elevations) {
      await page.locator(`[data-axis="elevation"][data-angle="${elevation}"]`).click();
      for (const yaw of yawAngles) {
        await page.locator(`[data-axis="yaw"][data-angle="${yaw}"]`).click();
        await page.waitForFunction((expected) => document.body.dataset.loadedFrame?.includes(expected),
          stem(slug, yaw, elevation));
        if (await page.locator('body').getAttribute('data-pivot-screen') !== '1370,585') {
          throw new Error(`${assetId} pivot drifted at ${yaw}°/${elevation}°.`);
        }
        if ([-45, 0, 45].includes(yaw)) {
          const path = join(tmpdir(), `lockstate-oblique-${slug}-yaw${yaw}-elev${elevation}.png`);
          await page.screenshot({ path });
          captures.push(path);
        }
      }
    }
    const fetched = images.slice(before);
    if (fetched.length < 10 || fetched.length > 11) {
      throw new Error(`${assetId} fetched ${fetched.length} frames for ten visited poses.`);
    }
    measurements.push({ assetId, selectedFrames: fetched.length,
      transferredBytes: (await Promise.all(fetched.map((response) => response.body())))
        .reduce((sum, body) => sum + body.length, 0) });
  }
  if (images.some((response) => response.status() !== 200)) throw new Error('Image response failed HTTP 200.');
  if (failures.length) throw new Error(`Page errors: ${failures.join('; ')}`);
  console.log(JSON.stringify({ viewport: '1920x1080', startupImages: 1,
    pivotScreen: '1370,585', measurements, captures }, null, 2));
} finally {
  await browser.close();
}
