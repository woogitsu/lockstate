import { openCameraControls } from './public-camera-controls';
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from './network-changed-fixture';
import { observeDemandRoute } from './oblique-demand-native-observers';

type Observation = { text: string; sameChild: boolean; replacements: number; viewport: string | null; canvas: [number, number]; };
async function observe(page: Page): Promise<Observation> {
  return page.evaluate(async () => {
    const placeholder = document.querySelector('.hud-minimap__placeholder');
    const viewport = document.querySelector('.hud-minimap__viewport');
    const canvas = document.querySelector<HTMLCanvasElement>('.hud-minimap__canvas');
    if (!placeholder || !viewport || !canvas || !placeholder.firstChild) throw Error('Actual minimap DOM absent');
    const child = placeholder.firstChild;
    let replacements = 0;
    const observer = new MutationObserver(records => { replacements += records.filter(row => row.type === 'childList').length; });
    observer.observe(placeholder, { childList: true });
    // Bound by actual browser animation publications, not a synthetic HUD call.
    await new Promise<void>(resolve => { let frames = 0; const next = () => { if (++frames === 12) resolve(); else requestAnimationFrame(next); }; requestAnimationFrame(next); });
    observer.disconnect();
    return { text: placeholder.textContent ?? '', sameChild: placeholder.firstChild === child, replacements, viewport: viewport.getAttribute('style'), canvas: [canvas.width, canvas.height] };
  });
}

test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
test('opt-in actual paused minimap DOM identity across New, viewport, locale and Load', async ({ page }, info) => {
  const buildRoot = process.env['LOCKSTATE_PROFILE_BUILD_DIR'], productionSha = process.env['LOCKSTATE_PROFILE_PRODUCTION_SHA'];
  if (!buildRoot || !productionSha || process.env['LOCKSTATE_MINIMAP_IDENTITY_AUDIT'] !== '1') throw Error('Exact compiled subject and explicit audit opt-in required');
  const observer = await observeDemandRoute(page, buildRoot);
  const receipt: Record<string, unknown> = { productionSha, buildRoot, observations: {}, complete: false, boundary: 'Actual DOM identity; no CPU/latency conclusion, no injected game state or renderer hooks.' };
  const flush = () => writeFileSync(info.outputPath('minimap-identity-receipt.json'), JSON.stringify(receipt, null, 2));
  const observations = receipt['observations'] as Record<string, Observation>;
  const check = async (name: string) => {
    const result = await observe(page); observations[name] = result;
    flush();
    expect.soft(result.sameChild, name).toBe(true); expect.soft(result.replacements, name).toBe(0);
    return result;
  };
  try {
    await page.goto('/?renderer=oblique');
    await expect(page.getByRole('note', { name: 'Lockstate build' })).toContainText(productionSha.slice(0, 7));
    await expect(page.locator('.hud-minimap__placeholder')).not.toHaveText('');
    await check('inactive');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hud-minimap__canvas')).not.toHaveAttribute('hidden');
    const initial = await check('paused-active');
    await openCameraControls(page);
    await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
    await expect.poll(() => page.locator('.hud-minimap__viewport').getAttribute('style')).not.toBe(initial.viewport);
    await check('changed-viewport');
    await page.locator('.display-scale__cycle').click();
    await check('public-ui-scale');
    await page.getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved');
    await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    await check('loaded-paused');
    // Language is an existing public Settings-menu action and reloads the
    // document after saving (ADR0119). It is not an in-place HUD locale port.
    await page.getByRole('button', { name: 'Open the settings menu', exact: true }).click();
    await Promise.all([page.waitForEvent('load'), page.locator('.language-control__cycle').click()]);
    await expect(page.locator('.language-control__cycle')).toHaveAttribute('data-preference', 'en');
    await page.getByRole('button', { name: 'Open the settings menu', exact: true }).click();
    await Promise.all([page.waitForEvent('load'), page.locator('.language-control__cycle').click()]);
    await expect(page.locator('.language-control__cycle')).toHaveAttribute('data-locale', 'pl');
    await expect.poll(() => page.locator('.hud-minimap__placeholder').textContent()).not.toBe(initial.text);
    await check('polish-reloaded');
    receipt['servedScripts'] = await observer.scripts();
    receipt['complete'] = info.errors.length === 0;
  } finally {
    receipt['assets'] = await observer.read().catch(error => ({ captureError: String(error) }));
    await page.screenshot({ path: info.outputPath('minimap-dom.png') }).catch(error => { receipt['screenshotError'] = String(error); });
    flush();
  }
});
