import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { writeFile } from 'node:fs/promises';
import { assertOwnedObjectOrders, recordOwnedObjectSnapshot, type ExpectedOwnedObject } from './owned-object-worker-evidence';

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
      payload: { snapshot: { data: { simulation: { objects?: { placedObjects: { objectId: string; anchorTile: { x: number; y: number } }[] } } } } };
    };
    return reply.payload.snapshot.data.simulation.objects?.placedObjects
      .filter(o => ['object.bookshelf'].includes(o.objectId))
      .map(o => `${o.objectId}@${o.anchorTile.x},${o.anchorTile.y}`).sort() ?? [];
  });
}

async function authoredBookPixels(page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number> {
  return page.evaluate(async ({ base64, quarterTurns }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // Retain the original precise front-face region. The rotated plan is
    // viewed through actual camera buttons; its isolated classroom occupies
    // this central playfield region, with no other bookshelf in the save.
    const pixels = quarterTurns === 0 ? context.getImageData(790, 350, 77, 150).data
      : context.getImageData(500, 180, 900, 670).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if ((pixels[i] === 37 && pixels[i + 1] === 90 && pixels[i + 2] === 95)
          || (pixels[i] === 43 && pixels[i + 1] === 75 && pixels[i + 2] === 110)) count++;
    }
    return count;
  }, { base64: png.toString('base64'), quarterTurns });
}
let routeStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
const test = base.extend({
  storageState: async ({}, use) => { await use(routeStorage ?? { cookies: [], origins: [] }); },
});
test.describe.configure({ mode: 'serial' });
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  try { await recordOwnedObjectSnapshot(page, info.outputPath('failed-worker-snapshot.json')); } catch { /* the original failure is retained */ }
  await page.screenshot({ path: info.outputPath('failed-fullhd.png') });
});

async function placePlan(page: Page, name: string, x: number, quarterTurns: 0 | 1 = 0): Promise<void> {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name, exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' }).selectOption(String(quarterTurns));
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

test('player creates storage and delivery capacity before Classroom', async ({ page }) => {
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
test(`player builds the bookshelf in Classroom at quarterTurns${quarterTurns} and keeps it after Save/Load`, async ({ page }, info) => {
  expect(routeStorage, 'this case consumes the first stage actual IndexedDB save').toBeDefined();
  await installWorkerProbe(page);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  await placePlan(page, 'Classroom', 20, quarterTurns);
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
  const expected = [quarterTurns === 0 ? 'object.bookshelf@21,6' : 'object.bookshelf@25,6'];
  expect(await fixtureAnchors(page)).toEqual(expected);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'classroom-basic', origin: { x: 20, y: 5 }, ...(quarterTurns === 0 ? {} : { quarterTurns }) },
  ]);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const minimapRegion = page.getByRole('region', { name: 'Minimap', exact: true });
  if (!await page.locator('.hud-minimap__surface').isVisible()) {
    await minimapRegion.getByRole('button', { name: 'Expand', exact: true }).click();
  }
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap absent');
  await minimap.click({ position: { x: bounds.width * 22.5 / 32, y: bounds.height * 8.5 / 32 } });
  // A quarter-turned 2x1 bookshelf is measured from the same authored face:
  // rotate the actual camera 90 degrees, without rewriting renderer geometry.
  if (quarterTurns === 1) for (let step = 0; step < 6; step++) await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
  await page.mouse.move(1300, 700);
  const completed = await page.screenshot({ path: info.outputPath('bookshelf-worker-completed-fullhd.png') });
  // Authored object000 at local(1,1), size2x1, becomes local(5,1)
  // under one clockwise turn of the 7x7 classroom.
  const owned: readonly ExpectedOwnedObject[] = [{ anchorTile: { x: quarterTurns === 0 ? 21 : 25, y: 6 }, orientation: quarterTurns,
    sourceOrderId: 'room-template-000000000002-2-object-000' }];
  const completedData = await recordOwnedObjectSnapshot(page, info.outputPath('completed-worker-snapshot.json'));
  assertOwnedObjectOrders(completedData, 'object.bookshelf', 'bookshelf-wooden', owned);
  const beforePixels = await authoredBookPixels(page, completed, quarterTurns);
  expect.soft(beforePixels, 'authored book spines after construction').toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  expect(await fixtureAnchors(page)).toEqual(expected);
  await minimap.click({ position: { x: bounds.width * 22.5 / 32, y: bounds.height * 8.5 / 32 } });
  await page.mouse.move(1300, 700);
  const loaded = await page.screenshot({ path: info.outputPath('bookshelf-loaded-fullhd.png') });
  const loadedData = await recordOwnedObjectSnapshot(page, info.outputPath('loaded-worker-snapshot.json'));
  assertOwnedObjectOrders(loadedData, 'object.bookshelf', 'bookshelf-wooden', owned);
  expect(loadedData).toEqual(completedData);
  const afterPixels = await authoredBookPixels(page, loaded, quarterTurns);
  expect.soft(afterPixels, 'authored book spines after Load').toBeGreaterThan(100);
  expect(afterPixels).toBe(beforePixels);
  await writeFile(info.outputPath('bookshelf-worker-and-save-evidence.json'), JSON.stringify({ quarterTurns, owned, beforePixels, afterPixels,
    commands: (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate') }, null, 2));
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Rotate camera left', exact: true }).click();
  await page.mouse.move(1300, 700);
  await page.screenshot({ path: info.outputPath('physical-hardware-loaded-fullhd.png') });
});
}
