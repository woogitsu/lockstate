import { expect, test } from './network-changed-fixture';
import { countsSeries, currentTick, installTee } from './playtest-harness';

test('Full HD worker keeps a saved pending Cell doorway clear of a later ordinary wall', async ({ page }, testInfo) => {
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
    worker.postMessage({ protocolVersion: 1, messageId: `late-wall.${sequence}`, kind: 'simulation/submit-command',
      payload: { commandId: `late-wall.${sequence}`, sequence, executeAtTick: tick,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone', data: command } } });
  }, { sequence, command, tick: Math.max(0, await currentTick(page), (await countsSeries(page)).at(-1)?.tick ?? -1) + 2 });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/ready'))).toBe(true);
  await submit(0, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await expect.poll(() => currentTick(page)).toBeGreaterThan(3);
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.tick).toBeGreaterThan(3);
  await submit(1, { type: 'PlaceBuildOrder', orderId: 'doorway-wall-browser', definitionId: 'wall-brick',
    x: 11, y: 17, footprint: 'square' });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { commandId?: string; status?: string } }> }).lockstateFromWorker ?? [])
      .find((message) => message.kind === 'simulation/command-result' && message.payload?.commandId === 'late-wall.1')?.payload?.status)).toBe('queued');
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { refusal?: { reason?: string } } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/status-counts' &&
        message.payload?.refusal?.reason === 'build.unbuildable'))).toBe(true);
  await expect(page.locator('.hud-alerts__list')).toContainText('nothing can be built on that tile');
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('late-ordinary-wall-refused-fullhd.png') });
});
