import { expect, test } from './network-changed-fixture';
import './ui-harness-api';

test.describe('an empty prison does not claim guard coverage (#868)', () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 900, height: 600 }, { width: 375, height: 812 }] as const) {
    test(`shows the neutral zero-post state at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/tests/browser/ui-harness.html');
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);

      await page.evaluate(() =>
        window.lockstateUiHarness.reportStaffCoverage({ required: 0, assigned: 0, shortage: 0, availableReserve: 0, targetReserve: 0 }),
      );
      const coverage = (await page.evaluate(() => window.lockstateUiHarness.staffProbe())).coverage;
      expect(coverage.blockLaidOut).toBe(true);
      expect(coverage.tone).toBe('neutral');
      expect(coverage.badgeText).toBe('No posts');
      expect(coverage.hintText).toBe('No guard posts are required right now.');

      const block = page.locator('.hud-staff__coverage');
      await expect(block).toBeInViewport();
      await expect(block).not.toContainText('Covered');
    });
  }
});
