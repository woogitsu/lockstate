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

/** Every simulation event the worker has pushed, flattened to `type` strings in order. */
async function eventTypes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const message of (window as unknown as { lockstateFromWorker?: readonly unknown[] }).lockstateFromWorker ?? []) {
      const typed = message as { kind?: string; payload?: { events?: readonly { type?: string }[] } };
      if (typed.kind !== 'simulation/events') continue;
      for (const event of typed.payload?.events ?? []) out.push(event.type ?? '(untyped)');
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

  test('act 2 - growth: a second cell block and twelve prisoners', async ({ page }) => {
    test.setTimeout(1_200_000);
    await openApp(page);
    const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 1, label: 'act2-first-cell' });
    const oneCell = await latestRawCounts(page);
    console.log(`[act2] ONE CELL, four prisoners, one guard: ${JSON.stringify(oneCell)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act2] the screen at one cell (UPPER BOUND):\n${await screen(page)}`);

    // A second 6x6 cell in a measured-clear rectangle. (19,12)-(24,17) is east
    // of the first; the clearance map act 1 prints is what says whether it is
    // reachable, and every press below is guarded anyway.
    const bounds = { x0: 19, y0: 12, x1: 24, y1: 17 };
    await tab(page, 'build').click({ timeout: 15_000 });
    for (const [x, y] of [
      [bounds.x0, bounds.y0],
      [bounds.x1, bounds.y0],
      [bounds.x0, bounds.y1],
      [bounds.x1, bounds.y1],
    ] as const) {
      const point = centreOf(origin, x, y);
      await assertCanvasAt(page, point.x, point.y, `act2 second-cell corner (${x},${y})`);
    }

    await buy(page, 'wall-brick', 60);
    await buy(page, 'bed-wooden', 10);
    console.log(`[act2] strip after buying for the second cell: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    await fastForwardToMax(page);
    await page.waitForTimeout(4000);

    await armBuildable(page, 'wall-brick');
    await wallRectangle(page, 'act2', origin, bounds);
    await waitForQueueEmpty(page);
    const attempts = await designate(page, 'act2', 'room.cell', origin, bounds);
    console.log(`[act2] the second cell was accepted on attempt ${attempts}`);

    await tab(page, 'build').click({ timeout: 15_000 });
    await armBuildable(page, 'bed-wooden');
    let placed = 0;
    for (const row of [12, 14] as const) {
      for (let column = bounds.x0; column <= bounds.x1 && placed < 8; column += 1) {
        const point = centreOf(origin, column, row);
        const commands = await press(page, point.x, point.y);
        if (commands.length === 0) console.log(`[act2] bed at (${column},${row}) produced NO command`);
        placed += 1;
      }
    }
    await armBuildable(page, 'toilet-brick');
    const toilet = centreOf(origin, bounds.x0, 16);
    await press(page, toilet.x, toilet.y);
    console.log(`[act2] ${placed} bed order(s) + 1 toilet in the second cell`);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(3000);

    const twoCells = await latestRawCounts(page);
    console.log(`[act2] TWO CELLS, before admitting: ${JSON.stringify(twoCells)}`);

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
    console.log(`[act2] TWELVE prisoners: ${JSON.stringify(twelve)}`);
    if (oneCell !== undefined && twelve !== undefined) console.log(`[act2] DELTA one cell -> two cells\n${deltaVector(oneCell, twelve)}`);

    // What does the screen say about the guard requirement now?
    await tab(page, 'security').click({ timeout: 15_000 });
    console.log(`[act2] Security tab at twelve prisoners (UPPER BOUND):\n${await screen(page)}`);
    await tab(page, 'overview').click({ timeout: 15_000 });
    console.log(`[act2] Overview at twelve prisoners (UPPER BOUND):\n${await screen(page)}`);
    console.log(`[act2] ${await needsReadout(page, 'needs at twelve')}`);

    // One in-game day at twelve, for the income slope.
    const before = await latestRawCounts(page);
    const startTick = await currentTick(page);
    await runToTick(page, 'act2', startTick + 2400);
    const after = await latestRawCounts(page);
    if (before !== undefined && after !== undefined) console.log(`[act2] DELTA over one day at twelve prisoners\n${deltaVector(before, after)}`);
    console.log(`[act2] events over the whole act: ${JSON.stringify(await eventTypes(page))}`);
    console.log(`[act2] the screen after a day at twelve (UPPER BOUND):\n${await screen(page)}`);
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
    // (`src/content/room-catalog.ts:128-132`).
    const shower = { x0: 8, y0: 12, x1: 10, y1: 14 };
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

    // And the yard: `room.yard` needs only `outdoors` and 8x8 tiles -- no
    // walls, no objects, no money (`src/content/room-catalog.ts:138-141`). The
    // measurement is whether it fits on the default screen at all.
    const yard = { x0: 19, y0: 13, x1: 26, y1: 20 };
    const corners: string[] = [];
    for (const [x, y] of [
      [yard.x0, yard.y0],
      [yard.x1, yard.y0],
      [yard.x0, yard.y1],
      [yard.x1, yard.y1],
    ] as const) {
      const point = centreOf(origin, x, y);
      corners.push(`(${x},${y}) at screen (${Math.round(point.x)},${Math.round(point.y)}) -> ${await topmostAt(page, point.x, point.y)}`);
    }
    console.log(`[act3] the 8x8 yard's four corners: ${JSON.stringify(corners)}`);
    const allClear = corners.every((line) => line.includes('canvas'));
    console.log(`[act3] does an 8x8 yard fit in clear canvas at 1440x900? ${allClear ? 'YES' : 'NO'}`);
    if (allClear) {
      const yardAttempts = await designate(page, 'act3', 'room.yard', origin, yard);
      console.log(`[act3] the yard was accepted on attempt ${yardAttempts}`);
      const withYard = await latestRawCounts(page);
      if (used !== undefined && withYard !== undefined) console.log(`[act3] DELTA shower room -> shower room + yard\n${deltaVector(used, withYard)}`);
      const yardStart = await currentTick(page);
      await runToTick(page, 'act3', yardStart + 2 * 2400);
      const afterYard = await latestRawCounts(page);
      console.log(`[act3] two days after the yard opened: ${JSON.stringify(afterYard)}`);
      console.log(`[act3] ${await needsReadout(page, 'needs two days after the yard')}`);
      await tab(page, 'overview').click({ timeout: 15_000 });
      console.log(`[act3] the screen with a cell, a shower room and a yard (UPPER BOUND):\n${await screen(page)}`);
    }
    console.log(`[act3] events at the end: ${JSON.stringify(await eventTypes(page))}`);
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
