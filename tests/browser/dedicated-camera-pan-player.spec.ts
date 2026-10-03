import { expect, test, type Page } from './network-changed-fixture';
import { openCameraControls } from './public-camera-controls';
import { installTee, sentCommands } from './playtest-harness';
import { observeUnroundedMinimapViewport, type MinimapViewportPercent } from './minimap-unrounded-reference';

type Mode = 'world' | 'oblique';
type Direction = 'right' | 'left' | 'down' | 'up';
interface Target { templateId: string; origin: { x: number; y: number }; mirrorX?: boolean; quarterTurns?: number }
interface Receipt { target: Target; ok: boolean }
interface PanEvent { direction: string; trusted: boolean; detail: number; x: number; y: number }
interface View {
  percent: MinimapViewportPercent;
  css: { left: number; top: number; width: number; height: number };
  canvas: { width: number; height: number; left: number; top: number; widthCss: number; heightCss: number };
  map: { width: number; height: number };
}
const directions: readonly Direction[] = ['right', 'left', 'down', 'up'];
const pan = (page: Page, direction: Direction) => page.getByRole('button', { name: `Pan camera ${direction}`, exact: true });
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

async function observeNativeInputAndPreflight(page: Page, uiScale: number): Promise<void> {
  await page.addInitScript(scale => {
    localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
    const clicks: PanEvent[] = [];
    const pointers: Array<{ type: string; x: number; y: number; trusted: boolean; canvas: boolean }> = [];
    Reflect.set(window, 'dedicatedPanClicks', clicks);
    Reflect.set(window, 'dedicatedPanPointers', pointers);
    window.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.hud-camera-pan button') : null;
      if (button !== null) clicks.push({ direction: button.dataset.cameraPanDirection!, trusted: event.isTrusted, detail: event.detail, x: event.clientX, y: event.clientY });
    }, true);
    for (const type of ['pointermove', 'pointerdown', 'pointerup']) window.addEventListener(type, event => {
      const pointer = event as PointerEvent;
      pointers.push({ type, x: pointer.clientX, y: pointer.clientY, trusted: event.isTrusted, canvas: event.target === document.querySelector('#game-root canvas') });
    }, true);
    // Observe real requests/replies only. No simulated verdict, delay, state,
    // scene reference or replacement of the worker's actual messages.
    const RealWorker = Worker;
    const targets = new Map<string, Target>();
    const receipts: Receipt[] = [];
    class ObservedWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const reply = event.data as { kind?: string; replyTo?: string; payload?: { view?: { data?: { ok: boolean } } } };
          const target = targets.get(reply.replyTo ?? '');
          if (target !== undefined && reply.kind === 'simulation/projection' && reply.payload?.view?.data !== undefined) {
            receipts.push({ target, ok: reply.payload.view.data.ok });
            targets.delete(reply.replyTo!);
          }
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const request = message as { messageId?: string; payload?: { projectionId?: string; target?: Target } };
        if (request.messageId !== undefined && request.payload?.projectionId === 'world/room-template-preflight' && request.payload.target !== undefined) targets.set(request.messageId, request.payload.target);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    window.Worker = ObservedWorker as typeof Worker;
    Reflect.set(window, 'dedicatedPanPreflight', receipts);
  }, uiScale);
}

