import { expect, test } from './network-changed-fixture';
import { installTee, openApp, sentCommands } from './playtest-harness';

test.use({ hasTouch: true });

test('arming Build on a phone reveals the map and leaves a way back to the catalogue (#517)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();

  const panel = page.locator('.hud-build');
  const body = panel.locator(':scope > .ui-panel__body');
  await expect(body).toBeVisible();
  const arm = page.locator('.hud-build__arm');
  const armBox = await arm.boundingBox();
  expect(armBox).not.toBeNull();
  await page.touchscreen.tap(armBox!.x + armBox!.width / 2, armBox!.y + armBox!.height / 2);
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'true');
  await expect(body).toBeHidden();
  expect(await page.evaluate(() => document.elementFromPoint(187, 450)?.tagName)).toBe('CANVAS');
  await page.touchscreen.tap(187, 450);
  await expect.poll(async () => (await sentCommands(page)).some((command) => command['type'] === 'PlaceBuildOrder')).toBe(true);

  // The same armed state keeps the map visible after a phone-desktop-phone
  // resize; a desktop view preserves its full panel as before.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(body).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(body).toBeHidden();

  // The panel's header remains a reachable handle while the tool stays armed.
  const toggle = panel.locator('.ui-panel__toggle');
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox).not.toBeNull();
  await page.touchscreen.tap(toggleBox!.x + toggleBox!.width / 2, toggleBox!.y + toggleBox!.height / 2);
  await expect(body).toBeVisible();
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'false');
  await expect(body).toBeVisible();

  // A keyboard activation folds its own focused button; focus goes to the
  // still-visible header control instead of disappearing into the page.
  await arm.focus();
  await page.keyboard.press('Enter');
  await expect(body).toBeHidden();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.locator('.hud-build__remove').click();
  await expect(body).toBeHidden();
  await toggle.click();
  await expect(page.locator('.hud-build__remove')).toHaveAttribute('data-removing', 'true');
  await page.locator('.hud-build__remove').click();
  await expect(body).toBeVisible();
});

test('an open coordinate form stays visible when the Build tool is armed on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.locator('.hud-build__coordinates .ui-section__header').click();
  await expect(page.locator('.hud-build__coordinates .ui-section__body')).toBeVisible();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build > .ui-panel__body')).toBeVisible();
});
