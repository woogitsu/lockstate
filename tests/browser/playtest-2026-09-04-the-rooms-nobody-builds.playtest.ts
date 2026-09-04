import { expect, test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buy,
  calibrate,
  centreOf,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  openApp,
  panelText,
  press,
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **The rooms nobody builds.**
 *
 * Every play session in this repository so far has built one cell and stopped
 * — or, once, a cell and a shower room
 * (`docs/research/2026-09-04-is-there-anything-to-do.md` act 5). The
 * catalogue offers **eighteen** room types. This file builds four of them in
 * one prison and asks whether serving a need does anything a player can see.
 *
 * ## What the record already establishes, and what this extends
 *
 * `2026-09-04-is-there-anything-to-do.md` established, by playing:
 * - a room with no door is useless and every readout says it is fine;
 * - a shower room *with* a door works — `Hygiene` 0% → 98%, replicated three
 *   times;
 * - `room.yard` was attempted three times and **placed zero times**, each
 *   failure an instrument or viewport problem rather than a game one.
 *
 * So `room.canteen` and `room.yard` have never been built by anybody in a
 * playtest in this repository, and the second, third and fourth room of a
 * prison have never coexisted. That is what this file does.
 *
 * ## The design, and why it is within-subject
 *
 * One prison. **Everything physical is built first** — the canteen's walls,
 * tables and benches; the cell's walls, beds and toilet; the shower room's
 * walls and heads; three wooden doors — in a single queue drain. Then the
 * rooms are **designated one at a time**, with in-game days between, so each
 * room's arrival is a step change against the same four prisoners rather than
 * against a differently-seeded run:
 *
 * | phase | what exists | days | the need under test |
 * | --- | --- | --- | --- |
 * | 0 | the cell alone | 3 | the baseline: hunger, hygiene, recreation all falling |
 * | 1 | + `room.canteen` | 2 | `hunger` — and `action.eat-in-cell` already serves it at 3/tick against the canteen's 4 (`src/simulation/prisoners/actions.ts:120-127`), so this phase is a test of whether the canteen is a *no-op* |
 * | 2 | + `room.shower-room` | 3 | `hygiene`, whose only other route is `action.laundry-work` at 1/tick |
 * | 3 | + `room.yard` | 3 | `recreation`, decaying at 0.015/tick with nothing in a cell serving it |
 *
 * The confound is stated rather than hidden: a later phase is also a *later*
 * phase, and needs decay with time. The reading that survives it is
 * **direction** — a need that rises when a room opens rose because of the
 * room, and a need that keeps falling after a room opens was not served by it.
 *
 * ## Geometry, and why it is not `buildAndPopulate`'s
 *
 * `2026-09-04-is-there-anything-to-do.md` §0 measured the clear canvas at
 * 1440×900 as **x = 11..22, y = 10..21** — twelve by twelve, 144 tiles — and
 * the whole world as one 32×32 chunk. Three walled rooms have to fit in those
 * twelve rows:
 *
 * ```
 *        x=12 .. 17   18 .. 20
 * y=11   +----------+              canteen (12,11)-(17,16), 6x6
 *  ..    |  canteen |              door: west edge of (18,13)
 * y=16   +----------+
 * y=17     corridor row 17
 * y=18   +--------+ +--------+     cell   (12,18)-(16,20), 5x3, door west edge of (17,19)
 *  ..    |  cell  |^| shower |     shower (18,18)-(20,20), 3x3, door west edge of (18,19)
 * y=20   +--------+ +--------+     ^ = corridor column 17
 * ```
 *
 * and `room.yard` needs 8×8 of *outdoors* — no walls, no objects, no money
 * (`src/content/room-catalog.ts`, `room.yard`) — which does not fit in what is
 * left, so it is placed after a camera pan, at world tiles chosen to provably
 * miss the three rooms and then checked tile by tile for clear canvas.
 *
 * ## Instrumentation rules, each inherited and each paid for
 *
 * 1. **Two channels, never mixed.** Numbers from `simulation/status-counts`
 *    through the tee; sentences from `.hud` `innerText`; ticks from
 *    `simulation/clock-state`.
 * 2. **`innerText` is an UPPER BOUND** on what a player can read — it ignores
 *    a scroll container's clipping.
 * 3. **Every world press is checked with `document.elementFromPoint` first.**
 *    A press on a HUD-covered point submits nothing at all.
 * 4. **A designation counts only if the room count went UP.** `rooms > 0` is
 *    true of every designation after the first and hid a failed yard once.
 *
 * Findings live in `docs/research/2026-09-04-the-rooms-nobody-builds.md`.
 */

type Page = import('@playwright/test').Page;

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}
interface Origin {
  readonly originX: number;
  readonly originY: number;
}

/*
 * **Every rectangle boundary is inside measured-clear canvas, and that is what
 * fixed the geometry rather than taste.**
 *
 * A wall run is dragged along a rectangle's *boundary line*, which sits on the
 * seam between two tiles — 32px from either tile centre — so a rectangle whose
 * interior tiles are all clear can still have a boundary the HUD covers.
 * `2026-09-04-is-there-anything-to-do.md` §0 measured tile *centres*; act 1 of
 * this file re-measured them at v0.0.471 and they agree (x = 12..22 clear for
 * y = 10..21). The boundaries used below are therefore held to k = 11..21 on y
 * and 12..21 on x, which keeps every drag endpoint at least 32px inside a
 * clear tile in both directions.
 */
const CANTEEN: Rect = { x0: 12, y0: 11, x1: 17, y1: 16 };
const CELL: Rect = { x0: 12, y0: 18, x1: 16, y1: 20 };
const SHOWER: Rect = { x0: 18, y0: 18, x1: 20, y1: 20 };
/** The last tile a new prison has ground on: one 32x32 chunk (`new SparseWorld(32)`). */
const WORLD_LAST_TILE = 31;

/** The whole HUD as laid out. An UPPER BOUND (rule 2). */
async function screen(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    if (hud === null) return 'HUD ABSENT';
    return (hud.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
  });
}

async function rawCountsSeries(page: Page): Promise<readonly { tick: number; counts: Record<string, unknown> }[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: readonly unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/status-counts')
      .map((message) => {
        const payload = (message as { payload: { tick: number; counts: Record<string, unknown> } }).payload;
        return { tick: payload.tick, counts: payload.counts };
      }),
  );
}

async function latestRawCounts(page: Page): Promise<{ tick: number; counts: Record<string, unknown> } | undefined> {
  const series = await rawCountsSeries(page);
  return series[series.length - 1];
}

/** Every simulation event the worker has pushed, flattened to `type` strings in order. */
async function eventTypes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const message of (window as unknown as { lockstateFromWorker?: readonly unknown[] }).lockstateFromWorker ?? []) {
      const typed = message as { kind?: string; payload?: { event?: { type?: string } } };
      if (typed.kind !== 'simulation/event') continue;
      out.push(typed.payload?.event?.type ?? '(untyped)');
    }
    return out;
  });
}

function deltaVector(
  before: { tick: number; counts: Record<string, unknown> },
  after: { tick: number; counts: Record<string, unknown> },
): string {
  const keys = [...new Set([...Object.keys(before.counts), ...Object.keys(after.counts)])].sort();
  const moved: string[] = [];
  const still: string[] = [];
  for (const key of keys) {
    const a = JSON.stringify(before.counts[key]);
    const b = JSON.stringify(after.counts[key]);
    if (a === b) still.push(key);
    else moved.push(`${key}: ${a} -> ${b}`);
  }
  return (
    `ticks ${before.tick} -> ${after.tick} (${after.tick - before.tick} ticks)\n` +
    `  MOVED (${moved.length}/${keys.length}): ${moved.length === 0 ? '(nothing)' : moved.join(' | ')}\n` +
    `  STILL (${still.length}/${keys.length}): ${still.join(', ')}`
  );
}

