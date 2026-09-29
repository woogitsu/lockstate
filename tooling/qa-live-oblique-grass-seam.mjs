/** Inspect a dirt-to-grass boundary in the real ObliqueWorldScene browser harness. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

/** @typedef {Window & { lockstateObliqueWorldHarness: import('../tests/browser/oblique-world-harness').ObliqueWorldHarness }} HarnessWindow */

const origin = process.env.LOCKSTATE_LIVE_OBLIQUE_ORIGIN ?? 'http://127.0.0.1:5197';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => console.log('pageerror:', error.message));
  await page.route('**/tests/browser/oblique-world-harness.ts*', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const old = 'world.setTerrain(tile(x, y), "concrete")';
    if (!body.includes(old)) throw new Error('The live harness terrain setup changed');
    // Only the browser response is patched; the repo scene and fixture stay intact.
    await route.fulfill({ response, body: body.replace(old,
      'world.setTerrain(tile(x, y), x >= 5 ? "grass" : "dirt")') });
  });
  await page.goto(`${origin}/tests/browser/oblique-world-harness.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /** @type {HarnessWindow} */ (window).lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => /** @type {HarnessWindow} */ (window).lockstateObliqueWorldHarness.ready());
  const captures = [];
  for (const yaw of [-90, -45, 0, 45, 90]) {
    await page.evaluate((angle) => /** @type {HarnessWindow} */ (window).lockstateObliqueWorldHarness.setPose(angle, 45), yaw);
    const path = join(tmpdir(), `lockstate-live-grass-seam-yaw${yaw}.png`);
    await page.screenshot({ path });
    captures.push({ yaw, path, textureKeys: await page.evaluate(() => /** @type {HarnessWindow} */ (window).lockstateObliqueWorldHarness.artTextureKeys().length) });
  }
  console.log(JSON.stringify({ viewport: '1920x1080', captures }, null, 2));
} finally {
  await browser.close();
}
