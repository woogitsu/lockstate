import { expect, test } from './network-changed-fixture';

test('camera, minimap and Room plans remain keyboard reachable at 150% Full HD', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.display-scale__cycle').click();
  await page.locator('.display-scale__cycle').click();
  await page.locator('.hud-minimap .ui-panel__toggle').click();
  const angle = page.locator('.hud-camera-angle');
  const reading = angle.locator('output');
  await angle.getByRole('button', { name: 'Turn right' }).focus();
  await page.keyboard.press('Enter');
  await expect(reading).toContainText('Turn -30°');
  let tabsToSurface = -1;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.classList.contains('hud-minimap__surface') ?? false)) {
      tabsToSurface = attempt + 1;
      break;
    }
  }
  expect(tabsToSurface).toBeGreaterThan(0);
  const viewport = page.locator('.hud-minimap__viewport');
  await page.locator('.hud-minimap__surface').click({ position: { x: 25, y: 25 } });
  const offCenter = await viewport.evaluate((element) => `${element.style.left}/${element.style.top}`);
  await page.locator('.hud-minimap__surface').focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => viewport.evaluate((element) => `${element.style.left}/${element.style.top}`)).not.toBe(offCenter);
  const openPlans = page.getByRole('button', { name: 'Room plans', exact: true });
  await openPlans.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('e');
  await expect(reading).toContainText('Turn -30°');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(openPlans).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('camera-minimap-plans-focus-fullhd.png') });
});

test('camera and minimap leave Build controls clear at 175% and 200% Full HD', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-minimap .ui-panel__toggle').click();
  for (const scale of [125, 150, 175, 200]) {
    await page.locator('.display-scale__cycle').click();
    if (scale < 175) continue;
    const geometry = await page.evaluate(() => {
      const angle = document.querySelector('.hud-camera-angle')!.getBoundingClientRect();
      const minimap = document.querySelector('.hud-minimap')!.getBoundingClientRect();
      const surface = document.querySelector('.hud-minimap__surface')!.getBoundingClientRect();
      const build = document.querySelector('.hud-build')!.getBoundingClientRect();
      const hit = document.elementFromPoint(surface.left + surface.width / 2, surface.top + surface.height / 2);
      return { angleRight: angle.right, minimapRight: minimap.right, surfaceBottom: surface.bottom,
        buildLeft: build.left, mapHit: hit?.className };
    });
    console.log(`${scale}% ${JSON.stringify(geometry)}`);
    await page.screenshot({ path: testInfo.outputPath(`camera-minimap-${scale}-fullhd.png`) });
    expect(geometry.minimapRight).toBeLessThan(geometry.buildLeft);
    expect(geometry.surfaceBottom).toBeLessThanOrEqual(1080);
    expect(geometry.mapHit).toBe('hud-minimap__surface');
  }
});
