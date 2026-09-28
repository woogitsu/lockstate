import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD angled Build reaches, places and restores the complete Delivery Bay plan', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Delivery Bay', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('6 × 6 tiles');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(36);
  await expect(dialog.locator('.hud-template__contents')).toContainText('Loading Dock Door × 1');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Brick × 38');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Wood Plank × 4');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('1,780');
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  const ghost = page.locator('.oblique-template-ghost');
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(ghost.getByRole('status')).toContainText('Delivery Bay, 6 × 6 tiles');
  await expect(ghost.locator('polygon')).toHaveCount(36);
  await expect(ghost.locator('polygon[data-kind="furniture"]')).toHaveCount(3);
  await expect(ghost.locator('polygon[data-kind="door"]')).toHaveCount(1);
  await expect(ghost.locator('.oblique-template-ghost__cost')).toContainText('Catalogue value: 1,780');
  const origin = await ghost.locator('polygon').first().evaluate((node) => ({
    x: Number(node.getAttribute('data-tile-x')), y: Number(node.getAttribute('data-tile-y')),
  }));
  await page.screenshot({ path: testInfo.outputPath('oblique-delivery-bay-before-placement-1920x1080.png') });
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
  expect((await sentCommands(page)).find((command) => command.type === 'PlaceRoomTemplate')).toMatchObject({
    templateId: 'delivery-bay-basic', origin,
  });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('button', { name: 'Delivery Bay', exact: true }).click();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill(String(origin.x));
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(origin.y));
  await expect(restored.getByRole('status')).toContainText('blocked');
});

test('Polish Full HD Build names the Delivery Bay before placement', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Rampa dostawcza', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('6 × 6 pól');
  await expect(dialog.locator('.hud-template__contents')).toContainText('Brama rozładunkowa × 1');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Cegła × 38');
  await dialog.getByRole('button', { name: 'Postaw na mapie' }).click();
  await expect(page.locator('.hud-build__arm-hint')).toContainText('cały wzór');
  await expect(page.locator('.hud-build__arm-hint')).not.toContainText('ścianę');
  await page.mouse.move(960, 540);
  await expect(page.locator('.oblique-template-ghost').getByRole('status')).toContainText('Rampa dostawcza, 6 × 6 pól');
});
