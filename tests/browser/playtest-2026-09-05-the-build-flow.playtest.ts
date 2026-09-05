/**
 * Playtest — the build flow, end to end, many times (2026-09-05).
 *
 * Question as given: *building is this game's primary verb — the thing a
 * player does most, from the first minute to the last. Play it as a whole
 * flow, end to end, many times, and then say what it should be instead.*
 *
 * **Evidence, never a gate.** The suffix is `.playtest.ts` and
 * `tests/browser/playwright.config.ts` collects only `*.spec.ts`, so nothing
 * in CI runs this file. Run one act at a time:
 *
 *   LOCKSTATE_BROWSER_TEST_PORT=5330 node node_modules/@playwright/test/cli.js test \
 *     --config tests/browser/playwright.playtest.config.ts \
 *     tests/browser/playtest-2026-09-05-the-build-flow.playtest.ts -g "act 1"
 *
 * Findings live in `docs/research/2026-09-05-the-build-flow.md`.
 */
import { expect } from '@playwright/test';
import { test } from './network-changed-fixture';
import {
  TILE,
  armBuildable,
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

const log = (line: string) => console.log(line);

/** A box read for a scroll region: the window, the content, and the gutter a scrollbar takes. */
async function scrollBox(page: import('@playwright/test').Page, selector: string) {
  return page.evaluate((sel) => {
    const node = document.querySelector<HTMLElement>(sel);
    if (node === null) return null;
    const rect = node.getBoundingClientRect();
    return {
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      hidden: Math.max(0, node.scrollHeight - node.clientHeight),
      gutter: node.offsetWidth - node.clientWidth,
      rectTop: Math.round(rect.top),
      rectBottom: Math.round(rect.bottom),
      overflowY: getComputedStyle(node).overflowY,
    };
  }, selector);
}

/** How many rows of a list are wholly inside the list's own window. */
async function rowsWhollyVisible(page: import('@playwright/test').Page, listSelector: string, rowSelector: string) {
  return page.evaluate(
    (selectors: { readonly list: string; readonly row: string }) => {
      const box = document.querySelector<HTMLElement>(selectors.list);
      if (box === null) return { total: 0, whole: 0, rowHeight: 0 };
      const rect = box.getBoundingClientRect();
      const rows = [...box.querySelectorAll<HTMLElement>(selectors.row)].filter((r) => !r.hidden);
      let whole = 0;
      for (const r of rows) {
        const rr = r.getBoundingClientRect();
        if (rr.top >= rect.top - 0.5 && rr.bottom <= rect.bottom + 0.5) whole += 1;
      }
      return { total: rows.length, whole, rowHeight: rows[0]?.getBoundingClientRect().height ?? 0 };
    },
    { list: listSelector, row: rowSelector },
  );
}

/** Guards every world press: a press on a HUD-covered point submits nothing at all. */
async function assertCanvasAt(page: import('@playwright/test').Page, x: number, y: number, what: string) {
  const tag = await page.evaluate(
    (point: { readonly x: number; readonly y: number }) => {
      const node = document.elementFromPoint(point.x, point.y);
      return node === null ? 'NONE' : `${node.tagName.toLowerCase()}.${node.className.toString().split(' ')[0] ?? ''}`;
    },
    { x, y },
  );
  if (!tag.startsWith('canvas')) throw new Error(`${what}: (${x},${y}) is over ${tag}, not canvas`);
  return tag;
}

/**
 * Act 1 — the catalogue as a container.
 *
 * How many of the twenty-one rows can a player see, how far do they scroll,
 * what does the category filter change, and what does it cost in presses to
 * reach a named row.
 */
test('act 1: what the catalogue is, measured', async ({ page }) => {
  await installTee(page);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'build').click();
    await page.waitForTimeout(400);

    const label = `${viewport.width}x${viewport.height}`;
    const list = await scrollBox(page, '.hud-build__list');
    const rows = await rowsWhollyVisible(page, '.hud-build__list', '[data-buildable]');
    log(`[A1 ${label}] list ${JSON.stringify(list)}`);
    log(`[A1 ${label}] rows ${JSON.stringify(rows)}`);

    // Every row's label and the order they are in.
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')].map(
        (r, i) => `${i + 1}. ${r.dataset['buildable'] ?? '?'} = ${(r.innerText ?? '').replace(/\n/g, ' ').trim()}`,
      ),
    );
    log(`[A1 ${label}] catalogue order:\n  ${labels.join('\n  ')}`);

    // The category control: is it there, what are its options, what does each do to the scroll?
    const filter = page.locator('.hud-build__category');
    log(`[A1 ${label}] category control count=${await filter.count()}`);
    if ((await filter.count()) > 0) {
      const options = await filter.evaluate((node) =>
        [...(node as HTMLSelectElement).options].map((o) => `${o.value}=${o.text}`),
      );
      log(`[A1 ${label}] category options ${JSON.stringify(options)}`);
      for (const option of await filter.evaluate((node) => [...(node as HTMLSelectElement).options].map((o) => o.value))) {
        await filter.selectOption(option);
        await page.waitForTimeout(150);
        const box = await scrollBox(page, '.hud-build__list');
        const vis = await rowsWhollyVisible(page, '.hud-build__list', '[data-buildable]');
        log(
          `[A1 ${label}] filter=${option} → rows shown ${vis.total}, wholly visible ${vis.whole}, hidden px ${box?.hidden}`,
        );
      }
      await filter.selectOption(await filter.evaluate((n) => (n as HTMLSelectElement).options[0]?.value ?? ''));
    }

    // The panel as a whole: does its content fit its box?
    const body = await scrollBox(page, '.hud-build > .ui-panel__body');
    log(`[A1 ${label}] panel body ${JSON.stringify(body)}`);
    const panel = await scrollBox(page, '.hud-build');
    log(`[A1 ${label}] panel ${JSON.stringify(panel)}`);

    // Anything a player could read as a price, anywhere in the panel, in the arrival state.
    const digits = (await panelText(page, '.hud-build')).match(/\d[\d,.]*/g) ?? [];
    log(`[A1 ${label}] numerals anywhere in the Build panel: ${JSON.stringify(digits)}`);
  }
});

