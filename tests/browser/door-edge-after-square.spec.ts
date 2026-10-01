import { expect, test } from './network-changed-fixture';

for (const renderer of ['default', 'oblique'] as const) {
  test(`door retains its chosen edge after a square-wall selection in ${renderer} view`, async ({ page }) => {
    await page.addInitScript(() => {
      const RealWorker = Worker;
      const sent: unknown[] = [];
      class CommandTeeWorker extends RealWorker {
        public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
          sent.push(message);
          if (transfer === undefined) super.postMessage(message);
          else super.postMessage(message, transfer);
        }
      }
      Object.defineProperty(window, 'Worker', { configurable: true, value: CommandTeeWorker });
      (window as Window & { lockstateDoorCommands?: unknown[] }).lockstateDoorCommands = sent;
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(renderer === 'oblique' ? '/?renderer=oblique' : '/');
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Build' }).click();
    await page.locator('.hud-build__arm').click();
    await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
    await expect(page.locator('.hud-build__list [data-buildable="door-wooden"]')).toHaveAttribute('data-selected', 'true');
    await page.mouse.move(900, 540);
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await expect.poll(async () => page.evaluate(() =>
      ((window as Window & { lockstateDoorCommands?: unknown[] }).lockstateDoorCommands ?? [])
        .filter((message) => (message as { kind?: string }).kind === 'simulation/submit-command')
        .map((message) => (message as { payload?: { command?: { data?: Record<string, unknown> } } }).payload?.command?.data)
        .filter((data) => data?.['type'] === 'PlaceBuildOrder' && data['definitionId'] === 'door-wooden').length,
    )).toBeGreaterThan(0);
    const orders = await page.evaluate(() =>
      ((window as Window & { lockstateDoorCommands?: unknown[] }).lockstateDoorCommands ?? [])
        .filter((message) => (message as { kind?: string }).kind === 'simulation/submit-command')
        .map((message) => (message as { payload?: { command?: { data?: Record<string, unknown> } } }).payload?.command?.data)
        .filter((data) => data?.['type'] === 'PlaceBuildOrder' && data['definitionId'] === 'door-wooden'),
    );
    expect(orders).toHaveLength(1);
    expect(['north', 'west']).toContain(orders[0]?.['edge']);
    expect(orders[0]?.['footprint']).not.toBe('square');
  });
}
