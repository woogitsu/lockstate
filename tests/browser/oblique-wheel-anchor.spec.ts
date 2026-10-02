import { expect, test } from './network-changed-fixture';

test('native wheel zoom keeps the same Build target under the pointer at a changed camera pose', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');
  await page.getByRole('button', { name: 'Rotate camera right' }).click();
  await page.getByRole('button', { name: 'Lower camera angle' }).click();

  const target = page.locator('.hud-build__target-value');
  const minimap = page.locator('.hud-minimap__viewport');
  const pointer = { x: 1410, y: 760 };
  await page.mouse.move(pointer.x, pointer.y);
  const before = await target.innerText();
  expect(before).toMatch(/\d+/);
  const viewportBefore = await minimap.getAttribute('style');
  await page.mouse.wheel(0, -100);
  await expect(minimap).not.toHaveAttribute('style', viewportBefore ?? '');
  // Main's current hover readout refreshes on physical movement. Re-read the
  // same screen position, rather than accepting an unchanged cached label.
  await page.mouse.move(pointer.x + 1, pointer.y);
  await page.mouse.move(pointer.x, pointer.y);
  await expect(target, 'wheel zoom moved the Build square beneath the stationary cursor').toHaveText(before);

  const secondViewportBefore = await minimap.getAttribute('style');
  await page.mouse.wheel(0, 100);
  await expect(minimap).not.toHaveAttribute('style', secondViewportBefore ?? '');
  await page.mouse.move(pointer.x + 1, pointer.y);
  await page.mouse.move(pointer.x, pointer.y);
  await expect(target, 'zooming back out moved the Build target').toHaveText(before);
});
