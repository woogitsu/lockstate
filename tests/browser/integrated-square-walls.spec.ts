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
  // An isolated saved wall square catches a one-tile render shift that the
  // dense cell perimeter could conceal with a neighbouring wall sprite.
  runtime.world.setSquareStructure(tile(11, 4), 1);
  expect(runtime.world.getSquareStructure(tile(5, 5))).toBe(1);
  expect(runtime.world.getSquareStructure(tile(11, 4))).toBe(1);
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
    const wallEvidence = async () => {
      const shot = await page.locator('#game-root canvas').screenshot();
      return page.evaluate(async base64 => {
        const pixels = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
        const canvas = document.createElement('canvas'); canvas.width = pixels.width; canvas.height = pixels.height;
        const context = canvas.getContext('2d')!; context.drawImage(pixels, 0, 0);
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let legacyTopPixels = 0;
        for (let i = 0; i < rgba.length; i += 4) {
          if (rgba[i] === 154 && rgba[i + 1] === 106 && rgba[i + 2] === 82) legacyTopPixels += 1;
        }
        // Independent screen positions for known saved tiles at the initial
        // 45-degree production pose. The isolated wall has no neighbouring
        // structures, so an off-by-one tile or missing sprite cannot pass.
        const at = (tileX: number, tileY: number, rise: number) => {
          const dx = (tileX + 0.5 - 32 * 0.24) * 64;
          const dy = (tileY + 0.5 - 32 * 0.24) * 64;
          const yaw = -Math.PI / 4;
          return {
            x: canvas.width / 2 + (Math.cos(yaw) * dx - Math.sin(yaw) * dy) * 1.25,
            y: canvas.height / 2 + ((Math.sin(yaw) * dx + Math.cos(yaw) * dy) * Math.SQRT1_2 - rise * 64 * Math.SQRT1_2) * 1.25,
          };
        };
        const stonePixels = (x: number, y: number) => {
          let count = 0;
          for (let py = Math.round(y) - 8; py < Math.round(y) + 8; py += 1) {
            for (let px = Math.round(x) - 8; px < Math.round(x) + 8; px += 1) {
              const i = (py * canvas.width + px) * 4;
              const [r, g, b] = [rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0];
              if (r >= 125 && r <= 205 && Math.abs(r - g) < 16 && Math.abs(g - b) < 18) count += 1;
            }
          }
          return count;
        };
        const far = at(8, 5, 0.75);
        const near = at(5, 11, 0.34);
        const isolated = at(11, 4, 0.75);
        return {
          legacyTopPixels,
          far: stonePixels(far.x, far.y),
          near: stonePixels(near.x, near.y),
          isolated: stonePixels(isolated.x - 16, isolated.y),
          isolatedLeftFace: stonePixels(isolated.x - 126, isolated.y - 28),
          isolatedGround: stonePixels(isolated.x, isolated.y + 70),
        };
      }, shot.toString('base64'));
    };
    const before = await wallEvidence();
    await page.screenshot({ path: testInfo.outputPath(renderer + '-completed-cell.png') });
    if (renderer === 'top-down') {
      expect(before.legacyTopPixels, 'completed saved wall squares have no painted top faces').toBeGreaterThan(15000);
    } else {
      expect(before.far, 'textured far wall at authored square').toBeGreaterThan(120);
      expect(before.near, 'textured near cutaway wall at authored square').toBeGreaterThan(100);
      expect(before.isolated, 'isolated full-square wall at its exact saved tile').toBeGreaterThan(180);
      expect(before.isolatedLeftFace, 'left face of isolated square remains at the authored tile').toBeGreaterThan(180);
      expect(before.isolatedGround, 'isolated wall must not spill into the next square').toBeLessThan(20);
    }
    await page.getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved');
    await page.locator('.save-panel__item').getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    await minimap.click({ position: { x: bounds.width * 0.24, y: bounds.height * 0.24 } });
    const after = await wallEvidence();
    if (renderer === 'top-down') expect(after.legacyTopPixels).toBeGreaterThan(15000);
    else {
      expect(after.far, 'far wall survives Save/Load').toBeGreaterThan(120);
      expect(after.near, 'cutaway wall survives Save/Load').toBeGreaterThan(100);
      expect(after.isolated, 'isolated saved wall keeps its exact position').toBeGreaterThan(180);
      expect(after.isolatedLeftFace, 'isolated wall footprint survives Save/Load').toBeGreaterThan(180);
      expect(after.isolatedGround).toBeLessThan(20);

      // Exercise every production camera input over the actual loaded cell,
      // including Blender walls and furniture, rather than an empty map.
      const canvas = page.locator('#game-root canvas');
      let image = await canvas.screenshot();
      await page.getByRole('button', { name: 'Rotate camera right' }).click();
      await expect.poll(async () => (await canvas.screenshot()).equals(image)).toBe(false);
      image = await canvas.screenshot();
      await page.getByRole('button', { name: 'Raise camera angle' }).click();
      await expect.poll(async () => (await canvas.screenshot()).equals(image)).toBe(false);
      image = await canvas.screenshot();
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(250);
      await page.keyboard.up('ArrowRight');
      await expect.poll(async () => (await canvas.screenshot()).equals(image)).toBe(false);
      image = await canvas.screenshot();
      await page.keyboard.down('KeyE');
      await page.waitForTimeout(250);
      await page.keyboard.up('KeyE');
      await expect.poll(async () => (await canvas.screenshot()).equals(image)).toBe(false);
      image = await canvas.screenshot();
      await page.mouse.move(950, 490);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(1040, 540, { steps: 5 });
      await page.mouse.up({ button: 'right' });
      await expect.poll(async () => (await canvas.screenshot()).equals(image)).toBe(false);
    }
    await page.screenshot({ path: testInfo.outputPath(renderer + '-reloaded-cell.png') });
  });
}

