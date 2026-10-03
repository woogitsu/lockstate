import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { observeUnroundedMinimapViewport, minimapGroundReference, type MinimapViewportPercent } from './minimap-unrounded-reference';

interface Target { templateId: string; origin: { x: number; y: number } }
interface Receipt { target: Target; ok: boolean }

async function observePreflight(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const targets = new Map<string, Target>();
    const replies: Receipt[] = [];
    class ObservedWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const reply = event.data as { kind?: string; replyTo?: string; payload?: { view?: { data?: { ok: boolean } } } };
          const target = targets.get(reply.replyTo ?? '');
          if (target !== undefined && reply.kind === 'simulation/projection' && reply.payload?.view?.data !== undefined) {
            replies.push({ target, ok: reply.payload.view.data.ok });
          }
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const request = message as { messageId?: string; payload?: { projectionId?: string; target?: Target } };
        if (request.payload?.projectionId === 'world/room-template-preflight' && request.payload.target !== undefined) {
          targets.set(request.messageId!, request.payload.target);
        }
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    window.Worker = ObservedWorker as typeof Worker;
    Reflect.set(window, 'worldCameraPreflight', replies);
  });
}

for (const uiScale of [1, 2]) test(`World FullHD ${uiScale * 100}% zoomed room-plan corners and actual placement share the picked ground`, async ({ page }, testInfo) => {
  await installTee(page);
  await observePreflight(page);
  await page.addInitScript(observeUnroundedMinimapViewport);
  await page.addInitScript(scale => {
    localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
  }, uiScale);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const cursor = { x: 900, y: 380 };
  await page.mouse.click(cursor.x, cursor.y); // unarmed native canvas focus
  await page.keyboard.press('Equal'); // real keyboard camera zoom, before arming
  await expect.poll(() => page.locator('.hud-minimap__viewport').evaluate(view => {
    return parseFloat((view as HTMLElement).style.width);
  })).toBeCloseTo(75, 5); // 1920 / (32 * 64 * 1.25), fresh unclipped world
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), cursor)).toBe(true);
  await page.mouse.move(cursor.x, cursor.y);
  const ghost = page.locator('.room-template-world-ghost');
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await expect(ghost.locator('polygon')).toHaveCount(28);
  await expect(ghost.getByRole('status')).toContainText('Materials catalogue value:');
  const chosen = await page.evaluate(() => (Reflect.get(window, 'worldCameraPreflight') as Receipt[]).at(-1)!);
  expect(chosen.ok).toBe(true);
  expect(chosen.target.templateId).toBe('cell-basic');

  // This separate HUD channel emits actual visible ground bounds. Observe its
  // original percentage assignment before native CSSOM decimal serialization;
  // CSS readback is retained independently below, never a precise world oracle.
  // Its
  // producer is independently checked against real Camera.getWorldPoint.
  // Compare the real SVG with that channel and with the physical pointer;
  // neither observation calls the main forward callback as its reference.
  const measured = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas')!;
    const map = document.querySelector<HTMLCanvasElement>('.hud-minimap canvas')!;
    const viewport = document.querySelector<HTMLElement>('.hud-minimap__viewport')!;
    const box = canvas.getBoundingClientRect();
    const fraction = (key: 'left' | 'top' | 'width' | 'height') => parseFloat(viewport.style[key]) / 100;
    const unrounded = (Reflect.get(window, 'unroundedMinimapViewport') as () => MinimapViewportPercent)();
    const polygons = [...document.querySelectorAll<SVGPolygonElement>('.room-template-world-ghost polygon')];
    const points = polygons.flatMap(polygon => [...polygon.points].map(p => {
      const shown = new DOMPoint(p.x, p.y).matrixTransform(polygon.getScreenCTM()!);
      return { x: shown.x, y: shown.y };
    }));
    return { canvas: { width: canvas.width, height: canvas.height, left: box.left, top: box.top, widthCss: box.width, heightCss: box.height },
      map: { width: map.width, height: map.height }, left: fraction('left'), top: fraction('top'), width: fraction('width'), height: fraction('height'), unrounded,
      first: [...polygons[0]!.points].map(p => { const shown = new DOMPoint(p.x, p.y).matrixTransform(polygons[0]!.getScreenCTM()!); return { x: shown.x, y: shown.y }; }),
      bounds: { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) } };
  });
  expect(measured.map).toEqual({ width: 32, height: 32 });
  expect(measured.left).toBeGreaterThan(0);
  expect(measured.top).toBeGreaterThan(0);
  expect(measured.left + measured.width).toBeLessThan(1);
  expect(measured.top + measured.height).toBeLessThan(1);
  expect(measured.canvas.width / (measured.width * measured.map.width * 64)).toBeCloseTo(1.25, 5);
  expect(measured.canvas.height / (measured.height * measured.map.height * 64)).toBeCloseTo(1.25, 5);
  const { zoomX, zoomY, screen } = minimapGroundReference(measured.canvas, measured.map, measured.unrounded);
  expect(zoomX).toBeCloseTo(1.25, 5); expect(zoomY).toBeCloseTo(1.25, 5);
  // Display serialization must remain faithful at its own percentage precision.
  for (const field of ['left', 'top', 'width', 'height'] as const) expect(measured[field] * 100).toBeCloseTo(measured.unrounded[field], 3);
  const { x, y } = chosen.target.origin;
  const expected = [screen(x, y), screen(x + 4, y), screen(x + 4, y + 7), screen(x, y + 7)];
  const actual = [{ x: measured.bounds.left, y: measured.bounds.top }, { x: measured.bounds.right, y: measured.bounds.top },
    { x: measured.bounds.right, y: measured.bounds.bottom }, { x: measured.bounds.left, y: measured.bounds.bottom }];
  console.log('WORLD_ROOM_PLAN_CAMERA_REFERENCE', JSON.stringify({ uiScale, chosen, measured, zoomX, zoomY, expected, actual }));
  for (let i = 0; i < 4; i++) {
    expect(actual[i]!.x).toBeCloseTo(expected[i]!.x, 3);
    expect(actual[i]!.y).toBeCloseTo(expected[i]!.y, 3);
  }
  expect(cursor.x).toBeGreaterThanOrEqual(measured.first[0]!.x);
  expect(cursor.x).toBeLessThan(measured.first[2]!.x);
  expect(cursor.y).toBeGreaterThanOrEqual(measured.first[0]!.y);
  expect(cursor.y).toBeLessThan(measured.first[2]!.y);
  expect((await sentCommands(page)).filter(command => /^(Place|Build|Remove)/u.test(String(command.type)))).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('zoomed-world-whole-footprint.png') });
  await page.mouse.click(cursor.x, cursor.y);
  await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toMatchObject([
    { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: chosen.target.origin },
  ]);
  await expect(ghost).toBeHidden();
  expect((await sentCommands(page)).filter(command => /^(Place|Build|Remove)/u.test(String(command.type)))).toHaveLength(1);
  console.log('WORLD_ROOM_PLAN_CAMERA_ORIGIN', JSON.stringify({ uiScale, chosen, zoomX, zoomY, expected, actual, first: measured.first }));
});
