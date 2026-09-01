import { expect, test } from '@playwright/test';
import {
  armBuildable,
  buildAndPopulate,
  calibrate,
  centreOf,
  currentTick,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  runUntilTick,
  tab,
} from './playtest-harness';

/**
 * **What survives a reload, read off the screen rather than off the store.**
 *
 * The owner's standing brief is *"znajdź bugi i błędy grając"* -- find defects
 * by playing -- under the design directive that the game must be easy and
 * friendly, with no hidden functionality. This instrument plays one prison
 * into a state that has something to lose, writes down **what the screen
 * says**, reloads the page for real, loads the save, and writes down what the
 * screen says then. The deliverable is the diff between those two readings and
 * whether the game ever told the player about it.
 *
 * ## Why this is a *second* reload playtest and not a repeat of the first
 *
 * `playtest-save-restore.playtest.ts` already asks whether a prison survives
 * being closed and reopened, and
 * `docs/research/2026-08-31-what-a-reload-keeps-and-what-it-says.md` walked
 * `docs/PERSISTENCE.md`'s exclusions list against a player. Both predate the
 * owner's decisions of 2026-09-01 on
 * [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md),
 * which changed the answer for the surface those two found most interesting:
 * the alerts log **is** snapshotted now, a row carries a count and a day, and
 * a row can be dismissed. So the questions this instrument asks are the ones
 * that only exist since that change:
 *
 * 1. Does the alerts list come back at all, and does it come back **saying the
 *    same thing** -- same rows, same `xN` counts, same `Day N`, same severity
 *    badges, same order?
 * 2. Does a **dismissal** survive the reload it was built to survive?
 * 3. The refusal band and the refusal row are still *not* snapshotted
 *    (`RefusalLog`, `src/simulation/runtime/new-session.ts:199`). A player who
 *    reloads with a refusal on screen loses it. Are they told, or does it just
 *    quietly differ?
 * 4. The events band (`.hud__event`) is deliberately *not* re-announced on a
 *    restore. What does the player actually see there afterwards?
 *
 * ## What it is not
 *
 * Not a gate. Nothing in CI collects `.playtest.ts`, and
 * `playwright.playtest.config.ts` says so at length. Its output is the
 * deliverable, and the findings live in
 * `docs/research/2026-09-01-what-survives-a-reload.md`.
 *
 * **Nothing here is a timing claim.** Several browsers share this box, so no
 * number below is a latency, a frame rate or a wall-clock measurement of the
 * game; every reading is *what state came back*, which load cannot move.
 */

const DAY_TICKS = 2_400;

/** One alert row, as a player could read it off the screen. */
interface AlertRowReading {
  readonly id: string;
  readonly text: string;
  readonly badge: string;
  readonly dismissible: boolean;
  /** Whether the `x` control is actually laid out, not merely present in the DOM. */
  readonly dismissControlLaidOut: boolean;
}

/**
 * Every row in the alerts list, in the order the list lays them out.
 *
 * `innerText` per part rather than per row, because the row concatenates the
 * sentence, the count, the day and the severity word with no separator and a
 * single string cannot be read back apart.
 */
async function readAlerts(page: import('@playwright/test').Page): Promise<readonly AlertRowReading[]> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('.hud-alerts__list [data-alert]')];
    return rows.map((row) => {
      const label = row.querySelector<HTMLElement>('.ui-row__label');
      const badge = row.querySelector<HTMLElement>('.ui-badge, [class*="badge"]');
      const control = row.querySelector<HTMLElement>('button.ui-icon-button');
      return {
        id: row.dataset['alert'] ?? '(none)',
        text: (label?.innerText ?? row.innerText ?? '').trim(),
        badge: (badge?.innerText ?? '').trim(),
        dismissible: row.dataset['alertDismissible'] === 'true',
        dismissControlLaidOut: control !== null && control.getClientRects().length > 0,
      };
    });
  });
}

function formatAlerts(rows: readonly AlertRowReading[]): string {
  if (rows.length === 0) return '    (no rows at all)';
  return rows
    .map(
      (row, index) =>
        `    ${index}. [${row.id}] ${JSON.stringify(row.text)} badge=${JSON.stringify(row.badge)}` +
        ` dismissible=${row.dismissible} controlLaidOut=${row.dismissControlLaidOut}`,
    )
    .join('\n');
}

/** The three alert surfaces at once: the two always-laid-out bands and the list. */
async function readAlertSurfaces(
  page: import('@playwright/test').Page,
): Promise<{ refusal: string; event: string; rows: readonly AlertRowReading[] }> {
  return {
    refusal: await panelText(page, '.hud__refusal'),
    event: await panelText(page, '.hud__event'),
    rows: await readAlerts(page),
  };
}

