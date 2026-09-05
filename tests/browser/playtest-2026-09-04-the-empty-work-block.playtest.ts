import { expect, test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buildAndPopulate,
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
 * **The empty work block.**
 *
 * `docs/research/2026-09-04-the-rooms-nobody-builds.md` §8 measured one whole
 * in-game day in a four-room prison and found that **every sample inside the
 * two `work / education / free-association` blocks was `Association`** — an
 * action whose own catalogue comment says it "fulfils no need". Those two
 * blocks are `[500, 1000)` and `[1300, 1800)` of `GENERAL_POPULATION_REGIME`,
 * 1,000 of the day's 2,400 ticks, 42% of a prisoner's life.
 *
 * That pass named three things it could not reach, and they are this file's
 * spine:
 *
 * 1. **The three rooms that would fill the work block** — `room.kitchen`,
 *    `room.laundry`, `room.classroom` — have live actions in
 *    `src/simulation/prisoners/actions.ts` and had never been built in a
 *    playtest in this repository.
 * 2. **Scale.** Everything it measured was four prisoners, so ADR 0062's
 *    contention over a room never bit.
 * 3. **A paired counterfactual.** It named as its own weakest claim that it
 *    never ran a day-scan on a prison *without* the room it was judging.
 *
 * ## The design
 *
 * Two day-scans of two prisons that differ in exactly the three rooms, both at
 * **eight** prisoners rather than four, and both scanned the same way:
 *
 * | act | prison | what it answers |
 * | --- | --- | --- |
 * | 1 | a stock cell-and-toilet prison | what the **Regime tab** actually lets a player do |
 * | 2 | — | the geometry probe the two builds are laid out against |
 * | 3 | cell + shower + yard | the counterfactual day-scan: `Association` with no work rooms |
 * | 4 | cell + shower + yard + kitchen + laundry + classroom | the same day-scan with them |
 *
 * ## Two channels, kept apart — and this file adds a third
 *
 * Sentences come from `.hud` `innerText`. Numbers come from the worker through
 * the tee. **Neither is a census of what prisoners are doing**, and that is
 * itself a finding: `PRISONER_ROSTER_ROW_LIMIT` is `4`
 * (`src/ui/hud/regime-panel.ts:293`) and `PrisonerRosterReader.read` asks for
 * exactly that many rows from offset zero with no offset control
 * (`src/ui/simulation-prisoner-roster.ts:308`), so a player with eight
 * prisoners can see four of them, ever.
 *
 * So this file opens its own projection channel: an init script keeps the
 * `Worker` instance and posts `simulation/request-projection` for
 * `hud/prisoner-roster` with a limit of 20, reading `currentActionId` and
 * `actionPhase` off every row. That is the **census** channel — the worker's
 * own answer about every prisoner — and it is reported beside, never mixed
 * with, the four rows the HUD draws.
 *
 * ## Rules inherited from the record, each paid for by a past failure
 *
 * 1. Every world press is checked with `document.elementFromPoint` first.
 * 2. Every screen dump is an UPPER BOUND — `innerText` ignores scroll clipping.
 * 3. Time is in ticks, from `simulation/clock-state`, never wall clock.
 * 4. A designation counts only if the room count went **up**.
 *
 * Findings live in `docs/research/2026-09-04-the-empty-work-block.md`.
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

/** `GENERAL_POPULATION_REGIME`, verbatim from `src/simulation/prisoners/regime.ts:105-118`. */
const BLOCKS: readonly (readonly [number, number, string])[] = [
  [0, 400, 'sleep'],
  [400, 500, 'meal+hygiene'],
  [500, 1000, 'WORK/education/association'],
  [1000, 1200, 'recreation+association'],
  [1200, 1300, 'meal'],
  [1300, 1800, 'WORK/education/association'],
  [1800, 2000, 'recreation+hygiene+association'],
  [2000, 2100, 'meal'],
  [2100, 2300, 'recreation+association+hygiene'],
  [2300, 2400, 'sleep'],
];

const blockAt = (tickOfDay: number): string => BLOCKS.find(([from, to]) => tickOfDay >= from && tickOfDay < to)?.[2] ?? '?';

/**
 * A second init script, beside `installTee`'s.
 *
 * The harness tee deliberately drops `simulation/projection` so its array
 * cannot grow without bound, and it keeps no reference to the worker — so
 * neither the reply nor a way to ask for one is reachable from a test. This
 * adds both, narrowly: the first `Worker` constructed is kept, and one
 * function posts a projection request and resolves the reply correlated by
 * `messageId`, exactly as `SimulationProjectionRequester` does
 * (`src/ui/simulation-projections.ts:159-183`).
 */
async function installCensusChannel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let held: Worker | undefined;
    class CensusWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        /*
         * **The LAST worker, not the first**, and the difference cost one
         * seven-minute run. "New prison" tears the session down and builds a
         * new `Worker`; a reference taken with `??=` therefore points at a
         * dead one for every prison after the first, and the request goes
         * nowhere with no error — it simply never answers.
         */
        held = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = CensusWorker as unknown as typeof Worker;
    (window as unknown as { lockstateAskRoster?: unknown }).lockstateAskRoster = (limit: number) =>
      new Promise((resolve, reject) => {
        const worker = held;
        if (worker === undefined) {
          reject(new Error('no worker was ever constructed'));
          return;
        }
        const messageId = `census-${String(Math.random()).slice(2)}`;
        const timer = setTimeout(() => {
          worker.removeEventListener('message', onMessage);
          reject(new Error('the worker did not answer the roster request'));
        }, 10_000);
        const onMessage = (event: MessageEvent): void => {
          /*
           * **`replyTo`, not `messageId`** — the second lesson this channel
           * cost. A reply carries a fresh `crypto.randomUUID()` as its own
           * `messageId` and names the request it answers in `replyTo`
           * (`src/simulation/worker/state-machine.ts:1381-1384`), so a
           * listener matching on `messageId` matches nothing at all and the
           * request looks like a worker that never answered.
           */
          const message = event.data as { kind?: string; replyTo?: string; payload?: unknown };
          if (message.replyTo !== messageId) return;
          clearTimeout(timer);
          worker.removeEventListener('message', onMessage);
          resolve(message.payload);
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({
          protocolVersion: 1,
          messageId,
          kind: 'simulation/request-projection',
          payload: { projectionId: 'hud/prisoner-roster', limit },
        });
      });
  });
}

