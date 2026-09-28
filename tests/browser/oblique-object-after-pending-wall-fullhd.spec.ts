import type { Page } from '@playwright/test';
import { expect, test } from './network-changed-fixture';
import { countsSeries, currentTick, installTee, sentCommands } from './playtest-harness';

async function savedOrders(page: Page) {
  return page.evaluate(async () => {
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
    const tile = { x: tileCoordinate(11), y: tileCoordinate(15) };
    return {
      wall: runtime.construction.allOrders().find((order) => order.footprint === 'square' &&
        order.location.x === tile.x && order.location.y === tile.y)?.state,
      toilet: runtime.construction.allOrders().find((order) => order.definitionId === 'toilet-brick' &&
        order.location.x === tile.x && order.location.y === tile.y)?.state ?? null,
      occupied: runtime.placedObjects.isTileOccupied(tile),
      cell: runtime.prisoners.roomInstances.getById('room.cell:11:11') !== undefined,
    };
  });
}

test('Full HD Build refuses a toilet after a queued square wall on the same Cell tile', async ({ page }, testInfo) => {
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
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/ready'))).toBe(true);
  const tick = Math.max(0, await currentTick(page), (await countsSeries(page)).at(-1)?.tick ?? -1) + 2;
  await page.evaluate((executeAtTick) => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker missing');
    worker.postMessage({ protocolVersion: 1, messageId: 'pending-wall.cell', kind: 'simulation/submit-command',
      payload: { commandId: 'pending-wall.cell', sequence: 0, executeAtTick,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
          data: { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } } } } });
  }, tick);
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('11');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('15');
  await page.locator('.hud-build__coordinates .ui-action').click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command.type === 'PlaceBuildOrder' && command.x === 11 && command.y === 15)).toBe(true);
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="toilet-brick"]').click();
  const restoredCoordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await restoredCoordinates.getAttribute('aria-expanded')) === 'false') await restoredCoordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('11');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('15');
  await page.locator('.hud-build__coordinates .ui-action').click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command.type === 'PlaceObject' && command.x === 11 && command.y === 15)).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const messages = (window as unknown as { lockstateFromWorker?: Array<{
      kind: string; payload?: { refusal?: { reason?: string } };
    }> }).lockstateFromWorker ?? [];
    return messages.filter((message) => message.kind === 'simulation/status-counts').at(-1)?.payload?.refusal?.reason;
  })).toBe('place-object.tile-occupied');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  expect(await savedOrders(page)).toMatchObject({ wall: 'approved', toilet: null, occupied: false, cell: true });
  await page.screenshot({ path: testInfo.outputPath('object-after-pending-wall-refused-fullhd.png') });
});
