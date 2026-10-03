// Genuine Laundry worker construction and Save/Load; independently isolated native glass regions.
import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { observeWasherImages, publicGripPose, requireWasherOwners, GRIP_FRAME } from './laundry-washer-evidence';

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

async function fixtureAnchors(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { data: { simulation: { objects?: { placedObjects: { objectId: string; anchorTile: { x: number; y: number }; orientation: number }[] } } } } };
    };
    return reply.payload.snapshot.data.simulation.objects?.placedObjects
      .filter(o => ['object.washing-machine'].includes(o.objectId))
      .map(o => `${o.objectId}@${o.anchorTile.x},${o.anchorTile.y}:orientation=${o.orientation}`).sort() ?? [];
  });
}

async function workerSnapshot(page: Page): Promise<SessionSnapshotBundle> {
  return page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { data: SessionSnapshotBundle } } };
    return reply.payload.snapshot.data;
  });
}

async function fixtureOwnership(page: Page) {
  return page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { data: {
        construction: { orders: { id: string; state: string; location: { x: number; y: number }; objectOrientation?: number }[] };
        simulation: { objects?: { placedObjects: { objectId: string; anchorTile: { x: number; y: number }; orientation: number; sourceOrderId?: string }[] } };
      } } };
    };
    const data = reply.payload.snapshot.data;
    return (data.simulation.objects?.placedObjects ?? [])
      .filter(object => object.objectId === 'object.washing-machine')
      .map(object => ({ objectId: object.objectId, sourceOrderId: object.sourceOrderId,
        anchorTile: object.anchorTile, orientation: object.orientation,
        order: data.construction.orders.find(order => order.id === object.sourceOrderId),
      })).sort((a, b) => a.anchorTile.x - b.anchorTile.x || a.anchorTile.y - b.anchorTile.y);
  });
}

