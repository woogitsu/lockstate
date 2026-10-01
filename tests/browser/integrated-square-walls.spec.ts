import { expect, test } from './network-changed-fixture';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createSaveEnvelope } from '../../src/persistence/save-schema';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { edgeStanding } from '../../src/simulation/navigation/traversal';

// Build through the real scheduled kernel, then hand its completed save to the
// production importer. Deterministic stepping avoids waiting for wall-clock days.
function completedCellSave() {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('template-0', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 },
  }));
  for (let i = 0; i < 25000; i += 1) {
    runtime.kernel.step();
    if (i > 0 && runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every(order => order.state === 'completed')) break;
  }
  expect(runtime.construction.allOrders().length).toBeGreaterThan(0);
  expect(runtime.construction.allOrders().every(order => order.state === 'completed')).toBe(true);
  const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
  expect(runtime.world.getSquareStructure(tile(5, 5))).toBe(1);
  expect(edgeStanding(runtime.world, new DoorRegistry(), tile(5, 5), tile(6, 5)).kind).toBe('wall');
  const b = captureSessionSnapshot(runtime);
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'square-wall-fullhd', revision: 1,
    createdAt: 1700000000000, updatedAt: 1700000000001,
    ...(b.masterSeed === undefined ? {} : { masterSeed: b.masterSeed }),
    kernel: b.kernel, world: b.world, construction: b.construction,
    ...(b.entities === undefined ? {} : { entities: b.entities }),
    ...(b.simulation === undefined ? {} : { simulation: b.simulation }),
    ...(b.identity === undefined ? {} : { identity: b.identity }),
  });
}

for (const renderer of ['top-down', 'oblique'] as const) {
  test('completed square walls remain painted after production Save/Load: ' + renderer, async ({ page }, testInfo) => {
    const save = completedCellSave();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(renderer === 'oblique' ? '/?renderer=oblique' : '/');
    await expect(page.locator('#game-root canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await (await chooser).setFiles({ name: 'completed-cell.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
    await expect(page.locator('.save-panel__item')).toHaveCount(1);
    await page.locator('.save-panel__item').getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const minimap = page.locator('.hud-minimap__surface');
    const bounds = await minimap.boundingBox();
    if (bounds === null) throw new Error('minimap must be visible');
    await minimap.click({ position: { x: bounds.width * 0.24, y: bounds.height * 0.24 } });
    const wallPixels = async () => {
      const shot = await page.locator('#game-root canvas').screenshot();
      return page.evaluate(async base64 => {
        const pixels = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
        const canvas = document.createElement('canvas'); canvas.width = pixels.width; canvas.height = pixels.height;
        const context = canvas.getContext('2d')!; context.drawImage(pixels, 0, 0);
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          if (rgba[i] === 154 && rgba[i + 1] === 106 && rgba[i + 2] === 82) count += 1;
        }
        return count;
      }, shot.toString('base64'));
    };
    const before = await wallPixels();
    console.log('completed wall top pixels', renderer, before);
    expect(before, 'completed saved wall squares have no painted top faces').toBeGreaterThan(15000);
    await page.screenshot({ path: testInfo.outputPath(renderer + '-completed-cell.png') });
    await page.getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved');
    await page.locator('.save-panel__item').getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    await minimap.click({ position: { x: bounds.width * 0.24, y: bounds.height * 0.24 } });
    await expect.poll(wallPixels).toBeGreaterThan(15000);
    await page.screenshot({ path: testInfo.outputPath(renderer + '-reloaded-cell.png') });
  });
}
