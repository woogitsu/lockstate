import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

interface Point { x: number; y: number }

// Independent fresh-prison inverse; the scene and HUD are consumers under test.
async function tileOf(page: Page, point: Point): Promise<Point> {
  return page.evaluate(point => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
    if (!canvas) throw new Error('Missing world canvas');
    const box = canvas.getBoundingClientRect();
    const across = ((point.x - box.x) * canvas.width / box.width - canvas.width / 2) / 1.25;
    const depth = ((point.y - box.y) * canvas.height / box.height - canvas.height / 2) / (1.25 * Math.SQRT1_2);
    return { x: Math.floor((1024 + Math.SQRT1_2 * (across - depth)) / 64),
      y: Math.floor((1024 + Math.SQRT1_2 * (across + depth)) / 64) };
  }, point);
}

async function openPaused(page: Page, scale: number): Promise<void> {
  await installTee(page);
  await page.addInitScript(scale => {
    localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
    const events: Array<{ type: string; target: string; hit: string; buttons: number }> = [];
    (window as unknown as { objectAreaEvents: typeof events }).objectAreaEvents = events;
    for (const type of ['pointerdown', 'pointerup', 'mouseup', 'pointerout', 'gotpointercapture', 'lostpointercapture']) {
      window.addEventListener(type, event => {
        const p = event as PointerEvent;
        events.push({ type, target: (p.target as Element | null)?.tagName ?? '',
          hit: document.elementFromPoint(p.clientX, p.clientY)?.tagName ?? '', buttons: p.buttons });
      }, true);
    }
  }, scale);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
}

async function drag(page: Page, from: Point, to: Point): Promise<void> {
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, from)).toBe('CANVAS');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
}

async function evidence(page: Page, info: TestInfo, detail: unknown): Promise<void> {
  const events = await page.evaluate(() => (window as unknown as { objectAreaEvents: unknown[] }).objectAreaEvents);
  const path = info.outputPath('native-object-area.json');
  await writeFile(path, JSON.stringify({ detail, events, workerCommands: await sentCommands(page) }, null, 2));
  await info.attach('native-object-area', { path, contentType: 'application/json' });
}

for (const scale of [1, 2]) {
  test(`Full HD ${scale * 100}% native object drag beneath Category keeps the Bed footprint at its released origin`, async ({ page }, info) => {
    await openPaused(page, scale);
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const bed = page.locator('.hud-build__list [data-buildable="bed-wooden"]');
    await bed.click();
    await expect(bed).toHaveAttribute('data-selected', 'true');
    await expect(page.locator('.hud-build__selected-footprint')).toHaveText('Occupied squares: 1 × 2');
    await page.locator('.hud-build__arm').click();
    await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'true');
    const target = page.locator('.hud-build__target-value');

    // An uncovered native click first proves the object sender is functional.
    const control = { x: 800, y: 450 };
    const controlTile = await tileOf(page, control);
    await page.mouse.click(control.x, control.y);
    await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceObject').length).toBe(1);
    expect((await sentCommands(page)).find(c => c.type === 'PlaceObject')).toMatchObject({ definitionId: 'bed-wooden', ...controlTile });

    const category = page.getByRole('combobox', { name: 'Category', exact: true });
    const box = await category.boundingBox();
    const rail = await page.locator('.hud__side').boundingBox();
    if (!box || !rail) throw new Error('Category or rail missing');
    const end = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const from = { x: rail.x - 180, y: end.y };
    const origin = await tileOf(page, end);
    expect(origin.x >= 0 && origin.x < 32 && origin.y >= 0 && origin.y + 2 <= 32).toBe(true);
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, end)).toBe('SELECT');
    await drag(page, from, end);
    const held = await target.innerText();
    await page.screenshot({ path: info.outputPath('held-bed-footprint.png') });
    await page.mouse.up();
    await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceObject').length).toBe(2);
    expect((await sentCommands(page)).filter(c => c.type === 'PlaceObject').at(-1)).toMatchObject({ definitionId: 'bed-wooden', ...origin });
    await evidence(page, info, { scale, from, end, origin, held });
    expect(held, 'the held Bed footprint must match the actual released worker origin beneath Category')
      .toBe(`1 × 2 tiles at ${origin.x}, ${origin.y}`);
    await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'true');
    await category.click();
    await page.keyboard.press('Escape');
    await expect(category).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(category).toHaveValue('structure');
    expect((await sentCommands(page)).filter(c => c.type === 'PlaceObject')).toHaveLength(2);
  });

  test(`Full HD ${scale * 100}% native Yard area drag beneath a camera control preserves the held rectangle through explicit confirmation`, async ({ page }, info) => {
    await openPaused(page, scale);
    await page.locator('.ui-tab[data-tab="zones"]').click();
    const yard = page.locator('.hud-rooms__list [data-room="room.yard"]');
    await yard.click();
    await expect(yard).toHaveAttribute('aria-checked', 'true');
    await page.locator('.hud-rooms__arm').click();
    await expect(page.locator('.hud-rooms__arm')).toHaveAttribute('aria-pressed', 'true');
    const turn = page.getByRole('button', { name: 'Rotate camera left', exact: true });
    const box = await turn.boundingBox();
    if (!box) throw new Error('Camera turn control missing');
    // Rooms intentionally hides its catalogue when armed. The explicit camera
    // control stays reachable and yields a legal at-least-eight-square Yard.
    const end = { x: box.x + 12, y: box.y + box.height / 2 };
    const from = { x: 1170, y: end.y };
    const a = await tileOf(page, from), b = await tileOf(page, end);
    const area = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x) + 1, height: Math.abs(b.y - a.y) + 1 };
    expect(area.width >= 8 && area.height >= 8 && area.x >= 0 && area.y >= 0 && area.x + area.width <= 32 && area.y + area.height <= 32).toBe(true);
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.closest('button')?.getAttribute('aria-label'), end)).toBe('Rotate camera left');
    await drag(page, from, end);
    const held = await page.locator('.hud-rooms__area-value').innerText();
    await page.screenshot({ path: info.outputPath('held-yard-area.png') });
    expect((await sentCommands(page)).filter(c => c.type === 'ZoneRoom')).toHaveLength(0);
    await page.mouse.up();
    const confirm = page.locator('.hud-rooms__confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeEnabled();
    expect((await sentCommands(page)).filter(c => c.type === 'ZoneRoom')).toHaveLength(0);
    await confirm.click();
    await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'ZoneRoom').length).toBe(1);
    expect((await sentCommands(page)).find(c => c.type === 'ZoneRoom')).toMatchObject({ roomId: 'room.yard', ...area });
    await evidence(page, info, { scale, from, end, area, held });
    expect(held, 'the held area beneath the HUD must match the exact rectangle explicitly confirmed to the worker')
      .toBe(`${area.width} × ${area.height} tiles at ${area.x}, ${area.y}`);
    await expect(page.locator('.hud-rooms__arm')).toHaveAttribute('aria-pressed', 'false');
    const minimap = page.locator('.hud-minimap__viewport');
    const beforeTurn = await minimap.getAttribute('style');
    await turn.click();
    await expect(minimap).not.toHaveAttribute('style', beforeTurn ?? '');
    expect((await sentCommands(page)).filter(c => c.type === 'ZoneRoom')).toHaveLength(1);
  });
}
