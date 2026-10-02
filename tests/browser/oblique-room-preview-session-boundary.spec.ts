import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Save/Load and a new prison release a fitted room-plan origin from the prior session', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();

  const ghost = page.locator('.room-template-world-ghost');
  const armLargePlan = async (): Promise<void> => {
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).click();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    await page.mouse.move(880, 380);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(ghost.locator('polygon')).toHaveCount(112);
  };
  await armLargePlan();
  await page.screenshot({ path: testInfo.outputPath('before-session-boundary-fullhd.png') });

  // Keyboard activation keeps the physical cursor on the map. A mouse click
  // on the save panel would incidentally reset the preview and miss this bug.
  await page.getByRole('button', { name: 'Save now', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await expect(ghost.locator('polygon')).toHaveCount(112);
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(ghost).toBeHidden();
  await page.mouse.move(900, 400);
  await expect(ghost).toBeHidden();

  await armLargePlan();
  await page.getByRole('button', { name: 'New prison', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-panel__item')).toHaveCount(2);
  await expect(ghost).toBeHidden();
  await page.mouse.move(920, 420);
  await expect(ghost).toBeHidden();
  expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('after-session-boundary-fullhd.png') });
});
