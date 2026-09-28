import { expect, test, type Page } from './network-changed-fixture';
import { createSaveEnvelope } from '../../src/persistence/save-schema';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { placedObjectAt } from '../../src/simulation/objects/placed-object-registry';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

async function visibleBedBlanketPixels(page: Page, screenshot: Buffer): Promise<number> {
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Screenshot canvas unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(650, 220, 600, 550).data;
    let orange = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]!;
      const green = pixels[index + 1]!;
      const blue = pixels[index + 2]!;
      if (red > 145 && green > 50 && green < 150 && blue < 100 && red > green * 1.3) orange += 1;
    }
    return orange;
  }, `data:image/png;base64,${screenshot.toString('base64')}`);
}

async function cutawayDoorWoodPixels(page: Page, screenshot: Buffer,
  bounds: readonly [number, number, number, number]): Promise<number> {
  return page.evaluate(async ({ data, bounds: [left, top, right, bottom] }) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Screenshot canvas unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(left, top, right - left, bottom - top).data;
    let timber = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]!;
      const green = pixels[index + 1]!;
      const blue = pixels[index + 2]!;
      if (red > 90 && red < 180 && green > 45 && green < 130 && blue > 25 && blue < 105
        && red > green * 1.23 && green > blue * 1.18) timber += 1;
    }
    return timber;
  }, { data: `data:image/png;base64,${screenshot.toString('base64')}`, bounds });
}

function builtCellSave(): string {
  const runtime = createNewSimulationRuntime(0);
  const world = runtime.world;
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);
  world.setOwned(chunk, true);
  for (let y = 10; y <= 21; y += 1) {
    for (let x = 10; x <= 21; x += 1) world.setTerrain(tile(x, y), 'concrete');
  }
  for (let y = 14; y <= 17; y += 1) {
    for (let x = 14; x <= 17; x += 1) world.setZoning(tile(x, y), 1);
  }
  for (let x = 14; x <= 17; x += 1) {
    world.setTopEdge(tile(x, 14), 1);
    world.setTopEdge(tile(x, 18), x === 15 ? 2 : 1);
  }
  for (let y = 14; y <= 17; y += 1) {
    world.setLeftEdge(tile(14, y), 1);
    world.setLeftEdge(tile(18, y), 1);
  }
  runtime.prisoners.roomInstances.register({
    instanceId: 'room.cell:14:14', roomCatalogId: 'room.cell', anchorTile: tile(14, 14),
    width: 4, height: 4, residentCapacity: 1, concurrentUseCapacity: 1,
    objectCapabilities: ['sleep-surface'],
  });
  runtime.construction.restore({
    orders: [{ ...createBuildOrder('cell-bed', 'bed-wooden', tile(15, 15)), state: 'completed', progress: 30 }],
    undoStack: [], redoStack: [],
  });
  if (!runtime.placedObjects.place(placedObjectAt('object.bed', tile(15, 15), 0))) {
    throw new Error('Cell bed did not fit the authored room.');
  }
  const bundle = captureSessionSnapshot(runtime);
  restoreSimulationRuntime(bundle);
  return JSON.stringify(createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'art-warm-cell', revision: 1,
    createdAt: 0, updatedAt: 1,
    ...bundle,
  }));
}

test('a saved furnished cell stays readable in the real Full HD app across camera poses and load', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  const bedFrames = new Set<string>();
  let bedResponses = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const url = response.url();
    if (response.ok() && url.includes('/assets/environment/oblique/cell-bed-yaw') && url.endsWith('.png')) {
      bedFrames.add(new URL(url).pathname);
      bedResponses += 1;
    }
  });
  await page.goto('/?oblique-preview=1');
  await page.evaluate(async (raw) => {
    const repositoryPath = '/src/persistence/local/repository.ts';
    const storePath = '/src/persistence/local/indexeddb-store.ts';
    const [{ PrisonSaveRepository }, { IndexedDbLocalSaveStore, openLockstateDatabase }] = await Promise.all([
      import(/* @vite-ignore */ repositoryPath) as Promise<typeof import('../../src/persistence/local/repository')>,
      import(/* @vite-ignore */ storePath) as Promise<typeof import('../../src/persistence/local/indexeddb-store')>,
    ]);
    const repository = new PrisonSaveRepository(new IndexedDbLocalSaveStore(await openLockstateDatabase()));
    await repository.create({ prisonId: 'art-warm-cell', gameVersion: 'lockstate-0.0.0', displayName: 'Furnished cell' });
    const saved = await repository.save('art-warm-cell', JSON.parse(raw));
    if (!saved.ok) throw new Error(saved.error.message);
    const loaded = await repository.loadCurrent('art-warm-cell');
    if (!loaded.ok) throw new Error(`Freshly saved fixture is unreadable: ${loaded.reason}`);
  }, builtCellSave());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await expect(page.locator('.save-panel__status')).toContainText('Loaded');
  const angle = page.locator('.hud-camera-angle');
  const reading = angle.locator('output');
  await expect(reading).toContainText('-45°');
  for (let step = 0; step < 2; step += 1) await angle.getByRole('button', { name: 'Tilt down' }).click();
  await expect(reading).toContainText('25°');
  const shallow = await page.screenshot({ path: testInfo.outputPath('warm-cell-app-yaw-minus45-elev25-fullhd.png') });
  await expect.poll(() => bedFrames.size).toBeGreaterThan(0);
  expect(await visibleBedBlanketPixels(page, shallow)).toBeGreaterThan(700);
  expect(await cutawayDoorWoodPixels(page, shallow, [1015, 565, 1060, 645]),
    'the near cutaway doorway must not leave a detached low timber slab').toBeLessThan(20);
  for (let step = 0; step < 3; step += 1) await angle.getByRole('button', { name: 'Turn right' }).click();
  for (let step = 0; step < 2; step += 1) await angle.getByRole('button', { name: 'Tilt up' }).click();
  await expect(reading).toContainText('Turn 0°');
  const front = await page.screenshot({ path: testInfo.outputPath('warm-cell-app-yaw0-elev45-fullhd.png') });
  await expect.poll(() => bedFrames.size).toBeGreaterThan(1);
  expect(await visibleBedBlanketPixels(page, front)).toBeGreaterThan(700);
  expect(await cutawayDoorWoodPixels(page, front, [840, 620, 910, 705])).toBeLessThan(20);
  for (let step = 0; step < 3; step += 1) await angle.getByRole('button', { name: 'Turn right' }).click();
  for (let step = 0; step < 2; step += 1) await angle.getByRole('button', { name: 'Tilt up' }).click();
  await expect(reading).toContainText('Turn 45°');
  const high = await page.screenshot({ path: testInfo.outputPath('warm-cell-app-yaw45-elev65-fullhd.png') });
  await expect.poll(() => bedFrames.size).toBeGreaterThan(2);
  expect(await visibleBedBlanketPixels(page, high)).toBeGreaterThan(700);
  expect(await cutawayDoorWoodPixels(page, high, [720, 565, 800, 635])).toBeLessThan(20);
  const responsesBeforeReload = bedResponses;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await expect.poll(() => bedResponses).toBeGreaterThan(responsesBeforeReload);
  await page.locator('#game-root canvas').screenshot({ path: testInfo.outputPath('warm-cell-app-after-load-canvas-fullhd.png') });
  expect(errors).toEqual([]);
});
