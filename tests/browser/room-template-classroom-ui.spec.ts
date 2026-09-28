import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD Classroom plan shows furniture and queues its worker command', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Classroom', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('7 × 7 tiles');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(49);
  await expect(dialog.locator('.hud-template__contents')).toContainText('Bookshelf × 1');
  await expect(dialog.locator('.hud-template__contents')).toContainText('Chair × 4');
  await expect(dialog.locator('.hud-template__catalogue-value')).toBeVisible();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await page.screenshot({ path: testInfo.outputPath('classroom-ready-fullhd-en.png') });
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect.poll(async () => (await sentCommands(page)).some((command) => command.type === 'PlaceRoomTemplate' && command.templateId === 'classroom-basic')).toBe(true);
});

test('Polish Full HD Classroom plan names every furnishing', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Sala lekcyjna', exact: true }).click();
  await expect(dialog.locator('.hud-template__contents')).toContainText('Regał na książki × 1');
  await expect(dialog.locator('.hud-template__contents')).toContainText('Krzesło × 4');
  await page.screenshot({ path: testInfo.outputPath('classroom-ready-fullhd-pl.png') });
});
