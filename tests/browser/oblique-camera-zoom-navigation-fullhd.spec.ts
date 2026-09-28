import { expect, test, type Page } from './network-changed-fixture';

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
