import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

async function settledCanvas(page: Page): Promise<Buffer> {
  const canvas = page.locator('#game-root canvas');
  let previous = await canvas.screenshot();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await page.waitForTimeout(200);
    const current = await canvas.screenshot();
    if (current.equals(previous)) return current;
    previous = current;
  }
  throw new Error('Angled world did not settle before the camera comparison.');
}

async function openWorld(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
}

test('Full HD angled world responds to the visible zoom control', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openWorld(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const beforeZoom = await settledCanvas(page);
  await page.locator('.hud-zoom__in').click();
  expect(errors, 'Zoom must not call the stopped top-down scene').toEqual([]);
  const afterZoom = await settledCanvas(page);
  expect(afterZoom.equals(beforeZoom), 'Zoom in changed only the stopped top-down scene').toBe(false);
  await page.screenshot({ path: testInfo.outputPath('oblique-after-zoom-fullhd.png') });
});

test('Full HD angled world zooms with the wheel over the map', async ({ page }) => {
  test.setTimeout(120_000);
  await openWorld(page);
  const canvas = page.locator('#game-root canvas');
  const viewport = page.locator('.hud-minimap__viewport');
  await expect(viewport).toBeVisible();
  await page.waitForTimeout(1000);
  const beforeZoom = await viewport.evaluate((element) => `${element.style.width}/${element.style.height}`);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.waitForTimeout(1000);
  expect(await viewport.evaluate((element) => `${element.style.width}/${element.style.height}`)).toBe(beforeZoom);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => viewport.evaluate((element) => `${element.style.width}/${element.style.height}`)).not.toBe(beforeZoom);
});

test('wheel zoom keeps the build square under an off-centre cursor', async ({ page }) => {
  test.setTimeout(120_000);
  await openWorld(page);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(1400, 500);
  const square = page.locator('.oblique-square-ghost polygon').first();
  await expect(square).toBeVisible();
  const tile = await square.evaluate((element) => `${element.getAttribute('data-tile-x')}/${element.getAttribute('data-tile-y')}`);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => square.evaluate((element) => `${element.getAttribute('data-tile-x')}/${element.getAttribute('data-tile-y')}`)).toBe(tile);
});

test('WASD moves the Full HD angled camera while the world owns focus', async ({ page }) => {
  test.setTimeout(120_000);
  await openWorld(page);
  const viewport = page.locator('.hud-minimap__viewport');
  await expect(viewport).toBeVisible();
  await page.waitForTimeout(1000);
  const before = await viewport.evaluate((element) => `${element.style.left}/${element.style.top}`);
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  await expect.poll(async () => viewport.evaluate((element) => `${element.style.left}/${element.style.top}`)).not.toBe(before);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__coordinates > .ui-section__header').click();
  const coordinateField = page.locator('.hud-build__coordinates input').first();
  await coordinateField.focus();
  await expect(coordinateField).toBeFocused();
  await page.waitForTimeout(500);
  const whileTyping = await viewport.evaluate((element) => `${element.style.left}/${element.style.top}`);
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  await expect(coordinateField).toBeFocused();
  expect(await viewport.evaluate((element) => `${element.style.left}/${element.style.top}`)).toBe(whileTyping);
});

test('middle mouse drag pans the angled world without placing a Build order', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installTee(page);
  await openWorld(page);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  const viewport = page.locator('.hud-minimap__viewport');
  await expect.poll(async () => viewport.evaluate((element) => element.style.left)).not.toBe('');
  await page.waitForTimeout(1000);
  const before = await viewport.evaluate((element) => `${element.style.left}/${element.style.top}`);
  await page.mouse.move(960, 540);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(1160, 540, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(async () => viewport.evaluate((element) => `${element.style.left}/${element.style.top}`)).not.toBe(before);
  expect((await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder')).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('oblique-middle-pan-build-fullhd.png') });
});

test('Full HD angled world responds to the visible minimap', async ({ page }) => {
  test.setTimeout(120_000);
  await openWorld(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (let step = 0; step < 4; step += 1) await page.locator('.hud-zoom__in').click();
  const minimap = page.locator('.hud-minimap');
  const surface = minimap.locator('.hud-minimap__surface');
  if (await surface.isHidden()) await minimap.locator('.ui-panel__toggle').click();
  await expect(surface).toBeVisible();
  await expect(surface.locator('canvas')).toBeVisible();
  const viewport = minimap.locator('.hud-minimap__viewport');
  await expect(viewport).toBeVisible();
  const beforePosition = await viewport.evaluate((element) => `${element.style.left}/${element.style.top}`);
  await surface.click({ position: { x: 30, y: 30 } });
  expect(errors, 'Minimap must not call the stopped top-down scene').toEqual([]);
  await expect.poll(async () => viewport.evaluate((element) => `${element.style.left}/${element.style.top}`)).not.toBe(beforePosition);
});
