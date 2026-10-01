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
  if (!await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
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
  if (!await restored.getByRole('spinbutton', { name: 'Plan origin X' }).isVisible()) await restored.getByText('Enter coordinates', { exact: true }).click();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(restored.getByRole('status')).toContainText('blocked');
  await expect(restored.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('template-restored-blocked-fullhd.png') });
});
