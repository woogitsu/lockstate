import { chromium, expect, test, type Page } from '@playwright/test';

/**
 * What the two catalogues hide, and what on screen says so (issue #902).
 *
 * ## Why this is an instrument and not a gate
 *
 * Not because the defect is in doubt — every number below reproduces — but
 * because **the remedy is not this file's to choose**, and an instrument is
 * what a blocked decision is owed. Two things came out of measuring it:
 *
 * 1. The sign a player is missing cannot be painted inside this repository's
 *    design language. `tests/unit/ui-design-tokens.test.ts` asserts that no
 *    stylesheet under `src/ui/` matches `gradient(`, `box-shadow`,
 *    `text-shadow`, `backdrop-filter` or `filter`, with the reason beside it:
 *    *"Separation comes from a 1px hairline and a background step, and from
 *    nothing else."* A sign that appears at an edge **only while there is
 *    content past that edge** needs a scroll-position-dependent paint, which
 *    in CSS means `background-attachment: local` over gradient layers. A
 *    hairline and a background step can draw the list's edges but cannot make
 *    either conditional, and an unconditional fade is the same defect with a
 *    new lie — a list claiming more below when the player is at the bottom.
 *    `primitives.css`'s note on the occupancy notch is the precedent and it
 *    is unambiguous: a `repeating-linear-gradient` was tried there, the gate
 *    refused it, and *"weakening an assertion to fit a design is the one move
 *    this repository's contract forbids outright."*
 * 2. `docs/adr/0085-...md` already parks this exact question — *"a visible
 *    scroll affordance (native scrollbar, or an edge fade/chevron)"* — as the
 *    owner's, noting that issue #634 refused one once and that the ground has
 *    moved since. It declines to overturn that ruling; so does this file.
 *
 * So what is recorded here is the measurement, reproducibly, for whoever
 * decides. Nothing under `src/` changes.
 *
 * ## What it measures
 *
 * - **Act A.** What each catalogue hides at three viewports, and which rows a
 *   player can actually see, by name — including where `Cell` falls, since it
 *   is the room a prison cannot admit anybody without.
 * - **Act B.** The scrollbar gutter, twice: with Playwright's own launch flags
 *   and with `--hide-scrollbars` removed from them. This is the act that
 *   corrects the record — see below.
 * - **Act C.** The Build panel with a wall run queued and the coordinate form
 *   open: what is laid out past its fold, and whether a wheel over it reaches
 *   that content.
 * - **Act D.** The arm button's label against its own box, which is a
 *   different defect in the same panel and is measured here so the two are not
 *   confused.
 *
 * ## The record this corrects
 *
 * `docs/research/2026-09-03-can-a-player-read-this.md` §5 and
 * `docs/research/2026-09-03-does-building-feel-good.md` §4 both measured a
 * **0.0px scrollbar gutter** on these boxes and read it as the game drawing no
 * scrollbar. It is not the game. `playwright-core`'s
 * `lib/server/chromium/chromium.js` appends `--hide-scrollbars` to every
 * headless launch, and Blink's setting zeroes every scrollbar in the page —
 * measured here as unaffected by `scrollbar-width`, `scrollbar-color` or
 * `::-webkit-scrollbar`, so no stylesheet can make one appear in this harness.
 * Act B removes that one flag from the same browser at the same viewport and
 * the same boxes answer **15px**. Only `.hud-strip__metrics` suppresses a
 * scrollbar in this repository, by name and by the owner's call (#634).
 *
 * The defect survives the correction and is narrower than it was filed as: on
 * macOS, iOS, Android and ChromeOS the scrollbar is an **overlay** — no layout
 * width, painted only during a scroll the player has no reason to start — and
 * even where it is drawn, 15px of grey at the right edge of a 264px rail is a
 * weak sign for a box hiding three quarters of itself.
 *
 * Run with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5903 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-902-what-a-catalogue-hides.playtest.ts
 * ```
 *
 * `git lfs checkout` first in a worktree, or every actor atlas fails to decode
 * and the run reports a world with nobody in it — and passes anyway.
 */

const APP_URL = '/index.html';

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 900, height: 600 },
] as const;

