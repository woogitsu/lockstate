import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD Laundry plan shows both machines and queues its worker command', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Laundry', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('6 × 6 tiles');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(36);
  await expect(dialog.locator('.hud-template__contents')).toContainText('Washing Machine × 2');
  await expect(dialog.locator('.hud-template__catalogue-value')).toBeVisible();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await page.screenshot({ path: testInfo.outputPath('laundry-ready-fullhd-en.png') });
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect.poll(async () => (await sentCommands(page)).some((command) => command.type === 'PlaceRoomTemplate' && command.templateId === 'laundry-basic')).toBe(true);
});

test('Polish Full HD Laundry plan names the machines', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Pralnia', exact: true }).click();
  await expect(dialog.locator('.hud-template__contents')).toContainText('Pralka × 2');
  await page.screenshot({ path: testInfo.outputPath('laundry-ready-fullhd-pl.png') });
});