async function topmostAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py]) => {
      const element = document.elementFromPoint(px as number, py as number);
      if (element === null) return 'nothing';
      return `${element.tagName.toLowerCase()}${element.className === '' ? '' : `.${String(element.className)}`}`;
    },
    [x, y],
  );
}

async function assertCanvasAt(page: Page, x: number, y: number, label: string): Promise<void> {
  const top = await topmostAt(page, x, y);
  expect(top, `${label}: the point (${Math.round(x)},${Math.round(y)}) is not clear canvas, so a press there proves nothing`).toContain('canvas');
}

async function clearanceMap(page: Page, origin: Origin): Promise<string> {
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  const firstX = Math.ceil(-origin.originX / TILE);
  const lastX = Math.floor((viewport.width - origin.originX) / TILE) - 1;
  const firstY = Math.ceil(-origin.originY / TILE);
  const lastY = Math.floor((viewport.height - origin.originY) / TILE) - 1;
  const lines: string[] = [`clearance map, tiles x=${firstX}..${lastX} y=${firstY}..${lastY} ('.' = clear canvas, '#' = something on top)`];
  let header = '      ';
  for (let x = firstX; x <= lastX; x += 1) header += String(x % 10);
  lines.push(header);
  for (let y = firstY; y <= lastY; y += 1) {
    let row = `y=${String(y).padStart(2, ' ')}  `;
    for (let x = firstX; x <= lastX; x += 1) {
      const point = centreOf(origin, x, y);
      // eslint-disable-next-line no-await-in-loop -- a sequential probe of one real DOM.
      const top = await topmostAt(page, point.x, point.y);
      row += top.includes('canvas') ? '.' : '#';
    }
    lines.push(row);
  }
  return lines.join('\n');
}

/**
 * A wall run along one side of a rectangle, optionally split around one edge
 * left open for a door.
 */
async function wallSide(
  page: Page,
  label: string,
  origin: Origin,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await assertCanvasAt(page, from.x, from.y, `${label} start`);
  await assertCanvasAt(page, to.x, to.y, `${label} end`);
  const before = (await sentCommands(page)).length;
  await drag(page, from, to);
  const produced = (await sentCommands(page)).slice(before);
  console.log(
    `[${label}]: ${produced.length} command(s) -> ` +
      JSON.stringify(produced.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`)),
  );
}

/** Designates a room, retrying, and counting success as an INCREASE in `rooms`. */
async function designate(
  page: Page,
  label: string,
  roomId: string,
  origin: Origin,
  bounds: Rect,
  maxAttempts = 8,
): Promise<number> {
  const before = Number((await latestRawCounts(page))?.counts['rooms'] ?? 0);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await tab(page, 'rooms').click({ timeout: 15_000 });
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click({ timeout: 15_000 });
    await page.locator(`.hud-rooms__list [data-room="${roomId}"]`).click({ timeout: 15_000 });
    await page.locator('.hud-rooms__arm').click({ timeout: 15_000 });
    await drag(page, centreOf(origin, bounds.x0, bounds.y0), centreOf(origin, bounds.x1, bounds.y1));
    const note = await panelText(page, '.hud-rooms');
    await page.locator('.hud-rooms__confirm').click({ timeout: 15_000 });
    await page.waitForTimeout(900);
    const counts = await latestRawCounts(page);
    console.log(
      `[${label}] designate ${roomId} attempt ${attempt}: rooms=${String(counts?.counts['rooms'])} (was ${before})` +
        ` | panel said ${JSON.stringify(note.split('\n').filter((line) => /OPEN|ENCLOS|OUTDOOR|SIZE|need|MISSING/i.test(line)))}` +
        ` | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    if (Number(counts?.counts['rooms'] ?? 0) > before) return attempt;
    await page.waitForTimeout(3000);
  }
  return -1;
}

/**
 * The Regime tab's roster and the needs of whoever is selected.
 *
 * Copied in shape from `playtest-2026-09-04-is-there-anything-to-do.playtest.ts`,
 * including its second press: the inspector is a *toggle* on the row, so a run
 * that inherits a selection gets an empty inspector from a press that worked.
 */
async function needsReadout(page: Page, label: string): Promise<string> {
  await tab(page, 'regime').click({ timeout: 15_000 });
  const rows = page.locator('.hud-regime__roster-row');
  const count = await rows.count();
  if (count === 0) return `${label}: no roster rows`;
  const box = await rows.first().boundingBox();
  if (box === null) return `${label}: the first roster row has no box`;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  let detail = await panelText(page, '.hud-regime__detail');
  if (detail.includes('not laid out')) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    detail = await panelText(page, '.hud-regime__detail');
  }
  const roster = (await panelText(page, '.hud-regime__roster')).replace(/\n/g, ' | ');
  return `${label}: ${count} roster row(s); detail = ${JSON.stringify(detail.replace(/\n/g, ' | '))}; roster = ${JSON.stringify(roster)}`;
}

/** Runs the clock forward to `target` ticks. */
async function runToTick(page: Page, label: string, target: number, sampleEveryMs = 4000, timeoutMs = 600_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= target) return;
    if (Date.now() - started > timeoutMs) {
      console.log(`[${label}] GAVE UP waiting for tick ${target}; the clock reads ${tick} after ${Date.now() - started}ms`);
      return;
    }
    await page.waitForTimeout(sampleEveryMs);
  }
}

/**
 * The first 8x8 world rectangle that both **misses every walled room** and is
 * **all clear canvas** at the current camera.
 *
 * Two filters rather than one, and the second alone is what act 5 of
 * `2026-09-04-is-there-anything-to-do.md` used: a room's tiles are painted on
 * the canvas, so `document.elementFromPoint` calls them clear, and that run's
 * yard was refused *"it overlaps a room that is already there."* The overlap
 * test is arithmetic over rectangles this file already knows; the clear test
 * is the DOM.
 */
async function firstClearYard(page: Page, origin: Origin, rooms: readonly Rect[] = [CANTEEN, CELL, SHOWER]): Promise<Rect | undefined> {
  const overlaps = (a: Rect, b: Rect): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
  const candidates: Rect[] = [];
  for (let y0 = 8; y0 <= 18; y0 += 1) {
    for (let x0 = 17; x0 <= 24; x0 += 1) {
      const rect: Rect = { x0, y0, x1: x0 + 7, y1: y0 + 7 };
      if (rect.x1 > WORLD_LAST_TILE || rect.y1 > WORLD_LAST_TILE) continue;
      if (rooms.some((room) => overlaps(rect, room))) continue;
      candidates.push(rect);
    }
  }
  console.log(`[yard] ${candidates.length} candidate rectangle(s) miss every room and fit the map`);
  const cache = new Map<string, boolean>();
  const tileClear = async (x: number, y: number): Promise<boolean> => {
    const key = `${x},${y}`;
    const known = cache.get(key);
    if (known !== undefined) return known;
    const point = centreOf(origin, x, y);
    const answer = (await topmostAt(page, point.x, point.y)).includes('canvas');
    cache.set(key, answer);
    return answer;
  };
  for (const rect of candidates) {
    let ok = true;
    for (let y = rect.y0; y <= rect.y1 && ok; y += 1) {
      for (let x = rect.x0; x <= rect.x1 && ok; x += 1) {
        // eslint-disable-next-line no-await-in-loop -- one real DOM, memoised.
        ok = await tileClear(x, y);
      }
    }
    if (ok) return rect;
  }
  return undefined;
}

