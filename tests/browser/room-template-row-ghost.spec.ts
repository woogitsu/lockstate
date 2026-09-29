import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD row ghost fits entirely inside the build canvas at default zoom', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Four-cell row' }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  const canvas = page.locator('#game-root canvas');
  await page.mouse.move(960, 540);
  await page.waitForTimeout(500);
  const screenshot = await page.screenshot({ path: testInfo.outputPath('row-ghost-at-default-zoom.png') });
  await expect(canvas).toBeVisible();
  const doorBands = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const surface = document.createElement('canvas');
    surface.width = image.width;
    surface.height = image.height;
    const context = surface.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const rows: number[] = [];
    for (let y = 110; y < 1020; y += 1) {
      let count = 0;
      for (let x = 620; x < 1390; x += 1) {
        const offset = (y * image.width + x) * 4;
        if (pixels[offset]! < 70 && pixels[offset + 1]! > 110 && pixels[offset + 1]! < 175 && pixels[offset + 2]! > 105 && pixels[offset + 2]! < 175) count += 1;
      }
      if (count >= 35) rows.push(y);
    }
    return rows.filter((row, index) => index === 0 || row > rows[index - 1]! + 1);
  }, Array.from(screenshot));
  expect(doorBands).toHaveLength(2);
  expect(doorBands[0]).toBeGreaterThan(160);
  expect(doorBands[1]).toBeLessThan(900);
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
  const [command] = (await sentCommands(page)).filter((entry) => entry.type === 'PlaceRoomTemplate');
  expect(command).toMatchObject({ type: 'PlaceRoomTemplate', templateId: 'cell-row-four' });
});
