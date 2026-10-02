import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test.use({ hasTouch: true });

test('two real fingers pan the angled camera while Build stays armed', async ({ page }) => {
  await installTee(page);
  await page.addInitScript(() => {
    const touches: number[] = [];
    window.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') touches.push(event.pointerId);
    }, { capture: true });
    (window as Window & { lockstateTouchPointers?: number[] }).lockstateTouchPointers = touches;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');

  const minimapViewport = page.locator('.hud-minimap__viewport');
  await page.getByRole('region', { name: 'Minimap', exact: true }).getByRole('button', { name: 'Expand', exact: true }).click();
  await expect(minimapViewport).toBeVisible();
  const before = await minimapViewport.getAttribute('style');
  const client = await page.context().newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: readonly { id: number; x: number; y: number }[]) =>
    client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(point => ({ ...point })) });
  await touch('touchStart', [{ id: 0, x: 900, y: 540 }, { id: 1, x: 1050, y: 540 }]);
  for (let step = 1; step <= 6; step += 1) {
    await touch('touchMove', [
      { id: 0, x: 900 + 20 * step, y: 540 + 10 * step },
      { id: 1, x: 1050 + 20 * step, y: 540 + 10 * step },
    ]);
  }
  await touch('touchEnd', []);
  expect(await page.evaluate(() => new Set((window as Window & { lockstateTouchPointers?: number[] }).lockstateTouchPointers).size),
    'the browser did not deliver two native touch pointers').toBe(2);
  expect.soft((await sentCommands(page)).filter(command => command['type'] === 'PlaceBuildOrder'),
    'two-finger navigation submitted a Build order').toHaveLength(0);
  await expect(minimapViewport, 'the two-finger pan did not move the angled camera').not.toHaveAttribute('style', before ?? '');
  await touch('touchStart', [{ id: 0, x: 900, y: 540 }, { id: 1, x: 1050, y: 540 }]);
  await touch('touchCancel', []);
  expect((await sentCommands(page)).filter(command => command['type'] === 'PlaceBuildOrder')).toHaveLength(0);
  await touch('touchStart', [{ id: 0, x: 900, y: 540 }]);
  await touch('touchEnd', []);
  await expect.poll(async () => (await sentCommands(page)).filter(command => command['type'] === 'PlaceBuildOrder').length)
    .toBe(1);
});