const CATALOGUES = [
  { tab: 'Build', list: '.hud-build__list', rowAttribute: 'data-buildable' },
  { tab: 'Rooms', list: '.hud-rooms__list', rowAttribute: 'data-room' },
] as const;

function log(line: string): void {
  // eslint-disable-next-line no-console
  console.log(`[#902] ${line}`);
}

async function openPrison(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day'), 'the prison was never created').toHaveText('1');
  // Off every row, so no `:hover` state reaches a measurement.
  await page.mouse.move(20, 20);
}

/** Every vertical scroll container in the HUD that is currently hiding some of its own content. */
async function hudScrollers(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.hud');
    if (root === null) return [];
    const describe = (element: HTMLElement): string => {
      const classes = (element.getAttribute('class') ?? '')
        .split(/\s+/)
        .filter((name) => name.startsWith('hud') || name.startsWith('ui-') || name.startsWith('save'))
        .slice(0, 3)
        .join('.');
      return `${element.tagName.toLowerCase()}${classes === '' ? '' : `.${classes}`}`;
    };
    const lines: string[] = [];
    for (const node of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
      if (node.hidden) continue;
      if (node.getClientRects().length === 0) continue;
      const style = getComputedStyle(node);
      if (!/auto|scroll/.test(style.overflowY)) continue;
      const hidden = node.scrollHeight - node.clientHeight;
      if (hidden <= 1) continue;
      const borders = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      const gutter = Math.round((node.offsetWidth - node.clientWidth - borders) * 10) / 10;
      lines.push(
        `${describe(node)} hides ${hidden}px of ${node.scrollHeight}px ` +
          `(${Math.round((hidden / node.scrollHeight) * 100)}%), gutter ${gutter.toFixed(1)}px, ` +
          `scrollbar-width ${style.scrollbarWidth}, scrollbar-color ${style.scrollbarColor}`,
      );
    }
    return lines;
  });
}

