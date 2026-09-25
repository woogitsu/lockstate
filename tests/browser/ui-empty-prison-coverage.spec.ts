import { expect, test } from './network-changed-fixture';
import './ui-harness-api';

test.describe('an empty prison does not claim guard coverage (#868)', () => {
  test('one free guard and no posts still reads as no required coverage at 1920x1080', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/tests/browser/ui-harness.html');
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);

    await page.evaluate(() => {
      window.lockstateUiHarness.reportHeldGuards({ held: 0, unassigned: 1, guards: [] });
      window.lockstateUiHarness.reportStaffCoverage({ required: 0, assigned: 0, shortage: 0 });
    });
    const probe = await page.evaluate(() => window.lockstateUiHarness.staffProbe());
    expect(probe.held.summaryText).toContain('1 free');
    expect(probe.coverage.tone).toBe('neutral');
    expect(probe.coverage.badgeText).toBe('No posts');
    expect(probe.coverage.hintText).toBe('No guard posts are required right now.');
    expect(probe.coverage.blockBox?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(probe.panelVisibleBottom);
  });

  for (const viewport of [{ width: 1280, height: 720 }, { width: 900, height: 600 }, { width: 375, height: 812 }] as const) {
    test(`shows the neutral zero-post state at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/tests/browser/ui-harness.html');
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);

      await page.evaluate(() =>
        window.lockstateUiHarness.reportStaffCoverage({ required: 0, assigned: 0, shortage: 0 }),
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
