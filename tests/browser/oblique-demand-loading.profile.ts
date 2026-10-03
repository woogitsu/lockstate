import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { expect, test as base, type Page, type TestInfo } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { requireCotOwner } from './cell-cot-evidence';
import { actualSnapshot, observeDemandRoute } from './oblique-demand-native-observers';
import { cotFrameAtPublicPose, readFrozenImageInventory } from './oblique-demand-frozen-assets';

let routeStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
const test = base.extend({ storageState: async ({}, use) => { await use(routeStorage ?? { cookies: [], origins: [] }); } });
test.describe.configure({ mode: 'serial' });
test.use({ deviceScaleFactor: 1 });
const requirePlaywright = createRequire(createRequire(import.meta.url).resolve('@playwright/test/package.json'));
const { PNG } = requirePlaywright('playwright-core/lib/utilsBundle') as { PNG: { sync: { read(bytes: Buffer): { width: number; height: number; data: Uint8Array } } } };

async function stage(page: Page, info: TestInfo, name: string,
  perform: (context: { observer: Awaited<ReturnType<typeof observeDemandRoute>>; inventory: ReturnType<typeof readFrozenImageInventory>; receipt: Record<string, unknown>; time: (label: string, action: () => Promise<unknown>) => Promise<void> }) => Promise<void>) {
  if (process.env['LOCKSTATE_OBLIQUE_DEMAND_NATIVE'] !== '1') throw new Error('Explicit LOCKSTATE_OBLIQUE_DEMAND_NATIVE=1 required');
  const productionSha = process.env['LOCKSTATE_PROFILE_PRODUCTION_SHA'];
  const directory = process.env['LOCKSTATE_PROFILE_BUILD_DIR'];
  if (!productionSha?.match(/^[a-f0-9]{40}$/) || !directory) throw new Error('Exact frozen production SHA and compiled client directory required');
  const buildRoot = resolve(directory), inventory = readFrozenImageInventory(buildRoot);
  const timings: Array<{ action: string; elapsedMs: number }> = [];
  const receipt: Record<string, unknown> = { stage: name, productionSha, buildRoot, complete: false, timings,
    limits: ['No private bound texture/renderer revision is exposed or inferred.', 'Page CPU sampling excludes worker CPU and GPU execution.',
      'Direct HUD thumbnail demand is distinct from observed PNG loader Blob decoding.', 'No local or hosted latency improvement is inferred.',
      'The one-step rotated screenshot retains pending root pixel calibration; no new pixel threshold is invented.'] };
  await installTee(page);
  const observer = await observeDemandRoute(page, buildRoot);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const time = async (label: string, action: () => Promise<unknown>) => { const before = performance.now(); await action(); timings.push({ action: label, elapsedMs: performance.now() - before }); };
  try {
    await time('goto actual Angled compiled client', () => page.goto('/?renderer=oblique'));
    const buildStamp = await page.getByRole('note', { name: 'Lockstate build' }).innerText();
    expect(buildStamp).toContain(productionSha.slice(0, 7)); receipt['buildStamp'] = buildStamp;
    await expect(page.getByRole('combobox', { name: 'View', exact: true })).toHaveValue('oblique');
    await perform({ observer, inventory, receipt, time });
    const images = await observer.read(); receipt['assets'] = images;
    expect(images.errors).toEqual([]);
    receipt['servedScripts'] = await observer.scripts();
    receipt['complete'] = true;
  } finally {
    receipt['assets'] ??= await observer.read().catch(error => ({ captureError: String(error) }));
    receipt['workerFinal'] = await actualSnapshot(page).catch(error => ({ captureError: String(error) }));
    writeFileSync(info.outputPath('oblique-demand-native-receipt.json'), JSON.stringify(receipt, null, 2));
  }
}

