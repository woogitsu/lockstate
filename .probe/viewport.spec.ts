import { expect, test } from '@playwright/test';
import { attachConsole, calibrate, centreOf, dumpHud, installCommandTee, openApp, TILE } from './lib';

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 900, h: 600 },
  { w: 1024, h: 768 },
] as const;

for (const vp of VIEWPORTS) {
  test(`reachable world area at ${vp.w}x${vp.h}`, async ({ page }) => {
    test.setTimeout(180_000);
    attachConsole(page);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await installCommandTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Build' }).click();
    const origin = await calibrate(page);

    const report = await page.evaluate(
      ({ o, tile }) => {
        const reachable: { x: number; y: number }[] = [];
        const blockers = new Map<string, number>();
        for (let ty = 0; ty < 34; ty += 1) {
          for (let tx = 0; tx < 34; tx += 1) {
            const px = o.originX + tx * tile + tile / 2;
            const py = o.originY + ty * tile + tile / 2;
            if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) continue;
            const el = document.elementFromPoint(px, py);
            if (el === null) continue;
            if (el.tagName.toLowerCase() === 'canvas') {
              reachable.push({ x: tx, y: ty });
            } else {
              let node: Element | null = el;
              let name = el.className?.toString() ?? el.tagName;
              while (node !== null && !/^(hud|save-panel|ui-panel)/.test(String(node.className ?? ''))) {
                node = node.parentElement;
                if (node !== null && typeof node.className === 'string' && node.className !== '') name = node.className;
              }
              const key = String(name).split(' ')[0] ?? 'unknown';
              blockers.set(key, (blockers.get(key) ?? 0) + 1);
            }
          }
        }
        const xs = reachable.map((r) => r.x);
        const ys = reachable.map((r) => r.y);
        // Largest axis-aligned all-reachable rectangle, brute force on 34x34.
        const set = new Set(reachable.map((r) => `${r.x},${r.y}`));
        let best = { w: 0, h: 0, x: -1, y: -1, area: 0 };
        for (let y0 = 0; y0 < 34; y0 += 1)
          for (let x0 = 0; x0 < 34; x0 += 1) {
            if (!set.has(`${x0},${y0}`)) continue;
            let maxW = 34;
            for (let h = 1; y0 + h <= 34; h += 1) {
              let w = 0;
              while (w < maxW && set.has(`${x0 + w},${y0 + h - 1}`)) w += 1;
              maxW = w;
              if (maxW === 0) break;
              if (maxW * h > best.area) best = { x: x0, y: y0, w: maxW, h, area: maxW * h };
            }
          }
        return {
          reachableCount: reachable.length,
          bbox:
            reachable.length === 0
              ? null
              : { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) },
          largestFreeRect: best,
          blockers: [...blockers.entries()].sort((a, b) => b[1] - a[1]),
          viewport: { w: window.innerWidth, h: window.innerHeight },
        };
      },
      { o: origin, tile: TILE },
    );
    console.log(`\n=== ${vp.w}x${vp.h} origin=${JSON.stringify(origin)} ===`);
    console.log(JSON.stringify(report, null, 1));
    const c = centreOf(origin, 16, 16);
    console.log(`tile(16,16) centre @ ${JSON.stringify(c)}`);
    await dumpHud(page, `${vp.w}x${vp.h} arrival on Build tab`);
  });
}
