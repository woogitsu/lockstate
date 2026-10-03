import { writeFile, readFile } from 'node:fs/promises';
import { expect, test, type Page } from './network-changed-fixture';
import { decodeSaveEnvelope } from '../../src/persistence/save-schema';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

interface Target { kind: 'room-template'; templateId: string; origin: { x: number; y: number } }
interface Receipt { generation: number; sessionId: string; target: Target; ok: boolean; requestAtMs: number; reply: unknown }
interface Snapshot { generation: number; sessionId: string; bundle: SessionSnapshotBundle }
interface Command { generation: number; command: Record<string, unknown> }
interface Probe {
  current: number;
  ready: { generation: number; sessionId: string; mode: string }[];
  commands: Command[];
  receipts: Receipt[];
  held: Receipt[];
  released: number;
  hold(generation: number, origin: { x: number; y: number }): void;
  release(): void;
  snapshot(): Promise<Snapshot>;
}

// Observe real workers only. Holding/replaying the original MessageEvent data
// changes delivery; it never fabricates a verdict, command or saved world.
async function observe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const workers = new Map<number, Worker>();
    const sessions = new Map<number, string>();
    const targets = new Map<string, { target: Target; requestAtMs: number }>();
    const snapshots = new Map<string, (reply: Snapshot) => void>();
    const delayed: (() => void)[] = [];
    let nextGeneration = 0;
    let heldTarget: { generation: number; origin: { x: number; y: number } } | undefined;
    const probe: Probe = {
      current: 0, ready: [], commands: [], receipts: [], held: [], released: 0,
      hold(generation, origin) { heldTarget = { generation, origin }; },
      release() {
        heldTarget = undefined;
        for (const deliver of delayed.splice(0)) { deliver(); probe.released++; }
      },
      snapshot() {
        return new Promise((resolve, reject) => {
          const generation = probe.current;
          const worker = workers.get(generation);
          if (worker === undefined) { reject(new Error('Actual current worker absent')); return; }
          const messageId = crypto.randomUUID();
          const timer = setTimeout(() => { snapshots.delete(messageId); reject(new Error('Actual snapshot exceeded existing10s expectation budget')); }, 10_000);
          snapshots.set(messageId, reply => { clearTimeout(timer); resolve(reply); });
          worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
        });
      },
    };
    class ObservedWorker extends RealWorker {
      private readonly generation: number;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.generation = ++nextGeneration;
        workers.set(this.generation, this); probe.current = this.generation;
        super.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as { kind?: string; replyTo?: string; payload?: {
            sessionId?: string; clock?: { mode: string }; projectionId?: string;
            view?: { data?: { ok: boolean } }; snapshot?: { data: SessionSnapshotBundle };
          } };
          if (message.kind === 'simulation/ready') {
            sessions.set(this.generation, message.payload!.sessionId!);
            probe.ready.push({ generation: this.generation, sessionId: message.payload!.sessionId!, mode: message.payload!.clock!.mode });
          }
          const query = targets.get(message.replyTo ?? '');
          if (message.kind === 'simulation/projection' && message.payload?.projectionId === 'world/room-template-preflight'
            && query !== undefined && message.payload.view?.data !== undefined) {
            const receipt = { generation: this.generation, sessionId: sessions.get(this.generation)!, ...query,
              ok: message.payload.view.data.ok, reply: event.data as unknown };
            if (heldTarget?.generation === this.generation && query.target.origin.x === heldTarget.origin.x
              && query.target.origin.y === heldTarget.origin.y) {
              event.stopImmediatePropagation(); probe.held.push(receipt);
              delayed.push(() => this.dispatchEvent(new MessageEvent('message', { data: event.data })));
              return;
            }
            probe.receipts.push(receipt);
          }
          if (message.kind === 'simulation/snapshot' && message.payload?.snapshot !== undefined) {
            const resolve = snapshots.get(message.replyTo ?? '');
            if (resolve !== undefined) {
              snapshots.delete(message.replyTo!);
              resolve({ generation: this.generation, sessionId: sessions.get(this.generation)!, bundle: message.payload.snapshot.data });
            }
          }
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const request = message as { messageId?: string; kind?: string; payload?: {
          projectionId?: string; target?: Target; command?: { data?: Record<string, unknown> };
        } };
        if (request.payload?.projectionId === 'world/room-template-preflight' && request.payload.target !== undefined) {
          targets.set(request.messageId!, { target: request.payload.target, requestAtMs: performance.now() });
        }
        if (request.kind === 'simulation/submit-command' && request.payload?.command?.data !== undefined) {
          probe.commands.push({ generation: this.generation, command: request.payload.command.data });
        }
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    window.Worker = ObservedWorker as typeof Worker;
    Reflect.set(window, 'templateSessionPreflight', probe);
  });
}

