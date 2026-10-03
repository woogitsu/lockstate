// Pending native transfer-neck acceptance; original opened palette/detail controls retained.
import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands, currentClock } from './playtest-harness';

import { assertToiletProducer, observeToiletNetwork, type ToiletSnapshotData } from './cell-toilet-flush-neck-evidence';

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

async function recordToiletSnapshot(page: Page, path: string): Promise<ToiletSnapshotData> {
  const reply=await page.evaluate(async ()=>(window as ProbeWindow).askWorker!('simulation/request-snapshot',{reason:'consistency-check'}));
  await writeFile(path,JSON.stringify(reply,null,2));
  const snapshot=(reply as {payload:{snapshot:{schemaVersion:number;data:ToiletSnapshotData}}}).payload.snapshot;
  expect(snapshot.schemaVersion).toBe(3);
  return snapshot.data;
}

async function fixtureAnchors(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { data: { simulation: { objects?: { placedObjects: { objectId: string; anchorTile: { x: number; y: number }; orientation: number }[] } } } } };
    };
    return reply.payload.snapshot.data.simulation.objects?.placedObjects
      .filter(o => ['object.toilet'].includes(o.objectId))
      .map(o => `${o.objectId}@${o.anchorTile.x},${o.anchorTile.y}:orientation=${o.orientation}`).sort() ?? [];
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
      .filter(object => object.objectId === 'object.toilet')
      .map(object => ({ objectId: object.objectId, sourceOrderId: object.sourceOrderId,
        anchorTile: object.anchorTile, orientation: object.orientation,
        order: data.construction.orders.find(order => order.id === object.sourceOrderId),
      })).sort((a, b) => a.anchorTile.x - b.anchorTile.x || a.anchorTile.y - b.anchorTile.y);
  });
}

