import { expect, test } from './network-changed-fixture';

test('new prison ground and whole-square grid remain visible through three camera angles', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.locator('.empty-world-prompt').getByRole('button', { name: /Create a prison|Utwórz więzienie/ }).click();
  await expect(page.locator('.empty-world-prompt')).toBeHidden();

  const angle = page.locator('.hud-camera-angle');
  const reading = angle.locator('output');
  await expect(reading).toContainText('-45°');
  for (const yaw of [-45, 0, 45]) {
    await expect(reading).toContainText(`${yaw}°`);
    await page.screenshot({ path: testInfo.outputPath(`new-prison-ground-yaw${yaw}-fullhd.png`) });
    if (yaw !== 45) {
      for (let step = 0; step < 3; step += 1) {
        await angle.getByRole('button', { name: /Turn right|Obróć w prawo/ }).click();
      }
    }
  }
});
