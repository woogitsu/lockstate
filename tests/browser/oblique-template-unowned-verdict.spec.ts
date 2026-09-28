import { expect, test } from './network-changed-fixture';

test('Full HD room plan coordinates identify unowned land before and after Save/Load', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  const openPlans = async () => {
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
    await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('31');
    await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
    await expect(dialog.getByRole('status')).toHaveText('This plan reaches land you do not own. Choose another position.');
    await expect(dialog.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
    return dialog;
  };
  const dialog = await openPlans();
  await dialog.getByRole('button', { name: 'Close plans' }).click();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await openPlans();
});

test('Polish Full HD room plan coordinates explain unowned land', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Cela podstawowa', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Początek wzoru X' }).fill('31');
  await dialog.getByRole('spinbutton', { name: 'Początek wzoru Y' }).fill('10');
  await expect(dialog.getByRole('status')).toHaveText('Wzór sięga poza posiadany teren. Wybierz inne miejsce.');
});
