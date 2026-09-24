import { expect, test } from './network-changed-fixture';

test('the Kitchen rule shows zero prepared portions before anybody cooks (#592)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
  await page.locator('.ui-tab[data-tab="zones"]').click();
  await page.locator('.hud-rooms__rows [data-room="room.kitchen"]').click();
  const portions = page.locator('.hud-rooms__rule-portions');
  await expect(portions).toBeVisible();
  await expect(portions).toContainText('Prepared portions: 0');
  await expect(portions).toContainText('half rate');
});
