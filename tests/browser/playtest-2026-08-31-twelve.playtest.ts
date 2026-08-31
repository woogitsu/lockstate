/**
 * Playtest of the twelve pull requests that landed on 2026-08-31, played at
 * `/index.html` with a mouse at desktop widths.
 *
 * Not a gate. `tests/browser/playwright.playtest.config.ts` collects it and
 * nothing in CI runs that config. Its output is the record in
 * `docs/research/2026-08-31-playing-the-twelve.md`.
 *
 * Six claims to meet in sequence, from the brief:
 *  1. the alerts log starts unfolded and scrolls;
 *  2. a contraband find writes `Contraband found: {item}.` into it;
 *  3. the strip has a ninth chip, HIGH RISK, honestly reading 0;
 *  4. the Regime roster is sorted by risk tier and pulled on two channels;
 *  5. the money spent and its Cancel are outside the Buy fold;
 *  6. nine chips fit at 1280 wide in an ordinary prison, and a fully badged
 *     prison still overflows.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  buildAndPopulate,
  countsSeries,
  currentClock,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  panelText,
  tab,
} from './playtest-harness';

const SHOTS = 'docs/research/2026-08-31-playing-the-twelve';

/** Every chip on the strip, with its box, so overflow is measured and not eyeballed. */
async function stripReport(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('.hud-strip__metrics');
    const strip = document.querySelector<HTMLElement>('.hud-strip');
    if (row === null || strip === null) return { absent: true };
    const rowBox = row.getBoundingClientRect();
    const chips = [...row.querySelectorAll<HTMLElement>('[data-metric]')].map((chip) => {
      const box = chip.getBoundingClientRect();
      const badge = chip.querySelector<HTMLElement>('.ui-badge');
      return {
        id: chip.dataset['metric'] ?? '?',
        text: (chip.innerText ?? '').replace(/\n+/g, ' ').trim(),
        badge: badge === null || badge.hidden ? null : (badge.innerText ?? '').trim(),
        left: Math.round(box.left),
        right: Math.round(box.right),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        // A chip whose own box leaves the row's *client* box is a chip the
        // player cannot read, whatever the scroll state says.
        clipped: Math.round(box.right) > Math.round(rowBox.right) + 1 || Math.round(box.left) < Math.round(rowBox.left) - 1,
      };
    });
    return {
      viewport: `${String(window.innerWidth)}x${String(window.innerHeight)}`,
      chipCount: chips.length,
      rowBox: { left: Math.round(rowBox.left), right: Math.round(rowBox.right), width: Math.round(rowBox.width), height: Math.round(rowBox.height) },
      rowScrollWidth: row.scrollWidth,
      rowClientWidth: row.clientWidth,
      rowOverflowX: getComputedStyle(row).overflowX,
      stripBox: { width: Math.round(strip.getBoundingClientRect().width), height: Math.round(strip.getBoundingClientRect().height) },
      stripScrollWidth: strip.scrollWidth,
      stripClientWidth: strip.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      chips,
      clippedIds: chips.filter((c) => c.clipped).map((c) => c.id),
      rows: [...new Set(chips.map((c) => c.top))].sort((a, b) => a - b),
    };
  });
}

/** The alerts log: its fold, its rows, and whether the newest one is reachable. */
async function alertsReport(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const section = [...document.querySelectorAll<HTMLElement>('.hud-minimap .ui-section')].find(
      (candidate) => candidate.querySelector('.hud-alerts__list') !== null,
    );
    const list = document.querySelector<HTMLElement>('.hud-alerts__list');
    if (section === undefined || list === null) return { absent: true };
    const rows = [...list.querySelectorAll<HTMLElement>('.ui-row')].filter((row) => !row.hidden);
    const listBox = list.getBoundingClientRect();
    return {
      collapsed: section.dataset['collapsed'] ?? '?',
      headerExpanded: section.querySelector('.ui-section__header')?.getAttribute('aria-expanded') ?? '?',
      bodyHidden: section.querySelector<HTMLElement>('.ui-section__body')?.hidden ?? null,
      rowCount: rows.length,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      scrollTop: list.scrollTop,
      overflowY: getComputedStyle(list).overflowY,
      listBox: { top: Math.round(listBox.top), bottom: Math.round(listBox.bottom), height: Math.round(listBox.height) },
      rows: rows.map((row) => {
        const box = row.getBoundingClientRect();
        return {
          text: (row.innerText ?? '').replace(/\n+/g, ' ').trim(),
          top: Math.round(box.top),
          bottom: Math.round(box.bottom),
          // Inside the scroll container's own visible box, without scrolling.
          visible: box.top >= listBox.top - 1 && box.bottom <= listBox.bottom + 1,
        };
      }),
    };
  });
}

