import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD Build offers the complete Common Room plan and queues that choice', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Common Room', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('7 × 7 tiles');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(49);
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--door')).toHaveCount(1);
  await expect(dialog.locator('.hud-template__contents')).toContainText('Bench × 4');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Brick × 46');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Wood Plank × 9');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Catalogue value: 2,425');
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await page.screenshot({ path: testInfo.outputPath('common-room-plan-fullhd-en.png') });
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'common-room-basic', origin: { x: 10, y: 10 } },
  ]);
});

test('Polish Full HD Build names the Common Room plan and its materials', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Świetlica', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('7 × 7 pól');
  await expect(dialog.locator('.hud-template__contents')).toContainText('Ławka × 4');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Cegła × 46');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Deska × 9');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Wartość katalogowa: 2425');
  await page.screenshot({ path: testInfo.outputPath('common-room-plan-fullhd-pl.png') });
});
