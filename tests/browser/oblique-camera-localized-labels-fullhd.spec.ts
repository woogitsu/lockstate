import { expect, test } from './network-changed-fixture';

test.use({ locale: 'pl-PL' });

test('Polish camera button labels stay inside their targets at Full HD larger scales', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.locator('[data-tab="build"]').click();
  await page.locator('.hud-minimap .ui-panel__toggle').click();
  const angleButtons = page.locator('.hud-camera-angle__button');
  await expect(angleButtons).toHaveText(['Lewo', 'Prawo', 'Góra', 'Dół', 'Reset']);
  await expect(angleButtons.nth(4)).toHaveAttribute('aria-label', 'Przywróć kąt');
  await expect(angleButtons.nth(4)).toHaveAttribute('title', 'Przywróć kąt');
  const overshoots: string[] = [];
  for (const scale of [125, 150, 175, 200]) {
    await page.locator('.display-scale__cycle').click();
    const geometry = await page.evaluate(() => {
      const angle = document.querySelector('.hud-camera-angle')!.getBoundingClientRect();
      const map = document.querySelector('.hud-minimap')!.getBoundingClientRect();
      const build = document.querySelector('.hud-build')!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('.hud-camera-angle__button')].map((button) => {
        const box = button.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(button);
        const textRects = [...range.getClientRects()];
        return { text: button.textContent, height: box.height, scrollHeight: button.scrollHeight,
          clientHeight: button.clientHeight, hit: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button,
          textOutside: textRects.some((text) => text.left < box.left + 2 || text.right > box.right - 2),
          textRight: Math.max(...textRects.map((text) => text.right)), buttonRight: box.right };
      });
      return { angleTop: angle.top, angleBottom: angle.bottom, mapRight: map.right,
        buildLeft: build.left, buttons };
    });
    console.log(`${scale}% ${JSON.stringify(geometry)}`);
    await page.screenshot({ path: testInfo.outputPath(`camera-polish-${scale}-fullhd.png`) });
    for (const button of geometry.buttons.filter((item) => item.textOutside)) {
      overshoots.push(`${scale}% ${button.text}: ${(button.textRight - button.buttonRight).toFixed(1)}px`);
    }
  }
  expect(overshoots).toEqual([]);
});
