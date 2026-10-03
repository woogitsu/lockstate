import { expect, test } from './network-changed-fixture';
import { readMinimapCameraObservation } from './minimap-camera-observation';

test('Full HD oblique camera stays still while Build and Rooms radio groups consume arrows', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  const paintedCanvas = async (): Promise<Buffer> => {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    // The full-screen canvas sits beneath the HUD, so a locator screenshot
    // also contains moving HUD rows. Read a bare world region instead.
    return page.screenshot({ clip: { x: 560, y: 230, width: 560, height: 560 } });
  };

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const buildRows = page.locator('.hud-build__list [data-buildable]');
  expect(await buildRows.count()).toBeGreaterThan(6);
  await buildRows.first().focus();
  const beforeBuild = await paintedCanvas();
  await page.waitForTimeout(180);
  expect((await paintedCanvas()).equals(beforeBuild), 'paused baseline canvas must settle before focus navigation').toBe(true);
  for (let index = 0; index < 6; index += 1) await page.keyboard.press('ArrowDown');
  await expect(buildRows.nth(6)).toBeFocused();
  expect((await paintedCanvas()).equals(beforeBuild), 'Build radio navigation also panned the oblique camera').toBe(true);

  await page.locator('.ui-tab[data-tab="zones"]').click();
  const roomRows = page.locator('.hud-rooms__rows [data-room]');
  expect(await roomRows.count()).toBeGreaterThan(2);
  await roomRows.first().focus();
  const beforeRooms = await paintedCanvas();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(roomRows.nth(2)).toBeFocused();
  expect((await paintedCanvas()).equals(beforeRooms), 'Rooms radio navigation also panned the oblique camera').toBe(true);

  // The camera must still respond from an ordinary HUD control. This catches a
  // false pass caused by an unavailable camera, a blank canvas, or a global HUD
  // focus gate that blocks the documented arrow controls everywhere.
  await page.getByRole('button', { name: 'Build', exact: true }).focus();
  const beforePan = await paintedCanvas();
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowDown');
  expect((await paintedCanvas()).equals(beforePan), 'world ArrowDown should still pan from an ordinary HUD button').toBe(false);
  await page.screenshot({ path: testInfo.outputPath('oblique-roving-focus-fullhd.png') });
});

test('a held world arrow stops panning when focus moves into a Build radio group', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const paintedCanvas = async (): Promise<Buffer> => {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    return page.screenshot({ clip: { x: 560, y: 230, width: 560, height: 560 } });
  };
  const initial = await paintedCanvas();
  const initialViewport = await readMinimapCameraObservation(page);
  await page.getByRole('button', { name: 'Build', exact: true }).focus();
  await page.keyboard.down('ArrowDown');
  try {
    // CI37039088544 published real camera movement while this bare-map PNG
    // remained identical. Establish the held-key precondition independently;
    // retain the strict PNG stop guard and require the outline to stop too.
    await expect.poll(() => readMinimapCameraObservation(page), {
      message: 'the world arrow needs to move the camera before focus transfer',
      timeout: 10_000,
    }).not.toEqual(initialViewport);
    const moving = await paintedCanvas();
    await testInfo.attach('held-arrow-observation', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
      initialViewport, movingViewport: await readMinimapCameraObservation(page), identicalMapPng: moving.equals(initial),
    })) });
    const row = page.locator('.hud-build__list [data-buildable]').first();
    await row.focus();
    await expect(row).toBeFocused();
    const atFocus = await paintedCanvas();
    const viewportAtFocus = await readMinimapCameraObservation(page);
    await page.waitForTimeout(300);
    expect((await paintedCanvas()).equals(atFocus), 'camera kept panning after a Build radio took focus').toBe(true);
    expect(await readMinimapCameraObservation(page), 'camera outline kept panning after a Build radio took focus').toEqual(viewportAtFocus);
  } finally {
    await page.keyboard.up('ArrowDown');
  }
});
