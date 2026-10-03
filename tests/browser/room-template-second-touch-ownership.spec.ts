import { expect, test, type Page } from './network-changed-fixture';
import type { CDPSession } from '@playwright/test';
import { currentClock, installTee, sentCommands } from './playtest-harness';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

interface Target { kind: 'room-template'; templateId: string; origin: { x: number; y: number }; quarterTurns?: number }
interface PointerReceipt { type: string; id: number; primary: boolean; trusted: boolean; canvas: boolean; active: number[] }
interface Probe {
  pointers: PointerReceipt[];
  replies: { target: Target; ok: boolean }[];
  snapshot(): Promise<{ orders: SessionSnapshotBundle['construction']['orders']; pending: unknown; balance: number | undefined }>;
}

// Read actual worker replies/snapshots and window capture-phase native receipts.
// No verdict, command, simulation state, input event or isTrusted is substituted.
async function observe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let latest: Worker | undefined;
    const requests = new Map<string, Target>();
    const snapshotReplies = new Map<string, (message: unknown) => void>();
    const active = new Set<number>();
    const probe: Probe = { pointers: [], replies: [], async snapshot() {
      const worker = latest;
      if (worker === undefined) throw Error('Actual worker absent');
      const messageId = crypto.randomUUID();
      const reply = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => { snapshotReplies.delete(messageId); reject(Error('Actual worker snapshot timed out')); }, 20_000);
        snapshotReplies.set(messageId, value => { clearTimeout(timer); resolve(value); });
        worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
      }) as { kind: string; payload: { snapshot: { data: SessionSnapshotBundle } } };
      if (reply.kind !== 'simulation/snapshot') throw Error(`Actual snapshot refused: ${reply.kind}`);
      const data = reply.payload.snapshot.data;
      return { orders: data.construction.orders, pending: data.simulation?.roomTemplates?.pending,
        balance: data.simulation?.economy?.treasury.balanceMinorUnits };
    } };
    class ObservedWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); latest = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const m = event.data as { replyTo?: string; kind?: string; payload?: { view?: { data?: { ok: boolean } } } };
          const id = m.replyTo ?? '';
          const reader = snapshotReplies.get(id);
          if (reader !== undefined) { snapshotReplies.delete(id); reader(event.data); }
          const target = requests.get(id);
          if (m.kind === 'simulation/projection' && target !== undefined && m.payload?.view?.data !== undefined) {
            requests.delete(id); probe.replies.push({ target, ok: m.payload.view.data.ok });
          }
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const m = message as { messageId?: string; payload?: { projectionId?: string; target?: Target } };
        if (m.payload?.projectionId === 'world/room-template-preflight' && m.payload.target !== undefined) requests.set(m.messageId!, m.payload.target);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    Reflect.set(window, 'Worker', ObservedWorker);
    Reflect.set(window, 'secondTouchProbe', probe);
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) window.addEventListener(type, event => {
      const e = event as PointerEvent;
      if (e.pointerType !== 'touch') return;
      if (type === 'pointerdown') active.add(e.pointerId); else active.delete(e.pointerId);
      probe.pointers.push({ type, id: e.pointerId, primary: e.isPrimary, trusted: e.isTrusted,
        canvas: e.target === document.querySelector('#game-root canvas'), active: [...active] });
    }, true);
  });
}
const snapshot = (page: Page) => page.evaluate(() => (Reflect.get(window, 'secondTouchProbe') as Probe).snapshot());
const construction = async (page: Page) => (await sentCommands(page)).filter(c => /^(Place|Build|Remove|Zone|Unzone)/u.test(String(c.type)));
const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const touch = (client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) =>
  client.send('Input.dispatchTouchEvent', { type, touchPoints: points });

