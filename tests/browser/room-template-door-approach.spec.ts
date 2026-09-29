import { expect, test } from './network-changed-fixture';
import { installTee } from './playtest-harness';

test('Full HD mirrored cell preview blocks a queued edge wall across its doorway after Save and Load', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
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

  // An old-style edge wall is still a valid worker command/save. The new UI
  // places full squares, so use the real worker protocol for this legacy case.
  await page.evaluate(() => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker was not captured');
    worker.postMessage({
      protocolVersion: 1, messageId: 'door.approach.legacy', kind: 'simulation/submit-command',
      payload: {
        commandId: 'door.approach.legacy', sequence: 0, executeAtTick: 0,
        command: {
          schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
          data: { type: 'PlaceBuildOrder', orderId: 'door-approach-wall', definitionId: 'wall-brick', x: 12, y: 17, edge: 'north' },
        },
      },
    });
  });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { status?: string; commandId?: string } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/command-result' && message.payload?.commandId === 'door.approach.legacy' && message.payload.status === 'queued'))).toBe(true);

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally' }).check();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('blocked');
  await expect(dialog.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('mirrored-door-approach-blocked-fullhd.png') });

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('checkbox', { name: 'Mirror horizontally' }).check();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(restored.getByRole('status')).toContainText('blocked');
  await expect(restored.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
});
