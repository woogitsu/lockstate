import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('mirrored four-cell row exact ghost follows stationary cursor through camera turn and rejects overlap', async ({ page }, testInfo) => {
  await installTee(page);
  // The shared tee excludes large projections. Capture only this small reply
  // to await the authoritative rejected second click rather than a timer.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const replies: unknown[] = [];
    class PreflightTee extends NativeWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => {
          const message = event.data as { kind?: string; payload?: { projectionId?: string } };
          if (message.kind === 'simulation/projection' && message.payload?.projectionId === 'world/room-template-preflight') replies.push(message);
        });
      }
    }
    window.Worker = PreflightTee;
    (window as unknown as { rowPreflightReplies: unknown[] }).rowPreflightReplies = replies;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally' }).check();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  const cursor = { x: 880, y: 380 };
  await page.mouse.move(cursor.x, cursor.y);
  const ghost = page.locator('.room-template-world-ghost');
  await expect(ghost.locator('polygon')).toHaveCount(112);
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  const chosenOrigin = await page.evaluate(() => {
    const messages = (window as unknown as { lockstateSentToWorker: Array<{ payload?: { projectionId?: string; target?: { origin: { x: number; y: number } } } }> }).lockstateSentToWorker;
    return messages.filter(message => message.payload?.projectionId === 'world/room-template-preflight').at(-1)!.payload!.target!.origin;
  });
  const before = await ghost.locator('polygon').first().getAttribute('points');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyE');
  await expect.poll(() => ghost.locator('polygon').first().getAttribute('points')).not.toBe(before);
  await page.screenshot({ path: testInfo.outputPath('mirrored-row-turned-stationary-cursor.png') });
  // Approved fit/pan moves the camera while retaining the world origin.
  // Full visibility replaces the old cursor-hotspot assertion.
  await expect.poll(() => ghost.locator('polygon').evaluateAll(polygons => polygons.every(polygon => {
    const rect = polygon.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= document.querySelector('.hud-strip')!.getBoundingClientRect().bottom && rect.bottom <= innerHeight;
  }))).toBe(true);
  const originCentre = await ghost.locator('polygon').first().evaluate(polygon => {
    const rect = polygon.getBoundingClientRect(); return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
  });
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await page.mouse.click(cursor.x, cursor.y);
  await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toMatchObject([{ type: 'PlaceRoomTemplate', templateId: 'cell-row-four', mirrorX: true, origin: chosenOrigin }]);
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(originCentre.x, originCentre.y);
  await expect(ghost).toHaveAttribute('data-ready', 'blocked');
  const preflightReplies = () => page.evaluate(() => (window as unknown as { rowPreflightReplies: unknown[] }).rowPreflightReplies.length);
  const beforeRefusal = await preflightReplies();
  await page.mouse.click(originCentre.x, originCentre.y);
  await expect.poll(preflightReplies).toBeGreaterThan(beforeRefusal);
  expect(await page.evaluate(() => (window as unknown as { rowPreflightReplies: Array<{ payload: { view: { data: { ok: boolean } } } }> }).rowPreflightReplies.at(-1)?.payload.view.data.ok)).toBe(false);
  expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
});
