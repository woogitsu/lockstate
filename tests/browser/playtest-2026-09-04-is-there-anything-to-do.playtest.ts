import { expect, test } from '@playwright/test';
import {
  TILE,
  buildAndPopulate,
  armBuildable,
  buy,
  calibrate,
  centreOf,
  currentClock,
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
 * **Is there anything to do once the first cell works?**
 *
 * Every playtest before this one stopped at the opening. It has been
 * established that the game can be played
 * (`docs/research/2026-09-02-the-first-five-minutes.md`), that a newcomer can
 * be led to a working cell (`2026-09-04-the-first-ten-minutes.md`), that a
 * prison can fail (`2026-09-04-can-this-prison-fail.md`), that a save comes
 * back (`2026-09-04-does-a-prison-come-back.md`) and that a guard answers an
 * incident (`2026-09-04-does-anyone-answer-an-incident.md`). Nobody has played
 * *past* the first cell.
 *
 * > Once the first cell works and the first prisoner sleeps in it -- is there
 * > anything to do?
 *
 * The standard is the owner's: *"Żeby gra była fajna i super, a nie po
 * taniości zrobiona"*, and `AGENTS.md`'s *"a change that is right in every
 * test and makes the game duller has not succeeded."* So this file does not
 * assert that the game is fun. It measures **what changes** -- and, more
 * importantly, **what does not** -- across four states a growing prison passes
 * through, and it prints every number and every sentence so the note can be
 * written against a dump rather than a memory.
 *
 * ## The shape: one prison, grown, with a delta vector at every step
 *
 * - **Act 1.** The settled prison: one 6x6 cell, four beds, four prisoners,
 *   one guard. Then *nothing is pressed for three in-game days.* The
 *   measurement is the **delta vector**: of the twenty-three counts the worker
 *   publishes, which ones moved, and of the controls on screen, which ones
 *   changed state.
 * - **Act 2.** Growth: a second cell block, twelve prisoners. Same delta
 *   vector. Does anything get *harder*?
 * - **Act 3.** The two needs a cell cannot serve. `room.shower-room` and
 *   `room.yard` are the only rooms that serve `hygiene` and `recreation`
 *   (`src/simulation/prisoners/actions.ts:132`, `:165`). Building them is the
 *   candidate for "a choice that matters". The measurement is whether **any**
 *   number a player can see moves when they are built.
 * - **Act 4.** The long run: twenty in-game days at 4x on a twelve-prisoner
 *   prison, watching for the one event that makes this a loop rather than a
 *   ratchet -- a sentence ending (`prisoners.discharged`, sentences drawn from
 *   14 to 90 in-game days, `src/simulation/prisoners/sentence.ts:200-201`).
 *
 * ## Instrumentation rules inherited, with the reason each was paid for
 *
 * 1. **Two channels, never mixed.** Numbers come from the worker's
 *    `simulation/status-counts` through the tee; sentences come from
 *    `document.querySelector('.hud').innerText`. `statusCountsEqual`
 *    (`src/simulation/worker/status-counts.ts`) suppresses a publication whose
 *    payload equals the last, so a "nothing moved" reading taken from one
 *    channel alone is not evidence. Ticks come from `simulation/clock-state`,
 *    which publishes every tick.
 * 2. **`innerText` is an upper bound, not a reading.** It does not respect a
 *    scroll container's clipping -- a run on 2026-09-04 dumped 21 catalogue
 *    labels against 5 actually visible. Every `screen()` dump below is
 *    therefore an upper bound on what a player can read without scrolling, and
 *    the note says so wherever it quotes one.
 * 3. **A press on a HUD-covered point submits nothing at all** -- no command,
 *    no refusal, no band -- and has cost this repository three withdrawn
 *    findings. `assertCanvasAt` runs `document.elementFromPoint` before every
 *    world press and fails loudly. Act 1 additionally prints a **clearance
 *    map** of the whole visible tile grid, so acts 2 and 3 build inside a
 *    measured-clear rectangle rather than a guessed one.
 * 4. **A tile edge normalises to the lower-numbered tile**, so wall runs are
 *    driven at the rectangle's outer edge coordinates, exactly as
 *    `buildAndPopulate` does.
 *
 * ## Findings live in
 * `docs/research/2026-09-04-is-there-anything-to-do.md`.
 */

type Page = import('@playwright/test').Page;

/** The whole HUD as a player sees it laid out, newlines squeezed. An UPPER BOUND (rule 2). */
async function screen(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    if (hud === null) return 'HUD ABSENT';
    return (hud.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
  });
}

