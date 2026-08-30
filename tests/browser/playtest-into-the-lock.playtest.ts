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
 * **Playing into ADR 0075's hard lock, which #640 made reachable by dragging.**
 *
 * `docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md`
 * records a closed state: cash below 65, no `item.wood-plank` in stock, and
 * nothing plank-built to reverse. Its own second case names the shape --
 * *"a positive balance on the status strip, and below the 65 that would end
 * this"* -- and until #640 no gesture could produce it, because a wall order
 * cost nothing at the press.
 *
 * `docs/research/2026-08-30-a-wall-that-buys-itself.md` §4 has already measured
 * the arithmetic (312 funded, the 313th refused, 40 left) and already refuted
 * *"a single sustained drag reaches it"* (one drag is at most 20 segments; one
 * screenful is 116; 313 took 24 drags). **This file does not re-litigate
 * either.** It asks the three questions that record left open, and it asks
 * them by playing:
 *
 * 1. **The descent.** Between 25,000 and 40 the treasury falls by 80 on every
 *    segment. Does anything on screen say so, at any balance, in any panel,
 *    before the money is gone? Act 1 samples the whole visible HUD after every
 *    single drag and greps it for a money word.
 * 2. **The lock itself.** Act 2 continues from where act 1 stops and works
 *    every escape a player has a *mouse* for: the queue rows' Cancel, `Undo`,
 *    the Remove tool on a standing wall, the procurement fold's Buy, placing a
 *    bed, and simply waiting. ADR 0075 exhausted the escapes through the
 *    command router; this exhausts the ones a player can reach.
 * 3. **Whether an ordinary ambitious build gets there.** Act 3 builds the way
 *    somebody planning a real prison would -- three wings, each a perimeter
 *    with a corridor and cell partitions, each at its own camera position --
 *    never trying to reach the lock, and then tries to furnish what it drew. It
 *    also does the thing a planner actually does and a fencer never does:
 *    changes its mind and redraws, which is where money-turned-into-bricks is
 *    either recovered or paid for twice.
 * 4. **Whether the escape depends on a control the game never mentions.** Act 4
 *    draws one run with the clock never started -- the state a new session
 *    actually arrives in -- and asks the fold what it will refund.
 *
 * ## The rules this file plays under
 *
 * - **The clock is pressed on purpose.** A new session's clock is constructed
 *   `paused` (`src/simulation/worker/state-machine.ts:216`), so every act
 *   presses Play -- transport index 1 of `pause / play / fast-forward` -- and
 *   logs the clock either side.
 * - **Print the container, not the parts** (#569's retraction). Every
 *   observation dumps the whole of `.hud`, `.ui-sr-only` stripped, so a
 *   sentence in a region this file did not think to name is still in the log.
 * - **The procurement fold is opened in exactly one place**, act 2's escape E,
 *   and it is opened by hand rather than through the harness's `buy()` so the
 *   fold's own text is printed on the way. That is not a route a player is
 *   expected to find; it is the route ADR 0075 says is refused, and the point
 *   is to watch it refused with a mouse rather than through the command router.
 *   Nothing in the descent or in act 3 touches it.
 *
 * ## Not a gate
 *
 * Nothing in CI collects `.playtest.ts`; only
 * `tests/browser/playwright.playtest.config.ts` does, and it is run by hand.
 * The console output is the deliverable. The findings live in
 * `docs/research/2026-08-30-playing-into-the-lock.md`.
 */

/**
 * Anything a player could read as the game talking about money.
 *
 * **Grepping the whole visible HUD with this is useless, and run 1 of this
 * file measured why**: `moneyWordOnScreen=true` on the very first drag of a
 * fresh session, and on every drag after it, because the status strip renders
 * the word `FUNDS` beside the balance and the Build panel renders a `Buy`
 * disclosure toggle. Both are furniture. They are on screen at second zero and
 * they are the same at 25,000 and at 40.
 *
 * So the descent measures the **difference** instead: the set of visible lines
 * at the moment the wall tool is armed is captured once, and every drag after
 * it reports only the lines that were not in that set. "What did the game
 * newly say" is a question with an answer; "does the word money appear" is
 * not.
 */
const MONEY_WORDS = /fund|afford|money|cost|price|short|pay|balance|treasur|buy|bought|purchase|spend|spent/i;

/** Every visible line, as a set, so a later dump can be diffed against it. */
const lineSet = (visibleText: string): ReadonlySet<string> =>
  new Set(visibleText.split('\n').map((line) => line.trim()).filter((line) => line !== ''));

/** The lines on screen now that were not on screen at the baseline. */
const newLines = (baseline: ReadonlySet<string>, visibleText: string): readonly string[] =>
  [...lineSet(visibleText)].filter((line) => !baseline.has(line));

/** The refusal ADR 0075 predicts, and the only sentence the descent ever produces. */
const FUNDS_SENTENCE = /not enough funds/i;

interface HudDump {
  readonly visibleText: string;
  readonly refusal: { hidden: boolean | string; text: string };
  readonly event: { present: boolean; hidden: boolean | string; severity: string | null; text: string };
  readonly queue: { present: boolean; hidden: boolean | string; collapsed: string | null; headerText: string };
  readonly deliveries: { present: boolean; hidden: boolean | string; collapsed: string | null; headerText: string };
  readonly buyFold: { present: boolean; hidden: boolean | string; toggleText: string };
  readonly shortfall: { present: boolean; hidden: boolean | string; laidOut: boolean; text: string };
  readonly fundsChip: { present: boolean; text: string; tone: string | null; badge: string | null };
  readonly stripText: string;
  readonly clockMode: string | null;
}

/**
 * The whole HUD, plus the regions this file asks questions about.
 *
 * `visibleText` walks the **live** DOM and drops any text node whose parent has
 * no client rects, so a sentence inside a shut fold is correctly absent and
 * "could a player read this without unfolding anything?" is a substring test.
 *
 * `fundsChip` is read separately, with its `data-tone` and `data-badge`,
 * because the question act 1 exists to answer is whether the one number the
 * game shows about money ever changes its *appearance* on the way down.
 * `src/ui/hud/projection.ts:437` hands the Funds descriptor `tone: undefined`
 * with the reason written out beside it, and `createStatChip.setTone` deletes
 * the attribute for `undefined` (`src/ui/primitives/stat-chip.ts:51`) -- so a
 * `null` here is that decision, observed rather than read.
 */
async function hudDump(page: import('@playwright/test').Page): Promise<HudDump> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    const laidOut = (node: Element | null): boolean => node !== null && node.getClientRects().length > 0;
    const section = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector);
      return {
        present: node !== null,
        hidden: node?.hidden ?? true,
        collapsed: node?.getAttribute('data-collapsed') ?? null,
        headerText: (node?.querySelector<HTMLElement>('.ui-section__header')?.innerText ?? '').replace(/\n+/g, ' ').trim(),
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
    const refusalNode = document.querySelector<HTMLElement>('.hud__refusal');
    const eventNode = document.querySelector<HTMLElement>('.hud__event');
    const shortfallNode = document.querySelector<HTMLElement>('.hud-build__queue-shortfall');
    const buyFoldNode = document.querySelector<HTMLElement>('.hud-build__buy');
    const buyToggleNode = document.querySelector<HTMLElement>('.hud-build__buy-toggle');
    // The Funds chip by its own `data-metric`, which the strip stamps from the
    // descriptor id (`src/ui/hud/status-strip.ts:108`), rather than by an index
    // into the row -- a metric added before it would silently re-point an index.
    const fundsNode = document.querySelector<HTMLElement>('.hud-strip [data-metric="funds"]');
    return {
      visibleText,
      refusal: { hidden: refusalNode?.hidden ?? true, text: (refusalNode?.innerText ?? '').trim() },
      event: {
        present: eventNode !== null,
        hidden: eventNode?.hidden ?? true,
        severity: eventNode?.getAttribute('data-severity') ?? null,
        text: (eventNode?.innerText ?? '').trim(),
      },
      queue: section('.hud-build__queue'),
      deliveries: section('.hud-build__deliveries'),
      buyFold: {
        present: buyFoldNode !== null,
        hidden: buyFoldNode?.hidden ?? true,
        toggleText: (buyToggleNode?.innerText ?? '').replace(/\n+/g, ' ').trim(),
      },
      shortfall: {
        present: shortfallNode !== null,
        hidden: shortfallNode?.hidden ?? true,
        laidOut: laidOut(shortfallNode),
        text: (shortfallNode?.innerText ?? '').trim(),
      },
      fundsChip: {
        present: fundsNode !== null,
        text: (fundsNode?.innerText ?? '').replace(/\n+/g, ' ').trim(),
        tone: fundsNode?.getAttribute('data-tone') ?? null,
        badge: fundsNode?.getAttribute('data-badge') ?? null,
      },
      stripText: (document.querySelector<HTMLElement>('.hud-strip')?.innerText ?? '').replace(/\n+/g, ' | ').trim(),
      clockMode: document.querySelector<HTMLElement>('.hud-strip')?.getAttribute('data-clock-mode') ?? null,
    };
  });
}

