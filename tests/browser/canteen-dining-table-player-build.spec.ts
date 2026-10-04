import { diningPlatePixels } from './canteen-bench-material-observer';
import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { observeCanteenImages, publicSupportPose, requireCanteenOwners, SUPPORT_FRAME, CANTEEN_BENCH_FRAME } from './canteen-dining-table-evidence';

interface ProbeWindow extends Window {
  askWorker?: (kind: string, payload: unknown) => Promise<unknown>;
}

async function installWorkerProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let worker: Worker | undefined;
    const replies = new Map<string, (message: unknown) => void>();
    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        worker = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const replyTo = (event.data as { replyTo?: string }).replyTo;
          if (replyTo === undefined) return;
          const waiter = replies.get(replyTo);
          if (waiter === undefined) return;
          replies.delete(replyTo);
          waiter(event.data);
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    (window as ProbeWindow).askWorker = (kind, payload) => new Promise((resolve, reject) => {
      if (worker === undefined) { reject(new Error('simulation worker absent')); return; }
      const messageId = crypto.randomUUID();
      const timer = setTimeout(() => { replies.delete(messageId); reject(new Error(`worker ${kind} timed out`)); }, 20_000);
      replies.set(messageId, message => { clearTimeout(timer); resolve(message); });
      worker.postMessage({ protocolVersion: 1, messageId, kind, payload });
    });
  });
}

async function workerSnapshot(page: Page): Promise<SessionSnapshotBundle> {
  const snapshot = await page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { schemaVersion: number; data: SessionSnapshotBundle } } };
    return reply.payload.snapshot;
  });
  expect(snapshot.schemaVersion).toBe(4);
  return snapshot.data;
}
async function fixtureAnchors(page: Page): Promise<string[]> {
  const snapshot = await workerSnapshot(page);
  return snapshot.simulation?.objects?.placedObjects
      .filter(o => ['object.dining-table'].includes(o.objectId))
      .map(o => `${o.objectId}@${o.anchorTile.x},${o.anchorTile.y}:orientation=${o.orientation}`).sort() ?? [];
}

async function platePixels(page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number[]> {
  void page;
  return diningPlatePixels(png, quarterTurns);
}
let routeStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
const test = base.extend({
  storageState: async ({}, use) => { await use(routeStorage ?? { cookies: [], origins: [] }); },
});
test.describe.configure({ mode: 'serial' });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const snapshot = await page.evaluate(async () => (window as ProbeWindow).askWorker
    ? (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' })
    : null);
  if (snapshot !== null) await writeFile(info.outputPath('failed-construction-worker-snapshot.json'), JSON.stringify(snapshot, null, 2));
  await page.screenshot({ path: info.outputPath('failed-construction-fullhd.png') });
});

async function placePlan(page: Page, name: string, x: number, quarterTurns: 0 | 1 = 0): Promise<void> {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' }).selectOption(String(quarterTurns));
  await dialog.getByRole('button', { name, exact: true }).click();
  const input = dialog.getByRole('spinbutton', { name: 'Plan origin X' });
  if (!await input.isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
  await input.fill(String(x));
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('5');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('submitted');
  await page.keyboard.press('Escape');
}

async function finishQueuedConstruction(page: Page): Promise<void> {
  const panel = page.locator('.hud-build');
  let remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  while (remaining > 0) {
    await expect.poll(async () => Number(await panel.getAttribute('data-queued') ?? 0),
      { message: `construction must advance from ${remaining} unfinished orders` }).toBeLessThan(remaining);
    remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  }
}

test('player creates storage and delivery capacity before Canteen', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  expect(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])).toEqual([1920, 1080, 1]);
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await placePlan(page, 'Storage Room', 5);
  await placePlan(page, 'Delivery Bay', 12);
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'storage-room-basic', origin: { x: 5, y: 5 } },
    { type: 'PlaceRoomTemplate', templateId: 'delivery-bay-basic', origin: { x: 12, y: 5 } },
  ]);
  routeStorage = await page.context().storageState({ indexedDB: true });
});

