import { expect, type Page } from '../../../tests/browser/network-changed-fixture';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { sessionSnapshotBundleFromTransport, type SessionSnapshotBundle } from '../../../src/simulation/runtime/restore-session';
import { decodeWorkerToMainMessage } from '../../../src/simulation/protocol/decode';
import { minimapGroundReference, type MinimapViewportPercent } from '../../../tests/browser/minimap-unrounded-reference';

/** Genuine read-only worker snapshot, with explicit V10 domain ownership.
 * Both scoped native cases retain the entire reply before any version check.
 * No conversion of exact tokens or selected-field substitute for whole equality.
 */
export async function readV10WholeSnapshot(page: Page, path?: string): Promise<SessionSnapshotBundle> {
  const raw = await page.evaluate(async () => {
    const read = Reflect.get(window, 'showcaseRead') as
      (kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' }) => Promise<unknown>;
    return read('simulation/request-snapshot', { reason: 'consistency-check' });
  });
  if (path !== undefined) await writeFile(path, JSON.stringify(raw, null, 2));
  const decoded = decodeWorkerToMainMessage(raw);
  expect(decoded.ok, 'actual worker snapshot must decode under the production envelope').toBe(true);
  if (!decoded.ok || decoded.value.kind !== 'simulation/snapshot') throw new Error('Actual V10 worker snapshot absent');
  expect(decoded.value.protocolVersion).toBe(1);
  expect(decoded.value.payload.snapshot.schemaId).toBe('simulation-save-payload');
  expect(decoded.value.payload.snapshot.schemaVersion).toBe(4);
  if (decoded.value.payload.snapshot.transport !== 'structured-clone') throw new Error('Actual JSON-safe snapshot transport absent');
  return sessionSnapshotBundleFromTransport(decoded.value.payload.snapshot.data);
}

interface Trace {
  requests: { messageId: string; payload: { projectionId: string; target: { definitionId?: string; anchor?: { x: number; y: number }; quarterTurns?: number } } }[];
  replies: unknown[];
  clicks: { className: string; trusted: boolean; detail: number }[];
  keys: { code: string; trusted: boolean; rotateFocused: boolean }[];
  mouse: { type: string; x: number; y: number; buttons: number; trusted: boolean; canvas: boolean }[];
}

/** Records genuine traffic/input only: no delayed, injected or replayed verdict. */
export async function observeRotation(page: Page) {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const trace: Trace = { requests: [], replies: [], clicks: [], keys: [], mouse: [] };
    class Observer extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', event => {
          if (event.data?.kind === 'simulation/projection' && event.data.payload?.projectionId === 'world/object-placement-preflight') trace.replies.push(event.data);
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        const request = message as Trace['requests'][number] & { kind?: string };
        if (request.kind === 'simulation/request-projection' && request.payload.projectionId === 'world/object-placement-preflight') trace.requests.push(request);
        if (transfer === undefined) super.postMessage(message); else if (Array.isArray(transfer)) super.postMessage(message, transfer); else super.postMessage(message, transfer);
      }
    }
    Reflect.set(window, 'Worker', Observer); Reflect.set(window, 'rotationReviewTrace', trace);
    for (const type of ['mousedown', 'mouseup']) window.addEventListener(type, event => {
      const mouse = event as MouseEvent; trace.mouse.push({ type, x: mouse.clientX, y: mouse.clientY, buttons: mouse.buttons,
        trusted: mouse.isTrusted, canvas: mouse.target === document.querySelector('#game-root canvas') });
    }, true);
    window.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (button?.classList.contains('hud-build__rotate-object')) trace.clicks.push({ className: button.className, trusted: event.isTrusted, detail: event.detail });
    }, true);
    window.addEventListener('keydown', event => {
      if (['Enter', 'Space', 'KeyR'].includes(event.code)) trace.keys.push({ code: event.code, trusted: event.isTrusted,
        rotateFocused: document.activeElement?.classList.contains('hud-build__rotate-object') === true });
    }, true);
  });
}
export const traceRotation = (page: Page): Promise<Trace> => page.evaluate(() => Reflect.get(window, 'rotationReviewTrace') as Trace);

export async function actualVerdict(page: Page, anchor: { x: number; y: number }, quarterTurns: number) {
  const trace = await traceRotation(page);
  const request = trace.requests.filter(({ payload: { target } }) => target.definitionId === 'desk-wooden' &&
    target.anchor?.x === anchor.x && target.anchor.y === anchor.y && (target.quarterTurns ?? 0) === quarterTurns).at(-1);
  if (request === undefined) return undefined;
  const raw = trace.replies.find(reply => (reply as { replyTo?: string }).replyTo === request.messageId);
  if (raw === undefined) return undefined;
  const decoded = decodeWorkerToMainMessage(raw); expect(decoded.ok).toBe(true);
  if (!decoded.ok || decoded.value.kind !== 'simulation/projection') throw new Error('Actual correlated object reply absent');
  expect(decoded.value.payload.view?.schemaId).toBe('object-placement-preflight');
  expect(decoded.value.payload.view?.schemaVersion).toBe(1);
  return decoded.value.payload.view?.data;
}