const snapshot = (page: Page) => page.evaluate(() => (Reflect.get(window, 'templateSessionPreflight') as Probe).snapshot());
const probe = (page: Page) => page.evaluate(() => {
  const { current, ready, commands, receipts, held, released } = Reflect.get(window, 'templateSessionPreflight') as Probe;
  return { current, ready, commands, receipts, held, released };
});
async function plan(page: Page, origin: { x: number; y: number }) {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans', exact: true });
  await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
  if (!await dialog.getByRole('spinbutton', { name: 'Plan origin X', exact: true }).isVisible()) {
    await dialog.getByText('Enter coordinates', { exact: true }).click();
  }
  await dialog.getByRole('spinbutton', { name: 'Plan origin X', exact: true }).fill(String(origin.x));
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y', exact: true }).fill(String(origin.y));
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('4 × 7');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(28);
  await expect(dialog.getByRole('status')).toHaveText('This footprint is clear.');
  const place = dialog.getByRole('button', { name: 'Place room plan', exact: true });
  await expect(place).toBeEnabled();
  return { dialog, place };
}

// Independently enumerate the authored4x7 perimeter, excluding its south door.
// No production plan/coordinator helper is used to manufacture expected orders.
function shell(origin: { x: number; y: number }, sequence: number) {
  const prefix = `room-template-${String(sequence).padStart(12, '0')}`;
  const walls: { definitionId: string; location: { x: number; y: number }; footprint?: string; edge?: string; id: string; placementSequence: number }[] = [];
  for (let y = 0; y < 7; y++) for (let x = 0; x < 4; x++) {
    if ((x === 0 || x === 3 || y === 0 || y === 6) && !(x === 1 && y === 6)) {
      walls.push({ id: `${prefix}-0-wall-${String(walls.length).padStart(3, '0')}`, definitionId: 'wall-brick',
        location: { x: origin.x + x, y: origin.y + y }, placementSequence: sequence, footprint: 'square' });
    }
  }
  return [...walls, { id: `${prefix}-1-door-000`, definitionId: 'door-wooden',
    location: { x: origin.x + 1, y: origin.y + 6 }, placementSequence: sequence, edge: 'north' }];
}
async function exportSaved(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const path = await (await download).path();
  if (path === null) throw Error('Actual exported save absent');
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  expect(raw).toMatchObject({ saveSchemaVersion: 10 });
  const decoded = decodeSaveEnvelope(raw);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw Error('Actual player-exported V10 must decode');
  return { raw, bundle: decoded.value.payload as unknown as SessionSnapshotBundle };
}

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const state = await probe(page).catch(error => ({ captureError: String(error) }));
  const worker = await snapshot(page).catch(error => ({ captureError: String(error) }));
  await writeFile(info.outputPath('failed-template-session-preflight.json'), JSON.stringify({ state, worker }, null, 2));
});

