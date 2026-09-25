import { expect, test } from './network-changed-fixture';

for (const uiScale of [100, 125, 150, 175, 200] as const) {
  test(`Full HD Build at ${uiScale}% keeps the selected tool and placement action usable`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await page.locator('#game-root canvas').waitFor();
    await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
    if (uiScale > 100) {
      for (let step = 0; step < (uiScale - 100) / 25; step += 1) await page.locator('.display-scale__cycle').click();
    }
    await page.locator('.ui-tab[data-tab="build"]').click();

    const geometry = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.hud-build')!;
      const arm = panel.querySelector<HTMLElement>('.hud-build__arm')!;
      const selected = panel.querySelector<HTMLElement>('.hud-build__list > .ui-row[aria-checked="true"]')!;
      const savePanel = document.querySelector<HTMLElement>('.save-panel')!;
      const saves = [...savePanel.querySelectorAll<HTMLElement>('.save-panel__actions .save-panel__button')];
      const panelBox = panel.getBoundingClientRect();
      const armBox = arm.getBoundingClientRect();
      const selectedBox = selected.getBoundingClientRect();
      const saveBox = savePanel.getBoundingClientRect();
      const isHit = (element: HTMLElement, box: DOMRect) => {
        const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return target === element || element.contains(target);
      };
      return {
        armVisible: armBox.top >= panelBox.top && armBox.bottom <= panelBox.bottom && isHit(arm, armBox),
        selectedVisible: selectedBox.top >= panelBox.top && selectedBox.bottom <= panelBox.bottom && isHit(selected, selectedBox),
        savesVisible: saves.length === 4 && saves.every((save) => {
          const box = save.getBoundingClientRect();
          return box.bottom <= saveBox.bottom + 1 && isHit(save, box);
        }),
        mapHit: document.elementFromPoint(960, 540)?.tagName,
      };
    });

    expect(geometry.armVisible, JSON.stringify(geometry)).toBe(true);
    expect(geometry.selectedVisible, JSON.stringify(geometry)).toBe(true);
    expect(geometry.savesVisible, JSON.stringify(geometry)).toBe(true);
    expect(geometry.mapHit).toBe('CANVAS');
  });
}