/**
 * Act 2 — reaching one named row, three ways, counted in interactions.
 *
 * The player who wants one specific thing from row seventeen.
 */
test('act 2: the cost of reaching a row', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await tab(page, 'build').click();
  await page.waitForTimeout(400);

  const ids = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')].map((r) => r.dataset['buildable'] ?? '?'),
  );
  log(`[A2] ${ids.length} rows; row 17 is ${ids[16]}`);
  const target = ids[16] as string;

  // (a) scroll to it with the wheel, unfiltered, counting wheel notches.
  const listBox = await page.locator('.hud-build__list').boundingBox();
  if (listBox === null) throw new Error('no list box');
  await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
  let notches = 0;
  for (;;) {
    const onScreen = await page.evaluate((id) => {
      const box = document.querySelector<HTMLElement>('.hud-build__list');
      const row = document.querySelector<HTMLElement>(`[data-buildable="${id}"]`);
      if (box === null || row === null) return false;
      const b = box.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      return r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
    }, target);
    if (onScreen) break;
    if (notches > 60) throw new Error('never reached the row by wheel');
    await page.mouse.wheel(0, 100);
    notches += 1;
    await page.waitForTimeout(30);
  }
  log(`[A2a] unfiltered: ${notches} wheel notches of 100px to bring ${target} wholly into the window`);

  // (b) with the category filter: how many presses, and does the player know which group holds it?
  await page.reload();
  await page.waitForSelector('.hud');
  await tab(page, 'build').click();
  await page.waitForTimeout(300);
  const filter = page.locator('.hud-build__category');
  const options = await filter.evaluate((n) => [...(n as HTMLSelectElement).options].map((o) => ({ v: o.value, t: o.text })));
  let holder: string | undefined;
  for (const option of options) {
    await filter.selectOption(option.v);
    await page.waitForTimeout(120);
    const there = await page.evaluate((id) => {
      const row = document.querySelector<HTMLElement>(`[data-buildable="${id}"]`);
      return row !== null && !row.hidden;
    }, target);
    if (there && option.v !== options[0]?.v) {
      holder = option.t;
      const vis = await rowsWhollyVisible(page, '.hud-build__list', '[data-buildable]');
      log(`[A2b] ${target} is in group "${option.t}" — ${vis.total} rows shown, ${vis.whole} wholly visible`);
      break;
    }
  }
  log(`[A2b] group options a player must choose between: ${JSON.stringify(options.map((o) => o.t))} (holder: ${holder})`);

  // (c) keyboard: is the list a single tab stop, and does typing a letter select?
  await page.reload();
  await page.waitForSelector('.hud');
  await tab(page, 'build').click();
  await page.waitForTimeout(300);
  await page.locator('.hud-build__list [data-buildable]').first().focus();
  const before = await page.evaluate(() => document.activeElement?.getAttribute('data-buildable') ?? 'none');
  await page.keyboard.press('KeyS');
  await page.waitForTimeout(150);
  const afterLetter = await page.evaluate(() => document.activeElement?.getAttribute('data-buildable') ?? 'none');
  let arrows = 0;
  for (;;) {
    const now = await page.evaluate(() => document.activeElement?.getAttribute('data-buildable') ?? 'none');
    if (now === target) break;
    if (arrows > 40) break;
    await page.keyboard.press('ArrowDown');
    arrows += 1;
    await page.waitForTimeout(20);
  }
  const landed = await page.evaluate(() => document.activeElement?.getAttribute('data-buildable') ?? 'none');
  log(`[A2c] focus started ${before}; after typing "s" → ${afterLetter}; ${arrows} ArrowDown → ${landed}`);
});

