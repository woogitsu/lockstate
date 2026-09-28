import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD Build selection follows the actually armed tool', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Canteen' }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  await page.mouse.move(960, 540);
  const ghost = page.locator('.oblique-template-ghost');
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  const wall = page.locator('.hud-build__list [data-buildable="wall-brick"]');
  await expect(wall).toHaveAttribute('aria-checked', 'false');
  await expect(wall).toHaveAttribute('data-selected', 'false');
  await expect(page.locator('.hud-build__list [aria-checked="true"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('room-plan-armed-no-wall-selection-1920x1080.png') });

  const bed = page.locator('.hud-build__list [data-buildable="bed-wooden"]');
  await bed.focus();
  await page.keyboard.press('Enter');
  await expect(ghost).toBeHidden();
  await expect(bed).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.hud-build__list [aria-checked="true"]')).toHaveCount(1);
  await page.mouse.click(960, 540);
  expect((await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
});
