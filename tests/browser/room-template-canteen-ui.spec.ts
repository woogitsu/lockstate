import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD Build selects and submits the authored canteen with its entire footprint', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Canteen', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('8 × 8 tiles');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(64);
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--door')).toHaveCount(1);
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--object')).toHaveCount(20);
  await expect(dialog.locator('.hud-template__contents')).toContainText('Dining Table × 2');
  await expect(dialog.locator('.hud-template__contents')).toContainText('Bench × 4');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Brick × 54');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Wood Plank × 15');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Catalogue value: 3,135');
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await page.screenshot({ path: testInfo.outputPath('canteen-plan-fullhd-en.png') });
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'canteen-basic', origin: { x: 10, y: 10 } },
  ]);
});

test('Polish Full HD Build labels the canteen plan and its furniture', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Stołówka', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('8 × 8 pól');
  await expect(dialog.locator('.hud-template__contents')).toContainText('Stół jadalny × 2');
  await expect(dialog.locator('.hud-template__contents')).toContainText('Ławka × 4');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Cegła × 54');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Deska × 15');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Wartość katalogowa: 3135');
  await page.screenshot({ path: testInfo.outputPath('canteen-plan-fullhd-pl.png') });
});

test('Full HD stationary canteen ghost changes when Mirror X changes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Canteen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  await page.mouse.move(850, 480);
  const canvas = page.locator('#game-root canvas');
  const before = await canvas.screenshot();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally' }).check();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('mirrored-canteen-ghost-fullhd.png') });
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally' }).uncheck();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(true);
});
