import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD oblique Build places the previewed full-square brick wall', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const wall = page.locator('.hud-build__list [data-buildable="wall-brick"]');
  await wall.click();
  await expect(wall).toContainText('80');
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(960, 540);
  const preview = page.locator('.oblique-square-ghost polygon');
  await expect(preview).toBeVisible();
  await expect(page.locator('.oblique-square-ghost__notice')).toContainText('Brick wall · 80 per segment');
  const previewTile = await preview.evaluate((element) => ({ x: Number(element.getAttribute('data-tile-x')), y: Number(element.getAttribute('data-tile-y')) }));
  await page.screenshot({ path: testInfo.outputPath('oblique-square-wall-preview-1920x1080.png') });
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder'), { timeout: 10_000 }).toHaveLength(1);
  const order = (await sentCommands(page)).find((command) => command.type === 'PlaceBuildOrder');
  expect(order).toMatchObject({ type: 'PlaceBuildOrder', definitionId: 'wall-brick', footprint: 'square' });
  expect(order).toMatchObject(previewTile);
});

test.describe('Polish wall cost feedback', () => {
  test.use({ locale: 'pl-PL' });

  test('Full HD wall ghost uses the Build catalogue price in Polish', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?oblique-preview=1');
    await page.getByRole('button', { name: 'Nowe więzienie' }).click();
    await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
    await page.getByRole('button', { name: 'Buduj', exact: true }).click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    await page.getByRole('button', { name: 'Stawiaj na mapie', exact: true }).click();
    await page.mouse.move(960, 540);
    await expect(page.locator('.oblique-square-ghost__notice')).toHaveText('Ściana z cegły · 80 za segment');
  });
});
