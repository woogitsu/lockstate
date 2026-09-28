import { expect, test } from './network-changed-fixture';
import { installTee, openApp, sentCommands, tab } from './playtest-harness';

test('Full HD Build previews authored room plans without submitting until confirmed', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await tab(page, 'build').click();

  const open = page.getByRole('button', { name: 'Room plans', exact: true });
  const before = (await sentCommands(page)).length;
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Choose an origin');
  await expect(dialog.getByRole('button', { name: 'Basic cell' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Brick × 35');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Wood Plank × 2');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('1,530');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Materials already held may lower');
  await dialog.getByRole('button', { name: 'Large cell' }).click();
  await expect(dialog.getByRole('button', { name: 'Large cell' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('6 × 7 tiles');
  await expect(dialog.locator('.hud-template__materials')).not.toContainText('Brick × 35');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(42);
  await expect(dialog.getByRole('status')).toContainText('clear');
  expect((await sentCommands(page)).length).toBe(before);
  await page.screenshot({ path: 'test-results/room-template-preview-fullhd.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});

test('Polish Full HD room plan states material quantities and catalogue value before placement', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await expect(dialog.getByText('Początek wzoru X', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Początek wzoru Y', { exact: true })).toBeVisible();
  await expect(dialog.locator('.hud-template__materials')).toContainText('Cegła × 35');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Deska × 2');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Wartość katalogowa:');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('1530');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('Posiadane materiały mogą obniżyć wydatek.');
  const geometry = await dialog.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  await page.screenshot({ path: testInfo.outputPath('room-template-quote-pl-fullhd.png') });
  await dialog.getByRole('button', { name: 'Rząd czterech cel' }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('7 × 16 pól');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Cegła × 112');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Deska × 8');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('5000');
  await page.screenshot({ path: testInfo.outputPath('four-cell-row-quote-pl-fullhd.png') });
});
