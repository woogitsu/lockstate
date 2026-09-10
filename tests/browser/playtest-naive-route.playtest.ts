import { test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buy,
  calibrate,
  centreOf,
  currentClock,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  sentCommands,
  tab,
} from './playtest-harness';

/**
 * **The naive route.** Every playtest before this one walked the *informed*
 * route -- `buildAndPopulate` in `playtest-harness.ts` buys sixty bricks, runs
 * the clock until they land, lays four wall runs, waits for the queue to
 * empty, and only then designates. A new player does not know that order, and
 * issue #569's retraction names exactly that as the last standing candidate
 * for the owner's complaint (*"nie mogłem postawić więzienia … grając sam"*):
 *
 * > the best evidence-backed candidate is **ordering** -- the informed route
 * > (buy bricks -> run the clock -> build walls -> *then* zone) reaches
 * > `"rooms":1`, and nothing on screen states that order; a wall order placed
 * > with no bricks reads *"Awaiting Materials"* only inside a queue that is
 * > folded on arrival. That is a product question, it is **not** proven to be
 * > the cause.
 *
 * This file tests that claim by doing the naive thing on purpose, in the order
 * a player who has been told nothing would do it:
 *
 * 1. **Zone first.** Rooms -> Cell -> draw -> Designate, before buying
 *    anything and before building any wall.
 * 2. **Build a wall with nothing in stock.** Lay the four runs without buying
 *    a single brick, then run the clock and watch, the way a player watches.
 * 3. **Recover the way a player would**, once stuck: find the money control,
 *    buy, and see whether the orders already standing ever build.
 * 4. **Zone again**, and count how many presses that costs.
 *
 * ## The method rule this file exists to obey
 *
 * #569's retraction records the failure that produced it, and it is a rule
 * about instrumentation rather than about reasoning:
 *
 * > A survey that enumerates known regions cannot find a message in a region
 * > it did not know about. *Print the container, not the parts.*
 *
 * So every observation point here dumps `document.querySelector('.hud')`
 * whole, via `hudDump`, and the per-panel readouts are printed *in addition*
 * to that rather than instead of it. `innerText` is used deliberately: it
 * reflects layout, so text inside a folded section does not appear in it, and
 * "is this sentence reachable without unfolding anything?" is answerable by
 * a substring test on the dump.
 *
 * ## What it is not
 *
 * Not a gate. Nothing in CI collects `.playtest.ts`
 * (`tests/browser/playwright.playtest.config.ts` says so at length). Its
 * console output is the deliverable; the findings live in
 * `docs/research/2026-08-30-the-naive-route.md`.
 */

/** The rectangle every act of this file draws, in tiles. */
const AREA = { x0: 12, y0: 12, x1: 17, y1: 17 } as const;

interface HudDump {
  readonly text: string;
  readonly refusal: { hidden: boolean | string; box: { w: number; h: number; x: number; y: number }; text: string };
  readonly queue: {
    present: boolean;
    hidden: boolean | string;
    collapsed: string | null;
    headerText: string;
    bodyHidden: boolean | string;
  };
}

/**
 * The whole HUD, plus the two regions #569 proved a survey can miss by owning
 * only the panels it expected to matter.
 *
 * `.hud__refusal` is a direct child of `.hud` and a member of no panel; the
 * queue's fold state is an attribute rather than text, so no amount of reading
 * `innerText` recovers it.
 */
async function hudDump(page: import('@playwright/test').Page): Promise<HudDump> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    const refusalNode = document.querySelector<HTMLElement>('.hud__refusal');
    const refusalBox = refusalNode?.getBoundingClientRect();
    const queueNode = document.querySelector<HTMLElement>('.hud-build__queue');
    const queueHeader = queueNode?.querySelector<HTMLElement>('.ui-section__header');
    const queueBody = queueNode?.querySelector<HTMLElement>('.ui-section__body');
    return {
      text: (hud?.innerText ?? 'NO .hud').replace(/\n{2,}/g, '\n').trim(),
      refusal: {
        hidden: refusalNode?.hidden ?? true,
        box: {
          w: Math.round(refusalBox?.width ?? 0),
          h: Math.round(refusalBox?.height ?? 0),
          x: Math.round(refusalBox?.x ?? 0),
          y: Math.round(refusalBox?.y ?? 0),
        },
        text: (refusalNode?.innerText ?? '').trim(),
      },
      queue: {
        present: queueNode !== null,
        hidden: queueNode?.hidden ?? true,
        collapsed: queueNode?.getAttribute('data-collapsed') ?? null,
        headerText: (queueHeader?.innerText ?? '').replace(/\n+/g, ' ').trim(),
        bodyHidden: queueBody?.hidden ?? true,
      },
    };
  });
}

