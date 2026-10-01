import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD nested room plan is blocked while outer plan is still pending, including after reload', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Canteen', exact: true }).click();
  if (!await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect.poll(async () => (await sentCommands(page)).some((command) => command.type === 'PlaceRoomTemplate' && command.templateId === 'canteen-basic')).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await expect(page.locator('.hud-build')).toHaveAttribute('data-queued', /[1-9]/);
  await page.getByRole('button', { name: 'Pause' }).click();

  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Kitchen', exact: true }).click();
  if (!await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('11');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('11');
  await expect(dialog.getByRole('status')).toContainText('blocked');
  await expect(dialog.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('nested-room-plan-blocked-fullhd.png') });

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('button', { name: 'Kitchen', exact: true }).click();
  if (!await restored.getByRole('spinbutton', { name: 'Plan origin X' }).isVisible()) await restored.getByText('Enter coordinates', { exact: true }).click();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill('11');
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('11');
  await expect(restored.getByRole('status')).toContainText('blocked');
  await expect(restored.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
});
