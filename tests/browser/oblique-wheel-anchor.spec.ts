import { openCameraControls } from './public-camera-controls';
import { expect, test } from './network-changed-fixture';

test('native wheel zoom keeps the same Build square under the pointer after a pose change and renderer switch', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');
  await openCameraControls(page);
  await page.getByRole('button', { name: 'Rotate camera right' }).click();
  await page.getByRole('button', { name: 'Lower camera angle' }).click();

  const target = page.locator('.hud-build__target-value');
  const minimap = page.locator('.hud-minimap__viewport');
  const pointer = { x: 1410, y: 760 };
  await page.mouse.move(pointer.x, pointer.y);
  const before = await target.innerText();
  expect(before).toContain('square');
  const viewportBefore = await minimap.getAttribute('style');
  await page.mouse.wheel(0, -100);
  await expect(minimap).not.toHaveAttribute('style', viewportBefore ?? '');
  await expect(target, 'wheel zoom moved the Build square beneath the stationary cursor').toHaveText(before);

  const view = page.getByRole('combobox', { name: 'View' });
  await view.selectOption('world');
  await expect(view).toHaveValue('world');
  await view.selectOption('oblique');
  await expect(view).toHaveValue('oblique');
  await page.mouse.move(pointer.x, pointer.y);
  const afterSwitch = await target.innerText();
  expect(afterSwitch).toContain('square');
  const secondViewportBefore = await minimap.getAttribute('style');
  await page.mouse.wheel(0, 100);
  await expect(minimap).not.toHaveAttribute('style', secondViewportBefore ?? '');
  await expect(target, 'wheel zoom after renderer switching moved the Build square').toHaveText(afterSwitch);
});
