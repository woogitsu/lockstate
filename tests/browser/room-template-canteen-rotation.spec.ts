import { expect, test } from './network-changed-fixture';
import { countsSeries, installTee } from './playtest-harness';

test('Full HD worker completes and restores a quarter-turned canteen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.addInitScript(() => {
    const RealWorker = Worker;
    class ProbedWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { rotationWorker: Worker }).rotationWorker = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbedWorker as typeof Worker;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await expect.poll(async () => (await countsSeries(page)).length).toBeGreaterThan(0);
  const submit = async (messageId: string, executeAtTick: number, data: Record<string, unknown>) => page.evaluate(
    ({ messageId, executeAtTick, data }) => {
      const worker = (window as unknown as { rotationWorker?: Worker }).rotationWorker;
      if (worker === undefined) throw new Error('simulation worker missing');
      worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/submit-command', payload: {
        commandId: messageId, sequence: 0, executeAtTick,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1,
          transport: 'structured-clone', data },
      } });
    }, { messageId, executeAtTick, data });
  await submit('rotate-canteen', 0,
    { type: 'PlaceRoomTemplate', templateId: 'canteen-basic', origin: { x: 10, y: 10 }, quarterTurns: 1 });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { commandId?: string; status?: string } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/command-result' &&
        message.payload?.commandId === 'rotate-canteen' && message.payload.status === 'queued'))).toBe(true);
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);
  const restoredPreflight = await page.evaluate(async () => {
    const worker = (window as unknown as { rotationWorker?: Worker }).rotationWorker;
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
          target: { kind: 'room-template', templateId: 'canteen-basic', origin: { x: 10, y: 10 }, quarterTurns: 1 } } });
    });
  });
  expect(restoredPreflight).toMatchObject({ ok: false, reason: 'structure-occupied' });
  await page.screenshot({ path: testInfo.outputPath('rotated-canteen-restored-fullhd.png') });
});
