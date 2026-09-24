import { expect, test } from './network-changed-fixture';

test.use({ hasTouch: true });

test('arming Build reveals the map on a phone and one touch places the selected bed (#517)', async ({ page }) => {
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
    (window as typeof window & { lockstateSentToWorker: unknown[] }).lockstateSentToWorker = sent;
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();

  const mapCentre = { x: 188, y: 500 };
  const before = await page.evaluate(({ x, y }) => {
    const panel = document.querySelector<HTMLElement>('.hud-build');
    return { blocked: panel?.contains(document.elementFromPoint(x, y)) ?? false, collapsed: panel?.dataset['collapsed'] };
  }, mapCentre);
  expect(before).toEqual({ blocked: true, collapsed: 'false' });

  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build')).toHaveAttribute('data-collapsed', 'true');
  await expect(page.locator('.hud-build > .ui-panel__header .ui-panel__toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.hud-build > .ui-panel__header .ui-panel__toggle')).toBeFocused();
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, mapCentre)).toBe('CANVAS');

  await page.touchscreen.tap(mapCentre.x, mapCentre.y);
  await expect.poll(async () => page.evaluate(() =>
    (window as typeof window & { lockstateSentToWorker: Array<{ kind?: string; payload?: { command?: { data?: { type?: string } } } }> })
      .lockstateSentToWorker.filter((message) => message.kind === 'simulation/submit-command' && message.payload?.command?.data?.type === 'PlaceObject').length,
  )).toBe(1);

  await page.locator('.hud-build > .ui-panel__header .ui-panel__toggle').click();
  await expect(page.locator('.hud-build__arm')).toBeVisible();
  await expect(page.locator('.hud-build__arm')).toContainText('Stop placing');
});

test('arming Build keeps the desktop panel open beside the map (#517)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build')).toHaveAttribute('data-collapsed', 'false');
  expect(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.tagName)).toBe('CANVAS');
});
