import { expect, test } from './network-changed-fixture';
import { countsSeries, currentTick, installTee } from './playtest-harness';

test('Full HD saved four-cell row keeps its north-facing doorway clear of later square walls', async ({ page }, testInfo) => {
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
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Four-cell row' }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(4);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/);
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(4);
  const tick = Math.max(0, await currentTick(page), (await countsSeries(page)).at(-1)?.tick ?? -1) + 2;
  await page.evaluate((executeAtTick) => {
    const worker = (window as unknown as { rowWorker?: Worker }).rowWorker;
    if (worker === undefined) throw new Error('restored simulation worker missing');
    worker.postMessage({ protocolVersion: 1, messageId: 'row-north-wall', kind: 'simulation/submit-command',
      payload: { commandId: 'row-north-wall', sequence: 1, executeAtTick,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
          data: { type: 'PlaceBuildOrder', orderId: 'row-north-wall', definitionId: 'wall-brick',
            x: 11, y: 18, footprint: 'square' } } } });
  }, tick);
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { refusal?: { reason?: string } } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/status-counts' &&
        message.payload?.refusal?.reason === 'build.unbuildable')), { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('north-row-doorway-refused-fullhd.png') });
});
