import { expect, test } from './network-changed-fixture';

test('selected room remains in the catalogue viewport after interface scale changes at Full HD', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: /Nowe więzienie|New prison/ }).click();
  await page.locator('.ui-tab[data-tab="zones"]').click();

  for (const scale of [100, 125, 150]) {
    if (scale > 100) await page.locator('.display-scale__cycle').click();
    await expect(page.locator('.display-scale__value')).toHaveText(`${scale}%`);
    const visibility = await page.evaluate(() => {
      const list = document.querySelector('.hud-rooms__list')!.getBoundingClientRect();
      const chosen = document.querySelector('.hud-rooms__rows [data-selected="true"]')!.getBoundingClientRect();
      return { listTop: list.top, listBottom: list.bottom, chosenTop: chosen.top, chosenBottom: chosen.bottom };
    });
    expect(visibility.chosenTop, `${scale}% selected room starts above the list`).toBeGreaterThanOrEqual(visibility.listTop - 1);
    expect(visibility.chosenBottom, `${scale}% selected room ends below the list`).toBeLessThanOrEqual(visibility.listBottom + 1);
  }
  await page.screenshot({ path: testInfo.outputPath('selected-cell-150-percent-fullhd.png') });

  const yard = page.locator('.hud-rooms__rows [data-room="room.yard"]');
  await yard.click();
  await expect(yard).toHaveAttribute('data-selected', 'true');
  await yard.press('ArrowUp');
  await expect(yard).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(yard).toHaveAttribute('data-selected', 'false');
});
