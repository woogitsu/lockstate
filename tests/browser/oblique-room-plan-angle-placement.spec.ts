import { expect, test } from './network-changed-fixture';
import { countsSeries, installTee, sentCommands } from './playtest-harness';

test('Full HD room plan remains the exact ghost after camera turn and places only on left click', async ({ page }) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Canteen', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Rotation' }).selectOption('3');
  await dialog.getByRole('button', { name: 'Place on map' }).click();

  const ghost = page.locator('.oblique-template-ghost');
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(ghost.locator('polygon')).toHaveCount(64);
  await expect(ghost.locator('polygon[data-kind="door"]')).toHaveCount(1);
  const angle = page.locator('.hud-camera-angle');
  const turnRight = angle.getByRole('button', { name: 'Turn right' });
  await expect(turnRight).toBeEnabled();
  await turnRight.click();
  await expect(angle.locator('output')).toContainText('-30°');
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect(ghost.locator('polygon')).toHaveCount(64);

  await page.mouse.move(960, 540);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1000, 560, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  expect((await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  const origin = await ghost.locator('polygon').first().evaluate((node) => ({
    x: Number(node.getAttribute('data-tile-x')), y: Number(node.getAttribute('data-tile-y')),
  }));
  await page.mouse.click(1000, 560);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'canteen-basic', origin, quarterTurns: 3 },
  ]);
  await expect(ghost).toBeHidden();

  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('button', { name: 'Canteen', exact: true }).click();
  await restored.getByRole('combobox', { name: 'Rotation' }).selectOption('3');
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill(String(origin.x));
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(origin.y));
  await expect(restored.getByRole('status')).toContainText('blocked');
  await expect(restored.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
});
