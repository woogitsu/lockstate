import { expect, test } from './network-changed-fixture';

test('Full HD Build names the plan that owns the next map click after a change', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Common Room', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  const hint = page.locator('.hud-build__arm-hint');
  await expect(hint).toContainText('Common Room');
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  await dialog.getByRole('button', { name: 'Security Office', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  await expect(hint).toContainText('Security Office');
  await expect(hint).not.toContainText('Common Room');
});

test('Polish Full HD Build names the armed plan', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Magazyn', exact: true }).click();
  await dialog.getByRole('button', { name: 'Postaw na mapie' }).click();
  await expect(page.locator('.hud-build__arm-hint')).toContainText('Magazyn');
});
