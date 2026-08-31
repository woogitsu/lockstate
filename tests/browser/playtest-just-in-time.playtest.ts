import { test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  calibrate,
  centreOf,
  currentClock,
  currentTick,
  drag,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  sentCommands,
  tab,
} from './playtest-harness';

/**
 * **Does a wall get built without ever pressing *Buy*?** Played on
 * `agent/627-just-in-time-materials` (PR #640), which makes a `PlaceBuildOrder`
 * buy its own materials at the press.
 *
 * ## The one rule this file plays under
 *
 * **`buy()` is deliberately not imported.** `playtest-harness.ts` exports it
 * and `buildAndPopulate` calls it twice before drawing a single wall; every
 * previous playtest in this directory therefore proves the game works *for a
 * player who already visited the procurement fold*. That is the population
 * issue [#627](https://github.com/matmaxalez/lockstate/issues/627) says does
 * not include the owner, whose own words are the brief: *"znajdź bugi i błędy
 * grając, bo ja nie mogłem postawić więzienia itp grając sam"* -- and the
 * standing directive is that *"the game is to be easy and friendly to play,
 * not hidden mechanics like this one, where you have to order building
 * material"*. So nothing below opens `.hud-build__buy`, and if a wall goes up
 * it went up on money the game spent for the player.
 *
 * `buildAndPopulate` is not imported either, for the same reason and for a
 * second one: it hides the very timings this file exists to print.
 *
 * ## The clock is pressed on purpose, and it is said out loud
 *
 * A new session's clock is constructed `paused`
 * (`src/simulation/worker/state-machine.ts:216`) and the strip reads `×1`
 * whether it is running or stopped, which is a separate defect being fixed on
 * `agent/639-clock-is-stopped`. This file is **not** measuring that: it
 * presses **Play** -- `.hud-strip__transport button` index 1, the middle of
 * `pause / play / fast-forward` (`src/ui/hud/status-strip.ts:157-159`) --
 * immediately after `New prison`, and logs the clock either side of the press
 * so the reader can see it was stopped and then was not. Every tick figure
 * below is therefore a figure from a clock that a player deliberately started.
 *
 * ## The instrumentation rule, inherited from #569's retraction
 *
 * *"A survey that enumerates known regions cannot find a message in a region
 * it did not know about. Print the container, not the parts."* So every
 * observation dumps the whole of `.hud` through `hudDump`, with `.ui-sr-only`
 * spans stripped -- an icon button's accessible name is in `innerText` and is
 * not on screen, which produced a false *"the game says it is paused"* reading
 * in `playtest-hidden-requirements.playtest.ts` and is recorded there.
 *
 * ## Not a gate
 *
 * Nothing in CI collects `.playtest.ts`; only
 * `tests/browser/playwright.playtest.config.ts` does, and it is run by hand.
 * The console output is the deliverable. The findings live in
 * `docs/research/2026-08-30-a-wall-that-buys-itself.md`.
 */

/** The rectangle acts 1 and 2 build, in tiles. Same one every playtest here uses. */
const AREA = { x0: 12, y0: 12, x1: 17, y1: 17 } as const;

interface HudDump {
  readonly visibleText: string;
  readonly refusal: { hidden: boolean | string; box: { w: number; h: number }; text: string };
  readonly event: { present: boolean; hidden: boolean | string; severity: string | null; text: string };
  readonly queue: { present: boolean; collapsed: string | null; headerText: string; bodyHidden: boolean | string };
  readonly deliveries: { present: boolean; collapsed: string | null; headerText: string };
  readonly transport: readonly { label: string; pressed: string | null }[];
  readonly clockMode: string | null;
  readonly speedText: string;
  readonly funds: string;
}

/**
 * The whole HUD, plus the four regions this file asks questions about.
 *
 * `visibleText` walks the **live** DOM and drops any text node whose parent has
 * no client rects, so a sentence inside a shut fold is correctly absent and
 * "could a player read this without unfolding anything?" is a substring test.
 * A cloned node has no layout and would answer the opposite.
 */
async function hudDump(page: import('@playwright/test').Page): Promise<HudDump> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    const refusalNode = document.querySelector<HTMLElement>('.hud__refusal');
    const eventNode = document.querySelector<HTMLElement>('.hud__event');
    const section = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector);
      return {
        present: node !== null,
        collapsed: node?.getAttribute('data-collapsed') ?? null,
        headerText: (node?.querySelector<HTMLElement>('.ui-section__header')?.innerText ?? '').replace(/\n+/g, ' ').trim(),
        bodyHidden: node?.querySelector<HTMLElement>('.ui-section__body')?.hidden ?? true,
      };
    };
    let visibleText = 'NO .hud';
    if (hud !== null) {
      const parts: string[] = [];
      const walker = document.createTreeWalker(hud, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent === null) continue;
        if (parent.closest('.ui-sr-only') !== null) continue;
        if (parent.getClientRects().length === 0) continue;
        const value = (node.textContent ?? '').trim();
        if (value !== '') parts.push(value);
      }
      visibleText = parts.join('\n');
    }
    const refusalRect = refusalNode?.getBoundingClientRect();
    return {
      visibleText,
      refusal: {
        hidden: refusalNode?.hidden ?? true,
        box: { w: Math.round(refusalRect?.width ?? 0), h: Math.round(refusalRect?.height ?? 0) },
        text: (refusalNode?.innerText ?? '').trim(),
      },
      event: {
        present: eventNode !== null,
        hidden: eventNode?.hidden ?? true,
        severity: eventNode?.getAttribute('data-severity') ?? null,
        text: (eventNode?.innerText ?? '').trim(),
      },
      queue: section('.hud-build__queue'),
      deliveries: section('.hud-build__deliveries'),
      transport: [...document.querySelectorAll<HTMLButtonElement>('.hud-strip__transport button')].map((button) => ({
        label: (button.getAttribute('aria-label') ?? button.title ?? '').trim(),
        pressed: button.getAttribute('aria-pressed'),
      })),
      clockMode: document.querySelector<HTMLElement>('.hud-strip')?.getAttribute('data-clock-mode') ?? null,
      speedText: (document.querySelector<HTMLElement>('.hud-clock__speed')?.textContent ?? '').trim(),
      funds: (document.querySelector<HTMLElement>('.hud-strip')?.innerText ?? '').replace(/\n+/g, ' | ').trim(),
    };
  });
}

