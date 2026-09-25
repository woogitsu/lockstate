import { expect, test } from './network-changed-fixture';
import { openApp } from './playtest-harness';

test('Full HD minimap paints loaded land and tracks the camera after pointer and keyboard navigation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();

  const surface = page.locator('.hud-minimap__surface');
  const canvas = surface.locator('canvas');
  const viewport = surface.locator('.hud-minimap__viewport');
  await expect(canvas).toBeVisible();
  await expect(surface).toHaveAccessibleName(/Prison map/);
  const painted = await canvas.evaluate((node) => {
    const map = node as HTMLCanvasElement;
    const context = map.getContext('2d');
    if (context === null) return 0;
    const rgba = context.getImageData(0, 0, map.width, map.height).data;
    let land = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] !== 22 || rgba[i + 1] !== 35 || rgba[i + 2] !== 43) land += 1;
    }
    return land;
  });
  expect(painted).toBeGreaterThan(0);
  await expect(viewport).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('full-hd-minimap.png') });

  const initial = await viewport.evaluate((node) => ({ left: node.style.left, top: node.style.top }));
  const box = await surface.boundingBox();
  if (box === null) throw new Error('The minimap surface is not laid out');
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.2);
  await expect.poll(() => viewport.evaluate((node) => ({ left: node.style.left, top: node.style.top }))).not.toEqual(initial);
  const afterPointer = await viewport.evaluate((node) => ({ left: node.style.left, top: node.style.top }));

  await surface.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => viewport.evaluate((node) => ({ left: node.style.left, top: node.style.top }))).not.toEqual(afterPointer);
});
