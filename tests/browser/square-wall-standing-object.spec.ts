import { expect, test } from './network-changed-fixture';
import { countsSeries, currentTick, installTee } from './playtest-harness';

test('Full HD worker refuses a square wall on saved standing furniture', async ({ page }, testInfo) => {
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
  const submit = async (sequence: number, command: unknown) => page.evaluate(({ sequence, command, tick }) => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker missing');
    worker.postMessage({ protocolVersion: 1, messageId: `furniture-wall.${sequence}`, kind: 'simulation/submit-command',
      payload: { commandId: `furniture-wall.${sequence}`, sequence, executeAtTick: tick,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone', data: command } } });
  }, { sequence, command, tick: Math.max(0, await currentTick(page), (await countsSeries(page)).at(-1)?.tick ?? -1) + 2 });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/ready'))).toBe(true);
  const pendingCount = async () => page.evaluate(async () => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker missing');
    const messageId = crypto.randomUUID();
    return new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => { worker.removeEventListener('message', receive); reject(new Error('build queue timed out')); }, 5_000);
      const receive = (event: MessageEvent) => {
        const message = event.data as { kind?: string; replyTo?: string; payload?: { view?: { data?: unknown } } };
        if (message.kind !== 'simulation/projection' || message.replyTo !== messageId) return;
        clearTimeout(timeout);
        worker.removeEventListener('message', receive);
        const data = message.payload?.view?.data as { orders?: { total?: number } } | undefined;
        resolve(data?.orders?.total ?? -1);
      };
      worker.addEventListener('message', receive);
      worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/build-queue' } });
    });
  });
  await submit(0, { type: 'ZoneRoom', roomId: 'room.yard', x: 10, y: 10, width: 8, height: 8 });
  await submit(1, { type: 'PlaceObject', orderId: 'standing-desk-browser', definitionId: 'desk-wooden', x: 11, y: 11 });
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);
  await expect.poll(pendingCount, { timeout: 120_000 }).toBe(0);
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.tick).toBeGreaterThan(3);
  await submit(2, { type: 'PlaceBuildOrder', orderId: 'furniture-wall-browser', definitionId: 'wall-brick',
    x: 12, y: 11, footprint: 'square' });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { commandId?: string; status?: string } }> }).lockstateFromWorker ?? [])
      .find((message) => message.kind === 'simulation/command-result' && message.payload?.commandId === 'furniture-wall.2')?.payload?.status)).toBe('queued');
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { refusal?: { reason?: string } } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/status-counts' &&
        message.payload?.refusal?.reason === 'build.unbuildable'))).toBe(true);
  await expect(page.locator('.hud-alerts__list')).toContainText('nothing can be built on that tile');
  await expect.poll(pendingCount).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('square-wall-furniture-refused-fullhd.png') });
});
