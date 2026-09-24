import { expect, test } from './network-changed-fixture';
import type { HudViewModel } from '../../src/ui/hud';
import './ui-harness-api';

const MODEL: HudViewModel = {
  counts: {
    prisoners: 6,
    prisonerCapacity: 6,
    occupiedPlaces: 6,
    staff: 2,
    staffUnassigned: 0,
    rooms: 1,
    prisonersCovered: 6,
    prisonersUnderstaffed: 0,
    prisonersUnguarded: 0,
    prisonersHighRisk: 0,
    activeIncidents: 0,
    contrabandFound: 0,
    treasuryMinorUnits: 22_360,
    stateIncomeAccruedTodayMinorUnits: 123,
  },
  clock: { day: 3, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
  alerts: Array.from({ length: 8 }, (_, index) => ({
    id: `alert-${index}`,
    labelKey: 'hud.alerts.title',
    severity: 'warning' as const,
    occurrences: { count: 1, firstSequence: index + 1, lastSequence: index + 1, statement: `alert-${index}` },
  })),
};

test('Full HD HUD at 200% keeps the world visible and alert actions reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
  // The UI harness does not mount the application's accessibility controller.
  // Apply its two public styling outputs directly to exercise the same CSS.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ui-scale', '2');
    document.documentElement.setAttribute('data-ui-scale-enlarged', 'true');
  });
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), MODEL);

  const geometry = await page.evaluate(() => {
    const corner = document.querySelector<HTMLElement>('.hud__corner')!;
    const minimap = document.querySelector<HTMLElement>('.hud-minimap')!;
    const list = document.querySelector<HTMLElement>('.hud-alerts__list')!;
    const zoom = document.querySelector<HTMLElement>('.hud-zoom__in')!;
    const cornerBox = corner.getBoundingClientRect();
    const zoomBox = zoom.getBoundingClientRect();
    const mapButton = minimap.querySelector<HTMLElement>('.hud-minimap__surface')!;
    const mapBox = mapButton.getBoundingClientRect();
    const placeholderBox = minimap.querySelector<HTMLElement>('.hud-minimap__placeholder')!.getBoundingClientRect();
    const dismiss = list.querySelector<HTMLElement>('button')!;
    const dismissBox = dismiss.getBoundingClientRect();
    const hit = (box: DOMRect, element: Element) => {
      const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return target === element || element.contains(target);
    };
    return {
      scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
      enlarged: document.documentElement.getAttribute('data-ui-scale-enlarged'),
      cornerMaxHeight: getComputedStyle(corner).maxHeight,
      cornerTop: cornerBox.top,
      cornerHeight: cornerBox.height,
      minimapVisible: minimap.getBoundingClientRect().height > 0,
      alertsScroll: list.scrollHeight > list.clientHeight,
      zoomHit: hit(zoomBox, zoom),
      mapHit: hit(mapBox, mapButton),
      dismissHit: hit(dismissBox, dismiss),
      dismissTop: dismissBox.top,
      dismissHeight: dismissBox.height,
      listTop: list.getBoundingClientRect().top,
      listHeight: list.clientHeight,
      mapTop: mapBox.top,
      mapHeight: mapBox.height,
      placeholderContained: placeholderBox.top >= mapBox.top && placeholderBox.bottom <= mapBox.bottom,
      mapTarget: document.elementFromPoint(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)?.className,
    };
  });

  expect(geometry.cornerTop, JSON.stringify(geometry)).toBeGreaterThanOrEqual(540);
  expect(geometry.cornerHeight).toBeLessThanOrEqual(540);
  expect(geometry.minimapVisible).toBe(true);
  expect(geometry.alertsScroll).toBe(true);
  expect(geometry.zoomHit).toBe(true);
  expect(geometry.mapHit, JSON.stringify(geometry)).toBe(true);
  expect(geometry.placeholderContained, JSON.stringify(geometry)).toBe(true);
  expect(geometry.dismissHit, JSON.stringify(geometry)).toBe(true);
});
