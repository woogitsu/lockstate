import { expect, test } from '../../../tests/browser/network-changed-fixture';
import { readMinimapCameraObservation } from '../../../tests/browser/minimap-camera-observation';

test('World: a held arrow stops after a real Build/Rooms radio click and a fresh world arrow still moves', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=world');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#game-root canvas')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'View', exact: true })).toHaveValue('world');
  const settle = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  for (const group of ['Build', 'Rooms'] as const) {
    const driver = group === 'Build'
      ? page.getByRole('button', { name: 'Build', exact: true })
      : page.locator('.ui-tab[data-tab="zones"]');
    await driver.click();
    await expect(driver).toBeFocused();
    const row = page.locator(group === 'Build'
      ? '.hud-build__list [data-buildable][role="radio"]'
      : '.hud-rooms__rows [data-room][role="radio"]').first();
    await expect(row).toBeVisible();
    expect(await row.evaluate(node => node.closest('[role="radiogroup"]') !== null), 'actual catalogue row belongs to a public radiogroup').toBe(true);
    await settle();
    const initial = await readMinimapCameraObservation(page);
    await page.waitForTimeout(100);
    expect(await readMinimapCameraObservation(page), `${group} paused camera must settle before the held-key precondition`).toEqual(initial);

    await page.keyboard.down('ArrowDown');
    try {
      await expect.poll(() => readMinimapCameraObservation(page), {
        message: `${group} ordinary HUD button must allow a real held world arrow to move the camera`,
      }).not.toEqual(initial);
      const moving = await readMinimapCameraObservation(page);
      // Genuine pointer input takes focus while ArrowDown remains physically
      // down. No programmatic focus, dispatchEvent, scene read or state write.
      await row.click();
      await expect(row).toBeFocused();
      await settle();
      const atRadio = await readMinimapCameraObservation(page);
      await page.waitForTimeout(300);
      const afterHold = await readMinimapCameraObservation(page);
      await testInfo.attach(`${group}-held-camera-outline`, {
        contentType: 'application/json', body: Buffer.from(JSON.stringify({ group, initial, moving, atRadio, afterHold }, null, 2)),
      });
      await page.screenshot({ path: testInfo.outputPath(`${group.toLowerCase()}-radio-held-world-arrow.png`) });
      expect(afterHold, `${group} radio focus must stop the held arrow before keyup`).toEqual(atRadio);
    } finally {
      await page.keyboard.up('ArrowDown');
    }

    // A fresh press from the same genuine ordinary button must still pan.
    // This rules out a blanket HUD focus gate or a nonfunctional camera.
    await driver.click();
    await expect(driver).toBeFocused();
    await settle();
    const beforeFresh = await readMinimapCameraObservation(page);
    await page.keyboard.down('ArrowDown');
    try {
      await expect.poll(() => readMinimapCameraObservation(page), {
        message: `${group} fresh world arrow must still move after catalogue ownership released the old key`,
      }).not.toEqual(beforeFresh);
    } finally {
      await page.keyboard.up('ArrowDown');
    }
    await settle();
    const released = await readMinimapCameraObservation(page);
    await page.waitForTimeout(100);
    expect(await readMinimapCameraObservation(page), `${group} normal release must stop fresh motion`).toEqual(released);
  }
});
