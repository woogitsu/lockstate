import { expect, test } from './network-changed-fixture';

/**
 * Does a sixth section fit the phone bar? (2026-09-17)
 *
 * Not a gate. ADR 0022 measured a *sixth tab foreclosed* at 375x812 against a
 * bar of five labelled tabs, and #1192's ruling of 2026-09-16 takes the labels
 * off the screen below 721px -- so the premise moved and the number has to be
 * re-taken before a panel is written. The log is the deliverable.
 *
 * **The ruling is recorded and not yet implemented, which is why this file has
 * two arms rather than one.** #1275 records it and states that nothing under
 * `src/` is touched; PR #1281 is the open branch that ships the CSS. So the
 * default arm measures what this tree actually renders -- six *labelled* tabs
 * -- and `ICON_ONLY=1` injects the ruled rule to measure what the section is
 * designed for. Read together they say that the sixth tab fits once #1281
 * lands and overhangs the bar by 16.5px a side until it does, and that at
 * 320x640 two of the six are unreachable without it.
 *
 *     ICON_ONLY=1 npx playwright test --config tests/browser/playwright.playtest.config.ts \
 *       playtest-2026-09-17-six-tabs
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

/**
 * The rail on the Security tab, on the assembled page (2026-09-17).
 *
 * The harness measurement in `ui-security-section.spec.ts` has no save panel in
 * `.hud__aside`, and `.hud__aside:empty { display: none }` then hands the panel
 * rail the save panel never gives it -- the surface #174 proved cannot
 * reproduce this class of defect. So the numbers a record should carry are
 * these, with a prison in the list.
 */
test.describe('the Security rail on the assembled page', () => {
  test('measured at four viewports', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForSelector('.save-panel__item-label');
    await page.locator('.ui-tab[data-tab="security"]').click();
    await page.waitForSelector('.hud-security');

    for (const [width, height] of [[375, 812], [900, 600], [1024, 768], [1440, 900]] as const) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(400);
      const measured = await page.evaluate(() => {
        const box = (selector: string): Record<string, number> | null => {
          const node = document.querySelector(selector) as HTMLElement | null;
          if (node === null) return null;
          const rect = node.getBoundingClientRect();
          return {
            top: Math.round(rect.top * 10) / 10,
            bottom: Math.round(rect.bottom * 10) / 10,
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
            scrollHeight: (node as HTMLElement).scrollHeight,
            clientHeight: (node as HTMLElement).clientHeight,
          };
        };
        const controls = [...document.querySelectorAll<HTMLElement>('.hud-security button, .hud-security [role="radio"]')].map(
          (node) => {
            const rect = node.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return {
              name: node.innerText.trim() || node.className,
              reachable: hit !== null && (node.contains(hit) || hit.contains(node)),
              top: Math.round(rect.top * 10) / 10,
              bottom: Math.round(rect.bottom * 10) / 10,
            };
          },
        );
        return { rail: box('.hud__side'), panel: box('.hud-security'), save: box('.save-panel'), controls };
      });
      console.log(`\n### rail ${width}x${height}`);
      console.log(JSON.stringify(measured, null, 1));
    }
  });
});
