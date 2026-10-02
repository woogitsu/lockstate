import { writeFile } from 'node:fs/promises';
import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

for (const button of ['middle', 'right'] as const) {
  test(`native ${button} camera drag ends at HUD exit and cannot resume on reentry`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await installTee(page);
    await page.addInitScript(() => {
      const samples: { type: string; buttons: number; target: string; related: string | null }[] = [];
      Reflect.set(window, 'cameraExitSamples', samples);
      for (const type of ['mouseout', 'mouseover', 'mousemove', 'mousedown', 'mouseup']) {
        window.addEventListener(type, event => {
          const mouse = event as MouseEvent;
          samples.push({ type, buttons: mouse.buttons,
            target: (event.target as Element | null)?.tagName ?? '',
            related: (mouse.relatedTarget as Element | null)?.tagName ?? null });
        }, { capture: true });
      }
    });
    await page.goto('/?renderer=oblique');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const canvas = page.locator('#game-root canvas');
    const minimap = page.locator('.hud-minimap__viewport');
    const selector = page.getByRole('combobox', { name: 'Category', exact: true });
    const box = await selector.boundingBox();
    expect(box).not.toBeNull();
    const hud = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const start = { x: box!.x - 380, y: hud.y };
    const moved = { x: start.x + 60, y: start.y };
    const returned = { x: start.x + 100, y: start.y };
    for (const point of [start, moved, returned]) {
      expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, point)).toBe('CANVAS');
    }
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, hud)).toBe('SELECT');
    const commands = await sentCommands(page);
    // The canvas spans the viewport: its screenshot also composites the HUD.
    // Compare uncovered map pixels so SELECT hover painting cannot impersonate motion.
    const mapClip = { x: 400, y: 300, width: 1000, height: 400 };
    for (const point of [{ x: 400, y: 300 }, { x: 1399, y: 699 }]) {
      expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, point)).toBe('CANVAS');
    }
    const painted = async (): Promise<Buffer> => {
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      return page.screenshot({ clip: mapClip });
    };
    await page.mouse.move(start.x, start.y);
    await expect.poll(async () => (await painted()).equals(await painted())).toBe(true);
    const initial = await painted();
    await page.mouse.down({ button });
    try {
      await page.mouse.move(moved.x, moved.y, { steps: 4 });
      expect((await painted()).equals(initial), 'unbroken camera drag did not move the visible world').toBe(false);
      await page.mouse.move(hud.x, hud.y, { steps: 6 });
      await expect.poll(() => page.evaluate(() => Reflect.get(window, 'cameraExitSamples')
        .some((sample: { type: string; target: string; related: string | null }) => sample.type === 'mouseout' && sample.target === 'CANVAS' && sample.related !== 'CANVAS'))).toBe(true);
      const stopped = await painted();
      await canvas.screenshot({ path: testInfo.outputPath(`${button}-stopped-fullhd.png`) });
      const viewport = await minimap.getAttribute('style');
      await page.mouse.move(returned.x, returned.y, { steps: 1 });
      const reentered = await painted();
      await canvas.screenshot({ path: testInfo.outputPath(`${button}-reentered-fullhd.png`) });
      const viewportAfter = await minimap.getAttribute('style');
      const samples = await page.evaluate(() => Reflect.get(window, 'cameraExitSamples'));
      await writeFile(testInfo.outputPath(`${button}-stopped.png`), stopped);
      await writeFile(testInfo.outputPath(`${button}-reentered.png`), reentered);
      await writeFile(testInfo.outputPath(`${button}-events.json`), JSON.stringify({ start, moved, hud, returned, mapClip, samples, commands, viewport, viewportAfter,
        mapUnchanged: reentered.equals(stopped), commandsAfter: await sentCommands(page) }, null, 2));
      expect(samples.at(-1).buttons).toBe(button === 'middle' ? 4 : 2);
      expect(reentered.equals(stopped), 'camera resumed a cancelled canvas-origin drag when it reentered from HUD').toBe(true);
      await expect(minimap).toHaveAttribute('style', viewport ?? '');
      expect(await sentCommands(page)).toEqual(commands);
    } finally {
      await page.mouse.up({ button });
    }
    // Cancellation must not mute a later camera press.
    const beforeFresh = await painted();
    await page.mouse.down({ button });
    await page.mouse.move(start.x, start.y, { steps: 4 });
    await page.mouse.up({ button });
    expect((await painted()).equals(beforeFresh), 'camera did not accept a fresh drag after cancellation').toBe(false);
  });
}
