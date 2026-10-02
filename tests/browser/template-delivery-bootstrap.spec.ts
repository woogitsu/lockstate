import { expect, test } from './network-changed-fixture';
import { countsSeries, currentTick, installTee } from './playtest-harness';

test('Full HD builds the first Cell after furnished delivery plans and reload', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.addInitScript(() => {
    const RealWorker = Worker;
    class ProbedWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { bootstrapWorker: Worker }).bootstrapWorker = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbedWorker as typeof Worker;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/ready'))).toBe(true);

  const submit = (sequence: number, templateId: string, x: number, executeAtTick: number) => page.evaluate(
    ({ sequence, templateId, x, executeAtTick }) => {
      const worker = (window as unknown as { bootstrapWorker?: Worker }).bootstrapWorker;
      if (worker === undefined) throw new Error('simulation worker missing');
      const commandId = `bootstrap.${sequence}`;
      worker.postMessage({ protocolVersion: 1, messageId: commandId, kind: 'simulation/submit-command',
        payload: { commandId, sequence, executeAtTick,
          command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
            data: { type: 'PlaceRoomTemplate', templateId, origin: { x, y: 5 } } } } });
    }, { sequence, templateId, x, executeAtTick });
  await submit(0, 'storage-room-basic', 5, 0);
  await submit(1, 'delivery-bay-basic', 12, 0);
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(2);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });

  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(2);
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.prisoners).toBe(0);
  const tick = Math.max(0, await currentTick(page), (await countsSeries(page)).at(-1)?.tick ?? -1) + 2;
  await submit(2, 'cell-basic', 20, tick);
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(3);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.screenshot({ path: testInfo.outputPath('first-cell-after-furnished-route-fullhd.png') });
});