/** The Regime roster: what it shows and in what tier order. */
async function regimeReport(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const block = document.querySelector<HTMLElement>('.hud-regime__roster');
    if (block === null) return { absent: true };
    const rows = [...block.querySelectorAll<HTMLElement>('.hud-regime__roster-row')].filter((row) => !row.hidden);
    return {
      hidden: block.hidden,
      total: block.dataset['total'] ?? null,
      everAdmitted: block.dataset['everAdmitted'] ?? null,
      count: (block.querySelector<HTMLElement>('.hud-regime__roster-count')?.textContent ?? '').trim(),
      more: (block.querySelector<HTMLElement>('.hud-regime__roster-more')?.textContent ?? '').trim(),
      rows: rows.map((row) => ({
        prisoner: row.dataset['prisoner'] ?? null,
        tier: row.dataset['riskTier'] ?? null,
        group: row.dataset['classificationGroup'] ?? null,
        text: (row.innerText ?? '').replace(/\n+/g, ' ').trim(),
      })),
    };
  });
}

/** The Buy fold and the deliveries block, and which side of the fold each is on. */
async function buyReport(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const buyRow = document.querySelector<HTMLElement>('.hud-build__buy');
    const deliveries = document.querySelector<HTMLElement>('.hud-build__deliveries');
    const panel = document.querySelector<HTMLElement>('.hud-build');
    const box = (node: HTMLElement | null): Record<string, number> | null => {
      if (node === null) return null;
      const r = node.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const panelBox = panel === null ? null : panel.getBoundingClientRect();
    const cancels = deliveries === null ? [] : [...deliveries.querySelectorAll<HTMLElement>('.hud-build__delivery-list .ui-action')].filter((c) => !c.hidden);
    return {
      buyFoldHidden: buyRow?.hidden ?? null,
      buyToggleOpen: document.querySelector<HTMLElement>('.hud-build__buy-toggle')?.dataset['open'] ?? null,
      deliveriesHidden: deliveries?.hidden ?? null,
      deliveriesText: deliveries === null || deliveries.hidden ? null : (deliveries.innerText ?? '').replace(/\n+/g, ' | ').trim(),
      deliveriesBox: deliveries === null || deliveries.hidden ? null : box(deliveries),
      panelBox: box(panel),
      panelScrollTop: panel?.scrollTop ?? null,
      cancels: cancels.map((c) => {
        const r = c.getBoundingClientRect();
        return {
          label: (c.innerText ?? '').trim(),
          box: box(c),
          insidePanel: panelBox !== null && r.top >= panelBox.top - 1 && r.bottom <= panelBox.bottom + 1,
          hitsItself: document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)?.closest('.ui-action') === c,
        };
      }),
    };
  });
}

async function log(label: string, what: string, value: unknown): Promise<void> {
  console.log(`[${label}] ${what}: ${JSON.stringify(value)}`);
}