test.describe('the rooms nobody builds', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60_000);
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(`[console.error] ${message.text().slice(0, 300)}`);
    });
    await installTee(page);
  });

  /**
   * **Act 1 — what a player can find out about a room before they pay for it.**
   *
   * Eighteen room types are offered. This act clicks every one of them in the
   * Rooms panel and dumps what the panel then says, and dumps every row of the
   * Build catalogue with its detail. The question is the brief's: *what does a
   * room cost, and does the game let you find out before you commit?*
   */
  test('act 1 - the catalogue a player buys from', async ({ page }) => {
    test.setTimeout(600_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click({ timeout: 30_000 });
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'rooms').click({ timeout: 15_000 });
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click({ timeout: 15_000 });

    const roomRows = page.locator('.hud-rooms__list [data-room]');
    const roomIds = await roomRows.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-room') ?? '(none)'));
    console.log(`[act1] the Rooms catalogue offers ${roomIds.length} type(s): ${JSON.stringify(roomIds)}`);

    for (const roomId of roomIds) {
      const row = page.locator(`.hud-rooms__list [data-room="${roomId}"]`);
      const rowText = (await row.innerText()).replace(/\n/g, ' | ').trim();
      const boxed = (await row.boundingBox()) !== null;
      await row.click({ timeout: 15_000 });
      await page.waitForTimeout(150);
      const rules = await panelText(page, '.hud-rooms__rule-block');
      const area = await panelText(page, '.hud-rooms__area');
      console.log(
        `[act1] ${roomId}: row=${JSON.stringify(rowText)} boxed=${boxed}\n` +
          `        rules = ${JSON.stringify(rules.replace(/\n/g, ' | '))}\n` +
          `        area  = ${JSON.stringify(area.replace(/\n/g, ' | '))}`,
      );
    }

    console.log(`[act1] the whole Rooms tab with nothing built (UPPER BOUND):\n${await screen(page)}`);

    await tab(page, 'build').click({ timeout: 15_000 });
    const buildRows = page.locator('.hud-build__list [data-buildable]');
    const buildIds = await buildRows.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-buildable') ?? '(none)'));
    console.log(`[act1] the Build catalogue offers ${buildIds.length} row(s): ${JSON.stringify(buildIds)}`);
    for (const id of buildIds) {
      const row = page.locator(`.hud-build__list [data-buildable="${id}"]`);
      const rowText = (await row.innerText()).replace(/\n/g, ' | ').trim();
      await row.click({ timeout: 15_000 });
      await page.waitForTimeout(120);
      const arm = (await page.locator('.hud-build__arm').innerText()).replace(/\n/g, ' | ').trim();
      const detail = await panelText(page, '.hud-build__detail');
      console.log(`[act1] ${id}: row=${JSON.stringify(rowText)} | arm=${JSON.stringify(arm)} | detail=${JSON.stringify(detail.replace(/\n/g, ' | '))}`);
    }
    console.log(`[act1] the whole Build tab (UPPER BOUND):\n${await screen(page)}`);
    console.log(`[act1] the status strip: ${JSON.stringify((await panelText(page, '.hud-strip')).replace(/\n/g, ' | '))}`);
  });

  /**
   * **Act 2 — four rooms zoned before anything is furnished, and the rule that
   * makes that impossible.**
   *
   * This act was written to build everything physically first and then
   * designate the rooms one at a time, so each room's arrival would be a step
   * change. **It cannot be played that way, and the run is kept because
   * finding that out is the measurement.** Every one of the eleven object
   * placements was refused with *"The object was not placed — it has to stand
   * in a room you have zoned."*, so the prison it produced is four zoned rooms
   * with **no bed, no toilet, no table, no shower head** — and a population of
   * four admitted prisoners who never leave intake.
   *
   * What it is therefore evidence for, and act 3 is the corrected build:
   * - the object-before-zone refusal, quoted from a real press;
   * - **`room.yard` designated and accepted, on the first attempt** — the
   *   first time in this repository a playtest has placed one;
   * - what a four-room prison looks like when nobody can be housed in it.
   */
  test('act 2 - four rooms zoned before anything is furnished', async ({ page }) => {
    test.setTimeout(2_400_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click({ timeout: 30_000 });
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click({ timeout: 15_000 });
    const origin = await calibrate(page);
    console.log(`[act2] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
    console.log(`[act2] ${await clearanceMap(page, origin)}`);

    /*
     * Materials, bought once.
     *
     * 47 wall segments (24 + 14 + 12, less three door edges) at 2 bricks each
     * is 94; a toilet is 1 and two shower heads are 2 apiece, so 99 bricks.
     * Planks: three doors, four beds, two 3-wide dining tables at 3 each and
     * four 2-wide benches at 2 each is 21. Bought with slack, because a short
     * delivery stalls the queue and reads as a broken build.
     */
    for (const order of [
      { id: 'wall-brick', quantity: 120 },
      { id: 'door-wooden', quantity: 5 },
      { id: 'bed-wooden', quantity: 6 },
      { id: 'toilet-brick', quantity: 3 },
      { id: 'shower-head-brick', quantity: 6 },
      { id: 'dining-table-wooden', quantity: 8 },
      { id: 'bench-wooden', quantity: 10 },
    ]) {
      await page.locator(`.hud-build__list [data-buildable="${order.id}"]`).click({ timeout: 15_000 });
      const buyRow = page.locator('.hud-build__buy');
      if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click({ timeout: 15_000 });
      await page.locator('.hud-build__buy .ui-number__input').fill(String(order.quantity));
      await page.waitForTimeout(200);
      /*
       * **The one price a player is ever shown, captured where it is shown.**
       * `buySubmit.setLabel` is fed `count` and the total
       * `material.unitPriceMinorUnits * quantity` (`src/ui/hud/build-panel.ts`,
       * the `const total =` line in the buy-row updater), so the Buy control's
       * own text is the only figure in the game that says what anything costs.
       */
      console.log(`[act2] buy ${order.id} x${order.quantity}: the control reads ${JSON.stringify((await page.locator('.hud-build__buy-submit').innerText()).trim())}`);
      await buy(page, order.id, order.quantity);
    }
    console.log(`[act2] strip after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    await fastForwardToMax(page);
    await page.waitForTimeout(6000);
    console.log(`[act2] deliveries after running: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    console.log(`[act2] strip after the deliveries: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

    // ---- walls ----
    await armBuildable(page, 'wall-brick');
    const edgeX = (tx: number) => origin.originX + tx * TILE;
    const edgeY = (ty: number) => origin.originY + ty * TILE;
    const midX = (tx: number) => centreOf(origin, tx, 0).x;
    const midY = (ty: number) => centreOf(origin, 0, ty).y;

    // Canteen: full perimeter except the east edge at y=12, where the door goes.
    await wallSide(page, 'act2 canteen north', origin, { x: midX(CANTEEN.x0), y: edgeY(CANTEEN.y0) }, { x: midX(CANTEEN.x1), y: edgeY(CANTEEN.y0) });
    await wallSide(page, 'act2 canteen south', origin, { x: midX(CANTEEN.x0), y: edgeY(CANTEEN.y1 + 1) }, { x: midX(CANTEEN.x1), y: edgeY(CANTEEN.y1 + 1) });
    await wallSide(page, 'act2 canteen west', origin, { x: edgeX(CANTEEN.x0), y: midY(CANTEEN.y0) }, { x: edgeX(CANTEEN.x0), y: midY(CANTEEN.y1) });
    await wallSide(page, 'act2 canteen east above door', origin, { x: edgeX(CANTEEN.x1 + 1), y: midY(CANTEEN.y0) }, { x: edgeX(CANTEEN.x1 + 1), y: midY(12) });
    await wallSide(page, 'act2 canteen east below door', origin, { x: edgeX(CANTEEN.x1 + 1), y: midY(14) }, { x: edgeX(CANTEEN.x1 + 1), y: midY(CANTEEN.y1) });

    // Cell: full perimeter except the east edge at y=18.
    await wallSide(page, 'act2 cell north', origin, { x: midX(CELL.x0), y: edgeY(CELL.y0) }, { x: midX(CELL.x1), y: edgeY(CELL.y0) });
    await wallSide(page, 'act2 cell south', origin, { x: midX(CELL.x0), y: edgeY(CELL.y1 + 1) }, { x: midX(CELL.x1), y: edgeY(CELL.y1 + 1) });
    await wallSide(page, 'act2 cell west', origin, { x: edgeX(CELL.x0), y: midY(CELL.y0) }, { x: edgeX(CELL.x0), y: midY(CELL.y1) });
    await wallSide(page, 'act2 cell east above door', origin, { x: edgeX(CELL.x1 + 1), y: midY(18) }, { x: edgeX(CELL.x1 + 1), y: midY(18) });
    await wallSide(page, 'act2 cell east below door', origin, { x: edgeX(CELL.x1 + 1), y: midY(20) }, { x: edgeX(CELL.x1 + 1), y: midY(20) });

    // Shower: full perimeter except the west edge at y=18.
    await wallSide(page, 'act2 shower north', origin, { x: midX(SHOWER.x0), y: edgeY(SHOWER.y0) }, { x: midX(SHOWER.x1), y: edgeY(SHOWER.y0) });
    await wallSide(page, 'act2 shower south', origin, { x: midX(SHOWER.x0), y: edgeY(SHOWER.y1 + 1) }, { x: midX(SHOWER.x1), y: edgeY(SHOWER.y1 + 1) });
    await wallSide(page, 'act2 shower east', origin, { x: edgeX(SHOWER.x1 + 1), y: midY(SHOWER.y0) }, { x: edgeX(SHOWER.x1 + 1), y: midY(SHOWER.y1) });
    await wallSide(page, 'act2 shower west above door', origin, { x: edgeX(SHOWER.x0), y: midY(18) }, { x: edgeX(SHOWER.x0), y: midY(18) });
    await wallSide(page, 'act2 shower west below door', origin, { x: edgeX(SHOWER.x0), y: midY(20) }, { x: edgeX(SHOWER.x0), y: midY(20) });

    // ---- doors ----
    await armBuildable(page, 'door-wooden');
    for (const door of [
      { name: 'canteen door', x: edgeX(CANTEEN.x1 + 1), y: midY(13), expect: '18,13 west' },
      { name: 'cell door', x: edgeX(CELL.x1 + 1), y: midY(19), expect: '17,19 west' },
      { name: 'shower door', x: edgeX(SHOWER.x0), y: midY(19), expect: '18,19 west' },
    ]) {
      await assertCanvasAt(page, door.x, door.y, `act2 ${door.name}`);
      const produced = await press(page, door.x, door.y);
      console.log(
        `[act2] ${door.name} at (${Math.round(door.x)},${Math.round(door.y)}), wanted ${door.expect}: ` +
          `${produced.length} command(s) -> ${JSON.stringify(produced)}`,
      );
    }

    // ---- objects ----
    const place = async (buildableId: string, tiles: readonly (readonly [number, number])[]): Promise<void> => {
      await armBuildable(page, buildableId);
      for (const [x, y] of tiles) {
        const point = centreOf(origin, x, y);
        // eslint-disable-next-line no-await-in-loop -- one real pointer.
        await assertCanvasAt(page, point.x, point.y, `act2 ${buildableId} at (${x},${y})`);
        // eslint-disable-next-line no-await-in-loop -- one real pointer.
        const produced = await press(page, point.x, point.y);
        console.log(
          // eslint-disable-next-line no-await-in-loop -- one real pointer.
          `[act2] ${buildableId} at (${x},${y}): ${produced.length} command(s) | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
        );
      }
    };
    // Beds are 1x2, so each covers rows 18-19; four of them across the cell.
    await place('bed-wooden', [[12, 18], [13, 18], [14, 18], [15, 18]]);
    await place('toilet-brick', [[12, 20]]);
    await place('shower-head-brick', [[20, 18], [20, 20]]);
    // Dining tables are 3x2, benches 2x1.
    await place('dining-table-wooden', [[12, 11], [15, 11]]);
    await place('bench-wooden', [[12, 14], [14, 14], [16, 14], [12, 16]]);

    const queueMs = await waitForQueueEmpty(page, 600_000);
    console.log(`[act2] the Build panel says the queue is empty after ${queueMs}ms, at tick ${await currentTick(page)}`);
    await page.waitForTimeout(3000);
    console.log(`[act2] strip once everything is built: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    console.log(`[act2] counts once everything is built: ${JSON.stringify(await latestRawCounts(page))}`);

    // ---- phase 0: the cell alone ----
    const cellAttempts = await designate(page, 'act2', 'room.cell', origin, CELL);
    console.log(`[act2] the cell was accepted on attempt ${cellAttempts}`);
    expect(cellAttempts, 'the cell was never accepted, so nothing below measures anything').toBeGreaterThan(0);

    await tab(page, 'overview').click({ timeout: 15_000 });
    for (let index = 0; index < 4; index += 1) {
      await page.locator('.hud-intake__admit').click({ timeout: 30_000 });
      await page.waitForTimeout(250);
    }
    await tab(page, 'security').click({ timeout: 15_000 });
    await page.locator('.hud-staff__hire').click({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    const admitted = await latestRawCounts(page);
    console.log(`[act2] four prisoners, one guard, one cell: ${JSON.stringify(admitted)}`);
    console.log(`[act2] ${await needsReadout(page, 'phase 0 day 0 (cell only)')}`);

    let tickCursor = await currentTick(page);
    for (let day = 1; day <= 3; day += 1) {
      await runToTick(page, 'act2', tickCursor + day * 2400, 3000, 400_000);
      console.log(`[act2] ${await needsReadout(page, `phase 0 day +${day} (cell only)`)}`);
    }
    const phase0End = await latestRawCounts(page);
    if (admitted !== undefined && phase0End !== undefined) console.log(`[act2] DELTA phase 0, cell only\n${deltaVector(admitted, phase0End)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act2] the screen at the end of phase 0, one cell (UPPER BOUND):\n${await screen(page)}`);

    // ---- phase 1: the canteen ----
    const canteenAttempts = await designate(page, 'act2', 'room.canteen', origin, CANTEEN);
    console.log(`[act2] the canteen was accepted on attempt ${canteenAttempts}`);
    const withCanteen = await latestRawCounts(page);
    if (phase0End !== undefined && withCanteen !== undefined) console.log(`[act2] DELTA the moment the canteen opened\n${deltaVector(phase0End, withCanteen)}`);
    console.log(`[act2] the screen the moment the canteen opened (UPPER BOUND):\n${await screen(page)}`);
    console.log(`[act2] ${await needsReadout(page, 'phase 1 day 0 (canteen just opened)')}`);
    tickCursor = await currentTick(page);
    for (let day = 1; day <= 2; day += 1) {
      await runToTick(page, 'act2', tickCursor + day * 2400, 3000, 400_000);
      console.log(`[act2] ${await needsReadout(page, `phase 1 day +${day} (canteen)`)}`);
    }
    const phase1End = await latestRawCounts(page);
    if (withCanteen !== undefined && phase1End !== undefined) console.log(`[act2] DELTA phase 1, two days with a canteen\n${deltaVector(withCanteen, phase1End)}`);

    // ---- phase 2: the shower room ----
    const showerAttempts = await designate(page, 'act2', 'room.shower-room', origin, SHOWER);
    console.log(`[act2] the shower room was accepted on attempt ${showerAttempts}`);
    const withShower = await latestRawCounts(page);
    if (phase1End !== undefined && withShower !== undefined) console.log(`[act2] DELTA the moment the shower room opened\n${deltaVector(phase1End, withShower)}`);
    console.log(`[act2] ${await needsReadout(page, 'phase 2 day 0 (shower just opened)')}`);
    tickCursor = await currentTick(page);
    for (let day = 1; day <= 3; day += 1) {
      await runToTick(page, 'act2', tickCursor + day * 2400, 3000, 400_000);
      console.log(`[act2] ${await needsReadout(page, `phase 2 day +${day} (canteen + shower)`)}`);
    }
    const phase2End = await latestRawCounts(page);
    if (withShower !== undefined && phase2End !== undefined) console.log(`[act2] DELTA phase 2, three days with a shower room\n${deltaVector(withShower, phase2End)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act2] the screen with three rooms (UPPER BOUND):\n${await screen(page)}`);
    await tab(page, 'rooms').click({ timeout: 15_000 });
    console.log(`[act2] the Rooms tab with three working rooms (UPPER BOUND):\n${await screen(page)}`);

    // ---- phase 3: the yard ----
    /*
     * The yard needs 8x8 of outdoors and the clear rectangle is twelve by
     * twelve with three rooms in it, so the camera moves. Candidates are
     * world rectangles chosen to provably miss all three rooms; the first
     * whose sixty-four tile centres are all clear canvas is the one used.
     */
    const focus = centreOf(origin, 21, 12);
    await assertCanvasAt(page, focus.x, focus.y, 'act2 camera-focus point');
    await page.mouse.click(focus.x, focus.y);
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1500);
    await tab(page, 'build').click({ timeout: 15_000 });
    const panned = await calibrate(page);
    console.log(`[act2] after 6 ArrowRight the origin is (${panned.originX}, ${panned.originY}); it was (${origin.originX}, ${origin.originY})`);
    console.log(`[act2] ${await clearanceMap(page, panned)}`);

    const yard = await firstClearYard(page, panned);
    console.log(`[act2] the yard rectangle chosen: ${JSON.stringify(yard)}`);
    expect(yard, 'no 8x8 rectangle both misses the three rooms and is clear canvas after panning').toBeDefined();
    if (yard === undefined) return;

    const yardAttempts = await designate(page, 'act2', 'room.yard', panned, yard);
    console.log(`[act2] the yard was accepted on attempt ${yardAttempts}`);
    const withYard = await latestRawCounts(page);
    if (phase2End !== undefined && withYard !== undefined) console.log(`[act2] DELTA the moment the yard opened\n${deltaVector(phase2End, withYard)}`);
    console.log(`[act2] ${await needsReadout(page, 'phase 3 day 0 (yard just opened)')}`);
    tickCursor = await currentTick(page);
    for (let day = 1; day <= 3; day += 1) {
      await runToTick(page, 'act2', tickCursor + day * 2400, 3000, 400_000);
      console.log(`[act2] ${await needsReadout(page, `phase 3 day +${day} (four rooms)`)}`);
    }
    const phase3End = await latestRawCounts(page);
    if (withYard !== undefined && phase3End !== undefined) console.log(`[act2] DELTA phase 3, three days with four rooms\n${deltaVector(withYard, phase3End)}`);
    if (admitted !== undefined && phase3End !== undefined) console.log(`[act2] DELTA the whole act: one cell -> four rooms\n${deltaVector(admitted, phase3End)}`);
    console.log(`[act2] events over the whole act: ${JSON.stringify(await eventTypes(page))}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act2] the four-room prison, Overview (UPPER BOUND):\n${await screen(page)}`);
    await tab(page, 'rooms').click({ timeout: 15_000 });
    console.log(`[act2] the four-room prison, Rooms (UPPER BOUND):\n${await screen(page)}`);
    await tab(page, 'regime').click({ timeout: 15_000 });
    console.log(`[act2] the four-room prison, Regime (UPPER BOUND):\n${await screen(page)}`);
    await tab(page, 'security').click({ timeout: 15_000 });
    console.log(`[act2] the four-room prison, Security (UPPER BOUND):\n${await screen(page)}`);
    await tab(page, 'build').click({ timeout: 15_000 });
    console.log(`[act2] the four-room prison, Build (UPPER BOUND):\n${await screen(page)}`);
  });

  /**
   * **Act 3 — the same four rooms, in the order the game actually allows.**
   *
   * Act 2 built every object before any room was zoned and the worker refused
   * every one of them: *"The object was not placed — it has to stand in a room
   * you have zoned."* So the order is fixed here, per room, and it is the
   * order a player is forced into: **wall, door, designate, furnish** — and
   * only then does the room do anything.
   *
   * | phase | what is added | days after |
   * | --- | --- | --- |
   * | 0 | the cell, furnished, four prisoners, one guard | 3 |
   * | 1 | + `room.canteen`, two dining tables and four benches | 3 |
   * | 2 | + `room.shower-room`, two shower heads | 3 |
   * | 3 | + `room.yard`, no walls, no objects, no money | 3 |
   */
  test('act 3 - four rooms, built in the order the game allows', async ({ page }) => {
    test.setTimeout(2_400_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click({ timeout: 30_000 });
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click({ timeout: 15_000 });
    const origin = await calibrate(page);
    console.log(`[act3] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    for (const order of [
      { id: 'wall-brick', quantity: 120 },
      { id: 'door-wooden', quantity: 5 },
      { id: 'bed-wooden', quantity: 6 },
      { id: 'toilet-brick', quantity: 3 },
      { id: 'shower-head-brick', quantity: 6 },
      { id: 'dining-table-wooden', quantity: 8 },
      { id: 'bench-wooden', quantity: 10 },
    ]) {
      await buy(page, order.id, order.quantity);
    }
    console.log(`[act3] strip after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    await fastForwardToMax(page);
    await page.waitForTimeout(6000);

    const edgeX = (tx: number) => origin.originX + tx * TILE;
    const edgeY = (ty: number) => origin.originY + ty * TILE;
    const midX = (tx: number) => centreOf(origin, tx, 0).x;
    const midY = (ty: number) => centreOf(origin, 0, ty).y;

    const place = async (label: string, buildableId: string, tiles: readonly (readonly [number, number])[]): Promise<void> => {
      await tab(page, 'build').click({ timeout: 15_000 });
      await armBuildable(page, buildableId);
      for (const [x, y] of tiles) {
        const point = centreOf(origin, x, y);
        // eslint-disable-next-line no-await-in-loop -- one real pointer.
        await assertCanvasAt(page, point.x, point.y, `${label} ${buildableId} at (${x},${y})`);
        // eslint-disable-next-line no-await-in-loop -- one real pointer.
        const produced = await press(page, point.x, point.y);
        console.log(
          // eslint-disable-next-line no-await-in-loop -- one real pointer.
          `[${label}] ${buildableId} at (${x},${y}): ${produced.length} command(s) | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
        );
      }
    };

    // ---------- phase 0: the cell ----------
    await tab(page, 'build').click({ timeout: 15_000 });
    await armBuildable(page, 'wall-brick');
    await wallSide(page, 'act3 cell north', origin, { x: midX(CELL.x0), y: edgeY(CELL.y0) }, { x: midX(CELL.x1), y: edgeY(CELL.y0) });
    await wallSide(page, 'act3 cell south', origin, { x: midX(CELL.x0), y: edgeY(CELL.y1 + 1) }, { x: midX(CELL.x1), y: edgeY(CELL.y1 + 1) });
    await wallSide(page, 'act3 cell west', origin, { x: edgeX(CELL.x0), y: midY(CELL.y0) }, { x: edgeX(CELL.x0), y: midY(CELL.y1) });
    await wallSide(page, 'act3 cell east above door', origin, { x: edgeX(CELL.x1 + 1), y: midY(18) }, { x: edgeX(CELL.x1 + 1), y: midY(18) });
    await wallSide(page, 'act3 cell east below door', origin, { x: edgeX(CELL.x1 + 1), y: midY(20) }, { x: edgeX(CELL.x1 + 1), y: midY(20) });
    await armBuildable(page, 'door-wooden');
    await assertCanvasAt(page, edgeX(CELL.x1 + 1), midY(19), 'act3 cell door');
    console.log(`[act3] cell door: ${JSON.stringify(await press(page, edgeX(CELL.x1 + 1), midY(19)))}`);
    await waitForQueueEmpty(page, 400_000);
    await page.waitForTimeout(2000);
    const cellAttempts = await designate(page, 'act3', 'room.cell', origin, CELL);
    console.log(`[act3] the cell was accepted on attempt ${cellAttempts}`);
    expect(cellAttempts, 'the cell was never accepted, so nothing below measures anything').toBeGreaterThan(0);
    await place('act3', 'bed-wooden', [[12, 18], [13, 18], [14, 18], [15, 18]]);
    await place('act3', 'toilet-brick', [[12, 20]]);
    await waitForQueueEmpty(page, 400_000);
    await page.waitForTimeout(3000);
    console.log(`[act3] the furnished cell: ${JSON.stringify(await latestRawCounts(page))}`);

    await tab(page, 'overview').click({ timeout: 15_000 });
    for (let index = 0; index < 4; index += 1) {
      await page.locator('.hud-intake__admit').click({ timeout: 30_000 });
      await page.waitForTimeout(250);
    }
    await tab(page, 'security').click({ timeout: 15_000 });
    await page.locator('.hud-staff__hire').click({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    const admitted = await latestRawCounts(page);
    console.log(`[act3] four prisoners, one guard, one furnished cell: ${JSON.stringify(admitted)}`);
    console.log(`[act3] ${await needsReadout(page, 'phase 0 day 0 (cell only)')}`);
    let cursor = await currentTick(page);
    for (let day = 1; day <= 3; day += 1) {
      await runToTick(page, 'act3', cursor + day * 2400, 3000, 400_000);
      console.log(`[act3] ${await needsReadout(page, `phase 0 day +${day} (cell only)`)}`);
    }
    const phase0 = await latestRawCounts(page);
    if (admitted !== undefined && phase0 !== undefined) console.log(`[act3] DELTA phase 0, cell only\n${deltaVector(admitted, phase0)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act3] the one-cell prison, Overview (UPPER BOUND):\n${await screen(page)}`);

    // ---------- phase 1: the canteen ----------
    await tab(page, 'build').click({ timeout: 15_000 });
    await armBuildable(page, 'wall-brick');
    await wallSide(page, 'act3 canteen north', origin, { x: midX(CANTEEN.x0), y: edgeY(CANTEEN.y0) }, { x: midX(CANTEEN.x1), y: edgeY(CANTEEN.y0) });
    await wallSide(page, 'act3 canteen south', origin, { x: midX(CANTEEN.x0), y: edgeY(CANTEEN.y1 + 1) }, { x: midX(CANTEEN.x1), y: edgeY(CANTEEN.y1 + 1) });
    await wallSide(page, 'act3 canteen west', origin, { x: edgeX(CANTEEN.x0), y: midY(CANTEEN.y0) }, { x: edgeX(CANTEEN.x0), y: midY(CANTEEN.y1) });
    await wallSide(page, 'act3 canteen east above door', origin, { x: edgeX(CANTEEN.x1 + 1), y: midY(CANTEEN.y0) }, { x: edgeX(CANTEEN.x1 + 1), y: midY(12) });
    await wallSide(page, 'act3 canteen east below door', origin, { x: edgeX(CANTEEN.x1 + 1), y: midY(14) }, { x: edgeX(CANTEEN.x1 + 1), y: midY(CANTEEN.y1) });
    await armBuildable(page, 'door-wooden');
    await assertCanvasAt(page, edgeX(CANTEEN.x1 + 1), midY(13), 'act3 canteen door');
    console.log(`[act3] canteen door: ${JSON.stringify(await press(page, edgeX(CANTEEN.x1 + 1), midY(13)))}`);
    await waitForQueueEmpty(page, 400_000);
    await page.waitForTimeout(2000);
    const canteenAttempts = await designate(page, 'act3', 'room.canteen', origin, CANTEEN);
    console.log(`[act3] the canteen was accepted on attempt ${canteenAttempts}`);
    await place('act3', 'dining-table-wooden', [[12, 11], [15, 11]]);
    await place('act3', 'bench-wooden', [[12, 14], [14, 14], [16, 14], [12, 16]]);
    await waitForQueueEmpty(page, 400_000);
    await page.waitForTimeout(3000);
    const withCanteen = await latestRawCounts(page);
    console.log(`[act3] the canteen, walled, zoned and furnished: ${JSON.stringify(withCanteen)}`);
    if (phase0 !== undefined && withCanteen !== undefined) console.log(`[act3] DELTA the canteen arriving\n${deltaVector(phase0, withCanteen)}`);
    await tab(page, 'rooms').click({ timeout: 15_000 });
    console.log(`[act3] the Rooms tab with a working cell and a working canteen (UPPER BOUND):\n${await screen(page)}`);
    console.log(`[act3] ${await needsReadout(page, 'phase 1 day 0 (canteen open)')}`);
    cursor = await currentTick(page);
    for (let day = 1; day <= 3; day += 1) {
      await runToTick(page, 'act3', cursor + day * 2400, 3000, 400_000);
      console.log(`[act3] ${await needsReadout(page, `phase 1 day +${day} (cell + canteen)`)}`);
    }
    const phase1 = await latestRawCounts(page);
    if (withCanteen !== undefined && phase1 !== undefined) console.log(`[act3] DELTA phase 1, three days with a canteen\n${deltaVector(withCanteen, phase1)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act3] the two-room prison, Overview (UPPER BOUND):\n${await screen(page)}`);

    // ---------- phase 2: the shower room ----------
    await tab(page, 'build').click({ timeout: 15_000 });
    await armBuildable(page, 'wall-brick');
    await wallSide(page, 'act3 shower north', origin, { x: midX(SHOWER.x0), y: edgeY(SHOWER.y0) }, { x: midX(SHOWER.x1), y: edgeY(SHOWER.y0) });
    await wallSide(page, 'act3 shower south', origin, { x: midX(SHOWER.x0), y: edgeY(SHOWER.y1 + 1) }, { x: midX(SHOWER.x1), y: edgeY(SHOWER.y1 + 1) });
    await wallSide(page, 'act3 shower east', origin, { x: edgeX(SHOWER.x1 + 1), y: midY(SHOWER.y0) }, { x: edgeX(SHOWER.x1 + 1), y: midY(SHOWER.y1) });
    await wallSide(page, 'act3 shower west above door', origin, { x: edgeX(SHOWER.x0), y: midY(18) }, { x: edgeX(SHOWER.x0), y: midY(18) });
    await wallSide(page, 'act3 shower west below door', origin, { x: edgeX(SHOWER.x0), y: midY(20) }, { x: edgeX(SHOWER.x0), y: midY(20) });
    await armBuildable(page, 'door-wooden');
    await assertCanvasAt(page, edgeX(SHOWER.x0), midY(19), 'act3 shower door');
    console.log(`[act3] shower door: ${JSON.stringify(await press(page, edgeX(SHOWER.x0), midY(19)))}`);
    await waitForQueueEmpty(page, 400_000);
    await page.waitForTimeout(2000);
    const showerAttempts = await designate(page, 'act3', 'room.shower-room', origin, SHOWER);
    console.log(`[act3] the shower room was accepted on attempt ${showerAttempts}`);
    await place('act3', 'shower-head-brick', [[20, 18], [20, 20]]);
    await waitForQueueEmpty(page, 400_000);
    await page.waitForTimeout(3000);
    const withShower = await latestRawCounts(page);
    console.log(`[act3] the shower room, walled, zoned and furnished: ${JSON.stringify(withShower)}`);
    if (phase1 !== undefined && withShower !== undefined) console.log(`[act3] DELTA the shower room arriving\n${deltaVector(phase1, withShower)}`);
    console.log(`[act3] ${await needsReadout(page, 'phase 2 day 0 (shower open)')}`);
    cursor = await currentTick(page);
    for (let day = 1; day <= 3; day += 1) {
      await runToTick(page, 'act3', cursor + day * 2400, 3000, 400_000);
      console.log(`[act3] ${await needsReadout(page, `phase 2 day +${day} (cell + canteen + shower)`)}`);
    }
    const phase2 = await latestRawCounts(page);
    if (withShower !== undefined && phase2 !== undefined) console.log(`[act3] DELTA phase 2, three days with a shower room\n${deltaVector(withShower, phase2)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act3] the three-room prison, Overview (UPPER BOUND):\n${await screen(page)}`);

    // ---------- phase 3: the yard ----------
    const focus = centreOf(origin, 21, 12);
    await assertCanvasAt(page, focus.x, focus.y, 'act3 camera-focus point');
    await page.mouse.click(focus.x, focus.y);
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1500);
    await tab(page, 'build').click({ timeout: 15_000 });
    const panned = await calibrate(page);
    console.log(`[act3] after 6 ArrowRight the origin is (${panned.originX}, ${panned.originY}); it was (${origin.originX}, ${origin.originY})`);
    const yard = await firstClearYard(page, panned);
    console.log(`[act3] the yard rectangle chosen: ${JSON.stringify(yard)}`);
    expect(yard, 'no 8x8 rectangle both misses the three rooms and is clear canvas after panning').toBeDefined();
    if (yard === undefined) return;
    const yardAttempts = await designate(page, 'act3', 'room.yard', panned, yard);
    console.log(`[act3] the yard was accepted on attempt ${yardAttempts}`);
    const withYard = await latestRawCounts(page);
    if (phase2 !== undefined && withYard !== undefined) console.log(`[act3] DELTA the yard arriving\n${deltaVector(phase2, withYard)}`);
    console.log(`[act3] ${await needsReadout(page, 'phase 3 day 0 (yard open)')}`);
    cursor = await currentTick(page);
    for (let day = 1; day <= 3; day += 1) {
      await runToTick(page, 'act3', cursor + day * 2400, 3000, 400_000);
      console.log(`[act3] ${await needsReadout(page, `phase 3 day +${day} (four rooms)`)}`);
    }
    const phase3 = await latestRawCounts(page);
    if (withYard !== undefined && phase3 !== undefined) console.log(`[act3] DELTA phase 3, three days with four rooms\n${deltaVector(withYard, phase3)}`);
    if (admitted !== undefined && phase3 !== undefined) console.log(`[act3] DELTA the whole act: one cell -> four rooms\n${deltaVector(admitted, phase3)}`);
    console.log(`[act3] events over the whole act: ${JSON.stringify(await eventTypes(page))}`);
    for (const which of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
      await tab(page, which).click({ timeout: 15_000 });
      console.log(`[act3] the four-room prison, ${which} (UPPER BOUND):\n${await screen(page)}`);
    }
  });


  /**
   * **Act 4 — one whole in-game day, sampled across it, in the finished
   * four-room prison.**
   *
   * Acts 2 and 3 read the roster at *day boundaries*, and a day boundary in
   * `GENERAL_POPULATION_REGIME` is inside the `[0, 400)` sleep block
   * (`src/simulation/prisoners/regime.ts:107`). So both acts sampled the same
   * ninety seconds of every prisoner's day and could not have seen a meal, a
   * shower or a yard session however well the rooms worked — the meal blocks
   * are `[400, 500)`, `[1200, 1300)` and `[2000, 2100)`, hygiene is
   * `[400, 500)`, `[1800, 2000)` and `[2100, 2300)`, and recreation is
   * `[1000, 1200)`, `[1800, 2000)` and `[2100, 2300)`.
   *
   * **That is a defect in acts 2 and 3 as instruments and this act is the
   * repair.** It builds the same four rooms in one pass with no phase days,
   * lets the prison settle for two in-game days, and then samples the whole
   * roster roughly every two seconds of page time for one full 2,400-tick day,
   * printing the tick, the tick-of-day, the regime block it falls in and what
   * each of the four prisoners is doing. What a room is *for* is a verb on
   * that roster: `Eating`, `Showering`, `Yard Time`, `Heading to …`.
   */
  test('act 4 - a whole day in the four-room prison, sampled across it', async ({ page }) => {
    test.setTimeout(2_400_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click({ timeout: 30_000 });
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click({ timeout: 15_000 });
    const origin = await calibrate(page);
    console.log(`[act4] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    for (const order of [
      { id: 'wall-brick', quantity: 120 },
      { id: 'door-wooden', quantity: 5 },
      { id: 'bed-wooden', quantity: 6 },
      { id: 'toilet-brick', quantity: 3 },
      { id: 'shower-head-brick', quantity: 6 },
      { id: 'dining-table-wooden', quantity: 8 },
      { id: 'bench-wooden', quantity: 10 },
    ]) {
      await buy(page, order.id, order.quantity);
    }
    await fastForwardToMax(page);
    await page.waitForTimeout(6000);

    const edgeX = (tx: number) => origin.originX + tx * TILE;
    const edgeY = (ty: number) => origin.originY + ty * TILE;
    const midX = (tx: number) => centreOf(origin, tx, 0).x;
    const midY = (ty: number) => centreOf(origin, 0, ty).y;
    const place = async (buildableId: string, tiles: readonly (readonly [number, number])[]): Promise<void> => {
      await tab(page, 'build').click({ timeout: 15_000 });
      await armBuildable(page, buildableId);
      for (const [x, y] of tiles) {
        const point = centreOf(origin, x, y);
        // eslint-disable-next-line no-await-in-loop -- one real pointer.
        await assertCanvasAt(page, point.x, point.y, `act4 ${buildableId} at (${x},${y})`);
        // eslint-disable-next-line no-await-in-loop -- one real pointer.
        const produced = await press(page, point.x, point.y);
        console.log(
          // eslint-disable-next-line no-await-in-loop -- one real pointer.
          `[act4] ${buildableId} at (${x},${y}): ${produced.length} command(s) | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
        );
      }
    };

    // All three perimeters and all three doors in one pass, then zone, then furnish.
    await tab(page, 'build').click({ timeout: 15_000 });
    await armBuildable(page, 'wall-brick');
    await wallSide(page, 'act4 cell north', origin, { x: midX(CELL.x0), y: edgeY(CELL.y0) }, { x: midX(CELL.x1), y: edgeY(CELL.y0) });
    await wallSide(page, 'act4 cell south', origin, { x: midX(CELL.x0), y: edgeY(CELL.y1 + 1) }, { x: midX(CELL.x1), y: edgeY(CELL.y1 + 1) });
    await wallSide(page, 'act4 cell west', origin, { x: edgeX(CELL.x0), y: midY(CELL.y0) }, { x: edgeX(CELL.x0), y: midY(CELL.y1) });
    await wallSide(page, 'act4 cell east above door', origin, { x: edgeX(CELL.x1 + 1), y: midY(18) }, { x: edgeX(CELL.x1 + 1), y: midY(18) });
    await wallSide(page, 'act4 cell east below door', origin, { x: edgeX(CELL.x1 + 1), y: midY(20) }, { x: edgeX(CELL.x1 + 1), y: midY(20) });
    await wallSide(page, 'act4 canteen north', origin, { x: midX(CANTEEN.x0), y: edgeY(CANTEEN.y0) }, { x: midX(CANTEEN.x1), y: edgeY(CANTEEN.y0) });
    await wallSide(page, 'act4 canteen south', origin, { x: midX(CANTEEN.x0), y: edgeY(CANTEEN.y1 + 1) }, { x: midX(CANTEEN.x1), y: edgeY(CANTEEN.y1 + 1) });
    await wallSide(page, 'act4 canteen west', origin, { x: edgeX(CANTEEN.x0), y: midY(CANTEEN.y0) }, { x: edgeX(CANTEEN.x0), y: midY(CANTEEN.y1) });
    await wallSide(page, 'act4 canteen east above door', origin, { x: edgeX(CANTEEN.x1 + 1), y: midY(CANTEEN.y0) }, { x: edgeX(CANTEEN.x1 + 1), y: midY(12) });
    await wallSide(page, 'act4 canteen east below door', origin, { x: edgeX(CANTEEN.x1 + 1), y: midY(14) }, { x: edgeX(CANTEEN.x1 + 1), y: midY(CANTEEN.y1) });
    await wallSide(page, 'act4 shower north', origin, { x: midX(SHOWER.x0), y: edgeY(SHOWER.y0) }, { x: midX(SHOWER.x1), y: edgeY(SHOWER.y0) });
    await wallSide(page, 'act4 shower south', origin, { x: midX(SHOWER.x0), y: edgeY(SHOWER.y1 + 1) }, { x: midX(SHOWER.x1), y: edgeY(SHOWER.y1 + 1) });
    await wallSide(page, 'act4 shower east', origin, { x: edgeX(SHOWER.x1 + 1), y: midY(SHOWER.y0) }, { x: edgeX(SHOWER.x1 + 1), y: midY(SHOWER.y1) });
    await wallSide(page, 'act4 shower west above door', origin, { x: edgeX(SHOWER.x0), y: midY(18) }, { x: edgeX(SHOWER.x0), y: midY(18) });
    await wallSide(page, 'act4 shower west below door', origin, { x: edgeX(SHOWER.x0), y: midY(20) }, { x: edgeX(SHOWER.x0), y: midY(20) });
    await armBuildable(page, 'door-wooden');
    for (const door of [
      { name: 'cell door', x: edgeX(CELL.x1 + 1), y: midY(19) },
      { name: 'canteen door', x: edgeX(CANTEEN.x1 + 1), y: midY(13) },
      { name: 'shower door', x: edgeX(SHOWER.x0), y: midY(19) },
    ]) {
      await assertCanvasAt(page, door.x, door.y, `act4 ${door.name}`);
      console.log(`[act4] ${door.name}: ${JSON.stringify(await press(page, door.x, door.y))}`);
    }
    await waitForQueueEmpty(page, 500_000);
    await page.waitForTimeout(2000);

    for (const room of [
      { id: 'room.cell', bounds: CELL },
      { id: 'room.canteen', bounds: CANTEEN },
      { id: 'room.shower-room', bounds: SHOWER },
    ]) {
      const attempts = await designate(page, 'act4', room.id, origin, room.bounds);
      console.log(`[act4] ${room.id} was accepted on attempt ${attempts}`);
      expect(attempts, `${room.id} was never accepted`).toBeGreaterThan(0);
    }
    await place('bed-wooden', [[12, 18], [13, 18], [14, 18], [15, 18]]);
    await place('toilet-brick', [[12, 20]]);
    await place('dining-table-wooden', [[12, 11], [15, 11]]);
    await place('bench-wooden', [[12, 14], [14, 14], [16, 14], [12, 16]]);
    await place('shower-head-brick', [[20, 18], [20, 20]]);
    await waitForQueueEmpty(page, 500_000);
    await page.waitForTimeout(3000);

    // The yard, after a pan.
    const focus = centreOf(origin, 21, 12);
    await assertCanvasAt(page, focus.x, focus.y, 'act4 camera-focus point');
    await page.mouse.click(focus.x, focus.y);
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1500);
    await tab(page, 'build').click({ timeout: 15_000 });
    const panned = await calibrate(page);
    const yard = await firstClearYard(page, panned);
    console.log(`[act4] the yard rectangle chosen: ${JSON.stringify(yard)}`);
    expect(yard, 'no 8x8 rectangle both misses the three rooms and is clear canvas').toBeDefined();
    if (yard === undefined) return;
    const yardAttempts = await designate(page, 'act4', 'room.yard', panned, yard);
    console.log(`[act4] the yard was accepted on attempt ${yardAttempts}`);
    console.log(`[act4] four rooms standing: ${JSON.stringify(await latestRawCounts(page))}`);

    // Populate and settle.
    await tab(page, 'overview').click({ timeout: 15_000 });
    for (let index = 0; index < 4; index += 1) {
      await page.locator('.hud-intake__admit').click({ timeout: 30_000 });
      await page.waitForTimeout(250);
    }
    await tab(page, 'security').click({ timeout: 15_000 });
    await page.locator('.hud-staff__hire').click({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    const admitted = await latestRawCounts(page);
    console.log(`[act4] four prisoners, one guard, four rooms: ${JSON.stringify(admitted)}`);
    const settleFrom = await currentTick(page);
    await runToTick(page, 'act4', settleFrom + 2 * 2400, 3000, 400_000);
    console.log(`[act4] ${await needsReadout(page, 'after two settling days')}`);

    /*
     * **The scan.** One whole in-game day, every ~2s of page time, printing
     * the tick-of-day, the regime block that tick falls in, and what each
     * prisoner is doing — read from `.hud-regime__roster`, which is the only
     * surface in the game that names a room-targeted action.
     */
    await tab(page, 'regime').click({ timeout: 15_000 });
    const blocks: readonly (readonly [number, number, string])[] = [
      [0, 400, 'sleep'],
      [400, 500, 'meal+hygiene'],
      [500, 1000, 'work/education/association'],
      [1000, 1200, 'recreation+association'],
      [1200, 1300, 'meal'],
      [1300, 1800, 'work/education/association'],
      [1800, 2000, 'recreation+hygiene+association'],
      [2000, 2100, 'meal'],
      [2100, 2300, 'recreation+association+hygiene'],
      [2300, 2400, 'sleep'],
    ];
    const scanStart = await currentTick(page);
    const seen = new Map<string, number>();
    for (;;) {
      const tick = await currentTick(page);
      if (tick >= scanStart + 2400) break;
      const tickOfDay = ((tick % 2400) + 2400) % 2400;
      const block = blocks.find(([from, to]) => tickOfDay >= from && tickOfDay < to)?.[2] ?? '?';
      const roster = (await panelText(page, '.hud-regime__roster')).replace(/\n/g, ' | ');
      for (const verb of ['Eating in Cell', 'Eating', 'Showering', 'Yard Time', 'Common Room', 'Sleeping', 'Using Toilet', 'Association', 'Idle', 'Class', 'Kitchen', 'Laundry', 'Errand']) {
        const count = roster.split(verb).length - 1;
        if (count > 0) seen.set(verb, (seen.get(verb) ?? 0) + count);
      }
      console.log(`[act4] t=${tick} tickOfDay=${tickOfDay} block=${block} :: ${roster}`);
      await page.waitForTimeout(2000);
    }
    console.log(`[act4] verbs seen across one whole day, with how many prisoner-samples each: ${JSON.stringify([...seen.entries()].sort((a, b) => b[1] - a[1]))}`);
    console.log(`[act4] ${await needsReadout(page, 'at the end of the scanned day')}`);
    const ended = await latestRawCounts(page);
    if (admitted !== undefined && ended !== undefined) console.log(`[act4] DELTA admission -> end of the scanned day\n${deltaVector(admitted, ended)}`);
    console.log(`[act4] events over the whole act: ${JSON.stringify(await eventTypes(page))}`);
    for (const which of ['overview', 'rooms'] as const) {
      await tab(page, which).click({ timeout: 15_000 });
      console.log(`[act4] the four-room prison, ${which} (UPPER BOUND):\n${await screen(page)}`);
    }
  });

});
