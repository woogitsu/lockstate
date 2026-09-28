import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD wall drag preview follows the ground under a stationary pointer while the camera pans', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(960, 540);
  const preview = page.locator('.oblique-square-ghost polygon');
  await expect(preview).toHaveCount(1);
  const minimapViewport = page.locator('.hud-minimap__viewport');
  const beforeCamera = await minimapViewport.evaluate((element) => `${element.style.left}/${element.style.top}`);
  await page.mouse.down();
  await page.keyboard.down('d');
  await page.waitForTimeout(650);
  await page.keyboard.up('d');
  expect(await minimapViewport.evaluate((element) => `${element.style.left}/${element.style.top}`)).not.toBe(beforeCamera);
  const previewCount = await preview.count();
  expect(previewCount, 'camera pan changed the ground under the held pointer, but the preview stayed at one tile').toBeGreaterThan(1);
  const previewTiles = await preview.evaluateAll((elements) => elements.map((element) =>
    `${element.getAttribute('data-tile-x')},${element.getAttribute('data-tile-y')}`));
  await page.screenshot({ path: testInfo.outputPath('wall-drag-after-camera-pan-fullhd.png') });
  await page.mouse.up();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder').length).toBe(previewCount);
  const placedTiles = (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder')
    .map((command) => `${command.x},${command.y}`);
  expect(placedTiles.sort()).toEqual(previewTiles.sort());
  console.log(`Pan while dragging: ${previewCount} previewed tiles, ${placedTiles.length} submitted tiles`);
});