async function placePlan(page: Page, name: string, x: number) {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' }).selectOption('0');
  await dialog.getByRole('button', { name, exact: true }).click();
  const input = dialog.getByRole('spinbutton', { name: 'Plan origin X' });
  if (!await input.isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
  await input.fill(String(x)); await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('5');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('submitted'); await page.keyboard.press('Escape');
}
async function finishQueue(page: Page) {
  const panel = page.locator('.hud-build');
  let remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  while (remaining > 0) {
    await expect.poll(async () => Number(await panel.getAttribute('data-queued') ?? 0), { message: `genuine queue must advance from ${remaining}` }).toBeLessThan(remaining);
    remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  }
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
}
async function load(page: Page) {
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
}
async function centreCot(page: Page) {
  const minimap = page.locator('.hud-minimap__surface');
  if (!await minimap.isVisible()) await page.getByRole('region', { name: 'Minimap', exact: true }).getByRole('button', { name: 'Expand', exact: true }).click();
  const bounds = await minimap.boundingBox(); if (!bounds) throw new Error('Actual minimap absent');
  await minimap.click({ position: { x: bounds.width * 21.5 / 32, y: bounds.height * 6.5 / 32 } });
  await page.mouse.move(1300, 700);
}
function originalBlanketPixels(buffer: Buffer): number {
  const png = PNG.sync.read(buffer); expect([png.width, png.height]).toEqual([1920, 1080]);
  // Exact original cot Full HD q0 calibration: 925,490,75,50, original palette
  // and >700 threshold. Decoder runs in Node; no app-main-thread PNG decode.
  let count = 0;
  for (let y = 490; y < 540; y++) for (let x = 925; x < 1000; x++) {
    const i = (y * png.width + x) * 4, r = png.data[i]!, g = png.data[i + 1]!, b = png.data[i + 2]!;
    if (r >= 150 && r <= 215 && g >= 105 && g <= 165 && b >= 65 && b <= 135 && r - g > 20 && g - b > 10) count++;
  }
  return count;
}

test('opt-in #2018 empty paused public New: actual floor loader and stable 30s CDP profile', async ({ page, browser }, info) => {
  await stage(page, info, 'empty-public-New', async ({ observer, inventory, receipt, time }) => {
    await time('public New prison', () => page.getByRole('button', { name: 'New prison', exact: true }).click());
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await time('public Pause', () => page.getByRole('button', { name: 'Pause', exact: true }).click());
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const before = await actualSnapshot(page); receipt['emptyBefore'] = before;
    expect(before.construction.orders).toEqual([]); expect(before.simulation?.objects?.placedObjects ?? []).toEqual([]);
    await expect(page.locator('[data-metric="prisoners"] .ui-stat__value')).toHaveText('0');
    const floors = new Set(inventory.floors.map(row => row.sha256));
    await expect.poll(async () => (await observer.read()).images.filter(row => row.complete && !row.error && floors.has(row.sha256 ?? '')).length).toBeGreaterThan(0);
    const client = await page.context().newCDPSession(page), browserClient = await browser.newBrowserCDPSession();
    const traffic: unknown[] = []; receipt['CDPTraffic'] = traffic;
    await client.send('Network.enable'); client.on('Network.responseReceived', event => traffic.push({ event: 'response', ...event }));
    client.on('Network.loadingFinished', event => traffic.push({ event: 'finished', ...event }));
    receipt['browserVersion'] = await browserClient.send('Browser.getVersion'); receipt['systemInfo'] = await browserClient.send('SystemInfo.getInfo');
    await client.send('Performance.enable'); await client.send('Profiler.enable'); await client.send('Profiler.setSamplingInterval', { interval: 1000 });
    receipt['stableBefore'] = await client.send('Performance.getMetrics'); receipt['stableWindowMs'] = 30_000; await client.send('Profiler.start');
    let sampling = true;
    try {
      await page.waitForTimeout(30_000);
      receipt['stableProfile'] = await client.send('Profiler.stop'); sampling = false;
      receipt['stableAfter'] = await client.send('Performance.getMetrics');
      const emptyAssets = await observer.read(); receipt['emptyAssets'] = emptyAssets;
      expect(emptyAssets.images.length).toBeGreaterThan(0);
      expect(emptyAssets.images.every(row => row.complete && !row.error && floors.has(row.sha256 ?? '')),
        'empty scene decoder receives only actual floor PNGs; raw HUD thumbnail requests remain separately recorded').toBe(true);
      const descriptorPaths = new Set(emptyAssets.catalogBytes.map(row => decodeURIComponent(new URL(row.url).pathname)));
      for (const entry of inventory.registry.entries) expect(descriptorPaths.has(entry.manifest), `eager verified descriptor ${entry.assetId}`).toBe(true);
      const after = await actualSnapshot(page); expect(after).toEqual(before); receipt['emptyAfter'] = after;
      await page.screenshot({ path: info.outputPath('actual-empty-paused-fullhd.png') });
      await time('public Save now empty prison', () => save(page)); routeStorage = await page.context().storageState({ indexedDB: true });
    } finally {
      if (sampling) await client.send('Profiler.stop').catch(() => undefined);
      await client.send('Profiler.disable'); await client.send('Performance.disable'); await client.detach(); await browserClient.detach();
    }
  });
});

test('opt-in #2018 genuine public capacity stage: Storage and Delivery completion', async ({ page }, info) => {
  expect(routeStorage, 'consume actual first-stage IndexedDB save').toBeDefined();
  await stage(page, info, 'public-capacity', async ({ receipt, time }) => {
    await time('public Load empty save', () => load(page));
    await placePlan(page, 'Storage Room', 5); await placePlan(page, 'Delivery Bay', 12);
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click(); await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await time('real capacity queue completion', () => finishQueue(page));
    await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
    await page.getByRole('button', { name: 'Pause', exact: true }).click(); receipt['capacityPaused'] = await actualSnapshot(page);
    expect((await sentCommands(page)).filter(row => row.type === 'PlaceRoomTemplate')).toEqual([
      { type: 'PlaceRoomTemplate', templateId: 'storage-room-basic', origin: { x: 5, y: 5 } },
      { type: 'PlaceRoomTemplate', templateId: 'delivery-bay-basic', origin: { x: 12, y: 5 } },
    ]);
    await save(page); routeStorage = await page.context().storageState({ indexedDB: true });
  });
});

test('opt-in #2018 completed public cot: required PNG, real camera turn and whole paused Save/Load', async ({ page }, info) => {
  expect(routeStorage, 'consume actual completed-capacity IndexedDB save').toBeDefined();
  await stage(page, info, 'public-cot-camera-SaveLoad', async ({ observer, inventory, receipt, time }) => {
    await load(page); await placePlan(page, 'Basic cell', 20);
    const pending = (await actualSnapshot(page)).simulation?.roomTemplates?.pending.find(row => row.templateId === 'cell-basic'); expect(pending).toBeDefined();
    const sequence = pending!.sequence;
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click(); await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await time('real Cell queue completion', () => finishQueue(page));
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const before = await actualSnapshot(page); receipt['pausedBefore'] = before; receipt['ownerBefore'] = requireCotOwner(before, 0, sequence);
    expect((await sentCommands(page)).filter(row => row.type === 'PlaceRoomTemplate')).toEqual([{ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 5 } }]);
    await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
    const catalog = inventory.catalogs.get('furniture.cell.cot.single'); expect(catalog).toBeDefined();
    const initial = cotFrameAtPublicPose(catalog!, 300, 40), turned = cotFrameAtPublicPose(catalog!, 330, 40); expect(turned.sha256).not.toBe(initial.sha256);
    const decoded = async (digest: string) => (await observer.read()).images.some(row => row.sha256 === digest && row.complete && !row.error && row.width === catalog!.resolutionPx[0] && row.height === catalog!.resolutionPx[1]);
    await expect.poll(() => decoded(initial.sha256), { message: 'actual loader decodes the required completed cot PNG' }).toBe(true);
    await centreCot(page); const original = await page.screenshot({ path: info.outputPath('actual-q0-cot-original-calibrated-fullhd.png') });
    receipt['originalBlanketPixels'] = originalBlanketPixels(original); expect(receipt['originalBlanketPixels']).toBeGreaterThan(700);
    await time('public one-step camera right', () => page.getByRole('button', { name: 'Rotate camera right', exact: true }).click());
    await expect.poll(() => decoded(turned.sha256), { message: 'actual public camera change decodes the new selected cot orientation' }).toBe(true);
    const assets = await observer.read();
    for (const frame of [initial, turned]) expect(assets.pngs.some(row => decodeURIComponent(new URL(row.url).pathname) === frame.image && row.sha256 === frame.sha256 && row.status === 200)).toBe(true);
    receipt['expectedPublicCamera'] = { beforeDegrees: { yaw: -45, elevation: 45 }, afterDegrees: { yaw: -30, elevation: 45 }, selectedFrames: [initial, turned], privatePoseOrBoundTextureObserved: false };
    expect(await actualSnapshot(page)).toEqual(before); await page.screenshot({ path: info.outputPath('actual-turned-cot-pending-root-calibration-fullhd.png') });
    await save(page); await load(page); const after = await actualSnapshot(page); expect(after).toEqual(before); receipt['pausedAfter'] = after; receipt['ownerAfter'] = requireCotOwner(after, 0, sequence);
    await centreCot(page); await page.screenshot({ path: info.outputPath('actual-loaded-turned-cot-pending-root-calibration-fullhd.png') });
    // Return through the public control to the original independently calibrated
    // pose; Load reframing is handled only through the actual minimap.
    await page.getByRole('button', { name: 'Rotate camera left', exact: true }).click(); await centreCot(page);
    const restored = await page.screenshot({ path: info.outputPath('actual-loaded-original-cot-calibrated-fullhd.png') });
    receipt['restoredBlanketPixels'] = originalBlanketPixels(restored); expect(receipt['restoredBlanketPixels']).toBeGreaterThan(700);
    expect(await actualSnapshot(page)).toEqual(before);
  });
});
