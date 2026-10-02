import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

interface Point { x: number; y: number }

// Independent inverse of the fresh prison's documented -45°/45° framing.
// Do not ask the scene or its target readout where the released run belongs.
async function expectedRun(page: Page, from: Point, to: Point): Promise<Point[]> {
  return page.evaluate(({ from, to }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
    if (!canvas) throw new Error('Missing world canvas');
    const bounds = canvas.getBoundingClientRect();
    const pick = (point: Point): Point => {
      const across = ((point.x - bounds.x) * canvas.width / bounds.width - canvas.width / 2) / 1.25;
      const depth = ((point.y - bounds.y) * canvas.height / bounds.height - canvas.height / 2) / (1.25 * Math.SQRT1_2);
      return { x: Math.floor((1024 + Math.SQRT1_2 * (across - depth)) / 64),
        y: Math.floor((1024 + Math.SQRT1_2 * (across + depth)) / 64) };
    };
    const start = pick(from), end = pick(to);
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    const distance = horizontal ? end.x - start.x : end.y - start.y;
    return Array.from({ length: Math.abs(distance) + 1 }, (_, i) => horizontal
      ? { x: start.x + Math.sign(distance) * i, y: start.y }
      : { x: start.x, y: start.y + Math.sign(distance) * i });
  }, { from, to });
}

for (const scale of [1, 2]) {
  test(`Full HD ${scale * 100}% angled canvas-origin Build drag retains its whole run beneath a native HUD control`, async ({ page }, testInfo) => {
    await installTee(page);
    await page.addInitScript(scale => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
      const events: Array<{ type: string; target: string; hit: string; buttons: number }> = [];
      (window as unknown as { nativeHudDragEvents: typeof events }).nativeHudDragEvents = events;
      for (const type of ['pointerdown', 'pointerup', 'pointerout', 'gotpointercapture', 'lostpointercapture']) {
        window.addEventListener(type, event => {
          const pointer = event as PointerEvent;
          events.push({ type, target: (event.target as Element | null)?.tagName ?? '',
            hit: document.elementFromPoint(pointer.clientX, pointer.clientY)?.tagName ?? '', buttons: pointer.buttons });
        }, true);
      }
    }, scale);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?renderer=oblique');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.locator('.hud-build__arm').click();
    await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');

    const run = async (from: Point, to: Point): Promise<void> => {
      const expected = await expectedRun(page, from, to);
      expect(expected.length).toBeGreaterThan(1);
      expect(expected.every(p => p.x >= 0 && p.x < 32 && p.y >= 0 && p.y < 32)).toBe(true);
      const before = (await sentCommands(page)).filter(c => c.type === 'PlaceBuildOrder').length;
      await page.mouse.move(from.x, from.y);
      expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, from)).toBe('CANVAS');
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      const target = await page.locator('.hud-build__target-value').innerText();
      await page.screenshot({ path: testInfo.outputPath(`held-run-${before}.png`) });
      await page.mouse.up();
      const events = await page.evaluate(() => (window as unknown as { nativeHudDragEvents: unknown[] }).nativeHudDragEvents);
      await testInfo.attach(`native-run-${before}`, { body: JSON.stringify({ from, to, expected, target, events }, null, 2), contentType: 'application/json' });
      await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceBuildOrder').length,
        { message: 'the native canvas-origin drag must submit every square through its release beneath the HUD' }).toBe(before + expected.length);
      const produced = (await sentCommands(page)).filter(c => c.type === 'PlaceBuildOrder').slice(before);
      expect(produced.map(c => ({ x: c.x, y: c.y }))).toEqual(expected);
      expect(produced.every(c => c.footprint === 'square' && c.definitionId === 'wall-brick')).toBe(true);
      expect(target).toMatch(new RegExp(`^${expected.length} whole squares`));
      await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');
    };

    // An uncovered-map control proves framing, arming and actual worker orders.
    await run({ x: 800, y: 500 }, { x: 940, y: 500 });
    const category = page.getByRole('combobox', { name: 'Category', exact: true });
    const box = await category.boundingBox();
    if (!box) throw new Error('Category not visible');
    const end = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const rail = await page.locator('.hud__side').boundingBox();
    if (!rail) throw new Error('Build rail missing');
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, end)).toBe('SELECT');
    await run({ x: rail.x - 180, y: end.y }, end);

    // A fresh press that starts on the native control must still belong to it.
    const count = (await sentCommands(page)).filter(c => c.type === 'PlaceBuildOrder').length;
    await category.click();
    await page.keyboard.press('Escape');
    await expect(category).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(category).toHaveValue('structure');
    expect((await sentCommands(page)).filter(c => c.type === 'PlaceBuildOrder')).toHaveLength(count);
  });
}
