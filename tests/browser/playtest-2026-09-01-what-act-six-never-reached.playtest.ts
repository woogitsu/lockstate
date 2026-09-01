import { expect, type Page, test } from '@playwright/test';
import {
  dwellOf,
  expectNeverPainted,
  framesShowing,
  installBandRecorder,
  readBandRecording,
  writesOf,
} from './alert-dwell';
import {
  TILE,
  armBuildable,
  buildAndPopulate,
  buy,
  calibrate,
  centreOf,
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
 * **Everything act 6 of `docs/research/2026-09-01-playing-after-the-rulings.md`
 * named as unreached, in the order the owner listed it: escapes, `Undo` and
 * `Cancel` on a queued build order, deliveries and refunds, a prison past
 * in-game day 7, and the keyboard entirely.**
 *
 * An *instrument*, not a gate. `tests/browser/playwright.config.ts` collects
 * `*.spec.ts`; this file is `*.playtest.ts` and only
 * `tests/browser/playwright.playtest.config.ts` collects it, so nothing in CI
 * runs it. Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5311 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-01-what-act-six-never-reached.playtest.ts -g "act 1" --reporter=line
 * ```
 *
 * The findings live in `docs/research/2026-09-01-what-act-six-never-reached.md`.
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/** Every sentence currently in the alerts log, in order, newest first. */
async function alertLines(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-alerts__list .ui-row')].map((row) =>
      (row.textContent ?? '').trim(),
    ),
  );
}

/**
 * Every `simulation/event` the worker tee has seen so far, tick and type only.
 *
 * `installTee` (`playtest-harness.ts`) keeps every message except
 * `simulation/delta|snapshot|projection`, so `simulation/event` is already in
 * `window.lockstateFromWorker` -- this just reads it back rather than adding a
 * second tee. Kept local to this file rather than folded into the shared
 * harness, so this pass touches one file under `tests/browser/` and not two.
 */
async function workerEvents(page: Page): Promise<readonly { tick: number; type: string }[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/event')
      .map((message) => {
        const payload = (message as { payload: { tick: number; event: { type: string } } }).payload;
        return { tick: payload.tick, type: payload.event.type };
      }),
  );
}

const play = async (page: Page): Promise<void> => {
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(200);
};
const pause = async (page: Page): Promise<void> => {
  await page.locator('.hud-strip__transport button').nth(0).click();
  await page.waitForTimeout(200);
};
const fastForwardToMax = async (page: Page): Promise<void> => {
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);
};

/** The Queued fold's laid-out rows: what a player is offered to cancel, in order. */
async function queueRows(page: Page): Promise<readonly { label: string; state: string; order: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => ({
        label: (row.querySelector<HTMLElement>('.hud-build__queue-label')?.textContent ?? '').trim(),
        state: row.dataset['state'] ?? '',
        order: row.dataset['order'] ?? '',
      })),
  );
}

/** The pending-deliveries block's laid-out rows: what a player is offered to cancel, before it lands. */
async function deliveryRows(page: Page): Promise<readonly { label: string; delivery: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__delivery-row')]
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => ({
        label: (row.querySelector<HTMLElement>('.hud-build__delivery-label')?.textContent ?? '').trim(),
        delivery: row.dataset['delivery'] ?? '',
      })),
  );
}

async function openQueueFold(page: Page): Promise<void> {
  await tab(page, 'build').click();
  const wasCollapsed = (await page.locator('.hud-build__queue').getAttribute('data-collapsed')) === 'true';
  if (wasCollapsed) {
    await page.locator('.hud-build__queue > .ui-section__header').click();
    await page.waitForTimeout(300);
  }
}

async function treasury(page: Page): Promise<number | undefined> {
  return (await latestCounts(page))?.treasuryMinorUnits;
}

/* ==================================================================== */
/* Act 1 -- escapes, measured with the alert-dwell instrument           */
/* ==================================================================== */

/**
 * Every three-in-a-row: the neglect recipe `docs/research/2026-08-31-playing-
 * the-nine-changes.md` §2a used and measured a real escape from -- one 6x6
 * cell, **two** beds, **fourteen** prisoners, **zero** guards, run at x4 -- and
 * `tests/browser/alert-dwell.ts`, which has so far only watched synthetic view
 * models delivered through the isolated UI harness
 * (`tests/browser/ui-escape-sentence-survival.spec.ts`). Nobody has pointed it
 * at a real `IncidentResponseSystem` lapsing a real escape on the assembled
 * page. This does.
 *
 * The recorder is installed **well before** the tick that recipe measured the
 * first escape at (48,001 there), because there is no way to recover a frame
 * that already went by -- the whole reason #700 was invisible to every poll a
 * playtest had tried before this instrument existed.
 */
test('act 1: a neglected prison loses somebody, and what the band does about it (#700, #704 ruling 6)', async ({
  page,
}) => {
  const act = 'act1';
  test.setTimeout(1_800_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await buildAndPopulate(page, { beds: 2, admits: 14, guards: 0, label: act });
  const built = await latestCounts(page);
  log(act, `after the build: ${JSON.stringify(built)}`);
  log(act, `strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await play(page);
  await fastForwardToMax(page);

  // Run to a safe distance short of where the recipe's own run saw the second
  // classification-review boundary (48,000-ish) and the first escape attempt
  // 2 ticks after it, then arm the recorder and keep going through the window
  // rather than polling for the event and installing after the fact.
  const RUN_TO_BEFORE_ARMING = 40_000;
  const started = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= RUN_TO_BEFORE_ARMING) break;
    if (Date.now() - started > 900_000) throw new Error(`stuck approaching the arming point, at tick ${tick}`);
    await page.waitForTimeout(500);
  }
  log(act, `reached tick ${await currentTick(page)} -- arming the recorder now, ahead of the predicted window`);
  await installBandRecorder(page, '.hud__event');

  // Keep going until an escape has actually succeeded, or a generous ceiling.
  const RUN_CEILING_TICKS = 90_000;
  let sawEscapeAttempt = -1;
  let sawEscapeSucceeded = -1;
  const hunted = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    const events = await workerEvents(page);
    const attempt = events.find((e) => e.type === 'incidents.escape-attempt-opened');
    const succeeded = events.find((e) => e.type === 'incidents.escape-succeeded');
    if (attempt !== undefined && sawEscapeAttempt === -1) {
      sawEscapeAttempt = attempt.tick;
      log(act, `escape attempt opened at tick ${attempt.tick} (caught at page tick ${tick})`);
    }
    if (succeeded !== undefined) {
      sawEscapeSucceeded = succeeded.tick;
      log(act, `escape succeeded at tick ${succeeded.tick}`);
      // Let a few more seconds of real play run past it, so the recorder also
      // catches whatever event (if any) replaces the sentence next.
      await page.waitForTimeout(4000);
      break;
    }
    if (tick >= RUN_CEILING_TICKS) {
      log(act, `NO ESCAPE by tick ${tick} -- the recipe did not reproduce in this run`);
      break;
    }
    if (Date.now() - hunted > 1_200_000) throw new Error(`stuck hunting for the escape, at tick ${tick}`);
    await page.waitForTimeout(300);
  }

  const recording = await readBandRecording(page);
  log(
    act,
    `recording: ${recording.frameCount} frames over ${Math.round(recording.stoppedAt - recording.startedAt)}ms, ` +
      `${recording.writes.length} writes, ${recording.spans.length} spans`,
  );
  log(act, `every span the band held, in order: ${JSON.stringify(recording.spans.map((s) => `${s.frames}f "${s.text}"`))}`);

  const allEvents = (await workerEvents(page)).filter((e) => e.tick >= RUN_TO_BEFORE_ARMING - 100);
  log(act, `every worker event from tick ${RUN_TO_BEFORE_ARMING - 100} on: ${JSON.stringify(allEvents)}`);
  log(act, `alerts log at the end: ${JSON.stringify(await alertLines(page))}`);
  log(act, `final counts: ${JSON.stringify(await latestCounts(page))}`);

  if (sawEscapeSucceeded === -1) {
    log(act, `no escape to measure dwell on -- the recording above is the whole finding for this run`);
    return;
  }

  // Read the escape sentence off the production catalogue rather than writing
  // it down, so a locale edit cannot make this assertion silently pass on the
  // wrong text.
  const escapeText = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('.hud-alerts__list .ui-row')];
    const row = rows.find((r) => /broke out/i.test(r.textContent ?? ''));
    return row === null || row === undefined ? undefined : (row.textContent ?? '').trim();
  });
  log(act, `the escape sentence, off the assembled page's own alerts log: ${JSON.stringify(escapeText)}`);

  if (escapeText === undefined) {
    log(act, `the escape sentence never reached the alerts log at all -- see the writes/spans above for what did`);
    return;
  }
  const escapeCore = escapeText.replace(/(Warning|Danger|Info)$/, '');
  const writes = writesOf(recording, escapeCore);
  const frames = framesShowing(recording, escapeCore);
  const dwell = dwellOf(recording, escapeCore);
  log(act, `the escape sentence in the band: written ${writes} time(s), reached ${frames} frame(s), dwelt ${Math.round(dwell)}ms`);
  if (writes > 0 && frames === 0) {
    log(act, `#700's SHAPE EXACTLY: written and never painted, on a real escape, on the assembled page`);
  }
});

