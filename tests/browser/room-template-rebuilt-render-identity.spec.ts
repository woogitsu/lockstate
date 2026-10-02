import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { completedWallLogisticsSave } from './fixtures/completed-wall-logistics';

// Dev/source acceptance: observe the real app's scene, never replace its feed,
// frame, projection, image pool or worker state. Built-artifact tests are separate.
const OBSERVER = `
window.readTemplateBedRendering = () => {
  const scene = worldScene;
  const isBed = shape => ['bed-wooden', 'object.bed'].includes(shape.definitionId);
  const bedTexture = key => key.startsWith('oblique:furniture.cell.cot.single:');
  return {
    pose: scene.cameraPose,
    structures: (scene.lastFrame?.structures ?? []).filter(isBed),
    projected: (scene.lastProjection?.raised ?? []).filter(shape => shape.assetId === 'furniture.cell.cot.single'),
    images: [...scene.solidImages].filter(([, image]) => bedTexture(image.texture.key)).map(([id, image]) => ({
      id, key: image.texture.key, x: image.x, y: image.y, width: image.displayWidth, height: image.displayHeight, visible: image.visible,
    })),
    imageCount: scene.assetImages.filter(image => bedTexture(image.texture.key)).length,
  };
};
`;

interface RenderEvidence {
  pose: { target: { x: number; y: number }; viewport: { width: number; height: number }; zoom: number; yawRadians: number; elevationRadians: number };
  structures: { id: string; tileX: number; tileY: number; orientation?: number; phase: string }[];
  projected: { id: string; orientation?: number; footprint: { x: number; y: number }[] }[];
  images: { id: string; key: string; x: number; y: number; width: number; height: number; visible: boolean }[];
  imageCount: number;
}
interface WorkerEvidence {
  kernel: { tick: number };
  construction: { orders: { id: string; definitionId: string; state: string; location: { x: number; y: number }; objectOrientation?: number }[] };
  simulation: { objects: { placedObjects: { placedObjectId: string; objectId: string; anchorTile: { x: number; y: number }; orientation: number; sourceOrderId?: string }[] } };
}
interface ProbeWindow extends Window {
  readTemplateBedRendering: () => RenderEvidence;
  readTemplateBedWorker: () => Promise<{ payload: { snapshot: { data: WorkerEvidence } } }>;
}

let savedStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
let savedStage: { worker: WorkerEvidence; render: RenderEvidence; png: Buffer; oldId: string; newId: string } | undefined;
const test = base.extend({
  storageState: async ({}, use) => { await use(savedStorage ?? { cookies: [], origins: [] }); },
});
test.describe.configure({ mode: 'serial' });

