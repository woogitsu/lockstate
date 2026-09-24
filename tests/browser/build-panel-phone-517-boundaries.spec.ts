import { expect, test } from './network-changed-fixture';

test.use({ hasTouch: true });

for (const [width, height] of [[720, 450], [1024, 768]] as const) {
  for (const tool of ['place', 'remove'] as const) {
    test(`${tool} yields only an occluded world centre at ${width}x${height} (#517)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/index.html');
      await page.locator('#game-root canvas').waitFor();
      await page.getByRole('button', { name: 'New prison' }).click();
      await page.locator('.ui-tab[data-tab="build"]').click();
      const panel = page.locator('.hud-build');
      const toggle = panel.locator('> .ui-panel__header .ui-panel__toggle');
      const canvas = page.locator('#game-root canvas');
      const centreBefore = await canvas.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const x = innerWidth / 2;
        const y = innerHeight / 2;
        const withinCanvas = x >= box.left && x < box.right && y >= box.top && y < box.bottom;
        return { withinCanvas, panelOwnsHit: document.querySelector('.hud-build')?.contains(document.elementFromPoint(x, y)) ?? false };
      });
      expect(centreBefore.withinCanvas, `${width}x${height}: canvas has no viewport centre`).toBe(true);
      await page.locator(tool === 'place' ? '.hud-build__arm' : '.hud-build__remove').click();
      const folded = centreBefore.panelOwnsHit;
      await expect(panel).toHaveAttribute('data-collapsed', String(folded));
      await expect(toggle).toHaveAttribute('aria-expanded', String(!folded));
      if (folded) {
        await expect(toggle).toBeFocused();
        const centreAfter = await page.evaluate(() => {
          const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
          return { tag: hit?.tagName, className: hit?.className, buildOwnsHit: document.querySelector('.hud-build')?.contains(hit) ?? false };
        });
        expect(centreAfter.buildOwnsHit, `${width}x${height}: Build still covers the world centre: ${JSON.stringify(centreAfter)}`).toBe(false);
        const freeSquare = await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
          if (!canvas) return false;
          const box = canvas.getBoundingClientRect();
          for (let y = Math.max(0, box.top); y + 64 < Math.min(innerHeight, box.bottom); y += 8) {
            for (let x = Math.max(0, box.left); x + 64 < Math.min(innerWidth, box.right); x += 8) {
              let clear = true;
              for (let dy = 0; dy <= 64 && clear; dy += 16) {
                for (let dx = 0; dx <= 64; dx += 16) {
                  if (document.elementFromPoint(x + dx, y + dy) !== canvas) { clear = false; break; }
                }
              }
              if (clear) return true;
            }
          }
          return false;
        });
        expect(freeSquare, `${width}x${height}: folding leaves no 64px world target; centre is ${JSON.stringify(centreAfter)}`).toBe(true);
      } else {
        await expect(toggle).not.toBeFocused();
      }
    });
  }
}
