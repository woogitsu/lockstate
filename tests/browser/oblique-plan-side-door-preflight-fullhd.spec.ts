import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD room plan marks a side wall blocked by an ordinary pending door after Save/Load', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('14');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('12');
  await page.locator('.hud-build .ui-choice [data-choice="west"]').click();
  await page.locator('.hud-build__coordinates .ui-action').click();
  await expect.poll(async () => (await sentCommands(page)).some((command) =>
    command.type === 'PlaceBuildOrder' && command.definitionId === 'door-wooden' &&
    command.x === 14 && command.y === 12 && command.edge === 'west')).toBe(true);

  const checkPlan = async () => {
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.getByRole('button', { name: 'Room plans', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
    await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
    await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
    await expect(dialog.getByRole('status')).toContainText('blocked');
    await expect(dialog.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
    return dialog;
  };
  const dialog = await checkPlan();
  await page.screenshot({ path: testInfo.outputPath('plan-side-door-blocked-before-load-fullhd.png') });
  await dialog.getByRole('button', { name: 'Close plans' }).click();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await checkPlan();
  await page.screenshot({ path: testInfo.outputPath('plan-side-door-blocked-after-load-fullhd.png') });
});

test('Full HD Yard remains available beside an ordinary door because it builds no wall', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill('18');
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('12');
  await page.locator('.hud-build .ui-choice [data-choice="west"]').click();
  await page.locator('.hud-build__coordinates .ui-action').click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Yard', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('button', { name: 'Place room plan' })).toBeEnabled();
});