async function observe(page: Page): Promise<void> {
  await page.route('**/src/main.ts', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\n${OBSERVER}` });
  });
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let worker: Worker | undefined;
    const replies = new Map<string, (reply: unknown) => void>();
    class SnapshotWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); worker = this;
        this.addEventListener('message', (event: MessageEvent) => {
          const replyTo = (event.data as { replyTo?: string }).replyTo;
          if (replyTo === undefined) return;
          const resolve = replies.get(replyTo);
          if (resolve !== undefined) { replies.delete(replyTo); resolve(event.data); }
        });
      }
    }
    window.Worker = SnapshotWorker as typeof Worker;
    (window as unknown as ProbeWindow).readTemplateBedWorker = () => new Promise((resolve, reject) => {
      if (worker === undefined) { reject(new Error('Actual worker absent')); return; }
      const messageId = crypto.randomUUID();
      const timer = setTimeout(() => { replies.delete(messageId); reject(new Error('Actual snapshot exceeded existing 10 s expectation budget')); }, 10_000);
      replies.set(messageId, reply => { clearTimeout(timer); resolve(reply as Awaited<ReturnType<ProbeWindow['readTemplateBedWorker']>>); });
      worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
    });
  });
}
const rendering = (page: Page) => page.evaluate(() => (window as unknown as ProbeWindow).readTemplateBedRendering());
const worker = (page: Page) => page.evaluate(async () => (await (window as unknown as ProbeWindow).readTemplateBedWorker()).payload.snapshot.data);
const physicalBeds = (snapshot: WorkerEvidence) => snapshot.simulation.objects.placedObjects.filter(object => object.objectId === 'object.bed');

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const actualWorker = await worker(page).catch(error => ({ captureError: String(error) }));
  const actualRendering = await rendering(page).catch(error => ({ captureError: String(error) }));
  await writeFile(info.outputPath('failed-worker-render-identity.json'), JSON.stringify({ actualWorker, actualRendering }, null, 2));
  await page.screenshot({ path: info.outputPath('failed-actual-player-fullhd.png') });
});

async function finishQueue(page: Page): Promise<void> {
  const panel = page.locator('.hud-build');
  let remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  while (remaining > 0) {
    await expect.poll(async () => Number(await panel.getAttribute('data-queued') ?? 0),
      { message: `actual construction must advance from ${remaining} unfinished orders` }).toBeLessThan(remaining);
    remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  }
}

async function coordinates(page: Page): Promise<void> {
  if (!await page.getByRole('spinbutton', { name: 'Tile X', exact: true }).isVisible()) {
    await page.locator('.hud-build__coordinates > .ui-section__header').click();
  }
  await page.getByRole('spinbutton', { name: 'Tile X', exact: true }).fill('24');
  await page.getByRole('spinbutton', { name: 'Tile Y', exact: true }).fill('21');
}

async function frameBed(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const minimap = page.locator('.hud-minimap__surface');
  if (!await minimap.isVisible()) await page.getByRole('region', { name: 'Minimap', exact: true }).getByRole('button', { name: 'Expand', exact: true }).click();
  const bounds = await minimap.boundingBox(); if (bounds === null) throw new Error('Minimap missing');
  await minimap.click({ position: { x: bounds.width * 24.5 / 32, y: bounds.height * 21.5 / 32 } });
  await page.mouse.move(1300, 700);
}

function expectedFootprint(pose: RenderEvidence['pose'], width: number, height: number) {
  const c = Math.cos(pose.yawRadians), s = Math.sin(pose.yawRadians);
  return [[24, 21], [24 + width, 21], [24 + width, 21 + height], [24, 21 + height]].map(([x, y]) => {
    const dx = x! * 64 - pose.target.x, dy = y! * 64 - pose.target.y;
    return { x: pose.viewport.width / 2 + (c * dx - s * dy) * pose.zoom,
      y: pose.viewport.height / 2 + (s * dx + c * dy) * Math.sin(pose.elevationRadians) * pose.zoom };
  });
}

async function requireBed(page: Page, sourceOrderId: string, orientation: 0 | 1): Promise<RenderEvidence> {
  // The retained cot catalogue uses 30-degree yaw and 10-degree elevation
  // frames. Local +/-45 at elevation45 select these exact existing PNGs.
  const key = `oblique:furniture.cell.cot.single:${orientation === 1 ? 30 : 300}:40`;
  await expect.poll(async () => (await rendering(page)).images.map(image => image.key)).toEqual([key]);
  const actual = await rendering(page);
  expect(actual.imageCount).toBe(1);
  expect(actual.images).toEqual([expect.objectContaining({ id: `structure:${sourceOrderId}`, key, visible: true })]);
  expect(actual.structures).toEqual([expect.objectContaining({ id: sourceOrderId, tileX: 24, tileY: 21, phase: 'built' })]);
  expect(actual.structures[0]!.orientation ?? 0).toBe(orientation);
  expect(actual.projected).toHaveLength(1);
  expect(actual.projected[0]!.id).toBe(sourceOrderId);
  const expected = expectedFootprint(actual.pose, orientation === 1 ? 2 : 1, orientation === 1 ? 1 : 2);
  actual.projected[0]!.footprint.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index]!.x, 6);
    expect(point.y).toBeCloseTo(expected[index]!.y, 6);
  });
  return actual;
}

// Decode the actual canvas buffers in Node using Playwright's existing codec.
// No extra PNG/base64 copies or decodes run on the app's main thread.
const playwrightRequire = createRequire(createRequire(import.meta.url).resolve('@playwright/test/package.json'));
const { PNG } = playwrightRequire('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Uint8Array } } };
};
function changedPixels(a: Buffer, b: Buffer, pose: RenderEvidence['pose']): number {
  const left = PNG.sync.read(a), right = PNG.sync.read(b);
  expect([left.width, left.height]).toEqual([1920, 1080]);
  expect([right.width, right.height]).toEqual([left.width, left.height]);
  // Independent union of the old 2x1 and new 1x2 occupied rectangles;
  // 45px above ground includes the cot's authored upper volume at this pose.
  const corners = [...expectedFootprint(pose, 2, 1), ...expectedFootprint(pose, 1, 2)];
  const region = { left: Math.floor(Math.min(...corners.map(point => point.x))) - 8,
    right: Math.ceil(Math.max(...corners.map(point => point.x))) + 8,
    top: Math.floor(Math.min(...corners.map(point => point.y))) - 45,
    bottom: Math.ceil(Math.max(...corners.map(point => point.y))) + 8 };
  expect(region.left).toBeGreaterThanOrEqual(0); expect(region.top).toBeGreaterThanOrEqual(0);
  expect(region.right).toBeLessThanOrEqual(left.width); expect(region.bottom).toBeLessThanOrEqual(left.height);
  let changed = 0;
  for (let y = region.top; y < region.bottom; y++) for (let x = region.left; x < region.right; x++) {
    const at = (y * left.width + x) * 4;
    if ([0, 1, 2].some(channel => Math.abs(left.data[at + channel]! - right.data[at + channel]!) > 8)) changed++;
  }
  return changed;
}

test('player directly removes a completed rotated template Bed and saves only its independently rebuilt normal image at Full HD', async ({ page }, info) => {
  await installTee(page); await observe(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles({ name: 'real-completed-logistics.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(completedWallLogisticsSave())) });
  await page.locator('.save-panel__item').getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' }).selectOption('1');
  await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
  if (!await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).isVisible()) {
    await dialog.getByText('Enter coordinates', { exact: true }).click();
  }
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('20');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('20');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('submitted');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 20 }, quarterTurns: 1 },
  ]);
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueue(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const beforeWorker = await worker(page);
  expect(physicalBeds(beforeWorker)).toEqual([expect.objectContaining({ anchorTile: { x: 24, y: 21 }, orientation: 1 })]);
  const oldId = physicalBeds(beforeWorker)[0]!.sourceOrderId!;
  expect(oldId).toEqual(expect.any(String));
  await frameBed(page);
  const original = await requireBed(page, oldId, 1);
  const canvas = page.locator('#game-root canvas');
  const originalPng = await canvas.screenshot({ path: info.outputPath('actual-rotated-bed.png') });

  await page.locator('.hud-build__remove').click();
  await coordinates(page);
  await page.getByRole('button', { name: 'Remove object here', exact: true }).click();
  await expect.poll(async () => physicalBeds(await worker(page))).toEqual([]);
  const removedWorker = await worker(page);
  expect(removedWorker.construction.orders.find(order => order.id === oldId)?.state).toBe('completed');
  await expect.poll(async () => (await rendering(page)).imageCount).toBe(0);
  const removed = await rendering(page);
  expect(removed.images).toEqual([]); expect(removed.structures).toEqual([]); expect(removed.projected).toEqual([]);
  expect(removed.pose).toEqual(original.pose);
  const removedPng = await canvas.screenshot({ path: info.outputPath('actual-bed-removed.png') });
  const removalPixels = changedPixels(originalPng, removedPng, original.pose);
  expect(removalPixels, 'actual cot pixels must leave its physical occupied volume').toBeGreaterThan(100);

  await page.locator('.hud-build__remove').click();
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  await coordinates(page);
  await page.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceObject').length).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueue(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const rebuiltWorker = await worker(page);
  const replacement = physicalBeds(rebuiltWorker);
  expect(replacement).toEqual([expect.objectContaining({ anchorTile: { x: 24, y: 21 }, orientation: 0 })]);
  const newId = replacement[0]!.sourceOrderId!; expect(newId).not.toBe(oldId);
  expect(rebuiltWorker.construction.orders.find(order => order.id === oldId)?.state).toBe('completed');
  expect(rebuiltWorker.construction.orders.find(order => order.id === newId)?.state).toBe('completed');
  const rebuilt = await requireBed(page, newId, 0);
  expect(rebuilt.pose).toEqual(original.pose);
  const rebuiltPng = await canvas.screenshot({ path: info.outputPath('actual-independent-normal-bed.png') });
  const rebuildPixels = changedPixels(removedPng, rebuiltPng, rebuilt.pose);
  expect(rebuildPixels, 'actual independent cot pixels must appear at the same anchor').toBeGreaterThan(100);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  const commands = await sentCommands(page);
  expect(commands.filter(command => command.type === 'RemoveObject')).toEqual([{ type: 'RemoveObject', x: 24, y: 21 }]);
  expect(commands.filter(command => command.type === 'RemoveWall')).toEqual([]);
  expect(commands.filter(command => command.type === 'PlaceObject')).toEqual([
    expect.objectContaining({ definitionId: 'bed-wooden', x: 24, y: 21, orderId: newId }),
  ]);
  await writeFile(info.outputPath('actual-worker-render-identity.json'), JSON.stringify({ coverage: 'dev/source; no state/feed replacement',
    beforeWorker, removedWorker, rebuiltWorker, original, removed, rebuilt, removalPixels, rebuildPixels, commands }, null, 2));
  savedStage = { worker: rebuiltWorker, render: rebuilt, png: rebuiltPng, oldId, newId };
  savedStorage = await page.context().storageState({ indexedDB: true });
});

test('player reopens the actual rebuilt Bed save and retains one exact owner image, footprint and canvas pixels at Full HD', async ({ page }, info) => {
  expect(savedStorage, 'this lifecycle consumes the first player stage actual IndexedDB save').toBeDefined();
  expect(savedStage, 'actual worker/render/PNG capture must survive the serial lifecycle boundary').toBeDefined();
  const saved = savedStage!;
  await installTee(page); await observe(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const loadedWorker = await worker(page);
  expect(physicalBeds(loadedWorker)).toEqual(physicalBeds(saved.worker));
  expect(loadedWorker.construction.orders.find(order => order.id === saved.oldId)?.state).toBe('completed');
  expect(loadedWorker.construction.orders.find(order => order.id === saved.newId)?.state).toBe('completed');
  // Load recreates renderer memory. Reframe through the same genuine player
  // controls before comparing pixels; camera memory is not a saved game field.
  await frameBed(page);
  const loaded = await requireBed(page, saved.newId, 0);
  expect(loaded.pose).toEqual(saved.render.pose);
  const loadedPng = await page.locator('#game-root canvas').screenshot({ path: info.outputPath('actual-independent-normal-bed-loaded.png') });
  const loadPixels = changedPixels(saved.png, loadedPng, loaded.pose);
  expect(loadPixels, 'paused cot pixels within its physical volume must remain identical after actual Load').toBe(0);
  const commands = await sentCommands(page);
  expect(commands, 'real Load, clock pause and minimap framing must submit no new gameplay command').toEqual([]);
  await writeFile(info.outputPath('actual-loaded-worker-render-identity.json'), JSON.stringify({ coverage: 'dev/source; real prior IndexedDB state and PNG',
    beforeSaveWorker: saved.worker, loadedWorker, beforeSaveRender: saved.render, loaded, loadPixels, commands }, null, 2));
});
