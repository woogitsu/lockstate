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
 *    somebody planning a real prison would -- a large perimeter, cell walls
 *    inside it -- never trying to reach the lock, and prints what is left. It
 *    also does the thing a planner actually does and a fencer never does:
 *    changes its mind and redraws, which is where money-turned-into-bricks is
 *    either recovered or lost.
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

/** Anything a player could read as the game talking about money. */
const MONEY_WORDS = /fund|afford|money|cost|price|short|pay|balance|treasur|buy|bought|purchase|spend|spent/i;

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
  readonly firstMoneyWordAtSegment: number;
  readonly firstMoneyWordText: string;
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

  const baseline = await hudDump(page);
  log(act, `BASELINE after calibration (a harness artifact, not play): refusal=${JSON.stringify(baseline.refusal.text)}`);
  log(act, `BASELINE visible HUD matches a money word? ${String(MONEY_WORDS.test(baseline.visibleText))}`);
  log(act, `BASELINE visible HUD, verbatim:\n${baseline.visibleText.split('\n').map((l) => `      ${l}`).join('\n')}`);

  await pressPlay(page, act);
  await armBuildable(page, 'wall-brick');

  let bounds = visibleTileWindow(origin);
  let ordered = 0;
  let dragCount = 0;
  let firstMoneyWordAtSegment = -1;
  let firstMoneyWordText = '';
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
      const money = MONEY_WORDS.test(dump.visibleText);
      log(
        act,
        `drag ${dragCount} (${run.kind} ${run.index}): +${produced.length} -> ${ordered} segment(s);` +
          ` treasury=${counts?.treasuryMinorUnits} predicted=${25_000 - 80 * ordered};` +
          ` fundsChip=${JSON.stringify(dump.fundsChip.text)} tone=${dump.fundsChip.tone};` +
          ` moneyWordOnScreen=${String(money)};` +
          ` shortfall=${JSON.stringify(dump.shortfall.text)} shortfallLaidOut=${String(dump.shortfall.laidOut)};` +
          ` band=${JSON.stringify(dump.refusal.text)}`,
      );
      if (money && firstMoneyWordAtSegment < 0) {
        firstMoneyWordAtSegment = ordered;
        firstMoneyWordText = dump.visibleText
          .split('\n')
          .filter((line) => MONEY_WORDS.test(line))
          .join(' | ');
        log(act, `THE FIRST MONEY WORD ON SCREEN arrived at segment ${ordered}, treasury ${counts?.treasuryMinorUnits}: ${JSON.stringify(firstMoneyWordText)}`);
        await observe(page, act, `the first time anything on screen named money (segment ${ordered})`);
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
      ` treasury=${settled?.treasuryMinorUnits}; first money word at segment ${firstMoneyWordAtSegment}`,
  );
  return {
    ordered,
    treasury: settled?.treasuryMinorUnits ?? -1,
    firstMoneyWordAtSegment,
    firstMoneyWordText,
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

  log(act, `SUMMARY: descent ${descent.ordered} segments; first money word at segment ${descent.firstMoneyWordAtSegment}; balance ${descent.treasury} -> ${afterRun?.treasuryMinorUnits} after every escape`);
});

