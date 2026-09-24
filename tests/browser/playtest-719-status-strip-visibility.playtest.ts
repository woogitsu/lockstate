import { expect, test } from '@playwright/test';
import './ui-harness-api';

/**
 * Issue #719: a fully badged prison still hides the money chips at laptop width.
 * This is a deliberately red playtest pending the owner's layout decision.
 */
test('all nine status metrics are visible at 1280x800 with every badge drawn (#719)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate(() => window.lockstateUiHarness.setHudViewModel({
    counts: {
      prisoners: 178,
      prisonerCapacity: 180,
      occupiedPlaces: 142,
      staff: 27,
      staffUnassigned: 0,
      rooms: 61,
      prisonersCovered: 100,
      prisonersUnderstaffed: 42,
      prisonersUnguarded: 36,
      prisonersHighRisk: 24,
      activeIncidents: 3,
      contrabandFound: 47,
      treasuryMinorUnits: 1_284_500,
      stateIncomeAccruedTodayMinorUnits: 284_500,
      activeIncidentTypeLabelKey: 'incident-type.gang-retaliation.name',
      contrabandNameKey: 'contraband.currency.name',
    },
    clock: { day: 17, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [],
  }));

  const reading = await page.locator('.hud-strip__metrics').evaluate((row) => {
    const rowBox = row.getBoundingClientRect();
    const chips = [...row.querySelectorAll<HTMLElement>('[data-metric]')];
    return {
      clientWidth: row.clientWidth,
      scrollWidth: row.scrollWidth,
      total: chips.length,
      visible: chips.filter((chip) => {
        const box = chip.getBoundingClientRect();
        return box.left >= rowBox.left - 0.5 && box.right <= rowBox.right + 0.5;
      }).length,
    };
  });
  expect(reading.total).toBe(9);
  expect(reading.visible, `${reading.visible}/9 visible, ${reading.scrollWidth}px in ${reading.clientWidth}px`).toBe(9);
});
