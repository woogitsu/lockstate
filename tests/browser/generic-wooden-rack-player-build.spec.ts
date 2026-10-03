// Genuine native generic rack routes, calibrated independent pixels and Save/Load.
import { writeFile } from 'node:fs/promises';
import { assertOwnedObjectOrders, recordOwnedObjectSnapshot, type ExpectedOwnedObject } from './owned-object-worker-evidence';
import { expect, test as base, type Page } from './network-changed-fixture';
import { buy, installTee, sentCommands } from './playtest-harness';

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
      .filter(o => o.objectId === 'object.storage-rack' && o.anchorTile.x >= 20)
      .map(o => `${o.objectId}@${o.anchorTile.x},${o.anchorTile.y}:orientation=${o.orientation}`).sort() ?? [];
  });
}

async function rackPixels(page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number[]> {
  return page.evaluate(async ({ base64, quarterTurns }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // Actual native FullHD calibration at b61518d4e1, after full public LFS
    // hydration. The retained timber diffuseRGBA(.45,.27,.12,1) gives different
    // lit faces at native orientation0/1: RGB93,69,42 versus117,88,55.
    // Isolated non-overlapping regions: historical normal275/339, rotated362/93.
    // Rotated rear rack is partly behind the wall; only visible timber counts.
    // Physical supports change shading at b90c8b3: exact normal153/214, with
    // one 8-bit channel step360/423. Retain the original regions and >200/>70
    // thresholds; a1/255 tolerance counts the authored timber's adjacent
    // sampled shades, not metal, ground, masonry, or another furniture palette.
    const rects = quarterTurns === 0
      ? [[820, 330, 110, 160], [935, 330, 110, 160]]
      : [[820, 300, 110, 190], [935, 400, 90, 100]];
    const colour = quarterTurns === 0 ? [93, 69, 42] : [117, 88, 55];
    return rects.map(rect => {
      const pixels = context.getImageData(...rect as [number, number, number, number]).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i]! - colour[0]!) <= 1 && Math.abs(pixels[i + 1]! - colour[1]!) <= 1
          && Math.abs(pixels[i + 2]! - colour[2]!) <= 1) count++;
      }
      return count;
    });
  }, { base64: png.toString('base64'), quarterTurns });
}

async function placeIndividualRack(page: Page, x: number, y: number): Promise<void> {
  const coordinates = page.locator('.hud-build__coordinates');
  if (!await coordinates.locator('> .ui-section__body').isVisible()) {
    await coordinates.locator('> .ui-section__header').click();
  }
  await coordinates.getByRole('spinbutton', { name: 'Tile X', exact: true }).fill(String(x));
  await coordinates.getByRole('spinbutton', { name: 'Tile Y', exact: true }).fill(String(y));
  await coordinates.getByRole('button', { name: 'Place order', exact: true }).click();
}

async function removeRackRoomDesignation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Zones', exact: true }).click();
  const rooms = page.locator('.hud-rooms');
  await rooms.getByRole('button', { name: 'Remove rooms', exact: true }).click();
  if (await rooms.getAttribute('data-collapsed') === 'true') {
    await rooms.locator('> .ui-panel__header > .ui-panel__toggle').click();
  }
  const coordinates = rooms.locator('.hud-rooms__coordinates');
  if (!await coordinates.locator('> .ui-section__body').isVisible()) {
    await coordinates.locator('> .ui-section__header').click();
  }
  for (const [label, value] of [['Tile X', 20], ['Tile Y', 5], ['Width', 5], ['Height', 5]] as const) {
    await coordinates.getByRole('spinbutton', { name: label, exact: true }).fill(String(value));
  }
  await coordinates.getByRole('button', { name: 'Use these tiles', exact: true }).click();
  await rooms.locator('.hud-rooms__confirm').click();
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

