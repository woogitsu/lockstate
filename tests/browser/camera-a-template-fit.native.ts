import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { installShowcaseReadProbe } from './native-small-prison-showcase-evidence';
import { readV10WholeSnapshot } from '../../docs/research/2026-10-03-approved-individual-object-rotate/native-evidence';
import { pressCameraControl, readCameraLayout } from '../../docs/research/2026-10-03-camera-a-scale-fit/camera-controls-read';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import type { RoomTemplatePlacementRequest } from '../../src/ui/room-template-tool';

if (process.env['LOCKSTATE_TEMPLATE_FIT_NATIVE'] !== '1') throw Error('Explicit opt-in required: LOCKSTATE_TEMPLATE_FIT_NATIVE=1');

interface Request { messageId: string; payload: { projectionId: string; target?: RoomTemplatePlacementRequest }; }
interface Trace {
  requests: Request[]; replies: unknown[]; workerUrls: string[];
  pointer: { type: string; x: number; y: number; trusted: boolean; canvas: boolean }[];
}
async function observe(page: Page) {
  await page.addInitScript(() => {
    const OriginalWorker = Worker;
    const trace: Trace = { requests: [], replies: [], workerUrls: [], pointer: [] };
    class ObservedWorker extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); trace.workerUrls.push(String(url));
        super.addEventListener('message', event => {
          if (event.data?.kind === 'simulation/projection' &&
            ['world/room-template-preflight', 'world/room-template-cost'].includes(event.data.payload?.projectionId)) trace.replies.push(event.data);
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        const request = message as Request & { kind?: string };
        if (request.kind === 'simulation/request-projection' &&
          ['world/room-template-preflight', 'world/room-template-cost'].includes(request.payload.projectionId)) trace.requests.push(request);
        if (transfer === undefined) super.postMessage(message); else if (Array.isArray(transfer)) super.postMessage(message, transfer); else super.postMessage(message, transfer);
      }
    }
    Reflect.set(window, 'Worker', ObservedWorker); Reflect.set(window, 'templateFitTrace', trace);
    for (const type of ['pointermove', 'pointerdown', 'pointerup']) window.addEventListener(type, event => {
      const pointer = event as PointerEvent;
      trace.pointer.push({ type, x: pointer.clientX, y: pointer.clientY, trusted: pointer.isTrusted,
        canvas: pointer.target === document.querySelector('#game-root canvas') });
    }, true);
  });
}
const trace = (page: Page): Promise<Trace> => page.evaluate(() => Reflect.get(window, 'templateFitTrace') as Trace);
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
async function verdict(page: Page, projectionId: string) {
  const observed = await trace(page), request = observed.requests.filter(r => r.payload.projectionId === projectionId).at(-1);
  if (request === undefined) return undefined;
  const reply = observed.replies.find(raw => (raw as { replyTo?: string }).replyTo === request.messageId);
  if (reply === undefined) return undefined;
  const decoded = decodeWorkerToMainMessage(reply);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok || decoded.value.kind !== 'simulation/projection' || decoded.value.payload.view === undefined) throw Error('Actual worker projection absent');
  expect(decoded.value.payload.projectionId).toBe(projectionId);
  return { target: request.payload.target, data: decoded.value.payload.view.data };
}
async function geometry(page: Page) {
  return page.locator('.room-template-world-ghost svg').evaluate(svg => {
    if (!(svg instanceof SVGSVGElement)) throw Error('Actual ghost SVG absent');
    const matrix = svg.getScreenCTM(); if (matrix === null) throw Error('Actual ghost screen matrix absent');
    const polygons = [...svg.querySelectorAll('polygon')].map(polygon => {
      const points = (polygon.getAttribute('points') ?? '').split(' ').map(point => point.split(',').map(Number));
      return { points, screen: points.map(p => { const v = new DOMPoint(p[0], p[1]).matrixTransform(matrix); return { x: v.x, y: v.y }; }) };
    });
    const occluders = ['.hud-camera-panel', '.hud__unavailable', '.hud__refusal', '.hud__event', '.hud__tabs', '.hud__corner', '.hud__rail', '.hud-strip']
      .flatMap(selector => {
        const node = document.querySelector(selector), r = node?.getBoundingClientRect();
        return r === undefined || r.width <= 0 || r.height <= 0 ? [] : [{ selector, left: r.left, right: r.right, top: r.top, bottom: r.bottom }];
      });
    return { polygons, occluders, viewport: { width: innerWidth, height: innerHeight, zoom: visualViewport!.scale,
      uiScale: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) } };
  });
}
function assertWholeExposed(value: Awaited<ReturnType<typeof geometry>>, yaw: number) {
  expect(value.polygons).toHaveLength(28);
  const first = value.polygons[0]!.points, base = first[0]!, u = [first[1]![0]! - base[0]!, first[1]![1]! - base[1]!],
    v = [first[3]![0]! - base[0]!, first[3]![1]! - base[1]!];
  const horizontal = Math.hypot(u[0]!, v[0]!), vertical = Math.hypot(u[1]!, v[1]!);
  const measuredPose = { yaw: Math.atan2(-v[0]!, u[0]!) * 180 / Math.PI,
    elevation: Math.asin(vertical / horizontal) * 180 / Math.PI, zoom: horizontal / 64 };
  expect(measuredPose.yaw).toBeCloseTo(yaw, 5); expect(measuredPose.elevation).toBeCloseTo(65, 5);
  for (const [index, polygon] of value.polygons.entries()) {
    expect(polygon.points).toHaveLength(4);
    for (let corner = 0; corner < 4; corner++) {
      const dx = index % 7 + [0, 1, 1, 0][corner]!, dy = Math.floor(index / 7) + [0, 0, 1, 1][corner]!;
      expect(polygon.points[corner]![0]).toBeCloseTo(base[0]! + dx * u[0]! + dy * v[0]!, 5);
      expect(polygon.points[corner]![1]).toBeCloseTo(base[1]! + dx * u[1]! + dy * v[1]!, 5);
    }
    const left = Math.min(...polygon.screen.map(p => p.x)), right = Math.max(...polygon.screen.map(p => p.x)),
      top = Math.min(...polygon.screen.map(p => p.y)), bottom = Math.max(...polygon.screen.map(p => p.y));
    expect(left).toBeGreaterThanOrEqual(0); expect(right).toBeLessThanOrEqual(1920);
    expect(top).toBeGreaterThanOrEqual(0); expect(bottom).toBeLessThanOrEqual(1080);
    for (const r of value.occluders) expect(right <= r.left || left >= r.right || bottom <= r.top || top >= r.bottom,
      `floor ${index} must not cross actual visible ${r.selector}`).toBe(true);
  }
  return measuredPose;
}

