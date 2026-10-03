import { expect, test, type Page, type Locator } from './network-changed-fixture';
import { currentClock, installTee, sentCommands } from './playtest-harness';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import type { RoomTemplatePreflight, RoomTemplateCostQuote } from '../../src/ui/room-template-tool';

interface Target { kind: 'room-template'; templateId: string; origin: { x: number; y: number }; quarterTurns?: number; mirrorX?: boolean }
interface PointerReceipt { type: string; id: number; primary: boolean; trusted: boolean; canvas: boolean; button: number; buttons: number; x: number; y: number; active: number[] }
interface Probe {
  pointers: PointerReceipt[];
  keys: { type: string; code: string; trusted: boolean }[];
  clicks: { name: string; trusted: boolean; detail: number }[];
  replies: { target: Target; verdict: RoomTemplatePreflight }[];
  quotes: { templateId: string; quote: RoomTemplateCostQuote }[];
  snapshot(): Promise<SessionSnapshotBundle>;
}
const numericOrigin = { x: 20, y: 5 };
const quote = 'Brick × 35 · Wood Plank × 2 · Materials catalogue value: 1,530';
const expectedQuote = { orderCount: 20, materials: [{ itemId: 'item.brick', quantity: 35 }, { itemId: 'item.wood-plank', quantity: 2 }], catalogueCostMinorUnits: 1530 };

// Passive real-worker reads. The only additional transmitted messages are
// read-only snapshots; verdicts, commands, replies and input are never supplied.
async function observe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let latest: Worker | undefined;
    const requests = new Map<string, { projectionId: string; target: Target }>();
    const readers = new Map<string, (value: unknown) => void>();
    const active = new Set<number>();
    const probe: Probe = { pointers: [], keys: [], clicks: [], replies: [], quotes: [], async snapshot() {
      if (latest === undefined) throw Error('Actual worker absent');
      const id = crypto.randomUUID();
      const message = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => { readers.delete(id); reject(Error('Actual snapshot timed out')); }, 20_000);
        readers.set(id, value => { clearTimeout(timer); resolve(value); });
        latest!.postMessage({ protocolVersion: 1, messageId: id, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
      }) as { kind: string; payload: { snapshot: { data: SessionSnapshotBundle } } };
      if (message.kind !== 'simulation/snapshot') throw Error(`Actual snapshot refused: ${message.kind}`);
      return message.payload.snapshot.data;
    } };
    class ObservedWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const m = event.data as { kind?: string; replyTo?: string; payload?: { view?: { data?: unknown } } };
          if (m.kind?.startsWith('simulation/')) latest = this;
          const id = m.replyTo ?? '';
          const reader = readers.get(id);
          if (reader !== undefined) { readers.delete(id); reader(event.data); }
          const request = requests.get(id);
          if (m.kind !== 'simulation/projection' || request === undefined || m.payload?.view?.data === undefined) return;
          requests.delete(id);
          if (request.projectionId === 'world/room-template-preflight') probe.replies.push({ target: request.target, verdict: m.payload.view.data as RoomTemplatePreflight });
          if (request.projectionId === 'world/room-template-cost') probe.quotes.push({ templateId: request.target.templateId, quote: m.payload.view.data as RoomTemplateCostQuote });
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const m = message as { messageId?: string; kind?: string; payload?: { projectionId?: string; target?: Target } };
        if (m.kind === 'simulation/request-projection' && m.messageId !== undefined && m.payload?.target !== undefined
          && (m.payload.projectionId === 'world/room-template-preflight' || m.payload.projectionId === 'world/room-template-cost')) {
          requests.set(m.messageId, { projectionId: m.payload.projectionId, target: m.payload.target });
        }
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    Reflect.set(window, 'Worker', ObservedWorker);
    Reflect.set(window, 'numericHeldPrimaryProbe', probe);
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) window.addEventListener(type, event => {
      const e = event as PointerEvent;
      if (e.pointerType !== 'mouse') return;
      if (type === 'pointerdown') active.add(e.pointerId); else active.delete(e.pointerId);
      probe.pointers.push({ type, id: e.pointerId, primary: e.isPrimary, trusted: e.isTrusted,
        canvas: e.target === document.querySelector('#game-root canvas'), button: e.button, buttons: e.buttons,
        x: e.clientX, y: e.clientY, active: [...active] });
    }, true);
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
      const e = event as KeyboardEvent;
      probe.keys.push({ type, code: e.code, trusted: e.isTrusted });
    }, true);
    window.addEventListener('click', event => {
      const button = (event.target as Element | null)?.closest('button, summary');
      if (button !== null && button !== undefined) probe.clicks.push({ name: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '', trusted: event.isTrusted, detail: event.detail });
    }, true);
  });
}
const snapshot = (page: Page) => page.evaluate(() => (Reflect.get(window, 'numericHeldPrimaryProbe') as Probe).snapshot());
const receipts = (page: Page) => page.evaluate(() => {
  const p = Reflect.get(window, 'numericHeldPrimaryProbe') as Probe;
  return { pointers: p.pointers, keys: p.keys, clicks: p.clicks, replies: p.replies, quotes: p.quotes };
});
const construction = async (page: Page) => (await sentCommands(page)).filter(c => /^(Place|Build|Remove|Zone|Unzone)/u.test(String(c.type)));

