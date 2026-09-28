import type { Page } from '@playwright/test';
import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

async function savedState(page: Page, yardOrigin: { x: number; y: number }) {
  return page.evaluate(async ({ x, y }) => {
    const [{ PrisonSaveRepository }, { IndexedDbLocalSaveStore, openLockstateDatabase }, { restoreSimulationRuntime }] = await Promise.all([
      import('../../src/persistence/local/repository'), import('../../src/persistence/local/indexeddb-store'),
      import('../../src/simulation/runtime/restore-session'),
    ]);
    const repository = new PrisonSaveRepository(new IndexedDbLocalSaveStore(await openLockstateDatabase()));
    const [prison] = await repository.list();
    if (prison === undefined) throw new Error('New prison not found');
    const loaded = await repository.loadCurrent(prison.prisonId);
    if (!loaded.ok) throw new Error(`Saved prison unreadable: ${loaded.reason}`);
    const runtime = restoreSimulationRuntime(loaded.envelope.payload as unknown as import('../../src/simulation/runtime/restore-session').SessionSnapshotBundle).runtime;
    return {
      wall: runtime.construction.getOrder('wall-before-yard')?.state,
      yard: runtime.prisoners.roomInstances.getById(`room.yard:${x}:${y}`) !== undefined,
      undoGuard: runtime.construction.undoWouldReachPastTheLatestAction,
    };
  }, yardOrigin);
}

test('Full HD Undo after paused Yard cannot remove an earlier wall, even after Save/Load', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('5');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('5');
  await page.locator('.hud-build__coordinates .ui-action').click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command.type === 'PlaceBuildOrder' && command.x === 5 && command.y === 5)).toBe(true);

  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Yard', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  const ghost = page.locator('.oblique-template-ghost');
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  const origin = await ghost.locator('polygon').first().evaluate((node) => ({
    x: Number(node.getAttribute('data-tile-x')), y: Number(node.getAttribute('data-tile-y')),
  }));
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).some((command) => command.type === 'PlaceRoomTemplate')).toBe(true);
  const undo = page.locator('.hud-strip__history').getByRole('button', { name: 'Undo the last placement' });
  await undo.click();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'Undo')).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('yard-undo-refused-fullhd.png') });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  const beforeReload = await savedState(page, origin);
  expect(beforeReload.wall).not.toBe('cancelled');
  expect(beforeReload).toMatchObject({ yard: true, undoGuard: true });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  const restoredUndo = page.locator('.hud-strip__history').getByRole('button', { name: 'Undo the last placement' });
  await expect(restoredUndo).toBeEnabled();
  await restoredUndo.click();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'Undo')).toHaveLength(1);
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  const afterReload = await savedState(page, origin);
  expect(afterReload).toMatchObject({ yard: true, undoGuard: true });
  expect(afterReload.wall).not.toBe('cancelled');
});
