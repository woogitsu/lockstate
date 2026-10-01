import { expect, test } from './network-changed-fixture';

test('Build purchase waits for a prison session at Full HD', async ({ page }) => {
  const failedActions: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('HUD action failed')) failedActions.push(message.text());
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.ui-tab[data-tab="build"]').click();

  const buy = page.getByRole('button', { name: 'Buy', exact: true });
  await expect(buy).toBeVisible();
  await expect(buy).toBeDisabled();
  await buy.evaluate((button) => (button as HTMLButtonElement).click());
  expect(failedActions).toEqual([]);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(buy).toBeEnabled();

  const active = page.locator('.save-panel__item[data-active="true"]');
  await active.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('.empty-world-prompt')).toBeVisible();
  await expect(buy).toBeDisabled();
  await buy.evaluate((button) => (button as HTMLButtonElement).click());
  expect(failedActions).toEqual([]);
});
