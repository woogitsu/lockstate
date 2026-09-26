import { expect, test } from './network-changed-fixture';

// A 1920×1080 display at browser page zoom 200% exposes 960×540 CSS pixels.
// The 375px case keeps the same keyboard route in the narrow layout.
for (const locale of ['en-US', 'pl-PL'] as const) {
  test.describe(`save disclosure keyboard order in ${locale}`, () => {
    test.use({ locale });

    for (const [width, height] of [[960, 540], [375, 812]] as const) {
      test(`${width}×${height}: summary, create, then expanded actions`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto('/');
        const panel = page.locator('.save-panel');
        const disclosure = panel.locator('details');
        const summary = disclosure.locator('summary');
        const create = panel.locator('.save-panel__create');
        const save = panel.locator('.save-panel__actions button').first();
        await expect(summary).toBeVisible();
        await expect(create).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', locale.slice(0, 2));

        if (await disclosure.getAttribute('open') !== null) await summary.click();
        await expect(disclosure).not.toHaveAttribute('open');
        await summary.press('Tab');
        await expect(create).toBeFocused();
        await create.press('Shift+Tab');
        await expect(summary).toBeFocused();

        await summary.click();
        await expect(disclosure).toHaveAttribute('open');
        await summary.press('Tab');
        await expect(create).toBeFocused();
        await create.press('Tab');
        await expect(save).toBeFocused();
        await save.press('Shift+Tab');
        await expect(create).toBeFocused();
        await create.press('Shift+Tab');
        await expect(summary).toBeFocused();

        const boxes = await page.evaluate(() => {
          const summary = document.querySelector('.save-panel summary')!.getBoundingClientRect();
          const create = document.querySelector('.save-panel__create')!.getBoundingClientRect();
          return { sameRow: Math.abs(summary.y - create.y) < 1, separated: summary.right <= create.left };
        });
        expect(boxes).toEqual({ sameRow: true, separated: true });
      });
    }
  });
}
