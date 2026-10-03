import { expect, test } from './network-changed-fixture';

test('Load ends the outgoing right-button camera turn', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');

  const canvas = page.locator('#game-root canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('world canvas absent');
  const origin = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down({ button: 'right' });

  // Keyboard activation changes the simulation worker while the physical RMB
  // remains held. The old scene and pointer object continue to exist.
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  const viewport = page.locator('.hud-minimap__viewport');
  await expect(viewport).toBeVisible();
  const before = await viewport.getAttribute('style');
  await page.screenshot({ path: testInfo.outputPath('loaded-before-stale-turn-fullhd.png') });

  await page.mouse.move(origin.x + 140, origin.y + 45, { steps: 3 });
  await page.waitForTimeout(250);
  expect(await viewport.getAttribute('style')).toBe(before);
  await page.screenshot({ path: testInfo.outputPath('loaded-after-stale-turn-fullhd.png') });
  await page.mouse.up({ button: 'right' });
});