/**
 * Wall-clock seconds since the act started, on every line.
 *
 * Added after a run spent its whole 600 s budget and the log could not say
 * where: the answer was one `locator.click()` on a control that never became
 * actionable, and Playwright's default action timeout is `0` -- no timeout at
 * all. `page.setDefaultTimeout` below is the other half of that fix.
 */
let actStartedAt = Date.now();
const log = (act: string, line: string) =>
  console.log(`[${act} +${((Date.now() - actStartedAt) / 1000).toFixed(1)}s] ${line}`);

async function observe(page: import('@playwright/test').Page, act: string, moment: string): Promise<HudDump> {
  const dump = await hudDump(page);
  const counts = await latestCounts(page);
  log(act, `--- ${moment} --- tick=${await currentTick(page)} clock=${JSON.stringify(await currentClock(page))}`);
  log(act, `  counts: treasury=${counts?.treasuryMinorUnits} rooms=${counts?.rooms} accommodation=${counts?.accommodationCapacity} prisoners=${counts?.prisoners} staff=${counts?.staff} wageBill=${counts?.dailyWageBillMinorUnits}`);
  log(act, `  strip: ${dump.funds}`);
  log(act, `  queue fold: collapsed=${dump.queue.collapsed} header=${JSON.stringify(dump.queue.headerText)} bodyHidden=${String(dump.queue.bodyHidden)}`);
  log(act, `  deliveries fold: present=${dump.deliveries.present} collapsed=${dump.deliveries.collapsed} header=${JSON.stringify(dump.deliveries.headerText)}`);
  log(act, `  refusal band: hidden=${String(dump.refusal.hidden)} box=${dump.refusal.box.w}x${dump.refusal.box.h} text=${JSON.stringify(dump.refusal.text)}`);
  log(act, `  event band: present=${dump.event.present} hidden=${String(dump.event.hidden)} severity=${dump.event.severity} text=${JSON.stringify(dump.event.text)}`);
  log(act, `  transport: ${JSON.stringify(dump.transport)} clockMode=${dump.clockMode} speed=${JSON.stringify(dump.speedText)}`);
  log(act, `  VISIBLE HUD TEXT:\n${dump.visibleText.split('\n').map((l) => `      ${l}`).join('\n')}`);
  return dump;
}

/**
 * The treasury, once the worker has actually published it.
 *
 * **Not `latestCounts` straight after a press.** `simulation/status-counts` is
 * published on the worker's own cadence and skipped entirely when the payload
 * equals the last one (`statusCountsEqual`,
 * `src/simulation/worker/status-counts.ts`), so a read taken in the same
 * hundred milliseconds as a click answers the balance from *before* it. Run 1
 * of this file read `25000 -> 25000 (delta 0)` for six wall segments that had
 * demonstrably cost 480, and the next observation a second later read 24,520.
 * This polls until the figure moves or the budget runs out, and says which.
 */
async function settledTreasury(
  page: import('@playwright/test').Page,
  act: string,
  was: number,
  budgetMs = 8000,
): Promise<number> {
  const started = Date.now();
  for (;;) {
    const now = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
    if (now !== was) return now;
    if (Date.now() - started > budgetMs) {
      log(act, `  treasury never moved off ${was} within ${budgetMs}ms -- reporting it unchanged`);
      return now;
    }
    await page.waitForTimeout(400);
  }
}

/**
 * The tiles a drag can actually reach, from the measured origin.
 *
 * A gesture that leaves the window is not one a player can make, and the first
 * version of act 3 dragged from tile column 2 at row 4 -- both off screen at
 * 1440x900, where tile (0,0) sits at (-304,-574). Computed rather than
 * hard-coded so the same code is right at another viewport. It is still an
 * over-estimate: the HUD rail covers the right of the world and the panel
 * covers the bottom, which run 1 measured as 20 segments on the first row and
 * 16 on the next six.
 */
