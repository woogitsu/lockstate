import { expect, test, type Page } from './network-changed-fixture';
import { currentClock, installTee, sentCommands, type TeeWindow } from './playtest-harness';
import { minimapGroundReference, observeUnroundedMinimapViewport, type MinimapViewportPercent } from './minimap-unrounded-reference';

interface MouseReceipt { type: string; button: number; buttons: number; trusted: boolean; canvas: boolean }
interface NativeProbeWindow extends Window {
  ordinarySessionSnapshot?: () => Promise<{ orders: { id: string; definitionId: string; location: { x: number; y: number }; footprint?: string }[] }>;
  ordinarySessionMouse?: MouseReceipt[];
  ordinarySessionEnter?: { key: string; trusted: boolean; button: boolean }[];
}

// Observe the latest actual Worker. Snapshot requests are public read-only
// messages; initialization, shutdown, commands and clock stay product-owned.
async function installSnapshotProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let latest: Worker | undefined;
    const replies = new Map<string, (message: unknown) => void>();
    class ProbeWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); latest = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const replyTo = (event.data as { replyTo?: string }).replyTo;
          if (replyTo === undefined) return;
          const waiter = replies.get(replyTo);
          if (waiter === undefined) return;
          replies.delete(replyTo); waiter(event.data);
        });
      }
    }
    Reflect.set(window, 'Worker', ProbeWorker);
    (window as NativeProbeWindow).ordinarySessionSnapshot = async () => {
      const worker = latest;
      if (worker === undefined) throw new Error('Actual replacement worker absent');
      const messageId = crypto.randomUUID();
      const reply = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => { replies.delete(messageId); reject(new Error('Actual worker snapshot timed out')); }, 20_000);
        replies.set(messageId, value => { clearTimeout(timer); resolve(value); });
        worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
      }) as { kind: string; payload: { snapshot: { data: { construction: { orders: { id: string; definitionId: string; location: { x: number; y: number }; footprint?: string }[] } } } } };
      if (reply.kind !== 'simulation/snapshot') throw new Error(`Actual snapshot refused: ${reply.kind}`);
      return { orders: reply.payload.snapshot.data.construction.orders };
    };
    const mouse: MouseReceipt[] = [], enter: { key: string; trusted: boolean; button: boolean }[] = [];
    (window as NativeProbeWindow).ordinarySessionMouse = mouse;
    (window as NativeProbeWindow).ordinarySessionEnter = enter;
    for (const type of ['mousedown', 'mouseup']) window.addEventListener(type, event => {
      const e = event as MouseEvent;
      mouse.push({ type, button: e.button, buttons: e.buttons, trusted: e.isTrusted, canvas: e.target === document.querySelector('#game-root canvas') });
    }, true);
    window.addEventListener('keydown', event => {
      if (event.key === 'Enter') enter.push({ key: event.key, trusted: event.isTrusted, button: event.target instanceof HTMLButtonElement });
    }, true);
  });
}
const snapshot = (page: Page) => page.evaluate(() => (window as NativeProbeWindow).ordinarySessionSnapshot!());
const construction = async (page: Page) => (await sentCommands(page)).filter(c => /^(Place|Build|Remove|Zone|Unzone)/u.test(String(c.type)));
const initializations = (page: Page) => page.evaluate(() => ((window as unknown as TeeWindow).lockstateSentToWorker ?? [])
  .filter(m => (m as { kind?: string }).kind === 'simulation/initialize').length);

async function groundReference(page: Page) {
  const actual = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas')!;
    const map = document.querySelector<HTMLCanvasElement>('.hud-minimap canvas')!;
    const box = canvas.getBoundingClientRect();
    return { canvas: { width: canvas.width, height: canvas.height, left: box.left, top: box.top, widthCss: box.width, heightCss: box.height },
      map: { width: map.width, height: map.height }, percent: (Reflect.get(window, 'unroundedMinimapViewport') as () => MinimapViewportPercent)() };
  });
  expect(actual.map).toEqual({ width: 32, height: 32 });
  return { actual, independent: minimapGroundReference(actual.canvas, actual.map, actual.percent) };
}

