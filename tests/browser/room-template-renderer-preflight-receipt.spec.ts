import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

interface Target { kind: 'room-template'; templateId: string; origin: { x: number; y: number } }
interface Probe {
  hold: boolean;
  heldTarget?: Target;
  replies: Array<{ target: Target; ok: boolean }>;
  held: Array<{ target: Target; ok: boolean }>;
  commandResults: Array<{ status: string }>;
  release(): void;
}
async function observeActualPreflight(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const targets = new Map<string, Target>();
    const commands = new Set<string>();
    const release: Array<() => void> = [];
    const probe: Probe = { hold: false, replies: [], held: [], commandResults: [], release() {
      probe.hold = false;
      for (const action of release.splice(0)) action();
    } };
    class ObservedWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const reply = event.data as { replyTo?: string; kind?: string; payload?: { status?: string; view?: { data?: { ok: boolean } } } };
          const target = targets.get(reply.replyTo ?? '');
          if (reply.kind === 'simulation/command-result' && commands.has(reply.replyTo ?? '')) {
            probe.commandResults.push({ status: reply.payload!.status! });
          }
          if (target !== undefined && reply.kind === 'simulation/projection' && reply.payload?.view?.data !== undefined) {
            const receipt = { target, ok: reply.payload.view.data.ok };
            if (probe.hold && target.templateId === probe.heldTarget?.templateId
              && target.origin.x === probe.heldTarget.origin.x && target.origin.y === probe.heldTarget.origin.y) {
              event.stopImmediatePropagation();
              probe.held.push(receipt);
              // Preserve the exact real-worker response; no verdict/command
              // is synthesized. Release it once to the normal app listeners.
              release.push(() => this.dispatchEvent(new MessageEvent('message', { data: event.data })));
              return;
            }
            probe.replies.push(receipt);
          }
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const request = message as { messageId?: string; kind?: string; payload?: { projectionId?: string; target?: Target; command?: { data?: { type?: string } } } };
        if (request.payload?.projectionId === 'world/room-template-preflight' && request.payload.target !== undefined) {
          targets.set(request.messageId!, request.payload.target);
        }
        if (request.kind === 'simulation/submit-command' && request.payload?.command?.data?.type === 'PlaceRoomTemplate') commands.add(request.messageId!);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    window.Worker = ObservedWorker as typeof Worker;
    Reflect.set(window, 'rendererPlanPreflight', probe);
  });
}

for (const initialMode of ['world', 'oblique'] as const) for (const rearm of [false, true]) {
  test(`FullHD ${initialMode}: renderer replacement during genuine preflight ${rearm ? 'protects rearmed Yard' : 'stands down accepted cell'}`, async ({ page }, testInfo) => {
    await installTee(page); await observeActualPreflight(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(initialMode === 'world' ? '/' : '/?renderer=oblique');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const open = page.getByRole('button', { name: 'Room plans', exact: true });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    const cursor = { x: 880, y: 380 };
    await page.mouse.move(cursor.x, cursor.y);
    const ghost = page.locator('.room-template-world-ghost');
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(ghost.locator('polygon')).toHaveCount(28);
    await expect(ghost.getByRole('status')).toContainText('Materials catalogue value:');
    const chosen = await page.evaluate(() => (Reflect.get(window, 'rendererPlanPreflight') as Probe).replies.at(-1)!);
    expect(chosen.ok).toBe(true); expect(chosen.target.kind).toBe('room-template'); expect(chosen.target.templateId).toBe('cell-basic');
    await page.evaluate(target => { const probe = Reflect.get(window, 'rendererPlanPreflight') as Probe; probe.hold = true; probe.heldTarget = target; }, chosen.target);
    await page.mouse.down(); await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'rendererPlanPreflight') as Probe).held)).toEqual([chosen]);
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);

    // Native option navigation preserves the physical map pointer and chosen
    // tool revision while the actual main lifecycle withdraws/reinstalls it.
    const view = page.getByRole('combobox', { name: 'View', exact: true });
    await view.focus(); await page.keyboard.press(initialMode === 'world' ? 'End' : 'Home');
    await expect(view).toHaveValue(initialMode === 'world' ? 'oblique' : 'world');
    await expect(view).toBeEnabled(); await expect(view).toHaveAttribute('aria-busy', 'false');
    if (rearm) {
      await open.focus(); await page.keyboard.press('Enter');
      await dialog.getByRole('button', { name: 'Yard', exact: true }).focus(); await page.keyboard.press('Enter');
      await dialog.getByRole('button', { name: 'Place on map', exact: true }).focus(); await page.keyboard.press('Enter');
      await expect(dialog).toBeHidden();
    }
    await page.screenshot({ path: testInfo.outputPath('replacement-before-real-preflight-release.png') });
    await page.evaluate(() => (Reflect.get(window, 'rendererPlanPreflight') as Probe).release());
    await expect.poll(() => page.evaluate(target => (Reflect.get(window, 'rendererPlanPreflight') as Probe).replies.filter(reply =>
      reply.target.templateId === 'cell-basic' && reply.target.origin.x === target.origin.x && reply.target.origin.y === target.origin.y).length, chosen.target)).toBeGreaterThanOrEqual(2);
    if (!rearm) {
      await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toEqual([
        { type: 'PlaceRoomTemplate', templateId: chosen.target.templateId, origin: chosen.target.origin },
      ]);
      await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'rendererPlanPreflight') as Probe).commandResults)).toEqual([{ status: 'queued' }]);
    }
    await page.mouse.move(cursor.x + 2, cursor.y);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    if (rearm) {
      await expect(ghost).toHaveAttribute('data-ready', 'clear');
      await expect(ghost.locator('polygon')).toHaveCount(64);
      expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
      const current = await page.evaluate(() => (Reflect.get(window, 'rendererPlanPreflight') as Probe).replies.at(-1)!);
      expect(current.target.templateId).toBe('yard-basic'); expect(current.ok).toBe(true);
      await page.keyboard.press('Escape'); await expect(ghost).toBeHidden();
    } else {
      await expect(ghost).toBeHidden(); // original disposed guard reveals a new armed preview here
      expect((await sentCommands(page)).filter(command => /^(Place|Build|Remove)/u.test(String(command.type)))).toHaveLength(1);
    }
    await page.screenshot({ path: testInfo.outputPath('matching-receipt-or-new-tool.png') });
    console.log('RENDERER_PLAN_PREFLIGHT_RECEIPT', JSON.stringify({ initialMode, rearm, chosen }));
  });
}