function visibleTileWindow(origin: { originX: number; originY: number }): {
  firstColumn: number;
  lastColumn: number;
  firstRow: number;
  lastRow: number;
} {
  return {
    firstColumn: Math.ceil(-origin.originX / TILE) + 1,
    lastColumn: Math.floor((1440 - origin.originX) / TILE) - 1,
    firstRow: Math.ceil(-origin.originY / TILE) + 1,
    lastRow: Math.floor((900 - origin.originY) / TILE) - 1,
  };
}

/** Presses Play, and prints the clock either side of the press. */
async function pressPlay(page: import('@playwright/test').Page, act: string): Promise<void> {
  log(act, `clock BEFORE pressing Play: ${JSON.stringify(await currentClock(page))} (tick ${await currentTick(page)})`);
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(1200);
  log(act, `clock AFTER pressing Play: ${JSON.stringify(await currentClock(page))} (tick ${await currentTick(page)})`);
}

/**
 * Polls the queue readout, the treasury and the tick together, and returns
 * every distinct state it passed through.
 *
 * The three are sampled in one loop rather than three because the question is
 * *when the money left relative to when the wall went up*, and two independent
 * pollers cannot answer that.
 */
async function watchQueue(
  page: import('@playwright/test').Page,
  act: string,
  label: string,
  timeoutMs: number,
): Promise<readonly { ms: number; tick: number; queue: string; treasury: number; deliveries: string }[]> {
  const started = Date.now();
  const samples: { ms: number; tick: number; queue: string; treasury: number; deliveries: string }[] = [];
  let lastKey = '';
  for (;;) {
    const queue = (await panelText(page, '.hud-build__queue')).replace(/\n+/g, ' | ');
    const deliveries = (await panelText(page, '.hud-build__deliveries')).replace(/\n+/g, ' | ');
    const key = `${queue}::${deliveries}`;
    const treasury = key === lastKey ? -2 : (await latestCounts(page))?.treasuryMinorUnits ?? -1;
    if (key !== lastKey) {
      const sample = { ms: Date.now() - started, tick: await currentTick(page), queue, treasury, deliveries };
      samples.push(sample);
      log(act, `  ${label} t+${sample.ms}ms tick=${sample.tick} treasury=${sample.treasury} queue=${JSON.stringify(sample.queue)} deliveries=${JSON.stringify(sample.deliveries)}`);
      lastKey = key;
    }
    /*
     * **The empty queue is an *absent* block, not a `0 waiting` one.**
     * `paintQueue` sets `queueSection.element.hidden = true` whenever
     * `queue.total === 0` (`src/ui/hud/build-panel.ts:1590-1591`), with the
     * reason written out beside it: the panel's always-visible budget at
     * 900x600 is 7.8px, so a block saying "nothing is queued" would be
     * permanent furniture. `panelText` therefore answers `not laid out`, and
     * the first version of this loop -- which waited for the literal
     * `0 waiting . 0 being built` that `waitForQueueEmpty` also greps for --
     * sat through its whole 180 s timeout on a queue that had drained in 24 s.
     * Recorded rather than corrected away: the shared harness treats
     * `not laid out` as empty and is right to.
     */
    if (/(?<![0-9])0 waiting . 0 being built/.test(queue) || queue.includes('not laid out') || queue.includes('ABSENT')) return samples;
    if (Date.now() - started > timeoutMs) {
      log(act, `  ${label} GAVE UP after ${Date.now() - started}ms, queue still ${JSON.stringify(queue)}`);
      return samples;
    }
    await page.waitForTimeout(1000);
  }
}