for (const operation of ['New', 'Load'] as const) {
  test(`Full HD: public ${operation} replaces a pending preflight and keeps 18 new orders through V10 Save/Load`, async ({ page }, info) => {
    await observe(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?renderer=oblique');
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: devicePixelRatio })))
      .toEqual({ width: 1920, height: 1080, scale: 1 });
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
    await expect.poll(async () => (await probe(page)).ready.at(-1)?.mode).toBe('paused');
    const initialPlan = await plan(page, { x: 10, y: 10 });
    await initialPlan.place.click();
    await expect(initialPlan.dialog.getByRole('status')).toHaveText('Room plan submitted.');
    await page.keyboard.press('Escape');
    const initial = await snapshot(page);
    expect(initial.bundle.construction.orders).toHaveLength(18);
    await page.getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
    const originalSave = await exportSaved(page);
    expect(originalSave.bundle).toEqual(initial.bundle);
    const initialPrisonId = await page.locator('.save-panel__item[data-active="true"]').getAttribute('data-prison');
    expect(initialPrisonId).toBeTruthy();

    const origin = { x: 20, y: 10 };
    const oldPlan = await plan(page, origin);
    await page.evaluate(({ generation, origin }) => (Reflect.get(window, 'templateSessionPreflight') as Probe).hold(generation, origin), { generation: initial.generation, origin });
    await oldPlan.place.click();
    await expect.poll(async () => (await probe(page)).held).toEqual([expect.objectContaining({ generation: initial.generation, sessionId: initial.sessionId,
      target: { kind: 'room-template', templateId: 'cell-basic', origin }, ok: true })]);
    await page.keyboard.press('Escape');
    const beforeReplacement = await snapshot(page);
    expect(beforeReplacement.bundle).toEqual(initial.bundle);
    if (operation === 'New') await page.getByRole('button', { name: 'New prison', exact: true }).click();
    else await page.locator('.save-panel__item[data-active="true"]').getByRole('button', { name: 'Load', exact: true }).click();
    await expect.poll(async () => (await probe(page)).ready.at(-1)?.generation).toBeGreaterThan(initial.generation);
    if (operation === 'Load') await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    else await expect(page.locator('.save-panel__item[data-active="true"]')).not.toHaveAttribute('data-prison', initialPrisonId!);
    const replacement = await snapshot(page);
    expect(replacement.sessionId).not.toBe(initial.sessionId);
    expect((await probe(page)).ready.at(-1)?.mode).toBe('paused');
    if (operation === 'Load') expect(replacement.bundle).toEqual(originalSave.bundle);
    else expect(replacement.bundle.construction.orders).toEqual([]);

    const fresh = await plan(page, origin);
    const before = await snapshot(page);
    await expect.poll(async () => (await probe(page)).receipts.some(receipt => receipt.generation === replacement.generation
      && receipt.target.origin.x === origin.x && receipt.target.origin.y === origin.y && receipt.ok)).toBe(true);
    const elapsedBeforeFreshClick = await page.evaluate(() => performance.now() - (Reflect.get(window, 'templateSessionPreflight') as Probe).held[0]!.requestAtMs);
    // The original requester deadline remains15s. A positive run after its
    // expiry would not reproduce the busy boundary, and must fail this fixture.
    expect(elapsedBeforeFreshClick).toBeLessThan(15_000);
    await fresh.place.click();
    await expect(fresh.dialog.getByRole('status')).toHaveText('Room plan submitted.');
    const accepted = await snapshot(page);
    const expected = shell(origin, before.bundle.kernel.expectedSequence);
    expect(expected).toHaveLength(18);
    const ids = new Set(before.bundle.construction.orders.map(order => order.id));
    const added = accepted.bundle.construction.orders.filter(order => !ids.has(order.id));
    expect(added).toHaveLength(18);
    for (const order of expected) expect(added).toContainEqual(expect.objectContaining(order));
    for (const order of before.bundle.construction.orders) expect(accepted.bundle.construction.orders).toContainEqual(order);
    expect(accepted.bundle.simulation?.roomTemplates?.pending).toContainEqual({ templateId: 'cell-basic', origin, mirrorX: false, sequence: before.bundle.kernel.expectedSequence });
    expect(accepted.bundle.construction.currentTransaction).toEqual(expected.map(order => order.id));
    const commandsBeforeReplay = (await probe(page)).commands;
    expect(commandsBeforeReplay.filter(command => command.generation === replacement.generation)).toEqual([
      { generation: replacement.generation, command: { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin } },
    ]);
    await page.screenshot({ path: info.outputPath('fresh-claim-before-stale-reply-fullhd.png') });
    await page.evaluate(() => (Reflect.get(window, 'templateSessionPreflight') as Probe).release());
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const afterReplay = await snapshot(page);
    expect((await probe(page)).released).toBe(1);
    expect((await probe(page)).commands).toEqual(commandsBeforeReplay);
    expect(afterReplay.bundle).toEqual(accepted.bundle);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
    const saved = await exportSaved(page);
    expect(saved.bundle).toEqual(accepted.bundle);
    await page.locator('.save-panel__item[data-active="true"]').getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    const restored = await snapshot(page);
    expect(restored.generation).toBeGreaterThan(replacement.generation);
    expect(restored.bundle).toEqual(saved.bundle);
    expect((await probe(page)).commands).toEqual(commandsBeforeReplay);
    await writeFile(info.outputPath('template-session-preflight.json'), JSON.stringify({ operation, elapsedBeforeFreshClick,
      initial, originalSave: originalSave.raw, beforeReplacement, replacement, before, accepted, afterReplay,
      saved: saved.raw, restored, observation: await probe(page) }, null, 2));
    await page.screenshot({ path: info.outputPath('preserved-v8-claim-fullhd.png') });
  });
}
