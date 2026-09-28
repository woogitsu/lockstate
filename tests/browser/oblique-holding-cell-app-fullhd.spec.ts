import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD angled Build previews, places and restores the Holding Cell footprint', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Holding Cell', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('4 × 4 tiles');
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile')).toHaveCount(16);
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--door')).toHaveCount(1);
  await expect(dialog.locator('.hud-template__diagram .hud-template__tile--object')).toHaveCount(2);
  await expect(dialog.locator('.hud-template__contents')).toContainText('Bench × 1');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Brick × 22');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Wood Plank × 3');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('1,075');
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  const ghost = page.locator('.oblique-template-ghost');
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(ghost.getByRole('status')).toContainText('Holding Cell, 4 × 4 tiles');
  await expect(ghost.locator('polygon')).toHaveCount(16);
  await expect(ghost.locator('polygon[data-kind="furniture"]')).toHaveCount(2);
  await expect(ghost.locator('.oblique-template-ghost__cost')).toContainText('Catalogue value: 1,075');
  const origin = await ghost.locator('polygon').first().evaluate((node) => ({
    x: Number(node.getAttribute('data-tile-x')), y: Number(node.getAttribute('data-tile-y')),
  }));
  const marked = await ghost.locator('polygon[data-kind="door"], polygon[data-kind="furniture"]').evaluateAll((nodes) =>
    nodes.map((node) => ({ kind: node.getAttribute('data-kind'), x: Number(node.getAttribute('data-tile-x')), y: Number(node.getAttribute('data-tile-y')) })));
  expect(marked).toEqual([
    { kind: 'furniture', x: origin.x + 1, y: origin.y + 1 },
    { kind: 'furniture', x: origin.x + 2, y: origin.y + 1 },
    { kind: 'door', x: origin.x + 1, y: origin.y + 3 },
  ]);
  await page.screenshot({ path: testInfo.outputPath('oblique-holding-cell-before-placement-1920x1080.png') });
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
  expect((await sentCommands(page)).find((command) => command.type === 'PlaceRoomTemplate')).toMatchObject({
    templateId: 'holding-cell-basic', origin,
  });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('button', { name: 'Holding Cell', exact: true }).click();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill(String(origin.x));
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(origin.y));
  await expect(restored.getByRole('status')).toContainText('blocked');
});

test('Polish Full HD Build names the Holding Cell before placement', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Cela przejściowa', exact: true }).click();
  await expect(dialog.locator('.hud-template__dimensions')).toHaveText('4 × 4 pól');
  await expect(dialog.locator('.hud-template__contents')).toContainText('Ławka × 1');
  await expect(dialog.locator('.hud-template__materials')).toContainText('Cegła × 22');
  await expect(dialog.locator('.hud-template__catalogue-value')).toContainText('1075');
  await dialog.getByRole('button', { name: 'Postaw na mapie' }).click();
  await page.mouse.move(960, 540);
  await expect(page.locator('.oblique-template-ghost').getByRole('status')).toContainText('Cela przejściowa, 4 × 4 pól');
});
