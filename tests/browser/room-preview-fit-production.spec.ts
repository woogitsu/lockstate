import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

async function target(page: import('@playwright/test').Page): Promise<{ origin: { x: number; y: number }; mirrorX: boolean }> {
  return page.evaluate(() => {
    const messages = (window as unknown as { lockstateSentToWorker: Array<{ payload?: { projectionId?: string; target?: unknown } }> }).lockstateSentToWorker;
    return messages.filter(m => m.payload?.projectionId === 'world/room-template-preflight').at(-1)?.payload?.target as { origin: { x: number; y: number }; mirrorX: boolean };
  });
}

for (const width of [1920, 2560]) test(`approved pan fit retains exact mirrored row origin and Escape cancellation at ${width}`, async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width, height: 1080 });
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
  const chosen = await target(page);
  const allInside = () => ghost.locator('polygon').evaluateAll(polygons => {
    const left = Math.max(document.querySelector('.hud__tabs')!.getBoundingClientRect().right, document.querySelector('.hud__corner')!.getBoundingClientRect().right) + 7;
    const right = document.querySelector('.hud__rail')!.getBoundingClientRect().left - 7;
    const top = document.querySelector('.hud-strip')!.getBoundingClientRect().bottom + 7;
    return polygons.every(p => { const r = p.getBoundingClientRect(); return r.left >= left && r.right <= right && r.top >= top && r.bottom <= innerHeight - 7; });
  });
  await expect.poll(allInside).toBe(true);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyE');
  await expect.poll(allInside).toBe(true);
  expect((await target(page)).origin).toEqual(chosen.origin);
  await page.screenshot({ path: testInfo.outputPath(`approved-fit-${width}.png`) });
  await page.mouse.down();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(ghost).toBeHidden();
  expect((await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toHaveLength(0);
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(cursor.x + 1, cursor.y);
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  const rearmed = await target(page);
  await page.mouse.click(cursor.x + 1, cursor.y);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toMatchObject([{ type: 'PlaceRoomTemplate', templateId: 'cell-row-four', mirrorX: true, origin: rearmed.origin }]);
  // Both first selection and re-arm carry genuine worker origins, never screen coordinates.
  expect(Number.isInteger(chosen.origin.x)).toBe(true);
  expect(chosen.mirrorX).toBe(true);
});