/**
 * Every field of every `simulation/status-counts` the worker has published.
 *
 * `latestCounts` in `playtest-harness.ts` projects twelve of the twenty-three
 * fields `statusCountsSchema` declares (`src/simulation/protocol/types.ts:710`),
 * and the question this file asks is *which* of them move -- so it needs all
 * twenty-three, raw, with no field list of its own to fall behind the schema.
 */
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

/** Every worker message kind seen so far, with how many of each. */
async function messageKinds(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const tally: Record<string, number> = {};
    for (const message of (window as unknown as { lockstateFromWorker?: readonly unknown[] }).lockstateFromWorker ?? []) {
      const kind = (message as { kind?: string }).kind ?? '(no kind)';
      tally[kind] = (tally[kind] ?? 0) + 1;
    }
    return tally;
  });
}

/**
 * Every simulation event the worker has pushed, flattened to `type` strings in order.
 *
 * **`'simulation/event'`, singular, and this reader had it wrong on its first
 * run.** It filtered on `'simulation/events'` and on a `payload.events` array,
 * and the message is one event per message under `payload.event`
 * (`src/simulation/worker/state-machine.ts:728`, *"One message per event rather
 * than one carrying an array"*). Act 1's `[]` was therefore produced by a
 * reader that could never have returned anything else. What kept act 1's
 * conclusion standing is that `messageKinds` is kind-agnostic and reported no
 * `simulation/event` message at all -- so the finding was carried by the second
 * instrument, which is the only reason it survived. Recorded rather than
 * quietly fixed, per `docs/AGENT_WORKFLOW.md` on instrument failures.
 */
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

/**
 * The delta vector between two counts samples: only the fields that moved.
 *
 * This is the instrument the whole file turns on. "It felt flat" is not a
 * finding; "between tick A and tick B, of twenty-three published counts,
 * exactly these two moved, by these amounts" is.
 */
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

/** Fails unless the canvas is the topmost element at that point. */
async function assertCanvasAt(page: Page, x: number, y: number, label: string): Promise<void> {
  const top = await topmostAt(page, x, y);
  expect(top, `${label}: the point (${x},${y}) is not clear canvas, so a press there proves nothing`).toContain('canvas');
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

/**
 * Which tiles in the visible grid are clear canvas, as an ASCII map.
 *
 * Written because the handover this run inherited claimed tile (12,12) was
 * off-screen at 1440x900 and that was wrong, and because acts 2 and 3 need a
 * second 6x6 rectangle and an 8x8 one and guessing where they fit is exactly
 * the failure trap 3 describes. Measured, not assumed.
 */
async function clearanceMap(page: Page, origin: { originX: number; originY: number }): Promise<string> {
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
      // eslint-disable-next-line no-await-in-loop -- a sequential probe of a real DOM; there is nothing to parallelise against one page.
      const top = await topmostAt(page, point.x, point.y);
      row += top.includes('canvas') ? '.' : '#';
    }
    lines.push(row);
  }
  return lines.join('\n');
}

/**
 * Every control in the HUD, with its label, whether it is disabled, and
 * whether it has a box a pointer could reach.
 *
 * The census the question needs: "here are the four controls that do nothing
 * different than they did at tick 200" requires knowing what the controls
 * *were* at tick 200.
 */
async function controlCensus(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('.hud button, .hud input, .hud select')) {
      const box = element.getBoundingClientRect();
      const label = (element.getAttribute('aria-label') ?? element.textContent ?? element.getAttribute('name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const disabled = (element as HTMLButtonElement).disabled === true ? 'DISABLED' : 'enabled';
      const reachable = box.width > 0 && box.height > 0 ? 'boxed' : 'NO BOX';
      out.push(`${element.tagName.toLowerCase()}[${element.className}] "${label}" ${disabled} ${reachable}`);
    }
    return out;
  });
}

