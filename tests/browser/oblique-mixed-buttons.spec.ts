import { expect, test } from './network-changed-fixture';

test('right-button camera turn owns the pointer when left Build is pressed afterward', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');
  await page.getByRole('region', { name: 'Minimap' }).getByRole('button', { name: 'Expand' }).click();
  const viewport = page.locator('.hud-minimap__viewport');
  await expect(viewport).toBeVisible();
  const before = await viewport.getAttribute('style');

  await page.mouse.move(900, 500);
  await page.mouse.down({ button: 'right' });
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1060, 560, { steps: 6 });
  await page.waitForTimeout(200);
  const after = await viewport.getAttribute('style');
  await page.mouse.up({ button: 'right' });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(250);
  expect(await buildOrders(), 'left-button Build committed during a right-button camera turn').toBe(0);
  expect(after, 'the existing right-button turn stopped').not.toBe(before);
});
