/** Full HD inspection of selected-cell wall cutaway in the real scene.
 * AFTER mode intercepts the served scene module and catalog in the browser only;
 * it never changes the integration worktree.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_LIVE_OBLIQUE_ORIGIN ?? 'http://127.0.0.1:5197';
const after = process.argv.includes('--after');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => console.error('page error:', error.message));
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) console.error('navigation:', frame.url()); });
  if (after) {
    await page.route('**/src/rendering/scene/oblique-world-scene.ts*', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const oldLine = 'if (item.artAssetId === "wall.interior.module.full" || item.artAssetId === "wall.interior.module.west.full") {\n\t\t\treturn "wall.interior.module.cutaway";';
      if (!body.includes(oldLine)) throw new Error('Live cutaway mapping changed; refresh QA interception');
      await route.fulfill({ response, body: body.replace(oldLine,
        'if (item.artAssetId === "wall.interior.module.full") return "wall.interior.module.cutaway";\n\t\tif (item.artAssetId === "wall.interior.module.west.full") {\n\t\t\treturn "wall.interior.module.west.cutaway";') });
    });
    await page.route('**/game-content/oblique-module-registry.v1.json', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: await readFile('public/game-content/oblique-module-registry.v1.json') });
    });
    await page.route('**/game-content/oblique-wall-west-cutaway.v1.json', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: await readFile('public/game-content/oblique-wall-west-cutaway.v1.json') });
    });
    await page.route('**/assets/environment/oblique/wall-module-west-cutaway-*.png', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1);
      await route.fulfill({ contentType: 'image/png', body: await readFile(join('public/assets/environment/oblique', name)) });
    });
  }
  await page.goto(`${origin}/tests/browser/oblique-world-harness.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.lockstateObliqueWorldHarness !== undefined);
  await page.evaluate(() => window.lockstateObliqueWorldHarness.ready());
  const point = await page.evaluate(() => window.lockstateObliqueWorldHarness.pointAtTile(3, 3));
  await page.mouse.click(point.x, point.y);
  const captures = [];
  for (const yaw of [-90, -45, 0, 45, 90]) {
    await page.evaluate((angle) => window.lockstateObliqueWorldHarness.setPose(angle, 45), yaw);
    const path = join(tmpdir(), `lockstate-live-cutaway-${after ? 'after' : 'before'}-yaw${yaw}.png`);
    await page.screenshot({ path });
    captures.push({ yaw, path,
      cutawayWallIds: await page.evaluate(() => window.lockstateObliqueWorldHarness.cutawayWallIds()) });
  }
  console.log(JSON.stringify({ viewport: '1920x1080', captures }, null, 2));
} finally {
  await browser.close();
}
