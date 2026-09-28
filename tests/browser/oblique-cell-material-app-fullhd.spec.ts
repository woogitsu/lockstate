import { expect, test } from './network-changed-fixture';
import { createSaveEnvelope } from '../../src/persistence/save-schema';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function builtCellSave(): string {
  const world = new SparseWorld(32);
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
  return JSON.stringify(createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'art-warm-cell', revision: 1,
    createdAt: 0, updatedAt: 1,
    kernel: new Kernel(0, 0).snapshot(), world: world.snapshot(),
    construction: new ConstructionSystem(world).snapshot(),
  }));
}

test('warm authored cell materials remain visible after a real app save import at Full HD', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?oblique-preview=1');
  await page.locator('.empty-world-prompt').getByRole('button', { name: /Create a prison|Utwórz więzienie/ }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  const before = await page.locator('#game-root canvas').screenshot();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles({ name: 'warm-cell.lockstate.json', mimeType: 'application/json',
    buffer: Buffer.from(builtCellSave(), 'utf8') });
  await expect(page.locator('.save-panel__status')).toContainText('Imported the save file');
  await expect.poll(async () => (await page.locator('#game-root canvas').screenshot()).equals(before))
    .toBe(false);
  await page.screenshot({ path: testInfo.outputPath('warm-cell-app-yaw-45-fullhd.png') });
  expect(errors).toEqual([]);
});