test('act 3: an ambitious first prison, built the way somebody planning ahead would', async ({ page }) => {
  test.setTimeout(1_200_000);
  const act = 'L3';
  actStartedAt = Date.now();
  page.setDefaultTimeout(20_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  await pressPlay(page, act);
  await armBuildable(page, 'wall-brick');

  /*
   * **The build a planner draws, and why this shape.** Not a fence: a
   * perimeter big enough to hold what the game's own content implies a prison
   * needs -- an accommodation block, an intake hall, a yard -- plus the cell
   * partitions inside it. It is deliberately generous, because the brief's
   * question is whether *ambition* reaches the lock, and an ambitious player
   * draws the outline of the finished prison before furnishing any of it.
   *
   * The rectangle is 20 x 13 tiles, which is 66 perimeter segments, plus
   * eleven interior partitions. Every run is inside the measured visible
   * window so it is a gesture a player could make without moving the camera.
   */
  const bounds = visibleTileWindow(origin);
  log(act, `visible tile window: columns ${bounds.firstColumn}..${bounds.lastColumn}, rows ${bounds.firstRow}..${bounds.lastRow}`);
  const x0 = bounds.firstColumn;
  const x1 = Math.min(bounds.firstColumn + 19, bounds.lastColumn);
  const y0 = bounds.firstRow;
  const y1 = Math.min(bounds.firstRow + 12, bounds.lastRow);
  log(act, `the prison a planner draws: rectangle (${x0},${y0}) .. (${x1},${y1})`);

  let ordered = 0;
  const run = async (name: string, a: { x: number; y: number }, b: { x: number; y: number }): Promise<number> => {
    const before = (await sentCommands(page)).length;
    await drag(page, a, b);
    const produced = (await sentCommands(page)).slice(before).filter((c) => c['type'] === 'PlaceBuildOrder');
    ordered += produced.length;
    const counts = await latestCounts(page);
    const dump = await hudDump(page);
    log(
      act,
      `  ${name}: +${produced.length} -> ${ordered} segment(s); treasury=${counts?.treasuryMinorUnits}` +
        ` moneyWordOnScreen=${String(MONEY_WORDS.test(dump.visibleText))} band=${JSON.stringify(dump.refusal.text)}`,
    );
    return produced.length;
  };

  const edge = (tx: number, ty: number) => ({ x: origin.originX + tx * TILE, y: origin.originY + ty * TILE });
  const mid = (tx: number, ty: number) => ({ x: origin.originX + tx * TILE + TILE / 2, y: origin.originY + ty * TILE + TILE / 2 });

  await run('perimeter north', { ...mid(x0, y0), y: edge(x0, y0).y }, { ...mid(x1, y0), y: edge(x1, y0).y });
  await run('perimeter south', { ...mid(x0, y1), y: edge(x0, y1).y }, { ...mid(x1, y1), y: edge(x1, y1).y });
  await run('perimeter west', { ...mid(x0, y0), x: edge(x0, y0).x }, { ...mid(x0, y1), x: edge(x0, y1).x });
  await run('perimeter east', { ...mid(x1, y0), x: edge(x1, y0).x }, { ...mid(x1, y1), x: edge(x1, y1).x });

  // Cell partitions: a corridor down the middle and cells off it, which is the
  // layout a player copies from every prison they have ever seen.
  const corridorY = Math.floor((y0 + y1) / 2);
  await run('corridor wall', { ...mid(x0 + 1, corridorY), y: edge(x0 + 1, corridorY).y }, { ...mid(x1 - 1, corridorY), y: edge(x1 - 1, corridorY).y });
  for (let column = x0 + 3; column < x1 - 1; column += 3) {
    await run(`cell partition at column ${column}`, { ...mid(column, y0 + 1), x: edge(column, y0 + 1).x }, { ...mid(column, corridorY - 1), x: edge(column, corridorY - 1).x });
    await run(`cell partition south at column ${column}`, { ...mid(column, corridorY + 1), x: edge(column, corridorY + 1).x }, { ...mid(column, y1 - 1), x: edge(column, y1 - 1).x });
  }

  const afterDrawing = await latestCounts(page);
  log(act, `AMBITIOUS BUILD DRAWN: ${ordered} wall segment(s); treasury=${afterDrawing?.treasuryMinorUnits}; spent=${25_000 - (afterDrawing?.treasuryMinorUnits ?? 0)}`);
  await observe(page, act, 'the ambitious outline, drawn, nothing else pressed');

  /*
   * **The thing a planner does and a fencer never does: change their mind.**
   * The money is now bricks. `cancelOrder` releases them back to the container
   * and `ConstructionProcurementSink` nets stock off demand
   * (`src/simulation/economy/just-in-time-materials.ts:166`), so the question
   * is whether redrawing the same wall somewhere else costs a second time.
   * This cancels every row the panel offers and then redraws one run, watching
   * whether the treasury falls again.
   */
  await tab(page, 'build').click();
  await openQueueFold(page);
  const beforeRegret = afterDrawing?.treasuryMinorUnits ?? -1;
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

  await armBuildable(page, 'wall-brick');
  const redrawRow = y1 - 2;
  const beforeRedraw = afterRegret;
  await run('redraw after cancelling', { ...mid(x0 + 1, redrawRow), y: edge(x0 + 1, redrawRow).y }, { ...mid(x0 + 1 + regretCancels, redrawRow), y: edge(x0 + 1 + regretCancels, redrawRow).y });
  const afterRedraw = (await latestCounts(page))?.treasuryMinorUnits ?? -1;
  log(act, `REDRAW RESULT: treasury ${beforeRedraw} -> ${afterRedraw} for a run of ${regretCancels} segment(s) after cancelling the same number`);
  await observe(page, act, 'after changing their mind and redrawing');

  log(act, `ACT 3 SUMMARY: an ambitious outline cost ${25_000 - (afterDrawing?.treasuryMinorUnits ?? 0)} of 25,000, which is ${(((25_000 - (afterDrawing?.treasuryMinorUnits ?? 0)) / 25_000) * 100).toFixed(1)}% of the treasury and ${(((25_000 - (afterDrawing?.treasuryMinorUnits ?? 0)) / 24_960) * 100).toFixed(1)}% of the way to the lock`);
});