async function view(page: Page): Promise<View> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas')!;
    const map = document.querySelector<HTMLCanvasElement>('.hud-minimap__canvas')!;
    const viewport = document.querySelector<HTMLElement>('.hud-minimap__viewport')!;
    const bounds = canvas.getBoundingClientRect();
    return {
      percent: (Reflect.get(window, 'unroundedMinimapViewport') as () => MinimapViewportPercent)(),
      css: { left: parseFloat(viewport.style.left), top: parseFloat(viewport.style.top), width: parseFloat(viewport.style.width), height: parseFloat(viewport.style.height) },
      canvas: { width: canvas.width, height: canvas.height, left: bounds.left, top: bounds.top, widthCss: bounds.width, heightCss: bounds.height },
      map: { width: map.width, height: map.height },
    };
  });
}
function assertUnclipped(measured: View): void {
  expect(measured.map).toEqual({ width: 32, height: 32 });
  expect(measured.percent.left).toBeGreaterThan(0);
  expect(measured.percent.top).toBeGreaterThan(0);
  expect(measured.percent.left + measured.percent.width).toBeLessThan(100);
  expect(measured.percent.top + measured.percent.height).toBeLessThan(100);
  // Retain native CSS serialization as a separate, lower-precision diagnostic.
  for (const field of ['left', 'top', 'width', 'height'] as const) expect(measured.css[field]).toBeCloseTo(measured.percent[field], 3);
}
function centre(measured: View): { x: number; y: number } {
  return { x: (measured.percent.left + measured.percent.width / 2) / 100 * measured.map.width * 64,
    y: (measured.percent.top + measured.percent.height / 2) / 100 * measured.map.height * 64 };
}
/** Independent screen basis/inverse, never the scene's projector or the SVG. */
function expectedGroundStep(mode: Mode, direction: Direction, measured: View): { x: number; y: number } {
  const dx = direction === 'right' ? 128 : direction === 'left' ? -128 : 0;
  const dy = direction === 'down' ? 128 : direction === 'up' ? -128 : 0;
  const worldWidth = measured.percent.width / 100 * measured.map.width * 64;
  const worldHeight = measured.percent.height / 100 * measured.map.height * 64;
  if (mode === 'world') return { x: dx * worldWidth / measured.canvas.widthCss, y: dy * worldHeight / measured.canvas.heightCss };
  // Fresh Angled view has the supported -45 degree yaw / 45 degree elevation.
  // Infer zoom independently from the unclipped public ground AABB. Solve the
  // 2x2 screen basis; do not import production screenToGround/groundToScreen.
  const c = Math.cos(-Math.PI / 4), s = Math.sin(-Math.PI / 4), h = Math.sin(Math.PI / 4);
  const zoomX = (Math.abs(c) * measured.canvas.width + Math.abs(s) * measured.canvas.height / h) / worldWidth;
  const zoomY = (Math.abs(s) * measured.canvas.width + Math.abs(c) * measured.canvas.height / h) / worldHeight;
  expect(zoomX).toBeCloseTo(zoomY, 9);
  const a = c * zoomX, b = -s * zoomX, d = s * h * zoomX, e = c * h * zoomX;
  const determinant = a * e - b * d;
  const logicalX = dx * measured.canvas.width / measured.canvas.widthCss;
  const logicalY = dy * measured.canvas.height / measured.canvas.heightCss;
  return { x: (e * logicalX - b * logicalY) / determinant, y: (a * logicalY - d * logicalX) / determinant };
}
function worldCursorOrigin(measured: View, cursor: { x: number; y: number }): { x: number; y: number } {
  const ground = centre(measured);
  return { x: Math.floor((ground.x + (cursor.x - measured.canvas.left - measured.canvas.widthCss / 2) * measured.percent.width / 100 * measured.map.width * 64 / measured.canvas.widthCss) / 64),
    y: Math.floor((ground.y + (cursor.y - measured.canvas.top - measured.canvas.heightCss / 2) * measured.percent.height / 100 * measured.map.height * 64 / measured.canvas.heightCss) / 64) };
}
async function receipt(page: Page): Promise<Receipt> {
  return page.evaluate(() => (Reflect.get(window, 'dedicatedPanPreflight') as Receipt[]).at(-1)!);
}

