import { expect, test } from './network-changed-fixture';

test('Full HD production catalogue keeps rotation and map placement reachable without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).click();
  expect(await dialog.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  const rotation = dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' });
  await rotation.selectOption('1');
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('16 × 7');
  expect(await dialog.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  await expect(rotation).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Place on map', exact: true })).toBeInViewport();
  await rotation.focus();
  await rotation.press('ArrowDown');
  await expect(rotation).toHaveValue('2');
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('7 × 16');
});

test('Full HD room rotation controls turn the complete bed and submit the chosen mirrored orientation', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/room-template-tool-harness.html');
  await page.getByRole('button', { name: 'Room plans' }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  const rotation = dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' });
  const dimensions = dialog.locator('.hud-template__dimensions');
  const bed = dialog.locator('.hud-template__diagram .hud-template__fixture').first();
  await expect(rotation).toHaveValue('0');
  await expect(dimensions).toHaveText('4 × 7');
  await rotation.selectOption('1');
  await expect(dimensions).toHaveText('7 × 4');
  expect(await bed.evaluate(el => ({ column: el.style.gridColumn, row: el.style.gridRow }))).toEqual({ column: '5 / span 2', row: '2 / span 1' });
  const horizontal = await bed.boundingBox();
  expect(horizontal!.width).toBeGreaterThan(horizontal!.height * 1.8);
  const control = await rotation.boundingBox();
  expect(control!.height).toBeGreaterThanOrEqual(44);
  expect(await rotation.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === el;
  })).toBe(true);
  // Exercise the browser's native keyboard select instead of dispatching a
  // synthetic change event or claiming remapped camera keys rotate plans.
  await rotation.focus();
  await rotation.press('ArrowDown');
  await expect(rotation).toHaveValue('2');
  await expect(dimensions).toHaveText('4 × 7');
  await rotation.press('ArrowDown');
  await expect(rotation).toHaveValue('3');
  await expect(dimensions).toHaveText('7 × 4');
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally before rotation' }).check();
  expect(await bed.evaluate(el => ({ column: el.style.gridColumn, row: el.style.gridRow }))).toEqual({ column: '2 / span 2', row: '2 / span 1' });
  await dialog.getByRole('button', { name: 'Large cell', exact: true }).click();
  await expect(rotation).toHaveValue('3');
  await expect(dimensions).toHaveText('7 × 6');
  await dialog.getByText('Enter coordinates', { exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('7');
  const place = dialog.getByRole('button', { name: 'Place room plan' });
  await expect(place).toBeEnabled();
  await place.click();
  expect(await page.evaluate(() => (window as unknown as { templateRequests: unknown[] }).templateRequests)).toEqual([
    { templateId: 'cell-large', origin: { x: 10, y: 7 }, mirrorX: true, quarterTurns: 3 },
  ]);
  await page.screenshot({ path: 'test-results/room-plan-rotation-ui-fullhd.png' });
});
