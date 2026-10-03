import { createRequire } from 'node:module';
import { expect, type Page } from '../../../tests/browser/network-changed-fixture';
import { minimapGroundReference, type MinimapViewportPercent } from '../../../tests/browser/minimap-unrounded-reference';
import { decodeWorkerToMainMessage } from '../../../src/simulation/protocol/decode';

export interface OrdinaryObjectTrace {
  epoch: number;
  sent: { epoch: number; message: { kind: string; messageId: string; payload: { projectionId?: string; target?: unknown } } }[];
  replies: { epoch: number; message: unknown }[];
  mouse: { type: string; x: number; y: number; button: number; buttons: number; trusted: boolean; canvas: boolean }[];
  keys: { key: string; trusted: boolean; button: boolean }[];
}

/** Passive observation only: never changes/replays/delays worker messages or writes game state. */
export async function installOrdinaryObjectObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const trace: OrdinaryObjectTrace = { epoch: 0, sent: [], replies: [], mouse: [], keys: [] };
    class ObservedWorker extends RealWorker {
      private readonly epoch: number;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); this.epoch = ++trace.epoch;
        super.addEventListener('message', event => {
          const message = event.data as { kind?: string; payload?: { projectionId?: string } };
          if (message.kind === 'simulation/projection' && message.payload?.projectionId === 'world/object-placement-preflight') {
            trace.replies.push({ epoch: this.epoch, message: event.data });
          }
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const envelope = message as OrdinaryObjectTrace['sent'][number]['message'];
        if (envelope.kind === 'simulation/request-projection' && envelope.payload.projectionId === 'world/object-placement-preflight')
          trace.sent.push({ epoch: this.epoch, message: envelope });
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    Reflect.set(window, 'Worker', ObservedWorker);
    Reflect.set(window, 'ordinaryObjectTrace', trace);
    for (const type of ['mousedown', 'mouseup', 'mousemove']) window.addEventListener(type, event => {
      const mouse = event as MouseEvent;
      trace.mouse.push({ type, x: mouse.clientX, y: mouse.clientY, button: mouse.button, buttons: mouse.buttons,
        trusted: mouse.isTrusted, canvas: mouse.target === document.querySelector('#game-root canvas') });
    }, true);
    window.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === 'Escape') trace.keys.push({ key: event.key,
        trusted: event.isTrusted, button: event.target instanceof HTMLButtonElement });
    }, true);
  });
}

export async function readTrace(page: Page): Promise<OrdinaryObjectTrace> {
  return page.evaluate(() => Reflect.get(window, 'ordinaryObjectTrace') as OrdinaryObjectTrace);
}

/** Match the real reply by request ID, current actual worker epoch and literal independently chosen anchor. */
export async function latestActualVerdict(page: Page, anchor: { x: number; y: number }) {
  const trace = await readTrace(page);
  const request = trace.sent.filter(entry => entry.epoch === trace.epoch &&
    JSON.stringify(entry.message.payload.target) === JSON.stringify({ kind: 'object-placement', definitionId: 'desk-wooden', anchor })).at(-1);
  if (request === undefined) return undefined;
  const found = trace.replies.find(entry => entry.epoch === trace.epoch &&
    (entry.message as { replyTo?: string }).replyTo === request.message.messageId);
  if (found === undefined) return undefined;
  const decoded = decodeWorkerToMainMessage(found.message);
  expect(decoded.ok, 'actual correlated worker preflight must satisfy the production wire decoder').toBe(true);
  if (!decoded.ok || decoded.value.kind !== 'simulation/projection') throw new Error('Actual object preflight refused');
  expect(decoded.value.payload.projectionId).toBe('world/object-placement-preflight');
  expect(decoded.value.payload.view?.schemaId).toBe('object-placement-preflight');
  expect(decoded.value.payload.view?.schemaVersion).toBe(1);
  return decoded.value.payload.view?.data;
}

export async function publicGroundReference(page: Page) {
  const actual = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas')!;
    const map = document.querySelector<HTMLCanvasElement>('.hud-minimap canvas')!;
    const box = canvas.getBoundingClientRect();
    return { canvas: { width: canvas.width, height: canvas.height, left: box.left, top: box.top,
      widthCss: box.width, heightCss: box.height }, map: { width: map.width, height: map.height },
      percent: (Reflect.get(window, 'unroundedMinimapViewport') as () => MinimapViewportPercent)() };
  });
  expect(actual.map).toEqual({ width: 32, height: 32 });
  return { actual, reference: minimapGroundReference(actual.canvas, actual.map, actual.percent) };
}

export async function keyboardActivate(page: Page, button: ReturnType<Page['getByRole']>): Promise<void> {
  await expect(button).toBeVisible(); await expect(button).toBeEnabled(); await button.focus();
  await expect(button).toBeFocused(); await page.keyboard.press('Enter');
  expect((await readTrace(page)).keys.at(-1)).toEqual({ key: 'Enter', trusted: true, button: true });
}

const requirePlaywright = createRequire(createRequire(import.meta.url).resolve('@playwright/test/package.json'));
const { PNG } = requirePlaywright('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } };
};

/** Paired actual anchor-square interiors. No arbitrary threshold or whole-image signature.
 * The claim occupies only the secondary square, so this untouched anchor interior
 * changes red-minus-blue only when the actual ghost consumer changes colour. */
export function redMinusBlue(png: Buffer): number {
  const image = PNG.sync.read(png);
  expect(image.width * image.height, 'measured visible anchor interior must contain real pixels').toBeGreaterThan(0);
  let sum = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) sum += image.data[offset]! - image.data[offset + 2]!;
  return sum / (image.width * image.height);
}
