import { expect, test } from './network-changed-fixture';

/**
 * What it would take to stop `Plan dnia` wrapping at 375x812 (#1192).
 *
 * Not a gate: `playwright.config.ts` collects `*.spec.ts` only, and nothing
 * here asserts a remedy. The log is the deliverable -- the three candidate
 * directions #1192 names, measured against each other on the real page in the
 * locale that has the defect, so the decision is taken against numbers.
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5483 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-1192-tab-bar.playtest.ts
 * ```
 */

const APP_URL = '/index.html';
const POLISH_SHELL_LABEL = 'Aplikacja gry LockState.io';

/** Each candidate as the CSS it would be, injected over the live page. */
const VARIANTS: readonly { readonly name: string; readonly css: string }[] = [
  { name: 'baseline (today)', css: '' },
  { name: 'nowrap alone', css: '.ui-tab__label { white-space: nowrap; }' },
  {
    name: 'nowrap + tracking 0.08em',
    css: '.ui-tab__label { white-space: nowrap; letter-spacing: 0.08em; }',
  },
  {
    name: 'nowrap + tracking 0.04em',
    css: '.ui-tab__label { white-space: nowrap; letter-spacing: 0.04em; }',
  },
  {
    name: 'nowrap + tracking 0',
    css: '.ui-tab__label { white-space: nowrap; letter-spacing: 0; }',
  },
  {
    name: 'nowrap + padding space-1',
    css: '.ui-tab__label { white-space: nowrap; } .hud-tabs__inner .ui-tab { padding-left: var(--space-1); padding-right: var(--space-1); }',
  },
  {
    name: 'nowrap + 10px label',
    css: '.ui-tab__label { white-space: nowrap; font-size: calc(10px * var(--ui-scale)); }',
  },
  {
    name: 'nowrap + tracking 0.04em + padding space-1',
    css: '.ui-tab__label { white-space: nowrap; letter-spacing: 0.04em; } .hud-tabs__inner .ui-tab { padding-left: var(--space-1); padding-right: var(--space-1); }',
  },
  {
    name: 'nowrap + tracking 0.06em',
    css: '.ui-tab__label { white-space: nowrap; letter-spacing: 0.06em; }',
  },
  {
    name: 'scrolling bar (nowrap, no shrink, overflow-x auto)',
    css:
      '.ui-tab__label { white-space: nowrap; } ' +
      '.hud-tabs__inner { overflow-x: auto; } ' +
      '.hud-tabs__inner > .ui-tab { flex: 0 0 auto; }',
  },
];

