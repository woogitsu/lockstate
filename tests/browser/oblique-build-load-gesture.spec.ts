import { expect, test } from './network-changed-fixture';

test('Load discards an outgoing Build drag before its pointer is released', async ({ page }) => {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    class CommandTeeWorker extends RealWorker {
      public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        sent.push(message);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: CommandTeeWorker });
    (window as Window & { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker = sent;
  });
  const buildOrders = async (): Promise<number> => page.evaluate(() =>
    ((window as Window & { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/submit-command')
      .filter((message) => (message as { payload?: { command?: { data?: { type?: string } } } }).payload?.command?.data?.type === 'PlaceBuildOrder').length,
  );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');

  await page.mouse.move(900, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1060, 540, { steps: 8 });
  await expect(page.locator('.hud-build__target-value')).toContainText('whole squares');
  expect(await buildOrders()).toBe(0);

  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(250);
  expect(await buildOrders(), 'the outgoing Build drag submitted into the loaded worker').toBe(0);
});
