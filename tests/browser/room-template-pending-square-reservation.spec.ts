import { expect, test } from './network-changed-fixture';
import { countsSeries, installTee, sentCommands } from './playtest-harness';

test('Full HD room plan keeps its empty future bed square reserved through Save and Load', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await page.keyboard.press('Escape');

  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('11');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('11');
  await page.locator('.hud-build__coordinates .ui-action').click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command.type === 'PlaceBuildOrder' && command.definitionId === 'wall-brick' &&
    command.footprint === 'square' && command.x === 11 && command.y === 11)).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const messages = (window as unknown as { lockstateFromWorker: Array<{
      kind: string; payload?: { refusal?: { reason?: string } };
    }> }).lockstateFromWorker;
    return messages.filter((message) => message.kind === 'simulation/status-counts')
      .at(-1)?.payload?.refusal?.reason;
  })).toBe('build.unbuildable');
  await page.screenshot({ path: testInfo.outputPath('reserved-cell-square-fullhd.png') });

  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.roomCapacity, { timeout: 120_000 }).toBe(1);
});
