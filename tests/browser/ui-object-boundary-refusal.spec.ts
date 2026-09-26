import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';
import { expect, test } from './network-changed-fixture';

const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

/** #1160: an object crossing the starter world's boundary receives the worker's own reason. */
test('Full HD object outside the world reports its specific refusal', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.locator('.ui-tab[data-tab="build"]').click();
  const coordinates = page.locator('.hud-build__coordinates');
  if ((await coordinates.getAttribute('data-collapsed')) === 'true') {
    await coordinates.locator('.ui-section__header').click();
  }
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  await page.locator('.hud-build__coords > .ui-number:nth-child(1) input').fill('32');
  await page.locator('.hud-build__coords > .ui-number:nth-child(2) input').fill('16');
  await page.locator('.hud-build__coordinates .ui-action').click();

  const band = page.locator('.hud__refusal');
  await expect(band).toBeVisible();
  await expect(band).toHaveAttribute('data-source', 'simulation');
  await expect(band).toHaveText(localizer.format('hud.alert.refusal.place-object.out-of-bounds'));
  await expect(page.locator('.ui-panel.hud-build')).not.toHaveAttribute('data-queued', /.*/u);
  await expect(page.locator('.hud-build__queue-row:visible')).toHaveCount(0);
});
