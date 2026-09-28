import { expect, test } from './network-changed-fixture';
import { countsSeries, currentTick, installTee, sentCommands } from './playtest-harness';

test('Full HD Build refuses a door into standing furniture after Cell Save/Load', async ({ page }) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.addInitScript(() => {
    const RealWorker = Worker;
    class ProbedWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { roomPlanWorker: Worker }).roomPlanWorker = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbedWorker as typeof Worker;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  const tick = Math.max(0, await currentTick(page), (await countsSeries(page)).at(-1)?.tick ?? -1) + 2;
  await page.evaluate((executeAtTick) => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker missing');
    worker.postMessage({ protocolVersion: 1, messageId: 'object-door.cell', kind: 'simulation/submit-command',
      payload: { commandId: 'object-door.cell', sequence: 0, executeAtTick,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
          data: { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } } } } });
  }, tick);
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect(page.getByText('1 not ready')).toHaveCount(0, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('12');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('14');
  await page.locator('.hud-build .ui-choice [data-choice="west"]').click();
  await page.locator('.hud-build__coordinates .ui-action').click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command.type === 'PlaceBuildOrder' && command.definitionId === 'door-wooden' &&
    command.x === 12 && command.y === 14 && command.edge === 'west')).toBe(true);
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  const state = await page.evaluate(async () => {
    const [{ PrisonSaveRepository }, { IndexedDbLocalSaveStore, openLockstateDatabase }, { restoreSimulationRuntime }, { tileCoordinate }] = await Promise.all([
      import('../../src/persistence/local/repository'), import('../../src/persistence/local/indexeddb-store'),
      import('../../src/simulation/runtime/restore-session'), import('../../src/simulation/world/coordinates'),
    ]);
    const repository = new PrisonSaveRepository(new IndexedDbLocalSaveStore(await openLockstateDatabase()));
    const [prison] = await repository.list();
    if (prison === undefined) throw new Error('New prison not found');
    const loaded = await repository.loadCurrent(prison.prisonId);
    if (!loaded.ok) throw new Error(`Saved prison unreadable: ${loaded.reason}`);
    const runtime = restoreSimulationRuntime(loaded.envelope.payload as unknown as import('../../src/simulation/runtime/restore-session').SessionSnapshotBundle).runtime;
    const tile = { x: tileCoordinate(12), y: tileCoordinate(14) };
    return {
      furniture: runtime.placedObjects.isTileOccupied(tile),
      door: runtime.navigation.doors.getByEdge(tile, 'left') !== undefined,
      doorOrder: runtime.construction.allOrders().find((order) => order.definitionId === 'door-wooden' &&
        order.location.x === tile.x && order.location.y === tile.y)?.state ?? null,
    };
  });
  await page.screenshot({ path: `tests/browser/evidence/oblique-door-object-footprint-${state.doorOrder === 'failed' ? 'green' : 'red'}-fullhd.png` });
  expect(state).toEqual({ furniture: true, door: false, doorOrder: 'failed' });
});
