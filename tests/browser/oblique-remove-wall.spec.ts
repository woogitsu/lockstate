import { expect, test } from './network-changed-fixture';
import { buy, fastForwardToMax, installTee, sentCommands, waitForQueueEmpty } from './playtest-harness';

type Point = { x: number; y: number };
function edgePoint(quad: readonly Point[], side: 'north' | 'west'): Point {
  const a = quad[0]!;
  const b = quad[side === 'north' ? 1 : 3]!;
  const centre = {
    x: quad.reduce((sum, point) => sum + point.x, 0) / 4,
    y: quad.reduce((sum, point) => sum + point.y, 0) / 4,
  };
  return { x: (a.x + b.x) * 0.4 + centre.x * 0.2, y: (a.y + b.y) * 0.4 + centre.y * 0.2 };
}

test('Full HD oblique Remove sends the north and west wall edge the pointer chose', async ({ page }) => {
  test.setTimeout(90_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(960, 540);
  const polygon = page.locator('.oblique-square-ghost polygon').first();
  await expect(polygon).toBeVisible();
  const target = await polygon.evaluate((node) => ({
    x: Number(node.getAttribute('data-tile-x')),
    y: Number(node.getAttribute('data-tile-y')),
    quad: (node.getAttribute('points') ?? '').split(' ').map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x: x!, y: y! };
    }),
  }));
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  for (const side of ['north', 'west'] as const) {
    const point = edgePoint(target.quad, side);
    await page.mouse.click(point.x, point.y);
    await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'RemoveWall').length, { timeout: 10_000 })
      .toBe(side === 'north' ? 1 : 2);
  }
  const removals = (await sentCommands(page)).filter((command) => command.type === 'RemoveWall');
  expect(removals.map((command) => ({ x: command.x, y: command.y, edge: command.edge }))).toEqual([
    { x: target.x, y: target.y, edge: 'north' },
    { x: target.x, y: target.y, edge: 'west' },
  ]);
});

test('Full HD oblique Remove takes down a completed wall order', async ({ page }) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await buy(page, 'wall-brick', 5);
  await fastForwardToMax(page);
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(960, 540);
  const polygon = page.locator('.oblique-square-ghost polygon').first();
  await expect(polygon).toBeVisible();
  const target = await polygon.evaluate((node) => ({
    x: Number(node.getAttribute('data-tile-x')),
    y: Number(node.getAttribute('data-tile-y')),
    quad: (node.getAttribute('points') ?? '').split(' ').map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x: x!, y: y! };
    }),
  }));
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder').length).toBe(1);
  await waitForQueueEmpty(page, 100_000);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  const point = edgePoint(target.quad, 'north');
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'RemoveWall').length).toBe(1);
  const removal = (await sentCommands(page)).find((command) => command.type === 'RemoveWall');
  expect(removal).toMatchObject({ x: target.x, y: target.y, edge: 'north' });
  await page.waitForTimeout(500);
  await expect(page.locator('.hud__refusal')).toBeHidden();
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'RemoveWall').length).toBe(2);
  await expect(page.locator('.hud__refusal')).toContainText('Nothing was removed');
});