/* ==================================================================== */
/* Act 2 -- Undo, and Cancel on a queued build order                    */
/* ==================================================================== */

test('act 2: Undo and Cancel on a queued build order -- what comes back, and whether it is money or material', async ({
  page,
}) => {
  const act = 'act2';
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);

  // Materials up front, and let them actually land (clock at x1, one delivery,
  // ~5s -- PROCUREMENT_DELIVERY_DELAY_TICKS is 100), so the four orders below
  // queue against stock already in the yard rather than against a fresh
  // just-in-time purchase, and Cancel/Undo's refund is unambiguously about
  // *this* order's allocation.
  await buy(page, 'wall-brick', 40);
  await play(page);
  await page.waitForTimeout(6000);
  await pause(page);
  const afterDelivery = await latestCounts(page);
  log(act, `after buying 40 bricks and letting the delivery land: treasury=${afterDelivery?.treasuryMinorUnits}`);

  // Four single-segment walls, each its own press and therefore (per
  // `src/main.ts`'s `transactionId = build-${crypto.randomUUID()}` minted once
  // per PlaceBuildOrder intent) its own undo transaction.
  await armBuildable(page, 'wall-brick');
  const tiles = [
    { x: 12, y: 12 },
    { x: 13, y: 12 },
    { x: 14, y: 12 },
    { x: 15, y: 12 },
  ];
  for (const t of tiles) {
    const at = centreOf(origin, t.x, t.y);
    const commands = await press(page, at.x, at.y - TILE / 2 + 1);
    log(act, `placed ${t.x},${t.y}: ${JSON.stringify(commands)}`);
  }

  await openQueueFold(page);
  const before = await queueRows(page);
  const totalQueued = await page.locator('.hud-build').getAttribute('data-queued');
  const treasuryBefore = await treasury(page);
  log(act, `queue before anything is cancelled: ${JSON.stringify(before)} (panel data-queued=${totalQueued})`);
  log(act, `treasury before: ${treasuryBefore}`);
  // BUILD_QUEUE_ROW_LIMIT caps the fold at 3 rows (build-panel.ts) even though
  // all 4 orders are really queued -- the fourth exists only in data-queued.
  expect(totalQueued, 'expected all four segments really queued, even though the fold shows 3').toBe('4');
  expect(before.length, 'the fold is capped at BUILD_QUEUE_ROW_LIMIT').toBe(3);

  // Cancel the SECOND row -- not the head and not the tail, so a reader cannot
  // mistake "the row Undo would have taken anyway" for what this control did.
  const target = before[1]!;
  log(act, `pressing Cancel on row 1 (0-indexed): ${JSON.stringify(target)}`);
  await page.locator(`.hud-build__queue-row[data-order="${target.order}"] button`).click();
  await page.waitForTimeout(500);
  const afterCancel = await queueRows(page);
  const treasuryAfterCancel = await treasury(page);
  const bandAfterCancel = await panelText(page, '.hud__refusal').catch(() => 'ABSENT');
  log(act, `queue after Cancel: ${JSON.stringify(afterCancel)}`);
  log(act, `treasury after Cancel: ${treasuryAfterCancel} (before was ${treasuryBefore})`);
  log(act, `any band under a control: ${JSON.stringify(bandAfterCancel)}`);
  log(act, `alerts after Cancel: ${JSON.stringify(await alertLines(page))}`);

  // Undo -- LIFO over the transaction stack, so this should take back the
  // LAST-placed segment (15,12), which Cancel above did not touch.
  await page.keyboard.press('z');
  await page.waitForTimeout(500);
  const afterUndo = await queueRows(page);
  const treasuryAfterUndo = await treasury(page);
  log(act, `queue after Undo (KeyZ): ${JSON.stringify(afterUndo)}`);
  log(act, `treasury after Undo: ${treasuryAfterUndo}`);
  log(act, `alerts after Undo: ${JSON.stringify(await alertLines(page))}`);

  const remaining = new Set(afterUndo.map((r) => r.order));
  const cancelledSurvived = remaining.has(target.order);
  const lastSegmentGone = !afterUndo.some((r) => r.label.includes('15, 12'));
  log(
    act,
    `did Cancel's target come back via Undo? ${String(cancelledSurvived)} (it should not -- cancelOrder marks it ` +
      `'cancelled', and undo()'s own isCancellable guard skips a row already in that state). ` +
      `Did Undo take the last-placed segment (15,12) rather than any other? ${String(lastSegmentGone)}`,
  );

  log(
    act,
    `MONEY CONSERVATION: treasury moved by ${(treasuryAfterUndo ?? 0) - (treasuryBefore ?? 0)} across one Cancel ` +
      `and one Undo, both of which released only materialsAllocated back to the store ` +
      `(ConstructionSystem.cancelOrder, src/simulation/construction/system.ts:609-612) -- if this is 0, neither ` +
      `control put money back, which is #733's target for changing`,
  );

  // Now redo, twice, and see what comes back and in which order.
  await page.keyboard.press('y');
  await page.waitForTimeout(400);
  await page.keyboard.press('y');
  await page.waitForTimeout(400);
  log(act, `queue after two Redo (KeyY) presses: ${JSON.stringify(await queueRows(page))}`);
  log(act, `treasury after redo: ${await treasury(page)}`);
});

