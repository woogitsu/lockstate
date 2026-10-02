// Prepared native route and independent consumer assertion. Material/pixel
// candidates and regions below are provisional until actual FullHD calibration.
import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

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
      .filter(o => ['object.chair'].includes(o.objectId))
      .map(o => `${o.objectId}@${o.anchorTile.x},${o.anchorTile.y}:orientation=${o.orientation}`).sort() ?? [];
  });
}

async function timberPixels(page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number[]> {
  return page.evaluate(async ({ base64, quarterTurns }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // The retained seat/back use original wood diffuse RGBA(.48,.27,.11,1).
    // Candidate RGB(150,115,75) occurs in the actual yaw30/elev40 export;
    // source pixels do not establish the native camera's runtime palette.
    // These separate chair regions are layout estimates pending native images.
    // Actual calibration must also exclude desk/door pixels, then removing only
    // the default chair binding must fail both regions with objects/save intact.
    const rects = quarterTurns === 0
      ? [[775, 455, 120, 150], [940, 420, 130, 150]]
      : [[875, 470, 125, 160], [800, 350, 120, 150]];
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

test('player creates storage and delivery capacity before Staff Room', async ({ page }) => {
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
test(`player builds Staff Room at quarterTurns${quarterTurns} and retains wooden chair anchors after Save/Load`, async ({ page }, info) => {
  expect(routeStorage, 'this case consumes the first stage actual IndexedDB save').toBeDefined();
  await installWorkerProbe(page);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  await placePlan(page, 'Staff Room', 20, quarterTurns);
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
  const expected = quarterTurns === 0
    ? ['object.chair@21,7:orientation=0', 'object.chair@23,8:orientation=0']
    : ['object.chair@22,8:orientation=1', 'object.chair@23,6:orientation=1'];
  const actualBefore = await fixtureAnchors(page);
  expect(actualBefore).toEqual(expected);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'staff-room-basic', origin: { x: 20, y: 5 }, ...(quarterTurns === 0 ? {} : { quarterTurns }) },
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
  const completed = await page.screenshot({ path: info.outputPath('wooden-chair-worker-completed-fullhd.png') });
  const beforePixels = await timberPixels(page, completed, quarterTurns);
  await writeFile(info.outputPath('worker-and-completed-save-evidence.json'), JSON.stringify({
    quarterTurns, actualBefore, beforePixels, commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  beforePixels.forEach((count, index) => expect.soft(count, `chair${index + 1} authored timber after construction`)
    .toBeGreaterThan(20));
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  const actualAfter = await fixtureAnchors(page);
  expect(actualAfter).toEqual(expected);
  await minimap.click({ position: { x: bounds.width * 23 / 32, y: bounds.height * 8 / 32 } });
  await page.mouse.move(1300, 700);
  const loaded = await page.screenshot({ path: info.outputPath('wooden-chair-loaded-fullhd.png') });
  const afterPixels = await timberPixels(page, loaded, quarterTurns);
  afterPixels.forEach((count, index) => expect.soft(count, `chair${index + 1} authored timber after Load`)
    .toBeGreaterThan(20));
  expect(afterPixels).toEqual(beforePixels);
  const evidencePath = info.outputPath('wooden-chair-worker-and-save-evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    quarterTurns, actualBefore, actualAfter, beforePixels, afterPixels,
    commands: (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate'),
  }, null, 2));
  await info.attach('wooden-chair-worker-and-save-evidence', { path: evidencePath, contentType: 'application/json' });

});
}