let actStartedAt = Date.now();
const log = (act: string, line: string) =>
  console.log(`[${act} +${((Date.now() - actStartedAt) / 1000).toFixed(1)}s] ${line}`);

async function observe(page: import('@playwright/test').Page, act: string, moment: string): Promise<HudDump> {
  const dump = await hudDump(page);
  const counts = await latestCounts(page);
  log(act, `--- ${moment} --- tick=${await currentTick(page)} clock=${JSON.stringify(await currentClock(page))}`);
  log(
    act,
    `  counts: treasury=${counts?.treasuryMinorUnits} rooms=${counts?.rooms} accommodation=${counts?.accommodationCapacity}` +
      ` prisoners=${counts?.prisoners} staff=${counts?.staff} wageBill=${counts?.dailyWageBillMinorUnits} unpaid=${counts?.unpaidWagesMinorUnits}`,
  );
  log(act, `  strip: ${dump.stripText}`);
  log(act, `  funds chip: ${JSON.stringify(dump.fundsChip)}`);
  log(act, `  queue fold: ${JSON.stringify(dump.queue)}`);
  log(act, `  shortfall line: ${JSON.stringify(dump.shortfall)}`);
  log(act, `  deliveries fold: ${JSON.stringify(dump.deliveries)}`);
  log(act, `  buy fold: ${JSON.stringify(dump.buyFold)}`);
  log(act, `  refusal band: hidden=${String(dump.refusal.hidden)} text=${JSON.stringify(dump.refusal.text)}`);
  log(act, `  event band: ${JSON.stringify(dump.event)}`);
  log(act, `  VISIBLE HUD TEXT:\n${dump.visibleText.split('\n').map((l) => `      ${l}`).join('\n')}`);
  return dump;
}