function report(log: (line: string) => void, moment: string, dump: HudDump): void {
  log(`===== ${moment} =====`);
  log(`--- WHOLE .hud innerText:\n${dump.text}`);
  log(`--- .hud__refusal: ${JSON.stringify(dump.refusal)}`);
  log(`--- .hud-build__queue: ${JSON.stringify(dump.queue)}`);
  for (const word of ['wall', 'brick', 'material', 'stock', 'buy', 'enclos']) {
    log(`--- /${word}/i anywhere in the visible HUD? ${new RegExp(word, 'i').test(dump.text)}`);
  }
}

test.describe('playtest: the naive route', () => {
  test('zone first, then wall with an empty stock, and see whether the game ever says why', async ({ page }) => {
    test.setTimeout(900_000);
    const log = (line: string) => console.log(`[naive] ${line}`);
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') log(`PAGE ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (error) => log(`PAGE ERROR: ${error.message}`));

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1000);

    report(log, 'ACT 0 — arrival, nothing pressed', await hudDump(page));
    log(`counts on arrival: ${JSON.stringify(await latestCounts(page))}`);

    // ---------------------------------------------------------------- ACT 1
    // Zone a room first. No purchase, no wall, no clock.
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    await tab(page, 'rooms').click();
    report(log, 'ACT 1a — Rooms tab, nothing selected yet', await hudDump(page));

    const roomsCollapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (roomsCollapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    report(log, 'ACT 1b — Cell selected', await hudDump(page));

    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, AREA.x0, AREA.y0), centreOf(origin, AREA.x1, AREA.y1));
    report(log, 'ACT 1c — 6x6 drawn, before pressing Designate', await hudDump(page));
    log(`.hud-rooms verbatim: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
    log(`Designate disabled attribute: ${await page.locator('.hud-rooms__confirm').getAttribute('disabled')}`);

    const beforeZone = (await sentCommands(page)).length;
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1200);
    log(`ACT 1d commands sent by Designate: ${JSON.stringify((await sentCommands(page)).slice(beforeZone))}`);
    report(log, 'ACT 1d — immediately after Designate', await hudDump(page));
    log(`counts after the naive Designate: ${JSON.stringify(await latestCounts(page))}`);

    // What a player plausibly tries next, having been refused: put a bed down.
    await tab(page, 'build').click();
    await armBuildable(page, 'bed-wooden');
    const bedCommands = await press(page, centreOf(origin, 14, 14).x, centreOf(origin, 14, 14).y);
    await page.waitForTimeout(800);
    log(`ACT 1e a bed placed inside the un-zoned area sent: ${JSON.stringify(bedCommands)}`);
    report(log, 'ACT 1e — after trying to place a bed with no room', await hudDump(page));

    // ---------------------------------------------------------------- ACT 2
    // Walls, with nothing bought. This is the claim under test.
    await tab(page, 'build').click();
    report(log, 'ACT 2a — Build tab, nothing bought, before arming the wall', await hudDump(page));
    log(`.hud-build verbatim: ${JSON.stringify(await panelText(page, '.hud-build'))}`);

    await armBuildable(page, 'wall-brick');
    report(log, 'ACT 2b — wall armed, still nothing bought', await hudDump(page));

    const westX = origin.originX + AREA.x0 * TILE;
    const eastX = origin.originX + (AREA.x1 + 1) * TILE;
    const northY = origin.originY + AREA.y0 * TILE;
    const southY = origin.originY + (AREA.y1 + 1) * TILE;
    let placedOrders = 0;
    for (const run of [
      { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      const before = (await sentCommands(page)).length;
      await drag(page, run.a, run.b);
      const produced = (await sentCommands(page)).slice(before);
      placedOrders += produced.length;
      log(`wall run ${run.name}: ${produced.length} command(s)`);
    }
    log(`ACT 2c: ${placedOrders} build orders placed against an empty stock`);
    report(log, 'ACT 2c — four wall runs laid, nothing bought', await hudDump(page));
    log(`funds now: ${JSON.stringify((await latestCounts(page))?.treasuryMinorUnits)}`);

    // Run the clock, the way a player does when told "built while the clock runs".
    await fastForwardToMax(page);
    log(`clock: ${JSON.stringify(await currentClock(page))}`);
    // Four observations spread over a minute of real time at 4x -- long enough
    // that "it has not happened yet" stops being a plausible reading.
    for (let observation = 1; observation <= 4; observation += 1) {
      await page.waitForTimeout(15_000);
      const dump = await hudDump(page);
      report(log, `ACT 2d.${observation} — clock running 4x, tick ${await currentTick(page)}`, dump);
      log(`counts: ${JSON.stringify(await latestCounts(page))}`);
    }

    // The measurement the retraction's candidate turns on: is the sentence
    // "Awaiting Materials" reachable without unfolding anything?
    const foldedDump = await hudDump(page);
    log(`REACHABILITY: "Awaiting Materials" in the visible HUD while nothing is unfolded? ${/awaiting materials/i.test(foldedDump.text)}`);
    log(`REACHABILITY: queue fold state at this moment: ${JSON.stringify(foldedDump.queue)}`);

    // Now unfold it, which is the thing a player has to know to do.
    if (foldedDump.queue.present && !foldedDump.queue.hidden) {
      await page.locator('.hud-build__queue > .ui-section__header, .hud-build__queue .ui-section__header').first().click();
      await page.waitForTimeout(500);
      const opened = await hudDump(page);
      report(log, 'ACT 2e — queue unfolded by hand', opened);
      log(`REACHABILITY: "Awaiting Materials" once unfolded? ${/awaiting materials/i.test(opened.text)}`);
      log(`.hud-build__queue verbatim: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    }

    // ---------------------------------------------------------------- ACT 3
    // Recovery. Buy bricks with the orders already standing, and see whether
    // the standing orders build themselves.
    const tickBeforeBuy = await currentTick(page);
    await buy(page, 'wall-brick', 60);
    log(`ACT 3a bought 60 bricks at tick ${tickBeforeBuy}; funds now ${JSON.stringify((await latestCounts(page))?.treasuryMinorUnits)}`);
    report(log, 'ACT 3a — right after buying, orders already standing', await hudDump(page));

    let builtAtTick = -1;
    for (let poll = 0; poll < 60; poll += 1) {
      await page.waitForTimeout(2000);
      const queueText = await panelText(page, '.hud-build__queue');
      if (/0 waiting . 0 being built/.test(queueText) || queueText.includes('not laid out') || queueText.includes('ABSENT')) {
        builtAtTick = await currentTick(page);
        break;
      }
      if (poll % 5 === 0) log(`ACT 3b poll ${poll} at tick ${await currentTick(page)}: queue ${JSON.stringify(queueText)}`);
    }
    log(`ACT 3b: the queue emptied at tick ${builtAtTick} (bought at tick ${tickBeforeBuy})`);
    report(log, 'ACT 3b — queue empty, walls should be up', await hudDump(page));

    // ---------------------------------------------------------------- ACT 4
    // Zone again. How many presses does the naive player pay?
    const zoneStarted = Date.now();
    let attempts = 0;
    let zoned = false;
    for (; attempts < 12; ) {
      attempts += 1;
      await tab(page, 'rooms').click();
      const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
      if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
      await page.locator('.hud-rooms__arm').click();
      await drag(page, centreOf(origin, AREA.x0, AREA.y0), centreOf(origin, AREA.x1, AREA.y1));
      const note = await panelText(page, '.hud-rooms');
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(1000);
      const counts = await latestCounts(page);
      log(
        `ACT 4 designate attempt ${attempts} at t+${Date.now() - zoneStarted}ms, tick ${await currentTick(page)}:` +
          ` rooms=${counts?.rooms} | panel said ${JSON.stringify(note.split('\n').filter((l) => /OPEN|ENCLOS/i.test(l)))}`,
      );
      if ((counts?.rooms ?? 0) > 0) {
        zoned = true;
        break;
      }
      await page.waitForTimeout(4000);
    }
    log(`ACT 4: zoned=${zoned} after ${attempts} Designate press(es), ${Date.now() - zoneStarted}ms`);
    report(log, 'ACT 4 — after the naive route finally zones (or gives up)', await hudDump(page));
    log(`final counts: ${JSON.stringify(await latestCounts(page))}`);
  });
});

