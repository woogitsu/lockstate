import { writeFile } from 'node:fs/promises';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { HEADBOARD_FRAME, observeCotImages, publicHeadboardPose, requireCotOwner } from './cell-cot-evidence';
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

async function workerSnapshot(page: Page): Promise<SessionSnapshotBundle> {
  return page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { data: SessionSnapshotBundle } };
    };
    return reply.payload.snapshot.data;
  });
}

async function bedAnchors(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { data: { simulation: { objects?: { placedObjects: { objectId: string; anchorTile: { x: number; y: number } }[] } } } } };
    };
    return reply.payload.snapshot.data.simulation.objects?.placedObjects
      .filter(o => o.objectId === 'object.bed')
      .map(o => `${o.anchorTile.x},${o.anchorTile.y}`).sort() ?? [];
  });
}

async function ochreBlanketPixels(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async base64 => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // Fixed Full HD camera after centering the completed Basic cell. This
    // isolates the authored blanket, unlike the old bed's plain red cover.
    const pixels = context.getImageData(925, 490, 75, 50).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index]!, g = pixels[index + 1]!, b = pixels[index + 2]!;
      if (r >= 150 && r <= 215 && g >= 105 && g <= 165 && b >= 65 && b <= 135 && r - g > 20 && g - b > 10) count += 1;
    }
    return count;
  }, png.toString('base64'));
}

let routeStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
const test = base.extend({
  storageState: async ({}, use) => { await use(routeStorage ?? { cookies: [], origins: [] }); },
});
test.describe.configure({ mode: 'serial' });
test.use({ deviceScaleFactor: 1 });
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const available = await page.evaluate(() => (window as ProbeWindow).askWorker !== undefined);
  if (available) await writeFile(info.outputPath('failed-cot-worker-snapshot.json'), JSON.stringify(await workerSnapshot(page), null, 2));
  await page.screenshot({ path: info.outputPath('failed-cot-fullhd.png') });
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

/** Require each queue transition to finish within the existing expect budget. */
async function finishQueuedConstruction(page: Page): Promise<void> {
  const panel = page.locator('.hud-build');
  let remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  while (remaining > 0) {
    await expect.poll(async () => Number(await panel.getAttribute('data-queued') ?? 0),
      { message: `construction must advance from ${remaining} unfinished orders` }).toBeLessThan(remaining);
    remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  }
}

test('player furnishes delivery and storage plans before the cot test', async ({ page }) => {
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
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/);
  await expect(page.locator('[data-metric="prisoners"] .ui-stat__value')).toHaveText('0');
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
test(`player builds the existing bed in a Basic cell q${quarterTurns} and keeps it after Save/Load at Full HD`, async ({ page }, info) => {
  expect(routeStorage, 'this case consumes the first stage actual IndexedDB save').toBeDefined();
  const started = Date.now();
  const readImages = await observeCotImages(page);
  await installWorkerProbe(page);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  await expect(page.locator('[data-metric="prisoners"] .ui-stat__value')).toHaveText('0');
  await placePlan(page, 'Basic cell', 20, quarterTurns);
  const pending = (await workerSnapshot(page)).simulation?.roomTemplates?.pending.find(row => row.templateId === 'cell-basic');
  expect(pending).toBeDefined();
  const sequence = pending!.sequence;
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/);
  expect(await bedAnchors(page)).toEqual([quarterTurns === 0 ? '21,6' : '24,6']);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 5 }, ...(quarterTurns === 0 ? {} : { quarterTurns }) },
  ]);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedBefore = await workerSnapshot(page);
  const ownerBefore = requireCotOwner(pausedBefore, quarterTurns, sequence);
  const completionElapsedMs = Date.now() - started;
  const minimapRegion = page.getByRole('region', { name: 'Minimap', exact: true });
  if (!await page.locator('.hud-minimap__surface').isVisible()) {
    await minimapRegion.getByRole('button', { name: 'Expand', exact: true }).click();
  }
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap absent');
  // Centre the completed Cell, rather than recording a neighbouring delivery room.
  await minimap.click({ position: { x: bounds.width * (quarterTurns === 0 ? 21.5 : 24.5) / 32, y: bounds.height * 6.5 / 32 } });
  await page.mouse.move(1300, 700);
  const painted = await page.screenshot({ path: info.outputPath('cell-cot-worker-completed-fullhd.png') });
  if (quarterTurns === 0) expect(await ochreBlanketPixels(page, painted), 'built bed must have the authored ochre blanket').toBeGreaterThan(700);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  expect(await bedAnchors(page)).toEqual([quarterTurns === 0 ? '21,6' : '24,6']);
  const pausedAfter = await workerSnapshot(page);
  expect(pausedAfter).toEqual(pausedBefore);
  const ownerAfter = requireCotOwner(pausedAfter, quarterTurns, sequence);
  expect(ownerAfter).toEqual(ownerBefore);
  await minimap.click({ position: { x: bounds.width * (quarterTurns === 0 ? 21.5 : 24.5) / 32, y: bounds.height * 6.5 / 32 } });
  await page.mouse.move(1300, 700);
  const restored = await page.screenshot({ path: info.outputPath('cell-cot-loaded-fullhd.png') });
  if (quarterTurns === 0) expect(await ochreBlanketPixels(page, restored), 'loaded bed must retain the authored blanket').toBeGreaterThan(700);
  const loadElapsedMs = Date.now() - started;
  const publicPose = await publicHeadboardPose(page, quarterTurns);
  await expect.poll(async () => (await readImages()).images.some(image =>
    image.sha256 === HEADBOARD_FRAME.sha256 && image.complete && !image.error && image.width === 256 && image.height === 256),
    { message: 'real cot loader decodes the canonical source-visible headboard PNG' }).toBe(true);
  const images = await readImages();
  expect(images.errors).toEqual([]);
  expect(images.responses).toContainEqual({ url: new URL(HEADBOARD_FRAME.url, page.url()).href,
    status: 200, sha256: HEADBOARD_FRAME.sha256, width: 256, height: 256 });
  const descriptor = images.descriptors.find(row => row.status === 200)?.data as {
    assetId: string; sourceSha256: string; frames: { image: string; sha256: string }[];
  } | undefined;
  expect(descriptor).toMatchObject({ assetId: 'furniture.cell.cot.single',
    sourceSha256: 'ca8ed38a7250dd941b542a93b6e371ccdd692f6a0829d3646401d53d43a561ef' });
  expect(descriptor?.frames).toContainEqual(expect.objectContaining({ image: HEADBOARD_FRAME.url, sha256: HEADBOARD_FRAME.sha256 }));
  expect(await workerSnapshot(page), 'read-only camera buttons leave the whole paused worker unchanged').toEqual(pausedAfter);
  await page.screenshot({ path: info.outputPath('cell-cot-headboard-pending-calibration-fullhd.png') });
  const evidencePath = info.outputPath('cell-cot-owner-loader-save-evidence.json');
  await writeFile(evidencePath, JSON.stringify({ quarterTurns, sequence, ownerBefore, ownerAfter, pausedBefore, pausedAfter,
    expectedPhysicalFootprint: quarterTurns === 0 ? { width: 1, height: 2 } : { width: 2, height: 1 },
    originalBlanketPaletteChecked: quarterTurns === 0, publicPose, images,
    boundTextureObserved: false, hardwarePixelCalibrationPending: true,
    completionElapsedMs, loadElapsedMs, totalElapsedMs: Date.now() - started,
    commands: (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate'),
  }, null, 2));
  await info.attach('cell-cot-owner-loader-save-evidence', { path: evidencePath, contentType: 'application/json' });
});

}
