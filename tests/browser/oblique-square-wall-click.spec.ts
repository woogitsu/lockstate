import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD oblique Build places the previewed full-square brick wall', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const wall = page.locator('.hud-build__list [data-buildable="wall-brick"]');
  await wall.click();
  await expect(wall).toContainText('80');
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(960, 540);
  const preview = page.locator('.oblique-square-ghost polygon');
  await expect(preview).toBeVisible();
  await expect(page.locator('.oblique-square-ghost__notice')).toContainText('Brick wall · 80 per segment');
  const previewTile = await preview.evaluate((element) => ({ x: Number(element.getAttribute('data-tile-x')), y: Number(element.getAttribute('data-tile-y')) }));
  await page.screenshot({ path: testInfo.outputPath('oblique-square-wall-preview-1920x1080.png') });
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder'), { timeout: 10_000 }).toHaveLength(1);
  const order = (await sentCommands(page)).find((command) => command.type === 'PlaceBuildOrder');
  expect(order).toMatchObject({ type: 'PlaceBuildOrder', definitionId: 'wall-brick', footprint: 'square' });
  expect(order).toMatchObject(previewTile);
});

test('Full HD oblique wall drag submits one transaction covering every square in the rectangle', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  const preview = page.locator('.oblique-square-ghost polygon');
  const readTile = async () => preview.evaluate((element) => ({
    x: Number(element.getAttribute('data-tile-x')), y: Number(element.getAttribute('data-tile-y')),
  }));
  await page.mouse.move(960, 540);
  await expect(preview).toBeVisible();
  const start = await readTile();
  let end = start;
  let endPoint = { x: 1020, y: 560 };
  for (const point of [{ x: 1020, y: 560 }, { x: 1120, y: 560 }, { x: 1200, y: 620 }]) {
    await page.mouse.move(point.x, point.y);
    end = await readTile();
    if (end.x !== start.x || end.y !== start.y) { endPoint = point; break; }
  }
  expect(end).not.toEqual(start);
  await page.mouse.move(960, 540);
  await page.mouse.down();
  await page.mouse.move(endPoint.x, endPoint.y, { steps: 5 });
  await page.mouse.up();
  const expectedCount = (Math.abs(end.x - start.x) + 1) * (Math.abs(end.y - start.y) + 1);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder').length).toBe(expectedCount);
  const orders = (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder');
  expect(new Set(orders.map((order) => `${order.x},${order.y}`)).size).toBe(expectedCount);
  expect(new Set(orders.map((order) => order.transactionId)).size).toBe(1);
  expect(orders.every((order) => order.footprint === 'square' && order.definitionId === 'wall-brick')).toBe(true);
});

test.describe('Polish wall cost feedback', () => {
  test.use({ locale: 'pl-PL' });

  test('Full HD wall ghost uses the Build catalogue price in Polish', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?oblique-preview=1');
    await page.getByRole('button', { name: 'Nowe więzienie' }).click();
    await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
    await page.getByRole('button', { name: 'Buduj', exact: true }).click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    await page.getByRole('button', { name: 'Stawiaj na mapie', exact: true }).click();
    await page.mouse.move(960, 540);
    await expect(page.locator('.oblique-square-ghost__notice')).toHaveText('Ściana z cegły · 80 za segment');
  });
});
