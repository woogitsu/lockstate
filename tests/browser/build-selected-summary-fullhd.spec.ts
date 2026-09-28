import { expect, test } from './network-changed-fixture';

for (const locale of [
  { language: 'en', create: 'New prison', selected: 'Brick wall' },
  { language: 'pl', create: 'Nowe więzienie', selected: 'Ściana z cegły' },
] as const) {
  test(`Full HD Build keeps the selected tool named after scrolling the catalogue (${locale.language})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    if (locale.language === 'pl') {
      await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
    }
    await page.goto('/index.html');
    await page.getByRole('button', { name: locale.create }).click();
    await page.locator('.ui-tab[data-tab="build"]').click();
    const list = page.locator('.hud-build__list');
    const selectedRow = list.locator('[aria-checked="true"]');
    await expect(selectedRow).toContainText(locale.selected);
    await list.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(selectedRow).not.toBeInViewport();
    const summary = page.locator('.hud-build__selected-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toHaveText(locale.selected);
    await page.screenshot({ path: testInfo.outputPath(`selected-build-tool-${locale.language}-fullhd.png`) });
  });
}
