import { expect, test } from './network-changed-fixture';
import './ui-harness-api';

for (const uiScale of [100, 200] as const) {
  test(`Full HD Build at ${uiScale}% keeps alerts visible beside a player-controlled minimap`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await page.locator('#game-root canvas').waitFor();
    await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
    for (let step = 100; step < uiScale; step += 25) await page.locator('.display-scale__cycle').click();

    const minimap = page.locator('.hud-minimap');
    const alerts = page.locator('.hud__corner > .hud-alerts--detached');
    const toggle = minimap.locator('.ui-panel__toggle');
    await page.locator('.ui-tab[data-tab="build"]').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(alerts.locator('.ui-section__header')).toBeVisible();
    await expect(alerts.locator('.ui-section__body')).toBeVisible();
    await expect(page.locator('.hud-build__arm')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`build-${uiScale}-folded.png`) });

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(minimap.locator('.hud-minimap__surface')).toBeVisible();
    await expect(alerts.locator('.ui-section__header')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`build-${uiScale}-expanded.png`) });

    await page.locator('.ui-tab[data-tab="overview"]').click();
    await expect(page.locator('.hud-minimap .hud-alerts__list')).toBeVisible();
    await page.locator('.ui-tab[data-tab="build"]').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(alerts.locator('.ui-section__body')).toBeVisible();
  });
}

test('a dismissible alert remains keyboard reachable while the Full HD Build minimap is folded', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate(() => window.lockstateUiHarness.setHudViewModel({
    counts: {
      prisoners: 0, prisonerCapacity: 0, occupiedPlaces: 0, staff: 0, staffUnassigned: 0,
      rooms: 0, prisonersCovered: 0, prisonersUnderstaffed: 0, prisonersUnguarded: 0,
      prisonersHighRisk: 0, activeIncidents: 1, contrabandFound: 0,
      treasuryMinorUnits: 0, stateIncomeAccruedTodayMinorUnits: 0,
    },
    clock: { day: 1, tickOfDay: 0, dayLengthTicks: 2400, mode: 'paused', speed: 1 },
    alerts: [{
      id: 'incident', labelKey: 'hud.alert.refusal.zone.not-enclosed', severity: 'danger',
      occurrences: {
        count: 1, lastAt: { day: 1, progressPercent: 0 }, firstSequence: 1,
        lastSequence: 1, statement: 'incident-statement',
      },
    }],
  }));
  await page.locator('.ui-tab[data-tab="build"]').click();
  await expect(page.locator('.hud-minimap .ui-panel__toggle')).toHaveAttribute('aria-expanded', 'false');
  const dismiss = page.locator('.hud__corner > .hud-alerts--detached [data-alert="incident"] button');
  await expect(dismiss).toBeVisible();
  await dismiss.focus();
  await expect(dismiss).toBeFocused();
  const before = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
  await page.keyboard.press('Enter');
  const after = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
  expect(after.slice(before.length)).toEqual(['{"kind":"dismiss-alert","rowId":"incident"}']);
});
