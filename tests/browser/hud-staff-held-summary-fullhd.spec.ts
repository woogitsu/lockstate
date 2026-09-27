import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
  test(`Polish held guard totals remain readable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
    await page.goto('/');
    await page.getByRole('button', { name: 'Nowe więzienie' }).click();
    await page.locator('.ui-tab[data-tab="manage"]').click();

    const summary = page.locator('.hud-staff__held-summary');
    await expect(summary).toContainText('Bez przydziału');
    await expect(summary).toBeVisible();
    const bounds = await summary.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const header = node.parentElement!.getBoundingClientRect();
      return { right: rect.right, headerRight: header.right, viewportRight: document.documentElement.clientWidth };
    });
    expect(bounds.right).toBeLessThanOrEqual(bounds.headerRight + 1);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewportRight);
  });
}
