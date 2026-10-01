import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

for (const mode of ['top-down', 'oblique']) test(`${mode}: Full HD room catalogue reaches mouse placement, blocks overlap and survives Save/Load`, async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(mode === 'oblique' ? '/?renderer=oblique' : '/');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await expect(dialog.locator('.hud-template__choices button')).toHaveCount(20);
  await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.mouse.move(880, 380);
  const ghost = page.locator('.room-template-world-ghost');
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await expect(ghost.locator('polygon')).toHaveCount(28);
  await expect(ghost.getByRole('status')).toContainText('Materials catalogue value');
  await page.screenshot({ path: 'test-results/room-plan-world-' + mode + '.png' });
  await page.mouse.click(880, 380);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate').length).toBe(1);
  await expect(ghost).toBeHidden();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(880, 380);
  await expect(ghost).toHaveAttribute('data-ready', 'blocked');
  await page.mouse.click(880, 380);
  await expect(ghost).toHaveAttribute('data-ready', 'blocked');
  expect((await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(ghost).toBeHidden();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('#game-root canvas')).toBeVisible();
});

test('Full HD angled catalogue exposes all twenty plans, full fixture footprints and open yard', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  const ghost = page.locator('.room-template-world-ghost');
  for (let index = 0; index < 20; index += 1) {
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    const choice = dialog.locator('.hud-template__choices button').nth(index);
    await choice.click();
    const dimensions = await dialog.locator('.hud-template__dimensions').innerText();
    const [width, height] = dimensions.split(/[^0-9]+/).map(Number);
    if (index === 0) await expect(dialog.locator('.hud-template__diagram .hud-template__tile--object')).toHaveCount(3);
    if (index === 4) await expect(dialog.locator('.hud-template__diagram .hud-template__tile--object')).toHaveCount(20);
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    await page.mouse.move(900 + index % 2, 360);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(ghost.locator('polygon')).toHaveCount(width! * height!);
    if (index === 10) {
      await expect(ghost.locator('polygon[fill="#36b8ba"]')).toHaveCount(0);
      await expect(ghost.locator('polygon[fill="#e9bc52"]')).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    await expect(ghost).toBeHidden();
  }
});

for (const name of ['Canteen', 'Yard']) test(`angled mouse placement submits the ${name} plan`, async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name, exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(880, 380);
  const ghost = page.locator('.room-template-world-ghost');
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  if (name === 'Canteen') await expect(ghost.locator('polygon[fill="#a794e3"]')).toHaveCount(20);
  await page.mouse.click(880, 380);
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate').length).toBe(1);
  const orders = (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate');
  expect(orders[0]?.templateId).toBe(name === 'Canteen' ? 'canteen-basic' : 'yard-basic');
});
