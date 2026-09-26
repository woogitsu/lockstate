import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';
import { expect, test } from './network-changed-fixture';

const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

/** #1160: the canvas placement route and the numeric route need separate gates. */
test('Full HD world press for a Bed outside a room refuses instead of placing it', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('aria-pressed', 'true');
  const aim = { x: 960, y: 540 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName.toLowerCase(), aim)).toBe('canvas');
  await page.mouse.click(aim.x, aim.y);

  const band = page.locator('.hud__refusal');
  await expect(band).toBeVisible();
  await expect(band).toHaveAttribute('data-source', 'simulation');
  await expect(band).toHaveText(localizer.format('hud.alert.refusal.place-object.outside-room'));
  await expect(page.locator('.ui-panel.hud-build')).not.toHaveAttribute('data-queued', /.*/u);
});