test.describe('playtest: what survives a reload, and what the screen says about what did not', () => {
  test('play a prison into a state with something to lose, reload, and read both screens', async ({ page }) => {
    test.setTimeout(1_800_000);

    const log = (line: string) => console.log(`[reload] ${line}`);
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      if (m.type() === 'error' || m.type() === 'warning') log(`PAGE ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => log(`PAGE ERROR: ${String(e)}`));

    await installTee(page);
    await openApp(page);

    // ---- act 1: a prison big enough to have something to say ---------------
    //
    // Twelve residents, because that is the population
    // `docs/research/2026-09-01-playing-after-the-rulings.md` measured fights,
    // all-clears and contraband finds arriving at by in-game day 7 -- the
    // events this instrument needs in the log before it can ask whether the
    // log survives. Six beds against twelve admissions is deliberate as well:
    // the overcrowding is what drives the unrest the incident triggers read.
    const origin = await buildAndPopulate(page, { beds: 6, admits: 12, guards: 2, label: 'reload' });
    await fastForwardToMax(page);
    log(`built and populated at tick ${await currentTick(page)}`);

    // ---- act 2: run until the alerts list has a run in it ------------------
    //
    // A *run* -- the same sentence more than once -- is what the owner's
    // decision 1 put a count on, so the reading is only interesting once one
    // exists. Poll the screen rather than the clock: the point is what a
    // player can see.
    const targetTick = 7 * DAY_TICKS;
    let sawRun = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const rows = await readAlerts(page);
      // `hud.alert.occurrences` renders `{count}×` -- the digit *before* the
      // symbol (`src/content/default-locale-en.ts:263`, ADR 0084's own
      // wording: "the multiplier after the figure"). A pattern demanding the
      // digit follow `×` or a literal `x` never matches that order and this
      // probe silently never saw a run; fixed to the actual rendered shape.
      sawRun = rows.some((row) => /\d+\s*×/.test(row.text) && row.id !== 'empty');
      const tick = await currentTick(page);
      if (attempt % 5 === 0 || sawRun) {
        log(`t=${tick} day~${Math.floor(tick / DAY_TICKS) + 1}: ${rows.length} row(s), run seen = ${sawRun}`);
        log(formatAlerts(rows));
      }
      if (sawRun && tick >= targetTick) break;
      await page.waitForTimeout(6_000);
    }
    await runUntilTick(page, targetTick, 600_000).catch((error) => log(`did not reach day 7: ${String(error)}`));

    log(`=== ACT 2 DONE at tick ${await currentTick(page)} ===`);
    log(`strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

    // ---- act 3: dismiss one row, the way a player would --------------------
    //
    // The row chosen is the first dismissible one, and it is chosen off the
    // screen rather than by id, because a player picks the row they can see.
    const beforeDismiss = await readAlerts(page);
    log(`ALERTS BEFORE DISMISSAL (${beforeDismiss.length} rows):`);
    log(formatAlerts(beforeDismiss));

    const victim = beforeDismiss.find((row) => row.dismissible && row.dismissControlLaidOut);
    if (victim === undefined) {
      log('NO DISMISSIBLE ROW ON SCREEN -- decision 3 cannot be exercised, and that is itself a reading');
    } else {
      log(`dismissing [${victim.id}] ${JSON.stringify(victim.text)}`);
      await page.locator(`.hud-alerts__list [data-alert="${victim.id}"] button.ui-icon-button`).click();
      await page.waitForTimeout(2_000);
      const afterDismiss = await readAlerts(page);
      log(`ALERTS AFTER DISMISSAL (${afterDismiss.length} rows):`);
      log(formatAlerts(afterDismiss));
      log(`the dismissed row is ${afterDismiss.some((r) => r.id === victim.id) ? 'STILL THERE' : 'gone'}`);
    }

    // ---- act 4: put a refusal on the screen, the way a mis-click does ------
    //
    // Remove, pressed on a tile with nothing on it. This is the exact gesture
    // `docs/research/2026-08-31-what-a-reload-keeps-and-what-it-says.md` C.3
    // records as pinning a sentence across the top of the world with no way to
    // clear it but a reload -- so it is both a real player mistake and the one
    // thing on these surfaces the save is known not to carry.
    await tab(page, 'build').click();
    await page.locator('.hud-build__remove').click();
    const empty = centreOf(origin, 30, 30);
    await press(page, empty.x, empty.y);
    await page.waitForTimeout(2_000);
    // And disarm, so nothing else in this run is holding the remove tool.
    await page.locator('.hud-build__remove').click();

    const beforeSave = await readAlertSurfaces(page);
    log('=== SCREEN BEFORE THE SAVE ===');
    log(`  refusal band: ${JSON.stringify(beforeSave.refusal)}`);
    log(`  event band:   ${JSON.stringify(beforeSave.event)}`);
    log(`  alerts list (${beforeSave.rows.length} rows):`);
    log(formatAlerts(beforeSave.rows));
    const countsBeforeSave = await latestCounts(page);
    log(`  counts: ${JSON.stringify(countsBeforeSave)}`);
    log(`  clock day: ${await panelText(page, '.hud-clock__day')}`);

    // ---- act 5: save --------------------------------------------------------
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 60_000 });
    log(`SAVED: ${JSON.stringify(await panelText(page, '.save-panel__status'))}`);

    // The screen immediately after the save, because a save is a gesture a
    // player makes *while looking at* the surfaces above, and anything that
    // moves here moved without a reload.
    const afterSave = await readAlertSurfaces(page);
    log('=== SCREEN IMMEDIATELY AFTER THE SAVE (no reload yet) ===');
    log(`  refusal band: ${JSON.stringify(afterSave.refusal)}`);
    log(`  event band:   ${JSON.stringify(afterSave.event)}`);
    log(formatAlerts(afterSave.rows));

    // ---- act 6: a real navigation, then load -------------------------------
    await installTee(page);
    await openApp(page);
    log('=== RELOADED ===');
    const onArrival = await readAlertSurfaces(page);
    log(`  on arrival, before loading anything:`);
    log(`  refusal band: ${JSON.stringify(onArrival.refusal)}`);
    log(`  event band:   ${JSON.stringify(onArrival.event)}`);
    log(formatAlerts(onArrival.rows));
    log(`  save panel: ${await panelText(page, '.save-panel')}`);

    await page.locator('.save-panel__item').first().click();
    let loaded = await latestCounts(page);
    for (let i = 0; i < 30 && (loaded === undefined || loaded.prisoners <= 0); i += 1) {
      await page.waitForTimeout(1_000);
      loaded = await latestCounts(page);
    }
    await page.waitForTimeout(3_000);

    const afterLoad = await readAlertSurfaces(page);
    log('=== SCREEN AFTER THE LOAD ===');
    log(`  counts: ${JSON.stringify(loaded)}`);
    log(`  clock day: ${await panelText(page, '.hud-clock__day')}`);
    log(`  refusal band: ${JSON.stringify(afterLoad.refusal)}`);
    log(`  event band:   ${JSON.stringify(afterLoad.event)}`);
    log(`  alerts list (${afterLoad.rows.length} rows):`);
    log(formatAlerts(afterLoad.rows));
    log(`  strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

    // ---- act 7: the diff, stated as sentences a player would recognise -----
    log('=== WHAT CHANGED, ROW BY ROW ===');
    const before = beforeSave.rows.filter((r) => r.id !== 'empty');
    const after = afterLoad.rows.filter((r) => r.id !== 'empty');
    log(`  row count: ${before.length} -> ${after.length}`);
    for (const row of before) {
      const match = after.find((r) => r.text === row.text);
      if (match === undefined) log(`  LOST:    ${JSON.stringify(row.text)} (${row.id}, badge ${row.badge})`);
      else if (match.badge !== row.badge) log(`  BADGE:   ${JSON.stringify(row.text)} ${row.badge} -> ${match.badge}`);
      else log(`  kept:    ${JSON.stringify(row.text)}`);
    }
    for (const row of after) {
      if (!before.some((r) => r.text === row.text)) log(`  APPEARED: ${JSON.stringify(row.text)} (${row.id})`);
    }
    if (victim !== undefined) {
      const returned = after.some((r) => r.text === victim.text);
      log(`  the dismissed sentence ${JSON.stringify(victim.text)} is ${returned ? 'BACK ON THE LIST' : 'still gone'}`);
    }
    log(`  refusal band: ${JSON.stringify(beforeSave.refusal)} -> ${JSON.stringify(afterLoad.refusal)}`);
    log(`  event band:   ${JSON.stringify(beforeSave.event)} -> ${JSON.stringify(afterLoad.event)}`);

    // ---- act 8: is a restored row still a control a player can use? --------
    //
    // A row that comes back but cannot be dismissed would be a surface that
    // looks the same and behaves differently, which is the *hidden
    // functionality* the owner's directive is about.
    const restoredVictim = after.find((row) => row.dismissible && row.dismissControlLaidOut);
    if (restoredVictim === undefined) {
      log('NO DISMISSIBLE ROW AFTER THE LOAD -- the restored list has no working control');
    } else {
      log(`pressing the x on a restored row: [${restoredVictim.id}] ${JSON.stringify(restoredVictim.text)}`);
      await page.locator(`.hud-alerts__list [data-alert="${restoredVictim.id}"] button.ui-icon-button`).click();
      await page.waitForTimeout(2_500);
      const afterSecondDismiss = await readAlerts(page);
      log(
        `  the restored row is ${afterSecondDismiss.some((r) => r.id === restoredVictim.id) ? 'STILL THERE' : 'gone'}` +
          ` (${afterSecondDismiss.length} rows left)`,
      );
      log(formatAlerts(afterSecondDismiss));

      // And does *that* dismissal survive its own reload? A dismissal made
      // against a restored record is the case the save round trip has never
      // been asked about: the record's ordinal came out of a previous save.
      await page.getByRole('button', { name: 'Save now' }).click();
      await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 60_000 });
      await installTee(page);
      await openApp(page);
      await page.locator('.save-panel__item').first().click();
      let reloaded = await latestCounts(page);
      for (let i = 0; i < 30 && (reloaded === undefined || reloaded.prisoners <= 0); i += 1) {
        await page.waitForTimeout(1_000);
        reloaded = await latestCounts(page);
      }
      await page.waitForTimeout(3_000);
      const afterSecondLoad = await readAlerts(page);
      log('=== AFTER A SECOND SAVE AND RELOAD ===');
      log(formatAlerts(afterSecondLoad));
      log(
        `  the twice-dismissed sentence ${JSON.stringify(restoredVictim.text)} is ` +
          `${afterSecondLoad.some((r) => r.text === restoredVictim.text) ? 'BACK' : 'still gone'}`,
      );
    }

    // ---- act 9: does anything on screen say a reload cost the player anything?
    //
    // The whole brief in one measurement: after a reload that demonstrably
    // dropped a surface, is there any sentence anywhere that says so?
    const wholeHud = await panelText(page, '.hud');
    log('=== DOES THE SCREEN SAY ANYTHING WAS LOST? ===');
    log(`  the word "refus" appears in the HUD: ${/refus/i.test(wholeHud)}`);
    log(`  the word "lost" appears in the HUD:  ${/\blost\b/i.test(wholeHud)}`);
    log(`  the word "restor" appears in the HUD: ${/restor/i.test(wholeHud)}`);
    log(`  full HUD text:\n${wholeHud}`);

    // Preconditions, not findings. The run is worthless if the prison did not
    // come back at all, and that is the one thing worth failing on.
    expect(loaded?.prisoners ?? 0).toBeGreaterThan(0);
  });
});

/**
 * A second, much smaller walk: **a refusal and nothing else.**
 *
 * The prison above takes twenty minutes to build. This one exists so the
 * refusal reading is reproducible in under two: a brand-new prison, one
 * mis-click, a save, a reload. It answers question 3 of the header on its own,
 * so nobody has to run the long one to re-check it.
 */
test.describe('playtest: a refusal, a save, and a reload', () => {
  test('a mis-clicked Remove on an empty prison, saved and reloaded', async ({ page }) => {
    test.setTimeout(600_000);
    const log = (line: string) => console.log(`[refusal-reload] ${line}`);
    page.on('pageerror', (e) => log(`PAGE ERROR: ${String(e)}`));

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    const origin = await calibrate(page);

    // The mis-click.
    await page.locator('.hud-build__remove').click();
    const spot = centreOf(origin, 20, 20);
    await press(page, spot.x, spot.y);
    await page.waitForTimeout(1_500);
    await page.locator('.hud-build__remove').click();

    const before = await readAlertSurfaces(page);
    log(`BEFORE: refusal band = ${JSON.stringify(before.refusal)}`);
    log(`BEFORE: alerts list:\n${formatAlerts(before.rows)}`);

    // A second, different refusal so the list holds more than one: a purchase
    // the treasury cannot cover.
    await armBuildable(page, 'wall-brick');
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('9999');
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(1_500);
    const afterBadBuy = await readAlertSurfaces(page);
    log(`AFTER A REFUSED PURCHASE: refusal band = ${JSON.stringify(afterBadBuy.refusal)}`);
    log(`AFTER A REFUSED PURCHASE: alerts list:\n${formatAlerts(afterBadBuy.rows)}`);

    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 60_000 });

    await installTee(page);
    await openApp(page);
    await page.locator('.save-panel__item').first().click();
    await page.waitForTimeout(6_000);

    const after = await readAlertSurfaces(page);
    log(`AFTER RELOAD: refusal band = ${JSON.stringify(after.refusal)}`);
    log(`AFTER RELOAD: event band   = ${JSON.stringify(after.event)}`);
    log(`AFTER RELOAD: alerts list:\n${formatAlerts(after.rows)}`);
    log(`AFTER RELOAD: full HUD text:\n${await panelText(page, '.hud')}`);
  });
});