test.describe('playtest: the naive quantity', () => {
  /**
   * The second naive thing, and the one the first act's result made worth
   * measuring. The first test shows a player *can* place twenty-four wall
   * orders with an empty stock and recover by buying afterwards, so ordering
   * is not a dead end. What it also shows is that **nothing on screen ever
   * states how much material a wall needs**: `wall-brick` requires
   * `[{ itemId: 'item.brick', quantity: 2 }]`
   * (`src/simulation/construction/definition.ts:89`), the catalogue row says
   * only "Brick wall", and the buy control says only
   * `Buy {count} × {material} · {total}`.
   *
   * **The first half of that is no longer true, and it is kept rather than
   * corrected because it is what this test was written against.** Since #901
   * the row states its own price and names the unit it is priced in --
   * `wall-brick` renders as "Brick wall · 80 per segment" -- so a player
   * reading the catalogue can now see that a wall costs 80 and that 80 buys
   * one segment. What the row still does not state is the *material*
   * requirement this paragraph is about: two bricks -- a price in minor units
   * is not a quantity of bricks.
   *
   * **But it is now derivable, which is more than this paragraph claimed and
   * is worth saying rather than glossing.** The buy control quotes the same
   * material at `item.brick`'s own unit price, 40, and the row now quotes 80
   * a segment; a player who puts the two figures side by side gets two bricks
   * per wall by division. So the guess this test plays is still *available*
   * -- nothing on screen states the requirement outright, and nothing invites
   * the comparison -- but it is no longer the only route, and if this test is
   * ever re-run its premise should be re-read rather than assumed.
   *
   * So the player guesses. The obvious guess is **one brick per wall**, and
   * this test plays that guess: buy 24 bricks for a 24-segment perimeter, wait
   * for them, lay the perimeter, and read what the game shows when the crew
   * stops half way.
   */
  test('buy one brick per wall — the obvious guess — and see where it stops', async ({ page }) => {
    test.setTimeout(900_000);
    const log = (line: string) => console.log(`[naive-qty] ${line}`);
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') log(`PAGE ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (error) => log(`PAGE ERROR: ${error.message}`));

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForTimeout(1000);

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    // What the buy disclosure says before a quantity is typed: the whole of it,
    // because "how many does a wall need" would have to be here if it is
    // anywhere.
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    if (await page.locator('.hud-build__buy').isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.waitForTimeout(300);
    log(`BUY disclosure, verbatim, before typing: ${JSON.stringify(await panelText(page, '.hud-build__buy'))}`);
    log(`the selected catalogue row, verbatim: ${JSON.stringify(await panelText(page, '.hud-build__list [data-buildable="wall-brick"]'))}`);
    log(`default quantity in the field: ${JSON.stringify(await page.locator('.hud-build__buy .ui-number__input').inputValue())}`);

    await buy(page, 'wall-brick', 24);
    await fastForwardToMax(page);
    log(`bought 24 bricks; funds now ${JSON.stringify((await latestCounts(page))?.treasuryMinorUnits)}`);

    // Let the delivery land before the orders go in, so nothing here is about
    // the ordering the first test already settled.
    await page.waitForTimeout(12_000);
    log(`deliveries after running: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    await armBuildable(page, 'wall-brick');
    const westX = origin.originX + AREA.x0 * TILE;
    const eastX = origin.originX + (AREA.x1 + 1) * TILE;
    const northY = origin.originY + AREA.y0 * TILE;
    const southY = origin.originY + (AREA.y1 + 1) * TILE;
    let placed = 0;
    for (const run of [
      { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      const before = (await sentCommands(page)).length;
      await drag(page, run.a, run.b);
      placed += (await sentCommands(page)).slice(before).length;
    }
    log(`${placed} wall orders placed against 24 bricks`);

    // Watch it stop. The measurement is where it settles and what it then says.
    let previous = '';
    let stableFor = 0;
    for (let poll = 0; poll < 40; poll += 1) {
      await page.waitForTimeout(3000);
      const queueText = await panelText(page, '.hud-build__queue');
      const headline = queueText.split('\n').slice(0, 2).join(' | ');
      log(`poll ${poll} at tick ${await currentTick(page)}: ${JSON.stringify(headline)}`);
      if (headline === previous) stableFor += 1;
      else stableFor = 0;
      previous = headline;
      if (stableFor >= 5) break;
      if (queueText.includes('not laid out') || queueText.includes('ABSENT')) break;
    }

    report(log, 'STALLED — the crew has stopped and nothing more will happen', await hudDump(page));
    log(`funds at the stall: ${JSON.stringify((await latestCounts(page))?.treasuryMinorUnits)}`);
    log(`queue verbatim, folded state as it stands: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    // The other channel a message could plausibly be in: the Alerts fold,
    // which starts shut (`src/ui/hud/hud-state.ts:51-54`).
    //
    // **Addressed through `.hud-alerts__list`'s enclosing `.ui-section`, not
    // through `.hud-alerts`.** There is no element with that class: the list
    // is `hud-alerts__list` and its section is built by
    // `createCollapsibleSection` with no extra class at all
    // (`src/ui/hud/hud.ts:1252-1263`), so a `.hud-alerts` selector answers
    // `ABSENT` and an unwary reader would write that down as "the game has no
    // alerts panel". It has one; the selector was wrong.
    const alertsInfo = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.hud-alerts__list');
      const section = list?.closest<HTMLElement>('.ui-section') ?? null;
      const header = section?.querySelector<HTMLElement>('.ui-section__header') ?? null;
      return {
        listPresent: list !== null,
        sectionCollapsed: section?.getAttribute('data-collapsed') ?? null,
        headerText: (header?.innerText ?? '').replace(/\n+/g, ' ').trim(),
        headerAriaExpanded: header?.getAttribute('aria-expanded') ?? null,
        listChildCount: list?.childElementCount ?? -1,
        listText: (list?.textContent ?? '').trim(),
      };
    });
    log(`ALERTS fold at the stall: ${JSON.stringify(alertsInfo)}`);
    await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.hud-alerts__list');
      list?.closest<HTMLElement>('.ui-section')?.querySelector<HTMLElement>('.ui-section__header')?.click();
    });
    await page.waitForTimeout(600);
    log(
      `ALERTS unfolded by hand: ${JSON.stringify(
        await page.evaluate(() => {
          const list = document.querySelector<HTMLElement>('.hud-alerts__list');
          const section = list?.closest<HTMLElement>('.ui-section') ?? null;
          return {
            sectionCollapsed: section?.getAttribute('data-collapsed') ?? null,
            listChildCount: list?.childElementCount ?? -1,
            listText: (list?.textContent ?? '').trim(),
          };
        }),
      )}`,
    );

    // And what the player gets for trying to use the half-built perimeter.
    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, AREA.x0, AREA.y0), centreOf(origin, AREA.x1, AREA.y1));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1200);
    log(`zoning the half-built perimeter: rooms=${(await latestCounts(page))?.rooms}`);
    report(log, 'after trying to zone the half-built perimeter', await hudDump(page));

    // Is the stall recoverable at all, once a player works out what it is?
    // Twelve segments still standing at two bricks each is twenty-four more.
    await tab(page, 'build').click();
    await buy(page, 'wall-brick', 24);
    log(`bought 24 more bricks; funds now ${JSON.stringify((await latestCounts(page))?.treasuryMinorUnits)}`);
    let drainedAt = -1;
    for (let poll = 0; poll < 40; poll += 1) {
      await page.waitForTimeout(3000);
      const queueText = await panelText(page, '.hud-build__queue');
      if (queueText.includes('not laid out') || queueText.includes('ABSENT') || /0 waiting . 0 being built/.test(queueText)) {
        drainedAt = await currentTick(page);
        break;
      }
      if (poll % 4 === 0) log(`recovery poll ${poll} at tick ${await currentTick(page)}: ${JSON.stringify(queueText.split('\n').slice(0, 2).join(' | '))}`);
    }
    log(`RECOVERY: the queue drained at tick ${drainedAt}`);

    await tab(page, 'rooms').click();
    const stillCollapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (stillCollapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, AREA.x0, AREA.y0), centreOf(origin, AREA.x1, AREA.y1));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1200);
    log(`RECOVERY: zoning after the second purchase: rooms=${(await latestCounts(page))?.rooms}`);
    report(log, 'RECOVERY — after buying the missing bricks and zoning again', await hudDump(page));
  });
});
