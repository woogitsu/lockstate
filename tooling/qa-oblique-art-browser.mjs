/** Full HD browser smoke for the Phaser oblique module loader/selector preview. */
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5187';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const failures = [];
  const images = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/assets/environment/oblique/')) images.push({ url: response.url(), status: response.status() });
  });
  await page.goto(`${origin}/art-angle-preview.html`, { waitUntil: 'networkidle' });
  await page.locator('body[data-loaded-frame]').waitFor();
  const initial = await page.locator('body').getAttribute('data-loaded-frame');
  if (!initial?.includes('wall-module-full-yaw+00-elev45.')) throw new Error(`Wrong initial frame: ${initial}`);
  const before = await page.screenshot({ path: join(tmpdir(), 'lockstate-oblique-wall-yaw0-elev45.png') });
  await page.locator('[data-asset-id="furniture.cell.bed.single.variants"]').click();
  await page.locator('[data-axis="yaw"][data-angle="45"]').click();
  await page.locator('[data-axis="elevation"][data-angle="25"]').click();
  const selected = await page.locator('body').getAttribute('data-loaded-frame');
  if (!selected?.includes('cell-bed-yaw+45-elev25.')) throw new Error(`Wrong bed frame: ${selected}`);
  const after = await page.screenshot({ path: join(tmpdir(), 'lockstate-oblique-bed-yaw45-elev25.png') });
  await page.locator('[data-asset-id="door.interior.open.full"]').click();
  await page.locator('[data-axis="yaw"][data-angle="-45"]').click();
  await page.locator('[data-axis="elevation"][data-angle="65"]').click();
  const door = await page.locator('body').getAttribute('data-loaded-frame');
  if (!door?.includes('cell-door-open-yaw-45-elev65.')) throw new Error(`Wrong door frame: ${door}`);
  const doorScreen = await page.screenshot({ path: join(tmpdir(), 'lockstate-oblique-door-yaw-45-elev65.png') });
  const cellScreenshots = [];
  for (const [assetId, slug] of [
    ['fixture.cell.toilet_sink', 'cell-toilet'],
    ['furniture.storage.rack.wooden', 'cell-storage-rack'],
    ['furniture.chair.wooden', 'cell-chair'],
  ]) {
    await page.locator(`[data-asset-id="${assetId}"]`).click();
    await page.locator('[data-axis="yaw"][data-angle="45"]').click();
    await page.locator('[data-axis="elevation"][data-angle="25"]').click();
    const frame = await page.locator('body').getAttribute('data-loaded-frame');
    if (!frame?.includes(`${slug}-yaw+45-elev25.`)) throw new Error(`Wrong ${assetId} frame: ${frame}`);
    const path = join(tmpdir(), `lockstate-oblique-${slug}-yaw45-elev25.png`);
    await page.screenshot({ path });
    cellScreenshots.push({ assetId, frame, path });
  }
  if (createHash('sha256').update(before).digest('hex') === createHash('sha256').update(after).digest('hex')) {
    throw new Error('Angle change left the Full HD screenshot unchanged.');
  }
  if (createHash('sha256').update(after).digest('hex') === createHash('sha256').update(doorScreen).digest('hex')) {
    throw new Error('Module change left the Full HD screenshot unchanged.');
  }
  if (images.length !== 54 || images.some((image) => image.status !== 200)) {
    throw new Error(`Expected 54 successfully loaded angle textures, got ${JSON.stringify(images)}.`);
  }
  if (failures.length > 0) throw new Error(`Browser errors: ${failures.join('; ')}`);
  console.log(JSON.stringify({ viewport: '1920x1080', initial, selected, door, cellScreenshots, imagesLoaded: images.length,
    screenshots: [join(tmpdir(), 'lockstate-oblique-wall-yaw0-elev45.png'),
      join(tmpdir(), 'lockstate-oblique-bed-yaw45-elev25.png'),
      join(tmpdir(), 'lockstate-oblique-door-yaw-45-elev65.png')] }, null, 2));
} finally {
  await browser.close();
}
