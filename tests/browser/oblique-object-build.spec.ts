import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD oblique Build previews a bed footprint and places it at the same anchor', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  await page.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(960, 540);
  const preview = page.locator('.oblique-square-ghost polygon');
  await expect(preview).toHaveCount(2);
  await expect(page.locator('.oblique-square-ghost__notice')).toContainText('Bed · 65');
  const anchor = await preview.first().evaluate((element) => ({ x: Number(element.getAttribute('data-tile-x')), y: Number(element.getAttribute('data-tile-y')) }));
  await page.screenshot({ path: testInfo.outputPath('oblique-bed-full-footprint-1920x1080.png') });
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceObject'), { timeout: 10_000 }).toHaveLength(1);
  const command = (await sentCommands(page)).find((entry) => entry.type === 'PlaceObject');
  expect(command).toMatchObject({ type: 'PlaceObject', definitionId: 'bed-wooden', ...anchor });
  await expect(page.locator('.hud__refusal')).toBeVisible();
});
