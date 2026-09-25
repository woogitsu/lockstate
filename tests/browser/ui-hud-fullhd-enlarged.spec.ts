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
  regime: {
    groups: [{
      classificationGroupId: 'general-population',
      labelKey: 'classification-group.general-population.name',
      allowedCategoryLabelKeys: ['action-category.recreation.name'],
      blockProgressPercent: 67,
      startTickOfDay: 1_200,
      allowedCategoryIds: ['recreation'],
    }],
  },
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
    const metrics = [...document.querySelectorAll<HTMLElement>('.hud-strip__metrics > .ui-stat')];
    const metricsBox = document.querySelector<HTMLElement>('.hud-strip__metrics')!.getBoundingClientRect();
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
      cornerWidth: cornerBox.width,
      metricCount: metrics.length,
      metricsVisible: metrics.every((metric) => {
        const box = metric.getBoundingClientRect();
        return box.left >= metricsBox.left - 1 && box.right <= metricsBox.right + 1
          && box.top >= metricsBox.top - 1 && box.bottom <= metricsBox.bottom + 1;
      }),
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
  expect(geometry.cornerWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(600);
  expect(geometry.metricCount).toBe(9);
  expect(geometry.metricsVisible, JSON.stringify(geometry)).toBe(true);
  expect(geometry.minimapVisible).toBe(true);
  expect(geometry.alertsScroll).toBe(true);
  expect(geometry.zoomHit).toBe(true);
  expect(geometry.mapHit, JSON.stringify(geometry)).toBe(true);
  expect(geometry.mapHeight, JSON.stringify(geometry)).toBeGreaterThanOrEqual(110);
  expect(geometry.placeholderContained, JSON.stringify(geometry)).toBe(true);
  expect(geometry.dismissHit, JSON.stringify(geometry)).toBe(true);
});

test('Full HD HUD at 200% reads the regime action and initial save actions without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ui-scale', '2');
    document.documentElement.setAttribute('data-ui-scale-enlarged', 'true');
    window.lockstateUiHarness.mountHudShell();
    window.lockstateUiHarness.mountSavePanel();
    document.querySelector('.hud__aside')!.append(document.querySelector('.save-panel')!);
  });
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), MODEL);
  await page.locator('.ui-tab[data-tab="day-plan"]').click();

  const reading = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.hud-regime__editor > .ui-section__header')!;
    const label = editor.querySelector<HTMLElement>('.ui-section__eyebrow')!;
    const panel = document.querySelector<HTMLElement>('.save-panel')!;
    const panelBox = panel.getBoundingClientRect();
    const buttons = [...panel.querySelectorAll<HTMLElement>('.save-panel__button')];
    const create = panel.querySelector<HTMLElement>('.save-panel__create')!;
    const heading = panel.querySelector<HTMLElement>('.save-panel__heading')!;
    const createBox = create.getBoundingClientRect();
    const headingBox = heading.getBoundingClientRect();
    const hit = document.elementFromPoint(createBox.left + createBox.width / 2, createBox.top + createBox.height / 2);
    const colour = getComputedStyle(create);
    const channels = (value: string) => [...value.matchAll(/[\d.]+/g)].slice(0, 3).map((match) => Number(match[0]) / 255);
    const luminance = (value: string) => channels(value).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
    const light = Math.max(luminance(colour.color), luminance(colour.backgroundColor));
    const dark = Math.min(luminance(colour.color), luminance(colour.backgroundColor));
    return {
      label: label.textContent,
      labelFits: label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().right <= editor.getBoundingClientRect().right,
      actionFits: createBox.left >= panelBox.left && createBox.right <= panelBox.right && createBox.bottom <= panelBox.bottom + 1,
      actionHit: hit === create || create.contains(hit),
      headingSeparated: headingBox.right <= createBox.left,
      actionContrast: (light + 0.05) / (dark + 0.05),
      buttons: buttons.length,
    };
  });

  expect(reading.label).toBe('Change the block running now');
  expect(reading.labelFits, JSON.stringify(reading)).toBe(true);
  expect(reading.buttons).toBe(4);
  expect(reading.actionFits, JSON.stringify(reading)).toBe(true);
  expect(reading.actionHit, JSON.stringify(reading)).toBe(true);
  expect(reading.headingSeparated, JSON.stringify(reading)).toBe(true);
  expect(reading.actionContrast, JSON.stringify(reading)).toBeGreaterThanOrEqual(4.5);
});
