import { expect, test, type Page } from './network-changed-fixture';
import { armBuildable, installTee, sentCommands } from './playtest-harness';

async function savedPausedPrison(page: Page): Promise<void> {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
}

async function keyboardLoadWhileHoldingPointer(page: Page): Promise<void> {
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
}

test('Load cancels an outgoing Rooms drag before release or later pointer movement', async ({ page }) => {
  await savedPausedPrison(page);
  await page.locator('.ui-tab[data-tab="zones"]').click();
  await page.locator('.hud-rooms__arm').click();
  await expect(page.locator('.hud-rooms__arm')).toHaveAttribute('aria-pressed', 'true');
  const emptyArea = await page.locator('.hud-rooms__area-value').innerText();

  await page.mouse.move(900, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1060, 610, { steps: 6 });
  await expect(page.locator('.hud-rooms__area-value')).not.toHaveText(emptyArea);
  expect((await sentCommands(page)).filter(command => command['type'] === 'ZoneRoom')).toHaveLength(0);

  await keyboardLoadWhileHoldingPointer(page);
  await expect(page.locator('.hud-rooms__area-value')).toHaveText(emptyArea);
  await page.mouse.up({ button: 'left' });
  await page.mouse.move(1140, 650, { steps: 3 });
  expect((await sentCommands(page)).filter(command => command['type'] === 'ZoneRoom')).toHaveLength(0);
  await expect(page.locator('.hud-rooms__confirm')).not.toBeVisible();

  await page.mouse.move(900, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1060, 610, { steps: 6 });
  await page.mouse.up({ button: 'left' });
  await expect(page.locator('.hud-rooms__confirm')).toBeVisible();
});

test('Load cancels an outgoing object placement before release or later pointer movement', async ({ page }) => {
  await savedPausedPrison(page);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await armBuildable(page, 'bed-wooden');

  await page.mouse.move(900, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1040, 570, { steps: 5 });
  expect((await sentCommands(page)).filter(command => command['type'] === 'PlaceObject')).toHaveLength(0);

  await keyboardLoadWhileHoldingPointer(page);
  await page.mouse.up({ button: 'left' });
  await page.mouse.move(1140, 650, { steps: 3 });
  expect((await sentCommands(page)).filter(command => command['type'] === 'PlaceObject')).toHaveLength(0);

  await page.mouse.move(900, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await expect.poll(async () => (await sentCommands(page)).filter(command => command['type'] === 'PlaceObject').length).toBe(1);
});
