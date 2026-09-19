import { expect, test } from './network-changed-fixture';

/**
 * What icon-only tabs below the break actually cost and buy (#1192), measured
 * on the real page after the owner's ruling of 2026-09-16.
 *
 * Not a gate: `playwright.config.ts` collects `*.spec.ts` only, and the gates
 * for this change live in `tests/browser/ui-shell.spec.ts` and
 * `tests/browser/locale-delivery.spec.ts`. The log is the deliverable.
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5486 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-1192-icon-only-tabs.playtest.ts
 * ```
 */

const APP_URL = '/index.html';

/**
 * The shipped stylesheet, undone, so "before" and "after" are two arms of one
 * run rather than two checkouts. It restates what `hud.css`'s phone block held
 * on `origin/main` at `57cffa10`: a 64px floor and a tracked, visible label.
 */
const BEFORE = `
@media (max-width: 720px) {
  .ui-tab { min-width: calc(64px * var(--ui-scale)); }
  .hud__tabs .ui-tab__label {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    padding: 0;
    overflow: visible;
    clip-path: none;
    letter-spacing: 0.06em;
  }
}
`;

test.describe('icon-only tabs below the break', () => {
  for (const locale of ['en-GB', 'pl-PL'] as const) {
    test.describe(`in ${locale}`, () => {
      test.use({ locale });

      test('sweeps the narrow viewports, before and after', async ({ page }) => {
        await page.goto(APP_URL);
        await page.waitForSelector('.hud');

        const report: string[] = [];
        for (const width of [320, 360, 375, 390, 414, 600, 720, 768]) {
          await page.setViewportSize({ width, height: 812 });
          for (const arm of ['before', 'after'] as const) {
            const measurement = await page.evaluate(
              ({ css }: { css: string }) => {
                const round = (value: number): number => Math.round(value * 100) / 100;
                document.querySelector('#playtest-1192-icon')?.remove();
                if (css !== '') {
                  const style = document.createElement('style');
                  style.id = 'playtest-1192-icon';
                  style.textContent = css;
                  document.head.append(style);
                }
                const inner = document.querySelector<HTMLElement>('.hud-tabs__inner');
                const innerBox = inner?.getBoundingClientRect() ?? null;
                const tabs = [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab]')];
                const boxes = tabs.map((tab) => tab.getBoundingClientRect());
                const labels = tabs.map((tab) => tab.querySelector<HTMLElement>('.ui-tab__label')!);
                const labelBoxes = labels.map((label) => label.getBoundingClientRect());
                const gaps = labelBoxes
                  .slice(0, -1)
                  .map((box, index) => round(labelBoxes[index + 1]!.left - box.right));
                return {
                  tabs: tabs.length,
                  rows: new Set(boxes.map((box) => round(box.top))).size,
                  tabWidths: boxes.map((box) => round(box.width)),
                  narrowestTab: round(Math.min(...boxes.map((box) => box.width))),
                  barWidth: round(innerBox?.width ?? 0),
                  barRight: round(innerBox?.right ?? 0),
                  barHeight: round(
                    document.querySelector<HTMLElement>('.hud__tabs')?.getBoundingClientRect().height ?? 0,
                  ),
                  clippedTabs: boxes.filter(
                    (box) => innerBox !== null && (box.left < innerBox.left - 0.5 || box.right > innerBox.right + 0.5),
                  ).length,
                  railHeight: round(
                    document.querySelector<HTMLElement>('.hud__rail')?.getBoundingClientRect().height ?? 0,
                  ),
                  labelSum: round(labelBoxes.reduce((total, box) => total + box.width, 0)),
                  minLabelGap: gaps.length === 0 ? 0 : Math.min(...gaps),
                };
              },
              { css: arm === 'before' ? BEFORE : '' },
            );
            report.push(`${width}px ${arm}: ${JSON.stringify(measurement)}`);
          }
        }
        console.log(`[#1192 icon-only sweep ${locale}]\n${report.join('\n')}`);
      });

      test('reads the accessible name of every tab at 375x812', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(APP_URL);
        await page.waitForSelector('.hud');
        const names: string[] = [];
        for (const id of ['overview', 'build', 'zones', 'manage', 'day-plan']) {
          const tab = page.locator(`.hud__tabs .ui-tab[data-tab="${id}"]`);
          names.push(`${id}: ${JSON.stringify(await tab.evaluate((node) => node.textContent))}`);
          await expect(tab).toBeVisible();
        }
        console.log(`[#1192 accessible names ${locale}]\n${names.join('\n')}`);
      });
    });
  }

  /** The enlarged interface scales (#545), where the bar wraps into rows. */
  test('checks the enlarged interface scales at 375x812', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');

    const report: string[] = [];
    for (const uiScale of [1, 1.5, 1.75, 2]) {
      for (const arm of ['before', 'after'] as const) {
        const measurement = await page.evaluate(
          ({ css, scale }: { css: string; scale: number }) => {
            const round = (value: number): number => Math.round(value * 100) / 100;
            document.querySelector('#playtest-1192-icon')?.remove();
            if (css !== '') {
              const style = document.createElement('style');
              style.id = 'playtest-1192-icon';
              style.textContent = css;
              document.head.append(style);
            }
            document.documentElement.style.setProperty('--ui-scale', String(scale));
            document.documentElement.dataset['uiScaleEnlarged'] = scale > 1 ? 'true' : 'false';
            const tabs = [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab]')];
            const boxes = tabs.map((tab) => tab.getBoundingClientRect());
            const inner = document.querySelector<HTMLElement>('.hud-tabs__inner')?.getBoundingClientRect() ?? null;
            return {
              rows: new Set(boxes.map((box) => round(box.top))).size,
              clippedTabs: boxes.filter(
                (box) => inner !== null && (box.left < inner.left - 0.5 || box.right > inner.right + 0.5),
              ).length,
              barHeight: round(document.querySelector<HTMLElement>('.hud__tabs')?.getBoundingClientRect().height ?? 0),
              railHeight: round(document.querySelector<HTMLElement>('.hud__rail')?.getBoundingClientRect().height ?? 0),
            };
          },
          { css: arm === 'before' ? BEFORE : '', scale: uiScale },
        );
        report.push(`scale ${uiScale} ${arm}: ${JSON.stringify(measurement)}`);
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--ui-scale');
      delete document.documentElement.dataset['uiScaleEnlarged'];
    });
    console.log(`[#1192 icon-only interface scale]\n${report.join('\n')}`);
  });

  /**
   * THE ONE QUESTION THE RULING RECORDED AS UNMEASURED: do the five glyphs
   * read as their sections without their names?
   *
   * **This does not answer it and does not pretend to.** Comprehension is a
   * fact about players and needs players. What it measures is a necessary
   * condition that is objective: whether the five glyphs are even *distinct*
   * from each other at the size they ship. Each is rasterised at
   * `--icon-size-lg` and compared pairwise by the fraction of inked pixels the
   * two share (intersection over union of the ink).
   */
  test('measures how distinguishable the five glyphs are at 20px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');

    const report = await page.evaluate(async () => {
      const tabs = [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab]')];
      const scale = 8; // rasterise at 8x the shipped size, then judge at 20px
      const inks: { id: string; ink: boolean[]; coverage: number }[] = [];
      for (const tab of tabs) {
        const svg = tab.querySelector<SVGSVGElement>('svg.ui-icon')!;
        const box = svg.getBoundingClientRect();
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('width', String(Math.round(box.width)));
        clone.setAttribute('height', String(Math.round(box.height)));
        clone.setAttribute('stroke', '#000');
        const serialized = new XMLSerializer().serializeToString(clone);
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
        await image.decode();
        const size = Math.round(box.width) * scale;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        const ink: boolean[] = [];
        for (let index = 0; index < data.length; index += 4) ink.push(data[index + 3]! > 32);
        inks.push({
          id: tab.dataset['tab'] ?? '',
          ink,
          coverage: Math.round((ink.filter(Boolean).length / ink.length) * 10_000) / 100,
        });
      }
      const pairs: string[] = [];
      for (let a = 0; a < inks.length; a += 1) {
        for (let b = a + 1; b < inks.length; b += 1) {
          const first = inks[a]!;
          const second = inks[b]!;
          let intersection = 0;
          let union = 0;
          for (let index = 0; index < first.ink.length; index += 1) {
            const one = first.ink[index]!;
            const two = second.ink[index]!;
            if (one && two) intersection += 1;
            if (one || two) union += 1;
          }
          pairs.push(
            `${first.id} vs ${second.id}: IoU ${union === 0 ? 0 : Math.round((intersection / union) * 1000) / 10}%`,
          );
        }
      }
      return {
        coverage: inks.map((one) => `${one.id}: ${one.coverage}% ink`),
        pairs: pairs.sort((one, two) => Number(two.split('IoU ')[1]!.replace('%', '')) - Number(one.split('IoU ')[1]!.replace('%', ''))),
      };
    });
    console.log(`[#1192 glyph distinguishability]\n${report.coverage.join('\n')}\n${report.pairs.join('\n')}`);
  });
});
