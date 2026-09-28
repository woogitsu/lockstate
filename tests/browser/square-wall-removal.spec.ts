import { expect, test } from './network-changed-fixture';
import { calibrate, installTee, press, sentCommands, TILE } from './playtest-harness';

test('Full HD Remove clears a completed square wall from its west half through save and load', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('10');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('13');
  await page.locator('.hud-build__coordinates .ui-action').click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command['type'] === 'PlaceBuildOrder' && command['footprint'] === 'square' && command['x'] === 10 && command['y'] === 13)).toBe(true);
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 30_000 });

  const openPlan = async () => {
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('9');
    await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('12');
    return dialog;
  };
  await expect((await openPlan()).getByRole('status')).toContainText('blocked');
  await page.screenshot({ path: testInfo.outputPath('square-wall-blocked-fullhd.png') });
  await page.keyboard.press('Escape');

  const { originX, originY } = await calibrate(page, { x: 700, y: 300 }, 16);
  await page.locator('.hud-build__remove').click();
  const commands = await press(page, originX + 10 * TILE + 16, originY + 13 * TILE + 32);
  expect(commands).toContainEqual(expect.objectContaining({ type: 'RemoveWall', x: 10, y: 13, edge: 'west' }));
  await expect((await openPlan()).getByRole('status')).toContainText('clear');
  await page.screenshot({ path: testInfo.outputPath('square-wall-cleared-fullhd.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect((await openPlan()).getByRole('status')).toContainText('clear');
  await page.screenshot({ path: testInfo.outputPath('square-wall-restored-clear-fullhd.png') });
});