interface CensusRow {
  readonly entityId: number;
  readonly action: string;
  readonly phase: string;
  readonly group: string;
  readonly lowestNeed: string;
}

/** Every prisoner the worker knows about, and what each is doing. */
async function census(page: Page, limit = 20): Promise<{ total: number; rows: readonly CensusRow[] }> {
  let raw: unknown;
  try {
    raw = await page.evaluate(
      (n) => (window as unknown as { lockstateAskRoster: (limit: number) => Promise<unknown> }).lockstateAskRoster(n),
      limit,
    );
  } catch (error) {
    // Non-fatal: a sample the census could not take is reported as such rather
    // than ending a run that has already built a prison.
    console.log(`[census] the worker did not answer: ${error instanceof Error ? error.message : String(error)}`);
    return { total: -1, rows: [] };
  }
  /*
   * The reply wraps the projection: `payload.view` is a transport envelope and
   * the read model itself is `payload.view.data`
   * (`src/simulation/worker/state-machine.ts:1396-1403`, and the client's own
   * unwrap at `src/ui/simulation-projections.ts:203`).
   */
  const payload = raw as { view?: { data?: { total?: number; rows?: readonly Record<string, unknown>[] } }; code?: string };
  if (payload.view?.data === undefined) console.log(`[census] a reply with no view: ${JSON.stringify(payload).slice(0, 400)}`);
  const view = payload.view?.data;
  const rows = (view?.rows ?? []).map((row) => {
    /*
     * **`lowestNeed.level.permille`, not `lowestNeed.permille`** — the third
     * lesson this channel cost, and unlike the first two it failed silently.
     * `PrisonerNeedViewModel` is `{ needId, level: BoundedValue,
     * unmetForStateIncome }`
     * (`src/simulation/presentation/prisoner-projection.ts:124-128`); the
     * figure lives one level down in `level`, so a reader asking for
     * `permille` at the top gets `undefined` and prints a confident **0%** for
     * every prisoner in the prison. Act 1's census printed `bladder 0%` beside
     * a HUD reading `Bladder 61%` for the same four people, and the HUD was
     * the one telling the truth. The action columns — the whole point of the
     * census — were never affected, which is why act 4's table stands.
     */
    const need = row['lowestNeed'] as { needId?: string; level?: { permille?: number } } | undefined;
    const permille = need?.level?.permille;
    return {
      entityId: Number(row['entityId'] ?? -1),
      action: String(row['currentActionId'] ?? '(none)'),
      phase: String(row['actionPhase'] ?? '?'),
      group: String(row['classificationGroupId'] ?? '?'),
      lowestNeed: `${need?.needId ?? '?'} ${permille === undefined ? '(no level field)' : `${String(Math.round(permille / 10))}%`}`,
    };
  });
  return { total: Number(view?.total ?? -1), rows };
}

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