/** Which rows of a catalogue are wholly inside its visible box, which are cut by its fold, and which are past it. */
async function rowsInView(
  page: Page,
  list: string,
  rowAttribute: string,
): Promise<{ readonly whole: readonly string[]; readonly cut: readonly string[]; readonly past: number } | null> {
  return page.evaluate(
    ({ target, attribute }) => {
      const element = document.querySelector<HTMLElement>(target);
      if (element === null) return null;
      const box = element.getBoundingClientRect();
      const fold = box.top + element.clientTop + element.clientHeight;
      const whole: string[] = [];
      const cut: string[] = [];
      let past = 0;
      for (const row of element.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
        const rect = row.getBoundingClientRect();
        const label = (row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
        if (rect.top >= box.top - 0.5 && rect.bottom <= fold + 0.5) whole.push(label);
        else if (rect.top < fold && rect.bottom > box.top) cut.push(`${label} (${Math.round(fold - rect.top)}px of 44)`);
        else past += 1;
      }
      return { whole, cut, past };
    },
    { target: list, attribute: rowAttribute },
  );
}

test.describe('what the two catalogues hide (#902)', () => {
  test('act A — what a player can see of each catalogue, and what is behind the fold', async ({ page }) => {
    await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
    await openPrison(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      log(`-- ${viewport.width}x${viewport.height}`);
      for (const catalogue of CATALOGUES) {
        await page.getByRole('button', { name: catalogue.tab, exact: true }).click();
        await page.waitForTimeout(200);
        for (const line of await hudScrollers(page)) log(`   ${catalogue.tab}: ${line}`);
        const rows = await rowsInView(page, catalogue.list, catalogue.rowAttribute);
        if (rows === null) {
          log(`   ${catalogue.tab}: ${catalogue.list} is not laid out`);
          continue;
        }
        log(`   ${catalogue.tab}: ${rows.whole.length} rows wholly visible [${rows.whole.join(', ')}]`);
        log(`   ${catalogue.tab}: ${rows.cut.length} cut by the fold [${rows.cut.join(', ')}]`);
        log(`   ${catalogue.tab}: ${rows.past} rows entirely past the fold`);
      }
    }
    // What is laid out outside the viewport altogether, which is what makes
    // this more than an aesthetic finding: an element off the viewport is not
    // merely invisible, it is unpressable.
    await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
    for (const catalogue of CATALOGUES) {
      await page.getByRole('button', { name: catalogue.tab, exact: true }).click();
      await page.waitForTimeout(200);
      const outside = await page.evaluate(() => {
        const height = window.innerHeight;
        const found: string[] = [];
        for (const node of document.querySelectorAll<HTMLElement>('.hud *')) {
          if (node.hidden) continue;
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.top >= height || rect.bottom <= 0) {
            found.push(
              `${node.tagName.toLowerCase()} "${(node.textContent ?? '').trim().slice(0, 20)}" y=${Math.round(rect.top)}`,
            );
          }
        }
        return found;
      });
      log(
        `   ${catalogue.tab} at ${VIEWPORTS[0].width}x${VIEWPORTS[0].height}: ${outside.length} elements laid out ` +
          `entirely outside the viewport — ${outside.slice(0, 3).join(' ; ')}`,
      );
    }
  });

  /**
   * The act that corrects the record.
   *
   * It launches its **own** browser rather than using the `page` fixture,
   * because launch flags are decided when a browser starts:
   * `test.use({ launchOptions })` is rejected inside a `describe` group -- it
   * would force a new worker -- and at file scope it would take the flag away
   * from act A, which is the other half of the comparison. So act A reports
   * these boxes under Playwright's own flags (`gutter 0.0px` on every one) and
   * this act reports the same boxes at the same viewport with
   * `--hide-scrollbars` removed from that same Chromium.
   */
  test('act B — the scrollbar this harness cannot see', async ({ baseURL }) => {
    // `exactOptionalPropertyTypes` is on, and the fixture's type is
    // `string | undefined`; the config always sets it, so an absent one is a
    // broken invocation rather than a case to handle.
    if (baseURL === undefined) throw new Error('the playtest config supplies a baseURL and this run has none');
    const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
    try {
      const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 900 } });
      await openPrison(page);
      for (const catalogue of CATALOGUES) {
        await page.getByRole('button', { name: catalogue.tab, exact: true }).click();
        await page.waitForTimeout(200);
        for (const line of await hudScrollers(page)) log(`   no --hide-scrollbars, ${catalogue.tab}: ${line}`);
      }

      /*
       * And what a stylesheet can do about it, which is the half that decides
       * whether a CSS remedy is measurable in this repository at all. Measured
       * both ways: under Playwright's default flags every one of
       * `scrollbar-width`, `scrollbar-color` and `::-webkit-scrollbar` leaves
       * the gutter at 0.0px -- Blink's `hide_scrollbars` setting is upstream of
       * all three -- and here, with the flag gone, `scrollbar-width: thin`
       * moves it 15px -> 10px. So a scrollbar-based remedy cannot be gated by
       * any test in this suite, in either direction.
       */
      await page.addStyleTag({
        content:
          '.hud-build__list { scrollbar-width: thin; scrollbar-color: var(--border-strong) var(--surface-sunken); }',
      });
      await page.getByRole('button', { name: 'Build', exact: true }).click();
      await page.waitForTimeout(200);
      for (const line of await hudScrollers(page)) log(`   + scrollbar-color, Build: ${line}`);
    } finally {
      await browser.close();
    }
  });

  test('act C — the Build panel with a queue, and whether a wheel reaches what is past its fold', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPrison(page);
    await page.getByRole('button', { name: 'Build', exact: true }).click();

    const boxes = async (label: string): Promise<void> => {
      const rows = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.hud-build');
        if (panel === null) return null;
        const round = (value: number): number => Math.round(value * 10) / 10;
        const fold = round(panel.getBoundingClientRect().top + panel.clientTop + panel.clientHeight);
        const measured = [
          '.hud-build',
          '.hud-build > .ui-panel__body',
          '.hud-build__list',
          '.hud-build__map',
          '.hud-build__coordinates',
          '.hud-build__queue',
        ]
          .map((selector) => {
            const element = document.querySelector<HTMLElement>(selector);
            if (element === null) return `${selector} absent`;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return (
              `${selector} y ${round(rect.top)}..${round(rect.bottom)} ` +
              `box ${element.clientHeight} content ${element.scrollHeight} overflow-y ${style.overflowY}` +
              `${rect.top > fold ? ' — ENTIRELY BELOW THE PANEL FOLD' : ''}`
            );
          })
          .join(' | ');
        return { fold, measured, scrollTop: panel.scrollTop, panelMax: panel.scrollHeight - panel.clientHeight };
      });
      log(`   ${label}: fold y=${rows?.fold} panel scrollTop ${rows?.scrollTop} of ${rows?.panelMax} — ${rows?.measured}`);
    };

    await boxes('nothing queued');

    await page.locator('.hud-build__arm').click();
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('the viewport size is needed to aim the drag');
    const x = Math.round(viewport.width / 2);
    const y = Math.round(viewport.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(x + 160, y, { steps: 8 });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(1200);
    await boxes('a wall run queued');

    const coordinates = page.locator('.hud-build__coordinates .ui-section__header');
    if ((await coordinates.count()) > 0) {
      await coordinates.first().click();
      await page.waitForTimeout(400);
      await boxes('queued, coordinates open');
    }

    /*
     * The refutation `2026-09-03-does-building-feel-good.md` §4 named as the
     * sample that would settle its own weakest claim: *"a wheel event over
     * `.hud-build` moving any ancestor's `scrollTop`"*. The wheel is aimed at
     * the map block rather than the catalogue, so the catalogue's own scroller
     * cannot absorb it.
     */
    const before = await page.evaluate(() => ({
      panel: document.querySelector<HTMLElement>('.hud-build')?.scrollTop ?? -1,
      queueTop: Math.round(document.querySelector<HTMLElement>('.hud-build__queue')?.getBoundingClientRect().top ?? -1),
    }));
    const mapBox = await page.locator('.hud-build__map').boundingBox();
    if (mapBox !== null) {
      await page.mouse.move(Math.round(mapBox.x + mapBox.width / 2), Math.round(mapBox.y + mapBox.height / 2));
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(400);
    }
    const after = await page.evaluate(() => ({
      panel: document.querySelector<HTMLElement>('.hud-build')?.scrollTop ?? -1,
      queueTop: Math.round(document.querySelector<HTMLElement>('.hud-build__queue')?.getBoundingClientRect().top ?? -1),
    }));
    log(
      `   a wheel over the map block: panel scrollTop ${before.panel} -> ${after.panel}, ` +
        `the QUEUED block's top y=${before.queueTop} -> y=${after.queueTop}`,
    );
  });

  test('act D — the arm button against its own label, which is a different defect', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPrison(page);
    await page.getByRole('button', { name: 'Build', exact: true }).click();

    for (const armed of [false, true]) {
      if (armed) await page.locator('.hud-build__arm').click();
      await page.waitForTimeout(200);
      const measured = await page.evaluate(() =>
        ['.hud-build__arm', '.hud-build__remove', '.hud-build__buy-toggle']
          .map((selector) => {
            const button = document.querySelector<HTMLElement>(selector);
            if (button === null) return `${selector} absent`;
            const label = button.querySelector<HTMLElement>('.ui-action__label');
            const buttonBox = button.getBoundingClientRect();
            const labelBox = label?.getBoundingClientRect();
            const round = (value: number): number => Math.round(value * 10) / 10;
            const overrun = labelBox === undefined ? 0 : round(labelBox.right - (buttonBox.right - 16));
            return (
              `${selector} "${(label?.textContent ?? '').trim()}" button ${round(buttonBox.width)}px ` +
              `(content box ${button.clientWidth - 32}px) label ${round(labelBox?.width ?? 0)}px ` +
              `white-space ${label === null ? '?' : getComputedStyle(label).whiteSpace} ` +
              `text-overflow ${label === null ? '?' : getComputedStyle(label).textOverflow}` +
              `${overrun > 0.5 ? ` — the label overruns its own padding box by ${overrun}px` : ''}`
            );
          })
          .join(' | '),
      );
      log(`   ${armed ? 'armed' : 'unarmed'}: ${measured}`);
    }
  });
});
