import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { observeUnroundedMinimapViewport, minimapGroundReference, type MinimapViewportPercent } from './minimap-unrounded-reference';

interface Point { x: number; y: number }
interface MouseReceipt { type: string; button: number; buttons: number; trusted: boolean; canvas: boolean }
async function groundReference(page: Page) {
  const actual = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas')!;
    const map = document.querySelector<HTMLCanvasElement>('.hud-minimap canvas')!;
    const box = canvas.getBoundingClientRect();
    return { canvas: { width: canvas.width, height: canvas.height, left: box.left, top: box.top, widthCss: box.width, heightCss: box.height },
      map: { width: map.width, height: map.height }, percent: (Reflect.get(window, 'unroundedMinimapViewport') as () => MinimapViewportPercent)() };
  });
  expect(actual.map).toEqual({ width: 32, height: 32 });
  const independent = minimapGroundReference(actual.canvas, actual.map, actual.percent);
  const tile = (p: Point) => ({ x: Math.floor(actual.percent.left / 100 * actual.map.width +
    (p.x - actual.canvas.left) * actual.canvas.width / actual.canvas.widthCss / independent.zoomX / 64),
    y: Math.floor(actual.percent.top / 100 * actual.map.height +
    (p.y - actual.canvas.top) * actual.canvas.height / actual.canvas.heightCss / independent.zoomY / 64) });
  return { actual, independent, tile };
}
const construction = async (page: Page) => (await sentCommands(page)).filter(c => /^(Place|Build|Remove|Zone|Unzone)/u.test(String(c.type)));

for (const tool of ['wall', 'bed', 'yard'] as const) test(`World FullHD ${tool}: native middle release does not complete a held left build gesture`, async ({ page }, info) => {
  await installTee(page); await page.addInitScript(observeUnroundedMinimapViewport);
  await page.addInitScript(() => {
    localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: 1 }));
    const events: MouseReceipt[] = []; Reflect.set(window, 'constructionChordMouse', events);
    for (const type of ['mousedown', 'mouseup']) window.addEventListener(type, event => {
      const e = event as MouseEvent;
      events.push({ type, button: e.button, buttons: e.buttons, trusted: e.isTrusted, canvas: e.target === document.querySelector('#game-root canvas') });
    }, true);
  });
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  if (tool === 'yard') {
    await page.locator('.ui-tab[data-tab="zones"]').click();
    await page.locator('.hud-rooms__list [data-room="room.yard"]').click();
    await page.locator('.hud-rooms__arm').click();
    await expect(page.locator('.hud-rooms__arm')).toHaveAttribute('aria-pressed', 'true');
  } else {
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.locator(`.hud-build__list [data-buildable="${tool === 'wall' ? 'wall-brick' : 'bed-wooden'}"]`).click();
    await page.locator('.hud-build__arm').click();
    await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'true');
  }
  const ref = await groundReference(page);
  const from = ref.independent.screen(10.25, 10.25);
  const to = ref.independent.screen(tool === 'yard' ? 17.25 : 12.25, tool === 'yard' ? 17.25 : 10.25);
  for (const point of [from, to]) expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), point)).toBe(true);
  const a = ref.tile(from), b = ref.tile(to);
  expect(a).toEqual({ x: 10, y: 10 }); expect(b).toEqual(tool === 'yard' ? { x: 17, y: 17 } : { x: 12, y: 10 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'left' }); await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const held = await page.evaluate(() => (Reflect.get(window, 'constructionChordMouse') as MouseReceipt[]).filter(e => e.canvas).slice(-3));
  expect(held).toEqual([
    { type: 'mousedown', button: 0, buttons: 1, trusted: true, canvas: true },
    { type: 'mousedown', button: 1, buttons: 5, trusted: true, canvas: true },
    { type: 'mouseup', button: 1, buttons: 1, trusted: true, canvas: true },
  ]);
  await page.screenshot({ path: info.outputPath('middle-released-primary-still-held.png') });
  expect(await construction(page)).toHaveLength(0);
  // Rooms completion stages an explicit confirmation. It must remain hidden
  // while left is still held; no automatic ZoneRoom is expected even on old code.
  if (tool === 'yard') await expect(page.locator('.hud-rooms__confirm')).toBeHidden();
  await page.mouse.up({ button: 'left' });
  if (tool === 'yard') {
    const confirm = page.locator('.hud-rooms__confirm'); await expect(confirm).toBeVisible(); await expect(confirm).toBeEnabled();
    expect(await construction(page)).toHaveLength(0); await confirm.click();
    await expect.poll(() => construction(page)).toMatchObject([{ type: 'ZoneRoom', roomId: 'room.yard', x: 10, y: 10, width: 8, height: 8 }]);
    expect(await construction(page)).toHaveLength(1);
  } else if (tool === 'bed') {
    await expect.poll(() => construction(page)).toMatchObject([{ type: 'PlaceObject', definitionId: 'bed-wooden', x: 12, y: 10 }]);
    expect(await construction(page)).toHaveLength(1);
  } else {
    await expect.poll(() => construction(page)).toMatchObject([
      { type: 'PlaceBuildOrder', definitionId: 'wall-brick', footprint: 'square', x: 10, y: 10 },
      { type: 'PlaceBuildOrder', definitionId: 'wall-brick', footprint: 'square', x: 11, y: 10 },
      { type: 'PlaceBuildOrder', definitionId: 'wall-brick', footprint: 'square', x: 12, y: 10 },
    ]);
    expect(await construction(page)).toHaveLength(3);
  }
  const final = await page.evaluate(() => (Reflect.get(window, 'constructionChordMouse') as MouseReceipt[]).filter(e => e.canvas).at(-1));
  expect(final).toEqual({ type: 'mouseup', button: 0, buttons: 0, trusted: true, canvas: true });
  await page.screenshot({ path: info.outputPath('actual-primary-release-completed-gesture.png') });
  console.log('WORLD_CONSTRUCTION_CHORD', JSON.stringify({ tool, from, to, a, b, reference: ref.actual, held, final, commands: await construction(page) }));
});
