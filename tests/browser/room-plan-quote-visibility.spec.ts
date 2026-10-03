import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

async function preflightTarget(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const messages = (window as unknown as { lockstateSentToWorker: Array<{ payload?: { projectionId?: string; target?: unknown } }> }).lockstateSentToWorker;
    return messages.filter(message => message.payload?.projectionId === 'world/room-template-preflight').at(-1)?.payload?.target;
  });
}

async function measureQuote(page: Page) {
  return page.locator('.room-template-world-ghost').evaluate(layer => {
    const canvas = document.querySelector('#game-root canvas')!;
    const canvasBox = canvas.getBoundingClientRect();
    const bounds = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const safe = {
      left: Math.max(canvasBox.left, bounds('.hud__tabs').right, bounds('.hud__corner').right) + 8,
      right: Math.min(canvasBox.right, bounds('.hud__rail').left) - 8,
      top: Math.max(canvasBox.top, bounds('.hud-strip').bottom) + 8,
      bottom: Math.min(canvasBox.bottom, innerHeight) - 8,
    };
    const inside = (r: DOMRect) => r.left >= safe.left - 1 && r.right <= safe.right + 1
      && r.top >= safe.top - 1 && r.bottom <= safe.bottom + 1;
    const label = layer.querySelector('[role="status"]')!;
    const range = document.createRange();
    range.selectNodeContents(label);
    const lines = [...range.getClientRects()];
    const clippedLines = lines.filter(line => !inside(line));
    // The decorative readout passes pointer input through to the map. If a
    // glyph endpoint lands on a HUD panel or outside the clipped canvas, that
    // text cannot be treated as fully visible just because its node exists.
    const hiddenSamples = lines.flatMap(line => [line.left + 1, (line.left + line.right) / 2, line.right - 1]
      .map(x => ({ x, y: (line.top + line.bottom) / 2 })))
      .filter(point => document.elementFromPoint(point.x, point.y) !== canvas);
    const box = (rect: DOMRect) => ({ left: +rect.left.toFixed(2), right: +rect.right.toFixed(2), top: +rect.top.toFixed(2), bottom: +rect.bottom.toFixed(2), width: +rect.width.toFixed(2), height: +rect.height.toFixed(2) });
    const polygons = [...layer.querySelectorAll('polygon')];
    const r = label.getBoundingClientRect();
    const rectangle = [{ x: r.left, y: r.top }, { x: r.right, y: r.top }, { x: r.right, y: r.bottom }, { x: r.left, y: r.bottom }];
    const overlaps = polygons.filter(polygon => {
      const matrix = polygon.getScreenCTM()!;
      const points = [...polygon.points].map(point => new DOMPoint(point.x, point.y).matrixTransform(matrix));
      const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...points.map((a, i) => {
        const b = points[(i + 1) % points.length]!;
        return { x: -(b.y - a.y), y: b.x - a.x };
      })];
      return axes.every(axis => {
        const a = points.map(point => point.x * axis.x + point.y * axis.y);
        const b = rectangle.map(point => point.x * axis.x + point.y * axis.y);
        return Math.min(...a) < Math.max(...b) && Math.min(...b) < Math.max(...a);
      });
    }).length;
    return {
      safe, canvas: box(canvasBox), label: box(r), labelInside: inside(r),
      clippedLines: clippedLines.map(box), hiddenSampleCount: hiddenSamples.length,
      footprintInside: polygons.every(polygon => inside(polygon.getBoundingClientRect())), overlaps,
    };
  });
}

for (const scale of [1, 2]) {
  test(`Full HD ${scale * 100}% complete room-plan quote stays visible beside the entire fitted footprint`, async ({ page }, testInfo) => {
    await installTee(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(uiScale => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale }));
    }, scale);
    await page.goto('/?renderer=oblique');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const open = page.getByRole('button', { name: 'Room plans', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    const ghost = page.locator('.room-template-world-ghost');
    const label = ghost.locator('[role="status"]');
    await open.click();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    await page.mouse.move(910, 390);
    await expect(ghost.locator('polygon')).toHaveCount(28);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(label).toContainText('Materials catalogue value:');
    const basic = await measureQuote(page);
    console.log(`ROOM_QUOTE_VISIBILITY scale=${scale} plan=cell-basic`, JSON.stringify(basic));
    expect(basic.hiddenSampleCount, 'HUD panels or the canvas clip hide quote glyph endpoints').toBe(0);
    expect(basic.footprintInside, 'label repair must preserve the full approved floor preview').toBe(true);
    expect(basic.overlaps, 'readout must remain beside the occupied squares').toBe(0);

    await open.click();
    await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).click();
    await dialog.getByRole('checkbox', { name: 'Mirror horizontally before rotation' }).check();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    await page.mouse.move(880, 380);
    await expect(ghost.locator('polygon')).toHaveCount(112);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(label).toContainText('Materials catalogue value:');
    const chosen = await preflightTarget(page);
    const quote = await label.textContent();
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyE');
    await expect.poll(async () => (await measureQuote(page)).footprintInside).toBe(true);
    const row = await measureQuote(page);
    console.log(`ROOM_QUOTE_VISIBILITY scale=${scale} plan=cell-row-four`, JSON.stringify(row));
    await page.screenshot({ path: testInfo.outputPath(`room-plan-quote-visible-${scale * 100}.png`) });
    expect(row.hiddenSampleCount).toBe(0);
    expect(row.overlaps).toBe(0);
    expect(await preflightTarget(page), 'option3 preserves the chosen origin until physical movement').toEqual(chosen);
    expect(await label.textContent(), 'fitting or wrapping cannot change the worker material quote').toBe(quote);
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
    await open.click();
    await dialog.getByRole('button', { name: 'Kitchen', exact: true }).click();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    await page.mouse.move(910, 390);
    await expect(ghost).toHaveAttribute('data-ready', /clear|blocked/);
    await expect(label).toContainText('Materials catalogue value:');
    const kitchen = await measureQuote(page);
    console.log(`ROOM_QUOTE_VISIBILITY scale=${scale} plan=kitchen-basic`, JSON.stringify(kitchen));
    await page.screenshot({ path: testInfo.outputPath(`room-plan-kitchen-quote-${scale * 100}.png`) });
    expect(kitchen.hiddenSampleCount).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`room-plan-quote-visible-${scale * 100}.png`) });
  });
}
