import { expect, test } from './network-changed-fixture';

test('production composition root boots the opted-in oblique scene at Full HD', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  await expect(page.locator('.startup-error')).toHaveCount(0);
  const canvasSize = await page.locator('#game-root canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return { width: canvas.width, height: canvas.height };
  });
  expect(canvasSize.width).toBeGreaterThan(0);
  expect(canvasSize.height).toBeGreaterThan(0);
});

test('an angled world gesture reaches the real build command and survives save/load', async ({ page }) => {
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
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Build' }).click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');
  await page.mouse.move(900, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1060, 540, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await expect.poll(async () => page.evaluate(() =>
    ((window as Window & { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/submit-command')
      .filter((message) => (message as { payload?: { command?: { data?: { type?: string } } } }).payload?.command?.data?.type === 'PlaceBuildOrder').length,
  )).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Overview' }).click();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await expect(page.locator('#game-root canvas')).toBeVisible();
});

test('the minimap and HUD zoom move the active angled camera', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  const before = await canvas.screenshot();
  const minimap = page.locator('.hud-minimap__surface');
  await expect(minimap).toBeVisible();
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap has no visible bounds');
  await minimap.click({ position: { x: bounds.width * 0.85, y: bounds.height * 0.85 } });
  const afterNavigate = await canvas.screenshot();
  expect(afterNavigate.equals(before), 'the minimap did not change the angled world image').toBe(false);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const afterZoom = await canvas.screenshot();
  expect(afterZoom.equals(afterNavigate), 'HUD zoom did not change the angled world image').toBe(false);
});

test('remappable keyboard pans, turns and tilts the angled world without moving while typing', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  const canvas = page.locator('#game-root canvas');
  const initial = await canvas.screenshot();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  const panned = await canvas.screenshot();
  expect(panned.equals(initial), 'ArrowRight did not pan the angled ground').toBe(false);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyE');
  const turned = await canvas.screenshot();
  expect(turned.equals(panned), 'E did not turn the angled ground').toBe(false);
  await page.keyboard.down('KeyR');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyR');
  await page.waitForTimeout(100);
  const tilted = await canvas.screenshot();
  expect(tilted.equals(turned), 'R did not change the viewing angle').toBe(false);
  const textBox = await page.evaluate(() => {
    const field = document.createElement('input');
    field.id = 'oblique-keyboard-focus-check';
    field.style.position = 'fixed';
    field.style.top = '150px';
    document.body.append(field);
    field.focus();
    return field.id;
  });
  await expect(page.locator(`#${textBox}`)).toBeFocused();
  const focusedBaseline = await canvas.screenshot();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  expect((await canvas.screenshot()).equals(focusedBaseline), 'camera moved while a text field had focus').toBe(true);
  await page.locator(`#${textBox}`).evaluate((field) => field.remove());
});