/**
 * The treasury, once the worker has actually published it.
 *
 * `simulation/status-counts` is skipped entirely when the payload equals the
 * last one (`statusCountsEqual`, `src/simulation/worker/status-counts.ts`), so
 * a read taken in the same hundred milliseconds as a click answers the balance
 * from before it. This polls until it moves or the budget runs out, and says
 * which -- and "it never moved" is a real answer here, not a harness failure:
 * act 2 asks several questions whose expected answer is exactly that.
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

/** The tiles a drag can actually reach, from the measured origin. */
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

async function pressPlay(page: import('@playwright/test').Page, act: string): Promise<void> {
  log(act, `clock BEFORE pressing Play: ${JSON.stringify(await currentClock(page))} (tick ${await currentTick(page)})`);
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(1200);
  log(act, `clock AFTER pressing Play: ${JSON.stringify(await currentClock(page))} (tick ${await currentTick(page)})`);
}

/** Opens the Queued fold if it is shut, and answers whether it had been shut. */
async function openQueueFold(page: import('@playwright/test').Page): Promise<boolean> {
  const wasCollapsed = (await page.locator('.hud-build__queue').getAttribute('data-collapsed')) === 'true';
  if (wasCollapsed) {
    await page.locator('.hud-build__queue > .ui-section__header').click();
    await page.waitForTimeout(400);
  }
  return wasCollapsed;
}

interface DescentResult {
  readonly ordered: number;
  readonly treasury: number;
  readonly firstNewLineAtSegment: number;
  readonly firstNewLineText: string;
  readonly firstNewMoneyLineAtSegment: number;
  readonly firstNewMoneyLineText: string;
  readonly origin: { originX: number; originY: number };
}

/**
 * Drags wall until the funds refusal appears, narrating the whole visible HUD
 * on the way and recording the first segment at which *anything at all* on
 * screen matched a money word.
 *
 * The baseline matters and is printed: `calibrate` bisects by pressing
 * *Remove* on empty tiles, so it leaves `remove-object.nothing-to-remove` on
 * the refusal band, and that sentence contains no money word -- checked here
 * rather than assumed, because a detector that fires on the harness's own
 * leftovers would answer act 1's question wrongly in the flattering direction.
 */
async function descendToTheLock(page: import('@playwright/test').Page, act: string): Promise<DescentResult> {
  let origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  const afterCalibration = await hudDump(page);
  log(act, `BASELINE after calibration (a harness artifact, not play): refusal=${JSON.stringify(afterCalibration.refusal.text)}`);

  await pressPlay(page, act);
  await armBuildable(page, 'wall-brick');

  /*
   * **The baseline is taken here, with the wall tool armed and nothing yet
   * drawn**, because that is the screen a player is looking at the instant
   * before the first segment costs them anything. Every line reported below is
   * a line that was not on this screen.
   */
  const baselineDump = await hudDump(page);
  const baseline = lineSet(baselineDump.visibleText);
  const baselineMoneyLines = [...baseline].filter((line) => MONEY_WORDS.test(line));
  log(act, `BASELINE at 25,000, wall tool armed, nothing drawn: ${baseline.size} visible line(s)`);
  log(act, `BASELINE lines that already match a money word (furniture, present at every balance): ${JSON.stringify(baselineMoneyLines)}`);
  log(act, `BASELINE funds chip: ${JSON.stringify(baselineDump.fundsChip)}`);
  log(act, `BASELINE visible HUD, verbatim:\n${baselineDump.visibleText.split('\n').map((l) => `      ${l}`).join('\n')}`);

  let bounds = visibleTileWindow(origin);
  let ordered = 0;
  let dragCount = 0;
  let firstNewLineAtSegment = -1;
  let firstNewLineText = '';
  let firstNewMoneyLineAtSegment = -1;
  let firstNewMoneyLineText = '';
  let refused = false;

  const MAX_PASSES = 8;
  for (let pass = 0; pass < MAX_PASSES && !refused; pass += 1) {
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
      if (produced.length === 0) continue;
      dragCount += 1;
      ordered += produced.length;

      const dump = await hudDump(page);
      const counts = await latestCounts(page);
      // Everything on screen now that was not on screen at 25,000. The Funds
      // chip's own line changes on every drag because the number in it does,
      // so it is dropped by prefix: what is being asked is whether the game
      // says anything *new*, not whether the counter counted.
      const appeared = newLines(baseline, dump.visibleText).filter((line) => !/^[\d,]+$/.test(line));
      const appearedMoney = appeared.filter((line) => MONEY_WORDS.test(line));
      log(
        act,
        `drag ${dragCount} (${run.kind} ${run.index}): +${produced.length} -> ${ordered} segment(s);` +
          ` treasury=${counts?.treasuryMinorUnits} predicted=${25_000 - 80 * ordered};` +
          ` fundsChip=${JSON.stringify(dump.fundsChip.text)} tone=${dump.fundsChip.tone};` +
          ` newOnScreen=${JSON.stringify(appeared)};` +
          ` shortfall=${JSON.stringify(dump.shortfall.text)} shortfallLaidOut=${String(dump.shortfall.laidOut)};` +
          ` band=${JSON.stringify(dump.refusal.text)}`,
      );
      if (appeared.length > 0 && firstNewLineAtSegment < 0) {
        firstNewLineAtSegment = ordered;
        firstNewLineText = appeared.join(' | ');
        log(act, `THE FIRST NEW SENTENCE ON SCREEN arrived at segment ${ordered}, treasury ${counts?.treasuryMinorUnits}: ${JSON.stringify(firstNewLineText)}`);
      }
      if (appearedMoney.length > 0 && firstNewMoneyLineAtSegment < 0) {
        firstNewMoneyLineAtSegment = ordered;
        firstNewMoneyLineText = appearedMoney.join(' | ');
        log(act, `THE FIRST NEW SENTENCE ABOUT MONEY arrived at segment ${ordered}, treasury ${counts?.treasuryMinorUnits}: ${JSON.stringify(firstNewMoneyLineText)}`);
        await observe(page, act, `the first time the game said something new about money (segment ${ordered})`);
      }
      if (FUNDS_SENTENCE.test(dump.refusal.text)) {
        refused = true;
        log(act, `THE BAND NAMED MONEY at segment ${ordered}, treasury ${counts?.treasuryMinorUnits}`);
        break;
      }
    }
  }

  const settled = await latestCounts(page);
  log(
    act,
    `DESCENT RESULT: ${ordered} segments ordered over ${dragCount} order-producing drag(s);` +
      ` treasury=${settled?.treasuryMinorUnits};` +
      ` first NEW sentence at segment ${firstNewLineAtSegment} (${JSON.stringify(firstNewLineText)});` +
      ` first NEW sentence about money at segment ${firstNewMoneyLineAtSegment} (${JSON.stringify(firstNewMoneyLineText)})`,
  );
  return {
    ordered,
    treasury: settled?.treasuryMinorUnits ?? -1,
    firstNewLineAtSegment,
    firstNewLineText,
    firstNewMoneyLineAtSegment,
    firstNewMoneyLineText,
    origin,
  };
}