test.describe('the twelve changes of 2026-08-31, played', () => {
  test.beforeEach(async ({ page }) => {
    await installTee(page);
    page.on('console', (message) => {
      const text = message.text();
      if (/error|Error|refus|Refus/.test(text)) console.log(`  [page console] ${message.type()}: ${text}`);
    });
    page.on('pageerror', (error) => console.log(`  [pageerror] ${error.message}`));
  });

  /**
   * Act 1 -- first contact. What a player meets before pressing anything, at
   * both desktop widths. No prison, no clock: the honest-zero case.
   */
  test('act 1: what the first screen shows at 1280 and at 1920', async ({ page }) => {
    for (const size of [
      { width: 1280, height: 800 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      await openApp(page);
      const label = `act1-${String(size.width)}`;
      await log(label, 'strip on arrival', await stripReport(page));
      await log(label, 'alerts on arrival', await alertsReport(page));
      await page.screenshot({ path: `${SHOTS}/act1-arrival-${String(size.width)}x${String(size.height)}.png` });

      await page.getByRole('button', { name: 'New prison' }).click();
      await expect(page.locator('.hud-clock__day')).toHaveText('1');
      await page.waitForTimeout(1500);
      await log(label, 'strip after New prison', await stripReport(page));
      await log(label, 'alerts after New prison', await alertsReport(page));
      await log(label, 'strip text', (await panelText(page, '.hud-strip')).replace(/\n/g, ' | '));

      await tab(page, 'regime').click();
      await page.waitForTimeout(500);
      await log(label, 'regime roster on an empty prison', await regimeReport(page));
      await page.screenshot({ path: `${SHOTS}/act1-new-prison-${String(size.width)}x${String(size.height)}.png` });

      await tab(page, 'build').click();
      await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
      await page.waitForTimeout(300);
      await log(label, 'build panel with the Buy fold shut', await buyReport(page));
      await page.screenshot({ path: `${SHOTS}/act1-build-fold-shut-${String(size.width)}x${String(size.height)}.png` });
    }
  });

  /**
   * Act 2 -- the whole arc at 1280x800: build, admit, hire, run days, save,
   * reload, carry on. The claims about the alerts log, the HIGH RISK chip, the
   * roster order and the spend readout are all met here in sequence.
   */
  test('act 2: a whole prison at 1280x800, then reloaded', async ({ page }) => {
    test.setTimeout(1_500_000);
    const label = 'act2';
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    await buildAndPopulate(page, { beds: 12, admits: 12, guards: 5, label });

    await log(label, 'strip once populated', await stripReport(page));
    await log(label, 'alerts once populated', await alertsReport(page));
    await page.screenshot({ path: `${SHOTS}/act2-populated-1280x800.png`, fullPage: false });

    await tab(page, 'regime').click();
    await page.waitForTimeout(1000);
    await log(label, 'regime roster on tab select', await regimeReport(page));
    await page.screenshot({ path: `${SHOTS}/act2-regime-1280x800.png` });

    await tab(page, 'build').click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    await page.waitForTimeout(300);
    await log(label, 'spend readout with the fold shut, after buying', await buyReport(page));

    // Run several in-game days at x4, sampling what a player would be watching.
    const startTick = await currentTick(page);
    await log(label, 'tick before the long run', startTick);
    const samples: unknown[] = [];
    const deadline = Date.now() + 900_000;
    let lastAlertCount = -1;
    for (;;) {
      const tick = await currentTick(page);
      const alerts = await alertsReport(page);
      const rowCount = (alerts as { rowCount?: number }).rowCount ?? -1;
      if (rowCount !== lastAlertCount) {
        lastAlertCount = rowCount;
        await log(label, `alerts changed at tick ${String(tick)}`, alerts);
      }
      const counts = await latestCounts(page);
      samples.push({ at: Date.now(), tick, prisoners: counts?.prisoners, highRisk: counts?.prisonersHighRisk, treasury: counts?.treasuryMinorUnits });
      if (tick >= startTick + 12_000) break; // five in-game days
      if (Date.now() > deadline) {
        await log(label, 'gave up waiting at tick', tick);
        break;
      }
      await page.waitForTimeout(4000);
    }
    await log(label, 'tick samples through the run', samples);
    {
      const first = samples[0] as { at: number; tick: number } | undefined;
      const last = samples[samples.length - 1] as { at: number; tick: number } | undefined;
      if (first !== undefined && last !== undefined && last.at > first.at) {
        await log(label, 'measured ticks per wall second at x4 (ideal 80)', ((last.tick - first.tick) / (last.at - first.at)) * 1000);
      }
    }
    await log(label, 'clock at the end of the run', await currentClock(page));
    await log(label, 'strip after five in-game days', await stripReport(page));
    await log(label, 'alerts after five in-game days', await alertsReport(page));
    await page.screenshot({ path: `${SHOTS}/act2-after-five-days-1280x800.png` });

    await tab(page, 'regime').click();
    await page.waitForTimeout(800);
    await log(label, 'regime roster after five days', await regimeReport(page));

    // Save, reload, carry on -- the arc the brief asks for.
    await page.locator('.save-panel').scrollIntoViewIfNeeded();
    await log(label, 'save panel before saving', await panelText(page, '.save-panel'));
    const saveButton = page.locator('.save-panel button', { hasText: /save/i }).first();
    await saveButton.click();
    await page.waitForTimeout(3000);
    await log(label, 'save panel after saving', await panelText(page, '.save-panel'));
    await page.screenshot({ path: `${SHOTS}/act2-saved-1280x800.png` });

    await page.reload();
    await page.waitForSelector('#game-root canvas');
    await page.waitForSelector('.hud');
    await page.waitForTimeout(2000);
    await log(label, 'strip immediately after reload', await stripReport(page));
    await log(label, 'alerts immediately after reload', await alertsReport(page));
    await log(label, 'save panel after reload', await panelText(page, '.save-panel'));
    await page.screenshot({ path: `${SHOTS}/act2-after-reload-1280x800.png` });

    const loadButton = page.locator('.save-panel button', { hasText: /load|continue|resume/i }).first();
    if ((await loadButton.count()) > 0) {
      await log(label, 'load control reads', (await loadButton.innerText()).trim());
      await loadButton.click();
      await page.waitForTimeout(5000);
    }
    await log(label, 'strip after loading the save', await stripReport(page));
    await log(label, 'alerts after loading the save', await alertsReport(page));
    await log(label, 'clock after loading the save', await currentClock(page));
    await tab(page, 'regime').click();
    await page.waitForTimeout(800);
    await log(label, 'regime roster after loading the save', await regimeReport(page));
    await page.screenshot({ path: `${SHOTS}/act2-after-load-1280x800.png` });

    const series = await countsSeries(page);
    await log(label, 'counts publications in the reloaded page', series.length);
    await log(label, 'last counts', series[series.length - 1]);
  });

  /**
   * Act 3 -- the same arc at 1920x1080, with enough guards for a spare so the
   * search duty actually runs, and long enough for a contraband find.
   */
  test('act 3: a whole prison at 1920x1080, run long enough to find contraband', async ({ page }) => {
    test.setTimeout(1_800_000);
    const label = 'act3';
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openApp(page);

    await buildAndPopulate(page, { beds: 12, admits: 12, guards: 6, label });

    await log(label, 'strip once populated', await stripReport(page));
    await page.screenshot({ path: `${SHOTS}/act3-populated-1920x1080.png` });
    await tab(page, 'regime').click();
    await page.waitForTimeout(1000);
    await log(label, 'regime roster on tab select', await regimeReport(page));
    await page.screenshot({ path: `${SHOTS}/act3-regime-1920x1080.png` });
    await tab(page, 'overview').click();

    const startTick = await currentTick(page);
    const deadline = Date.now() + 1_200_000;
    let lastAlertCount = -1;
    let contrabandSeenAtTick: number | undefined;
    for (;;) {
      const tick = await currentTick(page);
      const alerts = (await alertsReport(page)) as { rowCount?: number; rows?: { text: string }[] };
      if ((alerts.rowCount ?? -1) !== lastAlertCount) {
        lastAlertCount = alerts.rowCount ?? -1;
        await log(label, `alerts changed at tick ${String(tick)}`, alerts);
        const found = (alerts.rows ?? []).find((row) => /Contraband found/i.test(row.text));
        if (found !== undefined && contrabandSeenAtTick === undefined) {
          contrabandSeenAtTick = tick;
          await log(label, 'CONTRABAND SENTENCE PAINTED at tick', { tick, row: found });
          await page.screenshot({ path: `${SHOTS}/act3-contraband-sentence-1920x1080.png` });
          await log(label, 'strip at the moment of the find', await stripReport(page));
        }
      }
      const counts = await latestCounts(page);
      if (tick >= startTick + 26_000) break; // eleven in-game days: past one classification review
      if (Date.now() > deadline) {
        await log(label, 'gave up waiting at tick', { tick, counts });
        break;
      }
      await page.waitForTimeout(4000);
    }
    await log(label, 'contraband seen at tick', contrabandSeenAtTick ?? 'never');
    await log(label, 'strip at the end', await stripReport(page));
    await log(label, 'alerts at the end', await alertsReport(page));
    await page.screenshot({ path: `${SHOTS}/act3-end-1920x1080.png` });
    await tab(page, 'regime').click();
    await page.waitForTimeout(800);
    await log(label, 'regime roster at the end', await regimeReport(page));
    await page.screenshot({ path: `${SHOTS}/act3-regime-end-1920x1080.png` });

    // The roster's refresh channel: does it move without a tab select?
    await tab(page, 'overview').click();
    await page.waitForTimeout(200);
    await tab(page, 'regime').click();
    await page.waitForTimeout(300);
    const before = await regimeReport(page);
    await page.waitForTimeout(20_000);
    const after = await regimeReport(page);
    await log(label, 'roster before a 20s wait on the Regime tab', before);
    await log(label, 'roster after a 20s wait on the Regime tab', after);
  });

  /**
   * Act 7 -- how long *Admit* is unusable after a press, measured on an idle
   * machine. Twelve presses is the ordinary opening move and act 2 paid about
   * a second for each of them.
   */
  test('act 7: what twelve Admit presses cost', async ({ page }) => {
    test.setTimeout(900_000);
    const label = 'act7';
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // A cell with beds, so nothing is refused -- the smallest prison that
    // accepts an admission.
    await buildAndPopulate(page, { beds: 4, admits: 0, guards: 0, label });

    await tab(page, 'overview').click();
    const admit = page.locator('.hud-intake__admit');
    const cycles: Record<string, number>[] = [];
    for (let index = 0; index < 12; index += 1) {
      const pressedAt = Date.now();
      await admit.click();
      const clickReturned = Date.now();
      // How long the control stays busy: poll its own disabled state.
      let enabledAt = clickReturned;
      for (;;) {
        const disabled = await admit.evaluate((node: HTMLButtonElement) => node.disabled || node.getAttribute('aria-disabled') === 'true');
        enabledAt = Date.now();
        if (!disabled) break;
        if (enabledAt - pressedAt > 15_000) break;
        await page.waitForTimeout(25);
      }
      cycles.push({ press: index + 1, clickMs: clickReturned - pressedAt, busyUntilMs: enabledAt - pressedAt });
    }
    await log(label, 'twelve Admit press cycles (ms)', cycles);
    await log(label, 'total wall time for twelve presses (ms)', cycles.reduce((sum, cycle) => sum + (cycle['busyUntilMs'] ?? 0), 0));
    await page.waitForTimeout(3000);
    await log(label, 'counts after twelve presses', await latestCounts(page));
    await log(label, 'strip', (await panelText(page, '.hud-strip')).replace(/\n/g, ' | '));
    await page.screenshot({ path: `${SHOTS}/act7-after-twelve-admits-1280x800.png` });
  });

  /**
   * Act 5 -- ruling 2, met as a player meets it: buy something, shut the Buy
   * fold, and see whether the money spent and its Cancel are still on screen.
   * The clock stays paused, because a landed delivery is no longer pending.
   */
  test('act 5: the money spent, with the Buy fold shut', async ({ page }) => {
    test.setTimeout(300_000);
    for (const size of [
      { width: 1280, height: 800 },
      { width: 1920, height: 1080 },
    ]) {
      const label = `act5-${String(size.width)}`;
      await page.setViewportSize(size);
      await openApp(page);
      await page.getByRole('button', { name: 'New prison' }).click();
      await expect(page.locator('.hud-clock__day')).toHaveText('1');
      await tab(page, 'build').click();
      await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
      await log(label, 'before opening the Buy fold', await buyReport(page));

      await page.locator('.hud-build__buy-toggle').click();
      await page.waitForTimeout(300);
      await page.locator('.hud-build__buy .ui-number__input').fill('30');
      await page.locator('.hud-build__buy-submit').click();
      await page.waitForTimeout(600);
      await log(label, 'fold open, one purchase placed', await buyReport(page));
      await page.screenshot({ path: `${SHOTS}/act5-fold-open-${String(size.width)}x${String(size.height)}.png` });

      // A second and a third purchase, so the block has more than one row.
      await page.locator('.hud-build__buy .ui-number__input').fill('10');
      await page.locator('.hud-build__buy-submit').click();
      await page.waitForTimeout(400);
      await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
      await page.waitForTimeout(200);
      const buyRowShut = await page.locator('.hud-build__buy').isHidden();
      if (buyRowShut) await page.locator('.hud-build__buy-toggle').click();
      await page.locator('.hud-build__buy .ui-number__input').fill('4');
      await page.locator('.hud-build__buy-submit').click();
      await page.waitForTimeout(600);

      // Shut the fold, the way a player does.
      await page.locator('.hud-build__buy-toggle').click();
      await page.waitForTimeout(500);
      await log(label, 'fold SHUT, three purchases pending', await buyReport(page));
      await log(label, 'strip while three purchases are pending', await stripReport(page));
      await page.screenshot({ path: `${SHOTS}/act5-fold-shut-${String(size.width)}x${String(size.height)}.png` });

      // Press the first Cancel and see what comes back.
      const before = await latestCounts(page);
      const firstCancel = page.locator('.hud-build__delivery-list .ui-action').first();
      if (await firstCancel.isVisible()) {
        await firstCancel.click();
        await page.waitForTimeout(1000);
        const after = await latestCounts(page);
        await log(label, 'after pressing the first Cancel', {
          fundsBefore: before?.treasuryMinorUnits,
          fundsAfter: after?.treasuryMinorUnits,
          refund: (after?.treasuryMinorUnits ?? 0) - (before?.treasuryMinorUnits ?? 0),
          panel: await buyReport(page),
        });
        await page.screenshot({ path: `${SHOTS}/act5-after-cancel-${String(size.width)}x${String(size.height)}.png` });
      } else {
        await log(label, 'the first Cancel was not visible with the fold shut', await buyReport(page));
      }
    }
  });

  /**
   * Act 6 -- a panel-body probe. Three panels answered with nothing but their
   * own title during act 2 and this asks the page why.
   */
  test('act 6: what the side panels actually contain once a prison is running', async ({ page }) => {
    test.setTimeout(600_000);
    const label = 'act6';
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    const probe = async (when: string): Promise<void> => {
      const report = await page.evaluate(() => {
        const out: Record<string, unknown> = {};
        for (const selector of ['.hud-intake', '.hud-rooms', '.hud-staff', '.hud-build', '.hud-regime']) {
          const node = document.querySelector<HTMLElement>(selector);
          if (node === null) {
            out[selector] = 'ABSENT';
            continue;
          }
          const body = node.querySelector<HTMLElement>(':scope > .ui-panel__body');
          const box = node.getBoundingClientRect();
          out[selector] = {
            laidOut: node.getClientRects().length > 0,
            box: { top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height) },
            collapsed: node.dataset['collapsed'] ?? null,
            bodyHidden: body?.hidden ?? null,
            bodyDisplay: body === null ? null : getComputedStyle(body).display,
            bodyHeight: body === null ? null : Math.round(body.getBoundingClientRect().height),
            innerText: (node.innerText ?? '').replace(/\n+/g, ' | ').slice(0, 200),
            textContent: (node.textContent ?? '').replace(/\s+/g, ' ').slice(0, 200),
          };
        }
        return out;
      });
      await log(label, `panels ${when}`, report);
    };

    await tab(page, 'overview').click();
    await probe('on a fresh paused prison, Overview selected');
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(15_000);
    await probe('after fifteen seconds at x4, Overview selected');
    await tab(page, 'rooms').click();
    await page.waitForTimeout(500);
    await probe('with Rooms selected');
    await tab(page, 'security').click();
    await page.waitForTimeout(500);
    await probe('with Security selected');
    await page.screenshot({ path: `${SHOTS}/act6-security-1280x800.png` });
  });

  /**
   * Act 4a -- what a player sees when *Admit* refuses. Eight presses on a
   * prison with no cell: does a sentence reach the screen, or only the console?
   */
  test('act 4a: pressing Admit on a prison with no cell', async ({ page }) => {
    test.setTimeout(300_000);
    const label = 'act4a';
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'overview').click();
    await log(label, 'intake panel before pressing', await panelText(page, '.hud-intake'));
    await log(label, 'refusal band before pressing', await panelText(page, '.hud__refusal'));
    for (let index = 0; index < 3; index += 1) {
      await page.locator('.hud-intake__admit').click();
      await page.waitForTimeout(400);
      await log(label, `refusal band after press ${String(index + 1)}`, await panelText(page, '.hud__refusal'));
      await log(label, `alerts after press ${String(index + 1)}`, await alertsReport(page));
    }
    await page.screenshot({ path: `${SHOTS}/act4a-admit-refused-1280x800.png` });
    await log(label, 'admit control disabled?', await page.locator('.hud-intake__admit').getAttribute('disabled'));
    await log(label, 'admit control aria-disabled?', await page.locator('.hud-intake__admit').getAttribute('aria-disabled'));
  });

  /**
   * Act 4b -- the loudest strip ordinary play can produce at 1280x800: a cell,
   * far more prisoners than beds, and not one guard, run until riot pressure
   * opens an incident. Every badge the strip can draw, at once.
   */
  test('act 4b: how bad the fully badged strip looks at 1280x800', async ({ page }) => {
    test.setTimeout(1_200_000);
    const label = 'act4b';
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    await buildAndPopulate(page, { beds: 2, admits: 14, guards: 0, label });

    await log(label, 'strip, fourteen prisoners, two beds, no guards', await stripReport(page));
    await page.screenshot({ path: `${SHOTS}/act4b-badged-1280x800.png` });

    const startTick = await currentTick(page);
    const deadline = Date.now() + 700_000;
    let worst = 0;
    for (;;) {
      const tick = await currentTick(page);
      const report = (await stripReport(page)) as { chips?: { badge: string | null; right: number }[]; clippedIds?: string[]; rowScrollWidth?: number; rowClientWidth?: number };
      const badges = (report.chips ?? []).filter((chip) => chip.badge !== null).length;
      if (badges > worst) {
        worst = badges;
        await log(label, `badge count rose to ${String(badges)} at tick ${String(tick)}`, report);
        await page.screenshot({ path: `${SHOTS}/act4b-badges-${String(badges)}-1280x800.png` });
      }
      if (tick >= startTick + 14_000) break;
      if (Date.now() > deadline) {
        await log(label, 'gave up at tick', tick);
        break;
      }
      await page.waitForTimeout(4000);
    }
    await log(label, 'strip at the end', await stripReport(page));
    await log(label, 'alerts at the end', await alertsReport(page));
    await log(label, 'strip text at the end', (await panelText(page, '.hud-strip')).replace(/\n/g, ' | '));
    await page.screenshot({ path: `${SHOTS}/act4b-end-1280x800.png` });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1500);
    await log(label, 'the same prison at 1920', await stripReport(page));
    await page.screenshot({ path: `${SHOTS}/act4b-end-1920x1080.png` });
  });
});