for (const operation of ['New', 'Load'] as const) test(`World FullHD wall ${operation}: old held primary cannot build into replacement session`, async ({ page }, info) => {
  await installTee(page); await installSnapshotProbe(page);
  await page.addInitScript(observeUnroundedMinimapViewport);
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: 1 })));
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => currentClock(page)).toEqual({ mode: 'paused' });
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  const savedPrison = page.locator('.save-panel__item').first();
  await expect(page.locator('.save-panel__item')).toHaveCount(1);
  expect((await snapshot(page)).orders).toHaveLength(0);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'true');
  const oldReference = await groundReference(page);
  const from = oldReference.independent.screen(10.25, 10.25), to = oldReference.independent.screen(12.25, 10.25);
  for (const point of [from, to]) expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), point)).toBe(true);
  const beforeInitializations = await initializations(page);
  let held = false;
  try {
    await page.mouse.move(from.x, from.y); await page.mouse.down({ button: 'left' }); held = true;
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await expect(page.locator('.hud-build__target-value')).toContainText('whole squares');
    expect(await construction(page)).toHaveLength(0);
    const sessionButton = operation === 'New' ? page.getByRole('button', { name: 'New prison', exact: true })
      : savedPrison.getByRole('button', { name: 'Load', exact: true });
    await sessionButton.focus(); await page.keyboard.press('Enter');
    await expect.poll(() => initializations(page)).toBe(beforeInitializations + 1);
    if (operation === 'Load') await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    else await expect(page.locator('.save-panel__item')).toHaveCount(2);
    await expect.poll(() => currentClock(page)).toEqual({ mode: 'paused' });
    await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'true');
    const beforeRelease = await snapshot(page); expect(beforeRelease.orders).toHaveLength(0);
    const input = await page.evaluate(() => ({ mouse: (window as NativeProbeWindow).ordinarySessionMouse!.filter(e => e.canvas), enter: (window as NativeProbeWindow).ordinarySessionEnter!.at(-1) }));
    expect(input.mouse.at(-1)).toEqual({ type: 'mousedown', button: 0, buttons: 1, trusted: true, canvas: true });
    expect(input.enter).toEqual({ key: 'Enter', trusted: true, button: true });
    await page.screenshot({ path: info.outputPath('replacement-ready-old-primary-held.png') });
    await page.mouse.up({ button: 'left' }); held = false;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await construction(page), 'old press must not transmit a construction command').toHaveLength(0);
    const afterRelease = await snapshot(page);
    expect(afterRelease.orders, 'old release must not create an actual replacement order').toEqual(beforeRelease.orders);
    const released = await page.evaluate(() => (window as NativeProbeWindow).ordinarySessionMouse!.filter(e => e.canvas).at(-1));
    expect(released).toEqual({ type: 'mouseup', button: 0, buttons: 0, trusted: true, canvas: true });
    // Derive the NEW physical point from the public current viewport. Never
    // reuse outgoing projection coordinates as the expected placement origin.
    const freshReference = await groundReference(page), tile = { x: 10, y: 10 };
    const fresh = freshReference.independent.screen(tile.x + .25, tile.y + .25);
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), fresh)).toBe(true);
    await page.mouse.click(fresh.x, fresh.y);
    await expect.poll(() => construction(page)).toMatchObject([{ type: 'PlaceBuildOrder', definitionId: 'wall-brick', footprint: 'square', ...tile }]);
    expect(await construction(page)).toHaveLength(1);
    await expect.poll(async () => (await snapshot(page)).orders).toMatchObject([{ definitionId: 'wall-brick', footprint: 'square', location: tile }]);
    const final = await snapshot(page); expect(final.orders).toHaveLength(1);
    await expect.poll(() => currentClock(page)).toEqual({ mode: 'paused' });
    await page.screenshot({ path: info.outputPath('fresh-primary-one-exact-square-order.png') });
    console.log('WORLD_SESSION_OWNERSHIP', JSON.stringify({ operation, from, to, oldReference: oldReference.actual, beforeInitializations, input, released,
      beforeRelease, afterRelease, fresh, tile, freshReference: freshReference.actual, commands: await construction(page), final }));
  } finally { if (held) await page.mouse.up({ button: 'left' }); }
});
