import { expect, test } from './network-changed-fixture';

for (const uiScale of [100, 200] as const) {
  test(`Full HD inspector labels both preference controls at ${uiScale}%`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await page.locator('#game-root canvas').waitFor();
    await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
    if (uiScale === 200) {
      for (let step = 0; step < 4; step += 1) await page.locator('.display-scale__cycle').click();
    }

    const reading = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.hud-chrome-prefs')!;
      const arrow = document.querySelector<HTMLElement>('.hud__rail .hud-layout__arrow')!;
      const controls = ['display-scale', 'theme-control'].map((name) => {
        const control = row.querySelector<HTMLElement>(`.${name}`)!;
        const legend = control.querySelector<HTMLElement>(`.${name}__legend`)!;
        const button = control.querySelector<HTMLButtonElement>(`.${name}__cycle`)!;
        const value = button.querySelector<HTMLElement>(`.${name}__value`)!;
        const legendBox = legend.getBoundingClientRect();
        const controlBox = control.getBoundingClientRect();
        const buttonBox = button.getBoundingClientRect();
        const valueBox = value.getBoundingClientRect();
        const target = document.elementFromPoint(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
        return {
          text: legend.textContent,
          labelVisible: getComputedStyle(legend).display !== 'none'
            && legend.scrollWidth <= legend.clientWidth + 1
            && legendBox.left >= controlBox.left && legendBox.right <= controlBox.right,
          noOverlap: legendBox.bottom <= valueBox.top,
          buttonHit: target === button || button.contains(target),
          buttonFits: buttonBox.left >= controlBox.left && buttonBox.right <= controlBox.right,
          clearsFoldArrow: name !== 'display-scale' || legendBox.left >= arrow.getBoundingClientRect().right,
        };
      });
      return {
        rowHeight: row.getBoundingClientRect().height,
        tapTarget: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap-target')),
        controls,
        mapHit: document.elementFromPoint(960, 540)?.tagName,
      };
    });

    expect(reading.controls).toHaveLength(2);
    expect(reading.controls.every((control) => control.labelVisible), JSON.stringify(reading)).toBe(true);
    expect(reading.controls.every((control) => control.noOverlap), JSON.stringify(reading)).toBe(true);
    expect(reading.controls.every((control) => control.buttonHit && control.buttonFits), JSON.stringify(reading)).toBe(true);
    expect(reading.controls.every((control) => control.clearsFoldArrow), JSON.stringify(reading)).toBe(true);
    expect(reading.rowHeight).toBeLessThanOrEqual(reading.tapTarget + 2);
    expect(reading.mapHit).toBe('CANVAS');
  });
}
