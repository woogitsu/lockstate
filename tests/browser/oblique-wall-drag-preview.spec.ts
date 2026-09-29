import { expect, test, type Locator } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

type Tile = { x: number; y: number };
const coordinate = async (element: Locator): Promise<Tile> => element.evaluate((node) => ({
  x: Number(node.getAttribute('data-tile-x')),
  y: Number(node.getAttribute('data-tile-y')),
}));
const key = ({ x, y }: Tile): string => `${x},${y}`;

test('Full HD wall drag previews every full square and catalogue total before pointerup', async ({ page }) => {
  test.setTimeout(90_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  const preview = page.locator('.oblique-square-ghost polygon');
  await page.mouse.move(960, 540);
  const start = await coordinate(preview.first());
  await page.mouse.move(1220, 540);
  const end = await coordinate(preview.first());
  expect(start).not.toEqual(end);
  await page.mouse.move(960, 540);
  await page.mouse.down();
  await page.mouse.move(1220, 540, { steps: 8 });
  const debug = await page.evaluate(() => ({
    tiles: [...document.querySelectorAll('.oblique-square-ghost polygon')].map((node) => `${node.getAttribute('data-tile-x')},${node.getAttribute('data-tile-y')}`),
    canvas: [...document.querySelectorAll('canvas')].map((node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }),
    message: document.querySelector('.oblique-square-ghost__notice')?.textContent,
  }));
  const previewTiles: Tile[] = debug.tiles.map((value) => {
    const match = /^(\d+),(\d+)$/.exec(value);
    if (match === null) throw new Error(`Invalid preview tile ${value}`);
    return { x: Number(match[1]), y: Number(match[2]) };
  });
  expect(previewTiles.length).toBeGreaterThan(1);
  const minX = Math.min(...previewTiles.map((tile) => tile.x));
  const maxX = Math.max(...previewTiles.map((tile) => tile.x));
  const minY = Math.min(...previewTiles.map((tile) => tile.y));
  const maxY = Math.max(...previewTiles.map((tile) => tile.y));
  const expected: Tile[] = [];
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) expected.push({ x, y });
  expect(previewTiles.map(key).sort()).toEqual(expected.map(key).sort());
  expect(debug.message).toContain(`Catalogue value: ${80 * expected.length}`);
  expect((await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder')).toHaveLength(0);
  await page.mouse.up();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder'), { timeout: 10_000 }).toHaveLength(expected.length);
  const orders = (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder');
  expect(orders.map((order) => `${order.x},${order.y}`).sort()).toEqual(expected.map(key).sort());
  expect(new Set(orders.map((order) => order.transactionId)).size).toBe(1);
});
