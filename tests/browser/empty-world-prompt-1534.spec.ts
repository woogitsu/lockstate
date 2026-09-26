import { expect, test } from './network-changed-fixture';

for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
  test(`empty world offers central create and saved-prison routes at ${viewport.width}x${viewport.height} (#1534)`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/index.html');
    await expect(page.locator('.save-panel')).toBeVisible();
    const prompt = page.locator('.empty-world-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toHaveAccessibleName('Start a prison');
    await page.screenshot({ path: testInfo.outputPath(`empty-world-${viewport.width}x${viewport.height}.png`) });
    const bounds = await prompt.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2)).toBeLessThan(1);
    expect(Math.abs(bounds!.y + bounds!.height / 2 - viewport.height / 2)).toBeLessThan(1);
    const create = prompt.getByRole('button', { name: 'Create a prison' });
    await expect(create).toBeVisible();
    await create.focus();
    await page.keyboard.press('Enter');
    await expect(prompt).toBeHidden();
    await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();

    await page.reload();
    await expect(prompt).toBeVisible();
    const choose = prompt.getByRole('button', { name: 'Load a saved prison' });
    await expect(choose).toBeVisible();
    await choose.click();
    const load = page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first();
    await expect(load).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(prompt).toBeHidden();
    await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  });
}
