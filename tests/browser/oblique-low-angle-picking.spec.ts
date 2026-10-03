import { openCameraControls } from './public-camera-controls';
import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD shallow-angle room preview and placement name the same ground square', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  // The scene starts at yaw -45/elevation 45. Five visible 15-degree turns and
  // two 10-degree lowers reach yaw 30/elevation 25 without a test-only camera
  // seam. This is a genuinely shallow, non-axis-aligned production pose.
  await openCameraControls(page);
  const turn = page.getByRole('button', { name: 'Rotate camera right', exact: true });
  for (let step = 0; step < 5; step += 1) await turn.click();
  const lower = page.getByRole('button', { name: 'Lower camera angle', exact: true });
  await lower.click();
  await lower.click();

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  // Keep this small plan in the clear central playfield so the intentional
  // large-plan fit/pan policy cannot move its origin away from the cursor.
  const pointer = { x: 1000, y: 500 };
  await page.mouse.move(pointer.x, pointer.y);
  const ghost = page.locator('.room-template-world-ghost');
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  const firstSquare = await ghost.locator('polygon').first().evaluate((polygon, point) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas')!;
    const bounds = canvas.getBoundingClientRect();
    const screen = { x: (point.x - bounds.x) * canvas.width / bounds.width,
      y: (point.y - bounds.y) * canvas.height / bounds.height };
    const vertices = (polygon.getAttribute('points') ?? '').trim().split(/\s+/).map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return { x: x!, y: y! };
    });
    const signs = vertices.map((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length]!;
      return (next.x - vertex.x) * (screen.y - vertex.y) - (next.y - vertex.y) * (screen.x - vertex.x);
    });
    return { inside: signs.every(value => value >= -0.01) || signs.every(value => value <= 0.01),
      area: Math.abs(vertices.reduce((sum, vertex, index) => {
        const next = vertices[(index + 1) % vertices.length]!;
        return sum + vertex.x * next.y - next.x * vertex.y;
      }, 0)) / 2 };
  }, pointer);
  expect(firstSquare.area).toBeGreaterThan(300);
  expect(firstSquare.inside, 'the cursor should be inside the exact floor square shown by the ghost').toBe(true);

  const expected = await page.evaluate(point => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas')!;
    const bounds = canvas.getBoundingClientRect();
    const x = (point.x - bounds.x) * canvas.width / bounds.width;
    const y = (point.y - bounds.y) * canvas.height / bounds.height;
    const yaw = 30 * Math.PI / 180, elevation = 25 * Math.PI / 180;
    const across = (x - canvas.width / 2) / 1.25;
    const depth = (y - canvas.height / 2) / (1.25 * Math.sin(elevation));
    return { x: Math.floor((16 * 64 + Math.cos(yaw) * across + Math.sin(yaw) * depth) / 64),
      y: Math.floor((16 * 64 - Math.sin(yaw) * across + Math.cos(yaw) * depth) / 64) };
  }, pointer);
  await page.screenshot({ path: testInfo.outputPath('low-angle-ghost-fullhd.png') });
  await page.mouse.click(pointer.x, pointer.y);
  await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate').length).toBe(1);
  const command = (await sentCommands(page)).find(command => command.type === 'PlaceRoomTemplate');
  expect(command?.origin, 'the authoritative room command must use the clicked, previewed tile').toEqual(expected);
});
