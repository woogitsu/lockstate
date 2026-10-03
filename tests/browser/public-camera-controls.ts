import { expect, type Page } from './network-changed-fixture';

/** Explicit public prerequisite, never a global fixture hook. Reopening after
 * New/Load/page replacement uses the actual View/Widok action; the caller
 * still chooses every renderer/camera action. */
export async function openCameraControls(page: Page): Promise<void> {
  const panel = page.locator('.hud-camera-panel');
  await expect(panel).toHaveCount(1);
  if (!await panel.isVisible()) {
    await page.getByRole('button', { name: /^(View|Widok)$/u }).click();
  }
  await expect(panel).toBeVisible();
  await expect(page.getByRole('button', { name: /^(View|Widok)$/u })).toHaveAttribute('aria-expanded', 'true');
}

/** Return pointer ownership to the real map after the caller's camera action. */
export async function closeCameraControls(page: Page): Promise<void> {
  const panel = page.locator('.hud-camera-panel');
  await expect(panel).toHaveCount(1);
  if (await panel.isVisible()) {
    await page.getByRole('button', { name: /^(View|Widok)$/u }).click();
  }
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: /^(View|Widok)$/u })).toHaveAttribute('aria-expanded', 'false');
}
