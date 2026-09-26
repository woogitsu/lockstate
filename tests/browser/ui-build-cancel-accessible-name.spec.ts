import { expect, test } from './network-changed-fixture';

test('Build cancellation buttons name the exact queued order and delivery with localized sentences', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();

  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('5');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('5');
  await page.locator('.hud-build__coordinates .ui-action').click();
  await expect(page.locator('.hud-build')).toHaveAttribute('data-queued', '1');
  const queueFold = page.locator('.hud-build__queue > .ui-section__header');
  if ((await queueFold.getAttribute('aria-expanded')) === 'false') await queueFold.click();
  const order = page.locator('.hud-build__queue-row:not([hidden])').first();
  await expect(order).toBeVisible();
  await expect(order.locator('.ui-action')).toHaveAttribute('aria-label',
    `Cancel this order: ${await order.locator('.hud-build__queue-label').innerText()}`);

  await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy-submit').click();
  await expect(page.locator('.hud-build__deliveries')).toHaveAttribute('data-pending', /^[1-9]\d*$/);
  const delivery = page.locator('.hud-build__delivery-row:not([hidden])').first();
  await expect(delivery).toBeVisible();
  await expect(delivery.locator('.ui-action')).toHaveAttribute('aria-label',
    `Cancel this delivery: ${await delivery.locator('.hud-build__delivery-label').innerText()}`);
});

test('Polish Build delivery cancellation keeps its full accessible sentence', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' }));
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.locator('.save-panel__button').first().click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy-submit').click();
  const delivery = page.locator('.hud-build__delivery-row:not([hidden])').first();
  await expect(delivery).toBeVisible();
  await expect(delivery.locator('.ui-action')).toHaveAttribute('aria-label',
    `Anuluj tę dostawę: ${await delivery.locator('.hud-build__delivery-label').innerText()}`);
});
