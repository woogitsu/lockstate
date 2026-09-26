import { expect, test } from './network-changed-fixture';
import { EMPTY_HUD_VIEW_MODEL } from '../../src/ui/hud';
import './ui-harness-api';

for (const [count, sentence] of [
  [1, 'Potrzebny jest 1 funkcjonariusz.'],
  [2, 'Potrzeba 2 funkcjonariuszy.'],
  [5, 'Potrzeba 5 funkcjonariuszy.'],
] as const) {
  test(`Polish Security incident detail inflects ${count} responders`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/tests/browser/ui-harness.html');
    await page.waitForFunction(() => 'lockstateUiHarness' in window);
    await page.evaluate(() => {
      window.lockstateUiHarness.mountHudShell({ locale: 'pl' });
      window.lockstateUiHarness.clickTab('security');
    });
    const incident = {
      incidentId: 'incident.1', typeLabelKey: 'incident-type.assault.name',
      stateLabelKey: 'incident-state.active.name', sectorId: 'sector.default',
      severity: 8, severityMax: 10, participantCount: 3, terminal: false,
    } as const;
    const model = {
      ...EMPTY_HUD_VIEW_MODEL,
      incidents: { open: [incident], total: 1, stillOpen: 1, resolved: 0, lapsed: 0,
        injured: 0, escapes: 0, byType: [] },
    };
    await page.evaluate((view) => window.lockstateUiHarness.setHudViewModel(view as never), model);
    await page.locator('.hud-security__incident-row[data-incident="incident.1"]').click();
    await page.evaluate(([view, detail]) => window.lockstateUiHarness.setHudViewModel({ ...view, incidentDetail: detail } as never),
      [model, { ...incident, timeline: [], injuredCount: 0, propertyDamage: 0,
        propertyDamageMax: 10, escaped: false, requiredResponders: count }] as const);
    await expect(page.locator('.hud-security__detail .hud-security__note').filter({ hasText: sentence })).toBeVisible();
  });
}