async function toiletPalettePixels(page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number[]> {
  return page.evaluate(async ({ base64, quarterTurns }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // Opened native completed/loaded frames calibrate separate front-panel
    // and physical valve-wheel regions. The narrower blue-steel predicate
    // excludes neutral/brown walls while preserving the original >8 guard.
    const rects = quarterTurns === 0
      ? [[936, 678, 53, 29], [983, 707, 16, 17]]
      : [[993, 440, 44, 26], [1040, 458, 17, 18]];
    const colour = quarterTurns === 0 ? [49, 128, 135] : [48, 127, 135];
    return rects.map((rect, regionIndex) => {
      const pixels = context.getImageData(...rect as [number, number, number, number]).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
        const matches = regionIndex === 0
          ? r === colour[0] && g === colour[1] && b === colour[2]
          : r >= 90 && r <= 180 && g > r && g - r <= 12 && b >= g && b - g <= 12;
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
const networkCaptures=new WeakMap<Page, ReturnType<typeof observeToiletNetwork>>();

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  await networkCaptures.get(page)?.raw(info.outputPath('failed-toilet-raw-network-provenance.json'));
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

test('player creates storage and delivery capacity before Basic cell', async ({ page }, info) => {
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
  const capacity=await recordToiletSnapshot(page,info.outputPath('capacity-completed-worker-snapshot.json'));
  assertToiletProducer(capacity,0,false);
  routeStorage = await page.context().storageState({ indexedDB: true });
});

for (const quarterTurns of [0, 1] as const) {
test(`player builds Basic cell at quarterTurns${quarterTurns} and retains toilet palettes and anchors after Save/Load`, async ({ page }, info) => {
  expect(routeStorage, 'this case consumes the first stage actual IndexedDB save').toBeDefined();
  const network=observeToiletNetwork(page);
  networkCaptures.set(page,network);
  await installWorkerProbe(page);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  const capacity=await recordToiletSnapshot(page,info.outputPath('capacity-loaded-worker-snapshot.json'));
  assertToiletProducer(capacity,0,false);
  await placePlan(page, 'Basic cell', 20, quarterTurns);
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
  const expected = quarterTurns === 0
    ? ['object.toilet@22,9:orientation=0']
    : ['object.toilet@22,7:orientation=1'];
  const actualBefore = await fixtureAnchors(page);
  expect(actualBefore).toEqual(expected);
  const ownershipBefore = await fixtureOwnership(page);
  expect(ownershipBefore).toHaveLength(1);
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
    { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 5 }, ...(quarterTurns === 0 ? {} : { quarterTurns }) },
  ]);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const minimapRegion = page.getByRole('region', { name: 'Minimap', exact: true });
  if (!await page.locator('.hud-minimap__surface').isVisible()) {
    await minimapRegion.getByRole('button', { name: 'Expand', exact: true }).click();
  }
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap absent');
  await minimap.click({ position: { x: bounds.width * 21.5 / 32, y: bounds.height * 6.5 / 32 } });
  await page.mouse.move(1300, 700);
  // Genuine native pose controls expose the front service hardware instead
  // of measuring the door that occludes the toilet in the initial -45 view.
  const turn = quarterTurns === 0 ? 'Rotate camera right' : 'Rotate camera left';
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: turn, exact: true }).click();
  const completed = await page.screenshot({ path: info.outputPath('dedicated-cell-toilet-worker-completed-fullhd.png') });
  await expect.poll(()=>currentClock(page)).toMatchObject({mode:'paused'});
  const completedData=await recordToiletSnapshot(page,info.outputPath('toilet-completed-whole-paused-worker-snapshot.json'));
  assertToiletProducer(completedData,quarterTurns);
  const beforePixels = await toiletPalettePixels(page, completed, quarterTurns);
  await writeFile(info.outputPath('worker-and-completed-save-evidence.json'), JSON.stringify({
    quarterTurns, actualBefore, beforePixels, commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  beforePixels.forEach((count, index) => expect.soft(count, `toilet ${index + 1} authored palette after construction`)
    .toBeGreaterThan(index === 0 ? 100 : 8));
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  const actualAfter = await fixtureAnchors(page);
  expect(actualAfter).toEqual(expected);
  const ownershipAfter = await fixtureOwnership(page);
  expect(ownershipAfter).toEqual(ownershipBefore);
  await writeFile(info.outputPath('loaded-worker-snapshot.json'), JSON.stringify(await page.evaluate(async () =>
    (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' })), null, 2));
  await minimap.click({ position: { x: bounds.width * 21.5 / 32, y: bounds.height * 6.5 / 32 } });
  await page.mouse.move(1300, 700);
  const loaded = await page.screenshot({ path: info.outputPath('dedicated-cell-toilet-loaded-fullhd.png') });
  await expect.poll(()=>currentClock(page)).toMatchObject({mode:'paused'});
  const loadedData=await recordToiletSnapshot(page,info.outputPath('toilet-loaded-whole-paused-worker-snapshot.json'));
  assertToiletProducer(loadedData,quarterTurns);
  expect(loadedData).toEqual(completedData);
  const afterPixels = await toiletPalettePixels(page, loaded, quarterTurns);
  afterPixels.forEach((count, index) => expect.soft(count, `toilet ${index + 1} authored palette after Load`)
    .toBeGreaterThan(index === 0 ? 100 : 8));
  expect(afterPixels).toEqual(beforePixels);
  const evidencePath = info.outputPath('dedicated-cell-toilet-worker-and-save-evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    quarterTurns, actualBefore, actualAfter, ownershipBefore, ownershipAfter, beforePixels, afterPixels, completedData, loadedData,
    commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  await info.attach('dedicated-cell-toilet-worker-and-save-evidence', { path: evidencePath, contentType: 'application/json' });

  // Separate transfer-neck view AFTER every original calibrated crop/colour/minimum.
  // Original palette recipe ends q0 at global15; q1 at global-105/local-15.
  // Additional right steps2/4 reach global45/-45, both local45 afterorientation.
  // Public native RMB drag17px lowers45deg to40.129859deg, selecting source40.
  for (let step=0;step<(quarterTurns===0?2:4);step++) {
    await page.getByRole('button',{name:'Rotate camera right',exact:true}).click();
  }
  await page.mouse.move(1200,650);
  await page.mouse.down({button:'right'});
  await page.mouse.move(1200,667,{steps:3});
  await page.mouse.up({button:'right'});
  await minimap.click({position:{x:bounds.width*21.5/32,y:bounds.height*6.5/32}});
  const networkEvidence=await network.evidence(info,quarterTurns);
  await page.mouse.move(1300,700);
  await page.screenshot({path:info.outputPath('toilet-transfer-neck-local45-elev40-loaded-fullhd.png')});
  const detailData=await recordToiletSnapshot(page,info.outputPath('toilet-detail-whole-paused-worker-snapshot.json'));
  expect(detailData).toEqual(loadedData);
  await writeFile(info.outputPath('toilet-detail-pending-native-recipe.json'),JSON.stringify({
    quarterTurns,originalPaletteCameraTurnDirection:quarterTurns===0?'right':'left',originalPaletteCameraTurns:4,
    additionalCameraRightButtons:quarterTurns===0?2:4,rightButtonDragFrom:[1200,650],rightButtonDragTo:[1200,667],
    expectedGlobalYawDegrees:quarterTurns===0?45:-45,expectedLocalObjectYawDegrees:45,
    expectedGlobalElevationDegrees:45-17*.005*180/Math.PI,selectedSourcePose:[45,40],
    networkEvidence,transferNeckRoiMeasured:false,sourcePreviewSubstitutedForNative:false,
  },null,2));


});
}
