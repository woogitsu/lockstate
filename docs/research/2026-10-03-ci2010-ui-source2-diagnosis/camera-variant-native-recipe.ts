import { writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { readMinimapGeometry } from './minimap-geometry-probe';
import { assertCameraAndAlertFloors, assertOriginal1292, installCameraReviewVariant, type CameraReviewVariant } from './camera-variant-native';

/** Root's next exclusive browser lease only. No test/server starts on import. */
export async function reviewCameraVariant(
  page: Page, variant: CameraReviewVariant, outputPath: (name: string) => string,
  labels = { visibleViewLabel: 'View', controlsLabel: 'Camera controls' },
) {
  async function capture(name: string) {
    const geometry = await page.evaluate(readMinimapGeometry);
    writeFileSync(outputPath(`${variant}-${name}.json`), JSON.stringify(geometry, null, 2));
    await page.screenshot({ path: outputPath(`${variant}-${name}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('.hud[data-layout-navigation-placement]').waitFor();
  await capture('original-before-variant');
  // Preserve the actual unmodified observer failure verbatim, including success
  // if a later integration has independently fixed it. Never call it a pass.
  try {
    await assertOriginal1292(page, 800);
    writeFileSync(outputPath(`${variant}-original-observer.txt`), 'Original observer GREEN before transient variant\n');
  } catch (error) {
    writeFileSync(outputPath(`${variant}-original-observer.txt`), String(error));
  }
  const installed = await page.evaluate(installCameraReviewVariant, { variant, ...labels });
  expect(installed.panButtons).toBe(4);
  expect(installed.poseButtons).toBe(4);
  // These are the original three boundary observations, not new thresholds.
  for (const height of [800, 781, 780] as const) {
    await page.setViewportSize({ width: 1280, height });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await capture(`1292-${height}`);
    await assertOriginal1292(page, height);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
  const panel = page.locator('.camera-review-toolbox');
  const trigger = page.locator('.camera-review-trigger');
  for (const scale of [1, 2] as const) {
    if (scale === 2) {
      for (let step = 0; step < 4; step++) await page.locator('.display-scale__cycle').click();
    }
    await page.locator('.ui-tab[data-tab="build"]').click();
    const minimap = page.locator('.hud-minimap');
    const toggle = minimap.locator('.ui-panel__toggle');
    if (scale === 1) {
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.focus();
      await page.keyboard.press('Enter');
    } else {
      // The same public session retains the explicit user expansion at200%.
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await capture(`fullhd-${scale * 100}-build-expanded`);
    await expect(minimap.locator('.hud-minimap__surface')).toBeVisible();
    await expect(page.locator('.hud__corner > .hud-alerts--detached .ui-section__body')).toBeVisible();
    await page.locator('.ui-tab[data-tab="overview"]').click();
    await capture(`fullhd-${scale * 100}-overview-before-list-assertion`);
    await expect(page.locator('.hud-minimap .hud-alerts__list')).toBeVisible();
    if (variant === 'disclosure') {
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(panel.locator('select')).toBeFocused();
    }
    await expect(panel).toBeVisible();
    await panel.locator('select').selectOption('world');
    await expect(panel.locator('select')).toHaveAttribute('aria-busy', 'false');
    await capture(`fullhd-${scale * 100}-world-controls`);
    await assertCameraAndAlertFloors(page, scale, variant, 'world');
    await panel.locator('[data-camera-pan-direction="right"]').click();
    await page.locator('.hud-zoom__in').click();
    await panel.locator('select').selectOption('oblique');
    await expect(panel.locator('select')).toHaveAttribute('aria-busy', 'false');
    await expect(panel.locator('.hud-camera-pose')).toBeVisible();
    await panel.locator('[data-camera-pose-axis="yaw"][data-camera-pose-direction="1"]').click();
    await panel.locator('[data-camera-pose-axis="elevation"][data-camera-pose-direction="1"]').click();
    await capture(`fullhd-${scale * 100}-angled-controls`);
    await assertCameraAndAlertFloors(page, scale, variant, 'oblique');
    await panel.locator('select').selectOption('world');
    await expect(panel.locator('select')).toHaveAttribute('aria-busy', 'false');
    if (variant === 'disclosure') {
      await panel.locator('select').focus();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(trigger).toBeFocused();
    }
    await page.locator('.ui-tab[data-tab="build"]').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.hud__corner > .hud-alerts--detached .ui-section__body')).toBeVisible();
  }
}
