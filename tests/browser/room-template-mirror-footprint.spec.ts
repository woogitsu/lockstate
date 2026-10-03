import { expect, test } from './network-changed-fixture';
import { countsSeries, installTee, sentCommands } from './playtest-harness';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';

test('Full HD mirrored Kitchen finishes without its stove entering the shell', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Kitchen', exact: true }).click();
  await dialog.locator('input[type="checkbox"]').check();
  if (!await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command.type === 'PlaceRoomTemplate' && command.templateId === 'kitchen-basic' && command.mirrorX === true)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.screenshot({ path: testInfo.outputPath('mirrored-kitchen-complete-fullhd.png') });

  const plan = instantiateRoomTemplate('kitchen-basic', { x: 10, y: 10 }, { mirrorX: true });
  const stove = plan.objects.find((object) => object.buildableId === 'stove-brick')!;
  const shell = [...plan.wallSquares, ...plan.doorSquares];
  expect(shell.some(({ x, y }) => x === stove.x + 1 && y === stove.y)).toBe(false);

  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('button', { name: 'Kitchen', exact: true }).click();
  await restored.locator('input[type="checkbox"]').check();
  if (!await restored.getByRole('spinbutton', { name: 'Plan origin X' }).isVisible()) await restored.getByText('Enter coordinates', { exact: true }).click();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(restored.getByRole('status')).toContainText('blocked');
});
