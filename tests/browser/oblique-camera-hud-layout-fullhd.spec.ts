import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD Build keeps the angled camera and expanded minimap usable at larger interface scales', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-minimap .ui-panel__toggle').click();
  for (const scale of [100, 125, 150]) {
    if (scale > 100) await page.locator('.display-scale__cycle').click();
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        const box = element?.getBoundingClientRect();
        return box && { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      const map = document.querySelector('.hud-minimap__surface');
      const mapBox = map?.getBoundingClientRect();
      const hit = mapBox && document.elementFromPoint(mapBox.left + mapBox.width / 2, mapBox.top + mapBox.height / 2);
      const buttons = [...document.querySelectorAll('.hud-camera-angle__button')].map((button) => button.getBoundingClientRect());
      return { angle: rect('.hud-camera-angle'), minimap: rect('.hud-minimap'), surface: rect('.hud-minimap__surface'),
        build: rect('.hud-build'), mapHit: hit?.className,
        smallestButton: Math.min(...buttons.map((button) => Math.min(button.width, button.height))) };
    });
    console.log(`${scale}% ${JSON.stringify(geometry)}`);
    await page.screenshot({ path: testInfo.outputPath(`camera-build-${scale}-fullhd.png`) });
    expect(geometry.surface, `${scale}% expanded minimap needs a visible map surface`).not.toBeNull();
    expect(geometry.surface!.height).toBeGreaterThanOrEqual(44 * scale / 100);
    expect(geometry.surface!.bottom, `${scale}% expanded minimap map is below the Full HD viewport`).toBeLessThanOrEqual(1080);
    expect(geometry.mapHit, `${scale}% minimap surface is covered by another HUD element`).toBe('hud-minimap__surface');
    expect(geometry.angle!.right).toBeLessThan(geometry.minimap!.left);
    expect(geometry.minimap!.right).toBeLessThan(geometry.build!.left);
    expect(geometry.smallestButton).toBeGreaterThanOrEqual(44 * scale / 100);
  }
  for (let step = 0; step < 4; step += 1) await page.locator('.hud-zoom__in').click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  const viewport = page.locator('.hud-minimap__viewport');
  const beforeNavigation = await viewport.evaluate((element) => `${element.style.left}/${element.style.top}`);
  await page.locator('.hud-minimap__surface').click({ position: { x: 30, y: 30 } });
  await expect.poll(async () => viewport.evaluate((element) => `${element.style.left}/${element.style.top}`)).not.toBe(beforeNavigation);
  expect((await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder')).toHaveLength(0);
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Room plans' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('camera-room-plans-150-fullhd.png') });
});

test.describe('Polish Full HD camera HUD', () => {
  test.use({ locale: 'pl-PL' });

  test('expanded minimap stays visible beside Polish angle labels at 150%', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?oblique-preview=1');
    await page.getByRole('button', { name: 'Nowe więzienie' }).click();
    await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
    await page.getByRole('button', { name: 'Buduj', exact: true }).click();
    await page.locator('.hud-minimap .ui-panel__toggle').click();
    await page.locator('.display-scale__cycle').click();
    await page.locator('.display-scale__cycle').click();
    const geometry = await page.evaluate(() => {
      const angle = document.querySelector('.hud-camera-angle')!.getBoundingClientRect();
      const map = document.querySelector('.hud-minimap__surface')!.getBoundingClientRect();
      const hit = document.elementFromPoint(map.left + map.width / 2, map.top + map.height / 2);
      const buttons = [...document.querySelectorAll('.hud-camera-angle__button')].map((button) => button.getBoundingClientRect());
      return { angleRight: angle.right, mapLeft: map.left, mapBottom: map.bottom,
        hit: hit?.className, smallestButton: Math.min(...buttons.map((button) => Math.min(button.width, button.height))) };
    });
    expect(geometry.angleRight).toBeLessThan(geometry.mapLeft);
    expect(geometry.mapBottom).toBeLessThanOrEqual(1080);
    expect(geometry.hit).toBe('hud-minimap__surface');
    expect(geometry.smallestButton).toBeGreaterThanOrEqual(66);
    await page.screenshot({ path: testInfo.outputPath('camera-minimap-polish-150-fullhd.png') });
  });
});

test('angled camera HUD does not cover Build at a narrower desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.display-scale__cycle').click();
  await page.locator('.display-scale__cycle').click();
  const boxes = await page.evaluate(() => ({
    angle: document.querySelector('.hud-camera-angle')!.getBoundingClientRect().right,
    minimap: document.querySelector('.hud-minimap')!.getBoundingClientRect().right,
    build: document.querySelector('.hud-build')!.getBoundingClientRect().left,
  }));
  console.log(`1280x800 150% ${JSON.stringify(boxes)}`);
  expect(boxes.angle).toBeLessThan(boxes.build);
  expect(boxes.minimap).toBeLessThan(boxes.build);
});