test('acts 1 and 2: the descent from 25,000, and every escape a mouse can reach at the bottom', async ({ page }) => {
  // The descent alone took six and a half minutes in
  // `2026-08-30-a-wall-that-buys-itself.md` §4, and act 2 runs a long queue
  // down and a clock past a day boundary after it.
  test.setTimeout(1_500_000);
  const act = 'L1';
  actStartedAt = Date.now();
  page.setDefaultTimeout(20_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  await tab(page, 'build').click();

  await observe(page, act, 'second zero, Build tab open, nothing pressed');

  const descent = await descendToTheLock(page, act);
  await observe(page, act, 'the moment the descent stopped');

  // ---- act 2: the escapes -------------------------------------------------
  log(act, `=== ACT 2: every escape a player has a mouse for, from ${descent.treasury} ===`);

  /*
   * **Escape A: wait.** ADR 0075's closed state is defined with the clock
   * running, so the first thing to establish is that the queue draining does
   * not change the balance and that nothing new is said while it does. The
   * queue at this point holds 312 funded orders and one that will never move.
   */
  const beforeWaiting = descent.treasury;
  const waitStarted = Date.now();
  let lastHeader = '';
  for (;;) {
    const dump = await hudDump(page);
    if (dump.queue.headerText !== lastHeader) {
      lastHeader = dump.queue.headerText;
      const counts = await latestCounts(page);
      log(act, `  ESCAPE A (wait) t+${Date.now() - waitStarted}ms: header=${JSON.stringify(dump.queue.headerText)} treasury=${counts?.treasuryMinorUnits} band=${JSON.stringify(dump.refusal.text)} shortfall=${JSON.stringify(dump.shortfall.text)}`);
    }
    if (Date.now() - waitStarted > 180_000) break;
    await page.waitForTimeout(3000);
  }
  const afterWaiting = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  log(act, `ESCAPE A RESULT: waited 180 s with nothing pressed; treasury ${beforeWaiting} -> ${afterWaiting}`);
  await observe(page, act, 'after three minutes of waiting, nothing pressed');

  /*
   * **Escape B: the Queued fold, and how many orders it offers to cancel.**
   * `BUILD_QUEUE_ROW_LIMIT` is 3 (`src/ui/hud/build-panel.ts:545`) and rows are
   * ordered by ascending order id, which is a uuid -- so this counts the rows a
   * player is actually offered against the orders that exist.
   */
  await tab(page, 'build').click();
  const queueWasCollapsed = await openQueueFold(page);
  log(act, `ESCAPE B: the Queued fold was collapsed on arrival? ${String(queueWasCollapsed)}`);
  const queueText = (await panelText(page, '.hud-build__queue')).replace(/\n+/g, ' | ');
  const rowCount = await page.locator('.hud-build__queue-row:not([hidden])').count();
  log(act, `ESCAPE B: fold open reads ${JSON.stringify(queueText)}; ${rowCount} cancellable row(s) laid out`);
  await observe(page, act, 'the Queued fold, open');

  /*
   * **Escape B, pressed.** Cancel every row the panel offers, repeatedly, and
   * watch the balance. `ConstructionSystem.cancelOrder`
   * (`src/simulation/construction/system.ts:594-612`) releases
   * `materialsAllocated` back to the materials provider and touches the
   * treasury nowhere, so the prediction under test is that the balance does
   * not move however many times this is pressed.
   */
  let cancels = 0;
  const beforeCancels = afterWaiting;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const buttons = page.locator('.hud-build__queue-row:not([hidden]) button');
    const available = await buttons.count();
    if (available === 0) {
      log(act, `  ESCAPE B: no cancellable row left after ${cancels} press(es)`);
      break;
    }
    await buttons.first().click();
    cancels += 1;
    await page.waitForTimeout(600);
    const counts = await latestCounts(page);
    const dump = await hudDump(page);
    log(act, `  ESCAPE B press ${cancels}: treasury=${counts?.treasuryMinorUnits} header=${JSON.stringify(dump.queue.headerText)} band=${JSON.stringify(dump.refusal.text)} shortfall=${JSON.stringify(dump.shortfall.text)}`);
  }
  const afterCancels = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  log(act, `ESCAPE B RESULT: ${cancels} Cancel press(es); treasury ${beforeCancels} -> ${afterCancels}`);

  /*
   * **Escape C: `Undo`.** `KeyZ` (`src/main.ts:2005`), keyboard-only, and it
   * pops one transaction -- the gesture, not the session. It goes through the
   * same `cancelOrder`, so the same prediction applies to the balance; what is
   * being measured here is whether a player who regrets the whole run can walk
   * it back at all.
   */
  const beforeUndo = afterCancels;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.locator('#game-root canvas').click({ position: { x: 40, y: 40 } });
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(700);
    const counts = await latestCounts(page);
    const dump = await hudDump(page);
    log(act, `  ESCAPE C undo ${attempt + 1}: treasury=${counts?.treasuryMinorUnits} header=${JSON.stringify(dump.queue.headerText)} band=${JSON.stringify(dump.refusal.text)}`);
  }
  const afterUndo = await settledTreasury(page, act, beforeUndo, 4000);
  log(act, `ESCAPE C RESULT: five Undo presses; treasury ${beforeUndo} -> ${afterUndo}`);

  /*
   * **Escape D: the Remove tool on a standing wall.** `src/main.ts:1936` says
   * in as many words that there is no wall removal behind this control and
   * that the hint says "any tile of an object". This presses it on tiles the
   * descent walled, and prints what the game says.
   */
  await tab(page, 'build').click();
  await page.locator('.hud-build__remove').click();
  const removeHint = (await panelText(page, '.hud-build__note')).replace(/\n+/g, ' | ');
  log(act, `ESCAPE D: the Remove hint reads ${JSON.stringify(removeHint)}`);
  const beforeRemove = afterUndo;
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
  ] as const) {
    const target = centreOf(descent.origin, 12 + dx, 12 + dy);
    const produced = await press(page, target.x, target.y);
    const dump = await hudDump(page);
    log(act, `  ESCAPE D press at tile (${12 + dx},${12 + dy}): commands=${JSON.stringify(produced.map((c) => c['type']))} band=${JSON.stringify(dump.refusal.text)}`);
  }
  const afterRemove = await settledTreasury(page, act, beforeRemove, 4000);
  log(act, `ESCAPE D RESULT: three Remove presses on walled tiles; treasury ${beforeRemove} -> ${afterRemove}`);
  await page.locator('.hud-build__remove').click();

  /*
   * **Escape E: buy a plank through the procurement fold.** This is the one
   * place the file opens `.hud-build__buy`. A plank is 65
   * (`src/content/procurement-catalog.ts`), the balance is below it, and
   * ADR 0075's table predicts `purchase.insufficient-funds`. Measured here
   * with a mouse rather than through the router.
   */
  const beforeBuy = afterRemove;
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(300);
  const buyFoldText = (await panelText(page, '.hud-build__buy')).replace(/\n+/g, ' | ');
  log(act, `ESCAPE E: the procurement fold, open, reads ${JSON.stringify(buyFoldText)}`);
  /*
   * **The refundable rows, counted here and not earlier.** `ProcurementSystem.cancel`
   * is the one command in the fourteen-member union that credits the treasury
   * (`src/simulation/economy/treasury.ts:118-124`), and its control lives in
   * this fold. It can only reach a delivery still in flight, and the descent
   * above took minutes, so the prediction is that there is nothing left to
   * cancel -- which is what makes act 4's stopped-clock variant a different
   * prison from the same gesture.
   */
  const deliveriesHere = (await panelText(page, '.hud-build__deliveries')).replace(/\n+/g, ' | ');
  const refundableRows = await page.locator('.hud-build__delivery-row:not([hidden])').count();
  log(act, `ESCAPE E: ON THE WAY reads ${JSON.stringify(deliveriesHere)}; ${refundableRows} refundable row(s) laid out`);
  await page.locator('.hud-build__buy .ui-number__input').fill('1');
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(1200);
  const afterBuy = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  const buyDump = await hudDump(page);
  log(act, `ESCAPE E RESULT: bought 1 plank at 65 from ${beforeBuy}; treasury -> ${afterBuy}; band=${JSON.stringify(buyDump.refusal.text)}`);
  await observe(page, act, 'after trying to buy one plank');

  /*
   * **Escape F: place a bed anyway.** `bed-wooden` is one of the two
   * buildables that place a `sleep-surface` and both are plank-priced
   * (ADR 0075's "why it is terminal", fact 2). Placing it queues an order
   * whose just-in-time purchase is refused, so the prediction is an order
   * that never moves and a prison whose `accommodationCapacity` stays 0.
   */
  const beforeBed = afterBuy;
  await armBuildable(page, 'bed-wooden');
  const bedTarget = centreOf(descent.origin, 14, 14);
  const bedCommands = await press(page, bedTarget.x, bedTarget.y);
  await page.waitForTimeout(1500);
  const bedDump = await hudDump(page);
  const bedCounts = await latestCounts(page);
  log(act, `ESCAPE F: placing a bed produced ${JSON.stringify(bedCommands.map((c) => c['type']))}; treasury ${beforeBed} -> ${bedCounts?.treasuryMinorUnits}; accommodation=${bedCounts?.accommodationCapacity}; band=${JSON.stringify(bedDump.refusal.text)}; shortfall=${JSON.stringify(bedDump.shortfall.text)}`);

  /*
   * **Escape G: let it run.** Two in-game days at ×4 is 4,800 ticks, past the
   * day boundary `StateIncomeSystem` pays on and past the one `PayrollSystem`
   * bills on. With no prisoner and no staff both are zero, which is what makes
   * the state closed rather than merely poor -- measured rather than reasoned.
   */
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  const runStarted = Date.now();
  const startTick = await currentTick(page);
  log(act, `ESCAPE G: fast-forwarding from tick ${startTick}; clock=${JSON.stringify(await currentClock(page))}`);
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= startTick + 5000) break;
    if (Date.now() - runStarted > 300_000) {
      log(act, `  ESCAPE G gave up waiting at tick ${tick}`);
      break;
    }
    await page.waitForTimeout(3000);
  }
  const afterRun = await latestCounts(page);
  log(act, `ESCAPE G RESULT: ran to tick ${await currentTick(page)}; treasury=${afterRun?.treasuryMinorUnits} accommodation=${afterRun?.accommodationCapacity} prisoners=${afterRun?.prisoners}`);
  await observe(page, act, 'the end of act 2 — everything a mouse can reach, tried');

  log(act, `SUMMARY: descent ${descent.ordered} segments; first new sentence about money at segment ${descent.firstNewMoneyLineAtSegment}; balance ${descent.treasury} -> ${afterRun?.treasuryMinorUnits} after every escape`);
});

