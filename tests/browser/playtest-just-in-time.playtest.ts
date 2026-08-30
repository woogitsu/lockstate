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

const log = (act: string, line: string) => console.log(`[${act}] ${line}`);

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
    const treasury = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
    const key = `${queue}::${deliveries}::${treasury}`;
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
    if (/0 waiting . 0 being built/.test(queue) || queue.includes('not laid out') || queue.includes('ABSENT')) return samples;
    if (Date.now() - started > timeoutMs) {
      log(act, `  ${label} GAVE UP after ${Date.now() - started}ms, queue still ${JSON.stringify(queue)}`);
      return samples;
    }
    await page.waitForTimeout(500);
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
  const treasuryAfterWall = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  log(act, `TREASURY AT THE PRESS: ${treasuryBeforeWall} -> ${treasuryAfterWall} (delta ${treasuryAfterWall - treasuryBeforeWall}) for ${northSegments} wall segment(s)`);
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
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, AREA.x0, AREA.y0), centreOf(origin, AREA.x1, AREA.y1));
    const note = await panelText(page, '.hud-rooms');
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(900);
    const counts = await latestCounts(page);
    log(act2, `designate attempt ${attempts} at t+${Date.now() - zoneStarted}ms: rooms=${counts?.rooms} | panel said ${JSON.stringify(note.split('\n').filter((l) => /OPEN|ENCLOS/i.test(l)))} | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    zoned = (counts?.rooms ?? 0) > 0;
    if (!zoned) await page.waitForTimeout(4000);
  }
  log(act2, `ZONING: ${zoned ? 'accepted' : 'NEVER ACCEPTED'} after ${attempts} attempt(s), ${Date.now() - zoneStarted}ms`);
  await observe(page, act2, 'after zoning');

  // A bed and a toilet, inside, with no Buy press.
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  const treasuryBeforeBed = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  const bedPoint = centreOf(origin, AREA.x0 + 1, AREA.y0 + 1);
  const bedCommands = await press(page, bedPoint.x, bedPoint.y);
  const treasuryAfterBed = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
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
  test.setTimeout(600_000);
  const act = 'A3';
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  await tab(page, 'build').click();
  const origin = await calibrate(page);
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

  const FUNDS_SENTENCE = /not enough funds/i;
  let ordered = 0;
  let fundsRefusalAtSegment = -1;
  let fundsRefusalText = '';
  let lastAffordableTreasury = -1;
  const runs: { kind: 'row' | 'column'; index: number }[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) runs.push({ kind: 'row', index: row });
  for (let column = firstColumn; column <= lastColumn; column += 1) runs.push({ kind: 'column', index: column });

  for (const run of runs) {
    const a =
      run.kind === 'row'
        ? { x: origin.originX + firstColumn * TILE + TILE / 2, y: origin.originY + run.index * TILE }
        : { x: origin.originX + run.index * TILE, y: origin.originY + firstRow * TILE + TILE / 2 };
    const b =
      run.kind === 'row'
        ? { x: origin.originX + lastColumn * TILE - TILE / 2, y: origin.originY + run.index * TILE }
        : { x: origin.originX + run.index * TILE, y: origin.originY + lastRow * TILE - TILE / 2 };
    const before = (await sentCommands(page)).length;
    await drag(page, a, b);
    const produced = (await sentCommands(page)).slice(before).filter((command) => command['type'] === 'PlaceBuildOrder');
    ordered += produced.length;
    const counts = await latestCounts(page);
    const band = await hudDump(page);
    log(
      act,
      `${run.kind} ${run.index}: +${produced.length} segments (total ${ordered}) treasury=${counts?.treasuryMinorUnits}` +
        ` band=${JSON.stringify(band.refusal.text)}`,
    );
    if (FUNDS_SENTENCE.test(band.refusal.text) && fundsRefusalAtSegment < 0) {
      fundsRefusalAtSegment = ordered;
      fundsRefusalText = band.refusal.text;
      log(act, `THE BAND NAMED MONEY after ${ordered} segments ordered; treasury was ${lastAffordableTreasury} before this run`);
      await observe(page, act, 'the moment the band named money');
      break;
    }
    lastAffordableTreasury = counts?.treasuryMinorUnits ?? -1;
    if (produced.length === 0) {
      log(act, `${run.kind} ${run.index} produced NO orders -- stopping; band ${JSON.stringify(band.refusal.text)}`);
      break;
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
  await page.waitForTimeout(20_000);
  const afterWaiting = await hudDump(page);
  log(act, `after 20 s of the queue sitting stalled: band=${JSON.stringify(afterWaiting.refusal.text)} queueHeader=${JSON.stringify(afterWaiting.queue.headerText)} collapsed=${afterWaiting.queue.collapsed}`);
  await observe(page, act, 'twenty seconds later, nothing pressed');

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
