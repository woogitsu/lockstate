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

test('camera controls keep the minimap toggle reachable at 200% interface scale', async ({ page }) => {
  // This is the CSS viewport produced by a 1280x800 laptop at 200% browser
  // zoom. The interface scale is independently 200%, which used to make the
  // 396px minimap extend underneath the Build rail and intercept its toggle.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  for (let step = 0; step < 4; step += 1) await page.locator('.display-scale__cycle').click();

  const boxes = await page.evaluate(() => {
    const minimap = document.querySelector('.hud-minimap')!.getBoundingClientRect();
    const build = document.querySelector('.hud-build')!.getBoundingClientRect();
    const toggle = document.querySelector('.hud-minimap .ui-panel__toggle') as HTMLElement;
    const toggleBox = toggle.getBoundingClientRect();
    const hit = document.elementFromPoint(toggleBox.left + toggleBox.width / 2, toggleBox.top + toggleBox.height / 2);
    return {
      minimapRight: minimap.right,
      buildLeft: build.left,
      toggleHit: hit === toggle || toggle.contains(hit),
    };
  });

  expect(boxes.minimapRight, 'the minimap header is hidden beneath the Build rail').toBeLessThanOrEqual(boxes.buildLeft);
  expect(boxes.toggleHit, 'the minimap toggle is covered by the Build rail').toBe(true);
  await page.locator('.hud-minimap .ui-panel__toggle').click();
  await expect(page.locator('.hud-minimap .ui-panel__toggle')).toHaveAttribute('aria-expanded', 'false');
});

test('Full HD browser zoom keeps oblique camera controls reachable at 175% and 200% interface scale', async ({ page }, testInfo) => {
  // A 1920x1080 display at 200% browser zoom is a 960x540 CSS viewport.
  // This is intentionally separate from interface scale: both are magnifiers,
  // and the camera's two stacked panels must not silently fall below the HUD.
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  for (let step = 0; step < 3; step += 1) await page.locator('.display-scale__cycle').click();
  await page.locator('.hud-navigation-drawer__trigger').click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('camera-controls-fullhd-zoom-175.png') });

  const cameraPanels = page.locator('.hud-camera-panels');
  const cameraViewport = await cameraPanels.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, height: element.clientHeight,
      scrollHeight: element.scrollHeight, tapTarget: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap-target')) };
  });
  expect(cameraViewport.top).toBeGreaterThanOrEqual(0);
  expect(cameraViewport.bottom).toBeLessThanOrEqual(540);
  expect(cameraViewport.height).toBeGreaterThanOrEqual(cameraViewport.tapTarget);
  expect(cameraViewport.scrollHeight).toBeGreaterThan(cameraViewport.height);

  const angleButtons = page.locator('.hud-camera-angle__button');
  const reading = page.locator('.hud-camera-angle__reading');
  for (let index = 0; index < await angleButtons.count(); index += 1) {
    const button = angleButtons.nth(index);
    await button.scrollIntoViewIfNeeded();
    const hit = await button.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const top = element.closest('.hud-camera-panels')!.getBoundingClientRect().top;
      const bottom = element.closest('.hud-camera-panels')!.getBoundingClientRect().bottom;
      const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return box.top >= top && box.bottom <= bottom && (target === element || element.contains(target));
    });
    expect(hit, `camera action ${index} is reachable within the camera panel`).toBe(true);
    const before = await reading.textContent();
    await button.click();
    if (index < 4) await expect(reading).not.toHaveText(before ?? '');
  }

  const minimapToggle = page.locator('.hud-minimap .ui-panel__toggle');
  await minimapToggle.scrollIntoViewIfNeeded();
  const minimapToggleHit = await minimapToggle.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const parent = element.closest('.hud-camera-panels')!.getBoundingClientRect();
    const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return box.top >= parent.top && box.bottom <= parent.bottom && (target === element || element.contains(target));
  });
  expect(minimapToggleHit).toBe(true);
  await minimapToggle.click();
  await expect(minimapToggle).toHaveAttribute('aria-expanded', 'false');

  // The largest UI step makes the status strip taller again. The same compact
  // camera viewport must retain one complete 88px press target at 200% too.
  await page.locator('.display-scale__cycle').click();
  const maxScaleViewport = await cameraPanels.evaluate((element) => ({
    height: element.clientHeight,
    tapTarget: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap-target')),
  }));
  expect(maxScaleViewport.height).toBeGreaterThanOrEqual(maxScaleViewport.tapTarget);
  await angleButtons.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('camera-controls-fullhd-zoom-200.png') });
  const previousPose = await reading.textContent();
  await angleButtons.first().click();
  await expect(reading).not.toHaveText(previousPose ?? '');
  await minimapToggle.scrollIntoViewIfNeeded();
  await minimapToggle.click();
  await expect(minimapToggle).toHaveAttribute('aria-expanded', 'true');
});

test('Full HD minimap and detached alerts keep their visual gutter at the default scale', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-minimap .ui-panel__toggle').click();

  const minimap = page.locator('.hud-minimap');
  const alerts = page.locator('.hud__corner > .hud-alerts--detached');
  await expect(minimap).toBeVisible();
  await expect(alerts).toBeVisible();
  const gap = await page.evaluate(() => {
    const minimap = document.querySelector('.hud-minimap')!.getBoundingClientRect();
    const alerts = document.querySelector('.hud__corner > .hud-alerts--detached')!.getBoundingClientRect();
    return alerts.top - minimap.bottom;
  });
  await page.screenshot({ path: testInfo.outputPath('camera-corner-default-scale.png') });
  expect(gap, 'the detached Alerts card should have the 8px corner spacing token below the minimap').toBeGreaterThanOrEqual(8);
});