async function wallSide(
  page: Page,
  label: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await assertCanvasAt(page, from.x, from.y, `${label} start`);
  await assertCanvasAt(page, to.x, to.y, `${label} end`);
  const before = (await sentCommands(page)).length;
  await drag(page, from, to);
  const produced = (await sentCommands(page)).slice(before);
  console.log(`[${label}]: ${produced.length} command(s)`);
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

/*
 * **The layout, measured rather than chosen.**
 *
 * Act 2's clearance map at 1440x900 says clear canvas is `x=11..22` for
 * `y=15..21` and `x=5..22` for `y=11..14` at the starting camera, and
 * `x=18..29` / `x=12..29` after **16** `ArrowRight` presses (453px, 7.08
 * tiles). Every rectangle below has its four boundary seams at least 32px
 * inside a measured-clear tile, which is what a wall drag needs — a seam is
 * 32px from either tile centre, so a rectangle whose *interior* is clear can
 * still have a boundary the HUD covers.
 *
 * The four walled rooms at the starting camera leave column `x=16` and row
 * `y=16` free as a corridor, and every door opens onto it; the corridor runs
 * north to open ground at `y=10`, so intake can walk in. The shower and the
 * yard need the panned camera because nothing 8x8 fits beside them.
 */
const CELL: Rect = { x0: 12, y0: 11, x1: 15, y1: 15 };
const CLASSROOM: Rect = { x0: 17, y0: 11, x1: 21, y1: 15 };
const KITCHEN: Rect = { x0: 12, y0: 17, x1: 15, y1: 20 };
const LAUNDRY: Rect = { x0: 17, y0: 17, x1: 19, y1: 19 };
const SHOWER: Rect = { x0: 23, y0: 11, x1: 25, y1: 13 };
const YARD: Rect = { x0: 22, y0: 14, x1: 29, y1: 21 };
/** How many `ArrowRight` presses put the shower and the yard on screen. */
const PAN_PRESSES = 16;

/** Walls all four sides of a rectangle, leaving one tile of one side open for a door. */
async function encloseWithDoor(
  page: Page,
  label: string,
  origin: Origin,
  r: Rect,
  door: { readonly side: 'N' | 'S' | 'E' | 'W'; readonly at: number },
): Promise<{ x: number; y: number }> {
  const edgeX = (tx: number) => origin.originX + tx * TILE;
  const edgeY = (ty: number) => origin.originY + ty * TILE;
  const midX = (tx: number) => centreOf(origin, tx, 0).x;
  const midY = (ty: number) => centreOf(origin, 0, ty).y;

  const horizontal = async (side: 'N' | 'S', y: number): Promise<void> => {
    if (door.side !== side) {
      await wallSide(page, `${label} ${side}`, { x: midX(r.x0), y }, { x: midX(r.x1), y });
      return;
    }
    if (door.at > r.x0) await wallSide(page, `${label} ${side} left`, { x: midX(r.x0), y }, { x: midX(door.at - 1), y });
    if (door.at < r.x1) await wallSide(page, `${label} ${side} right`, { x: midX(door.at + 1), y }, { x: midX(r.x1), y });
  };
  const vertical = async (side: 'W' | 'E', x: number): Promise<void> => {
    if (door.side !== side) {
      await wallSide(page, `${label} ${side}`, { x, y: midY(r.y0) }, { x, y: midY(r.y1) });
      return;
    }
    if (door.at > r.y0) await wallSide(page, `${label} ${side} top`, { x, y: midY(r.y0) }, { x, y: midY(door.at - 1) });
    if (door.at < r.y1) await wallSide(page, `${label} ${side} bottom`, { x, y: midY(door.at + 1) }, { x, y: midY(r.y1) });
  };

  await horizontal('N', edgeY(r.y0));
  await horizontal('S', edgeY(r.y1 + 1));
  await vertical('W', edgeX(r.x0));
  await vertical('E', edgeX(r.x1 + 1));

  return door.side === 'N'
    ? { x: midX(door.at), y: edgeY(r.y0) }
    : door.side === 'S'
      ? { x: midX(door.at), y: edgeY(r.y1 + 1) }
      : door.side === 'W'
        ? { x: edgeX(r.x0), y: midY(door.at) }
        : { x: edgeX(r.x1 + 1), y: midY(door.at) };
}

/** Places one buildable on each named tile, proving each press lands on canvas first. */
async function place(
  page: Page,
  label: string,
  origin: Origin,
  buildableId: string,
  tiles: readonly (readonly [number, number])[],
): Promise<void> {
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
}

/**
 * Builds the prison the two day-scans share, with or without the three rooms
 * the work block is about.
 *
 * The two calls differ in **exactly** `withWorkRooms` — same rectangles, same
 * furniture, same bed count, same admissions, same guards, same settling — so
 * the two day tables below are a paired counterfactual rather than two
 * unrelated prisons. That is the repair
 * `docs/research/2026-09-04-the-rooms-nobody-builds.md` names as its own
 * weakest claim.
 */
async function buildPrison(page: Page, label: string, withWorkRooms: boolean): Promise<void> {
  await page.getByRole('button', { name: 'New prison' }).click({ timeout: 30_000 });
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click({ timeout: 15_000 });
  const origin = await calibrate(page);
  console.log(`[${label}] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  for (const order of [
    { id: 'wall-brick', quantity: 170 },
    { id: 'door-wooden', quantity: 6 },
    { id: 'bed-wooden', quantity: 10 },
    { id: 'toilet-brick', quantity: 2 },
    { id: 'shower-head-brick', quantity: 3 },
    ...(withWorkRooms
      ? [
          { id: 'stove-brick', quantity: 2 },
          { id: 'prep-counter-brick', quantity: 2 },
          { id: 'fridge-brick', quantity: 2 },
          { id: 'washing-machine-brick', quantity: 3 },
          { id: 'bookshelf-wooden', quantity: 2 },
          { id: 'chair-wooden', quantity: 6 },
        ]
      : []),
  ]) {
    await buy(page, order.id, order.quantity);
  }
  console.log(`[${label}] after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  await fastForwardToMax(page);
  await page.waitForTimeout(8000);
  console.log(`[${label}] deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  // ---- the walled rooms at the starting camera ----
  const rooms: readonly { id: string; bounds: Rect; door: { side: 'N' | 'S' | 'E' | 'W'; at: number } }[] = [
    { id: 'room.cell', bounds: CELL, door: { side: 'E', at: 13 } },
    ...(withWorkRooms
      ? ([
          { id: 'room.classroom', bounds: CLASSROOM, door: { side: 'W', at: 13 } },
          { id: 'room.kitchen', bounds: KITCHEN, door: { side: 'E', at: 18 } },
          { id: 'room.laundry', bounds: LAUNDRY, door: { side: 'W', at: 18 } },
        ] as const)
      : []),
  ];

  await tab(page, 'build').click({ timeout: 15_000 });
  await armBuildable(page, 'wall-brick');
  const doorPoints: { x: number; y: number }[] = [];
  for (const room of rooms) {
    doorPoints.push(await encloseWithDoor(page, `${label} ${room.id}`, origin, room.bounds, room.door));
  }
  await armBuildable(page, 'door-wooden');
  for (const point of doorPoints) {
    await assertCanvasAt(page, point.x, point.y, `${label} door`);
    console.log(`[${label}] door at (${Math.round(point.x)},${Math.round(point.y)}): ${(await press(page, point.x, point.y)).length} command(s)`);
  }
  await waitForQueueEmpty(page, 500_000);
  await page.waitForTimeout(2000);

  for (const room of rooms) {
    const attempts = await designate(page, label, room.id, origin, room.bounds);
    console.log(`[${label}] ${room.id} accepted on attempt ${attempts}`);
    expect(attempts, `${room.id} was never accepted`).toBeGreaterThan(0);
  }

  await place(page, label, origin, 'bed-wooden', [
    [12, 11], [13, 11], [14, 11], [15, 11],
    [12, 13], [13, 13], [14, 13], [15, 13],
  ]);
  await place(page, label, origin, 'toilet-brick', [[12, 15]]);
  if (withWorkRooms) {
    await place(page, label, origin, 'stove-brick', [[12, 17]]);
    await place(page, label, origin, 'prep-counter-brick', [[14, 17]]);
    await place(page, label, origin, 'fridge-brick', [[12, 19]]);
    await place(page, label, origin, 'washing-machine-brick', [[17, 17], [17, 19]]);
    await place(page, label, origin, 'bookshelf-wooden', [[17, 11]]);
    await place(page, label, origin, 'chair-wooden', [[19, 11], [20, 11], [21, 11], [17, 13]]);
  }
  await waitForQueueEmpty(page, 500_000);
  await page.waitForTimeout(3000);
  console.log(`[${label}] the starting-camera rooms are up: ${JSON.stringify(await latestRawCounts(page))}`);

  // ---- the shower and the yard, on the panned camera ----
  await tab(page, 'build').click({ timeout: 15_000 });
  await page.locator('.hud-build__remove').click({ timeout: 15_000 });
  await page.locator('.hud-build__remove').click({ timeout: 15_000 });
  const focus = centreOf(origin, 16, 10);
  await assertCanvasAt(page, focus.x, focus.y, `${label} camera-focus point`);
  await page.mouse.click(focus.x, focus.y);
  for (let index = 0; index < PAN_PRESSES; index += 1) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1500);
  const panned = await calibrate(page);
  console.log(`[${label}] panned: tile (0,0) top-left = (${panned.originX}, ${panned.originY}), moved ${origin.originX - panned.originX}px`);

  await tab(page, 'build').click({ timeout: 15_000 });
  await armBuildable(page, 'wall-brick');
  const showerDoor = await encloseWithDoor(page, `${label} room.shower-room`, panned, SHOWER, { side: 'S', at: 24 });
  await armBuildable(page, 'door-wooden');
  await assertCanvasAt(page, showerDoor.x, showerDoor.y, `${label} shower door`);
  console.log(`[${label}] shower door: ${(await press(page, showerDoor.x, showerDoor.y)).length} command(s)`);
  await waitForQueueEmpty(page, 500_000);
  await page.waitForTimeout(2000);
  const showerAttempts = await designate(page, label, 'room.shower-room', panned, SHOWER);
  console.log(`[${label}] room.shower-room accepted on attempt ${showerAttempts}`);
  expect(showerAttempts, 'the shower room was never accepted').toBeGreaterThan(0);
  await place(page, label, panned, 'shower-head-brick', [[23, 11], [25, 11]]);
  await waitForQueueEmpty(page, 500_000);
  await page.waitForTimeout(2000);

  const yardAttempts = await designate(page, label, 'room.yard', panned, YARD);
  console.log(`[${label}] room.yard accepted on attempt ${yardAttempts}`);
  expect(yardAttempts, 'the yard was never accepted').toBeGreaterThan(0);

  await tab(page, 'rooms').click({ timeout: 15_000 });
  console.log(`[${label}] the Rooms tab with every room standing (UPPER BOUND):\n${await screen(page)}`);
  console.log(`[${label}] every room standing: ${JSON.stringify(await latestRawCounts(page))}`);

  // ---- people ----
  await tab(page, 'overview').click({ timeout: 15_000 });
  for (let index = 0; index < 8; index += 1) {
    await page.locator('.hud-intake__admit').click({ timeout: 30_000 });
    await page.waitForTimeout(250);
  }
  await tab(page, 'security').click({ timeout: 15_000 });
  for (let index = 0; index < 2; index += 1) {
    await page.locator('.hud-staff__hire').click({ timeout: 30_000 });
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2500);
  console.log(`[${label}] eight admitted, two guards hired: ${JSON.stringify(await latestRawCounts(page))}`);
  const probe = await census(page, 20);
  console.log(`[${label}] census probe right after admission: total=${probe.total}, ${probe.rows.length} row(s): ${JSON.stringify(probe.rows)}`);
  expect(probe.rows.length, 'the census channel answered nothing, so the day scan would measure nothing').toBeGreaterThan(0);
}

/**
 * One whole in-game day, sampled across it, from **two** channels at once:
 * the four rows the HUD draws, and the worker's own answer about every
 * prisoner in the prison.
 */
async function scanOneDay(page: Page, label: string, everyMs = 1200): Promise<void> {
  await tab(page, 'regime').click({ timeout: 15_000 });
  const scanStart = await currentTick(page);
  const byAction = new Map<string, number>();
  const byBlockAction = new Map<string, Map<string, number>>();
  let samples = 0;
  console.log(`[${label}] === DAY SCAN from tick ${scanStart} ===`);
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= scanStart + 2400) break;
    const tickOfDay = ((tick % 2400) + 2400) % 2400;
    const block = blockAt(tickOfDay);
    const seen = await census(page, 20);
    samples += 1;
    const tally = new Map<string, number>();
    for (const row of seen.rows) {
      const key = `${row.action}${row.phase === 'travelling' ? ' (travelling)' : ''}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
      byAction.set(row.action, (byAction.get(row.action) ?? 0) + 1);
      const perBlock = byBlockAction.get(block) ?? new Map<string, number>();
      perBlock.set(row.action, (perBlock.get(row.action) ?? 0) + 1);
      byBlockAction.set(block, perBlock);
    }
    const roster = (await panelText(page, '.hud-regime__roster')).replace(/\n/g, ' | ');
    console.log(
      `[${label}] t=${tick} tickOfDay=${tickOfDay} block=${block} :: census total=${seen.total} ` +
        JSON.stringify([...tally.entries()].sort((a, b) => b[1] - a[1])),
    );
    console.log(`[${label}]      HUD roster says: ${JSON.stringify(roster)}`);
    await page.waitForTimeout(everyMs);
  }
  console.log(`[${label}] === ${samples} samples over one whole day ===`);
  const total = [...byAction.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `[${label}] WHOLE DAY, prisoner-samples per action (${total} in all):\n` +
      [...byAction.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([action, n]) => `[${label}]   ${action.padEnd(32, ' ')} ${String(n).padStart(4, ' ')}  ${((n / total) * 100).toFixed(1)}%`)
        .join('\n'),
  );
  for (const [block, perBlock] of byBlockAction) {
    const blockTotal = [...perBlock.values()].reduce((sum, n) => sum + n, 0);
    console.log(
      `[${label}] BLOCK ${block} (${blockTotal} prisoner-samples): ` +
        JSON.stringify([...perBlock.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n} (${((n / blockTotal) * 100).toFixed(0)}%)`)),
    );
  }
}

test.describe('the empty work block', () => {
  test.beforeEach(async ({ page }) => {
    await installTee(page);
    await installCensusChannel(page);
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(`[page-error] ${message.text()}`);
    });
  });

  /**
   * **Act 1 — the Regime tab, played as a player.**
   *
   * The tab that decides what the blocks *are*. What is on it, what is
   * focusable, what a press does, and whether anything on it can be changed.
   */
  test('act 1 - what the Regime tab lets a player do', async ({ page }) => {
    test.setTimeout(900_000);
    await openApp(page);
    await buildAndPopulate(page, { beds: 4, admits: 4, guards: 1, label: 'act1' });
    await fastForwardToMax(page);
    await runToTick(page, 'act1', 600, 2000, 200_000);

    await tab(page, 'regime').click({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    console.log(`[act1] the Regime tab, whole (UPPER BOUND):\n${await screen(page)}`);

    // Every element under the panel, with its tag, class, role and whether it
    // is focusable or a control. This is the census of what a player can touch.
    const inventory = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.hud-regime');
      if (panel === null) return ['NO .hud-regime'];
      const out: string[] = [];
      for (const node of panel.querySelectorAll<HTMLElement>('*')) {
        const interactive =
          node.matches('button, [role="button"], a[href], input, select, textarea, [role="radio"], [role="checkbox"], [role="tab"], [contenteditable="true"]') ||
          node.tabIndex >= 0;
        if (!interactive) continue;
        out.push(
          `${node.tagName.toLowerCase()}.${node.className || '(no class)'}` +
            ` role=${node.getAttribute('role') ?? '-'} tabindex=${String(node.tabIndex)}` +
            ` disabled=${String(node.hasAttribute('disabled'))} text=${JSON.stringify((node.innerText ?? '').replace(/\n/g, ' | ').slice(0, 60))}`,
        );
      }
      return out;
    });
    console.log(`[act1] every focusable/interactive element on the Regime tab (${inventory.length}):`);
    for (const line of inventory) console.log(`[act1]   ${line}`);

    // The timetable block specifically: one row per classification group.
    const blockRows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-regime__block-row')].map(
        (row) =>
          `group=${row.dataset['group'] ?? '?'} tabindex=${String(row.tabIndex)}` +
          ` children-interactive=${String(row.querySelectorAll('button, [role="button"], input, select, [tabindex]').length)}` +
          ` text=${JSON.stringify((row.innerText ?? '').replace(/\n/g, ' | '))}`,
      ),
    );
    console.log(`[act1] the timetable, ${blockRows.length} row(s):`);
    for (const line of blockRows) console.log(`[act1]   ${line}`);

    // Whether the timetable has a box at all, from the DOM rather than from
    // Playwright's visibility rule — the two answer different questions and a
    // `boundingBox()` of `null` on its own is not evidence of anything.
    console.log(
      `[act1] geometry: ${JSON.stringify(
        await page.evaluate(() => {
          const out: Record<string, unknown> = { 'panels named .hud-regime': document.querySelectorAll('.hud-regime').length };
          for (const selector of ['.hud-regime', '.hud-regime__blocks', '.hud-regime__block-list', '.hud-regime__block-row', '.hud-regime__blocks-header']) {
            const node = document.querySelector<HTMLElement>(selector);
            if (node === null) {
              out[selector] = 'ABSENT';
              continue;
            }
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            out[selector] = `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)} display=${style.display} visibility=${style.visibility} hidden=${String(node.hidden)}`;
          }
          return out;
        }),
      )}`,
    );

    // Press each timetable row and see whether anything at all is submitted.
    for (const selector of ['.hud-regime__block-row', '.hud-regime__block-allows', '.hud-regime__block-name', '.hud-regime__blocks-header']) {
      const target = page.locator(selector).first();
      if ((await target.count()) === 0) {
        console.log(`[act1] press ${selector}: no such element`);
        continue;
      }
      const box = await target.boundingBox();
      if (box === null) {
        console.log(`[act1] press ${selector}: not laid out`);
        continue;
      }
      const before = (await sentCommands(page)).length;
      const screenBefore = await panelText(page, '.hud-regime__blocks');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(600);
      const produced = (await sentCommands(page)).slice(before);
      const screenAfter = await panelText(page, '.hud-regime__blocks');
      console.log(
        `[act1] press ${selector} at (${Math.round(box.x + box.width / 2)},${Math.round(box.y + box.height / 2)}):` +
          ` ${produced.length} command(s) submitted | timetable text changed = ${String(screenBefore !== screenAfter)}`,
      );
    }

    // Keyboard: can a player reach the timetable with Tab at all?
    await page.locator('.hud-regime__blocks-header').click({ timeout: 15_000 }).catch(() => undefined);
    const walk: string[] = [];
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let step = 0; step < 24; step += 1) {
      await page.keyboard.press('Tab');
      // eslint-disable-next-line no-await-in-loop -- one real keyboard.
      walk.push(
        await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          if (active === null) return 'null';
          return `${active.tagName.toLowerCase()}.${active.className || '(no class)'}`;
        }),
      );
    }
    console.log(`[act1] 24 Tab stops from the top of the document: ${JSON.stringify(walk)}`);
    console.log(`[act1] any Tab stop inside the timetable block? ${String(walk.some((stop) => stop.includes('block')))}`);

    // The roster window, against the true population.
    const rosterText = await panelText(page, '.hud-regime__roster');
    const seen = await census(page, 20);
    console.log(`[act1] HUD roster (UPPER BOUND): ${JSON.stringify(rosterText.replace(/\n/g, ' | '))}`);
    console.log(`[act1] worker census: total=${seen.total}, ${seen.rows.length} row(s) returned for a limit of 20`);
    for (const row of seen.rows) console.log(`[act1]   ${JSON.stringify(row)}`);
  });

  /**
   * **Act 2 — the geometry the two builds are laid out against.**
   *
   * Where clear canvas is at 1440x900, before and after a pan, so every
   * rectangle in acts 3 and 4 is measured rather than inherited.
   */
  test('act 2 - the clear canvas, before and after a pan', async ({ page }) => {
    test.setTimeout(900_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click({ timeout: 30_000 });
    await tab(page, 'build').click({ timeout: 15_000 });
    const origin = await calibrate(page);
    console.log(`[act2] camera 0: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
    console.log(`[act2] camera 0\n${await clearanceMap(page, origin)}`);

    const focus = centreOf(origin, 16, 14);
    await assertCanvasAt(page, focus.x, focus.y, 'act2 camera-focus point');
    await page.mouse.click(focus.x, focus.y);
    let pressed = 0;
    for (const target of [16, 32]) {
      for (; pressed < target; pressed += 1) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(1500);
      const panned = await calibrate(page);
      console.log(`[act2] after ${target} ArrowRight: tile (0,0) top-left = (${panned.originX}, ${panned.originY}) — moved ${origin.originX - panned.originX}px`);
      console.log(`[act2] after ${target} ArrowRight\n${await clearanceMap(page, panned)}`);
    }
  });

  /**
   * **Act 3 — the counterfactual.** Cell, shower room, yard. Eight prisoners.
   * One whole day, sampled. This is the prison the work block is empty in.
   */
  test('act 3 - a whole day WITHOUT the three work rooms', async ({ page }) => {
    test.setTimeout(2_400_000);
    await openApp(page);
    await buildPrison(page, 'act3', false);
    const admitted = await latestRawCounts(page);
    const settleFrom = await currentTick(page);
    await runToTick(page, 'act3', settleFrom + 2 * 2400, 3000, 600_000);
    console.log(`[act3] after two settling days: ${JSON.stringify(await latestRawCounts(page))}`);
    await scanOneDay(page, 'act3');
    const ended = await latestRawCounts(page);
    if (admitted !== undefined && ended !== undefined) console.log(`[act3] DELTA admission -> end of the scanned day\n${deltaVector(admitted, ended)}`);
    console.log(`[act3] events over the whole act: ${JSON.stringify(await eventTypes(page))}`);
    for (const which of ['overview', 'rooms', 'regime'] as const) {
      await tab(page, which).click({ timeout: 15_000 });
      console.log(`[act3] the three-room prison, ${which} (UPPER BOUND):\n${await screen(page)}`);
    }
  });

  /**
   * **Act 4 — the same prison plus a kitchen, a laundry and a classroom.**
   * The three rooms that have live `work`/`education` actions and had never
   * been built in a playtest here.
   */
  test('act 4 - a whole day WITH the three work rooms', async ({ page }) => {
    test.setTimeout(2_400_000);
    await openApp(page);
    await buildPrison(page, 'act4', true);
    const admitted = await latestRawCounts(page);
    const settleFrom = await currentTick(page);
    await runToTick(page, 'act4', settleFrom + 2 * 2400, 3000, 600_000);
    console.log(`[act4] after two settling days: ${JSON.stringify(await latestRawCounts(page))}`);
    await scanOneDay(page, 'act4');
    const ended = await latestRawCounts(page);
    if (admitted !== undefined && ended !== undefined) console.log(`[act4] DELTA admission -> end of the scanned day\n${deltaVector(admitted, ended)}`);
    console.log(`[act4] events over the whole act: ${JSON.stringify(await eventTypes(page))}`);
    for (const which of ['overview', 'rooms', 'regime'] as const) {
      await tab(page, which).click({ timeout: 15_000 });
      console.log(`[act4] the six-room prison, ${which} (UPPER BOUND):\n${await screen(page)}`);
    }
  });
});