/** Runs the clock forward to `target` ticks, sampling both channels on the way. */
async function runToTick(page: Page, label: string, target: number, sampleEveryMs = 4000, timeoutMs = 900_000): Promise<void> {
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

/** Builds an enclosed rectangle of brick wall at the given tile bounds, and reports the commands. */
async function wallRectangle(
  page: Page,
  label: string,
  origin: { originX: number; originY: number },
  bounds: { x0: number; y0: number; x1: number; y1: number },
): Promise<void> {
  const westX = origin.originX + bounds.x0 * TILE;
  const eastX = origin.originX + (bounds.x1 + 1) * TILE;
  const northY = origin.originY + bounds.y0 * TILE;
  const southY = origin.originY + (bounds.y1 + 1) * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    const produced = (await sentCommands(page)).slice(before);
    console.log(
      `[${label}] wall run ${run.name}: ${produced.length} command(s) -> ` +
        JSON.stringify(produced.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`)),
    );
  }
}

/** Designates a room, retrying the way `buildAndPopulate` does, and reports every attempt. */
async function designate(
  page: Page,
  label: string,
  roomId: string,
  origin: { originX: number; originY: number },
  bounds: { x0: number; y0: number; x1: number; y1: number },
  maxAttempts = 8,
): Promise<number> {
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
      `[${label}] designate ${roomId} attempt ${attempt}: rooms=${String(counts?.counts['rooms'])}` +
        ` | panel said ${JSON.stringify(note.split('\n').filter((line) => /OPEN|ENCLOS|OUTDOOR|SIZE|need/i.test(line)))}` +
        ` | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    const rooms = Number(counts?.counts['rooms'] ?? 0);
    if (rooms > 0) return attempt;
    await page.waitForTimeout(3000);
  }
  return -1;
}

/** The Regime tab's roster and the needs of whoever is selected. */
async function needsReadout(page: Page, label: string): Promise<string> {
  await tab(page, 'regime').click({ timeout: 15_000 });
  const rows = page.locator('.hud-regime__roster-row');
  const count = await rows.count();
  if (count === 0) return `${label}: no roster rows`;
  const box = await rows.first().boundingBox();
  if (box === null) return `${label}: the first roster row has no box`;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const detail = await panelText(page, '.hud-regime__detail');
  return `${label}: ${count} roster row(s); detail = ${JSON.stringify(detail.replace(/\n/g, ' | '))}`;
}

test.describe('is there anything to do', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60_000);
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(`[console.error] ${message.text().slice(0, 300)}`);
    });
    await installTee(page);
  });

  test('act 1 - the settled prison, and what changes when nothing is pressed', async ({ page }) => {
    test.setTimeout(900_000);
    await openApp(page);
    const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 1, label: 'act1-build' });

    console.log(`[act1] ${await clearanceMap(page, origin)}`);

    await tab(page, 'overview').click({ timeout: 15_000 });
    const settledScreen = await screen(page);
    console.log(`[act1] the settled prison, whole HUD (UPPER BOUND):\n${settledScreen}`);
    const controlsBefore = await controlCensus(page);
    console.log(`[act1] ${controlsBefore.length} control(s) on the Overview tab:\n${controlsBefore.join('\n')}`);

    const start = await latestRawCounts(page);
    expect(start, 'the worker published no counts at all').toBeDefined();
    console.log(`[act1] counts at the settled state, all fields: ${JSON.stringify(start)}`);
    console.log(`[act1] worker message kinds so far: ${JSON.stringify(await messageKinds(page))}`);
    console.log(`[act1] events so far: ${JSON.stringify(await eventTypes(page))}`);

    // Three in-game days, at 4x, with nothing pressed.
    await fastForwardToMax(page);
    const startTick = await currentTick(page);
    const target = startTick + 3 * 2400;
    console.log(`[act1] nothing will be pressed from tick ${startTick} to tick ${target} (three in-game days at 4x)`);
    await runToTick(page, 'act1', target);

    const end = await latestRawCounts(page);
    console.log(`[act1] counts after three days: ${JSON.stringify(end)}`);
    if (start !== undefined && end !== undefined) console.log(`[act1] DELTA VECTOR\n${deltaVector(start, end)}`);

    const series = await rawCountsSeries(page);
    console.log(`[act1] the worker published ${series.length} counts message(s) over the whole act`);
    console.log(
      `[act1] treasury series: ${JSON.stringify(series.map((sample) => `t${sample.tick}=${String(sample.counts['treasuryMinorUnits'])}`))}`,
    );
    console.log(`[act1] events over the whole act: ${JSON.stringify(await eventTypes(page))}`);
    console.log(`[act1] clock now: ${JSON.stringify(await currentClock(page))}`);

    const afterScreen = await screen(page);
    console.log(`[act1] the whole HUD after three untouched days (UPPER BOUND):\n${afterScreen}`);
    const controlsAfter = await controlCensus(page);
    console.log(`[act1] ${controlsAfter.length} control(s) now:\n${controlsAfter.join('\n')}`);

    // The comparison the question turns on: which controls changed state?
    const changed = controlsAfter.filter((line, index) => controlsBefore[index] !== line);
    console.log(`[act1] control lines that differ after three days: ${changed.length === 0 ? '(none)' : JSON.stringify(changed)}`);

    console.log(`[act1] ${await needsReadout(page, 'needs after three days')}`);
    for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
      await tab(page, id).click({ timeout: 15_000 });
      await page.waitForTimeout(300);
      console.log(`[act1] tab "${id}" says (UPPER BOUND):\n${await screen(page)}`);
    }
  });

  test('act 2 - growth: is there any reason to build a second cell', async ({ page }) => {
    test.setTimeout(1_500_000);
    await openApp(page);
    const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 1, label: 'act2-first-cell' });
    const oneCell = await latestRawCounts(page);
    console.log(`[act2] ONE CELL, four prisoners, one guard: ${JSON.stringify(oneCell)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act2] the screen at one cell (UPPER BOUND):\n${await screen(page)}`);

    /*
     * **Phase B first, and the order is the whole point of this act.**
     *
     * Residency capacity is the sum of the *footprint widths* of the objects
     * in a room that declare `'sleep-surface'` -- `deriveRoomCapacity`
     * (`src/simulation/objects/room-capacity.ts:172-190`) -- with no per-room
     * ceiling, no tiles-per-occupant rule, and nothing else contributing. And
     * `rateCellSharing` (`src/simulation/prisoners/cell-sharing.ts:74`) is a
     * *preference* over occupied cells, not a limit: its own docblock says
     * "some pairings are unwise rather than forbidden".
     *
     * So before spending a brick on a second room, the honest question is
     * whether a player needs one at all: eight more beds go into the 6x6 cell
     * that is already standing, and if twelve prisoners are then housed and
     * paid for in one room, the second cell is a thing the game never asks
     * for. Phase C builds one anyway, to see whether anything differs.
     */
    await tab(page, 'build').click({ timeout: 15_000 });
    await buy(page, 'bed-wooden', 10);
    await fastForwardToMax(page);
    await page.waitForTimeout(4000);
    await armBuildable(page, 'bed-wooden');
    let packed = 0;
    const packTargets: readonly (readonly [number, number])[] = [
      [12, 14],
      [13, 14],
      [14, 14],
      [15, 14],
      [16, 14],
      [17, 14],
      [13, 16],
      [14, 16],
    ];
    for (const [x, y] of packTargets) {
      const point = centreOf(origin, x, y);
      await assertCanvasAt(page, point.x, point.y, `act2 packed bed (${x},${y})`);
      const commands = await press(page, point.x, point.y);
      if (commands.length === 0) console.log(`[act2] packed bed at (${x},${y}) produced NO command`);
      else packed += 1;
    }
    console.log(`[act2] ${packed} extra bed order(s) placed INSIDE the existing 6x6 cell`);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(3000);
    const packedCounts = await latestRawCounts(page);
    console.log(`[act2] ONE CELL with twelve beds: ${JSON.stringify(packedCounts)}`);
    await tab(page, 'rooms').click({ timeout: 15_000 });
    console.log(`[act2] the Rooms tab with twelve beds in one 6x6 cell (UPPER BOUND):\n${await screen(page)}`);

    // Admit eight more, one press at a time, reading the refusal band each time.
    await tab(page, 'overview').click({ timeout: 15_000 });
    for (let index = 0; index < 8; index += 1) {
      await page.locator('.hud-intake__admit').click({ timeout: 20_000 });
      await page.waitForTimeout(250);
      console.log(
        `[act2] admit ${index + 5}: band ${JSON.stringify(await panelText(page, '.hud__refusal'))}` +
          ` | intake ${JSON.stringify((await panelText(page, '.hud-intake')).replace(/\n/g, ' | '))}`,
      );
    }
    await page.waitForTimeout(3000);
    const twelve = await latestRawCounts(page);
    console.log(`[act2] TWELVE prisoners in ONE room: ${JSON.stringify(twelve)}`);
    if (oneCell !== undefined && twelve !== undefined) console.log(`[act2] DELTA four in one room -> twelve in one room\n${deltaVector(oneCell, twelve)}`);

    // What does the screen say about the guard requirement now? One guard
    // covers `DEFAULT_SECTOR_PRISONERS_PER_GUARD` = 8 occupants
    // (`src/simulation/security/sector-staffing.ts:147`), so twelve occupants
    // need two and the prison is one short. This is the only pressure growth
    // is known to generate; the measurement is whether the screen says so.
    await tab(page, 'security').click({ timeout: 15_000 });
    console.log(`[act2] Security tab at twelve prisoners, ONE guard (UPPER BOUND):\n${await screen(page)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act2] Overview at twelve prisoners, ONE guard (UPPER BOUND):\n${await screen(page)}`);
    console.log(`[act2] ${await needsReadout(page, 'needs at twelve')}`);

    // One in-game day at twelve, for the income slope.
    const before = await latestRawCounts(page);
    const startTick = await currentTick(page);
    await runToTick(page, 'act2', startTick + 2400);
    const after = await latestRawCounts(page);
    if (before !== undefined && after !== undefined) console.log(`[act2] DELTA over one day at twelve prisoners\n${deltaVector(before, after)}`);
    console.log(`[act2] events after a day at twelve: ${JSON.stringify(await eventTypes(page))}`);
    console.log(`[act2] the screen after a day at twelve (UPPER BOUND):\n${await screen(page)}`);

    /*
     * **Phase C: the second cell, built anyway.**
     *
     * 3x4 at (19,11)-(21,14), which is inside the clear rectangle act 1
     * measured (x=11..22, y=11..21) and clear of the first cell's walls. It is
     * not 6x6 because a second 6x6 does not fit on the default screen beside
     * the first one -- that is act 3's yard measurement and it is reported
     * there. `room.cell` asks for 2x3 and six tiles
     * (`src/content/room-catalog.ts:92-97`), so 3x4 is a legal cell.
     */
    const second = { x0: 19, y0: 11, x1: 21, y1: 14 };
    await tab(page, 'build').click({ timeout: 15_000 });
    for (const [x, y] of [
      [second.x0, second.y0],
      [second.x1, second.y0],
      [second.x0, second.y1],
      [second.x1, second.y1],
    ] as const) {
      const point = centreOf(origin, x, y);
      await assertCanvasAt(page, point.x, point.y, `act2 second-cell corner (${x},${y})`);
    }
    await buy(page, 'wall-brick', 30);
    await buy(page, 'bed-wooden', 6);
    await page.waitForTimeout(3000);
    await armBuildable(page, 'wall-brick');
    await wallRectangle(page, 'act2', origin, second);
    await waitForQueueEmpty(page);
    await armBuildable(page, 'bed-wooden');
    for (const [x, y] of [
      [19, 11],
      [20, 11],
      [21, 11],
      [19, 13],
    ] as const) {
      const point = centreOf(origin, x, y);
      const commands = await press(page, point.x, point.y);
      if (commands.length === 0) console.log(`[act2] second-cell bed at (${x},${y}) produced NO command`);
    }
    await armBuildable(page, 'toilet-brick');
    const toilet = centreOf(origin, 21, 13);
    await press(page, toilet.x, toilet.y);
    await waitForQueueEmpty(page);
    const attempts = await designate(page, 'act2', 'room.cell', origin, second);
    console.log(`[act2] the second cell was accepted on attempt ${attempts}`);
    await page.waitForTimeout(3000);
    const twoRooms = await latestRawCounts(page);
    console.log(`[act2] TWO ROOMS: ${JSON.stringify(twoRooms)}`);
    if (after !== undefined && twoRooms !== undefined) console.log(`[act2] DELTA one room -> two rooms\n${deltaVector(after, twoRooms)}`);
    await tab(page, 'rooms').click({ timeout: 15_000 });
    console.log(`[act2] the Rooms tab with two cells (UPPER BOUND):\n${await screen(page)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act2] the Overview with two cells (UPPER BOUND):\n${await screen(page)}`);
    console.log(`[act2] events over the whole act: ${JSON.stringify(await eventTypes(page))}`);
    console.log(`[act2] worker message kinds over the whole act: ${JSON.stringify(await messageKinds(page))}`);
  });

  test('act 3 - the two rooms a cell cannot replace', async ({ page }) => {
    test.setTimeout(1_200_000);
    await openApp(page);
    const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 1, label: 'act3-cell' });

    // Let hygiene and recreation fall. `NEED_DECAY_PER_TICK.hygiene` is 0.02
    // and `recreation` 0.015 (`src/simulation/prisoners/needs.ts:112-119`), so
    // from a full 255 the floor is 12,750 and 17,000 ticks away -- five and
    // seven in-game days. Four days is enough to see both moving and neither
    // served.
    await fastForwardToMax(page);
    const startTick = await currentTick(page);
    await runToTick(page, 'act3', startTick + 4 * 2400);
    const neglected = await latestRawCounts(page);
    console.log(`[act3] after four days with a cell and nothing else: ${JSON.stringify(neglected)}`);
    console.log(`[act3] ${await needsReadout(page, 'needs with no shower room and no yard')}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act3] the screen while two needs decay (UPPER BOUND):\n${await screen(page)}`);
    console.log(`[act3] Rooms tab -- does anything name the missing room? (UPPER BOUND)`);
    await tab(page, 'rooms').click({ timeout: 15_000 });
    console.log(`[act3] ${await screen(page)}`);

    // Now build the shower room: 3x3 enclosed, two shower heads
    // (`src/content/room-catalog.ts:128-132`). (19,15)-(21,17) is inside the
    // clear rectangle act 1 measured -- x=11..22, y=11..21 -- and clear of the
    // first cell's east wall at the x=18/19 boundary.
    const shower = { x0: 19, y0: 15, x1: 21, y1: 17 };
    for (const [x, y] of [
      [shower.x0, shower.y0],
      [shower.x1, shower.y1],
    ] as const) {
      const point = centreOf(origin, x, y);
      await assertCanvasAt(page, point.x, point.y, `act3 shower corner (${x},${y})`);
    }
    await tab(page, 'build').click({ timeout: 15_000 });
    await buy(page, 'wall-brick', 30);
    await buy(page, 'shower-head-brick', 4);
    await fastForwardToMax(page);
    await page.waitForTimeout(4000);
    await armBuildable(page, 'wall-brick');
    await wallRectangle(page, 'act3', origin, shower);
    await waitForQueueEmpty(page);
    await armBuildable(page, 'shower-head-brick');
    for (const [x, y] of [
      [shower.x0, shower.y0],
      [shower.x0, shower.y1],
    ] as const) {
      const point = centreOf(origin, x, y);
      const commands = await press(page, point.x, point.y);
      if (commands.length === 0) console.log(`[act3] shower head at (${x},${y}) produced NO command`);
    }
    await waitForQueueEmpty(page);
    const showerAttempts = await designate(page, 'act3', 'room.shower-room', origin, shower);
    console.log(`[act3] the shower room was accepted on attempt ${showerAttempts}`);

    const withShower = await latestRawCounts(page);
    console.log(`[act3] counts with a shower room: ${JSON.stringify(withShower)}`);
    if (neglected !== undefined && withShower !== undefined) console.log(`[act3] DELTA neglected -> shower room built\n${deltaVector(neglected, withShower)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act3] the screen with a shower room (UPPER BOUND):\n${await screen(page)}`);

    // Two more days, so the prisoners have time to use it.
    const useStart = await currentTick(page);
    await runToTick(page, 'act3', useStart + 2 * 2400);
    const used = await latestRawCounts(page);
    console.log(`[act3] two days after the shower room opened: ${JSON.stringify(used)}`);
    if (withShower !== undefined && used !== undefined) console.log(`[act3] DELTA over two days with a shower room\n${deltaVector(withShower, used)}`);
    console.log(`[act3] ${await needsReadout(page, 'needs two days after the shower room')}`);
    console.log(`[act3] events over the whole act: ${JSON.stringify(await eventTypes(page))}`);

    /*
     * And the yard. `room.yard` is the cheapest room in the game: `outdoors`
     * and 8x8 tiles, no walls, no objects, no money at all
     * (`src/content/room-catalog.ts:138-141`), and it is the only thing that
     * serves `recreation` at 3 a tick with no `requiredObjectCapability`
     * (`src/simulation/prisoners/actions.ts:165-168`).
     *
     * **It does not fit on the default screen beside the starter cell, and
     * that is measured rather than assumed.** Act 1's clearance map gives the
     * clear rectangle as x=11..22 by y=11..21 -- twelve by eleven tiles -- and
     * the 6x6 cell at (12,12)-(17,17) sits in the middle of it, leaving no 8x8
     * anywhere. So the yard needs the camera moved, which is `camera.right`
     * bound to `KeyD` and `ArrowRight` (`src/input/bindings.ts:13,32`). The
     * measurement is how many presses that costs and whether anything on
     * screen suggests it.
     */
    const beforePanCorners: string[] = [];
    for (const [x, y] of [
      [19, 13],
      [26, 13],
      [19, 20],
      [26, 20],
    ] as const) {
      const point = centreOf(origin, x, y);
      beforePanCorners.push(`(${x},${y}) at screen (${Math.round(point.x)},${Math.round(point.y)}) -> ${await topmostAt(page, point.x, point.y)}`);
    }
    console.log(`[act3] an 8x8 yard at (19,13)-(26,20) BEFORE panning: ${JSON.stringify(beforePanCorners)}`);
    console.log(
      `[act3] does an 8x8 yard fit in clear canvas at 1440x900 without moving the camera? ` +
        `${beforePanCorners.every((line) => line.includes('canvas')) ? 'YES' : 'NO'}`,
    );

    // Pan right. The canvas has to hold focus for a keybinding in the `world`
    // context to reach the camera, so the press is preceded by a click on a
    // point already proved to be canvas.
    const focusPoint = centreOf(origin, 20, 19);
    await assertCanvasAt(page, focusPoint.x, focusPoint.y, 'act3 camera-focus point');
    await page.mouse.click(focusPoint.x, focusPoint.y);
    let panPresses = 0;
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('ArrowRight');
      panPresses += 1;
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1500);
    const panned = await calibrate(page);
    console.log(
      `[act3] after ${panPresses} ArrowRight press(es) the world origin is (${panned.originX}, ${panned.originY}); ` +
        `it was (${origin.originX}, ${origin.originY})`,
    );
    const shifted = panned.originX !== origin.originX || panned.originY !== origin.originY;
    console.log(`[act3] did the camera move at all? ${shifted ? 'YES' : 'NO'}`);
    console.log(`[act3] the clearance map after panning:\n${await clearanceMap(page, panned)}`);

    // Where an 8x8 lands now is a function of the panned origin, so it is
    // chosen from the panned map's clear core rather than named up front.
    const yard = { x0: 21, y0: 11, x1: 28, y1: 18 };
    const cornersAfter: string[] = [];
    for (const [x, y] of [
      [yard.x0, yard.y0],
      [yard.x1, yard.y0],
      [yard.x0, yard.y1],
      [yard.x1, yard.y1],
    ] as const) {
      const point = centreOf(panned, x, y);
      cornersAfter.push(`(${x},${y}) at screen (${Math.round(point.x)},${Math.round(point.y)}) -> ${await topmostAt(page, point.x, point.y)}`);
    }
    console.log(`[act3] the 8x8 yard's corners after panning: ${JSON.stringify(cornersAfter)}`);
    if (cornersAfter.every((line) => line.includes('canvas'))) {
      const yardAttempts = await designate(page, 'act3', 'room.yard', panned, yard);
      console.log(`[act3] the yard was accepted on attempt ${yardAttempts}`);
      const withYard = await latestRawCounts(page);
      if (used !== undefined && withYard !== undefined) console.log(`[act3] DELTA shower room -> shower room + yard\n${deltaVector(used, withYard)}`);
      const yardStart = await currentTick(page);
      await runToTick(page, 'act3', yardStart + 2 * 2400);
      const afterYard = await latestRawCounts(page);
      console.log(`[act3] two days after the yard opened: ${JSON.stringify(afterYard)}`);
      if (withYard !== undefined && afterYard !== undefined) console.log(`[act3] DELTA over two days with a yard\n${deltaVector(withYard, afterYard)}`);
      console.log(`[act3] ${await needsReadout(page, 'needs two days after the yard')}`);
      await tab(page, 'overview').click({ timeout: 15_000 });
      console.log(`[act3] the screen with a cell, a shower room and a yard (UPPER BOUND):\n${await screen(page)}`);
    } else {
      console.log(`[act3] the yard could not be placed even after panning; the designation was not attempted`);
    }
    console.log(`[act3] events at the end: ${JSON.stringify(await eventTypes(page))}`);
    console.log(`[act3] worker message kinds at the end: ${JSON.stringify(await messageKinds(page))}`);
  });

  test('act 4 - twenty in-game days at 4x, watching for a sentence to end', async ({ page }) => {
    test.setTimeout(1_800_000);
    await openApp(page);
    await buildAndPopulate(page, { beds: 12, admits: 12, guards: 2, label: 'act4-build' });
    const start = await latestRawCounts(page);
    console.log(`[act4] twelve prisoners in twelve beds: ${JSON.stringify(start)}`);
    await fastForwardToMax(page);
    const startTick = await currentTick(page);

    // Sentences are drawn per prisoner from [14, 90] in-game days
    // (`src/simulation/prisoners/sentence.ts:200-201`), so with twelve
    // prisoners the earliest departure is very likely inside twenty days.
    const target = startTick + 20 * 2400;
    console.log(`[act4] running from tick ${startTick} to ${target} with nothing pressed`);
    const dayMarks: string[] = [];
    for (let day = 1; day <= 20; day += 1) {
      await runToTick(page, 'act4', startTick + day * 2400, 3000, 240_000);
      const sample = await latestRawCounts(page);
      const events = await eventTypes(page);
      dayMarks.push(
        `day +${day} tick ${String(sample?.tick)}: treasury=${String(sample?.counts['treasuryMinorUnits'])}` +
          ` prisoners=${String(sample?.counts['prisoners'])} occupiedPlaces=${String(sample?.counts['occupiedPlaces'])}` +
          ` accrued=${String(sample?.counts['stateIncomeAccruedTodayMinorUnits'])} incidents=${String(sample?.counts['activeIncidents'])}` +
          ` events=${events.length}`,
      );
      console.log(`[act4] ${dayMarks[dayMarks.length - 1]}`);
      if (events.includes('prisoners.discharged')) {
        console.log(`[act4] A SENTENCE ENDED at day +${day}, tick ${String(sample?.tick)}`);
        console.log(`[act4] the screen at that moment (UPPER BOUND):\n${await screen(page)}`);
        break;
      }
    }
    console.log(`[act4] the whole day series:\n${dayMarks.join('\n')}`);
    const end = await latestRawCounts(page);
    if (start !== undefined && end !== undefined) console.log(`[act4] DELTA over the whole long run\n${deltaVector(start, end)}`);
    const tally: Record<string, number> = {};
    for (const type of await eventTypes(page)) tally[type] = (tally[type] ?? 0) + 1;
    console.log(`[act4] every event type and its count: ${JSON.stringify(tally)}`);
    console.log(`[act4] worker message kinds: ${JSON.stringify(await messageKinds(page))}`);
    console.log(`[act4] the final screen (UPPER BOUND):\n${await screen(page)}`);
    console.log(`[act4] ${(await controlCensus(page)).length} control(s) at the end`);
    console.log(`[act4] ${await needsReadout(page, 'needs at the end of the long run')}`);
  });
});
