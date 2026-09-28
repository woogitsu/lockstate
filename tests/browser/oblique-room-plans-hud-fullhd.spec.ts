import { expect, test } from './network-changed-fixture';

test('Full HD Room plans keeps the selected price visible with minimap and camera controls open', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-minimap .ui-panel__toggle').click();
  for (const scale of [100, 125, 150]) {
    if (scale > 100) await page.locator('.display-scale__cycle').click();
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Canteen' }).click();
    await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Catalogue value:');
    const geometry = await dialog.evaluate((element) => {
      const box = (selector: string) => {
        const rect = element.querySelector(selector)?.getBoundingClientRect();
        return rect && { top: rect.top, bottom: rect.bottom, height: rect.height };
      };
      const rect = element.getBoundingClientRect();
      const focused = document.activeElement;
      return { dialog: { top: rect.top, bottom: rect.bottom, height: rect.height }, scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
        choices: box('.hud-template__choices'), cost: box('.hud-template__catalogue-value'),
        placement: box('.hud-template__placement'), focusInsideDialog: focused !== null && element.contains(focused),
        focus: focused?.outerHTML.slice(0, 140) };
    });
    console.log(`${scale}% ${JSON.stringify(geometry)}`);
    await page.screenshot({ path: testInfo.outputPath(`room-plans-minimap-${scale}-fullhd.png`) });
    expect(geometry.focusInsideDialog).toBe(true);
    expect(geometry.cost!.top, `${scale}% selected plan cost is below the visible dialog`).toBeGreaterThanOrEqual(geometry.dialog.top);
    expect(geometry.cost!.bottom, `${scale}% selected plan cost is below the visible dialog`).toBeLessThanOrEqual(geometry.dialog.bottom);
    await dialog.getByRole('button', { name: 'Reception' }).click();
    await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('1,845');
    const laterChoice = await dialog.evaluate((element) => ({
      dialogBottom: element.getBoundingClientRect().bottom,
      costBottom: element.querySelector('.hud-template__catalogue-value')!.getBoundingClientRect().bottom,
      focusInsideDialog: element.contains(document.activeElement),
    }));
    expect(laterChoice.costBottom, `${scale}% later plan price is below the visible dialog`).toBeLessThanOrEqual(laterChoice.dialogBottom);
    expect(laterChoice.focusInsideDialog).toBe(true);
    await dialog.locator('.hud-template__close').click();
    await expect(dialog).toBeHidden();
  }
});

test.describe('Polish Room plans price', () => {
  test.use({ locale: 'pl-PL' });

  test('Full HD 150% price stays visible after choosing a plan', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?oblique-preview=1');
    await page.getByRole('button', { name: 'Nowe więzienie' }).click();
    await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
    await page.getByRole('button', { name: 'Buduj', exact: true }).click();
    await page.locator('.hud-minimap .ui-panel__toggle').click();
    await page.locator('.display-scale__cycle').click();
    await page.locator('.display-scale__cycle').click();
    await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
    const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
    await dialog.getByRole('button', { name: 'Stołówka' }).click();
    await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Wartość katalogowa:');
    const geometry = await dialog.evaluate((element) => ({
      dialogBottom: element.getBoundingClientRect().bottom,
      priceTop: element.querySelector('.hud-template__catalogue-value')!.getBoundingClientRect().top,
      priceBottom: element.querySelector('.hud-template__catalogue-value')!.getBoundingClientRect().bottom,
    }));
    expect(geometry.priceTop).toBeGreaterThanOrEqual(0);
    expect(geometry.priceBottom).toBeLessThanOrEqual(geometry.dialogBottom);
    await page.screenshot({ path: testInfo.outputPath('room-plans-price-polish-150-fullhd.png') });
  });
});
