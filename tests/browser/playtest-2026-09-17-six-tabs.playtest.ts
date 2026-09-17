import { expect, test } from './network-changed-fixture';

/**
 * Does a sixth section fit the phone bar? (2026-09-17)
 *
 * Not a gate. ADR 0022 measured a *sixth tab foreclosed* at 375x812 against a
 * bar of five labelled tabs, and #1192's ruling of 2026-09-16 took the labels
 * off the screen below 721px -- so the premise moved and the number has to be
 * re-taken before a panel is written. The log is the deliverable.
 */
const APP_URL = '/index.html';

const VIEWPORTS = [
  [320, 640],
  [375, 812],
  [390, 844],
  [414, 896],
  [768, 1024],
  [900, 600],
  [1024, 768],
  [1440, 900],
] as const;

async function measure(page: import('@playwright/test').Page, label: string): Promise<void> {
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    if (process.env['ICON_ONLY'] === '1') {
      await page.addStyleTag({
        content:
          '@media (max-width: 720px) { .ui-tab { min-width: calc(56px * var(--ui-scale)); } ' +
          '.hud__tabs .ui-tab__label { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; } }',
      });
      await page.waitForTimeout(80);
    }
    const measured = await page.evaluate(() => {
      const inner = document.querySelector('.hud-tabs__inner') as HTMLElement;
      const box = inner.getBoundingClientRect();
      const tabs = [...document.querySelectorAll<HTMLElement>('.ui-tab')].map((tab) => {
        const r = tab.getBoundingClientRect();
        const labelNode = tab.querySelector('.ui-tab__label') as HTMLElement | null;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          id: tab.dataset['tab'] ?? '',
          text: (labelNode?.textContent ?? '').trim(),
          left: Math.round(r.left * 100) / 100,
          right: Math.round(r.right * 100) / 100,
          width: Math.round(r.width * 100) / 100,
          labelWidth: labelNode === null ? 0 : Math.round(labelNode.getBoundingClientRect().width * 100) / 100,
          labelLines: labelNode === null ? 0 : labelNode.getClientRects().length,
          reachable: hit !== null && tab.contains(hit),
        };
      });
      const rail = document.querySelector('.hud__side') as HTMLElement | null;
      const hud = document.querySelector('.hud') as HTMLElement | null;
      return {
        inner: {
          left: Math.round(box.left * 100) / 100,
          right: Math.round(box.right * 100) / 100,
          width: Math.round(box.width * 100) / 100,
          height: Math.round(box.height * 100) / 100,
        },
        placement: hud?.dataset['layoutNavigationPlacement'] ?? '',
        railHeight: rail === null ? 0 : Math.round(rail.getBoundingClientRect().height * 100) / 100,
        tabs,
      };
    });
    const overlaps = measured.tabs
      .slice(1)
      .map((tab, index) => ({ pair: `${measured.tabs[index]!.id}/${tab.id}`, gap: Math.round((tab.left - measured.tabs[index]!.right) * 100) / 100 }));
    console.log(`\n### ${label} ${width}x${height} placement=${measured.placement}`);
    console.log(`inner ${measured.inner.left}..${measured.inner.right} (${measured.inner.width}x${measured.inner.height}), rail ${measured.railHeight}`);
    console.log(measured.tabs.map((t) => `  ${t.id.padEnd(9)} ${String(t.left).padStart(7)}..${String(t.right).padStart(7)} w=${String(t.width).padStart(6)} label="${t.text}" lw=${t.labelWidth} lines=${t.labelLines} reachable=${t.reachable}`).join('\n'));
    console.log('  gaps: ' + JSON.stringify(overlaps));
    expect(measured.tabs).toHaveLength(6);
  }
}

test.describe('six sections, English', () => {
  test('measured', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    await measure(page, 'en');
  });
});

test.describe('six sections, Polish', () => {
  test.use({ locale: 'pl-PL' });
  test('measured', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    await measure(page, 'pl');
  });
});
