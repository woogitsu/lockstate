import { expect, test } from './network-changed-fixture';
import { installTee } from './playtest-harness';

test('Full HD mirrored cell preview blocks a pending furniture footprint across its doorway after Save and Load', async ({ page }, testInfo) => {
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

  // Submit a queued desk through the real worker before the
  // room plan, so the preview reads the same queued obstruction as placement.
  await page.evaluate(() => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker was not captured');
    worker.postMessage({
      protocolVersion: 1, messageId: 'door.approach.desk', kind: 'simulation/submit-command',
      payload: {
        commandId: 'door.approach.desk', sequence: 0, executeAtTick: 0,
        command: {
          schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
          data: { type: 'PlaceBuildOrder', orderId: 'door-approach-desk', definitionId: 'desk-wooden', x: 12, y: 17 },
        },
      },
    });
  });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { status?: string; commandId?: string } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/command-result' && message.payload?.commandId === 'door.approach.desk' && message.payload.status === 'queued'))).toBe(true);

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally' }).check();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('blocked');
  await expect(dialog.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('mirrored-door-object-approach-blocked-fullhd.png') });

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
