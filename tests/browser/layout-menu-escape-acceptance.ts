import { expect, type Page, type TestInfo } from './network-changed-fixture';

/** Shared real-player check for the dev server and the built production client. */
export async function assertLayoutEscapeKeepsBuildPlacement(page: Page, testInfo: TestInfo, renderer: 'world' | 'oblique') {
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
  const reset = menu.locator('.hud-layout__reset');
  await reset.scrollIntoViewIfNeeded();
  await reset.focus();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('.hud-layout__button')).toBeFocused();
  await expect(arm, 'The menu Escape must preserve the armed Build tool').toHaveText('Stop placing');
  // Once the menu is closed, Escape must still cancel ordinary world placement.
  await page.keyboard.press('Escape');
  await expect(arm).not.toHaveText('Stop placing');
  await page.screenshot({ path: testInfo.outputPath(`layout-escape-fullhd-200-${renderer}.png`) });
}
