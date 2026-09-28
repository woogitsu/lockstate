import { expect, test } from './network-changed-fixture';
import { createSaveEnvelope } from '../../src/persistence/save-schema';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { placedObjectAt } from '../../src/simulation/objects/placed-object-registry';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function furnishedCanteenSave(): string {
  const runtime = createNewSimulationRuntime(0);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  runtime.world.load(chunk);
  runtime.world.setOwned(chunk, true);
  for (let y = 10; y <= 22; y += 1) for (let x = 10; x <= 22; x += 1) {
    runtime.world.setTerrain(tile(x, y), 'concrete');
  }
  for (let y = 14; y <= 19; y += 1) for (let x = 14; x <= 19; x += 1) {
    runtime.world.setZoning(tile(x, y), 6);
  }
  runtime.construction.restore({
    orders: [{ ...createBuildOrder('canteen-table', 'dining-table-wooden', tile(15, 15)), state: 'completed', progress: 90 }],
    undoStack: [], redoStack: [],
  });
  if (!runtime.placedObjects.place(placedObjectAt('object.dining-table', tile(15, 15), 0))) {
    throw new Error('The 3×2 dining table did not fit inside its saved canteen.');
  }
  const bundle = captureSessionSnapshot(runtime);
  restoreSimulationRuntime(bundle);
  return JSON.stringify(createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'art-canteen-table', revision: 1,
    createdAt: 0, updatedAt: 1, ...bundle,
  }));
}

test('real Full HD canteen renders the 3×2 Blender table at three camera angles after Save/Load', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  const tableFrames = new Set<string>();
  let tableResponses = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const url = response.url();
    if (response.ok() && url.includes('/assets/environment/oblique/dining-table-yaw') && url.endsWith('.png')) {
      tableFrames.add(new URL(url).pathname);
      tableResponses += 1;
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
    await repository.create({ prisonId: 'art-canteen-table', gameVersion: 'lockstate-0.0.0', displayName: 'Furnished canteen' });
    const saved = await repository.save('art-canteen-table', JSON.parse(raw));
    if (!saved.ok) throw new Error(saved.error.message);
  }, furnishedCanteenSave());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  const angle = page.locator('.hud-camera-angle');
  for (let step = 0; step < 2; step += 1) await angle.getByRole('button', { name: 'Tilt down' }).click();
  for (const [yaw, turns] of [[-45, 0], [0, 3], [45, 3]] as const) {
    for (let step = 0; step < turns; step += 1) await angle.getByRole('button', { name: 'Turn right' }).click();
    await expect(angle.locator('output')).toContainText(`Turn ${yaw}°`);
    await expect.poll(() => tableFrames.size).toBeGreaterThan(yaw === -45 ? 0 : yaw === 0 ? 1 : 2);
    await page.screenshot({ path: testInfo.outputPath(`canteen-table-yaw${yaw}-fullhd.png`) });
  }
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  const responsesBeforeReload = tableResponses;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await expect.poll(() => tableResponses).toBeGreaterThan(responsesBeforeReload);
  await page.locator('#game-root canvas').screenshot({ path: testInfo.outputPath('canteen-table-after-load-fullhd.png') });
  expect(errors).toEqual([]);
});
