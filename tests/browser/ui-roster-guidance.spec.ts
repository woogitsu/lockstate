import { expect, test } from './network-changed-fixture';
import type { HudPrisonerRosterViewModel } from '../../src/ui/hud';
import './ui-harness-api';

test.use({ viewport: { width: 1920, height: 1080 } });

const empty: HudPrisonerRosterViewModel = { total: 0, everAdmitted: false, rows: [] };
const discharged: HudPrisonerRosterViewModel = { total: 0, everAdmitted: true, rows: [] };

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => {
    window.lockstateUiHarness.mountHudShell();
    window.lockstateUiHarness.clickTab('day-plan');
  });
});

for (const input of ['pointer', 'keyboard'] as const) {
  test(`first empty roster opens Build and focuses its catalogue by ${input}`, async ({ page }) => {
    await page.evaluate((roster) => window.lockstateUiHarness.reportRegime(undefined, roster), empty);
    const guidance = page.locator('.hud-regime__roster .hud-regime__guidance');
    await expect(guidance).toBeVisible();
    await expect(guidance).toHaveText(
      'No prisoners yet. Build a cell — big enough, walled all round, with a bed and a toilet in it — to take somebody in.',
    );
    if (input === 'pointer') await guidance.click();
    else {
      await guidance.focus();
      await expect(guidance).toBeFocused();
      await guidance.press('Enter');
    }
    await expect(page.locator('.hud[data-active-tab="build"]')).toBeVisible();
    const catalogueChoice = page.locator('.hud-build__list [tabindex="0"]');
    await expect(catalogueChoice).toBeVisible();
    await expect(catalogueChoice).toBeFocused();
  });

  test(`discharged roster opens Manage and focuses Admit by ${input}`, async ({ page }) => {
    await page.evaluate((roster) => window.lockstateUiHarness.reportRegime(undefined, roster), discharged);
    const guidance = page.locator('.hud-regime__roster .hud-regime__guidance');
    await expect(guidance).toBeVisible();
    await expect(guidance).toHaveText('This prison is empty. Take somebody in to start again.');
    if (input === 'pointer') await guidance.click();
    else {
      await guidance.focus();
      await expect(guidance).toBeFocused();
      await guidance.press('Enter');
    }
    await expect(page.locator('.hud[data-active-tab="manage"]')).toBeVisible();
    const admit = page.locator('.hud-intake__admit');
    await expect(admit).toBeVisible();
    await expect(admit).toBeFocused();
  });
}

test.describe('touch guidance', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('the empty roster opens Build from a touch press', async ({ page }) => {
    await page.evaluate((roster) => window.lockstateUiHarness.reportRegime(undefined, roster), empty);
    const guidance = page.locator('.hud-regime__roster .hud-regime__guidance');
    await expect(guidance).toBeVisible();
    await guidance.tap();
    await expect(page.locator('.hud[data-active-tab="build"]')).toBeVisible();
    await expect(page.locator('.hud-build__list [tabindex="0"]')).toBeFocused();
  });
});
