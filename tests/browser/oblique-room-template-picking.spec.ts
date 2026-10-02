import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands, type TeeWindow } from './playtest-harness';

/** Fit/pan keeps the world origin chosen before the camera moves, through the actual press. */
test('angled room plan ghost and mouse placement agree through four yaw directions', async ({ page }) => {
  test.setTimeout(120_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  const turn = page.getByRole('button', { name: 'Rotate camera right', exact: true });
  const raise = page.getByRole('button', { name: 'Raise camera angle', exact: true });
  const lower = page.getByRole('button', { name: 'Lower camera angle', exact: true });
  const ghost = page.locator('.room-template-world-ghost');
  const hover = { x: 880, y: 380 };
  let previousYawStep = 0;
  let previousElevationStep = 0;
  for (const pose of [
    { yawDegrees: 0, yawSteps: 3, elevationDegrees: 45, elevationSteps: 0 },
    { yawDegrees: 90, yawSteps: 9, elevationDegrees: 65, elevationSteps: 2 },
    { yawDegrees: 180, yawSteps: 15, elevationDegrees: 45, elevationSteps: 0 },
    { yawDegrees: 270, yawSteps: 21, elevationDegrees: 65, elevationSteps: 2 },
  ]) {
    const placedBefore = (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate').length;
    for (let step = previousYawStep; step < pose.yawSteps; step += 1) await turn.click();
    for (let step = previousElevationStep; step < pose.elevationSteps; step += 1) await raise.click();
    for (let step = pose.elevationSteps; step < previousElevationStep; step += 1) await lower.click();
    previousYawStep = pose.yawSteps;
    previousElevationStep = pose.elevationSteps;

    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    // Calculate from the fresh 32x32 framing, the actual canvas dimensions and
    // the yaw/elevation button steps above BEFORE hover can pan/fit the camera.
    // This is independent of the preview, preflight and command producers.
    const expectedOrigin = await page.evaluate(({ mouse, yawDegrees, elevationDegrees }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
      if (canvas === null) throw new Error('Missing world canvas');
      const bounds = canvas.getBoundingClientRect();
      const screenX = (mouse.x - bounds.x) * canvas.width / bounds.width;
      const screenY = (mouse.y - bounds.y) * canvas.height / bounds.height;
      const yaw = yawDegrees * Math.PI / 180;
      const elevation = elevationDegrees * Math.PI / 180;
      const across = (screenX - canvas.width / 2) / 1.25;
      const depth = (screenY - canvas.height / 2) / (1.25 * Math.sin(elevation));
      // A fresh prison owns exactly the 32×32 origin chunk; framing targets
      // its centre. HUD pose steps turn about the viewport centre.
      return {
        x: Math.floor((16 * 64 + Math.cos(yaw) * across + Math.sin(yaw) * depth) / 64),
        y: Math.floor((16 * 64 - Math.sin(yaw) * across + Math.cos(yaw) * depth) / 64),
      };
    }, { mouse: hover, yawDegrees: pose.yawDegrees, elevationDegrees: pose.elevationDegrees });
    await page.mouse.move(hover.x, hover.y);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(ghost.locator('polygon')).toHaveCount(28);
    const footprint = await ghost.locator('polygon').evaluateAll(polygons => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
      if (canvas === null) throw new Error('Missing world canvas');
      const bounds = canvas.getBoundingClientRect();
      const measured = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      const sx = canvas.width / bounds.width, sy = canvas.height / bounds.height;
      const safe = {
        left: (Math.max(measured('.hud__tabs')?.right ?? bounds.left,
          measured('.hud__corner')?.right ?? bounds.left) - bounds.left) * sx + 8,
        right: ((measured('.hud__rail')?.left ?? bounds.right) - bounds.left) * sx - 8,
        top: ((measured('.hud-strip')?.bottom ?? bounds.top) - bounds.top) * sy + 8,
        bottom: canvas.height - 8,
      };
      const vertices = polygons.map(polygon => (polygon.getAttribute('points') ?? '').trim().split(/\s+/).map(pair => {
        const [x, y] = pair.split(',').map(Number);
        return { x: x!, y: y! };
      }));
      const first = vertices[0];
      if (first === undefined) throw new Error('Missing first ghost square');
      const area = Math.abs(first.reduce((sum, vertex, index) => {
        const next = first[(index + 1) % first.length]!;
        return sum + vertex.x * next.y - next.x * vertex.y;
      }, 0)) / 2;
      return {
        area,
        safe,
        outside: vertices.flatMap((square, index) => square.filter(point =>
          !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < safe.left - 0.01 || point.x > safe.right + 0.01 ||
          point.y < safe.top - 0.01 || point.y > safe.bottom + 0.01).map(point => ({ square: index, ...point }))),
      };
    });
    expect(footprint.area, `Ghost collapsed at yaw ${pose.yawDegrees}\u00b0, elevation ${pose.elevationDegrees}\u00b0`).toBeGreaterThan(1000);
    expect(footprint.safe.right).toBeGreaterThan(footprint.safe.left);
    expect(footprint.safe.bottom).toBeGreaterThan(footprint.safe.top);
    // Approved pan-locked fit centres the footprint in this unobscured area;
    // it does not promise the first square remains beneath the old cursor.
    expect(footprint.outside, 'the complete room footprint must fit outside the HUD').toEqual([]);
    const preflightOrigin = () => page.evaluate(() => {
      type Request = { kind?: string; payload?: { projectionId?: string; target?: { origin?: { x: number; y: number } } } };
      const requests = ((window as unknown as TeeWindow).lockstateSentToWorker ?? []) as Request[];
      return requests.filter(message => message.kind === 'simulation/request-projection' &&
        message.payload?.projectionId === 'world/room-template-preflight').at(-1)?.payload?.target?.origin;
    });
    await expect.poll(preflightOrigin, { message: 'the worker preflight must retain the independent pre-fit world square' }).toEqual(expectedOrigin);
    await page.mouse.click(hover.x, hover.y);
    await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate').length).toBe(placedBefore + 1);
    const commands = (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate');
    expect(commands.at(-1)?.origin, `Wrong map square at yaw ${pose.yawDegrees}°`).toEqual(expectedOrigin);
    await expect(ghost).toBeHidden();
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    await page.mouse.move(hover.x, hover.y);
    await expect(ghost).toHaveAttribute('data-ready', 'blocked');
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(placedBefore + 1);
    await page.keyboard.press('Escape');
    if (pose.yawSteps !== 21) {
      await page.getByRole('button', { name: 'Overview', exact: true }).click();
      await page.getByRole('button', { name: 'New prison' }).click();
      await expect(page.locator('.hud-clock__day')).toHaveText('1');
    }
  }
});
