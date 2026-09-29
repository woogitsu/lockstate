import type { Page } from './network-changed-fixture';
import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

async function savedDoorAndWall(page: Page) {
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
      door: runtime.navigation.doors.getByEdge(tile, 'top') !== undefined,
      doorOrder: runtime.construction.allOrders().find((order) => order.definitionId === 'door-wooden' &&
        order.location.x === tile.x && order.location.y === tile.y)?.state ?? null,
      square: runtime.world.getSquareStructure(tile),
    };
  });
}

async function placeAt(page: Page, buildable: 'wall-brick' | 'door-wooden') {
  await page.locator(`.hud-build__list [data-buildable="${buildable}"]`).click();
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('11');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('15');
  await page.locator('.hud-build__coordinates .ui-action').click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command.type === 'PlaceBuildOrder' && command.definitionId === buildable &&
    command.x === 11 && command.y === 15)).toBe(true);
}

test('Full HD Build refuses an ordinary door through a completed square wall after Save/Load', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await placeAt(page, 'wall-brick');
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await savedDoorAndWall(page)).square).toBe(1);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await placeAt(page, 'door-wooden');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  expect(await savedDoorAndWall(page)).toEqual({ door: false, doorOrder: 'failed', square: 1 });
  await page.screenshot({ path: testInfo.outputPath('door-after-square-wall-refused-fullhd.png') });
});
