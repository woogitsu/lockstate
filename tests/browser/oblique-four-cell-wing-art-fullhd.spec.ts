import { expect, test, type Page } from './network-changed-fixture';
import { countsSeries, installTee } from './playtest-harness';

async function warmWallPixels(page: Page, screenshot: Buffer,
  bounds: readonly [number, number, number, number]): Promise<number> {
  return page.evaluate(async ({ data, bounds: [left, top, right, bottom] }) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Screenshot canvas unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(left, top, right - left, bottom - top).data;
    let warm = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]!;
      const green = pixels[index + 1]!;
      const blue = pixels[index + 2]!;
      if (red > 145 && green > 130 && blue > 110
        && Math.abs(red - green) < 35 && Math.abs(green - blue) < 35) warm += 1;
    }
    return warm;
  }, { data: `data:image/png;base64,${screenshot.toString('base64')}`, bounds });
}

test('the built four-cell row stays readable in the real Full HD oblique app', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Four-cell row' }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(4);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/);
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');

  await page.goto('/?oblique-preview=1');
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(4);
  const angle = page.locator('.hud-camera-angle');
  const reading = angle.locator('output');
  await expect(reading).toContainText('Turn -45°');
  const left = await page.screenshot({ path: testInfo.outputPath('wing-yaw-minus45-fullhd.png') });
  for (let turn = 0; turn < 3; turn += 1) await angle.getByRole('button', { name: 'Turn right' }).click();
  await expect(reading).toContainText('Turn 0°');
  const front = await page.screenshot({ path: testInfo.outputPath('wing-yaw0-fullhd.png') });
  for (let turn = 0; turn < 3; turn += 1) await angle.getByRole('button', { name: 'Turn right' }).click();
  await expect(reading).toContainText('Turn 45°');
  const right = await page.screenshot({ path: testInfo.outputPath('wing-yaw45-fullhd.png') });
  expect(await warmWallPixels(page, left, [660, 240, 690, 270]),
    'the built square wall should use the warm authored material at -45°').toBeGreaterThan(300);
  expect(await warmWallPixels(page, front, [740, 170, 770, 200])).toBeGreaterThan(300);
  expect(await warmWallPixels(page, right, [1090, 180, 1120, 210])).toBeGreaterThan(300);
  expect(errors).toEqual([]);
});
