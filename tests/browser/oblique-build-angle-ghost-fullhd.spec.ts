import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD held wall rectangle follows yaw and elevation before matching worker orders', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(1350, 400);
  const preview = page.locator('.oblique-square-ghost polygon');
  await expect(preview).toHaveCount(1);
  await page.mouse.down();
  for (let turn = 0; turn < 3; turn += 1) await page.keyboard.press('e');
  for (let tilt = 0; tilt < 2; tilt += 1) await page.keyboard.press('PageUp');
  await expect(page.locator('.hud-camera-angle output')).toContainText('Turn 0°');
  const previewTiles = await preview.evaluateAll((elements) => elements.map((element) =>
    `${element.getAttribute('data-tile-x')},${element.getAttribute('data-tile-y')}`));
  expect(previewTiles.length).toBeGreaterThan(1);
  await page.screenshot({ path: testInfo.outputPath('build-ghost-after-turn-and-tilt-fullhd.png') });
  await page.mouse.up();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder').length).toBe(previewTiles.length);
  const placedTiles = (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder')
    .map((command) => `${command.x},${command.y}`);
  expect(placedTiles.sort()).toEqual(previewTiles.sort());
});
