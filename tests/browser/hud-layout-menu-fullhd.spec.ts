import { expect, test } from './network-changed-fixture';

for (const renderer of ['world', 'oblique'] as const) {
  test(`Full HD ${renderer} view closes the Layout menu without cancelling the armed Build tool`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: 2 }));
    });
    await page.goto(renderer === 'oblique' ? '/?renderer=oblique' : '/');
    await expect(page.locator('#game-root canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const arm = page.locator('.hud-build__arm');
    await arm.click();
    await expect(arm).toHaveText('Stop placing');
    await page.locator('.hud-layout__button').click();
    const menu = page.locator('.hud-layout__body');
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height, 'the settings popover extends below the viewport').toBeLessThanOrEqual(1080);

    const reset = menu.locator('.hud-layout__reset');
    await reset.scrollIntoViewIfNeeded();
    const reachable = await reset.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return box.bottom <= innerHeight && hit !== null && button.contains(hit);
    });
    expect(reachable, 'the final Layout action must be clickable inside the viewport').toBe(true);
    await reset.focus();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('.hud-layout__button')).toBeFocused();
    await expect(arm, 'Escape was consumed by the menu and must not reach the world tool').toHaveText('Stop placing');
    // Once the menu is closed, a second Escape belongs to the world and must
    // still cancel placement. This rules out an unavailable cancel binding.
    await page.keyboard.press('Escape');
    await expect(arm).not.toHaveText('Stop placing');
    await page.screenshot({ path: testInfo.outputPath(`layout-escape-fullhd-200-${renderer}.png`) });
  });
}