test.describe('the Polish tab bar at 375x812', () => {
  test.use({ locale: 'pl-PL' });

  test('measures every candidate #1192 names', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    await expect(page.locator('#app')).toHaveAttribute('aria-label', POLISH_SHELL_LABEL);

    const report: string[] = [];
    for (const variant of VARIANTS) {
      const measurement = await page.evaluate((css: string) => {
        const round = (value: number): number => Math.round(value * 100) / 100;
        document.querySelector('#playtest-1192')?.remove();
        if (css !== '') {
          const style = document.createElement('style');
          style.id = 'playtest-1192';
          style.textContent = css;
          document.head.append(style);
        }
        const inner = document.querySelector<HTMLElement>('.hud-tabs__inner');
        const tabs = [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab]')];
        const labels = tabs.map((tab) => tab.querySelector<HTMLElement>('.ui-tab__label')!);
        const boxes = labels.map((label) => label.getBoundingClientRect());
        const gaps = boxes.slice(0, -1).map((box, index) => round(boxes[index + 1]!.left - box.right));
        return {
          lineBoxes: labels.map((label) => label.getClientRects().length),
          labelHeights: boxes.map((box) => round(box.height)),
          labelWidths: boxes.map((box) => round(box.width)),
          labelSum: round(boxes.reduce((total, box) => total + box.width, 0)),
          tabWidths: tabs.map((tab) => round(tab.getBoundingClientRect().width)),
          tabHeights: tabs.map((tab) => round(tab.getBoundingClientRect().height)),
          innerWidth: round(inner?.getBoundingClientRect().width ?? 0),
          innerScrollWidth: inner?.scrollWidth ?? 0,
          barHeight: round(document.querySelector<HTMLElement>('.hud__tabs')?.getBoundingClientRect().height ?? 0),
          railTop: round(document.querySelector<HTMLElement>('.hud__rail')?.getBoundingClientRect().top ?? 0),
          railHeight: round(document.querySelector<HTMLElement>('.hud__rail')?.getBoundingClientRect().height ?? 0),
          minGap: gaps.length === 0 ? 0 : Math.min(...gaps),
          gaps,
        };
      }, variant.css);
      report.push(`${variant.name}: ${JSON.stringify(measurement)}`);
    }
    console.log(`[#1192 tab bar]\n${report.join('\n')}`);
  });

  test('sweeps the chosen candidate across the narrow viewports', async ({ page }) => {
    const CHOSEN = '.ui-tab__label { white-space: nowrap; letter-spacing: 0.06em; }';
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    await expect(page.locator('#app')).toHaveAttribute('aria-label', POLISH_SHELL_LABEL);

    const report: string[] = [];
    for (const width of [320, 360, 375, 390, 414, 480, 600, 720]) {
      await page.setViewportSize({ width, height: 812 });
      const measurement = await page.evaluate((css: string) => {
        const round = (value: number): number => Math.round(value * 100) / 100;
        document.querySelector('#playtest-1192')?.remove();
        const style = document.createElement('style');
        style.id = 'playtest-1192';
        style.textContent = css;
        document.head.append(style);
        const labels = [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab] .ui-tab__label')];
        const boxes = labels.map((label) => label.getBoundingClientRect());
        const gaps = boxes.slice(0, -1).map((box, index) => round(boxes[index + 1]!.left - box.right));
        const inner = document.querySelector<HTMLElement>('.hud-tabs__inner');
        return {
          lineBoxes: labels.map((label) => label.getClientRects().length),
          minGap: gaps.length === 0 ? 0 : Math.min(...gaps),
          innerWidth: round(inner?.getBoundingClientRect().width ?? 0),
          innerScrollWidth: inner?.scrollWidth ?? 0,
          tabHeights: [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab]')].map((tab) =>
            round(tab.getBoundingClientRect().height),
          ),
        };
      }, CHOSEN);
      report.push(`${width}px: ${JSON.stringify(measurement)}`);
    }
    console.log(`[#1192 viewport sweep]\n${report.join('\n')}`);
  });

  test('checks the enlarged interface scale, where the bar wraps into rows', async ({ page }) => {
    const CHOSEN =
      '.ui-tab__label { white-space: nowrap; } @media (max-width: 720px) { .hud__tabs .ui-tab__label { letter-spacing: 0.06em; } }';
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');

    const report: string[] = [];
    for (const scale of [1, 1.5, 1.75, 2]) {
      for (const css of ['', CHOSEN]) {
        const measurement = await page.evaluate(
          ({ css: injected, scale: uiScale }: { css: string; scale: number }) => {
            const round = (value: number): number => Math.round(value * 100) / 100;
            document.querySelector('#playtest-1192')?.remove();
            if (injected !== '') {
              const style = document.createElement('style');
              style.id = 'playtest-1192';
              style.textContent = injected;
              document.head.append(style);
            }
            document.documentElement.style.setProperty('--ui-scale', String(uiScale));
            document.documentElement.dataset['uiScaleEnlarged'] = uiScale > 1 ? 'true' : 'false';
            const tabs = [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab]')];
            const labels = tabs.map((tab) => tab.querySelector<HTMLElement>('.ui-tab__label')!);
            const boxes = labels.map((label) => label.getBoundingClientRect());
            const rows = new Set(tabs.map((tab) => round(tab.getBoundingClientRect().top))).size;
            return {
              rows,
              lineBoxes: labels.map((label) => label.getClientRects().length),
              clipped: labels.map((label, index) =>
                round(boxes[index]!.right - tabs[index]!.getBoundingClientRect().right),
              ),
              barHeight: round(document.querySelector<HTMLElement>('.hud__tabs')?.getBoundingClientRect().height ?? 0),
              railHeight: round(document.querySelector<HTMLElement>('.hud__rail')?.getBoundingClientRect().height ?? 0),
            };
          },
          { css, scale },
        );
        report.push(`scale ${scale}${css === '' ? ' (today)' : ' (candidate)'}: ${JSON.stringify(measurement)}`);
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--ui-scale');
      delete document.documentElement.dataset['uiScaleEnlarged'];
    });
    console.log(`[#1192 interface scale]\n${report.join('\n')}`);
  });

  test('reads the Settings menu in Polish and measures whether it fits', async ({ page }) => {
    /*
     * The fifteen `hud.layout.*` keys, translated on 2026-09-14, on the one
     * surface that renders them. A translation is a layout change as well as a
     * content change, and Polish is longer than English about half the time.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    await expect(page.locator('#app')).toHaveAttribute('aria-label', POLISH_SHELL_LABEL);

    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('.hud-layout__button, .hud-layout button')?.click();
    });
    const menu = await page.evaluate(() => {
      const round = (value: number): number => Math.round(value * 100) / 100;
      const nodes = [...document.querySelectorAll<HTMLElement>('.hud-layout__body *')].filter(
        (node) => node.children.length === 0 && (node.textContent ?? '').trim() !== '',
      );
      const panel = document.querySelector<HTMLElement>('.hud-layout__body');
      const box = panel?.getBoundingClientRect();
      return {
        texts: nodes.map((node) => (node.textContent ?? '').trim()),
        overflowX: panel === null ? 0 : round(panel.scrollWidth - panel.clientWidth),
        overflowY: panel === null ? 0 : round(panel.scrollHeight - panel.clientHeight),
        insideViewport: box === undefined ? false : box.left >= 0 && box.right <= window.innerWidth,
        box: box === undefined ? null : { left: round(box.left), right: round(box.right), height: round(box.height) },
      };
    });
    console.log(`[#1192 settings menu in pl] ${JSON.stringify(menu)}`);
  });
});
