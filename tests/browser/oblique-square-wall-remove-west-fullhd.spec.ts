import { expect, test } from './network-changed-fixture';
import { createSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import { groundToScreen } from '../../src/rendering/camera/oblique-projection';
import { installTee, sentCommands } from './playtest-harness';

const PRISON_ID = 'square-wall-west-fullhd';
const WALL_TILE = { x: 15, y: 15 };

function builtSquareWallSave(): string {
  const runtime = createNewSimulationRuntime(0x1620);
  const command: SimulationCommand = {
    type: 'PlaceBuildOrder', orderId: 'west-removal-wall', definitionId: 'wall-brick',
    x: WALL_TILE.x, y: WALL_TILE.y, footprint: 'square',
  };
  runtime.kernel.submitCommand('fixture-wall', 0, runtime.kernel.tick, packCommand(command));
  for (let step = 0; step < 600 && runtime.construction.getOrder('west-removal-wall')?.state !== 'completed'; step += 1) {
    runtime.kernel.step();
  }
  if (runtime.construction.getOrder('west-removal-wall')?.state !== 'completed') throw new Error('Fixture wall did not complete');
  const bundle = captureSessionSnapshot(runtime);
  return JSON.stringify(createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: PRISON_ID, revision: 1,
    createdAt: 0, updatedAt: 1, ...bundle,
  }));
}

test('Full HD Remove reaches a built square wall from its west half and survives Save/Load', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.evaluate(async (raw) => {
    const [{ PrisonSaveRepository }, { IndexedDbLocalSaveStore, openLockstateDatabase }] = await Promise.all([
      import('../../src/persistence/local/repository'), import('../../src/persistence/local/indexeddb-store'),
    ]);
    const repository = new PrisonSaveRepository(new IndexedDbLocalSaveStore(await openLockstateDatabase()));
    await repository.create({ prisonId: 'square-wall-west-fullhd', gameVersion: 'lockstate-0.0.0', displayName: 'Square wall' });
    const saved = await repository.save('square-wall-west-fullhd', JSON.parse(raw));
    if (!saved.ok) throw new Error(saved.error.message);
  }, builtSquareWallSave());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('square-wall-before-remove-fullhd.png') });
  await page.locator('.hud-build__remove').click();
  const screen = groundToScreen({ x: WALL_TILE.x * 64 + 8, y: WALL_TILE.y * 64 + 32 }, {
    target: { x: 16 * 64, y: 16 * 64 }, viewport: { width: 1920, height: 1080 },
    zoom: 1.25, yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 4,
  });
  const canvas = await page.locator('#game-root canvas').boundingBox();
  if (canvas === null) throw new Error('Game canvas missing');
  await page.mouse.click(canvas.x + screen.x * canvas.width / 1920, canvas.y + screen.y * canvas.height / 1080);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'RemoveWall').length).toBe(1);
  const removal = (await sentCommands(page)).find((command) => command.type === 'RemoveWall');
  expect(removal).toMatchObject({ x: WALL_TILE.x, y: WALL_TILE.y, edge: 'west' });
  await page.screenshot({ path: testInfo.outputPath('square-wall-after-remove-fullhd.png') });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  const persisted = await page.evaluate(async () => {
    const [{ PrisonSaveRepository }, { IndexedDbLocalSaveStore, openLockstateDatabase }, { restoreSimulationRuntime }, { tileCoordinate }] = await Promise.all([
      import('../../src/persistence/local/repository'), import('../../src/persistence/local/indexeddb-store'),
      import('../../src/simulation/runtime/restore-session'), import('../../src/simulation/world/coordinates'),
    ]);
    const repository = new PrisonSaveRepository(new IndexedDbLocalSaveStore(await openLockstateDatabase()));
    const loaded = await repository.loadCurrent('square-wall-west-fullhd');
    if (!loaded.ok) throw new Error(`Saved wall unreadable: ${loaded.reason}`);
    const runtime = restoreSimulationRuntime(loaded.envelope.payload as unknown as import('../../src/simulation/runtime/restore-session').SessionSnapshotBundle).runtime;
    return { structure: runtime.world.getSquareStructure({ x: tileCoordinate(15), y: tileCoordinate(15) }),
      orderState: runtime.construction.getOrder('west-removal-wall')?.state };
  });
  expect(persisted).toEqual({ structure: 0, orderState: 'cancelled' });
});
