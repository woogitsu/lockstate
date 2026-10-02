import { expect, test } from './network-changed-fixture';

async function paintedCanvas(page: import('@playwright/test').Page): Promise<Buffer> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return page.locator('#game-root canvas').screenshot();
}

test('cancelled right-button turn cannot resume after blur or pointercancel', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  await page.mouse.move(900, 430);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(960, 430, { steps: 4 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const afterBlur = await paintedCanvas(page);
  await page.mouse.move(1040, 430, { steps: 4 });
  expect((await paintedCanvas(page)).equals(afterBlur), 'RMB turn must stop on window blur').toBe(true);
  await page.mouse.up({ button: 'right' });

  await page.mouse.move(900, 430);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(960, 430, { steps: 4 });
  await page.locator('#game-root canvas').dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
  const afterCancel = await paintedCanvas(page);
  await page.mouse.move(1040, 430, { steps: 4 });
  expect((await paintedCanvas(page)).equals(afterCancel), 'RMB turn must stop on pointercancel').toBe(true);
  await page.mouse.up({ button: 'right' });
});
