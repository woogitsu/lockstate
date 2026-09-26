import { expect, test } from './network-changed-fixture';

/** #1160: the queued state has a reachable way back at the Full HD target. */
test('Full HD queued wall can be cancelled and leaves no queued order', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  const coordinates = page.locator('.hud-build__coordinates');
  if ((await coordinates.getAttribute('data-collapsed')) === 'true') {
    await coordinates.locator('.ui-section__header').click();
  }
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.locator('.hud-build__coords > .ui-number:nth-child(1) input').fill('16');
  await page.locator('.hud-build__coords > .ui-number:nth-child(2) input').fill('16');
  await page.locator('.hud-build__coordinates .ui-action').click();
  const panel = page.locator('.ui-panel.hud-build');
  await expect(panel).toHaveAttribute('data-queued', '1');
  const queue = page.locator('.hud-build__queue');
  if ((await queue.getAttribute('data-collapsed')) === 'true') {
    await queue.locator('.ui-section__header').click();
  }
  await page.locator('.hud-build__queue-row').getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).not.toHaveAttribute('data-queued', /.*/u);
  await expect(page.locator('.hud-build__queue-row:visible')).toHaveCount(0);
  await expect(page.locator('.hud__refusal')).toBeHidden();
});

