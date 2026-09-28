import { expect, test } from './network-changed-fixture';
import { countsSeries, installTee } from './playtest-harness';

test('Full HD worker completes and restores a half-turned four-cell row', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.addInitScript(() => {
    const RealWorker = Worker;
    class ProbedWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { rowWorker: Worker }).rowWorker = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbedWorker as typeof Worker;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await expect.poll(async () => (await countsSeries(page)).length).toBeGreaterThan(0);
  await page.evaluate(() => {
    const worker = (window as unknown as { rowWorker?: Worker }).rowWorker;
    if (worker === undefined) throw new Error('simulation worker missing');
    worker.postMessage({ protocolVersion: 1, messageId: 'half-turned-row', kind: 'simulation/submit-command',
      payload: { commandId: 'half-turned-row', sequence: 0, executeAtTick: 0,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1,
          transport: 'structured-clone', data: {
            type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, quarterTurns: 2,
          } } } });
  });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { commandId?: string; status?: string } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/command-result' &&
        message.payload?.commandId === 'half-turned-row' && message.payload.status === 'queued'))).toBe(true);
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(4);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(4);
  await page.screenshot({ path: testInfo.outputPath('half-turned-row-restored-fullhd.png') });
});
