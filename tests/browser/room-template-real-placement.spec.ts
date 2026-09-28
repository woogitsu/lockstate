import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD Build places one complete cell and keeps its claim after save and load', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  const place = dialog.getByRole('button', { name: 'Place room plan' });
  await expect(dialog.getByRole('status')).toContainText('clear');
  await expect(place).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('template-ready-fullhd.png') });
  await place.click();
  await expect(dialog.getByRole('status')).toContainText('submitted');
  await expect(place).toBeDisabled();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } },
  ]);
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{kind: string; payload?: {status: string}} > }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/command-result' && message.payload?.status === 'queued'))).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');

  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(restored.getByRole('status')).toContainText('blocked');
  await expect(restored.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('template-restored-blocked-fullhd.png') });
});

test('Full HD Build previews and submits the four-cell corridor row through its catalogue button', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Four-cell row' }).click();
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(112);
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--door')).toHaveCount(4);
  await expect(dialog.locator('.hud-template__materials')).toContainText('Brick');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Catalogue value:');
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await page.screenshot({ path: testInfo.outputPath('four-cell-row-ready-fullhd.png') });
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect(dialog.getByRole('status')).toContainText('submitted');
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 } },
  ]);
});

test('Full HD Build rotates the four-cell row preview and submits its matching worker variant', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  const rotate = dialog.getByRole('checkbox', { name: 'Rotate 180°' });
  await expect(rotate).toBeHidden();
  await dialog.getByRole('button', { name: 'Four-cell row' }).click();
  await expect(rotate).toBeVisible();
  const doorIndices = () => dialog.locator('.hud-template__diagram .hud-template__tile--door').evaluateAll((tiles) =>
    tiles.map((tile) => Array.prototype.indexOf.call(tile.parentElement!.children, tile) as number));
  expect(await doorIndices()).toEqual([43, 46, 64, 67]);
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Catalogue value:');
  const quote = await dialog.locator('.hud-template__catalogue-value').textContent();
  await rotate.check();
  expect(await doorIndices()).toEqual([44, 47, 65, 68]);
  await expect(dialog.locator('.hud-template__catalogue-value')).toHaveText(quote!);
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, quarterTurns: 2 },
  ]);
});
