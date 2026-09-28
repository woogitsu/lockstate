import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD angled Build places and restores the complete Common Room plan', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Common Room', exact: true }).click();
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('2,425');
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  await expect(page.locator('.hud-build__arm-hint')).toContainText('whole room plan');
  await expect(page.locator('.hud-build__arm-hint')).not.toContainText('wall');
  const ghost = page.locator('.oblique-template-ghost');
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(ghost.getByRole('status')).toContainText('Common Room, 7 × 7 tiles');
  await expect(ghost.locator('polygon')).toHaveCount(49);
  await expect(ghost.locator('polygon[data-kind="furniture"]')).toHaveCount(8);
  await expect(ghost.locator('.oblique-template-ghost__cost')).toContainText('2,425');
  const origin = await ghost.locator('polygon').first().evaluate((node) => ({
    x: Number(node.getAttribute('data-tile-x')), y: Number(node.getAttribute('data-tile-y')),
  }));
  await page.screenshot({ path: testInfo.outputPath('oblique-common-room-before-placement-1920x1080.png') });
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
  expect((await sentCommands(page)).find((command) => command.type === 'PlaceRoomTemplate')).toMatchObject({
    templateId: 'common-room-basic', origin,
  });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('button', { name: 'Common Room', exact: true }).click();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill(String(origin.x));
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(origin.y));
  await expect(restored.getByRole('status')).toContainText('blocked');
});