test('player creates storage and delivery capacity before generic rack', async ({ page }) => {
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
test(`player reaches default generic racks at quarterTurns${quarterTurns} and retains both authored rack palettes and native anchors after Save/Load`, async ({ page }, info) => {
  expect(routeStorage, 'this case consumes the first stage actual IndexedDB save').toBeDefined();
  await installWorkerProbe(page);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  await placePlan(page, quarterTurns === 0 ? 'Staff Room' : 'Storage Room', 20, quarterTurns);
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
  if (quarterTurns === 0) {
    // Genuine individual placement is currently orientation0; the public
    // PlaceObject schema/HUD has no object rotation field or control.
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await buy(page, 'storage-rack-wooden', 2);
    await placeIndividualRack(page, 23, 6);
    await placeIndividualRack(page, 24, 7);
    await expect.poll(async () => Number(await page.locator('.hud-build').getAttribute('data-queued') ?? 0)).toBe(2);
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await finishQueuedConstruction(page);
  } else {
    // Genuine rotated template is the existing orientation1 producer. Remove
    // only its room designation using native Zones controls; objects must
    // remain, so default art is exercised without changing accepted overrides.
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await removeRackRoomDesignation(page);
    await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  }
  const expected = quarterTurns === 0
    ? ['object.storage-rack@23,6:orientation=0', 'object.storage-rack@24,7:orientation=0']
    : ['object.storage-rack@23,6:orientation=1', 'object.storage-rack@23,8:orientation=1'];
  const actualBefore = await fixtureAnchors(page);
  expect(actualBefore).toEqual(expected);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: quarterTurns === 0 ? 'staff-room-basic' : 'storage-room-basic', origin: { x: 20, y: 5 }, ...(quarterTurns === 0 ? {} : { quarterTurns }) },
  ]);
  const placements = (await sentCommands(page)).filter(c => c.type === 'PlaceObject').map(({ orderId: _orderId, ...command }) => command);
  expect(placements).toEqual(quarterTurns === 0 ? [
    { type: 'PlaceObject', definitionId: 'storage-rack-wooden', x: 23, y: 6 },
    { type: 'PlaceObject', definitionId: 'storage-rack-wooden', x: 24, y: 7 },
  ] : []);
  expect((await sentCommands(page)).filter(c => c.type === 'UnzoneRoom')).toEqual(quarterTurns === 1
    ? [{ type: 'UnzoneRoom', x: 20, y: 5, width: 5, height: 5 }] : []);
  if (quarterTurns === 0) await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const minimapRegion = page.getByRole('region', { name: 'Minimap', exact: true });
  if (!await page.locator('.hud-minimap__surface').isVisible()) {
    await minimapRegion.getByRole('button', { name: 'Expand', exact: true }).click();
  }
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap absent');
  await minimap.click({ position: { x: bounds.width * 23 / 32, y: bounds.height * 8 / 32 } });
  await page.mouse.move(1300, 700);
  const completed = await page.screenshot({ path: info.outputPath('generic-wooden-rack-worker-completed-fullhd.png') });
  const bought = (await sentCommands(page)).filter(command => command.type === 'PlaceObject');
  for (const command of bought) expect(typeof command.orderId).toBe('string');
  const owned: readonly ExpectedOwnedObject[] = quarterTurns === 0 ? [
    { anchorTile: { x: 23, y: 6 }, orientation: 0, sourceOrderId: String(bought[0]!.orderId) },
    { anchorTile: { x: 24, y: 7 }, orientation: 0, sourceOrderId: String(bought[1]!.orderId) },
  ] : [
    { anchorTile: { x: 23, y: 6 }, orientation: 1, sourceOrderId: 'room-template-000000000002-2-object-000' },
    { anchorTile: { x: 23, y: 8 }, orientation: 1, sourceOrderId: 'room-template-000000000002-2-object-001' },
  ];
  const completedData = await recordOwnedObjectSnapshot(page, info.outputPath('completed-worker-snapshot.json'));
  assertOwnedObjectOrders(completedData, 'object.storage-rack', 'storage-rack-wooden', owned);
  const beforePixels = await rackPixels(page, completed, quarterTurns);
  await writeFile(info.outputPath('worker-and-completed-save-evidence.json'), JSON.stringify({
    quarterTurns, actualBefore, beforePixels, commands: (await sentCommands(page)).filter(c => ['PlaceRoomTemplate', 'PlaceObject', 'UnzoneRoom'].includes(String(c.type))),
  }, null, 2));
  beforePixels.forEach((count, index) => expect.soft(count, `rack${index + 1} authored timber after construction`)
    .toBeGreaterThan(quarterTurns === 0 ? 200 : 70));
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText(quarterTurns === 0 ? '3' : '2');
  const actualAfter = await fixtureAnchors(page);
  expect(actualAfter).toEqual(expected);
  await minimap.click({ position: { x: bounds.width * 23 / 32, y: bounds.height * 8 / 32 } });
  await page.mouse.move(1300, 700);
  const loaded = await page.screenshot({ path: info.outputPath('generic-wooden-rack-loaded-fullhd.png') });
  const loadedData = await recordOwnedObjectSnapshot(page, info.outputPath('loaded-worker-snapshot.json'));
  assertOwnedObjectOrders(loadedData, 'object.storage-rack', 'storage-rack-wooden', owned);
  expect(loadedData).toEqual(completedData);
  const afterPixels = await rackPixels(page, loaded, quarterTurns);
  afterPixels.forEach((count, index) => expect.soft(count, `rack${index + 1} authored timber after Load`)
    .toBeGreaterThan(quarterTurns === 0 ? 200 : 70));
  expect(afterPixels).toEqual(beforePixels);
  const evidencePath = info.outputPath('generic-wooden-rack-worker-and-save-evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    quarterTurns, actualBefore, actualAfter, beforePixels, afterPixels,
    commands: (await sentCommands(page)).filter(c => ['PlaceRoomTemplate', 'PlaceObject', 'UnzoneRoom'].includes(String(c.type))),
  }, null, 2));
  await info.attach('generic-wooden-rack-worker-and-save-evidence', { path: evidencePath, contentType: 'application/json' });

  // Real native pose changes expose the authored support hardware after Load.
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: quarterTurns === 0 ? 'Rotate camera right' : 'Rotate camera left', exact: true }).click();
  await page.mouse.move(1300, 700);
  await page.screenshot({ path: info.outputPath('physical-hardware-loaded-fullhd.png') });

});
}
