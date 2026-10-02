import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

for (const mode of ['world', 'oblique'] as const) {
  test(`${mode} horizontal native wheel preserves the view and armed square`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await installTee(page);
    await page.addInitScript(() => {
      const samples: { dx: number; dy: number; canvas: boolean }[] = [];
      Reflect.set(window, 'cameraWheelSamples', samples);
      window.addEventListener('wheel', event => samples.push({
        dx: event.deltaX, dy: event.deltaY, canvas: event.target instanceof HTMLCanvasElement,
      }), { capture: true });
    });
    await page.goto(mode === 'world' ? '/' : '/?renderer=oblique');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.locator('.hud-build__arm').click();
    await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');
    const canvas = page.locator('#game-root canvas');
    const target = page.locator('.hud-build__target-value');
    const minimap = page.locator('.hud-minimap__viewport');
    const pointer = { x: 1100, y: 600 };
    await page.mouse.move(pointer.x, pointer.y);
    expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.tagName, pointer)).toBe('CANVAS');
    await expect(target).toHaveText(/whole squares/);
    const quote = await target.innerText();
    const commands = await sentCommands(page);
    const painted = async (): Promise<Buffer> => {
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      return canvas.screenshot();
    };
    await expect.poll(async () => (await painted()).equals(await painted())).toBe(true);
    const before = await painted();
    await writeFile(testInfo.outputPath(`${mode}-before.png`), before);
    const viewport = await minimap.getAttribute('style');
    for (const [index, dx] of [-120, 120].entries()) {
      await page.mouse.wheel(dx, 0);
      await expect.poll(() => page.evaluate(() => Reflect.get(window, 'cameraWheelSamples').length)).toBe(index + 1);
      expect(await page.evaluate(() => Reflect.get(window, 'cameraWheelSamples').at(-1))).toEqual({ dx, dy: 0, canvas: true });
      const after = await painted();
      const measured = { dx, dy: 0, unchangedPixels: after.equals(before),
        viewportBefore: viewport, viewportAfter: await minimap.getAttribute('style'),
        quoteBefore: quote, quoteAfter: await target.innerText(),
        commandsBefore: commands, commandsAfter: await sentCommands(page),
        events: await page.evaluate(() => Reflect.get(window, 'cameraWheelSamples')) };
      await writeFile(testInfo.outputPath(`${mode}-horizontal-${index}.png`), after);
      await writeFile(testInfo.outputPath(`${mode}-horizontal-${index}.json`), JSON.stringify(measured, null, 2));
      expect(measured.unchangedPixels, 'horizontal-only wheel changed the actual painted view').toBe(true);
      await expect(minimap).toHaveAttribute('style', viewport ?? '');
      await expect(target).toHaveText(quote);
      await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');
      expect(await sentCommands(page)).toEqual(commands);
    }
    // Both a vertical gesture and a diagonal gesture retain normal zoom and
    // the world square beneath the stationary native cursor.
    for (const [dx, dy] of [[0, -100], [80, 100]]) {
      const priorViewport = await minimap.getAttribute('style');
      await page.mouse.wheel(dx!, dy!);
      await expect(minimap).not.toHaveAttribute('style', priorViewport ?? '');
      await expect(target).toHaveText(quote);
      expect(await sentCommands(page)).toEqual(commands);
    }
    await page.screenshot({ path: testInfo.outputPath(`${mode}-horizontal-wheel-fullhd.png`) });
  });
}
import { writeFile } from 'node:fs/promises';
