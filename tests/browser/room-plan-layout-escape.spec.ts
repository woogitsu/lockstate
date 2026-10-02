import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

for (const renderer of ['world', 'oblique'] as const) {
  test(`Full HD ${renderer} Layout Escape preserves the armed room plan until world Escape`, async ({ page }, testInfo) => {
    await installTee(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: 2 }));
    });
    await page.goto(renderer === 'oblique' ? '/?renderer=oblique' : '/');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    await expect(dialog).toBeHidden();
    const ghost = page.locator('.room-template-world-ghost');
    await page.mouse.move(900, 380);
    await expect(ghost).toBeVisible();
    await expect(ghost.locator('polygon')).toHaveCount(28);
    await page.locator('.hud-layout__button').click();
    const menu = page.locator('.hud-layout__body');
    await expect(menu).toBeVisible();
    await menu.locator('.hud-layout__reset').focus();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('.hud-layout__button')).toBeFocused();
    // Moving from the UI back to the map restores a preview only if the
    // consumed menu key left the actual room-template tool armed.
    await page.mouse.move(910, 390);
    await expect(ghost, 'closing Layout must preserve the armed room plan').toBeVisible();
    await expect(ghost.locator('polygon')).toHaveCount(28);
    await page.screenshot({ path: testInfo.outputPath(`room-plan-layout-escape-${renderer}-fullhd-200.png`) });
    await page.keyboard.press('Escape');
    await expect(ghost, 'the subsequent world Escape must still cancel the plan').toBeHidden();
    await page.mouse.move(920, 400);
    await expect(ghost).toBeHidden();
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
  });
}