export async function groundPoint(page: Page, anchor: { x: number; y: number }) {
  const measured = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas')!, box = canvas.getBoundingClientRect();
    const map = document.querySelector<HTMLCanvasElement>('.hud-minimap canvas')!;
    return { canvas: { width: canvas.width, height: canvas.height, left: box.left, top: box.top, widthCss: box.width, heightCss: box.height },
      map: { width: map.width, height: map.height }, percent: (Reflect.get(window, 'unroundedMinimapViewport') as () => MinimapViewportPercent)() };
  });
  expect(measured.map).toEqual({ width: 32, height: 32 });
  const point = minimapGroundReference(measured.canvas, measured.map, measured.percent).screen(anchor.x + .25, anchor.y + .25);
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), point)).toBe(true);
  return { measured, point, reference: minimapGroundReference(measured.canvas, measured.map, measured.percent) };
}

const requirePlaywright = createRequire(createRequire(import.meta.url).resolve('@playwright/test/package.json'));
const { PNG } = requirePlaywright('playwright-core/lib/utilsBundle') as { PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } } };
export function changedPixels(first: Buffer, second: Buffer) {
  const a = PNG.sync.read(first), b = PNG.sync.read(second);
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let changed = 0;
  for (let offset = 0; offset < a.data.length; offset += 4)
    if (a.data[offset] !== b.data[offset] || a.data[offset + 1] !== b.data[offset + 1] || a.data[offset + 2] !== b.data[offset + 2]) changed++;
  return { width: a.width, height: a.height, changed };
}

/** One read of all four actual boxes, text ink/scroll, flex and clipping facts. */
export async function actionGeometry(page: Page) {
  return page.locator('.hud-build__actions').evaluate(row => {
    const bounds = (box: DOMRect) => ({ x: box.x, y: box.y, width: box.width, height: box.height });
    const panel = row.closest('.hud-build')!.getBoundingClientRect(), box = row.getBoundingClientRect(), css = getComputedStyle(row);
    const visible = Array.from(row.querySelectorAll<HTMLButtonElement>('button')).filter(button => button.getClientRects().length > 0);
    const flowButtons = visible.filter(button => !['absolute', 'fixed'].includes(getComputedStyle(button).position));
    const flowWidth = flowButtons.reduce((sum, button) => sum + button.getBoundingClientRect().width, 0) + Math.max(0, flowButtons.length - 1) * Number.parseFloat(css.columnGap);
    const allocations = ['.hud__rail', '.hud__side', '.hud-build', '.hud-build > .ui-panel__body', '.hud-build__catalogue', '.hud-build__list', '.hud-build__map', '.save-panel'].map(selector => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) return { selector, absent: true };
      const b = element.getBoundingClientRect(), style = getComputedStyle(element);
      return { selector, ...bounds(b), minimumHeight: style.minHeight, maximumHeight: style.maxHeight, heightRule: style.height,
        position: style.position, flexBasis: style.flexBasis, flexGrow: style.flexGrow, flexShrink: style.flexShrink,
        overflowY: style.overflowY, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop,
        insideViewport: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight };
    });
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, visualScale: visualViewport?.scale },
      uiScale: document.documentElement.dataset['uiScaleStep'], row: bounds(box), panel: bounds(panel), gap: Number.parseFloat(css.columnGap), flexWrap: css.flexWrap,
      flowWidth, flowButtonCount: flowButtons.length, overflowWidth: Math.max(0, flowWidth - box.width), allocations,
      buttons: visible.map(button => {
        const b = button.getBoundingClientRect(), label = button.querySelector<HTMLElement>('.ui-action__label')!, l = label.getBoundingClientRect(), style = getComputedStyle(button);
        const range = document.createRange(); range.selectNodeContents(label);
        const ink = Array.from(range.getClientRects()).map(bounds), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return { className: button.className, text: button.textContent, ...bounds(b), minimumHeight: Number.parseFloat(style.minHeight),
          position: style.position, minWidth: style.minWidth, flexBasis: style.flexBasis, flexGrow: style.flexGrow, flexShrink: style.flexShrink,
          padding: [style.paddingLeft, style.paddingRight], labelStyle: { whiteSpace: getComputedStyle(label).whiteSpace,
            overflowWrap: getComputedStyle(label).overflowWrap }, ink,
          insideRow: b.left >= box.left && b.right <= box.right,
          insidePanel: b.top >= panel.top && b.bottom <= panel.bottom,
          insideViewport: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
          labelInside: l.left >= b.left && l.right <= b.right && l.top >= b.top && l.bottom <= b.bottom,
          inkInside: ink.every(i => i.x >= b.left && i.y >= b.top && i.x + i.width <= b.right && i.y + i.height <= b.bottom),
          labelFits: label.scrollWidth <= label.clientWidth && label.scrollHeight <= label.clientHeight,
          hit: hit === button || button.contains(hit) };
      }) };
  });
}
