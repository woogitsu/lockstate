import { expect, test } from './network-changed-fixture';

for (const [width, height] of [[1920, 1080], [2560, 1440]] as const) {
  for (const uiScale of [100, 200] as const) {
    test(`Full HD ${width}x${height} at ${uiScale}% reads the Overview income explanation`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/index.html');
      await page.locator('#game-root canvas').waitFor();
      await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
      await expect(page.locator('.hud-overview__income-note')).toBeVisible();
      for (let step = 100; step < uiScale; step += 25) await page.locator('.display-scale__cycle').click();

      const reading = await page.evaluate(() => {
        const note = document.querySelector<HTMLElement>('.hud-overview__income-note')!;
        const panel = document.querySelector<HTMLElement>('.hud-overview')!;
        const noteBox = note.getBoundingClientRect();
        const panelBox = panel.getBoundingClientRect();
        return {
          text: note.textContent,
          left: noteBox.left,
          right: noteBox.right,
          panelLeft: panelBox.left,
          panelRight: panelBox.right,
          panelBottom: panelBox.bottom,
          noteBottom: noteBox.bottom,
          noteClientWidth: note.clientWidth,
          noteScrollWidth: note.scrollWidth,
          overflowY: getComputedStyle(panel).overflowY,
          scrollable: panel.scrollHeight > panel.clientHeight,
        };
      });
      expect(reading.text).toBe('State income is paid for occupied places at the end of each day.');
      expect(reading.left).toBeGreaterThanOrEqual(reading.panelLeft);
      expect(reading.right, JSON.stringify(reading)).toBeLessThanOrEqual(reading.panelRight);
      expect(reading.noteScrollWidth, JSON.stringify(reading)).toBeLessThanOrEqual(reading.noteClientWidth + 1);
      if (uiScale === 100) expect(reading.noteBottom).toBeLessThanOrEqual(reading.panelBottom);
      else if (reading.noteBottom > reading.panelBottom) {
        expect(reading.overflowY).toBe('auto');
        expect(reading.scrollable).toBe(true);
        await page.locator('.hud-overview__income-note').scrollIntoViewIfNeeded();
        const visible = await page.evaluate(() => {
          const note = document.querySelector<HTMLElement>('.hud-overview__income-note')!.getBoundingClientRect();
          const panel = document.querySelector<HTMLElement>('.hud-overview')!.getBoundingClientRect();
          return note.top >= panel.top && note.bottom <= panel.bottom;
        });
        expect(visible).toBe(true);
      }
    });
  }
}