/**
 * One wing of the prison a planner draws: a rectangle, a corridor down the
 * middle of it, and cell partitions off the corridor.
 *
 * Bounded to the *measured* visible window rather than to the viewport,
 * because a drag that leaves the window is not a gesture a player can make --
 * and run 1 of this file measured the eastern edge of the window being eaten
 * by the HUD rail: a vertical run at column 25 produced **zero** orders while
 * the horizontal runs at rows 10 and 22 each produced twenty. So the east wall
 * is drawn one column short of `lastColumn`, and that shortfall is a fact about
 * the interface rather than about the prison.
 */
async function drawWing(
  page: import('@playwright/test').Page,
  act: string,
  origin: { originX: number; originY: number },
  label: string,
  state: { ordered: number },
): Promise<void> {
  const bounds = visibleTileWindow(origin);
  const x0 = bounds.firstColumn;
  const x1 = bounds.lastColumn - 1;
  const y0 = bounds.firstRow;
  const y1 = bounds.lastRow;
  log(act, `${label}: rectangle (${x0},${y0}) .. (${x1},${y1}) inside window columns ${bounds.firstColumn}..${bounds.lastColumn}, rows ${bounds.firstRow}..${bounds.lastRow}`);

  const edgeX = (tx: number) => origin.originX + tx * TILE;
  const edgeY = (ty: number) => origin.originY + ty * TILE;
  const midX = (tx: number) => origin.originX + tx * TILE + TILE / 2;
  const midY = (ty: number) => origin.originY + ty * TILE + TILE / 2;

  const run = async (name: string, a: { x: number; y: number }, b: { x: number; y: number }): Promise<void> => {
    const before = (await sentCommands(page)).length;
    await drag(page, a, b);
    const produced = (await sentCommands(page)).slice(before).filter((c) => c['type'] === 'PlaceBuildOrder');
    state.ordered += produced.length;
    const counts = await latestCounts(page);
    const dump = await hudDump(page);
    log(
      act,
      `  ${label} ${name}: +${produced.length} -> ${state.ordered} segment(s); treasury=${counts?.treasuryMinorUnits}` +
        ` fundsChip=${JSON.stringify(dump.fundsChip.text)} tone=${dump.fundsChip.tone}` +
        ` shortfall=${JSON.stringify(dump.shortfall.text)} band=${JSON.stringify(dump.refusal.text)}`,
    );
  };

  await run('north', { x: midX(x0), y: edgeY(y0) }, { x: midX(x1), y: edgeY(y0) });
  await run('south', { x: midX(x0), y: edgeY(y1) }, { x: midX(x1), y: edgeY(y1) });
  await run('west', { x: edgeX(x0), y: midY(y0) }, { x: edgeX(x0), y: midY(y1) });
  await run('east', { x: edgeX(x1), y: midY(y0) }, { x: edgeX(x1), y: midY(y1) });

  const corridorY = Math.floor((y0 + y1) / 2);
  await run('corridor', { x: midX(x0 + 1), y: edgeY(corridorY) }, { x: midX(x1 - 1), y: edgeY(corridorY) });
  for (let column = x0 + 3; column < x1 - 1; column += 3) {
    await run(`cells north at column ${column}`, { x: edgeX(column), y: midY(y0 + 1) }, { x: edgeX(column), y: midY(corridorY - 1) });
    await run(`cells south at column ${column}`, { x: edgeX(column), y: midY(corridorY + 1) }, { x: edgeX(column), y: midY(y1 - 1) });
  }
}