for (const uiScale of [1, 2] as const) test(`FullHD publicUI${uiScale * 100} open CameraA retains the whole q1 mirrored Basic cell on fit/disclosure/held release`, async ({ page }, info) => {
  const receipt: Record<string, unknown> = { sourceFix: '7654f78f5349dbc4911780560371641260c53cbe', uiScale,
    publicPoseRecipe: 'default -45/45, five Rotate camera right and two Raise camera; held sixth turn reaches45/65, not35 degrees' };
  try {
    await installTee(page); await installShowcaseReadProbe(page); await observe(page);
    await page.addInitScript(() => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: 1 }));
      localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'en' }));
    });
    await page.goto('/index.html'); await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    if (uiScale === 2) for (let step = 0; step < 6 && await page.locator('html').getAttribute('data-ui-scale-step') !== '200'; step++)
      await page.locator('.display-scale__cycle').click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-scale-step', String(uiScale * 100));
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click(); await page.locator('.hud-build__remove').click();
    const exposed = { x: 950, y: 500 };
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), exposed)).toBe(true);
    await page.mouse.click(exposed.x, exposed.y);
    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.getAttribute('aria-pressed') === 'true') await page.getByRole('button', { name: 'Play at normal speed', exact: true }).click();
    const band = page.locator('.hud__refusal'); await expect(band).toHaveAttribute('data-source', 'simulation');
    await expect(band).toContainText('Nothing was removed'); await pause.click(); await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.hud-build__remove').click();
    const panel = page.locator('.hud-camera-panel'), viewButton = page.getByRole('button', { name: 'View', exact: true });
    await expect(panel).toBeHidden(); await pressCameraControl(page, viewButton);
    const select = page.getByRole('combobox', { name: 'View', exact: true });
    await pressCameraControl(page, select); await page.keyboard.press('End'); await page.keyboard.press('Enter');
    await expect(select).toHaveValue('oblique'); await expect(select).toBeEnabled(); await expect(page.locator('.hud-camera-pose')).toBeVisible();
    const right = page.getByRole('button', { name: 'Rotate camera right', exact: true });
    for (let n = 0; n < 5; n++) await pressCameraControl(page, right);
    for (let n = 0; n < 2; n++) await pressCameraControl(page, page.getByRole('button', { name: 'Raise camera angle', exact: true }));
    const camera = await readCameraLayout(page); receipt['cameraBefore'] = camera;
    expect(camera.viewport).toEqual({ width: 1920, height: 1080, zoom: 1, uiScale });
    expect(camera.controls).toHaveLength(12);
    for (const c of camera.controls) { expect(c.width).toBeGreaterThanOrEqual(44 * uiScale); expect(c.height).toBeGreaterThanOrEqual(44 * uiScale); expect(c.reachable).toBe(true); }
    const before = await readV10WholeSnapshot(page, info.outputPath('whole-before-preview.json'));
    const commandsBefore = await sentCommands(page);
    const cursorSelection = await page.evaluate(() => {
      const canvas = document.querySelector('#game-root canvas');
      if (!(canvas instanceof HTMLCanvasElement)) throw Error('Actual game canvas absent');
      const r = canvas.getBoundingClientRect();
      const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
      const left = Math.max(r.left, box('.hud__tabs')?.right ?? r.left, box('.hud__corner')?.right ?? r.left) + 8;
      const right = Math.min(r.right, box('.hud__rail')?.left ?? r.right) - 8;
      const top = Math.max(r.top, box('.hud-strip')?.bottom ?? r.top) + 8, bottom = r.bottom - 8;
      if (right <= left || bottom <= top) throw Error('Actual exposed map corridor absent');
      const original = { x: 1000, y: 1000 };
      const originalExposed = original.x >= left && original.x <= right && original.y >= top && original.y <= bottom &&
        document.elementFromPoint(original.x, original.y) === canvas;
      const point = originalExposed ? original : { x: (left + right) / 2, y: Math.max(top, Math.min(bottom, r.bottom - 80)) };
      return { point, corridor: { left, right, top, bottom, width: right - left },
        retainedOriginalCursor: originalExposed, actualCanvasHit: document.elementFromPoint(point.x, point.y) === canvas };
    });
    receipt['cursorSelection'] = cursorSelection;
    const cursor = cursorSelection.point;
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), cursor)).toBe(true);
    await page.mouse.move(cursor.x, cursor.y); await frames(page);
    const open = page.getByRole('button', { name: 'Room plans', exact: true }); await open.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Room plans', exact: true });
    await dialog.getByRole('button', { name: 'Basic cell', exact: true }).focus(); await page.keyboard.press('Enter');
    const rotation = dialog.locator('select.hud-template__rotation'); await rotation.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
    await expect(rotation).toHaveValue('1');
    const mirror = dialog.getByRole('checkbox', { name: 'Mirror horizontally before rotation', exact: true }); await mirror.focus(); await page.keyboard.press('Space'); await expect(mirror).toBeChecked();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(dialog).toBeHidden();
    const ghost = page.locator('.room-template-world-ghost'); await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect.poll(async () => (await verdict(page, 'world/room-template-preflight'))?.data).toEqual({ ok: true });
    const chosen = (await verdict(page, 'world/room-template-preflight'))!.target!;
    expect(chosen).toMatchObject({ templateId: 'cell-basic', quarterTurns: 1, mirrorX: true });
    await expect.poll(async () => (await verdict(page, 'world/room-template-cost'))?.data).toEqual({ orderCount: 20,
      materials: [{ itemId: 'item.brick', quantity: 35 }, { itemId: 'item.wood-plank', quantity: 2 }], catalogueCostMinorUnits: 1530 });
    const quote = await ghost.getByRole('status').textContent(); expect(quote).toContain('Materials catalogue value: 1,530');
    const initial = await geometry(page); receipt['chosen'] = chosen; receipt['initial'] = initial; receipt['initialPose'] = assertWholeExposed(initial, 30);
    await page.screenshot({ path: info.outputPath('actual-open-camera-whole-q1-mirrored-preview.png') });
    expect(await sentCommands(page)).toEqual(commandsBefore);
    const marker = (await trace(page)).pointer.length;
    await page.mouse.down(); await frames(page);
    await right.focus(); await page.keyboard.press('Escape'); await expect(panel).toBeHidden();
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await page.keyboard.press('Enter'); await expect(panel).toBeVisible();
    await right.focus(); await page.keyboard.press('Enter'); await frames(page);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    expect((await verdict(page, 'world/room-template-preflight'))!.target).toEqual(chosen);
    expect(await ghost.getByRole('status').textContent()).toBe(quote);
    const held = await geometry(page); receipt['held'] = held; receipt['heldPose'] = assertWholeExposed(held, 45);
    expect(await sentCommands(page)).toEqual(commandsBefore);
    expect(await readV10WholeSnapshot(page, info.outputPath('whole-held-after-fit-disclosure.json'))).toEqual(before);
    await page.screenshot({ path: info.outputPath('actual-held-open-camera-yaw45-whole-q1.png') });
    await page.mouse.up(); await expect(ghost).toBeHidden();
    await expect.poll(async () => (await sentCommands(page)).slice(commandsBefore.length)).toEqual([
      { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: chosen.origin, mirrorX: true, quarterTurns: 1 },
    ]);
    const observed = await trace(page); receipt['trace'] = observed;
    expect(observed.pointer.slice(marker)).toEqual([
      { type: 'pointerdown', ...cursor, trusted: true, canvas: true }, { type: 'pointerup', ...cursor, trusted: true, canvas: true },
    ]);
    for (const url of observed.workerUrls) expect(new URL(url, page.url()).pathname).toMatch(/^\/assets\/worker-[^/]+\.js$/u);
    receipt['afterRelease'] = await readV10WholeSnapshot(page, info.outputPath('whole-after-original-release.json'));
    receipt['actualBuildReadout'] = await page.locator('.hud-strip').innerText();
    await page.screenshot({ path: info.outputPath('actual-original-release-confirmed.png') });
  } finally {
    receipt['terminalTrace'] = await trace(page).catch(error => ({ unavailable: String(error) }));
    await writeFile(info.outputPath('actual-camera-template-fit-receipt.json'), JSON.stringify(receipt, null, 2));
  }
});
