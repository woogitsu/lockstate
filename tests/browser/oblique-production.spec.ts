import { expect, test } from './network-changed-fixture';

test('production composition root boots the opted-in oblique scene at Full HD', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  await expect(page.locator('.startup-error')).toHaveCount(0);
  const canvasSize = await page.locator('#game-root canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
  });
  expect(canvasSize.width).toBeGreaterThan(0);
  expect(canvasSize.height).toBeGreaterThan(0);
});
