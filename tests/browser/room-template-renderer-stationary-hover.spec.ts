import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

interface Target { kind: 'room-template'; templateId: string; origin: { x: number; y: number }; quarterTurns?: number; mirrorX?: boolean }
interface Receipt { target: Target; ok: boolean }
interface Probe {
  holdNextMapReply: boolean;
  held: Receipt[];
  replies: Receipt[];
  costs: unknown[];
  pointerMoves: Array<{ x: number; y: number; canvas: boolean; trusted: boolean }>;
  commandResults: string[];
  release(): void;
}
async function observeWorkerAndPointer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const requests = new Map<string, { projectionId: string; target: Target }>();
    const commands = new Set<string>();
    const releases: Array<() => void> = [];
    const probe: Probe = { holdNextMapReply: false, held: [], replies: [], costs: [], pointerMoves: [], commandResults: [], release() {
      probe.holdNextMapReply = false;
      for (const action of releases.splice(0)) action();
    } };
    window.addEventListener('pointermove', event => {
      probe.pointerMoves.push({ x: event.clientX, y: event.clientY, canvas: event.target instanceof HTMLCanvasElement && event.target.closest('#game-root') !== null, trusted: event.isTrusted });
    }, true);
    class ObservedWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as { replyTo?: string; kind?: string; payload?: { status?: string; view?: { data?: unknown } } };
          if (message.kind === 'simulation/command-result' && commands.has(message.replyTo ?? '')) probe.commandResults.push(message.payload!.status!);
          const request = requests.get(message.replyTo ?? '');
          if (message.kind !== 'simulation/projection' || request === undefined || message.payload?.view?.data === undefined) return;
          if (request.projectionId === 'world/room-template-cost') { probe.costs.push(message.payload.view.data); return; }
          const verdict = message.payload.view.data as { ok: boolean };
          const receipt = { target: request.target, ok: verdict.ok };
          if (probe.holdNextMapReply && (request.target.origin.x !== 0 || request.target.origin.y !== 0)) {
            probe.holdNextMapReply = false;
            probe.held.push(receipt);
            event.stopImmediatePropagation();
            // Delay only the genuine old read-only response, never its verdict
            // or any placement command. Forward its exact bytes once later.
            releases.push(() => this.dispatchEvent(new MessageEvent('message', { data: event.data })));
          } else probe.replies.push(receipt);
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const request = message as { messageId?: string; kind?: string; payload?: { projectionId?: string; target?: Target; command?: { data?: { type?: string } } } };
        if ((request.payload?.projectionId === 'world/room-template-preflight' || request.payload?.projectionId === 'world/room-template-cost') && request.payload.target !== undefined) {
          requests.set(request.messageId!, { projectionId: request.payload.projectionId, target: request.payload.target });
        }
        if (request.kind === 'simulation/submit-command' && request.payload?.command?.data?.type === 'PlaceRoomTemplate') commands.add(request.messageId!);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    window.Worker = ObservedWorker as typeof Worker;
    Reflect.set(window, 'stationaryRendererProbe', probe);
  });
}

