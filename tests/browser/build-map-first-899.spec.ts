import { expect, test } from './network-changed-fixture';

test.use({ hasTouch: true });

test('Build opens map-first on a phone, then exposes the catalogue and keeps placement usable (#899)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await page.locator('.ui-tab[data-tab="build"]').click();
  const panel = page.locator('.hud-build');
  const disclosure = page.locator('.hud-build > .ui-panel__header .ui-panel__toggle');
  const centre = { x: 188, y: 500 };
  await expect(panel).toHaveAttribute('data-collapsed', 'true');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, centre)).toBe('CANVAS');
  const openMap = await page.evaluate(() => {
    let reachable = 0;
    let samples = 0;
    for (let y = 8; y < innerHeight; y += 16) {
      for (let x = 8; x < innerWidth; x += 16) {
        samples += 1;
        if (document.elementFromPoint(x, y)?.tagName === 'CANVAS') reachable += 1;
      }
    }
    return { reachable, samples };
  });
  expect(openMap.samples).toBe(1173);
  expect(openMap.reachable).toBeGreaterThanOrEqual(400);
  if (process.env['LOCKSTATE_CAPTURE_BUILD_899'] === '1') {
    await page.screenshot({ path: testInfo.outputPath('build-map-first.png') });
  }

  await disclosure.click();
  await expect(panel).toHaveAttribute('data-collapsed', 'false');
  await expect(page.locator('.hud-build__list [data-buildable="bed-wooden"]')).toBeVisible();
  if (process.env['LOCKSTATE_CAPTURE_BUILD_899'] === '1') {
    await page.screenshot({ path: testInfo.outputPath('build-catalogue-open.png') });
  }
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  await page.locator('.hud-build__arm').click();
  await expect(panel).toHaveAttribute('data-collapsed', 'true');
  await expect(disclosure).toBeFocused();
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, centre)).toBe('CANVAS');

  await disclosure.click();
  await expect(page.locator('.hud-build__arm')).toContainText('Stop placing');
  await expect(page.locator('.hud-build__list [data-buildable="bed-wooden"]')).toHaveAttribute('data-selected', 'true');
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'false');

  await page.locator('.ui-tab[data-tab="overview"]').click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await expect(panel).toHaveAttribute('data-collapsed', 'true');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
});

test('Build keeps its catalogue open on desktop (#899)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.locator('.ui-tab[data-tab="build"]').click();
  await expect(page.locator('.hud-build')).toHaveAttribute('data-collapsed', 'false');
  await expect(page.locator('.hud-build__arm')).toBeVisible();
});