/** Drags one wall run and reports the `PlaceBuildOrder` commands it produced. */
async function wallRun(
  page: import('@playwright/test').Page,
  act: string,
  origin: { originX: number; originY: number },
  name: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Promise<number> {
  const before = (await sentCommands(page)).length;
  await drag(page, a, b);
  const produced = (await sentCommands(page)).slice(before);
  const placements = produced.filter((command) => command['type'] === 'PlaceBuildOrder');
  log(act, `wall run ${name}: ${placements.length} PlaceBuildOrder of ${produced.length} command(s) -> ${JSON.stringify(placements.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  void origin;
  return placements.length;
}

test('act 1 and 2: a wall, then everything after it, with no procurement press', async ({ page }) => {
  test.setTimeout(600_000);
  const act = 'A1';
  actStartedAt = Date.now();
  // Playwright's default action timeout is 0 -- no timeout. One un-actionable
  // control therefore consumes the whole test budget with no line saying which.
  page.setDefaultTimeout(20_000);
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  await observe(page, act, 'a new prison, nothing pressed');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // Deliberate, and the only reason it is here: see the file comment.
  await pressPlay(page, act);
  await observe(page, act, 'Play pressed, before any wall');

  // --- Act 1: ONE wall run, and nothing else. -------------------------------
  await armBuildable(page, 'wall-brick');
  const treasuryBeforeWall = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  const westX = origin.originX + AREA.x0 * TILE;
  const eastX = origin.originX + (AREA.x1 + 1) * TILE;
  const northY = origin.originY + AREA.y0 * TILE;
  const southY = origin.originY + (AREA.y1 + 1) * TILE;

  const northSegments = await wallRun(page, act, origin, 'north', { x: westX + TILE / 2, y: northY }, { x: eastX - TILE / 2, y: northY });
  const treasuryAfterWall = await settledTreasury(page, act, treasuryBeforeWall);
  log(act, `TREASURY AT THE PRESS: ${treasuryBeforeWall} -> ${treasuryAfterWall} (delta ${treasuryAfterWall - treasuryBeforeWall}) for ${northSegments} wall segment(s)`);

  /*
   * **Does the purchase the game just made for the player ever appear where
   * purchases appear?**
   *
   * `PROCUREMENT_DELIVERY_DELAY_TICKS` is 100 -- five seconds at the kernel's
   * 50 ms step (`src/content/procurement-catalog.ts`, which says so) -- so a
   * just-in-time delivery is in flight for five seconds and then is not. The
   * Build panel's *On the way* block is the surface that names bought-and-not-
   * arrived material, it is refreshed only while the Build tab is open
   * (`src/main.ts:1832`), and `paintDeliveries` hides it when there is nothing
   * (`src/ui/hud/build-panel.ts:1394`).
   *
   * Every coarse sample in run A read `not laid out`, which is suggestive and
   * not a measurement: the window is five seconds and the samples were three
   * apart. This polls it four times a second across the whole window, starting
   * from the press, so the answer is a fact rather than an inference.
   */
  {
    const started = Date.now();
    const seen = new Set<string>();
    while (Date.now() - started < 12_000) {
      const text = (await panelText(page, '.hud-build__deliveries')).replace(/\n+/g, ' | ');
      if (!seen.has(text)) {
        seen.add(text);
        log(act, `  ON THE WAY at t+${Date.now() - started}ms (tick ${await currentTick(page)}): ${JSON.stringify(text)}`);
      }
      await page.waitForTimeout(250);
    }
    log(act, `ON THE WAY block showed ${seen.size} distinct state(s) across the 12 s after the press: ${JSON.stringify([...seen])}`);
  }

  await observe(page, act, `one wall run of ${northSegments} placed, no Buy ever pressed`);

  log(act, 'watching the queue until it empties -- ONE wall run only');
  const act1Samples = await watchQueue(page, act, 'act1', 180_000);
  const act1Last = act1Samples[act1Samples.length - 1];
  log(act, `ACT 1 RESULT: ${northSegments} segment(s); queue reached ${JSON.stringify(act1Last?.queue)} at t+${act1Last?.ms}ms, tick ${act1Last?.tick}, treasury ${act1Last?.treasury}`);
  await observe(page, act, 'act 1 finished');

  // --- Act 2: play past the wall. -------------------------------------------
  const act2 = 'A2';
  await tab(page, 'build').click();
  await armBuildable(page, 'wall-brick');
  let perimeter = northSegments;
  for (const run of [
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    perimeter += await wallRun(page, act2, origin, run.name, run.a, run.b);
  }
  log(act2, `perimeter now ${perimeter} segment(s) ordered in total`);
  await observe(page, act2, 'three more runs placed');
  const act2Samples = await watchQueue(page, act2, 'perimeter', 240_000);
  log(act2, `perimeter queue settled at ${JSON.stringify(act2Samples[act2Samples.length - 1])}`);

  // Zone it. Retried, because the Rooms panel's enclosure verdict is read off a
  // world view a snapshot replaces and a completed wall does not mark dirty
  // (2026-08-29-playtest-ordering-and-the-second-room.md §7). The count of
  // attempts is itself a measurement, so it is printed rather than hidden.
  const zoneStarted = Date.now();
  let attempts = 0;
  let zoned = false;
  for (; attempts < 12 && !zoned; ) {
    attempts += 1;
    let note = '(the panel was never read)';
    try {
      await tab(page, 'rooms').click();
      if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
        await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      }
      await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
      // The arm control toggles, so a previous attempt can have left it armed
      // and a blind click would disarm it. Read the label rather than assume.
      const armLabel = (await page.locator('.hud-rooms__arm').innerText()).trim().toLowerCase();
      if (!armLabel.startsWith('stop')) await page.locator('.hud-rooms__arm').click();
      await drag(page, centreOf(origin, AREA.x0, AREA.y0), centreOf(origin, AREA.x1, AREA.y1));
      note = await panelText(page, '.hud-rooms');
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(900);
    } catch (error) {
      log(act2, `designate attempt ${attempts} THREW: ${String(error).split('\n')[0]}`);
    }
    const counts = await latestCounts(page);
    log(act2, `designate attempt ${attempts} at t+${Date.now() - zoneStarted}ms: rooms=${counts?.rooms} | panel said ${JSON.stringify(note.split('\n').filter((l) => /OPEN|ENCLOS/i.test(l)))} | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    zoned = (counts?.rooms ?? 0) > 0;
    if (!zoned) await page.waitForTimeout(3000);
  }
  log(act2, `ZONING: ${zoned ? 'accepted' : 'NEVER ACCEPTED'} after ${attempts} attempt(s), ${Date.now() - zoneStarted}ms`);
  await observe(page, act2, 'after zoning');

  // A bed and a toilet, inside, with no Buy press.
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  const treasuryBeforeBed = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  const bedPoint = centreOf(origin, AREA.x0 + 1, AREA.y0 + 1);
  const bedCommands = await press(page, bedPoint.x, bedPoint.y);
  const treasuryAfterBed = await settledTreasury(page, act2, treasuryBeforeBed);
  log(act2, `bed press produced ${bedCommands.length} command(s): ${JSON.stringify(bedCommands.map((c) => c['type']))}`);
  log(act2, `TREASURY AT THE BED PRESS: ${treasuryBeforeBed} -> ${treasuryAfterBed} (delta ${treasuryAfterBed - treasuryBeforeBed})`);
  await observe(page, act2, 'one bed ordered');

  await armBuildable(page, 'toilet-brick');
  const toiletPoint = centreOf(origin, AREA.x0, AREA.y1 - 1);
  const toiletCommands = await press(page, toiletPoint.x, toiletPoint.y);
  log(act2, `toilet press produced ${toiletCommands.length} command(s): ${JSON.stringify(toiletCommands.map((c) => c['type']))}`);

  const furnitureSamples = await watchQueue(page, act2, 'furniture', 180_000);
  log(act2, `furniture queue settled at ${JSON.stringify(furnitureSamples[furnitureSamples.length - 1])}`);
  await observe(page, act2, 'bed and toilet queue settled');
  await tab(page, 'rooms').click();
  log(act2, `rooms panel: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

  // Admit. One press, then a second, so the second's outcome is on the record.
  await tab(page, 'overview').click();
  for (let index = 0; index < 2; index += 1) {
    const started = Date.now();
    await page.locator('.hud-intake__admit').click();
    log(act2, `admit press ${index + 1} took ${Date.now() - started}ms; disabled now = ${await page.locator('.hud-intake__admit').getAttribute('disabled')}`);
    await page.waitForTimeout(1200);
  }
  await observe(page, act2, 'two admissions');
  log(act2, `intake panel: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

  // Hire a guard.
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  log(act2, `hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
  const treasuryBeforeHire = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  await page.locator('.hud-staff__hire').click();
  await page.waitForTimeout(1500);
  const afterHire = await latestCounts(page);
  log(act2, `TREASURY AT THE HIRE: ${treasuryBeforeHire} -> ${afterHire?.treasuryMinorUnits} (delta ${(afterHire?.treasuryMinorUnits ?? 0) - treasuryBeforeHire}) staff=${afterHire?.staff} wageBill=${afterHire?.dailyWageBillMinorUnits}`);
  await observe(page, act2, 'one guard hired');
  log(act2, `staff panel: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
});

test('act 3: how much wall 25,000 buys, and what the game says when it runs out', async ({ page }) => {
  // 900 s rather than the config's 600. Run D reached the lock at +367 s -- the
  // number of drags is fixed but how long each takes is not, and the stall
  // watch below then ran past the budget and failed the test on a
  // `waitForTimeout`. The measurement was complete before it did; the failure
  // was arithmetic about the budget, not about the game.
  test.setTimeout(900_000);
  const act = 'A3';
  actStartedAt = Date.now();
  page.setDefaultTimeout(20_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  await tab(page, 'build').click();
  let origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  /*
   * **What `calibrate` leaves standing on the refusal band, printed before
   * anything else asks a question about that band.**
   *
   * `calibrate` bisects by pressing *Remove* on empty tiles, so it ends with
   * `remove-object.nothing-to-remove` on the band -- and the band does not
   * decay: run 0 of this file read *"Nothing was removed — there is no object
   * on that tile, and none being built there."* still on screen 3,600 ticks
   * later. The first version of act 3 tested `refusal.text !== ''` and would
   * therefore have "found" a funding refusal on its very first wall run.
   * The detector below matches the *sentence*, and this line is the baseline
   * it is read against.
   */
  const bandAfterCalibration = (await hudDump(page)).refusal.text;
  log(act, `refusal band after calibration (an artifact of this harness, not of play): ${JSON.stringify(bandAfterCalibration)}`);

  await pressPlay(page, act);
  await armBuildable(page, 'wall-brick');

  /*
   * **Only tiles that are actually on screen**, because a drag that leaves the
   * window is not a gesture a player can make. At 1440x900 with tile (0,0) at
   * (-304,-574) the visible tiles are columns ~5..27 and rows ~9..23, which
   * the first version of act 3 got wrong -- it dragged from tile column 2 at
   * row 4, both off screen. The bounds are computed from the measured origin
   * rather than hard-coded, so the same code is right at another viewport.
   *
   * Horizontal runs lay `north` edges and vertical runs lay `west` edges, so
   * the two families never collide and no run is refused as a duplicate. One
   * screenful of both is 22x14 + 14x22 segments, comfortably more than the
   * 312 that `floor(25,000 / 80)` predicts -- which is the point: the question
   * is whether an ordinary sustained drag gesture reaches ADR 0075's lock, and
   * a player who never moves the camera has that many drags available.
   */
  const firstColumn = Math.ceil((-origin.originX) / TILE) + 1;
  const lastColumn = Math.floor((1440 - origin.originX) / TILE) - 1;
  const firstRow = Math.ceil((-origin.originY) / TILE) + 1;
  const lastRow = Math.floor((900 - origin.originY) / TILE) - 1;
  log(act, `visible tile window: columns ${firstColumn}..${lastColumn}, rows ${firstRow}..${lastRow}`);

  /*
   * **`/not enough funds/i` until the owner's ruling 23 of 2026-08-31**, which
   * gave `hud.alert.refusal.purchase.insufficient-funds` the host's words --
   * *"Nothing was bought — that would go past what the state will carry."* --
   * and took the word "funds" out of it. Both alternatives, so this instrument
   * still reads a branch or a log from before the ruling instead of reporting
   * that the band never named money.
   */
  const FUNDS_SENTENCE = /not enough funds|past what the state will carry/i;
  let ordered = 0;
  let fundsRefusalAtSegment = -1;
  let fundsRefusalText = '';
  let treasuryBeforeTheRefusingRun = -1;
  let bounds = visibleTileWindow(origin);
  log(act, `visible tile window: columns ${bounds.firstColumn}..${bounds.lastColumn}, rows ${bounds.firstRow}..${bounds.lastRow}`);

  /*
   * **Several screenfuls, because one is not enough and that is itself the
   * measurement.** Run 1 laid 116 segments from a single screen at 1440x900 --
   * seven usable rows, the first giving 20 and the rest 16 because the HUD
   * rail covers the right of the world, and nothing at all below row 16 where
   * the panel sits. 116 x 80 is 9,280: a third of the treasury, and not the
   * lock. So issue #641's *"a single sustained drag reaches it"* is measured
   * here rather than assumed, and the camera is panned between passes with the
   * **middle button**, which the panel's own arm hint names as a camera
   * gesture (*"Two fingers, the middle button or the arrow keys still move the
   * camera"*) and which, unlike the arrow keys, does not depend on where focus
   * happens to be after a panel press.
   *
   * The origin is re-measured by `calibrate` after each pan rather than
   * predicted from the gesture, for the reason `calibrate` exists at all --
   * and `calibrate` leaves the *Remove* tool disarmed and the wall tool
   * unarmed, so the wall is re-armed after every pass.
   */
  const MAX_PASSES = 8;
  for (let pass = 0; pass < MAX_PASSES && fundsRefusalAtSegment < 0; pass += 1) {
    if (pass > 0) {
      await page.mouse.move(1000, 500);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(200, 300, { steps: 12 });
      await page.mouse.up({ button: 'middle' });
      await page.waitForTimeout(400);
      origin = await calibrate(page);
      bounds = visibleTileWindow(origin);
      await armBuildable(page, 'wall-brick');
      log(act, `pass ${pass}: panned; origin now (${origin.originX}, ${origin.originY}); window columns ${bounds.firstColumn}..${bounds.lastColumn}, rows ${bounds.firstRow}..${bounds.lastRow}`);
    }

    const runs: { kind: 'row' | 'column'; index: number }[] = [];
    for (let row = bounds.firstRow; row <= bounds.lastRow; row += 1) runs.push({ kind: 'row', index: row });
    for (let column = bounds.firstColumn; column <= bounds.lastColumn; column += 1) runs.push({ kind: 'column', index: column });

    for (const run of runs) {
      const a =
        run.kind === 'row'
          ? { x: origin.originX + bounds.firstColumn * TILE + TILE / 2, y: origin.originY + run.index * TILE }
          : { x: origin.originX + run.index * TILE, y: origin.originY + bounds.firstRow * TILE + TILE / 2 };
      const b =
        run.kind === 'row'
          ? { x: origin.originX + bounds.lastColumn * TILE - TILE / 2, y: origin.originY + run.index * TILE }
          : { x: origin.originX + run.index * TILE, y: origin.originY + bounds.lastRow * TILE - TILE / 2 };
      const before = (await sentCommands(page)).length;
      await drag(page, a, b);
      const produced = (await sentCommands(page)).slice(before).filter((command) => command['type'] === 'PlaceBuildOrder');
      const wasOrdered = ordered;
      ordered += produced.length;
      const band = await hudDump(page);
      const counts = await latestCounts(page);
      // Printed only when it did something or when the band moved, so that
      // eight passes of runs do not bury the one line that matters.
      if (produced.length > 0 || FUNDS_SENTENCE.test(band.refusal.text)) {
        log(
          act,
          `pass ${pass} ${run.kind} ${run.index}: +${produced.length} (total ${ordered}) treasury=${counts?.treasuryMinorUnits}` +
            ` predicted=${25_000 - 80 * ordered} band=${JSON.stringify(band.refusal.text)}`,
        );
      }
      if (FUNDS_SENTENCE.test(band.refusal.text) && fundsRefusalAtSegment < 0) {
        fundsRefusalAtSegment = wasOrdered + produced.length;
        fundsRefusalText = band.refusal.text;
        log(act, `THE BAND NAMED MONEY on the run that took the total to ${ordered} segments; the balance before this run was ${treasuryBeforeTheRefusingRun}`);
        await observe(page, act, 'the moment the band named money');
        break;
      }
      treasuryBeforeTheRefusingRun = counts?.treasuryMinorUnits ?? -1;
    }
  }
  const settled = await latestCounts(page);
  log(act, `ACT 3 RESULT: ${ordered} wall segments ordered; treasury=${settled?.treasuryMinorUnits}; funds refusal first seen at segment ${fundsRefusalAtSegment}`);
  log(act, `ACT 3 the sentence, verbatim: ${JSON.stringify(fundsRefusalText)}`);

  /*
   * **Does the sentence survive being left alone?** The scheduled-tick
   * procurement pass -- `src/simulation/construction/system.ts:699` -- calls
   * `procureQueuedMaterials` and *discards* the report; only the two press
   * paths (`handler.ts:75`, `session-commands.ts:508`) run it through
   * `reportMaterialsFunding`. So the prediction being tested here is that the
   * band keeps whatever the last press put on it and says nothing new,
   * however long the stalled queue sits.
   */
  const stallStarted = Date.now();
  let previousHeader = '';
  let unchangedSince = Date.now();
  for (;;) {
    const dump = await hudDump(page);
    if (dump.queue.headerText !== previousHeader) {
      previousHeader = dump.queue.headerText;
      unchangedSince = Date.now();
      log(act, `  stalling t+${Date.now() - stallStarted}ms: header=${JSON.stringify(dump.queue.headerText)} band=${JSON.stringify(dump.refusal.text)}`);
    }
    // Stop once the queue has not moved for 25 s: what is left then is what
    // the money could not buy, and nothing but the player can change it.
    if (Date.now() - unchangedSince > 25_000) break;
    if (Date.now() - stallStarted > 150_000) {
      log(act, `  the queue was still moving after 150 s -- stopping the watch, not the queue`);
      break;
    }
    await page.waitForTimeout(2000);
  }
  const afterWaiting = await hudDump(page);
  log(act, `THE QUEUE STOPPED MOVING after ${Date.now() - stallStarted}ms: header=${JSON.stringify(afterWaiting.queue.headerText)} band=${JSON.stringify(afterWaiting.refusal.text)}`);
  log(act, `does the band still name money with nothing pressed since? ${String(FUNDS_SENTENCE.test(afterWaiting.refusal.text))}`);
  await observe(page, act, 'the queue has stopped moving, nothing pressed');

  /*
   * The Build panel unfolded, which is the one place `#627`'s work could still
   * reach a player: `BuildQueueViewModel.materialsFunding` is on the wire.
   * Whether it is on the *screen* is what this prints.
   */
  await tab(page, 'build').click();
  if ((await page.locator('.hud-build__queue').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-build__queue > .ui-section__header').click();
    await page.waitForTimeout(500);
  }
  log(act, `Queued fold OPENED: ${JSON.stringify((await panelText(page, '.hud-build__queue')).replace(/\n+/g, ' | '))}`);
  const opened = await hudDump(page);
  log(act, `with the fold open, does anything visible name money? /fund|afford|money|short|cannot pay/i = ${String(/fund|afford|money|short|cannot pay/i.test(opened.visibleText))}`);
  log(act, `VISIBLE HUD TEXT with the Queued fold open:\n${opened.visibleText.split('\n').map((l) => `      ${l}`).join('\n')}`);

  /*
   * **The projection's own answer is not readable from here, and that is worth
   * saying rather than faking.** `installTee` drops `simulation/projection`
   * messages so the tee array cannot grow without bound, so `materialsFunding`
   * cannot be read off the wire by this file. What it *can* establish is the
   * static half, which needs no run: `buildQueueFromProjection`
   * (`src/ui/simulation-build-queue.ts:91-103`) maps `orderId`, `tile`, `edge`,
   * `state` and the two counts into `HudBuildQueueViewModel`, and that
   * interface (`src/ui/hud/view-model.ts:448-463`) has exactly three members --
   * `total`, `started`, `orders`. There is no `materialsFunding` on it, so the
   * Build panel is not given the field and cannot render it. The line above is
   * the measurement of the consequence.
   */
});

/**
 * **The control, and the only place in this file that presses *Buy*.**
 *
 * Act 1 measured that the Build panel's *On the way* block reads `not laid
 * out` for the whole twelve seconds after a wall run, sampled four times a
 * second, while a just-in-time delivery is demonstrably in flight -- six
 * purchases of two `item.brick`, each arriving `PROCUREMENT_DELIVERY_DELAY_TICKS`
 * = 100 ticks later.
 *
 * That measurement has two possible readings and reading the code cannot
 * separate them, because `projectPendingDeliveries`
 * (`src/simulation/presentation/procurement-projection.ts:138-152`) maps every
 * entry of `ProcurementSystem.pendingDeliveries` with no filter on who bought
 * it: either the block does not show a purchase *the game made*, or the block
 * does not show a purchase *at all* and act 1 found a defect that has nothing
 * to do with #627.
 *
 * So this act buys ten bricks through the procurement fold, the way a player
 * who found it would, and runs the identical probe. It is deliberately the
 * last test in the file and it is deliberately named a control, so that
 * nothing above it is read as having pressed Buy.
 */
test('control: the same probe, against a purchase the player pressed Buy for', async ({ page }) => {
  test.setTimeout(600_000);
  const act = 'C1';
  actStartedAt = Date.now();
  page.setDefaultTimeout(20_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  await tab(page, 'build').click();
  await pressPlay(page, act);

  const before = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill('10');
  log(act, `the Buy control reads: ${JSON.stringify((await page.locator('.hud-build__buy-submit').innerText()).trim())}`);
  await page.locator('.hud-build__buy-submit').click();
  const after = await settledTreasury(page, act, before);
  log(act, `TREASURY AT THE BUY PRESS: ${before} -> ${after} (delta ${after - before}) for 10 x item.brick`);

  const started = Date.now();
  const seen = new Set<string>();
  while (Date.now() - started < 12_000) {
    const text = (await panelText(page, '.hud-build__deliveries')).replace(/\n+/g, ' | ');
    if (!seen.has(text)) {
      seen.add(text);
      log(act, `  ON THE WAY at t+${Date.now() - started}ms (tick ${await currentTick(page)}): ${JSON.stringify(text)}`);
    }
    await page.waitForTimeout(250);
  }
  log(act, `CONTROL: the ON THE WAY block showed ${seen.size} distinct state(s) after a pressed Buy: ${JSON.stringify([...seen])}`);
  await observe(page, act, 'after a pressed Buy');

  /*
   * **The decisive half: both kinds of delivery in flight at once, with the
   * clock stopped so that neither can land while the block is being read.**
   *
   * Act 1's reading -- the block never appears for a just-in-time purchase --
   * and this act's first half -- it appears within 438 ms for a pressed one --
   * are two separate sessions, and *"the samples missed a five-second window"*
   * stays a live alternative to *"the block does not show it"* for as long as
   * there is a window to miss.
   *
   * **Pausing removes the window entirely.** ADR 0051 has every command answer
   * while the clock is stopped -- measured at length in
   * `docs/research/2026-08-30-what-the-game-never-says.md` §1, where 2,400
   * leaves the treasury for sixty bricks and *"the delivery block calls them
   * ON THE WAY"* with the clock never started. So: pause, buy ten bricks,
   * drag a six-segment wall run, and read the block with no clock running and
   * nothing able to arrive.
   *
   * The wall run wants twelve bricks; the service subtracts stock (0) and
   * everything already in flight (10, **including what the player bought**,
   * which is the whole of ADR 0017 decision 7's *"holding is permitted, never
   * required"*), so its deficit is 2 and it buys exactly 2 -- 80, not 480.
   * That delta is printed as its own check on the netting.
   *
   * The block's row count at that moment is then the answer with no timing
   * argument left in it: **two rows and act 1 was a sampling artifact; one row
   * and a just-in-time delivery is invisible while a pressed one sits beside
   * it.**
   *
   * A **fresh prison**, because the first half of this act has already spent
   * 400 and landed it, and the arithmetic below is easier to check from 25,000.
   */
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1200);
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // Pause, and say so. Index 0 of `pause / play / fast-forward`.
  await page.locator('.hud-strip__transport button').nth(0).click();
  await page.waitForTimeout(600);
  const paused = await hudDump(page);
  log(act, `clock for the decisive half: clockMode=${paused.clockMode} pressed=${JSON.stringify(paused.transport.map((t) => t.pressed))}`);

  const beforeBoth = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const buyRowAgain = page.locator('.hud-build__buy');
  if (await buyRowAgain.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill('10');
  await page.locator('.hud-build__buy-submit').click();
  const afterBuy = await settledTreasury(page, act, beforeBoth);
  log(act, `Buy 10 bricks with the clock stopped: ${beforeBoth} -> ${afterBuy} (delta ${afterBuy - beforeBoth})`);
  log(act, `  block with only the pressed purchase in flight: ${JSON.stringify((await panelText(page, '.hud-build__deliveries')).replace(/\n+/g, ' | '))}`);

  await armBuildable(page, 'wall-brick');
  const wallStart = { x: origin.originX + 12 * TILE + TILE / 2, y: origin.originY + 12 * TILE };
  const wallEnd = { x: origin.originX + 18 * TILE - TILE / 2, y: origin.originY + 12 * TILE };
  const beforeDrag = (await sentCommands(page)).length;
  await drag(page, wallStart, wallEnd);
  const placed = (await sentCommands(page)).slice(beforeDrag).filter((command) => command['type'] === 'PlaceBuildOrder');
  const afterDrag = await settledTreasury(page, act, afterBuy);
  log(act, `wall run of ${placed.length} segments OVER 10 bricks already in flight: ${afterBuy} -> ${afterDrag} (delta ${afterDrag - afterBuy})`);
  log(act, `  480 would mean it bought all 12 bricks; 80 means it netted off the 10 in flight and bought 2`);

  const bothSeen = new Set<string>();
  const bothStarted = Date.now();
  while (Date.now() - bothStarted < 6000) {
    const text = (await panelText(page, '.hud-build__deliveries')).replace(/\n+/g, ' | ');
    if (!bothSeen.has(text)) {
      bothSeen.add(text);
      log(act, `  BOTH IN FLIGHT, CLOCK STOPPED, at t+${Date.now() - bothStarted}ms (tick ${await currentTick(page)}): ${JSON.stringify(text)}`);
    }
    await page.waitForTimeout(300);
  }
  log(act, `queue with the clock stopped: ${JSON.stringify((await panelText(page, '.hud-build__queue')).replace(/\n+/g, ' | '))}`);
  log(act, `DECISIVE: states seen while a pressed delivery and a just-in-time delivery were both in flight: ${JSON.stringify([...bothSeen])}`);
});
