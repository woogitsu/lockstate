import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { expect, test } from './network-changed-fixture';
import type { Page } from './network-changed-fixture';

test('opt-in real public paused New prison CPU profile', async ({ page, browser }, info) => {
  if (process.env['LOCKSTATE_NATIVE_PROFILE'] !== '1') throw new Error('Explicit LOCKSTATE_NATIVE_PROFILE=1 required');
  const productionSha = process.env['LOCKSTATE_PROFILE_PRODUCTION_SHA'];
  const buildDirectory = process.env['LOCKSTATE_PROFILE_BUILD_DIR'];
  if (!productionSha?.match(/^[a-f0-9]{40}$/) || !buildDirectory) {
    throw new Error('Frozen full production SHA and actual compiled client directory required');
  }
  const buildRoot = resolve(buildDirectory);
  const scripts: Array<Awaited<ReturnType<Page['waitForResponse']>>> = [];
  const traffic: unknown[] = [];
  const timings: Array<{ action: string; elapsedMs: number }> = [];
  const client = await page.context().newCDPSession(page);
  const browserClient = await browser.newBrowserCDPSession();
  await client.send('Network.enable');
  client.on('Network.responseReceived', event => traffic.push({ type: 'response', timestamp: event.timestamp,
    url: event.response.url, status: event.response.status, mimeType: event.response.mimeType,
    fromDiskCache: event.response.fromDiskCache, requestId: event.requestId }));
  client.on('Network.loadingFinished', event => traffic.push({ type: 'finished', timestamp: event.timestamp,
    requestId: event.requestId, encodedDataLength: event.encodedDataLength }));
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('.js') && response.status() === 200) scripts.push(response);
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  const timeAction = async (action: string, perform: () => Promise<unknown>) => {
    const started = performance.now(); await perform(); timings.push({ action, elapsedMs: performance.now() - started });
  };
  await timeAction('goto Angled artifact', () => page.goto('/?renderer=oblique'));
  await timeAction('public New prison click', () => page.getByRole('button', { name: 'New prison', exact: true }).click());
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await timeAction('public Pause click', () => pause.click());
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'View', exact: true })).toHaveValue('oblique');
  await expect(page.locator('canvas').first()).toBeVisible();
  const buildStamp = await page.getByRole('note', { name: 'Lockstate build' }).innerText();
  expect(buildStamp).toContain(productionSha.slice(0, 7));
  const browserVersion = await browserClient.send('Browser.getVersion');
  const systemInfo = await browserClient.send('SystemInfo.getInfo');
  await client.send('Performance.enable');
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 1000 });
  const stableBefore = await client.send('Performance.getMetrics');
  const stableDay = await page.locator('.hud-clock__day').innerText();
  await client.send('Profiler.start');
  let sampling = true;
  let stableProfile: unknown;
  let interactionProfile: unknown;
  const receipt: Record<string, unknown> = { productionSha, buildRoot, buildStamp, browserVersion, systemInfo,
    stableWindowMs: 30_000, samplingIntervalUs: 1000, stableBefore, timings, traffic, complete: false,
    limits: ['Page CPU sampling does not profile the separate simulation worker or GPU execution.',
      'No private renderer revision/texture is exposed or inferred.',
      'Local timings do not establish hosted CI latency or a before/after effect.'] };
  try {
    // The requested fixed observation window, not a gameplay wait/retry.
    await page.waitForTimeout(30_000);
    stableProfile = await client.send('Profiler.stop'); sampling = false;
    const stableAfter = await client.send('Performance.getMetrics');
    Object.assign(receipt, { stableProfile, stableAfter });
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hud-clock__day')).toHaveText(stableDay);
    await client.send('Profiler.start'); sampling = true;
    await timeAction('public Pause click while paused', () => pause.click());
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await timeAction('public Build click', () => page.getByRole('button', { name: 'Build', exact: true }).click());
    await expect(page.locator('.hud-build')).toBeVisible();
    interactionProfile = await client.send('Profiler.stop'); sampling = false;
    const interactionAfter = await client.send('Performance.getMetrics');
    Object.assign(receipt, { interactionProfile, interactionAfter });
    // Read actual delivered JS after sampling so body hashing is not charged
    // to the renderer window. Match it to independently frozen disk bytes.
    const servedScripts: unknown[] = [];
    receipt['servedScripts'] = servedScripts;
    for (const response of scripts) {
      const url = new URL(response.url());
      expect(url.pathname).not.toMatch(/^\/src\//);
      const diskPath = resolve(buildRoot, `.${decodeURIComponent(url.pathname)}`);
      const safelyInside = diskPath.startsWith(buildRoot + sep);
      const body = await response.body();
      const servedSha256 = createHash('sha256').update(body).digest('hex');
      const diskSha256 = safelyInside && existsSync(diskPath)
        ? createHash('sha256').update(readFileSync(diskPath)).digest('hex') : null;
      servedScripts.push({ url: response.url(), servedSha256, diskSha256, bytes: body.length });
      expect(diskSha256, `actual script must match frozen client bytes: ${response.url()}`).toBe(servedSha256);
    }
    expect(servedScripts.length).toBeGreaterThan(0);
    receipt['complete'] = true;
  } finally {
    if (sampling) await client.send('Profiler.stop').catch(() => undefined);
    // Preserve an incomplete measurement when a later real assertion fails.
    writeFileSync(info.outputPath('native-paused-profile.json'), JSON.stringify(receipt, null, 2));
    await client.send('Profiler.disable');
    await client.send('Performance.disable');
    await client.detach(); await browserClient.detach();
  }
});
