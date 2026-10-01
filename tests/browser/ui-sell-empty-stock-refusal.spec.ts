import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';
import { expect, test } from './network-changed-fixture';

const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

/** #1160: Sell must not credit funds when the player has no stock to sell. */
test('Full HD Sell reports insufficient stock and leaves funds unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.locator('.hud-build__buy-toggle').click();
  const funds = page.locator('[data-metric="funds"] .ui-stat__value');
  const before = await funds.textContent();
  expect(before).toBeTruthy();
  await page.locator('.hud-build__sell-submit').click();

  const band = page.locator('.hud__refusal');
  await expect(band).toBeVisible();
  await expect(band).toHaveAttribute('data-source', 'simulation');
  await expect(band).toHaveText(localizer.format('hud.alert.refusal.sell.insufficient-stock'));
  await expect(funds).toHaveText(before!);
  await expect(page.locator('.hud-build__deliveries')).toBeHidden();
});
