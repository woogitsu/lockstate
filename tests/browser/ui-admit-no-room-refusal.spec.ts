import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';
import { expect, test } from './network-changed-fixture';

const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

/** #1160: the Manage Admit control cannot add an inert prisoner to a roomless prison. */
test('Full HD Admit without a room refuses and leaves population at zero', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.locator('.ui-tab[data-tab="manage"]').click();
  const population = page.locator('[data-metric="prisoners"] .ui-stat__value');
  await expect(population).toHaveText('0');
  const admit = page.locator('.hud-intake__admit');
  await expect(admit).toBeVisible();
  await admit.click();

  const band = page.locator('.hud__refusal');
  await expect(band).toBeVisible();
  await expect(band).toHaveAttribute('data-source', 'host');
  await expect(band).toHaveText(localizer.format('hud.refusal.admit-prisoner-no-room'));
  await expect(admit).toHaveAttribute('data-action-failed', 'true');
  await expect(population).toHaveText('0');
});