test('authored cell floor keeps its exact tile after production Save/Load in angled view', async ({ page }, testInfo) => {
  const save = completedCellSave();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles({ name: 'completed-cell-floor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
  await page.locator('.save-panel__item').getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap must be visible');
  const focusSavedCell = () => minimap.click({ position: { x: bounds.width * 0.24, y: bounds.height * 0.24 } });
  await focusSavedCell();

  // Read the middle of saved world tile (6,8), where there is no furniture or
  // wall, and tile (10,8) just outside the authored cell. The location is
  // calculated independently of the scene implementation at its initial pose.
  const evidence = async () => {
    const shot = await page.locator('#game-root canvas').screenshot();
    return page.evaluate(async base64 => {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const sample = (tileX: number, tileY: number) => {
        const dx = (tileX + 0.5 - 32 * 0.24) * 64;
        const dy = (tileY + 0.5 - 32 * 0.24) * 64;
        const yaw = -Math.PI / 4;
        const x = Math.round(canvas.width / 2 + (Math.cos(yaw) * dx - Math.sin(yaw) * dy) * 1.25);
        const y = Math.round(canvas.height / 2 + (Math.sin(yaw) * dx + Math.cos(yaw) * dy) * Math.SQRT1_2 * 1.25);
        const colors = new Set<string>();
        let brightness = 0;
        for (let py = y - 6; py < y + 6; py += 1) {
          for (let px = x - 6; px < x + 6; px += 1) {
            const i = (py * canvas.width + px) * 4;
            const r = rgba[i] ?? 0, g = rgba[i + 1] ?? 0, b = rgba[i + 2] ?? 0;
            colors.add(`${r},${g},${b}`);
            brightness += (r + g + b) / 3;
          }
        }
        return { colors: colors.size, brightness: brightness / 144 };
      };
      return { inside: sample(6, 8), outside: sample(10, 8) };
    }, shot.toString('base64'));
  };
  await expect.poll(async () => (await evidence()).inside.colors).toBeGreaterThan(12);
  const before = await evidence();
  expect(before.inside.brightness - before.outside.brightness, 'Blender cell floor must occupy the saved room, not the adjacent terrain').toBeGreaterThan(45);
  await page.screenshot({ path: testInfo.outputPath('authored-cell-floor-before-save.png') });
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await focusSavedCell();
  const after = await evidence();
  expect(after.inside.colors, 'authored texture detail survives Save/Load').toBeGreaterThan(12);
  expect(after.inside.brightness - after.outside.brightness, 'the floor remains on its authored room tile').toBeGreaterThan(45);
  expect(after, 'Save/Load must reproduce the same cell-floor pixels').toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('authored-cell-floor-after-load.png') });
});
