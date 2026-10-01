import { performance } from 'node:perf_hooks';
import { chromium, type FullConfig } from '@playwright/test';
import { BROWSER_SERVER_STARTUP_TIMEOUT_MS } from './browser-startup-budget';

/** Playwright starts webServer plugins before global setup. The server's
 * readiness URL is static harness HTML, so it does not transform the game's
 * module graph. Visit the real entry once outside test time, in a disposable
 * context, and fail loudly if the application cannot finish booting. */
export default async function prewarmProductionPage(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('Browser prewarm requires a configured baseURL');
  const start = performance.now();
  const remainingStartupMs = () => Math.max(1, BROWSER_SERVER_STARTUP_TIMEOUT_MS - (performance.now() - start));
  const executablePath = process.env['LOCKSTATE_CHROMIUM_PATH'];
  const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${baseURL}/?renderer=oblique`, { waitUntil: 'domcontentloaded', timeout: remainingStartupMs() });
    // Canvas proves that Vite served and ran the game module graph. It is not
    // a gameplay readiness assertion; every real test keeps its own checks.
    await page.locator('#game-root canvas').waitFor({ state: 'visible', timeout: remainingStartupMs() });
    process.stdout.write(`LOCKSTATE_BROWSER_PREWARM_READY elapsedMs=${Math.round(performance.now() - start)}\n`);
  } finally {
    await browser.close();
  }
}
