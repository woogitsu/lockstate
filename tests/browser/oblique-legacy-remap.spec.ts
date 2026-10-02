import { expect, test } from './network-changed-fixture';
import { DEFAULT_KEYBOARD_BINDINGS } from '../../src/input/bindings';

const storageKey = 'lockstate.settings.input';
const legacyBindings = DEFAULT_KEYBOARD_BINDINGS
  .filter((binding) => !binding.action.startsWith('camera.rotate.') && !binding.action.startsWith('camera.tilt.'))
  .map((binding) => binding.code === 'KeyW' ? { ...binding, code: 'KeyQ' } : binding);
const legacySettings = JSON.stringify({ version: 1, keyboardBindings: legacyBindings });

test('legacy KeyQ remap keeps pan and restores left rotation at its vacated physical key', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: legacySettings });
  await page.goto('/?renderer=oblique');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const canvas = page.locator('#game-root canvas');
  const initial = await canvas.screenshot();

  // On AZERTY the physical KeyW says Z. Gameplay must use code, not label.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'z', bubbles: true })));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'z', bubbles: true })));
  const afterTurn = await canvas.screenshot();
  expect(afterTurn.equals(initial), 'vacated physical KeyW did not turn the angled world').toBe(false);

  // The saved custom mapping still owns physical KeyQ (label A on AZERTY).
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'a', bubbles: true })));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', key: 'a', bubbles: true })));
  expect((await canvas.screenshot()).equals(afterTurn), 'saved KeyQ pan no longer moves the world').toBe(false);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(legacySettings);
  await page.screenshot({ path: testInfo.outputPath('legacy-remap-fullhd.png') });
});
