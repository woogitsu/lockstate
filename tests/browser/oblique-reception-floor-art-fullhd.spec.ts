import { expect, test } from './network-changed-fixture';
import { countsSeries, installTee } from './playtest-harness';

async function interiorExteriorMeanGap(page: import('@playwright/test').Page, screenshot: Buffer): Promise<number> {
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Screenshot canvas unavailable');
    context.drawImage(image, 0, 0);
    const mean = (left: number, top: number, right: number, bottom: number) => {
      const pixels = context.getImageData(left, top, right - left, bottom - top).data;
      let total = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        total += (pixels[index]! + pixels[index + 1]! + pixels[index + 2]!) / 3;
      }
      return total / (pixels.length / 4);
    };
    return mean(790, 345, 860, 425) - mean(1140, 345, 1210, 425);
  }, `data:image/png;base64,${screenshot.toString('base64')}`);
}

test('Reception floor visual audit at three Full HD angles after Save and Load', async ({ page }, testInfo) => {
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
  await dialog.getByRole('button', { name: 'Reception', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');

  await page.goto('/?oblique-preview=1');
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);
  const angle = page.locator('.hud-camera-angle');
  const reading = angle.locator('output');
  await expect(reading).toContainText('Turn -45°');
  await page.screenshot({ path: testInfo.outputPath('reception-floor-yaw-minus45-fullhd.png') });
  for (let turn = 0; turn < 3; turn += 1) await angle.getByRole('button', { name: 'Turn right' }).click();
  await expect(reading).toContainText('Turn 0°');
  const front = await page.screenshot({ path: testInfo.outputPath('reception-floor-yaw0-fullhd.png') });
  expect(await interiorExteriorMeanGap(page, front),
    'completed Reception floor must visibly separate from the surrounding dirt').toBeGreaterThan(20);
  for (let turn = 0; turn < 3; turn += 1) await angle.getByRole('button', { name: 'Turn right' }).click();
  await expect(reading).toContainText('Turn 45°');
  await page.screenshot({ path: testInfo.outputPath('reception-floor-yaw45-fullhd.png') });
  expect(errors).toEqual([]);
});