// Every focus movement is a trusted Tab. Inspecting focus never changes it.
async function trustedTabTo(page: Page, target: Locator): Promise<void> {
  for (let step = 0; step < 100; step++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}
function assertSingleShell(data: SessionSnapshotBundle, sequence: number): void {
  expect(data.simulation?.roomTemplates?.pending).toEqual([
    { templateId: 'cell-basic', origin: numericOrigin, mirrorX: false, quarterTurns: 1, sequence },
  ]);
  expect(data.construction.orders).toHaveLength(18);
  // Independent literal q1 Cell perimeter:7×4, doorway20,6; its eastern
  // boundary is stored as west edge21,6. No production geometry reader.
  const expected: string[] = [];
  for (let y = 5; y < 9; y++) for (let x = 20; x < 27; x++) {
    if ((y === 5 || y === 8 || x === 20 || x === 26) && !(x === 20 && y === 6)) expected.push(`wall-brick@${x},${y}:square`);
  }
  expected.push('door-wooden@21,6:west');
  expect(data.construction.orders.map(o => `${o.definitionId}@${o.location.x},${o.location.y}:${o.footprint ?? o.edge}`).sort()).toEqual(expected.sort());
  for (const order of data.construction.orders) expect(order).toMatchObject({ state: 'approved', progress: 0, materialsAllocated: [], placementSequence: sequence });
  expect(new Set(data.construction.orders.map(o => o.id)).size).toBe(18);
  expect(data.construction.currentTransaction).toEqual(data.construction.orders.map(o => o.id));
  expect(data.construction.undoStack).toEqual([]);
  expect(data.construction.redoStack).toEqual([]);
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const data = await snapshot(page).catch(error => ({ unavailable: String(error) }));
  await info.attach('failed-actual-worker-and-trusted-input', {
    body: JSON.stringify({ data, observed: await receipts(page), commands: await construction(page) }, null, 2), contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('failed-numeric-held-primary.png') });
});

