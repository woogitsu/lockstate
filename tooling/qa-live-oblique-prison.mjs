import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_LIVE_OBLIQUE_ORIGIN ?? 'http://127.0.0.1:5197';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (message) => { if (message.type() === 'error') console.log('console:', message.text()); });
  page.on('pageerror', (error) => console.log('pageerror:', error.message));
  await page.goto(`${origin}/?oblique-preview=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('body[data-oblique-preview="ready"]').waitFor();
  await page.locator('.empty-world-prompt').getByRole('button', { name: /New prison|Utwórz więzienie/ }).click();
  await page.locator('.save-panel__item[data-active="true"]').waitFor();
  let yaw = -45;
  const angle = page.locator('.hud-camera-angle');
  for (const target of [-90, -45, 0, 45, 90]) {
    while (yaw < target) { await angle.getByRole('button', { name: /Turn right|Obróć w prawo/ }).click(); yaw += 15; }
    while (yaw > target) { await angle.getByRole('button', { name: /Turn left|Obróć w lewo/ }).click(); yaw -= 15; }
    await page.waitForTimeout(250);
    const path = join(tmpdir(), `lockstate-real-oblique-prison-yaw${yaw}.png`);
    await page.screenshot({ path });
    console.log(yaw, await angle.locator('output').innerText(), path);
  }
} finally {
  await browser.close();
}
