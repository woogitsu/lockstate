import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';
import { expect, test } from './network-changed-fixture';

const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

/** #1160: removing an empty area is a refusal, never a successful removal. */
test('Full HD empty room removal states that there is nothing to remove', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.locator('.ui-tab[data-tab="zones"]').click();
  await page.locator('.hud-rooms__remove').click();
  await expect(page.locator('.hud-rooms__remove')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.hud-rooms').getByRole('button', { name: 'Expand' }).click();
  const disclosure = page.locator('.hud-rooms__coordinates > .ui-section__header');
  if ((await disclosure.getAttribute('aria-expanded')) === 'false') await disclosure.click();
  for (const [field, value] of [['x', 6], ['y', 6], ['width', 2], ['height', 3]] as const) {
    await page.locator(`.hud-rooms__coord-${field} input`).fill(String(value));
  }
  await page.locator('.hud-rooms__coordinates-submit').click();
  await expect(page.locator('.hud-rooms__area')).toHaveAttribute('data-area', '6,6,2,3');
  await page.locator('.hud-rooms__confirm').click();

  const band = page.locator('.hud__refusal');
  await expect(band).toBeVisible();
  await expect(band).toHaveAttribute('data-source', 'simulation');
  await expect(band).toHaveText(localizer.format('hud.alert.refusal.unzone.nothing-to-remove'));
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('0');
  await expect(page.locator('.hud-rooms__needs')).toBeHidden();
});
