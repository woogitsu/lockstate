import { expect, test } from './network-changed-fixture';
import { countsSeries, installTee, sentCommands } from './playtest-harness';

test('Full HD player builds and restores a complete furnished shower', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Shower room' }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await page.screenshot({ path: testInfo.outputPath('shower-ready-fullhd.png') });
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command.type === 'PlaceRoomTemplate' && command.templateId === 'shower-room' &&
    (command.origin as { x: number; y: number }).x === 10 &&
    (command.origin as { x: number; y: number }).y === 10)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.screenshot({ path: testInfo.outputPath('shower-complete-fullhd.png') });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('button', { name: 'Shower room' }).click();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(restored.getByRole('status')).toContainText('blocked');
  await page.screenshot({ path: testInfo.outputPath('shower-restored-fullhd.png') });
});
