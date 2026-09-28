import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

type Tile = { x: number; y: number };
const coordinate = async (element: import('@playwright/test').Locator): Promise<Tile> => element.evaluate((node) => ({
  x: Number(node.getAttribute('data-tile-x')),
  y: Number(node.getAttribute('data-tile-y')),
}));
const key = ({ x, y }: Tile): string => `${x},${y}`;

test('Full HD wall drag previews every full square and catalogue total before pointerup', async ({ page }, testInfo) => {
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
  const expected: Tile[] = [];
  for (let y = Math.min(start.y, end.y); y <= Math.max(start.y, end.y); y += 1) {
    for (let x = Math.min(start.x, end.x); x <= Math.max(start.x, end.x); x += 1) expected.push({ x, y });
  }
  expect(expected.length).toBeGreaterThan(1);
  await page.mouse.move(960, 540);
  await page.mouse.down();
  await page.mouse.move(1220, 540, { steps: 8 });
  await expect(preview).toHaveCount(expected.length);
  expect((await preview.evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute('data-tile-x')},${node.getAttribute('data-tile-y')}`))).sort())
    .toEqual(expected.map(key).sort());
  await expect(page.locator('.oblique-square-ghost__notice')).toContainText(`Catalogue value: ${80 * expected.length}`);
  expect((await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder')).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('oblique-wall-drag-before-release-1920x1080.png') });
  await page.mouse.up();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder'), { timeout: 10_000 }).toHaveLength(expected.length);
});
