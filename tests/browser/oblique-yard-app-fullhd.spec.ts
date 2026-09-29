import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD angled Build reaches, places and restores the complete Yard plan', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Yard', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('8 × 8 tiles');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(64);
  await expect(dialog.locator('.hud-template__contents')).toBeHidden();
  await expect(dialog.locator('.hud-template__materials')).toBeHidden();
  await expect(dialog.locator('.hud-template__legend')).toBeHidden();
  await expect(dialog.getByRole('checkbox', { name: 'Mirror horizontally' })).toBeHidden();
  await expect(dialog.locator('.hud-template__catalogue-value')).toHaveText('Catalogue value: 0. No materials required.');
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  const ghost = page.locator('.oblique-template-ghost');
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(ghost.getByRole('status')).toContainText('Yard, 8 × 8 tiles');
  await expect(ghost.locator('polygon')).toHaveCount(64);
  await expect(ghost.locator('polygon[data-kind="floor"]')).toHaveCount(64);
  await expect(ghost.locator('.oblique-template-ghost__cost')).toHaveText('Catalogue value: 0. No materials required.');
  const origin = await ghost.locator('polygon').first().evaluate((node) => ({
    x: Number(node.getAttribute('data-tile-x')), y: Number(node.getAttribute('data-tile-y')),
  }));
  await page.screenshot({ path: testInfo.outputPath('oblique-yard-before-placement-1920x1080.png') });
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
  expect((await sentCommands(page)).find((command) => command.type === 'PlaceRoomTemplate')).toMatchObject({
    templateId: 'yard-basic', origin,
  });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('button', { name: 'Yard', exact: true }).click();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill(String(origin.x));
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(origin.y));
  await expect(restored.getByRole('status')).toContainText('blocked');
});

test('Polish Full HD Build names the Yard before placement', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Plac spacerowy', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('8 × 8 pól');
  await expect(dialog.locator('.hud-template__contents')).toBeHidden();
  await expect(dialog.locator('.hud-template__materials')).toBeHidden();
  await expect(dialog.locator('.hud-template__catalogue-value')).toHaveText('Wartość katalogowa: 0. Nie wymaga materiałów.');
  await dialog.getByRole('button', { name: 'Postaw na mapie' }).click();
  await expect(page.locator('.hud-build__arm-hint')).toContainText('cały wzór');
  await expect(page.locator('.hud-build__arm-hint')).not.toContainText('ścianę');
  await page.mouse.move(960, 540);
  await expect(page.locator('.oblique-template-ghost').getByRole('status')).toContainText('Plac spacerowy, 8 × 8 pól');
});
