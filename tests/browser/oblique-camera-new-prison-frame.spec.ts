import { expect, test } from './network-changed-fixture';

test('angled camera returns to a newly created prison after panning beyond the old map', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  const viewport = page.locator('.hud-minimap__viewport');
  await expect(viewport).toBeVisible();
  // A physical remappable camera key, held long enough to leave the initial
  // loaded chunk. The minimap hides its camera outline when no ground in the
  // current prison intersects the view; this is a public UI oracle.
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(5500);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowRight');
  await expect(viewport).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('old-prison-off-map-fullhd.png') });

  // Keyboard activation leaves the pointer and camera untouched. A new
  // prison must frame its own first world rather than retain the old target.
  await page.getByRole('button', { name: 'New prison', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-panel__item')).toHaveCount(2);
  await expect(viewport).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('new-prison-framed-fullhd.png') });
});