/** Pans the camera with the middle button and re-measures the origin. */
async function panAndRecalibrate(
  page: import('@playwright/test').Page,
  act: string,
): Promise<{ originX: number; originY: number }> {
  await page.mouse.move(1000, 500);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(200, 300, { steps: 12 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(400);
  const origin = await calibrate(page);
  await armBuildable(page, 'wall-brick');
  log(act, `panned; origin now (${origin.originX}, ${origin.originY})`);
  return origin;
}

test('act 3: three wings of an ambitious prison, drawn without once trying to run out', async ({ page }) => {
  test.setTimeout(1_200_000);
  const act = 'L3';
  actStartedAt = Date.now();
  page.setDefaultTimeout(20_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  await tab(page, 'build').click();
  let origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  await pressPlay(page, act);
  await armBuildable(page, 'wall-brick');

  /*
   * **Why three wings, and why this is not the fence act 1 draws.**
   *
   * Run 1 of this file measured one wing -- a rectangle filling the visible
   * window, a corridor, and eight cell partitions off it -- at **119 wall
   * segments and 9,520**, which is 38.1% of the opening treasury. Nothing in
   * that gesture is unusual: it is the outline of a prison with about sixteen
   * cells, drawn before anything is furnished, by a player doing what a player
   * does with a build tool and an empty map.
   *
   * Three of them is 2.6 x 9,520, and the arithmetic that follows is the
   * question this act exists to answer by playing rather than by multiplying:
   * a player who plans a prison three wings wide, and never once tries to run
   * out of money, arrives at ADR 0075's floor with no gesture that looks like
   * the six and a half minutes of fencing
   * `2026-08-30-a-wall-that-buys-itself.md` §4 needed.
   *
   * Each wing is drawn at a fresh camera position, which is what a player does
   * when the map runs off the screen, and the origin is re-measured after each
   * pan rather than predicted.
   */
  const state = { ordered: 0 };
  const wings: { label: string; segments: number; treasury: number }[] = [];
  for (let wing = 1; wing <= 3; wing += 1) {
    if (wing > 1) origin = await panAndRecalibrate(page, act);
    const before = state.ordered;
    await drawWing(page, act, origin, `wing ${wing}`, state);
    const counts = await latestCounts(page);
    wings.push({ label: `wing ${wing}`, segments: state.ordered - before, treasury: counts?.treasuryMinorUnits ?? -1 });
    log(act, `WING ${wing} DONE: ${state.ordered - before} segment(s) this wing, ${state.ordered} total; treasury=${counts?.treasuryMinorUnits}`);
    await observe(page, act, `wing ${wing} drawn, nothing else pressed`);
  }
  for (const wing of wings) log(act, `WINGS: ${wing.label} +${wing.segments} segment(s), treasury after ${wing.treasury}`);

  /*
   * **Then the player furnishes what they drew.** A bed is one
   * `item.wood-plank` at 65 (`src/content/procurement-catalog.ts:101`), which
   * is *less* than a wall segment's two bricks at 80 -- so the question is not
   * whether beds are expensive. It is whether the outline left enough for any.
   */
  const beforeBeds = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  await armBuildable(page, 'bed-wooden');
  let bedsPlaced = 0;
  for (let index = 0; index < 12; index += 1) {
    const bounds = visibleTileWindow(origin);
    const target = centreOf(origin, bounds.firstColumn + 2 + (index % 5), bounds.firstRow + 2 + Math.floor(index / 5));
    const produced = await press(page, target.x, target.y);
    if (produced.some((c) => c['type'] === 'PlaceObject')) bedsPlaced += 1;
    const counts = await latestCounts(page);
    const dump = await hudDump(page);
    log(
      act,
      `  bed ${index + 1}: commands=${JSON.stringify(produced.map((c) => c['type']))} treasury=${counts?.treasuryMinorUnits}` +
        ` shortfall=${JSON.stringify(dump.shortfall.text)} band=${JSON.stringify(dump.refusal.text)}`,
    );
  }
  const afterBeds = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  log(act, `FURNISHING RESULT: ${bedsPlaced} bed placement(s) accepted; treasury ${beforeBeds} -> ${afterBeds}`);
  await observe(page, act, 'after trying to furnish what was drawn');

  /*
   * **The thing a planner does and a fencer never does: change their mind.**
   * `cancelOrder` releases `materialsAllocated` back to the container
   * (`src/simulation/construction/system.ts:606-612`) and
   * `ConstructionProcurementSink` nets stock and in-flight off demand
   * (`src/simulation/economy/just-in-time-materials.ts:166`), so the prediction
   * is: the treasury does **not** rise on the cancel, and the redraw is then
   * free because the bricks are back.
   *
   * Run 1 of this act measured the first half and could not measure the
   * second, because its redraw row was already walled and produced zero
   * orders. The redraw here is aimed at a row the wing never drew.
   */
  await tab(page, 'build').click();
  await openQueueFold(page);
  const beforeRegret = afterBeds;
  let regretCancels = 0;
  for (let attempt = 0; attempt < 9; attempt += 1) {
    const buttons = page.locator('.hud-build__queue-row:not([hidden]) button');
    if ((await buttons.count()) === 0) break;
    await buttons.first().click();
    regretCancels += 1;
    await page.waitForTimeout(500);
  }
  const afterRegret = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  log(act, `CHANGED THEIR MIND: ${regretCancels} order(s) cancelled; treasury ${beforeRegret} -> ${afterRegret}`);

  origin = await panAndRecalibrate(page, act);
  const clean = visibleTileWindow(origin);
  const redrawRow = clean.firstRow + 1;
  const beforeRedraw = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  const beforeRedrawCommands = (await sentCommands(page)).length;
  await drag(
    page,
    { x: origin.originX + clean.firstColumn * TILE + TILE / 2, y: origin.originY + redrawRow * TILE },
    { x: origin.originX + (clean.firstColumn + 8) * TILE + TILE / 2, y: origin.originY + redrawRow * TILE },
  );
  const redrawn = (await sentCommands(page)).slice(beforeRedrawCommands).filter((c) => c['type'] === 'PlaceBuildOrder').length;
  await page.waitForTimeout(1500);
  const afterRedraw = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  log(
    act,
    `REDRAW RESULT: ${redrawn} segment(s) redrawn on virgin ground after ${regretCancels} cancellation(s);` +
      ` treasury ${beforeRedraw} -> ${afterRedraw}, which is ${beforeRedraw - afterRedraw} for what would cost ${80 * redrawn} at full price`,
  );
  await observe(page, act, 'after changing their mind and redrawing');

  const finalCounts = await latestCounts(page);
  const spent = 25_000 - (finalCounts?.treasuryMinorUnits ?? 0);
  log(act, `ACT 3 SUMMARY: ${state.ordered} wall segment(s) over three wings; ${spent} spent of 25,000 (${((spent / 25_000) * 100).toFixed(1)}%), ${(((finalCounts?.treasuryMinorUnits ?? 0) / 80)).toFixed(0)} wall segment(s) still affordable, ${(((finalCounts?.treasuryMinorUnits ?? 0) / 65)).toFixed(0)} bed(s) still affordable`);
});

/**
 * **The same money, with the clock never started -- which is the state a new
 * session actually arrives in.**
 *
 * `docs/research/2026-08-30-what-the-game-never-says.md` §1 measured that a
 * new session's clock is constructed `paused`
 * (`src/simulation/worker/state-machine.ts:216`) and that no word on screen
 * says so. That is not this act's finding and it is not re-litigated here.
 * What is this act's finding is what it does to the *escape*: a just-in-time
 * purchase becomes a pending delivery `PROCUREMENT_DELIVERY_DELAY_TICKS` = 100
 * ticks long (`src/content/procurement-catalog.ts:62`), and
 * `ProcurementSystem.cancel` refunds it in full through `Treasury.credit`
 * (`src/simulation/economy/treasury.ts:118-124`) -- but only while it is still
 * in flight, and a stopped clock means nothing ever lands.
 *
 * So the same gesture leaves a *different* prison depending on a control the
 * game never mentions, and this act measures which.
 */
test('act 4: the same wall run with the clock never started, and what that does to the refund', async ({ page }) => {
  test.setTimeout(600_000);
  const act = 'L4';
  actStartedAt = Date.now();
  page.setDefaultTimeout(20_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  log(act, `clock, NEVER pressed: ${JSON.stringify(await currentClock(page))} tick=${await currentTick(page)}`);
  await armBuildable(page, 'wall-brick');

  const bounds = visibleTileWindow(origin);
  const before = (await sentCommands(page)).length;
  await drag(
    page,
    { x: origin.originX + bounds.firstColumn * TILE + TILE / 2, y: origin.originY + bounds.firstRow * TILE },
    { x: origin.originX + bounds.lastColumn * TILE - TILE / 2, y: origin.originY + bounds.firstRow * TILE },
  );
  const placed = (await sentCommands(page)).slice(before).filter((c) => c['type'] === 'PlaceBuildOrder').length;
  await page.waitForTimeout(1500);
  const afterDrag = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  log(act, `a ${placed}-segment run with the clock stopped: treasury -> ${afterDrag} (${25_000 - afterDrag} spent)`);
  await observe(page, act, 'one wall run, clock never started');

  // The procurement fold, opened on purpose -- the only place `deliveriesBlock`
  // lives (`src/ui/hud/build-panel.ts:1293-1311`, the last child of `buyRow`).
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  if (await page.locator('.hud-build__buy').isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(500);
  const deliveriesText = (await panelText(page, '.hud-build__deliveries')).replace(/\n+/g, ' | ');
  const deliveryRows = await page.locator('.hud-build__delivery-row:not([hidden])').count();
  log(act, `ON THE WAY, with the clock still stopped: ${JSON.stringify(deliveriesText)}; ${deliveryRows} row(s) laid out`);
  await observe(page, act, 'the procurement fold, open, with every delivery still in flight');

  /*
   * Cancel every row the fold offers, and watch the treasury. This is the one
   * command in the fourteen-member union that credits the treasury, which
   * ADR 0075's escape table measures **refusing** on a landed order --
   * `cancel-purchase.not-pending`. Here nothing has landed.
   */
  const beforeCancel = afterDrag;
  let cancelled = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const buttons = page.locator('.hud-build__delivery-row:not([hidden]) button');
    if ((await buttons.count()) === 0) break;
    await buttons.first().click();
    cancelled += 1;
    await page.waitForTimeout(500);
    const counts = await latestCounts(page);
    log(act, `  cancel ${cancelled}: treasury=${counts?.treasuryMinorUnits}`);
  }
  const afterCancel = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  log(act, `ACT 4 RESULT: ${cancelled} delivery cancellation(s) with the clock stopped; treasury ${beforeCancel} -> ${afterCancel} (recovered ${afterCancel - beforeCancel} of the ${25_000 - beforeCancel} spent)`);
  await observe(page, act, 'after cancelling every delivery the fold offered');
});
