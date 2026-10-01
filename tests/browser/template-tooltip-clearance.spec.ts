import { expect, test } from './network-changed-fixture';

test('Full HD mirrored row label stays beside its footprint after edge fit and yaw', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally' }).check();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  const ghost = page.locator('.room-template-world-ghost');
  for (const [name, point] of [['center', [880, 380]], ['edge', [1500, 950]]] as const) {
    await page.mouse.move(point[0], point[1]);
    await expect(ghost.locator('polygon')).toHaveCount(112);
    await expect(ghost.locator('[role="status"]')).toContainText('Materials catalogue value:');
    if (name === 'edge') { await page.keyboard.down('KeyE'); await page.waitForTimeout(300); await page.keyboard.up('KeyE'); }
    await page.screenshot({ path: testInfo.outputPath(`tooltip-${name}.png`) });
    const overlaps = await ghost.evaluate(layer => {
      const r = layer.querySelector('[role="status"]')!.getBoundingClientRect();
      const box = [{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.right,y:r.bottom},{x:r.left,y:r.bottom}];
      return [...layer.querySelectorAll('polygon')].filter(polygon => {
        const matrix = polygon.getScreenCTM()!;
        const p = [...polygon.points].map(point => new DOMPoint(point.x, point.y).matrixTransform(matrix));
        const axes = [{x:1,y:0},{x:0,y:1}, ...p.map((a,i) => { const b=p[(i+1)%p.length]!; return {x:-(b.y-a.y),y:b.x-a.x}; })];
        return axes.every(axis => {
          const a=p.map(v=>v.x*axis.x+v.y*axis.y), b=box.map(v=>v.x*axis.x+v.y*axis.y);
          return Math.min(...a)<Math.max(...b) && Math.min(...b)<Math.max(...a);
        });
      }).length;
    });
    expect(overlaps, name + ' label overlaps floor squares').toBe(0);
  }
});
