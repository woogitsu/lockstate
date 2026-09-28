import { expect, test } from './network-changed-fixture';

test('Full HD cancelled room plan can be placed again while paused through save and load', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await page.keyboard.press('Escape');
  const queue = page.locator('.hud-build__queue > .ui-section__header');
  await expect(queue).toBeVisible();
  if ((await queue.getAttribute('aria-expanded')) === 'false') await queue.click();
  const rows = page.locator('.hud-build__queue-row:not([hidden])');
  await expect(rows.first()).toBeVisible();
  await rows.first().locator('button').click();

  // The prison is still paused; waiting for construction ticks cannot repair
  // the stale reservation left by the cancelled shell.
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const retry = page.getByRole('dialog', { name: 'Room plans' });
  await retry.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await retry.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(retry.getByRole('status')).toContainText('clear');
  await expect(retry.getByRole('button', { name: 'Place room plan' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(restored.getByRole('status')).toContainText('clear');
  await restored.getByRole('button', { name: 'Place room plan' }).click();
  await expect(restored.getByRole('status')).toContainText('submitted');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const replaced = page.getByRole('dialog', { name: 'Room plans' });
  await replaced.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await replaced.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(replaced.getByRole('status')).toContainText('blocked');
});
