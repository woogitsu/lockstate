import { expect, test } from './network-changed-fixture';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';

const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

/**
 * #1160's missing (Zones coordinate Designate, room count, simulation) triple.
 * The same press must show the simulation's exact refusal reason and leave the
 * success artifact absent. The coordinate form makes the press accessible by
 * keyboard and keeps the selected 2×3 Cell large enough to pass its own size
 * rule; the owned starter chunk cannot contain x=100, y=100.
 *
 * Mutation check: changing zoning.ts's out-of-bounds refusal to unowned-land
 * made this browser test red on the displayed reason; restoring it went green.
 */
test('Full HD Zones refusal leaves no designated room', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.locator('.ui-tab[data-tab="zones"]').click();
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  const disclosure = page.locator('.hud-rooms__coordinates > .ui-section__header');
  if ((await disclosure.getAttribute('aria-expanded')) === 'false') await disclosure.click();
  for (const [field, value] of [['x', 100], ['y', 100], ['width', 2], ['height', 3]] as const) {
    await page.locator(`.hud-rooms__coord-${field} input`).fill(String(value));
  }
  await page.locator('.hud-rooms__coordinates-submit').click();
  await expect(page.locator('.hud-rooms__area')).toHaveAttribute('data-area', '100,100,2,3');
  await page.locator('.hud-rooms__confirm').click();
  const band = page.locator('.hud__refusal');
  await expect(band).toBeVisible();
  await expect(band).toHaveAttribute('data-source', 'simulation');
  await expect(band).toHaveText(localizer.format('hud.alert.refusal.zone.out-of-bounds'));
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('0');
  await expect(page.locator('.hud-rooms__needs')).toBeHidden();
});