/**
 * Act 3 — the newcomer, who has never seen this and does the obvious thing.
 *
 * Reads the panel, then tries to fence a square by pressing four tile centres,
 * which is what "build a wall around here" looks like to somebody who has not
 * been told walls go on edges. Everything is counted.
 */
test('act 3: the newcomer', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await tab(page, 'build').click();
  await page.waitForTimeout(400);

  log(`[A3] the Build panel, unread, on arrival:\n${await panelText(page, '.hud-build')}`);
  log(`[A3] the whole HUD's sentences on arrival:\n${await panelText(page, '.hud')}`);

  const origin = await calibrate(page);
  log(`[A3] calibration origin ${JSON.stringify(origin)}`);

  // Arm the wall the way the panel offers it and read the hint the player is given.
  await armBuildable(page, 'wall-brick');
  log(`[A3] hint for wall-brick: ${JSON.stringify(await panelText(page, '.hud-build__note'))}`);

  // Four presses at the four tile centres of a 2x2, which is a fence to a newcomer.
  let refusals = 0;
  let orders = 0;
  for (const [tx, ty] of [
    [14, 12],
    [15, 12],
    [14, 13],
    [15, 13],
  ] as const) {
    const p = centreOf(origin, tx, ty);
    await assertCanvasAt(page, p.x, p.y, `A3 wall at ${tx},${ty}`);
    const commands = await press(page, p.x, p.y);
    const band = await panelText(page, '.hud__refusal');
    if (band !== '.hud__refusal: not laid out') refusals += 1;
    orders += commands.length;
    log(`[A3] press at tile centre (${tx},${ty}) → ${JSON.stringify(commands)} | band ${JSON.stringify(band)}`);
  }
  log(`[A3] four presses at tile centres: ${orders} command(s), ${refusals} refusal band(s)`);
  const afterFence = await latestCounts(page);
  log(`[A3] funds after the newcomer's fence: ${afterFence?.treasuryMinorUnits}`);

  // What did those presses actually put in the world? The queue's own rows.
  await page.locator('.hud-build__queue .ui-section__header').click().catch(() => undefined);
  await page.waitForTimeout(200);
  log(`[A3] queue after the fence:\n${await panelText(page, '.hud-build__queue')}`);

  // Now the newcomer goes to Rooms, drags the same square, and asks for a cell.
  await tab(page, 'rooms').click();
  await page.waitForTimeout(200);
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  log(`[A3] Rooms panel with Cell selected, before any drag:\n${await panelText(page, '.hud-rooms')}`);
  await page.locator('.hud-rooms__arm').click();
  await drag(page, centreOf(origin, 14, 12), centreOf(origin, 15, 13));
  await page.waitForTimeout(200);
  const rectangleAfterDrag = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.hud-rooms');
    return el === null ? 'ABSENT' : (el.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
  });
  log(`[A3] Rooms panel immediately after the drag (mouse already up):\n${rectangleAfterDrag}`);
  const confirm = page.locator('.hud-rooms__confirm');
  log(
    `[A3] the confirm control reads ${JSON.stringify((await confirm.innerText()).trim())}` +
      ` disabled=${await confirm.getAttribute('disabled')} aria-disabled=${await confirm.getAttribute('aria-disabled')}`,
  );
  if ((await confirm.getAttribute('disabled')) === null) {
    await confirm.click();
    await page.waitForTimeout(600);
    log(`[A3] refusal band after Confirm: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  }
  log(`[A3] rooms=${(await latestCounts(page))?.rooms}`);

  // The world's own record of the drag: does the overlay still show the rectangle
  // after mouse-up, or only the panel?
  await page.screenshot({ path: 'test-results/the-build-flow-A3-after-room-drag.png' });
  log('[A3] screenshot written: test-results/the-build-flow-A3-after-room-drag.png');
});

/**
 * Act 4 — the flow, end to end, every interaction ledgered.
 *
 * The returning player who knows the order: walls on the gridlines, room over
 * them, furniture inside. Counted the way a player pays for it.
 */
test('act 4: one cell, end to end, counted', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);

  const ledger: string[] = [];
  let count = 0;
  const act = (what: string) => {
    count += 1;
    ledger.push(`${String(count).padStart(2, ' ')}. ${what}`);
  };

  await page.getByRole('button', { name: 'New prison' }).click();
  act('press New prison');
  await tab(page, 'build').click();
  act('press the Build tab');
  await page.waitForTimeout(400);
  const origin = await calibrate(page);

  const startTick = await currentTick(page);
  const startFunds = (await latestCounts(page))?.treasuryMinorUnits;

  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  act('press the Brick wall row');
  await page.locator('.hud-build__arm').click();
  act('press Place on map');

  const west = origin.originX + 13 * TILE;
  const east = origin.originX + 17 * TILE;
  const north = origin.originY + 12 * TILE;
  const south = origin.originY + 16 * TILE;
  for (const run of [
    { name: 'north', a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
    { name: 'south', a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
    { name: 'west', a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
    { name: 'east', a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
  ]) {
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    act(`drag the ${run.name} wall run`);
    const produced = (await sentCommands(page)).slice(before);
    log(`[A4] ${run.name}: ${produced.length} order(s)`);
  }
  const afterWalls = await latestCounts(page);
  log(`[A4] after four drags: funds ${startFunds} → ${afterWalls?.treasuryMinorUnits}, tick ${await currentTick(page)}`);
  log(`[A4] queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  log(`[A4] Build panel while the walls are queued:\n${await panelText(page, '.hud-build')}`);

  // The clock has to run for anything to be built, and nothing on the Build panel says so.
  await page.locator('.hud-strip__transport button').nth(2).click();
  act('press Fast forward (1x)');
  await page.locator('.hud-strip__transport button').nth(2).click();
  act('press Fast forward (2x)');
  await page.locator('.hud-strip__transport button').nth(2).click();
  act('press Fast forward (4x)');

  const waitedFrom = await currentTick(page);
  for (;;) {
    const text = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out')) break;
    if ((await currentTick(page)) - waitedFrom > 4000) throw new Error(`walls never finished: ${text}`);
    await page.waitForTimeout(700);
  }
  const wallsDoneTick = await currentTick(page);
  log(`[A4] walls finished at tick ${wallsDoneTick} (${wallsDoneTick - waitedFrom} ticks of waiting)`);
  log(`[A4] Build panel the moment the walls are up:\n${await panelText(page, '.hud-build')}`);
  log(`[A4] event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  log(`[A4] status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await tab(page, 'rooms').click();
  act('press the Rooms tab');
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  act('press the Cell row');
  await page.locator('.hud-rooms__arm').click();
  act('press the Rooms arm control');
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await drag(page, centreOf(origin, 13, 12), centreOf(origin, 16, 15));
    if (attempts > 1) act(`drag the room rectangle again (attempt ${attempts})`);
    else act('drag the room rectangle');
    await page.locator('.hud-rooms__confirm').click();
    act(`press Confirm (attempt ${attempts})`);
    await page.waitForTimeout(900);
    const counts = await latestCounts(page);
    if ((counts?.rooms ?? 0) > 0) break;
    log(`[A4] designate attempt ${attempts} refused: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    if (attempts >= 6) throw new Error('the room was never accepted');
    await page.locator('.hud-rooms__arm').click();
    act('re-arm the Rooms tool after a refusal');
    await page.waitForTimeout(2000);
  }
  log(`[A4] zoned after ${attempts} attempt(s) at tick ${await currentTick(page)}`);
  log(`[A4] Rooms panel with the cell zoned and empty:\n${await panelText(page, '.hud-rooms')}`);

  await tab(page, 'build').click();
  act('press the Build tab');
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  act('press the Bed row');
  await page.locator('.hud-build__arm').click();
  act('press Place on map');
  const bedAt = centreOf(origin, 14, 13);
  await assertCanvasAt(page, bedAt.x, bedAt.y, 'A4 bed');
  log(`[A4] bed press → ${JSON.stringify(await press(page, bedAt.x, bedAt.y))}`);
  act('press the tile for the bed');
  await page.locator('.hud-build__list [data-buildable="toilet-brick"]').click();
  act('press the Toilet row');
  const toiletAt = centreOf(origin, 15, 14);
  await assertCanvasAt(page, toiletAt.x, toiletAt.y, 'A4 toilet');
  log(`[A4] toilet press → ${JSON.stringify(await press(page, toiletAt.x, toiletAt.y))}`);
  act('press the tile for the toilet');

  const beforeFurniture = await currentTick(page);
  for (;;) {
    const counts = await latestCounts(page);
    if ((counts?.accommodationCapacity ?? 0) > 0) break;
    if ((await currentTick(page)) - beforeFurniture > 4000) break;
    await page.waitForTimeout(700);
  }
  const done = await latestCounts(page);
  log(`[A4] FINAL: ${JSON.stringify(done)}`);
  log(`[A4] ticks from New prison to a usable cell: ${(done?.tick ?? 0) - startTick}`);
  log(`[A4] money: ${startFunds} → ${done?.treasuryMinorUnits} (spent ${(startFunds ?? 0) - (done?.treasuryMinorUnits ?? 0)})`);
  log(`[A4] INTERACTION LEDGER (${count}):\n${ledger.join('\n')}`);
  log(`[A4] Build panel at the end:\n${await panelText(page, '.hud-build')}`);
  expect(done?.accommodationCapacity ?? 0).toBeGreaterThan(0);
});

/**
 * Act 5 — what a thing costs, and what the player is told about money.
 *
 * How many interactions buy one price; whether the FUNDS chip says anything
 * across the whole positive range; whether a room's total is derivable from
 * anything on screen.
 */
test('act 5: the price of things', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await tab(page, 'build').click();
  await page.waitForTimeout(400);

  const fundsChip = async () =>
    page.evaluate(() => {
      const chips = [...document.querySelectorAll<HTMLElement>('.hud-strip .ui-chip, .hud-strip__metrics > *')];
      const chip = chips.find((c) => /FUNDS/i.test(c.innerText ?? ''));
      if (chip === undefined) return 'NO FUNDS CHIP';
      const badge = chip.querySelector<HTMLElement>('.ui-badge');
      const value = chip.querySelector<HTMLElement>('[class*=value], .ui-chip__value');
      const style = getComputedStyle(value ?? chip);
      return {
        text: (chip.innerText ?? '').replace(/\n/g, ' | '),
        badge: badge === null ? null : { text: badge.innerText, tone: badge.dataset['tone'] ?? null },
        colour: style.color,
        title: chip.getAttribute('title'),
      };
    });

  log(`[A5] FUNDS chip at 25,000: ${JSON.stringify(await fundsChip())}`);

  // How many presses to learn what one wall costs, from the arrival state?
  let presses = 0;
  const buyRow = page.locator('.hud-build__buy');
  log(`[A5] the Buy fold on arrival: hidden=${await buyRow.isHidden()}`);
  await page.locator('.hud-build__buy-toggle').click();
  presses += 1;
  await page.waitForTimeout(200);
  const submitLabel = (await page.locator('.hud-build__buy-submit').innerText()).trim();
  log(`[A5] ${presses} press(es) from arrival → the Buy control reads ${JSON.stringify(submitLabel)}`);
  log(`[A5] the whole Buy fold reads:\n${await panelText(page, '.hud-build__buy')}`);
  const quantityValue = await page.locator('.hud-build__buy .ui-number__input').inputValue();
  log(`[A5] the quantity the fold arrives at: ${quantityValue}`);

  // The same figure for every row: is the default quantity one placement's worth?
  const perRow: string[] = [];
  for (const id of ['wall-brick', 'door-wooden', 'bed-wooden', 'toilet-brick', 'dining-table-wooden', 'chair-wooden']) {
    await page.locator(`.hud-build__list [data-buildable="${id}"]`).click();
    await page.waitForTimeout(150);
    const label = (await page.locator('.hud-build__buy-submit').innerText()).trim();
    const qty = await page.locator('.hud-build__buy .ui-number__input').inputValue();
    perRow.push(`${id}: quantity ${qty}, control reads ${JSON.stringify(label)}`);
  }
  log(`[A5] the Buy control per row:\n  ${perRow.join('\n  ')}`);

  // Now spend most of the balance in one gesture and read the chip again.
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const origin = await calibrate(page);
  await armBuildable(page, 'wall-brick');
  const before = (await latestCounts(page))?.treasuryMinorUnits;
  // A very long run: 60 tiles of wall along one gridline.
  const y = origin.originY + 20 * TILE;
  await drag(page, { x: origin.originX + 12 * TILE + TILE / 2, y }, { x: origin.originX + 40 * TILE, y });
  await page.waitForTimeout(400);
  const afterOne = (await latestCounts(page))?.treasuryMinorUnits;
  log(`[A5] one long drag: funds ${before} → ${afterOne} (spent ${(before ?? 0) - (afterOne ?? 0)})`);
  log(`[A5] FUNDS chip after that drag: ${JSON.stringify(await fundsChip())}`);

  // Keep going until the balance is at or below zero, reading the chip at each step.
  for (let run = 0; run < 12; run += 1) {
    const counts = await latestCounts(page);
    if ((counts?.treasuryMinorUnits ?? 0) <= 0) break;
    const runY = origin.originY + (21 + run) * TILE;
    await drag(page, { x: origin.originX + 12 * TILE + TILE / 2, y: runY }, { x: origin.originX + 40 * TILE, y: runY });
    await page.waitForTimeout(300);
    const now = await latestCounts(page);
    log(`[A5] run ${run + 2}: funds ${now?.treasuryMinorUnits} | chip ${JSON.stringify(await fundsChip())}`);
  }
  log(`[A5] refusal band at the end: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
});

/**
 * Act 6 — what a player sees while a thing is queued, being built, and finished.
 *
 * The world, tightly clipped, at each of the three phases, plus what the panel
 * and the event band say at each.
 */
test('act 6: queued, building, finished', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await tab(page, 'build').click();
  await page.waitForTimeout(400);
  const origin = await calibrate(page);

  // A clip around tiles 12..19 x 11..18, which is canvas at this viewport.
  const clip = {
    x: origin.originX + 12 * TILE,
    y: origin.originY + 11 * TILE,
    width: 8 * TILE,
    height: 8 * TILE,
  };
  const shot = async (name: string) => {
    await page.screenshot({ path: `test-results/the-build-flow-${name}.png`, clip });
    log(`[A6] screenshot ${name}`);
  };

  await shot('P0-bare-ground');

  // Four wall runs, queued and paused.
  await armBuildable(page, 'wall-brick');
  const west = origin.originX + 13 * TILE;
  const east = origin.originX + 17 * TILE;
  const north = origin.originY + 12 * TILE;
  const south = origin.originY + 16 * TILE;
  for (const run of [
    { a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
    { a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
    { a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
    { a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
  ]) {
    await drag(page, run.a, run.b);
  }
  await page.mouse.move(20, 500);
  await page.waitForTimeout(300);
  await shot('P1-sixteen-walls-queued-paused');
  log(`[A6] queued, paused — queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  log(`[A6] queued, paused — event band ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  log(`[A6] queued, paused — status strip ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  // Being built.
  await page.locator('.hud-strip__transport button').nth(1).click();
  for (;;) {
    const text = await panelText(page, '.hud-build__queue');
    if (/[1-9]\d* being built/.test(text)) {
      log(`[A6] being built — queue ${JSON.stringify(text)}`);
      break;
    }
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out')) break;
    await page.waitForTimeout(400);
  }
  await page.mouse.move(20, 500);
  await shot('P2-being-built');
  log(`[A6] being built — event band ${JSON.stringify(await panelText(page, '.hud__event'))}`);

  // Finished.
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.locator('.hud-strip__transport button').nth(2).click();
  const from = await currentTick(page);
  for (;;) {
    const text = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out')) break;
    if ((await currentTick(page)) - from > 4000) break;
    await page.waitForTimeout(500);
  }
  await page.mouse.move(20, 500);
  await shot('P3-finished');
  log(`[A6] finished — event band ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  log(`[A6] finished — alerts ${JSON.stringify(await panelText(page, '.hud-alerts'))}`);
  log(`[A6] finished — status strip ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  // Now a bed inside a zoned cell, in all three phases.
  await tab(page, 'rooms').click();
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  await page.locator('.hud-rooms__arm').click();
  await drag(page, centreOf(origin, 13, 12), centreOf(origin, 16, 15));
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(1200);
  log(`[A6] rooms=${(await latestCounts(page))?.rooms}`);
  await page.locator('.hud-strip__transport button').nth(0).click();
  await page.mouse.move(20, 500);
  await shot('P4-zoned-cell-empty');

  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  const bed = centreOf(origin, 14, 13);
  await assertCanvasAt(page, bed.x, bed.y, 'A6 bed');
  await press(page, bed.x, bed.y);
  await page.mouse.move(20, 500);
  await page.waitForTimeout(300);
  await shot('P5-bed-queued-in-cell');
  log(`[A6] bed queued — queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.locator('.hud-strip__transport button').nth(2).click();
  const from2 = await currentTick(page);
  for (;;) {
    const counts = await latestCounts(page);
    if ((counts?.accommodationCapacity ?? 0) > 0) break;
    if ((await currentTick(page)) - from2 > 3000) break;
    await page.waitForTimeout(400);
  }
  await page.mouse.move(20, 500);
  await shot('P6-bed-finished-in-cell');
  log(`[A6] bed finished — accommodationCapacity ${(await latestCounts(page))?.accommodationCapacity}`);
  log(`[A6] bed finished — event band ${JSON.stringify(await panelText(page, '.hud__event'))}`);
});

/**
 * Act 7 — the screen, as area.
 *
 * What every HUD island takes, what the catalogue gets of it, and how much of
 * the canvas a build gesture can reach.
 */
test('act 7: the screen as area', async ({ page }) => {
  await installTee(page);
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'build').click();
    await page.waitForTimeout(400);
    const label = `${viewport.width}x${viewport.height}`;
    log(`[A7 ${label}] catalogue list ${JSON.stringify(await scrollBox(page, '.hud-build__list'))}`);
    log(`[A7 ${label}] rooms list ${JSON.stringify(await scrollBox(page, '.hud-rooms__list'))}`);

    const census = await page.evaluate(() => {
      const boxes: { what: string; x: number; y: number; w: number; h: number; area: number }[] = [];
      const selectors = [
        '.hud-strip',
        '.hud__refusal',
        '.hud__event',
        '.hud-minimap',
        '.hud-minimap__surface',
        '.hud-alerts__list',
        '.save-panel',
        '.hud__scale',
        '.hud-build',
        '.hud__tabs',
        '.hud-build__catalogue',
        '.hud-build__list',
        '.hud-build__map',
        '.hud-build__coordinates',
      ];
      for (const selector of selectors) {
        for (const node of document.querySelectorAll<HTMLElement>(selector)) {
          const r = node.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          boxes.push({
            what: selector,
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
            area: Math.round(r.width * r.height),
          });
        }
      }
      return { boxes, screen: window.innerWidth * window.innerHeight };
    });
    log(`[A7 ${label}] screen area ${census.screen}px²`);
    for (const b of census.boxes) {
      log(
        `[A7 ${label}] ${b.what.padEnd(28)} ${String(b.w).padStart(4)}x${String(b.h).padStart(4)} at ${b.x},${b.y}` +
          ` = ${b.area}px² (${((b.area / census.screen) * 100).toFixed(1)}% of screen)`,
      );
    }

    // The minimap island, which says it has nothing in it.
    log(`[A7 ${label}] minimap says: ${JSON.stringify(await panelText(page, '.hud-minimap'))}`);
  }
});

/**
 * Act 8 — the FUNDS chip across the whole positive range and over the edge.
 *
 * Spends the grant down through zero with the Buy control, reading the chip's
 * text, badge and colour at every step, so the range over which the money
 * readout says nothing is measured rather than derived.
 */
test('act 8: what the money readout says', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await tab(page, 'build').click();
  await page.waitForTimeout(400);

  const fundsChip = async () =>
    page.evaluate(() => {
      const chips = [...document.querySelectorAll<HTMLElement>('.hud-strip__metrics > *')];
      const chip = chips.find((c) => /FUNDS/i.test(c.innerText ?? ''));
      if (chip === undefined) return 'NO FUNDS CHIP';
      const badge = chip.querySelector<HTMLElement>('[class*=badge]');
      const value = chip.querySelector<HTMLElement>('[class*=value]') ?? chip;
      return {
        text: (chip.innerText ?? '').replace(/\n/g, ' | '),
        badge: badge === null ? null : (badge.innerText ?? '').trim(),
        badgeTone: badge?.dataset['tone'] ?? null,
        colour: getComputedStyle(value).color,
        title: chip.getAttribute('title'),
      };
    });

  await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(200);
  const field = page.locator('.hud-build__buy .ui-number__input');
  const max = await field.evaluate((n) => (n as HTMLInputElement).max);
  log(`[A8] the quantity field's max is ${JSON.stringify(max)}`);

  const readings: string[] = [];
  for (let round = 0; round < 40; round += 1) {
    const counts = await latestCounts(page);
    const funds = counts?.treasuryMinorUnits ?? 0;
    const chip = await fundsChip();
    readings.push(`funds ${funds} → ${JSON.stringify(chip)}`);
    if (funds < -2000) break;
    await field.fill('100');
    const submit = page.locator('.hud-build__buy-submit');
    if ((await submit.getAttribute('disabled')) !== null) {
      log(`[A8] the Buy control refuses at funds ${funds}: ${JSON.stringify((await submit.innerText()).trim())}`);
      log(`[A8] shortfall line: ${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}`);
      break;
    }
    await submit.click({ timeout: 5000 }).catch((error: unknown) => log(`[A8] Buy press failed at funds ${funds}: ${String(error).split('\n')[0]}`));
    await page.waitForTimeout(350);
  }
  log(`[A8] the FUNDS chip, every reading:\n  ${readings.join('\n  ')}`);
  log(`[A8] final strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
});

/**
 * Act 9 — how long after a wall is built does it appear.
 *
 * Act 6 measured the world byte-identical at queued, being built and finished.
 * This is the refuting sample: the clip is hashed every second from the moment
 * the queue empties until the pixels change, and the camera is nudged at the
 * end to establish whether the frame was stale or the wall genuinely looks the
 * same finished as planned.
 */
test('act 9: when the wall appears', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await tab(page, 'build').click();
  await page.waitForTimeout(400);
  const origin = await calibrate(page);
  const clip = { x: origin.originX + 12 * TILE, y: origin.originY + 11 * TILE, width: 8 * TILE, height: 8 * TILE };
  const { createHash } = await import('node:crypto');
  const hash = async () => createHash('md5').update(await page.screenshot({ clip })).digest('hex').slice(0, 10);

  const bare = await hash();
  log(`[A9] bare ground: ${bare}`);

  await armBuildable(page, 'wall-brick');
  const y = origin.originY + 12 * TILE;
  await drag(
    page,
    { x: origin.originX + 13 * TILE + TILE / 2, y },
    { x: origin.originX + 17 * TILE - TILE / 2, y },
  );
  await page.mouse.move(20, 500);
  await page.waitForTimeout(400);
  const queued = await hash();
  log(`[A9] four walls queued (paused): ${queued} — differs from bare: ${queued !== bare}`);

  await page.locator('.hud-strip__transport button').nth(1).click();
  const startedAt = Date.now();
  let emptiedAtMs: number | undefined;
  let emptiedAtTick: number | undefined;
  const samples: string[] = [];
  for (let i = 0; i < 90; i += 1) {
    const text = await panelText(page, '.hud-build__queue');
    const empty = /(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out');
    if (empty && emptiedAtMs === undefined) {
      emptiedAtMs = Date.now() - startedAt;
      emptiedAtTick = await currentTick(page);
      log(`[A9] the panel said the queue was empty at t+${emptiedAtMs}ms, tick ${emptiedAtTick}`);
    }
    await page.mouse.move(20, 500);
    const h = await hash();
    samples.push(`t+${Date.now() - startedAt}ms tick ${await currentTick(page)} queue ${JSON.stringify(text.replace(/\n/g, ' '))} clip ${h}${h === queued ? ' (SAME AS QUEUED)' : ' (CHANGED)'}`);
    if (emptiedAtMs !== undefined && h !== queued) break;
    if (emptiedAtMs !== undefined && Date.now() - startedAt - emptiedAtMs > 45_000) break;
    await page.waitForTimeout(1000);
  }
  log(`[A9] samples:\n  ${samples.join('\n  ')}`);

  // Force a repaint by nudging the camera, and see whether that is what
  // brings the finished wall onto the screen.
  const afterWait = await hash();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  await page.mouse.move(20, 500);
  const afterNudge = await hash();
  log(`[A9] clip before the camera nudge ${afterWait}, after ${afterNudge} — nudge changed it: ${afterWait !== afterNudge}`);
  await page.screenshot({ path: 'test-results/the-build-flow-A9-after-nudge.png', clip });
});

/**
 * Act 10 — is there room on a catalogue row for a price?
 *
 * Measures what marks the selected row today, what the `Selected` badge takes,
 * and how much of a 238px row the longest label leaves.
 */
test('act 10: what fits on a row', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await tab(page, 'build').click();
  await page.waitForTimeout(400);

  const rows = await page.evaluate(() => {
    const out: Record<string, unknown>[] = [];
    for (const row of document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')) {
      const label = row.querySelector<HTMLElement>('.ui-row__label');
      const badge = row.querySelector<HTMLElement>('[class*=badge]');
      const icon = row.querySelector<HTMLElement>('svg, [class*=icon]');
      const r = row.getBoundingClientRect();
      const lr = label?.getBoundingClientRect();
      out.push({
        id: row.dataset['buildable'],
        selected: row.getAttribute('aria-checked'),
        background: getComputedStyle(row).backgroundColor,
        rowWidth: Math.round(r.width),
        labelText: label?.textContent ?? '',
        labelWidth: lr === undefined ? 0 : Math.round(lr.width),
        labelScrollWidth: label?.scrollWidth ?? 0,
        labelClipped: label === null ? null : label.scrollWidth > Math.ceil(label.getBoundingClientRect().width),
        badgeText: badge?.textContent ?? null,
        badgeWidth: badge === null ? 0 : Math.round(badge.getBoundingClientRect().width),
        iconWidth: icon === null ? 0 : Math.round(icon.getBoundingClientRect().width),
      });
    }
    return out;
  });
  for (const row of rows) log(`[A10] ${JSON.stringify(row)}`);

  // The same question for the Rooms catalogue, which the flow also crosses.
  await tab(page, 'rooms').click();
  await page.waitForTimeout(300);
  log(`[A10] rooms list ${JSON.stringify(await scrollBox(page, '.hud-rooms__list'))}`);
  const roomRows = await rowsWhollyVisible(page, '.hud-rooms__list', '[data-room]');
  log(`[A10] rooms rows ${JSON.stringify(roomRows)}`);
  const roomIds = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-rooms__list [data-room]')].map((r) => r.dataset['room'] ?? '?'),
  );
  log(`[A10] ${roomIds.length} room rows: ${JSON.stringify(roomIds)}`);

  // And the save panel, the third instance of the shape.
  log(`[A10] save panel list ${JSON.stringify(await scrollBox(page, '.save-panel__list'))}`);
});
