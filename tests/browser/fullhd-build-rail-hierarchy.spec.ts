import { expect, test } from './network-changed-fixture';

test('Full HD puts the active Build work ahead of the save inventory (#1583)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.empty-world-prompt').getByRole('button', { name: 'Create a prison' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();

  const build = page.locator('.ui-panel.hud-build');
  const saves = page.locator('.save-panel');
  await expect(build).toBeVisible();
  await expect(saves).toBeVisible();
  const buildBox = await build.boundingBox();
  const saveBox = await saves.boundingBox();
  expect(buildBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  expect(buildBox!.y).toBeLessThan(saveBox!.y);
  await expect(saves.getByRole('button', { name: 'Export' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fullhd-build-first.png') });

  await page.locator('.ui-tab[data-tab="manage"]').click();
  await expect(build).toBeHidden();
  const saveAfterSwitch = await saves.boundingBox();
  expect(saveAfterSwitch).not.toBeNull();
  expect(saveAfterSwitch!.y).toBeLessThan(saveBox!.y);
});

test.describe('Polish Full HD work rail', () => {
  test.use({ locale: 'pl-PL' });

  test('keeps the save action reachable below Build', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.locator('.empty-world-prompt').getByRole('button', { name: 'Utwórz więzienie' }).click();
    await page.locator('.ui-tab[data-tab="build"]').click();
    const build = await page.locator('.ui-panel.hud-build').boundingBox();
    const saves = await page.locator('.save-panel').boundingBox();
    expect(build).not.toBeNull();
    expect(saves).not.toBeNull();
    expect(build!.y).toBeLessThan(saves!.y);
    await expect(page.locator('.save-panel').getByRole('button', { name: 'Eksportuj' })).toBeVisible();
  });
});

test('Build and Saves remain separate reachable scroll areas at 200% interface scale', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.empty-world-prompt').getByRole('button', { name: 'Create a prison' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  for (let press = 0; press < 4; press += 1) await page.locator('.display-scale__cycle').click();
  await expect(page.locator('.display-scale__value')).toHaveText('200%');

  const build = await page.locator('.ui-panel.hud-build').boundingBox();
  const saves = await page.locator('.save-panel').boundingBox();
  expect(build).not.toBeNull();
  expect(saves).not.toBeNull();
  expect(build!.y + build!.height).toBeLessThanOrEqual(saves!.y + 1);
  expect(saves!.y + saves!.height).toBeLessThanOrEqual(1080);
  const exportButton = page.locator('.save-panel').getByRole('button', { name: 'Export' });
  await expect(exportButton).toBeEnabled();
  await exportButton.focus();
  await expect(exportButton).toBeFocused();
});
