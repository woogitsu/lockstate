import { expect, test } from './network-changed-fixture';
import { writeFileSync } from 'node:fs';

for (const mode of ['cursor-origin', 'cursor-center', 'pan-locked']) {
  for (const position of ['central', 'edge']) {
    test(`review ${mode} at ${position}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/?renderer=oblique&room-preview-fit-draft=1');
      await page.getByRole('button', { name: 'New prison' }).click();
      await page.getByRole('button', { name: 'Build', exact: true }).click();
      await page.getByRole('button', { name: 'Room plans', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Room plans' });
      await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).click();
      await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
      const cursor = position === 'central' ? { x: 900, y: 400 } : { x: 1500, y: 1000 };
      await page.mouse.move(cursor.x, cursor.y);
      const ghost = page.locator('.room-template-world-ghost');
      await expect(ghost.locator('polygon')).toHaveCount(112);
      const before = await ghost.locator('polygon').first().getAttribute('points');
      const result = await page.evaluate(({ mode, cursor }) => {
        return (window as unknown as { roomFitDraft: (mode: string, point: { x: number; y: number }) => unknown }).roomFitDraft(mode, cursor);
      }, { mode, cursor });
      await expect.poll(() => ghost.locator('polygon').first().getAttribute('points')).not.toBe(before);
      await expect(ghost.locator('polygon')).toHaveCount(112);
      const measurements = await ghost.locator('polygon').evaluateAll(polygons => polygons.map(polygon => {
        const r = polygon.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }));
      writeFileSync(testInfo.outputPath(`${mode}-${position}.json`), JSON.stringify({ result, measurements }, null, 2));
      await page.screenshot({ path: testInfo.outputPath(`${mode}-${position}.png`) });
    });
  }
}
