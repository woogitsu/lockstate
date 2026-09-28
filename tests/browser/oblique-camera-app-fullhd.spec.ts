import { expect, test } from './network-changed-fixture';

test('Full HD oblique camera controls the real world and stands down during Build', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();

  const angle = page.locator('.hud-camera-angle');
  await expect(angle).toBeVisible();
  const reading = angle.locator('output');
  await expect(reading).toContainText('-45°');
  const worldClip = { x: 350, y: 260, width: 750, height: 500 };
  const before = await page.screenshot({ clip: worldClip });
  await angle.getByRole('button', { name: /Turn right|Obróć w prawo/ }).click();
  await expect(reading).toContainText('-30°');
  const after = await page.screenshot({ clip: worldClip });
  expect(after.equals(before), 'the rendered world did not turn with the HUD action').toBe(false);
  await page.screenshot({ path: testInfo.outputPath('oblique-after-hud-turn-fullhd.png') });

  await page.locator('canvas').click({ position: { x: 750, y: 400 } });
  await page.keyboard.press('q');
  await expect(reading).toContainText('-45°');

  const priorDrag = await reading.textContent();
  await page.mouse.move(700, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 420, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(reading).not.toHaveText(priorDrag ?? '');

  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: /Place on map|Stawiaj na mapie/ }).click();
  await expect(angle.getByRole('button', { name: /Turn right|Obróć w prawo/ })).toBeDisabled();
  const armedPose = await reading.textContent();
  await page.keyboard.press('e');
  await page.mouse.move(700, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 420, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(reading).toHaveText(armedPose ?? '');
});
