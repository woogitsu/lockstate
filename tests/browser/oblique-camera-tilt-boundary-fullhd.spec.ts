import { expect, test } from './network-changed-fixture';

test('Full HD camera tilt buttons stop at the renderer limits', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
  const angle = page.locator('.hud-camera-angle');
  const up = angle.getByRole('button', { name: /Tilt up|Pochyl w górę/ });
  const down = angle.getByRole('button', { name: /Tilt down|Pochyl w dół/ });
  await expect(angle.locator('output')).toContainText('45°');
  for (let step = 0; step < 4; step += 1) await up.click();
  await expect(angle.locator('output')).toContainText('80°');
  await expect(up).toBeDisabled();
  await expect(down).toBeEnabled();
  for (let step = 0; step < 6; step += 1) await down.click();
  await expect(angle.locator('output')).toContainText('20°');
  await expect(down).toBeDisabled();
  await expect(up).toBeEnabled();
});
