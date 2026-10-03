// Pending native acceptance of the complete floor-mounted Bench source; historical crops/colour/minima retained.
import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands, currentClock } from './playtest-harness';
import { assertBenchProducer, observeBenchNetwork, type BenchSnapshotData } from './wooden-bench-crossrails-evidence';

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

async function recordBenchSnapshot(page: Page, path: string): Promise<BenchSnapshotData> {
  const reply = await page.evaluate(async () => (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }));
  await writeFile(path, JSON.stringify(reply, null, 2));
  const snapshot = (reply as { payload: { snapshot: { schemaVersion: number; data: BenchSnapshotData } } }).payload.snapshot;
  expect(snapshot.schemaVersion).toBe(3);
  return snapshot.data;
}

async function fixtureAnchors(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { data: { simulation: { objects?: { placedObjects: { objectId: string; anchorTile: { x: number; y: number }; orientation: number }[] } } } } };
    };
    return reply.payload.snapshot.data.simulation.objects?.placedObjects
      .filter(o => ['object.bench'].includes(o.objectId))
      .map(o => `${o.objectId}@${o.anchorTile.x},${o.anchorTile.y}:orientation=${o.orientation}`).sort() ?? [];
  });
}

async function timberPixels(page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number[]> {
  return page.evaluate(async ({ base64, quarterTurns }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // Calibrated from opened native worker-built Holding Cell FullHD frames.
    // Each disjoint region contains one bench; the rotated rear bench is partly
    // occluded by its wall. Removing only the default bench consumer must zero
    // both regions while completed objects and Save/Load anchors remain intact.
    const rects = quarterTurns === 0
      ? [[720, 415, 150, 145], [945, 410, 150, 115]]
      : [[875, 350, 135, 100], [875, 510, 145, 110]];
    const colour = [150, 115, 75];
    return rects.map(rect => {
      const pixels = context.getImageData(...rect as [number, number, number, number]).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === colour[0] && pixels[i + 1] === colour[1] && pixels[i + 2] === colour[2]) count++;
      }
      return count;
    });
  }, { base64: png.toString('base64'), quarterTurns });
}
let routeStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
const test = base.extend({
  storageState: async ({}, use) => { await use(routeStorage ?? { cookies: [], origins: [] }); },
});
test.describe.configure({ mode: 'serial' });
const networkCaptures = new WeakMap<Page, ReturnType<typeof observeBenchNetwork>>();

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  await networkCaptures.get(page)?.raw(info.outputPath('failed-bench-raw-network-provenance.json'));
  const snapshot = await page.evaluate(async () => (window as ProbeWindow).askWorker
    ? (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' })
    : null);
  if (snapshot !== null) await writeFile(info.outputPath('failed-player-worker-snapshot.json'), JSON.stringify(snapshot, null, 2));
  await page.screenshot({ path: info.outputPath('failed-player-fullhd.png') });
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

test('player creates storage and delivery capacity before Holding Cell', async ({ page }, info) => {
  await installWorkerProbe(page);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
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
  const capacity = await recordBenchSnapshot(page, info.outputPath('capacity-completed-worker-snapshot.json'));
  assertBenchProducer(capacity, 0, false);
  routeStorage = await page.context().storageState({ indexedDB: true });
});

for (const quarterTurns of [0, 1] as const) {
test(`player builds Holding Cell at quarterTurns${quarterTurns} and retains authored timber palette after Save/Load`, async ({ page }, info) => {
  expect(routeStorage, 'this case consumes the first stage actual IndexedDB save').toBeDefined();
  const network = observeBenchNetwork(page);
  networkCaptures.set(page,network);
  await installWorkerProbe(page);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  const capacity = await recordBenchSnapshot(page, info.outputPath('capacity-loaded-worker-snapshot.json'));
  assertBenchProducer(capacity, 0, false);
  await placePlan(page, 'Holding Cell', 20, quarterTurns);
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
  const expected = quarterTurns === 0
    ? ['object.bench@21,6:orientation=0', 'object.bench@23,8:orientation=0']
    : ['object.bench@22,8:orientation=1', 'object.bench@24,6:orientation=1'];
  const actualBefore = await fixtureAnchors(page);
  expect(actualBefore).toEqual(expected);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'holding-cell-basic', origin: { x: 20, y: 5 }, ...(quarterTurns === 0 ? {} : { quarterTurns }) },
  ]);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const minimapRegion = page.getByRole('region', { name: 'Minimap', exact: true });
  if (!await page.locator('.hud-minimap__surface').isVisible()) {
    await minimapRegion.getByRole('button', { name: 'Expand', exact: true }).click();
  }
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap absent');
  await minimap.click({ position: { x: bounds.width * 23 / 32, y: bounds.height * 8 / 32 } });
  await page.mouse.move(1300, 700);
  const completed = await page.screenshot({ path: info.outputPath('wooden-bench-worker-completed-fullhd.png') });
  await expect.poll(() => currentClock(page)).toMatchObject({ mode: 'paused' });
  const completedData = await recordBenchSnapshot(page, info.outputPath('bench-completed-whole-paused-worker-snapshot.json'));
  assertBenchProducer(completedData, quarterTurns);
  const beforePixels = await timberPixels(page, completed, quarterTurns);
  await writeFile(info.outputPath('worker-and-completed-pixel-evidence.json'), JSON.stringify({
    quarterTurns, actualBefore, beforePixels, commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  beforePixels.forEach((count, index) => expect.soft(count, `fixture${index + 1} authored timber assembly after construction`)
    .toBeGreaterThan(300));
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  const actualAfter = await fixtureAnchors(page);
  expect(actualAfter).toEqual(expected);
  await minimap.click({ position: { x: bounds.width * 23 / 32, y: bounds.height * 8 / 32 } });
  await page.mouse.move(1300, 700);
  const loaded = await page.screenshot({ path: info.outputPath('wooden-bench-loaded-fullhd.png') });
  // Loaded installs the initial clock without a later broadcast. Public Pause
  // and the complete worker snapshot below prove the paused roundtrip.
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const loadedData = await recordBenchSnapshot(page, info.outputPath('bench-loaded-whole-paused-worker-snapshot.json'));
  assertBenchProducer(loadedData, quarterTurns);
  expect(loadedData).toEqual(completedData);
  const afterPixels = await timberPixels(page, loaded, quarterTurns);
  afterPixels.forEach((count, index) => expect.soft(count, `fixture${index + 1} authored timber assembly after Load`)
    .toBeGreaterThan(300));
  expect(afterPixels).toEqual(beforePixels);
  const evidencePath = info.outputPath('wooden-bench-worker-and-pixel-evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    quarterTurns, actualBefore, actualAfter, beforePixels, afterPixels, completedData, loadedData,
    commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  await info.attach('wooden-bench-worker-and-pixel-evidence', { path: evidencePath, contentType: 'application/json' });

  // Separate public detail view AFTER unchanged legacy crops and Save/Load checks.
  // q0: -45 +7*15 =60; q1: -45 +1*15 +90*objectOrientation =60 local.
  // Native right-button drag17px lowers45deg by17*.005 radians to40.129859deg,
  // safely selecting elevation40 rather than relying on a35/45deg tie.
  for (let step=0; step < (quarterTurns === 0 ? 7 : 1); step++) {
    await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
  }
  await page.mouse.move(1200,650);
  await page.mouse.down({button:'right'});
  await page.mouse.move(1200,667,{steps:3});
  await page.mouse.up({button:'right'});
  await minimap.click({ position: { x: bounds.width * 23 / 32, y: bounds.height * 8 / 32 } });
  const networkEvidence = await network.evidence(info,quarterTurns);
  await page.mouse.move(1300,700);
  await page.screenshot({path:info.outputPath('bench-connected-rails-local60-elev40-loaded-fullhd.png')});
  const detailData = await recordBenchSnapshot(page,info.outputPath('bench-detail-whole-paused-worker-snapshot.json'));
  expect(detailData).toEqual(loadedData);
  await writeFile(info.outputPath('bench-detail-pending-native-recipe.json'),JSON.stringify({
    quarterTurns,cameraRightButtons:quarterTurns===0?7:1,rightButtonDragFrom:[1200,650],rightButtonDragTo:[1200,667],
    expectedGlobalYawDegrees:quarterTurns===0?60:-30,expectedLocalObjectYawDegrees:60,
    expectedGlobalElevationDegrees:45-17*.005*180/Math.PI,selectedSourcePose:[60,40],
    networkEvidence,hardwareRoiMeasured:false,sourcePreviewSubstitutedForNative:false,
  },null,2));

});
}
