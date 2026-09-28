import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD angled scene paints the whole canteen before placing that plan', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Canteen' }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  const ghost = page.locator('.oblique-template-ghost');
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(ghost.getByRole('status')).toContainText('Canteen, 8 × 8 tiles');
  await expect(ghost.locator('polygon')).toHaveCount(64);
  await expect(ghost.locator('polygon[data-kind="furniture"]')).toHaveCount(20);
  await expect(ghost.locator('polygon[data-kind="door"]')).toHaveCount(1);
  await expect(ghost.locator('.oblique-template-ghost__cost')).toContainText('Catalogue value:');
  const footprintBounds = await ghost.locator('svg polygon').evaluateAll((polygons) => {
    const boxes = polygons.map((polygon) => polygon.getBoundingClientRect());
    return {
      left: Math.min(...boxes.map((box) => box.left)),
      right: Math.max(...boxes.map((box) => box.right)),
      top: Math.min(...boxes.map((box) => box.top)),
      bottom: Math.max(...boxes.map((box) => box.bottom)),
    };
  });
  expect(footprintBounds.left).toBeGreaterThan(125);
  expect(footprintBounds.right).toBeLessThan(1557);
  expect(footprintBounds.top).toBeGreaterThan(94);
  expect(footprintBounds.bottom).toBeLessThan(950);
  const origin = await ghost.locator('polygon').first().evaluate((node) => ({
    x: Number(node.getAttribute('data-tile-x')), y: Number(node.getAttribute('data-tile-y')),
  }));
  await page.screenshot({ path: testInfo.outputPath('oblique-canteen-before-placement-1920x1080.png') });
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
  expect((await sentCommands(page)).find((command) => command.type === 'PlaceRoomTemplate')).toMatchObject({
    templateId: 'canteen-basic', origin,
  });
  await expect(ghost).toBeHidden();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('button', { name: 'Canteen' }).click();
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill(String(origin.x));
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(origin.y));
  await expect(restored.getByRole('status')).toContainText('blocked');
  await restored.getByRole('button', { name: 'Place on map' }).click();
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'blocked');
  await expect(ghost.locator('polygon[data-kind="blocked"]')).toHaveCount(1);
  await expect(ghost.locator('polygon[data-kind="door"]')).toHaveCount(0);
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('oblique-canteen-after-load-1920x1080.png') });
});

test('Polish Full HD angled ghost names the plan that the next click will place', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' })));
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'Nowe więzienie' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: 'Wzory pomieszczeń' }).click();
  const dialog = page.getByRole('dialog', { name: 'Wzory pomieszczeń' });
  await dialog.getByRole('button', { name: 'Stołówka' }).click();
  await dialog.getByRole('button', { name: 'Postaw na mapie' }).click();
  await page.mouse.move(960, 540);
  const ghost = page.locator('.oblique-template-ghost');
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(ghost.getByRole('status')).toContainText('Stołówka, 8 × 8 pól');
  await page.screenshot({ path: testInfo.outputPath('oblique-canteen-identity-pl-1920x1080.png') });
});