for (const quarterTurns of [0, 1] as const) {
test(`player builds Canteen at quarterTurns${quarterTurns} and retains authored plates after Save/Load`, async ({ page }, info) => {
  const beganAt = Date.now();
  expect(routeStorage, 'this case consumes the first stage actual IndexedDB save').toBeDefined();
  await installWorkerProbe(page);
  await installTee(page);
  const loadedImages = await observeCanteenImages(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  expect(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])).toEqual([1920, 1080, 1]);
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  await placePlan(page, 'Canteen', 20, quarterTurns);
  const planned = await workerSnapshot(page);
  const request = planned.simulation?.roomTemplates?.pending.find(plan => plan.templateId === 'canteen-basic');
  expect(request).toMatchObject({ templateId: 'canteen-basic', origin: { x: 20, y: 5 }, mirrorX: false,
    ...(quarterTurns === 0 ? {} : { quarterTurns }) });
  if (request === undefined) throw new Error('Actual Canteen command has no pending owner');
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  const completionElapsedMs = Date.now() - beganAt;
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
  const expected = quarterTurns === 0
    ? ['object.dining-table@21,6:orientation=0', 'object.dining-table@24,6:orientation=0']
    : ['object.dining-table@25,6:orientation=1', 'object.dining-table@25,9:orientation=1'];
  const actualBefore = await fixtureAnchors(page);
  expect(actualBefore).toEqual(expected);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'canteen-basic', origin: { x: 20, y: 5 }, ...(quarterTurns === 0 ? {} : { quarterTurns }) },
  ]);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedBefore = await workerSnapshot(page);
  const ownersBefore = requireCanteenOwners(pausedBefore, quarterTurns, request.sequence);
  const minimapRegion = page.getByRole('region', { name: 'Minimap', exact: true });
  if (!await page.locator('.hud-minimap__surface').isVisible()) {
    await minimapRegion.getByRole('button', { name: 'Expand', exact: true }).click();
  }
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap absent');
  await minimap.click({ position: { x: bounds.width * 24 / 32, y: bounds.height * 9 / 32 } });
  await page.mouse.move(1300, 700);
  const completed = await page.screenshot({ path: info.outputPath('dining-worker-completed-fullhd.png') });
  const beforePixels = await platePixels(page, completed, quarterTurns);
  await writeFile(info.outputPath('worker-and-completed-pixel-evidence.json'), JSON.stringify({
    quarterTurns, actualBefore, beforePixels, commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  beforePixels.forEach((count, index) => expect.soft(count, `table${index + 1} authored plate rims after construction`).toBeGreaterThan(200));
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  const pausedAfter = await workerSnapshot(page);
  expect(pausedAfter).toEqual(pausedBefore);
  const ownersAfter = requireCanteenOwners(pausedAfter, quarterTurns, request.sequence);
  expect(ownersAfter).toEqual(ownersBefore);
  const actualAfter = await fixtureAnchors(page);
  expect(actualAfter).toEqual(expected);
  await minimap.click({ position: { x: bounds.width * 24 / 32, y: bounds.height * 9 / 32 } });
  await page.mouse.move(1300, 700);
  const loaded = await page.screenshot({ path: info.outputPath('dining-loaded-fullhd.png') });
  const afterPixels = await platePixels(page, loaded, quarterTurns);
  afterPixels.forEach((count, index) => expect.soft(count, `table${index + 1} authored plate rims after Load`).toBeGreaterThan(200));
  expect(afterPixels).toEqual(beforePixels);
  // Keep the historical plate crop/palette/threshold above unchanged. This new
  // low camera capture is pending native support-pixel calibration by root.
  const cameraControls = await publicSupportPose(page, quarterTurns);
  await expect.poll(async () => (await loadedImages()).responses.some(response =>
    decodeURIComponent(new URL(response.url).pathname) === SUPPORT_FRAME.url && response.sha256 === SUPPORT_FRAME.sha256)).toBe(true);
  await expect.poll(async () => (await loadedImages()).images.some(image =>
    image.sha256 === SUPPORT_FRAME.sha256 && image.complete && !image.error && image.width === 256 && image.height === 256)).toBe(true);
  await expect.poll(async () => (await loadedImages()).responses.some(response =>
    decodeURIComponent(new URL(response.url).pathname) === CANTEEN_BENCH_FRAME.url && response.sha256 === CANTEEN_BENCH_FRAME.sha256)).toBe(true);
  await expect.poll(async () => (await loadedImages()).images.some(image =>
    image.sha256 === CANTEEN_BENCH_FRAME.sha256 && image.complete && !image.error && image.width === 256 && image.height === 256)).toBe(true);
  await expect.poll(async () => [...new Set((await loadedImages()).catalogs.map(row =>
    decodeURIComponent(new URL(row.url).pathname)))].sort()).toEqual([
      '/game-content/oblique-canteen-bench.v1.json', '/game-content/oblique-furniture.canteen-dining-table.v1.json',
    ]);
  const pngLoading = await loadedImages();
  expect(pngLoading.errors).toEqual([]);
  const actualLoadedFrame = pngLoading.responses.find(response => decodeURIComponent(new URL(response.url).pathname) === SUPPORT_FRAME.url);
  expect(actualLoadedFrame).toMatchObject({
    status: 200, sha256: SUPPORT_FRAME.sha256, width: 256, height: 256,
  });
  const lowPoseWorker = await workerSnapshot(page);
  expect(lowPoseWorker).toEqual(pausedAfter);
  await page.mouse.move(1300, 700);
  await page.screenshot({ path: info.outputPath('dining-support-angle-pending-calibration-fullhd.png') });
  const evidencePath = info.outputPath('dining-worker-and-pixel-evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    quarterTurns, actualBefore, actualAfter, beforePixels, afterPixels,
    planned, pausedBefore, pausedAfter, ownersBefore, ownersAfter, lowPoseWorker,
    cameraControls, expectedSupportFrame: SUPPORT_FRAME, expectedBenchFrame: CANTEEN_BENCH_FRAME, pngLoading,
    actualLoadedFrame, completionElapsedMs, finalElapsedMs: Date.now() - beganAt,
    boundPerObjectRuntimeFrameObserved: false, supportPixelCalibrationPending: true,
    commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  await info.attach('dining-worker-and-pixel-evidence', { path: evidencePath, contentType: 'application/json' });

});
}