async function washerPalettePixels(page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number[]> {
  return page.evaluate(async ({ base64, quarterTurns }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // Opened native Full HD q0 glass counts827/833; q1 counts1484/1480.
    // Rotated facing changes actual authored glass illumination. Foreground
    // walls hide the right sides; these disjoint crops sample exposed glass.
    const rects = quarterTurns === 0
      ? [[820, 400, 90, 140], [975, 340, 65, 110]]
      : [[990, 384, 48, 54], [1100, 465, 52, 61]];
    const colour = quarterTurns === 0 ? [32, 59, 66] : [36, 67, 76];
    return rects.map(rect => {
      const pixels = context.getImageData(...rect as [number, number, number, number]).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
        const matches = r === colour[0] && g === colour[1] && b === colour[2];
        if (matches) count++;
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

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
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

test('player creates storage and delivery capacity before Laundry', async ({ page }) => {
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
test(`player builds Laundry at quarterTurns${quarterTurns} and retains washing machine palettes and anchors after Save/Load`, async ({ page }, info) => {
  const beganAt = Date.now();
  expect(routeStorage, 'this case consumes the first stage actual IndexedDB save').toBeDefined();
  await installWorkerProbe(page);
  await installTee(page);
  const loadedImages = await observeWasherImages(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  expect(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])).toEqual([1920, 1080, 1]);
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  await placePlan(page, 'Laundry', 20, quarterTurns);
  const planned = await workerSnapshot(page);
  const request = planned.simulation?.roomTemplates?.pending.find(plan => plan.templateId === 'laundry-basic');
  expect(request).toMatchObject({ templateId: 'laundry-basic', origin: { x: 20, y: 5 }, mirrorX: false,
    ...(quarterTurns === 0 ? {} : { quarterTurns }) });
  if (request === undefined) throw new Error('Actual Laundry command has no pending owner');
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  const completionElapsedMs = Date.now() - beganAt;
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
  const expected = quarterTurns === 0
    ? ['object.washing-machine@21,6:orientation=0', 'object.washing-machine@23,6:orientation=0']
    : ['object.washing-machine@24,6:orientation=1', 'object.washing-machine@24,8:orientation=1'];
  const actualBefore = await fixtureAnchors(page);
  expect(actualBefore).toEqual(expected);
  const ownershipBefore = await fixtureOwnership(page);
  expect(ownershipBefore).toHaveLength(2);
  expect(new Set(ownershipBefore.map(object => object.sourceOrderId)).size).toBe(2);
  for (const object of ownershipBefore) {
    expect(object.sourceOrderId).toEqual(expect.any(String));
    expect(object.sourceOrderId!.length).toBeGreaterThan(0);
    expect(object.order?.state).toBe('completed');
    expect(object.order?.location).toEqual(object.anchorTile);
    expect(object.order?.objectOrientation ?? 0).toBe(object.orientation);
  }
  await writeFile(info.outputPath('completed-worker-snapshot.json'), JSON.stringify(await page.evaluate(async () =>
    (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' })), null, 2));
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'laundry-basic', origin: { x: 20, y: 5 }, ...(quarterTurns === 0 ? {} : { quarterTurns }) },
  ]);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedBefore = await workerSnapshot(page);
  const authoredOwnersBefore = requireWasherOwners(pausedBefore, quarterTurns, request.sequence);
  const minimapRegion = page.getByRole('region', { name: 'Minimap', exact: true });
  if (!await page.locator('.hud-minimap__surface').isVisible()) {
    await minimapRegion.getByRole('button', { name: 'Expand', exact: true }).click();
  }
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap absent');
  await minimap.click({ position: { x: bounds.width * 22.5 / 32, y: bounds.height * 7.5 / 32 } });
  await page.mouse.move(1300, 700);
  const completed = await page.screenshot({ path: info.outputPath('dedicated-laundry-washing-machine-worker-completed-fullhd.png') });
  const beforePixels = await washerPalettePixels(page, completed, quarterTurns);
  await writeFile(info.outputPath('worker-and-completed-save-evidence.json'), JSON.stringify({
    quarterTurns, actualBefore, beforePixels, commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  beforePixels.forEach((count, index) => expect.soft(count, `washing machine ${index + 1} authored palette after construction`)
    .toBeGreaterThan(100));
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  const pausedAfter = await workerSnapshot(page);
  expect(pausedAfter).toEqual(pausedBefore);
  const authoredOwnersAfter = requireWasherOwners(pausedAfter, quarterTurns, request.sequence);
  expect(authoredOwnersAfter).toEqual(authoredOwnersBefore);
  const actualAfter = await fixtureAnchors(page);
  expect(actualAfter).toEqual(expected);
  const ownershipAfter = await fixtureOwnership(page);
  expect(ownershipAfter).toEqual(ownershipBefore);
  await writeFile(info.outputPath('loaded-worker-snapshot.json'), JSON.stringify(await page.evaluate(async () =>
    (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' })), null, 2));
  await minimap.click({ position: { x: bounds.width * 22.5 / 32, y: bounds.height * 7.5 / 32 } });
  await page.mouse.move(1300, 700);
  const loaded = await page.screenshot({ path: info.outputPath('dedicated-laundry-washing-machine-loaded-fullhd.png') });
  const afterPixels = await washerPalettePixels(page, loaded, quarterTurns);
  afterPixels.forEach((count, index) => expect.soft(count, `washing machine ${index + 1} authored palette after Load`)
    .toBeGreaterThan(100));
  expect(afterPixels).toEqual(beforePixels);
  // Preserve all original native glass crops/colours/minima above. These new
  // service-grip pixels must be calibrated from the actual screenshot by root.
  const cameraControls = await publicGripPose(page, quarterTurns);
  await expect.poll(async () => (await loadedImages()).responses.some(response =>
    new URL(response.url).pathname === GRIP_FRAME.url && response.sha256 === GRIP_FRAME.sha256)).toBe(true);
  await expect.poll(async () => (await loadedImages()).images.some(image =>
    image.sha256 === GRIP_FRAME.sha256 && image.complete && !image.error && image.width === 256 && image.height === 256)).toBe(true);
  const pngLoading = await loadedImages();
  expect(pngLoading.errors).toEqual([]);
  expect(pngLoading.descriptors).toContainEqual(expect.objectContaining({ status: 200,
    data: expect.objectContaining({ assetId: 'utility.washing-machine.variants',
      sourceSha256: '4c4b52811935cb5fe44ee4ad09bbee1b5179484aecdb7eb001c71047c4a493c0',
      frames: expect.arrayContaining([expect.objectContaining({ yawDegrees: 0, elevationDegrees: 40,
        image: GRIP_FRAME.url, sha256: GRIP_FRAME.sha256 })]),
    }),
  }));
  const actualLoadedFrame = pngLoading.responses.find(response => new URL(response.url).pathname === GRIP_FRAME.url);
  expect(actualLoadedFrame).toMatchObject({ status: 200, sha256: GRIP_FRAME.sha256, width: 256, height: 256 });
  const gripPoseWorker = await workerSnapshot(page);
  expect(gripPoseWorker).toEqual(pausedAfter);
  await page.mouse.move(1300, 700);
  await page.screenshot({ path: info.outputPath('washer-service-grip-pending-calibration-fullhd.png') });
  const evidencePath = info.outputPath('dedicated-laundry-washing-machine-worker-and-save-evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    quarterTurns, actualBefore, actualAfter, ownershipBefore, ownershipAfter, beforePixels, afterPixels,
    planned, pausedBefore, pausedAfter, authoredOwnersBefore, authoredOwnersAfter, gripPoseWorker,
    cameraControls, expectedGripFrame: GRIP_FRAME, actualLoadedFrame, pngLoading,
    completionElapsedMs, finalElapsedMs: Date.now() - beganAt,
    boundPerObjectRuntimeFrameObserved: false, gripPixelCalibrationPending: true,
    commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  await info.attach('dedicated-laundry-washing-machine-worker-and-save-evidence', { path: evidencePath, contentType: 'application/json' });

});
}
