import { expect, test } from './network-changed-fixture';
import { countsSeries, currentTick, installTee } from './playtest-harness';

test('Full HD worker refuses a later plan that seals a completed saved Cell doorway', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.addInitScript(() => {
    const RealWorker = Worker;
    class ProbedWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { roomPlanWorker: Worker }).roomPlanWorker = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbedWorker as typeof Worker;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  const submit = async (sequence: number, originY: number) => page.evaluate(({ sequence, originY, tick }) => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker missing');
    worker.postMessage({ protocolVersion: 1, messageId: `completed-door.${sequence}`, kind: 'simulation/submit-command',
      payload: { commandId: `completed-door.${sequence}`, sequence, executeAtTick: tick,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
          data: { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: originY } } } } });
  }, { sequence, originY, tick: Math.max(0, await currentTick(page), (await countsSeries(page)).at(-1)?.tick ?? -1) + 2 });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/ready'))).toBe(true);
  await submit(0, 10);
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.tick).toBeGreaterThan(3);
  const verdict = await page.evaluate(async () => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('restored simulation worker missing');
    const messageId = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => { worker.removeEventListener('message', receive); reject(new Error('preflight timed out')); }, 5_000);
      const receive = (event: MessageEvent) => {
        const message = event.data as { kind?: string; replyTo?: string; payload?: { view?: { data?: unknown } } };
        if (message.kind !== 'simulation/projection' || message.replyTo !== messageId) return;
        clearTimeout(timeout);
        worker.removeEventListener('message', receive);
        resolve(message.payload?.view?.data);
      };
      worker.addEventListener('message', receive);
      worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-projection',
        payload: { projectionId: 'world/room-template-preflight',
          target: { kind: 'room-template', templateId: 'cell-basic', origin: { x: 10, y: 17 } } } });
    });
  });
  expect(verdict).toMatchObject({ ok: false, reason: 'structure-occupied', tile: { x: 11, y: 17 } });
  await submit(1, 17);
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { commandId?: string; status?: string } }> }).lockstateFromWorker ?? [])
      .find((message) => message.kind === 'simulation/command-result' && message.payload?.commandId === 'completed-door.1')?.payload?.status)).toBe('queued');
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { refusal?: { reason?: string } } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/status-counts' &&
        message.payload?.refusal?.reason === 'build.unbuildable'))).toBe(true);
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('completed-doorway-refused-fullhd.png') });
});
