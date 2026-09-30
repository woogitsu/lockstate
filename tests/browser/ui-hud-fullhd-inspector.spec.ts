import { expect, test } from './network-changed-fixture';

for (const uiScale of [100, 200] as const) {
  test(`Full HD inspector at ${uiScale}% reads Build and Schedule without covering the map`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await page.locator('#game-root canvas').waitFor();
    await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
    if (uiScale === 200) {
      for (let step = 0; step < 4; step += 1) await page.locator('.display-scale__cycle').click();
    }

    await page.locator('.ui-tab[data-tab="build"]').click();
    const build = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.hud')!;
      const panel = document.querySelector<HTMLElement>('.hud-build')!;
      const actions = [...panel.querySelectorAll<HTMLElement>('.hud-build__actions > button')];
      const panelBox = panel.getBoundingClientRect();
      return {
        inspectorWidth: Number.parseFloat(getComputedStyle(root).getPropertyValue('--hud-inspector-width')),
        actions: actions.length,
        actionsFit: actions.every((action) => {
          const box = action.getBoundingClientRect();
          return box.left >= panelBox.left && box.right <= panelBox.right;
        }),
      };
    });

    await page.locator('.ui-tab[data-tab="day-plan"]').click();
    const schedule = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.hud-regime')!;
      const panelBox = panel.getBoundingClientRect();
      const headers = [...panel.querySelectorAll<HTMLElement>('.hud-regime__block-header')];
      const readings = [...panel.querySelectorAll<HTMLElement>('.hud-regime__block-name, .hud-regime__block-progress')];
      const metrics = [...document.querySelectorAll<HTMLElement>('.hud-strip__metrics > .ui-stat')];
      const stripBox = document.querySelector<HTMLElement>('.hud-strip__metrics')!.getBoundingClientRect();
      const savePanel = document.querySelector<HTMLElement>('.save-panel')!;
      const saveBox = savePanel.getBoundingClientRect();
      const create = savePanel.querySelector<HTMLElement>('.save-panel__create')!;
      const createBox = create.getBoundingClientRect();
      const hit = document.elementFromPoint(createBox.x + createBox.width / 2, createBox.y + createBox.height / 2);
      return {
        headerCount: headers.length,
        headersFit: headers.every((header) => {
          const box = header.getBoundingClientRect();
          return box.left >= panelBox.left && box.right <= panelBox.right;
        }),
        readingsFit: readings.every((reading) => {
          const box = reading.getBoundingClientRect();
          return reading.scrollWidth <= reading.clientWidth + 1
            && box.left >= panelBox.left && box.right <= panelBox.right;
        }),
        metricCount: metrics.length,
        metricsFit: metrics.every((metric) => {
          const box = metric.getBoundingClientRect();
          return box.left >= stripBox.left - 1 && box.right <= stripBox.right + 1
            && box.top >= stripBox.top - 1 && box.bottom <= stripBox.bottom + 1;
        }),
        savesFit: !savePanel.querySelector('details')!.open
          && savePanel.querySelectorAll('.save-panel__actions .save-panel__button').length === 3
          && createBox.bottom <= saveBox.bottom + 1
          && (hit === create || create.contains(hit)),
        mapHit: document.elementFromPoint(960, 540)?.tagName,
      };
    });

    expect(build.inspectorWidth).toBe(340 * uiScale / 100);
    expect(build.actions).toBe(3);
    expect(build.actionsFit).toBe(true);
    expect(schedule.headerCount).toBeGreaterThan(0);
    expect(schedule.headersFit, JSON.stringify(schedule)).toBe(true);
    expect(schedule.readingsFit, JSON.stringify(schedule)).toBe(true);
    expect(schedule.metricCount).toBe(9);
    expect(schedule.metricsFit).toBe(true);
    expect(schedule.savesFit).toBe(true);
    expect(schedule.mapHit).toBe('CANVAS');
  });
}
