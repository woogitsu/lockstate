import { expect, test } from './network-changed-fixture';

test('Full HD Delivery Bay distinguishes dock marker from the actual doorway in the plan and ghost', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Delivery Bay', exact: true }).click();
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--dock')).toHaveCount(3);
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--door')).toHaveCount(1);
  await expect(dialog.locator('.hud-template__legend')).toContainText('Dock marker (not a passage)');
  await expect(dialog.locator('.hud-template__legend')).toContainText('Interior');
  await expect(dialog.locator('.hud-template__legend')).not.toContainText('Furniture');
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  await page.mouse.move(960, 540);
  const ghost = page.locator('.oblique-template-ghost');
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(ghost.locator('polygon[data-kind="dock"]')).toHaveCount(3);
  await expect(ghost.locator('polygon[data-kind="door"]')).toHaveCount(1);
  await expect(ghost.getByRole('status')).toContainText('Dock marker (not a passage)');
  await page.screenshot({ path: testInfo.outputPath('delivery-bay-marker-1920x1080.png') });
});

test('Polish Delivery Bay names the marker separately from the doorway', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Rampa dostawcza', exact: true }).click();
  await expect(dialog.locator('.hud-template__legend')).toContainText('Znacznik rampy (nie jest przejściem)');
  await expect(dialog.locator('.hud-template__legend')).toContainText('Wnętrze');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--dock')).toHaveCount(3);
});