test.use({ hasTouch: true });
for (const mode of ['world', 'oblique'] as const) test(`${mode} FullHD: second touch release abandons room-template press; fresh primary tap remains legal`, async ({ page }, info) => {
  await installTee(page); await observe(page);
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: 1 })));
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto(mode === 'world' ? '/' : '/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => currentClock(page)).toEqual({ mode: 'paused' });
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
  const rotation = dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' });
  await rotation.focus(); await rotation.press('ArrowDown'); await expect(rotation).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const first = { x: 900, y: 460, id: 202 }, second = { x: 930, y: 460, id: 101 };
  for (const point of [first, second]) expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), point)).toBe(true);
  await page.mouse.move(first.x, first.y);
  const ghost = page.locator('.room-template-world-ghost');
  await expect(ghost).toBeVisible(); await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await expect(ghost.locator('polygon')).toHaveCount(28);
  await expect(ghost.getByRole('status')).toContainText('Materials catalogue value:');
  const quote = await ghost.getByRole('status').innerText();
  const before = await snapshot(page); expect(before.orders).toHaveLength(0);
  expect(before.pending ?? []).toEqual([]); expect(await construction(page)).toHaveLength(0);
  const client = await page.context().newCDPSession(page);
  let active = false;
  try {
    await touch(client, 'touchStart', [first]); active = true;
    // Adding a finger while a stream is active uses touchMove, not a second
    // touchStart. Lower secondary CDP id lets the valid all-finger touchEnd[]
    // stream release secondary first. Actual PointerEvents below MUST verify
    // that ordering; no physical hold after the whole CDP command is claimed.
    await touch(client, 'touchMove', [first, second]);
    const downs = await page.evaluate(() => (Reflect.get(window, 'secondTouchProbe') as Probe).pointers.filter(p => p.type === 'pointerdown'));
    expect(downs).toHaveLength(2);
    expect(downs[0]).toMatchObject({ primary: true, trusted: true, canvas: true });
    expect(downs[1]).toMatchObject({ primary: false, trusted: true, canvas: true });
    expect(downs[1]!.id).not.toBe(downs[0]!.id); expect(downs[1]!.active).toHaveLength(2);
    expect(await construction(page)).toHaveLength(0);
    await touch(client, 'touchEnd', []); active = false;
    const events = await page.evaluate(() => (Reflect.get(window, 'secondTouchProbe') as Probe).pointers);
    const ups = events.filter(p => p.type === 'pointerup');
    expect(events.filter(p => p.type === 'pointercancel')).toHaveLength(0);
    expect(ups).toHaveLength(2);
    expect(ups[0]).toEqual({ type: 'pointerup', id: downs[1]!.id, primary: false, trusted: true, canvas: true, active: [downs[0]!.id] });
    expect(ups[1]).toEqual({ type: 'pointerup', id: downs[0]!.id, primary: true, trusted: true, canvas: true, active: [] });
    await settle(page);
    expect(await construction(page), 'neither release from the abandoned two-finger gesture may transmit construction').toHaveLength(0);
    const after = await snapshot(page); expect(after).toEqual(before);
    await expect(ghost).toBeVisible(); await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(ghost.locator('polygon')).toHaveCount(28); await expect(ghost.getByRole('status')).toHaveText(quote);
    await page.screenshot({ path: info.outputPath('two-finger-release-plan-still-armed.png') });
    // New native primary press, actual current worker preflight, actual release.
    await touch(client, 'touchStart', [first]); active = true;
    await expect(ghost).toHaveAttribute('data-ready', 'clear'); await expect(ghost.getByRole('status')).toHaveText(quote);
    const fresh = await page.evaluate(() => (Reflect.get(window, 'secondTouchProbe') as Probe).replies.at(-1)!);
    expect(fresh).toMatchObject({ ok: true, target: { kind: 'room-template', templateId: 'cell-basic', quarterTurns: 1 } });
    await touch(client, 'touchEnd', []); active = false;
    await expect.poll(() => construction(page)).toEqual([{ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: fresh.target.origin, quarterTurns: 1 }]);
    await expect.poll(async () => (await snapshot(page)).orders.length).toBe(18);
    const final = await snapshot(page);
    expect(final.pending).toHaveLength(1); expect(final.balance).toBe(before.balance);
    await expect(ghost).toBeHidden(); await expect.poll(() => currentClock(page)).toEqual({ mode: 'paused' });
    const finalPointers = await page.evaluate(() => (Reflect.get(window, 'secondTouchProbe') as Probe).pointers);
    expect(finalPointers.slice(-2).map(p => ({ type: p.type, primary: p.primary, trusted: p.trusted, canvas: p.canvas }))).toEqual([
      { type: 'pointerdown', primary: true, trusted: true, canvas: true }, { type: 'pointerup', primary: true, trusted: true, canvas: true },
    ]);
    await page.screenshot({ path: info.outputPath('fresh-primary-one-actual-pending-plan.png') });
    console.log('TEMPLATE_SECOND_TOUCH', JSON.stringify({ mode, uiScale: 1, first, second, before, events, after, fresh, quote, commands: await construction(page), final, finalPointers }));
  } finally { if (active) await touch(client, 'touchEnd', []); await client.detach(); }
});
