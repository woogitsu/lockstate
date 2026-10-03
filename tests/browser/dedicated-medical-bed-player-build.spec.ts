// Actual combined native Infirmary Build/Load accepted on bb521c103e, 2026-10-03.
// Historical q0 control retained; original q1 estimate passed inspected native PNGs unchanged.
import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

interface ProbeWindow extends Window {
  askWorker?: (kind: string, payload: unknown) => Promise<unknown>;
}

interface BedSnapshotData {
  simulation: { objects: { placedObjects: {
    placedObjectId: string; objectId: string; sourceOrderId?: string;
    anchorTile: { x: number; y: number }; orientation: number;
  }[] } };
  construction: { orders: {
    id: string; definitionId: string; location: { x: number; y: number };
    state: string; objectOrientation?: number;
  }[] };
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

async function recordWorkerSnapshot(page: Page, path: string): Promise<BedSnapshotData> {
  const reply = await page.evaluate(async () =>
    (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }));
  await writeFile(path, JSON.stringify(reply, null, 2));
  return (reply as { payload: { snapshot: { data: BedSnapshotData } } }).payload.snapshot.data;
}

function assertMedicalBedProducer(data: BedSnapshotData, quarterTurns: 0 | 1): void {
  const bed = data.simulation.objects.placedObjects.find(object => object.objectId === 'object.medical-bed');
  expect(bed).toMatchObject({
    placedObjectId: quarterTurns === 0 ? 'object:21:6' : 'object:23:6',
    objectId: 'object.medical-bed', anchorTile: { x: quarterTurns === 0 ? 21 : 23, y: 6 },
    orientation: quarterTurns, sourceOrderId: 'room-template-000000000002-2-object-000',
  });
  expect(data.simulation.objects.placedObjects.filter(object => object.objectId === 'object.medical-bed')).toHaveLength(1);
  const orders = data.construction.orders.filter(candidate => candidate.id === bed!.sourceOrderId);
  expect(orders).toHaveLength(1);
  const order = orders[0];
  expect(order).toMatchObject({
    id: bed!.sourceOrderId, definitionId: 'medical-bed-wooden', state: 'completed',
    location: bed!.anchorTile,
  });
  expect(order!.objectOrientation ?? 0).toBe(quarterTurns);
}

async function fixtureAnchors(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { data: { simulation: { objects?: { placedObjects: { objectId: string; anchorTile: { x: number; y: number }; orientation: number }[] } } } } };
    };
    return reply.payload.snapshot.data.simulation.objects?.placedObjects
      .filter(o => ['object.medical-bed', 'object.medicine-cabinet'].includes(o.objectId))
      .map(o => `${o.objectId}@${o.anchorTile.x},${o.anchorTile.y}:orientation=${o.orientation}`).sort() ?? [];
  });
}

async function bedPalettePixels(page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number[]> {
  return page.evaluate(async ({ base64, quarterTurns }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // Preserve the accepted original q0 actual-client crop/RGB/>100 control.
    // q1 colour89,113,120 originated in the authored yaw30/elev40 frame.
    // The unchanged region/RGB/>100 passed actual bb521c103e Build/Load PNGs;
    // actual binding removal produced0 pixels, exact restoration312.
    const rects = quarterTurns === 0 ? [[705,425,170,175]] : [[830,350,200,200]];
    const colours = quarterTurns === 0 ? [[79,102,108]] : [[89,113,120]];
    return rects.map((rect, regionIndex) => {
      const colour = colours[regionIndex]!;
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

test('player creates actual storage and delivery capacity before detailed medical bed Infirmary', async ({ page }) => {
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
  routeStorage = await page.context().storageState({ indexedDB: true });
});

for (const quarterTurns of [0, 1] as const) {
test(`player builds Infirmary at quarterTurns${quarterTurns} and retains the authored medical bed headboard palette and anchors after Save/Load`, async ({ page }, info) => {
  expect(routeStorage, 'this case consumes the first stage actual IndexedDB save').toBeDefined();
  await installWorkerProbe(page);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  await placePlan(page, 'Infirmary', 20, quarterTurns);
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
  const expected = quarterTurns === 0
    ? ['object.medical-bed@21,6:orientation=0', 'object.medicine-cabinet@23,6:orientation=0']
    : ['object.medical-bed@23,6:orientation=1', 'object.medicine-cabinet@24,8:orientation=1'];
  const actualBefore = await fixtureAnchors(page);
  expect(actualBefore).toEqual(expected);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'infirmary-basic', origin: { x: 20, y: 5 }, ...(quarterTurns === 0 ? {} : { quarterTurns }) },
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
  const completed = await page.screenshot({ path: info.outputPath('dedicated-medical-bed-worker-completed-fullhd.png') });
  const completedData = await recordWorkerSnapshot(page, info.outputPath('dedicated-medical-bed-completed-worker-snapshot.json'));
  assertMedicalBedProducer(completedData, quarterTurns);
  const beforePixels = await bedPalettePixels(page, completed, quarterTurns);
  await writeFile(info.outputPath('worker-and-completed-save-evidence.json'), JSON.stringify({
    quarterTurns, actualBefore, beforePixels, commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  beforePixels.forEach((count, index) => expect.soft(count, `medical bed retained headboard ${index + 1} after construction`)
    .toBeGreaterThan(100));
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  const actualAfter = await fixtureAnchors(page);
  expect(actualAfter).toEqual(expected);
  await minimap.click({ position: { x: bounds.width * 23 / 32, y: bounds.height * 8 / 32 } });
  await page.mouse.move(1300, 700);
  const loaded = await page.screenshot({ path: info.outputPath('dedicated-medical-bed-loaded-fullhd.png') });
  const loadedData = await recordWorkerSnapshot(page, info.outputPath('dedicated-medical-bed-loaded-worker-snapshot.json'));
  assertMedicalBedProducer(loadedData, quarterTurns);
  expect(loadedData).toEqual(completedData);
  const afterPixels = await bedPalettePixels(page, loaded, quarterTurns);
  afterPixels.forEach((count, index) => expect.soft(count, `medical bed retained headboard ${index + 1} after Load`)
    .toBeGreaterThan(100));
  expect(afterPixels).toEqual(beforePixels);
  const evidencePath = info.outputPath('dedicated-medical-bed-worker-and-save-evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    quarterTurns, actualBefore, actualAfter, beforePixels, afterPixels,
    commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  await info.attach('dedicated-medical-bed-worker-and-save-evidence', { path: evidencePath, contentType: 'application/json' });

  // Separate genuine native-camera detail view for rail/caster/lifting
  // inspection. No source-preview render is substituted for player pixels.
  for (let step = 0; step < 6; step++) {
    await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
  }
  await page.mouse.move(1300, 700);
  await page.screenshot({ path: info.outputPath('dedicated-medical-bed-hardware-loaded-fullhd.png') });

});
}