for (const mode of ['world', 'oblique'] as const) for (const uiScale of [1, 2]) {
  test(`${mode} FullHD ${uiScale * 100}% four physical pan controls and armed room-plan confirmation`, async ({ page }, testInfo) => {
    await installTee(page);
    await observeNativeInputAndPreflight(page, uiScale);
    await page.addInitScript(observeUnroundedMinimapViewport);
    // Accessibility UI scale is not browser/page zoom: both cases remain a
    // physical 1920x1080 CSS viewport with visualViewport.scale === 1.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(mode === 'world' ? '/' : '/?renderer=oblique');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, zoom: visualViewport!.scale,
      uiScale: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) }))).toEqual({ width: 1920, height: 1080, zoom: 1, uiScale });
    await expect(page.locator('#game-root canvas')).toBeVisible();
    await expect(page.locator('.hud-minimap__viewport')).toBeVisible();
    await openCameraControls(page);
    await expect(page.locator('.hud-camera-pan button')).toHaveCount(4);
    // Keep all four movement observations strictly inside the map. Clipped
    // minimap boxes cannot serve as a precise camera-ground reference.
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await frames(page);
    const initial = await view(page); assertUnclipped(initial);
    const commands = await sentCommands(page);
    const movement: unknown[] = [];
    for (const [index, direction] of directions.entries()) {
      const button = pan(page, direction);
      await expect(button).toBeVisible(); await expect(button).toBeEnabled();
      const hit = await button.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const x = Math.floor(bounds.left + bounds.width / 2), y = Math.floor(bounds.top + bounds.height / 2);
        const target = document.elementFromPoint(x, y);
        return { x, y, left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height,
          reachable: target === element || (target !== null && element.contains(target)), tap: parseFloat(getComputedStyle(element).getPropertyValue('--tap-target')) };
      });
      expect(hit.reachable, `${direction} button centre is the actual physical hit target`).toBe(true);
      expect(hit.left).toBeGreaterThanOrEqual(0); expect(hit.top).toBeGreaterThanOrEqual(0);
      expect(hit.right).toBeLessThanOrEqual(1920); expect(hit.bottom).toBeLessThanOrEqual(1080);
      expect(hit.tap).toBe(44 * uiScale); expect(hit.width).toBeGreaterThanOrEqual(hit.tap); expect(hit.height).toBeGreaterThanOrEqual(hit.tap);
      const before = await view(page); assertUnclipped(before);
      const prior = centre(before), delta = expectedGroundStep(mode, direction, before);
      // Native mouse input at the independently hit-tested physical centre;
      // never dispatchEvent, element.click(), forced locator click or CDP state.
      await page.mouse.click(hit.x, hit.y);
      await expect.poll(async () => {
        const current = centre(await view(page));
        return Math.max(Math.abs(current.x - prior.x - delta.x), Math.abs(current.y - prior.y - delta.y));
      }).toBeLessThan(0.0005);
      const after = await view(page); assertUnclipped(after);
      const current = centre(after);
      expect(current.x - prior.x).toBeCloseTo(delta.x, 3);
      expect(current.y - prior.y).toBeCloseTo(delta.y, 3);
      expect(after.percent.width).toBeCloseTo(before.percent.width, 9);
      expect(after.percent.height).toBeCloseTo(before.percent.height, 9);
      const clicks = await page.evaluate(() => Reflect.get(window, 'dedicatedPanClicks') as PanEvent[]);
      expect(clicks).toHaveLength(index + 1);
      expect(clicks.at(-1)).toEqual({ direction, trusted: true, detail: 1, x: hit.x, y: hit.y });
      expect(await sentCommands(page), 'HUD camera navigation must not post a simulation pan/build command').toEqual(commands);
      movement.push({ direction, hit, before, delta, after, event: clicks.at(-1) });
      if (index === 1 || index === 3) {
        expect(current.x).toBeCloseTo(centre(initial).x, 3);
        expect(current.y).toBeCloseTo(centre(initial).y, 3);
      }
    }
    await page.screenshot({ path: testInfo.outputPath('four-physical-pan-controls.png') });

    // Pointer movement into HUD intentionally withdraws the template hover.
    // Test stationary-cursor Build continuity using native Enter instead; the
    // same four real buttons/callbacks still run, without manufacturing hover.
    if (mode === 'world') await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    if (mode === 'world' && uiScale === 2) {
      // At UI200 the physical strip ends at258px and the safe map column is
      // narrow. Use an actual small Cell and a genuine minimap recenter to put
      // its entire aligned footprint inside that column, never fake hover.
      const map = page.locator('.hud-minimap__canvas');
      const bounds = await map.boundingBox(); expect(bounds).not.toBeNull();
      await map.click({ position: { x: bounds!.width * 16.25 / 32, y: bounds!.height / 2 } });
      await frames(page);
    }
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const open = page.getByRole('button', { name: 'Room plans', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    const cursor = mode === 'world' ? (uiScale === 2 ? { x: 885, y: 350 } : { x: 700, y: 240 }) : { x: 740, y: 420 };
    const plan = mode === 'world' && uiScale === 1 ? { name: 'Yard', id: 'yard-basic', count: 64 } : { name: 'Basic cell', id: 'cell-basic', count: 28 };
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), cursor)).toBe(true);
    await page.mouse.move(cursor.x, cursor.y); await frames(page);
    const marker = await page.evaluate(() => (Reflect.get(window, 'dedicatedPanPointers') as unknown[]).length);
    const beforeArm = await view(page);
    await open.focus(); await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: plan.name, exact: true }).focus(); await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    const ghost = page.locator('.room-template-world-ghost');
    const floor = ghost.locator('polygon');
    await expect(ghost).toBeVisible(); await expect(floor).toHaveCount(plan.count);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    const chosen = await receipt(page);
    const armedView = await view(page);
    if (mode === 'world') {
      assertUnclipped(armedView);
      expect(chosen.target.origin).toEqual(worldCursorOrigin(armedView, cursor));
    } else expect(armedView.percent, 'this Cell must exercise an actual full-footprint camera fit').not.toEqual(beforeArm.percent);
    expect(chosen).toMatchObject({ ok: true, target: { templateId: plan.id } });
    const quote = await ghost.getByRole('status').textContent();
    expect(quote).toContain('Materials catalogue value:');
    const beforeKeyboard = await sentCommands(page);
    const armed: unknown[] = [];
    for (const direction of directions) {
      await pan(page, direction).focus(); await page.keyboard.press('Enter'); await frames(page);
      await expect(ghost).toBeVisible(); await expect(floor).toHaveCount(plan.count);
      await expect(ghost).toHaveAttribute('data-ready', 'clear');
      expect(await ghost.getByRole('status').textContent()).toBe(quote);
      if (mode === 'world') {
        const currentView = await view(page); assertUnclipped(currentView);
        await expect.poll(async () => (await receipt(page)).target.origin).toEqual(worldCursorOrigin(currentView, cursor));
      }
      const actual = await receipt(page);
      expect(actual).toMatchObject({ ok: true, target: { templateId: plan.id } });
      // World has no auto-fit origin lock; its ordinary stationary picking
      // follows navigation, then reverses. Angled's fitted origin stays fixed.
      if (mode === 'oblique' || direction === 'left' || direction === 'up') expect(actual.target).toEqual(chosen.target);
      expect(await sentCommands(page)).toEqual(beforeKeyboard);
      armed.push({ direction, actual, quote: await ghost.getByRole('status').textContent() });
    }
    const displayed = await receipt(page);
    expect(displayed.target).toEqual(chosen.target);
    // All occupied squares, including their perimeter, must be physically
    // visible in the accepted safe map area after reversing the pan steps.
    expect(await floor.evaluateAll(polygons => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const left = Math.max(box('.hud__tabs').right, box('.hud__corner').right) + 7;
      const right = box('.hud__rail').left - 7, top = box('.hud-strip').bottom + 7;
      return polygons.every(polygon => { const r = polygon.getBoundingClientRect(); return r.left >= left && r.right <= right && r.top >= top && r.bottom <= innerHeight - 7; });
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('armed-whole-footprint-after-pan.png') });
    // Same physical pointer acknowledges the displayed footprint. Its down/up
    // must neither buy at a newly repicked origin nor post a second command.
    await page.mouse.down(); await frames(page);
    expect((await receipt(page)).target).toEqual(displayed.target);
    expect(await ghost.getByRole('status').textContent()).toBe(quote);
    expect(await sentCommands(page)).toEqual(beforeKeyboard);
    await page.mouse.up();
    await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toEqual([
      { type: 'PlaceRoomTemplate', templateId: plan.id, origin: displayed.target.origin },
    ]);
    await expect(ghost).toBeHidden();
    expect((await sentCommands(page)).filter(command => /^(Place|Build|Remove)/u.test(String(command.type)))).toHaveLength(1);
    const events = await page.evaluate(mark => (Reflect.get(window, 'dedicatedPanPointers') as Array<{ type: string; x: number; y: number; trusted: boolean; canvas: boolean }>).slice(mark), marker);
    expect(events.filter(event => event.type !== 'pointermove')).toEqual([
      { type: 'pointerdown', ...cursor, trusted: true, canvas: true }, { type: 'pointerup', ...cursor, trusted: true, canvas: true },
    ]);
    expect(events.every(event => event.x === cursor.x && event.y === cursor.y && event.trusted && event.canvas)).toBe(true);
    const clicks = await page.evaluate(() => Reflect.get(window, 'dedicatedPanClicks') as PanEvent[]);
    expect(clicks.slice(4).map(({ direction, trusted, detail }) => ({ direction, trusted, detail }))).toEqual(directions.map(direction => ({ direction, trusted: true, detail: 0 })));
    await testInfo.attach('independent-pan-and-worker-evidence', { body: Buffer.from(JSON.stringify({ mode, uiScale, movement, chosen, armed, displayed, clicks, events, commands: await sentCommands(page) }, null, 2)), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('actual-room-plan-confirmed.png') });
  });
}