for (const mode of ['world', 'oblique'] as const) test(`${mode} FullHD: numeric purchase consumes the originally held canvas primary without a second transaction (#1908)`, async ({ page }, info) => {
  await installTee(page); await observe(page);
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: 1 })));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(mode === 'world' ? '/' : '/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => currentClock(page)).toEqual({ mode: 'paused' });
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const open = page.getByRole('button', { name: 'Room plans', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await trustedTabTo(page, dialog.getByRole('button', { name: 'Basic cell', exact: true }));
  await page.keyboard.press('Enter');
  const rotation = dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' });
  await trustedTabTo(page, rotation); await page.keyboard.press('ArrowDown');
  await expect(rotation).toHaveValue('1');
  await trustedTabTo(page, dialog.getByRole('button', { name: 'Place on map', exact: true }));
  await page.keyboard.press('Enter'); await expect(dialog).toBeHidden();
  const cursor = { x: 900, y: 460 };
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), cursor)).toBe(true);
  await page.mouse.move(cursor.x, cursor.y);
  const ghost = page.locator('.room-template-world-ghost');
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await expect(ghost.locator('polygon')).toHaveCount(28);
  await expect(ghost.getByRole('status')).toHaveText(`Click map to place; Esc cancels. | This footprint is clear. | ${quote}`);
  const mapOrigin = mode === 'world' ? { x: 11, y: 11 } : { x: 10, y: 11 };
  expect((await receipts(page)).replies.at(-1)).toMatchObject({ target: { templateId: 'cell-basic', origin: mapOrigin, quarterTurns: 1 }, verdict: { ok: true } });
  const before = await snapshot(page);
  expect(before.construction.orders).toEqual([]);
  expect(before.simulation?.roomTemplates?.pending).toEqual([]);
  // Both disjoint7×4 footprints and numeric doorway approach19,6 are owned.
  expect(before.world.ownedChunks).toContainEqual({ x: 0, y: 0 });
  expect(before.world.chunkSize).toBe(32);
  expect(await construction(page)).toEqual([]);
  const pointerStart = (await receipts(page)).pointers.length;
  let held = false;
  try {
    await page.mouse.down({ button: 'left' }); held = true;
    const down = (await receipts(page)).pointers.slice(pointerStart);
    expect(down).toHaveLength(1);
    expect(down[0]).toMatchObject({ type: 'pointerdown', primary: true, trusted: true, canvas: true, button: 0, buttons: 1, x: cursor.x, y: cursor.y });
    expect(down[0]!.active).toEqual([down[0]!.id]);
    // Mouse stays held and stationary throughout public modal interaction.
    await trustedTabTo(page, open); await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    const advanced = dialog.locator('.hud-template__coordinates > summary');
    await trustedTabTo(page, advanced); await page.keyboard.press('Enter');
    const x = dialog.getByRole('spinbutton', { name: 'Plan origin X' });
    const y = dialog.getByRole('spinbutton', { name: 'Plan origin Y' });
    await trustedTabTo(page, x); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('20');
    await trustedTabTo(page, y); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('5');
    await expect(x).toHaveValue('20'); await expect(y).toHaveValue('5');
    await expect(dialog.getByRole('status')).toHaveText('This footprint is clear.');
    await expect(dialog.locator('.hud-template__quote')).toHaveText(quote);
    expect((await receipts(page)).replies.at(-1)).toMatchObject({ target: { templateId: 'cell-basic', origin: numericOrigin, quarterTurns: 1 }, verdict: { ok: true } });
    expect((await receipts(page)).quotes.at(-1)).toEqual({ templateId: 'cell-basic', quote: expectedQuote });
    const submit = dialog.getByRole('button', { name: 'Place room plan', exact: true });
    await expect(submit).toBeEnabled(); await trustedTabTo(page, submit);
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('status')).toHaveText('Room plan submitted.');
    await expect(submit).toBeDisabled();
    await expect.poll(() => construction(page)).toEqual([
      { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: numericOrigin, quarterTurns: 1 },
    ]);
    const accepted = await snapshot(page);
    const sequence = accepted.simulation?.roomTemplates?.pending[0]?.sequence;
    expect(sequence, 'fresh session receives its first actual construction command').toBe(0);
    assertSingleShell(accepted, 0);
    expect(accepted.construction.currentTransactionId).toBe('room-template-0');
    expect(accepted.simulation?.economy?.treasury.balanceMinorUnits).toBe(before.simulation?.economy?.treasury.balanceMinorUnits);
    expect((await receipts(page)).pointers.slice(pointerStart)).toEqual(down);
    await page.screenshot({ path: info.outputPath('numeric-accepted-primary-still-held.png') });
    await trustedTabTo(page, dialog.getByRole('button', { name: 'Close plans', exact: true }));
    await page.keyboard.press('Enter'); await expect(dialog).toBeHidden();
    await expect(ghost).toBeHidden();
    expect((await receipts(page)).pointers.slice(pointerStart)).toEqual(down);
    await page.mouse.up({ button: 'left' }); held = false;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const final = await snapshot(page);
    expect(final, 'release must preserve the entire authoritative worker snapshot').toEqual(accepted);
    assertSingleShell(final, 0);
    expect(await construction(page)).toEqual([{ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: numericOrigin, quarterTurns: 1 }]);
    const observed = await receipts(page);
    expect(observed.pointers.slice(pointerStart)).toEqual([
      down[0], { type: 'pointerup', id: down[0]!.id, primary: true, trusted: true, canvas: true, button: 0, buttons: 0, x: cursor.x, y: cursor.y, active: [] },
    ]);
    expect(observed.keys.every(key => key.trusted)).toBe(true);
    for (const name of ['Room plans', 'Enter coordinates', 'Place room plan', 'Close plans']) {
      expect(observed.clicks.filter(click => click.name === name && click.detail === 0)).toContainEqual({ name, trusted: true, detail: 0 });
    }
    await expect(ghost).toBeHidden(); await expect.poll(() => currentClock(page)).toEqual({ mode: 'paused' });
    await page.screenshot({ path: info.outputPath('original-primary-released-one-pending-plan.png') });
    await info.attach('actual-worker-and-trusted-input', { body: JSON.stringify({ mode, cursor, mapOrigin, numericOrigin, before, accepted, final, observed, commands: await construction(page) }, null, 2), contentType: 'application/json' });
  } finally { if (held) await page.mouse.up({ button: 'left' }); }
});