for (const uiScale of [1, 2] as const) for (const initialMode of ['world', 'oblique'] as const) for (const mirrored of [false, true]) {
  test(`FullHD UI${uiScale * 100}% ${initialMode} replacement keeps stationary rotated${mirrored ? '/mirrored' : ''} plan after old worker reply`, async ({ page }, testInfo) => {
    await installTee(page); await observeWorkerAndPointer(page);
    // UI scale100%/200%, physical1920x1080. Page zoom and CSS canvas ratio are not
    // substituted for the separate accessibility UI scale setting.
    await page.addInitScript(scale => localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale })), uiScale);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(initialMode === 'world' ? '/' : '/?renderer=oblique');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
    const rotation = dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' });
    await rotation.focus(); await rotation.press('ArrowDown'); await expect(rotation).toHaveValue('1');
    const mirror = dialog.getByRole('checkbox', { name: 'Mirror horizontally before rotation' });
    if (mirrored) { await mirror.focus(); await mirror.press('Space'); await expect(mirror).toBeChecked(); }
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    const cursor = { x: 880, y: 380 };
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), cursor)).toBe(true);
    await page.evaluate(() => { (Reflect.get(window, 'stationaryRendererProbe') as Probe).holdNextMapReply = true; });
    await page.mouse.move(cursor.x, cursor.y);
    const ghost = page.locator('.room-template-world-ghost');
    await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'stationaryRendererProbe') as Probe).held.length)).toBe(1);
    const old = await page.evaluate(() => (Reflect.get(window, 'stationaryRendererProbe') as Probe).held[0]!);
    expect(old).toMatchObject({ ok: true, target: { kind: 'room-template', templateId: 'cell-basic', quarterTurns: 1, ...(mirrored ? { mirrorX: true } : {}) } });
    await expect(ghost).toBeVisible(); await expect(ghost.locator('polygon')).toHaveCount(28);
    const before = await page.evaluate(() => { const p = Reflect.get(window, 'stationaryRendererProbe') as Probe; return { moves: p.pointerMoves.length, replies: p.replies.length, costs: p.costs.length }; });
    const nextMode = initialMode === 'world' ? 'oblique' : 'world';
    const view = page.getByRole('combobox', { name: 'View', exact: true });
    await view.focus(); await view.press(initialMode === 'world' ? 'End' : 'Home');
    await expect(view).toHaveValue(nextMode); await expect(view).toBeEnabled(); await expect(view).toHaveAttribute('aria-busy', 'false');
    // The app must independently pick and inspect this still-armed plan in the
    // new renderer BEFORE the old reply is allowed through, without a mouse move.
    await expect(ghost).toBeVisible(); await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(ghost.locator('polygon')).toHaveCount(28);
    await expect(ghost.getByRole('status')).toContainText('Materials catalogue value:');
    await expect.poll(() => page.evaluate(count => (Reflect.get(window, 'stationaryRendererProbe') as Probe).replies.length > count, before.replies)).toBe(true);
    await expect.poll(() => page.evaluate(count => (Reflect.get(window, 'stationaryRendererProbe') as Probe).costs.length > count, before.costs)).toBe(true);
    const fresh = await page.evaluate(() => (Reflect.get(window, 'stationaryRendererProbe') as Probe).replies.at(-1)!);
    expect(fresh).toMatchObject({ ok: true, target: { kind: 'room-template', templateId: 'cell-basic', quarterTurns: 1, ...(mirrored ? { mirrorX: true } : {}) } });
    const currentQuote = await ghost.getByRole('status').innerText();
    await page.evaluate(() => (Reflect.get(window, 'stationaryRendererProbe') as Probe).release());
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(ghost).toBeVisible(); await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(ghost.getByRole('status')).toHaveText(currentQuote); await expect(ghost.locator('polygon')).toHaveCount(28);
    const still = await page.evaluate(() => { const p = Reflect.get(window, 'stationaryRendererProbe') as Probe; return { moves: p.pointerMoves, costs: p.costs }; });
    expect(still.moves).toHaveLength(before.moves);
    expect(still.moves.at(-1)).toEqual({ ...cursor, canvas: true, trusted: true });
    expect(still.costs.at(-1)).toEqual(still.costs.at(-2)); // actual worker catalogue cost is orientation/renderer invariant
    expect((await sentCommands(page)).filter(command => /^(Place|Build|Remove)/u.test(String(command.type)))).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath('stationary-current-preview-after-old-reply.png') });
    // Physical down/up only, without a new move or an injected command.
    await page.mouse.down(); await page.mouse.up();
    await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toEqual([
      { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: fresh.target.origin, quarterTurns: 1, ...(mirrored ? { mirrorX: true } : {}) },
    ]);
    await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'stationaryRendererProbe') as Probe).commandResults)).toEqual(['queued']);
    await expect(ghost).toBeHidden();
    expect((await sentCommands(page)).filter(command => /^(Place|Build|Remove)/u.test(String(command.type)))).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath('stationary-first-click-submitted-current-origin.png') });
    console.log('RENDERER_STATIONARY_HOVER', JSON.stringify({ initialMode, nextMode, mirrored, uiScale, cursor, old, fresh, currentQuote, moves: still.moves, costs: still.costs }));
  });
}