/* ==================================================================== */
/* Act 3 -- deliveries and refunds                                      */
/* ==================================================================== */

test('act 3: buying, a delivery landing, and cancelling one mid-flight -- counting the money', async ({ page }) => {
  const act = 'act3';
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  // Confirmed by reading the source before this act was written, and stated
  // here rather than only in the record: nothing under `src/rendering/`
  // mentions "delivery" or "procurement" at all. "Watch the lorry" is
  // figurative -- the only place a delivery exists is this panel's text and
  // countdown, never a sprite in the world. `deliveryRows` below is therefore
  // the whole of what there is to watch.
  log(act, `rendering/scene/world-scene references to delivery|procurement: 0 (grep -rln, read before this act ran)`);

  const t0 = await treasury(page);
  log(act, `treasury on arrival: ${t0}`);

  await buy(page, 'wall-brick', 50); // 50 x 40 = 2,000
  await page.waitForTimeout(300);
  const afterBuy1 = await treasury(page);
  const rows1 = await deliveryRows(page);
  log(act, `bought 50 bricks (2,000): treasury ${t0} -> ${afterBuy1}; delivery row(s): ${JSON.stringify(rows1)}`);
  expect(rows1.length, 'a purchase should produce a pending-delivery row').toBeGreaterThan(0);

  // Watch it land -- PROCUREMENT_DELIVERY_DELAY_TICKS is 100, 5s at x1.
  await play(page);
  const landStarted = Date.now();
  let landedAt = -1;
  while (Date.now() - landStarted < 15_000) {
    const rows = await deliveryRows(page);
    if (!rows.some((r) => r.delivery === rows1[0]!.delivery)) {
      landedAt = Date.now() - landStarted;
      break;
    }
    await page.waitForTimeout(200);
  }
  await pause(page);
  log(act, `first delivery's row left the panel after ${landedAt}ms of x1 play (rows now: ${JSON.stringify(await deliveryRows(page))})`);
  log(act, `treasury after it landed: ${await treasury(page)} (should be unchanged from ${afterBuy1} -- landing spends nothing further)`);

  // Buy again, and this time cancel it before the 5s window closes.
  const beforeBuy2 = await treasury(page);
  await buy(page, 'wall-brick', 30); // 30 x 40 = 1,200
  const afterBuy2 = await treasury(page);
  const rows2 = await deliveryRows(page);
  log(act, `bought 30 more bricks (1,200): treasury ${beforeBuy2} -> ${afterBuy2}; delivery row(s): ${JSON.stringify(rows2)}`);
  const pending = rows2.find((r) => r.label.includes('30'));
  expect(pending, `expected a pending-delivery row naming 30: ${JSON.stringify(rows2)}`).toBeDefined();

  log(act, `tick right after buying the 30 bricks, clock still paused: ${await currentTick(page)}`);
  await play(page);
  log(act, `tick right after Play (before the cancel click): ${await currentTick(page)}`);
  // Cancel immediately -- well inside the 5s/100-tick window.
  const cancelLocator = page.locator(`.hud-build__delivery-row[data-delivery="${pending!.delivery}"] button`);
  log(act, `cancel button locator count: ${await cancelLocator.count()}; text: ${JSON.stringify(await cancelLocator.allTextContents())}`);
  const beforeClickCommands = (await sentCommands(page)).length;
  const beforeClickMessages = (await page.evaluate(() => (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker?.length ?? 0));
  await cancelLocator.click();
  log(act, `tick right after the click, before the wait: ${await currentTick(page)}`);
  await page.waitForTimeout(1500);
  log(act, `tick 1500ms after the click: ${await currentTick(page)}`);
  const clickedCommands = (await sentCommands(page)).slice(beforeClickCommands);
  log(act, `commands sent by the cancel click: ${JSON.stringify(clickedCommands)}`);
  const messagesAfter = await page.evaluate(
    (from: number) =>
      ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
        .slice(from)
        .map((m) => JSON.stringify(m).slice(0, 300)),
    beforeClickMessages,
  );
  log(act, `every message from the worker since the click (${messagesAfter.length}): ${JSON.stringify(messagesAfter)}`);
  await pause(page);
  const afterCancel = await treasury(page);
  const alertsAfterCancel = await alertLines(page);
  log(act, `cancelled it mid-flight. treasury ${afterBuy2} -> ${afterCancel} (paid back should restore it to ${beforeBuy2})`);
  log(act, `alerts after cancelling a delivery: ${JSON.stringify(alertsAfterCancel)}`);
  log(act, `delivery rows after cancelling: ${JSON.stringify(await deliveryRows(page))}`);
  log(
    act,
    `MONEY CONSERVATION: expected exact refund makes treasury ${afterCancel} === ${beforeBuy2}; difference is ${
      (afterCancel ?? 0) - (beforeBuy2 ?? 0)
    }`,
  );

  // And the double-cancel case: press the same (now-gone) row's button again,
  // if Playwright can even find it, and separately try cancelling the FIRST
  // delivery a second time by re-submitting its already-consumed order id --
  // this is `cancel-purchase.not-pending`'s own route, from the panel rather
  // than from a fixture.
  const staleId = rows1[0]!.delivery;
  const before = (await sentCommands(page)).length;
  await page.evaluate((orderId: string) => {
    window.dispatchEvent(new CustomEvent('lockstate-test-noop', { detail: orderId })); // no-op marker for the log
  }, staleId);
  log(act, `(the already-landed delivery's id, for reference in the record: ${staleId} -- not re-cancelled here, since no control on screen still names it)`);
  void before;

  // Final tally.
  const finalTreasury = await treasury(page);
  log(
    act,
    `WHOLE-ACT MONEY TRACE: start ${t0} -> after 50 bricks ${afterBuy1} -> after it landed ${await treasury(page)}` +
      ` -> after 30 more ${afterBuy2} -> after cancelling those ${afterCancel} -> final ${finalTreasury}`,
  );
});

/* ==================================================================== */
/* Act 4 -- a prison run past in-game day 7                             */
/* ==================================================================== */

const DAY_TICKS = 2_400;

test('act 4: a guarded prison, run to day 15 -- what degrades that a seven-day run would not show', async ({
  page,
}) => {
  const act = 'act4';
  test.setTimeout(1_800_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  await buildAndPopulate(page, { beds: 4, admits: 12, guards: 4, label: act });
  await play(page);
  await fastForwardToMax(page);

  const heapAt: Record<string, number | null> = {};
  const readHeap = async (): Promise<number | null> =>
    page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);

  const stripWidth = async (): Promise<{ scrollWidth: number; clientWidth: number }> =>
    page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.hud-strip__metrics');
      return row === null ? { scrollWidth: -1, clientWidth: -1 } : { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth };
    });

  const report = async (dayLabel: string): Promise<void> => {
    const counts = await latestCounts(page);
    const alerts = await alertLines(page);
    const strip = await stripWidth();
    const heap = await readHeap();
    heapAt[dayLabel] = heap;
    log(act, `${dayLabel} @ tick ${counts?.tick}: ${JSON.stringify(counts)}`);
    log(act, `${dayLabel} strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    log(act, `${dayLabel} strip metrics box: scrollWidth ${strip.scrollWidth} in clientWidth ${strip.clientWidth}`);
    log(act, `${dayLabel} alerts (${alerts.length}): ${JSON.stringify(alerts)}`);
    log(act, `${dayLabel} heap: ${heap === null ? 'unavailable in this Chromium build' : `${Math.round(heap / 1_048_576)}MB`}`);
  };

  // How long, in real ms, one in-game day actually takes to run at the
  // fastest speed the player can reach -- measured three times across the
  // run, to see whether it slows down as the session accumulates state.
  const timeOneDayAt = async (fromTick: number): Promise<number> => {
    const target = fromTick + DAY_TICKS;
    const wallStart = Date.now();
    for (;;) {
      const tick = await currentTick(page);
      if (tick >= target) break;
      if (Date.now() - wallStart > 300_000) throw new Error(`a single in-game day took over 300s of wall time at tick ${tick}`);
      await page.waitForTimeout(150);
    }
    return Date.now() - wallStart;
  };

  await report('day 1');

  for (const day of [4, 7, 10, 13, 15]) {
    const target = day * DAY_TICKS + 60;
    const startTick = await currentTick(page);
    const wallMs = await timeOneDayAt(startTick > target - DAY_TICKS ? startTick : target - DAY_TICKS);
    // If startTick already passed the "one day before" mark (short first
    // stretch to day 4), timeOneDayAt above just measured whatever remained;
    // log both numbers honestly rather than pretending it was exactly 2,400.
    log(act, `reaching day ${day} (tick ${target}) took ${wallMs}ms of wall time from tick ${startTick}`);
    // Drain to the exact target if timeOneDayAt overshot or undershot.
    const drainStart = Date.now();
    for (;;) {
      const tick = await currentTick(page);
      if (tick >= target) break;
      if (Date.now() - drainStart > 300_000) throw new Error(`stuck draining to day ${day}, at tick ${tick}`);
      await page.waitForTimeout(150);
    }
    await report(`day ${day}`);
  }

  log(act, `heap across the run: ${JSON.stringify(heapAt)}`);

  // A save/load at day 15, past every boundary this repository has driven one
  // to before -- the counterpart of act 6's day-4 save in yesterday's record.
  await pause(page);
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ', { timeout: 60_000 });
  const beforeSave = await latestCounts(page);
  await installTee(page);
  await openApp(page);
  await page.locator('.save-panel__item').first().click();
  await page.waitForTimeout(8000);
  const afterLoad = await latestCounts(page);
  log(act, `save at day 15: before ${JSON.stringify(beforeSave)}`);
  log(act, `after load: ${JSON.stringify(afterLoad)}`);
  if (beforeSave !== undefined && afterLoad !== undefined) {
    const drift: string[] = [];
    for (const key of Object.keys(beforeSave) as (keyof typeof beforeSave)[]) {
      if (key === 'tick') continue;
      if (beforeSave[key] !== afterLoad[key]) drift.push(`${String(key)}: ${beforeSave[key]} -> ${afterLoad[key]}`);
    }
    log(act, `what a day-15 reload changed: ${drift.length === 0 ? 'nothing' : JSON.stringify(drift)}`);
  }
  await report('after the day-15 reload');
});

/* ==================================================================== */
/* Act 5 -- the keyboard, entirely                                      */
/* ==================================================================== */

interface FocusInfo {
  readonly tag: string;
  readonly id: string;
  readonly className: string;
  readonly role: string | null;
  readonly text: string;
  readonly tabIndex: number;
}

async function readFocus(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (el === null || el === document.body) {
      return { tag: 'BODY-OR-NONE', id: '', className: '', role: null, text: '', tabIndex: -99 };
    }
    const h = el as HTMLElement;
    return {
      tag: h.tagName,
      id: h.id,
      className: h.className,
      role: h.getAttribute('role'),
      text: (h.textContent ?? '').trim().slice(0, 40),
      tabIndex: h.tabIndex,
    };
  });
}

const focusKey = (f: FocusInfo): string => `${f.tag}#${f.id}.${f.className}[${f.role ?? ''}]"${f.text}"`;

/** Tabs forward until `predicate` matches the newly-focused element, or gives up. */
async function tabUntil(
  page: Page,
  predicate: (f: FocusInfo) => boolean,
  maxSteps: number,
): Promise<FocusInfo | undefined> {
  for (let i = 0; i < maxSteps; i += 1) {
    await page.keyboard.press('Tab');
    const f = await readFocus(page);
    if (predicate(f)) return f;
  }
  return undefined;
}

test('act 5: the keyboard, entirely -- reachability, activation, and the arrow-key/camera conflict', async ({
  page,
}) => {
  const act = 'act5';
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  // --- 5a. The tab order from a cold load, with no mouse touched at all. ---
  const path: string[] = [];
  const seen = new Map<string, number>();
  let cycleAt = -1;
  for (let i = 1; i <= 60; i += 1) {
    await page.keyboard.press('Tab');
    const f = await readFocus(page);
    const k = focusKey(f);
    path.push(k);
    if (seen.has(k) && cycleAt === -1) cycleAt = i;
    seen.set(k, i);
  }
  log(act, `60 Tab presses from a cold load, one entry per step:\n${path.map((p, i) => `  ${i + 1}: ${p}`).join('\n')}`);
  log(
    act,
    cycleAt === -1
      ? `no repeat within 60 Tab presses -- either the tab order is longer than 60 stops or focus is not cycling`
      : `the tab order repeats after ${cycleAt} steps (a closed ring, not a trap -- Tab keeps moving)`,
  );

  // --- 5b. Starting a prison with no mouse: find "New prison" and press Enter. ---
  await page.reload();
  await page.waitForSelector('.save-panel');
  const newPrisonFocus = await tabUntil(page, (f) => /new prison/i.test(f.text), 40);
  log(act, `"New prison" reachable by Tab alone? ${newPrisonFocus !== undefined ? `yes, ${JSON.stringify(newPrisonFocus)}` : 'NOT FOUND in 40 tabs'}`);
  if (newPrisonFocus !== undefined) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const day = await page.locator('.hud-clock__day').textContent().catch(() => null);
    log(act, `after Tab + Enter on "New prison": clock day reads ${JSON.stringify(day)}`);
  } else {
    // Fall back to the mouse just so the rest of the act has a prison to test
    // against -- and say so plainly, since it means 5b's own claim failed.
    await page.getByRole('button', { name: 'New prison' }).click();
    log(act, `FELL BACK TO THE MOUSE to start a prison so acts 5c-5e have something to test`);
  }
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  // --- 5c. The main tab bar: reachable, and does Enter/Space switch panels? ---
  const buildTabFocus = await tabUntil(page, (f) => f.role === 'tab' || /build/i.test(f.text), 30);
  log(act, `a HUD section tab reachable by Tab? ${buildTabFocus !== undefined ? JSON.stringify(buildTabFocus) : 'NOT FOUND in 30 tabs'}`);
  if (buildTabFocus !== undefined) {
    // Walk forward through the bar with Tab (aria-current tabs keep every
    // button in the sequence -- see tab-button.ts) until "Build" itself.
    let onBuild = /^build$/i.test(buildTabFocus.text);
    let steps = 0;
    while (!onBuild && steps < 8) {
      await page.keyboard.press('Tab');
      const f = await readFocus(page);
      onBuild = /^build$/i.test(f.text);
      steps += 1;
    }
    log(act, `reached the Build tab after ${steps} more Tab step(s) from the first tab found? ${onBuild}`);
    if (onBuild) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const active = await page.locator('.hud__tabs [data-tab="build"]').getAttribute('data-active');
      log(act, `after Enter on the Build tab, its data-active reads ${JSON.stringify(active)}`);
    }
  }

  // --- 5d. The Build catalogue: roving tabindex, arrow keys, Home/End. ---
  // A raw dump first, since the catalogue's own eyebrow ("What to build") did
  // not turn up inside the first 20 tabs when this act was drafted -- print
  // every stop rather than guessing at a predicate a second time.
  const buildTabPath: string[] = [];
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    buildTabPath.push(focusKey(await readFocus(page)));
  }
  log(act, `25 Tab presses starting from the Build tab button:\n${buildTabPath.map((p, i) => `  ${i + 1}: ${p}`).join('\n')}`);
  const reachedByTab = buildTabPath.some((p) => /wall|brick|bed|cell|toilet/i.test(p));
  log(act, `a Build catalogue row appeared anywhere in that dump? ${reachedByTab}`);

  const catalogueRowExists = (await page.locator('.hud-build__list [data-buildable]').count()) > 0;
  if (catalogueRowExists) {
    const before = await readFocus(page);
    // A single-tile probe of the world, as an instrument only: the Remove
    // tool's own RemoveObject report gives the tile under a fixed screen
    // point, which is the cheapest way to ask "did the camera move" without a
    // debug hook -- `world-scene-input.spec.ts`'s
    // `window.lockstateWorldSceneHarness` exists only on the isolated harness
    // page, not on `index.html`, so it is unavailable here.
    //
    // `.hud-build__remove` is a TOGGLE, armed once and left alone: the first
    // draft of this probe clicked it before every read and the second click
    // un-armed it, so the second reading was "nothing is armed" rather than
    // "the camera moved" -- a test bug, not a finding, caught by the second
    // reading answering `undefined` (no RemoveObject at all) instead of a
    // different tile.
    await page.locator('.hud-build__remove').click();
    const probeAt = async (): Promise<{ x: number; y: number } | undefined> => {
      const before2 = (await sentCommands(page)).length;
      await page.mouse.move(700, 300);
      await page.mouse.down({ button: 'left' });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(80);
      const produced = (await sentCommands(page)).slice(before2);
      const removal = produced.find((c) => c['type'] === 'RemoveObject');
      return removal === undefined ? undefined : { x: removal['x'] as number, y: removal['y'] as number };
    };

    const tileBefore = await probeAt();
    // Re-focus the catalogue row (arming Remove above moved DOM focus to its
    // own button) so the arrow presses below land where 5d claims they do.
    await page.locator(`.hud-build__list [data-buildable]`).first().focus();
    log(act, `catalogue row focused for the arrow-key test: ${JSON.stringify(await readFocus(page))}, was: ${JSON.stringify(before)}`);

    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowDown');
    const afterArrows = await readFocus(page);
    log(act, `after 6x ArrowDown inside the catalogue: focus is now ${JSON.stringify(afterArrows)}`);

    // Probe the same screen point again -- Remove is still armed, untouched.
    const tileAfter = await probeAt();
    log(
      act,
      `tile under screen point (700,300): before the arrow presses ${JSON.stringify(tileBefore)}, after ${JSON.stringify(tileAfter)}`,
    );
    const moved = tileBefore !== undefined && tileAfter !== undefined && (tileBefore.x !== tileAfter.x || tileBefore.y !== tileAfter.y);
    log(
      act,
      moved
        ? `THE CAMERA MOVED. ArrowDown navigating the Build catalogue's roving tabindex also panned the world camera -- ` +
            `build-panel.ts's keydown handler calls event.preventDefault() but never event.stopPropagation() ` +
            `(src/ui/hud/build-panel.ts:972-991), and WorldScene's own ArrowDown/Up/Left/Right camera bindings listen ` +
            `on window in the bubble phase with no focus check beyond isTextEntryFocused() (src/rendering/scene/` +
            `world-scene.ts:282) -- a <div tabindex> catalogue row is not a text field, so both fire on the same keypress.`
        : `the camera did not move across this probe -- either the conflict above does not reach the live page, or six ` +
            `ArrowDown presses did not accumulate enough scroll to clear one tile at this zoom; see the record's weakest claim.`,
    );

    // Home/End, and whether the roving stop actually reached the ends.
    // Re-focus a row first: the world-canvas clicks inside probeAt() move DOM
    // focus off the catalogue (onto nothing the keydown handler recognises),
    // so a Home/End pressed without doing this measures whatever control was
    // last clicked rather than the catalogue's own key handling.
    await page.locator(`.hud-build__list [data-buildable]`).nth(2).focus();
    log(act, `refocused before Home/End: ${JSON.stringify(await readFocus(page))}`);
    await page.keyboard.press('Home');
    log(act, `after Home: ${JSON.stringify(await readFocus(page))}`);
    await page.keyboard.press('End');
    log(act, `after End: ${JSON.stringify(await readFocus(page))}`);
  }

  // --- 5e. Escape, while armed, with no mouse. ---
  await tab(page, 'build').click();
  await armBuildable(page, 'wall-brick');
  const armLabelBefore = (await page.locator('.hud-build__arm').innerText()).trim();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const armLabelAfter = (await page.locator('.hud-build__arm').innerText()).trim();
  log(act, `arm label before Escape: ${JSON.stringify(armLabelBefore)}; after: ${JSON.stringify(armLabelAfter)}`);

  // --- 5f. Camera pan by WASD and arrow keys, held briefly, read the same way. ---
  await page.locator('.hud-build__remove').click();
  await page.mouse.move(700, 300);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  const wasdBefore = (await sentCommands(page)).slice(-1)[0];
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');
  await page.mouse.move(700, 300);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  const wasdAfter = (await sentCommands(page)).slice(-1)[0];
  log(act, `holding D for 600ms: tile at (700,300) went from ${JSON.stringify(wasdBefore)} to ${JSON.stringify(wasdAfter)}`);

  // --- 5g. Can a build order be placed with no mouse at all? ---
  // No binding in src/input/bindings.ts targets a world tile or confirms a
  // gesture; stated here as a code fact and then checked live: arm the wall
  // tool and press every plausible confirm key with focus in the world, with
  // no mouse click, and see whether anything reaches the worker.
  await tab(page, 'build').click();
  await armBuildable(page, 'wall-brick');
  const beforeKeys = (await sentCommands(page)).length;
  for (const key of ['Enter', 'Space', 'NumpadEnter']) await page.keyboard.press(key);
  const producedByKeys = (await sentCommands(page)).slice(beforeKeys);
  log(
    act,
    `with the wall tool armed and no mouse touched, Enter/Space/NumpadEnter produced: ${JSON.stringify(producedByKeys)} ` +
      `(src/input/bindings.ts has no binding that targets a world tile, so this is expected to be empty)`,
  );
});
