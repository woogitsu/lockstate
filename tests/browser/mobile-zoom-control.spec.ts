import { expect, test } from './network-changed-fixture';
import { installTee, openApp, sentCommands } from './playtest-harness';

test.use({ hasTouch: true });

test('camera zoom remains reachable by touch in the phone Layout menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();

  const before = await page.locator('#game-root canvas').screenshot();
  const stripHeight = await page.locator('.hud-strip').evaluate((element) => element.getBoundingClientRect().height);
  const sheetTop = await page.locator('.hud__side').evaluate((element) => element.getBoundingClientRect().top);
  const commandsBefore = (await sentCommands(page)).length;

  await page.locator('.hud-layout__button').click();
  const out = page.getByRole('button', { name: 'Zoom out', exact: true });
  const inside = page.getByRole('button', { name: 'Zoom in', exact: true });
  await expect(out).toBeVisible();
  await expect(inside).toBeVisible();
  for (const button of [out, inside]) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('button')?.getAttribute('title'), [x, y] as const)).toBe(await button.getAttribute('title'));
  }
  const outBox = await out.boundingBox();
  await page.touchscreen.tap(outBox!.x + outBox!.width / 2, outBox!.y + outBox!.height / 2);
  await page.locator('.hud-layout__button').click();
  await expect.poll(async () => (await page.locator('#game-root canvas').screenshot()).equals(before)).toBe(false);
  expect((await sentCommands(page)).slice(commandsBefore)).toEqual([]);
  expect(await page.locator('.hud-strip').evaluate((element) => element.getBoundingClientRect().height)).toBe(stripHeight);
  expect(await page.locator('.hud__side').evaluate((element) => element.getBoundingClientRect().top)).toBe(sheetTop);

  // The map-only preference hides the rail, so the camera control must stay
  // in the persistent Layout drawer rather than disappear with that rail.
  await page.locator('.hud-layout__button').click();
  await page.locator('.hud-layout__map-only').click();
  await expect(out).toBeVisible();
  await expect(inside).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.hud__corner .hud-zoom__out')).toBeVisible();
  await expect(page.locator('.hud-layout__preferences .hud-zoom')).toHaveCount(0);
});
