/**
 * A BIG PRISON — the scale pass.
 *
 * **Not a gate.** `.playtest.ts`, collected only by
 * `tests/browser/playwright.playtest.config.ts`. See that file's header.
 *
 * The question, as given: every playtest in this repository so far has been
 * small — the largest 30 prisoners, most four to twelve. Build a big prison —
 * many blocks, many rooms, as many prisoners as the game will take — and find
 * out what happens.
 *
 * Run one act at a time, from the worktree root:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5331 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-05-a-big-prison.playtest.ts -g "act 0"
 * ```
 *
 * The record is `docs/research/2026-09-05-a-big-prison.md`.
 */
import { test } from '@playwright/test';

import {
  TILE,
  armBuildable,
  buy,
  calibrate,
  centreOf,
  countsSeries,
  currentClock,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  runUntilTick,
  sentCommands,
  tab,
} from './playtest-harness';

const log = (line: string): void => {
  console.log(line);
};

/**
 * What is on top of a world point. A press on a HUD-covered point submits
 * nothing at all, and this repository has withdrawn three findings to that.
 */
async function topAt(page: import('@playwright/test').Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py]) => {
      const node = document.elementFromPoint(px as number, py as number);
      if (node === null) return 'NONE';
      const id = node.id === '' ? '' : `#${node.id}`;
      const cls = node.className === '' || typeof node.className !== 'string' ? '' : `.${node.className.split(/\s+/).join('.')}`;
      return `${node.tagName.toLowerCase()}${id}${cls}`;
    },
    [x, y],
  );
}


/* ------------------------------------------------------------------ *
 * The scale apparatus: a grid that is not 64px, a second tee that
 * keeps projections, and a build vocabulary bigger than one room.
 * ------------------------------------------------------------------ */

/**
 * The screen->tile transform at an arbitrary zoom.
 *
 * The harness's `calibrate` bisects for the origin and *assumes* `TILE` is the
 * pitch, which is true at zoom 1 and false at every other zoom. A prison that
 * fills the plot does not fit on a 1440x900 screen at zoom 1 -- the plot is one
 * 32x32 chunk (`world.setOwned`, `src/simulation/runtime/new-session.ts:433`,
 * its only call site) and act 0 measures the pressable window at about 23x14
 * tiles -- so the build has to happen zoomed out, and the pitch has to be
 * measured rather than assumed.
 */
interface Grid {
  readonly originX: number;
  readonly originY: number;
  readonly pitch: number;
}

/** A point in fractional tile units. `(0,0)` is tile (0,0)'s top-left corner. */
const pt = (g: Grid, tux: number, tuy: number) => ({ x: g.originX + tux * g.pitch, y: g.originY + tuy * g.pitch });
/** The centre of tile `(tx,ty)`. */
const mid = (g: Grid, tx: number, ty: number) => pt(g, tx + 0.5, ty + 0.5);

/**
 * Measures the transform by *read-back* rather than by bisection: the remove
 * tool answers a `RemoveObject` carrying the tile it hit, so a press at a known
 * screen x is a sample of `floor((x - originX) / pitch)`. Two widely separated
 * samples give the pitch to within `2 * pitch / (tx2 - tx1)`; a short bisection
 * on one boundary then pins the origin.
 */
async function measureGrid(page: import('@playwright/test').Page, probeXs: readonly [number, number], probeYs: readonly [number, number]): Promise<Grid> {
  await page.locator('.hud-build__remove').click();
  const tileAt = async (x: number, y: number): Promise<{ tx: number; ty: number } | undefined> => {
    const produced = await press(page, x, y);
    const removal = produced.find((c) => c['type'] === 'RemoveObject');
    if (removal === undefined) return undefined;
    return { tx: removal['x'] as number, ty: removal['y'] as number };
  };

  /**
   * The screen coordinate at which the tile index steps up, found by bisecting
   * a window one tile wide. Two of these, far apart, give the pitch exactly --
   * which a pair of raw samples does not, because each raw sample is a `floor`
   * and carries up to a whole tile of error.
   */
  const edge = async (axis: 'x' | 'y', from: number, other: number, width: number): Promise<{ at: number; tile: number }> => {
    const base = await tileAt(axis === 'x' ? from : other, axis === 'x' ? other : from);
    if (base === undefined) throw new Error(`no read-back at ${axis}=${from}`);
    const t0 = axis === 'x' ? base.tx : base.ty;
    let lo = from;
    let hi = from + width;
    for (let i = 0; i < 8; i += 1) {
      const m = (lo + hi) / 2;
      const hit = axis === 'x' ? await tileAt(m, other) : await tileAt(other, m);
      if (hit === undefined) throw new Error(`no read-back at ${axis}=${m}`);
      const t = axis === 'x' ? hit.tx : hit.ty;
      if (t === t0) lo = m;
      else hi = m;
    }
    return { at: hi, tile: t0 };
  };

  const guessPitch = TILE * 0.42;
  const xLow = await edge('x', probeXs[0], probeYs[0], guessPitch * 1.3);
  const xHigh = await edge('x', probeXs[1], probeYs[0], guessPitch * 1.3);
  const yLow = await edge('y', probeYs[0], probeXs[0], guessPitch * 1.3);
  const yHigh = await edge('y', probeYs[1], probeXs[0], guessPitch * 1.3);
  const pitchX = (xHigh.at - xLow.at) / (xHigh.tile - xLow.tile);
  const pitchY = (yHigh.at - yLow.at) / (yHigh.tile - yLow.tile);
  const pitch = (pitchX + pitchY) / 2;
  const originX = xLow.at - (xLow.tile + 1) * pitch;
  const originY = yLow.at - (yLow.tile + 1) * pitch;
  await page.locator('.hud-build__remove').click();
  log(
    `  [grid] edges x ${JSON.stringify(xLow)} ${JSON.stringify(xHigh)} y ${JSON.stringify(yLow)} ${JSON.stringify(yHigh)}`,
  );
  log(`  [grid] pitch ${pitch.toFixed(4)} (x ${pitchX.toFixed(4)}, y ${pitchY.toFixed(4)}) -> zoom ${(pitch / TILE).toFixed(5)}; origin (${originX.toFixed(2)}, ${originY.toFixed(2)})`);
  return { originX, originY, pitch };
}

/**
 * Adds a second worker tee that KEEPS `simulation/projection`, which the
 * harness's tee drops on purpose ("only the small messages, so the array cannot
 * grow without bound"). It also exposes `window.__ask`, which posts a
 * `simulation/request-projection` and resolves on the matching `replyTo` -- the
 * same request the HUD makes, with a `limit` the HUD never uses.
 *
 * **Read-only, and it is not a command.** A projection request advances no
 * tick, draws no RNG and never touches `SimulationCommandSender`'s sequence, so
 * asking cannot perturb what it measures.
 *
 * Install it AFTER `installTee`: it wraps whatever `window.Worker` then is.
 */
async function installProjectionAsker(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const Wrapped = Worker;
    let live: Worker | undefined;
    class AskWorker extends Wrapped {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        live = this as unknown as Worker;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = AskWorker as unknown as typeof Worker;
    (window as unknown as { __ask: unknown }).__ask = (projectionId: string, query: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        if (live === undefined) {
          reject(new Error('no worker yet'));
          return;
        }
        const messageId = crypto.randomUUID();
        const timer = setTimeout(() => {
          live?.removeEventListener('message', onMessage);
          reject(new Error(`no reply to ${projectionId}`));
        }, 20_000);
        const onMessage = (event: MessageEvent): void => {
          const data = event.data as { kind?: string; replyTo?: string; payload?: unknown };
          if (data.replyTo !== messageId) return;
          clearTimeout(timer);
          live?.removeEventListener('message', onMessage);
          resolve(data.payload);
        };
        live.addEventListener('message', onMessage);
        live.postMessage({
          protocolVersion: 1,
          messageId,
          kind: 'simulation/request-projection',
          payload: { projectionId, ...query },
        });
      });
  });
}

async function ask<T>(page: import('@playwright/test').Page, projectionId: string, query: Record<string, unknown> = {}): Promise<T> {
  return page.evaluate(
    ([id, q]) => (window as unknown as { __ask: (a: string, b: unknown) => Promise<unknown> }).__ask(id as string, q),
    [projectionId, query],
  ) as Promise<T>;
}

/** A room to build: the tile rectangle, the catalogue id, and where its door goes. */
interface Plan {
  readonly key: string;
  readonly room: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** Column whose SOUTH edge is left out of the wall run and given a door. */
  readonly doorAtX?: number;
  readonly walls: boolean;
}

/** Draws one wall run along a tile-edge line, or presses once if it is a single segment. */
async function run(page: import('@playwright/test').Page, g: Grid, a: { x: number; y: number }, b: { x: number; y: number }, label: string): Promise<number> {
  const before = (await sentCommands(page)).length;
  if (Math.abs(a.x - b.x) < g.pitch / 2 && Math.abs(a.y - b.y) < g.pitch / 2) await press(page, a.x, a.y);
  else await drag(page, a, b);
  const produced = (await sentCommands(page)).slice(before);
  log(`  [wall] ${label}: ${produced.length} command(s)`);
  return produced.length;
}

/** The four wall lines of a plan, with the door segment left out of the south run. */
async function wallsFor(page: import('@playwright/test').Page, g: Grid, plan: Plan): Promise<number> {
  let produced = 0;
  const { x0, y0, x1, y1 } = plan;
  produced += await run(page, g, pt(g, x0 + 0.5, y0), pt(g, x1 + 0.5, y0), `${plan.key} north`);
  produced += await run(page, g, pt(g, x0, y0 + 0.5), pt(g, x0, y1 + 0.5), `${plan.key} west`);
  produced += await run(page, g, pt(g, x1 + 1, y0 + 0.5), pt(g, x1 + 1, y1 + 0.5), `${plan.key} east`);
  const gap = plan.doorAtX;
  if (gap === undefined) {
    produced += await run(page, g, pt(g, x0 + 0.5, y1 + 1), pt(g, x1 + 0.5, y1 + 1), `${plan.key} south`);
  } else {
    if (gap - 1 >= x0) produced += await run(page, g, pt(g, x0 + 0.5, y1 + 1), pt(g, gap - 0.5, y1 + 1), `${plan.key} south-west`);
    if (gap + 1 <= x1) produced += await run(page, g, pt(g, gap + 1.5, y1 + 1), pt(g, x1 + 0.5, y1 + 1), `${plan.key} south-east`);
  }
  return produced;
}

/* ------------------------------------------------------------------ *
 * The prison, as a table.
 * ------------------------------------------------------------------ */

/** `KEYBOARD_ZOOM_STEP` is 1.25 (`src/rendering/scene/world-scene.ts:86`), so four notches is 1/1.25^4 = 0.4096. */
const ZOOM_OUT_NOTCHES = 4;

/**
 * Eight rooms on one 32x32 plot, kept inside x 1..23 and y 1..29.
 *
 * Three cell blocks rather than one dormitory, because the question asks for
 * many blocks; a shower room at the catalogue's 3x3 minimum with two shower
 * heads, because that is a **hygiene ceiling of two** against the whole
 * population and it is the room ADR 0062 was written about; a classroom, a
 * canteen, a common room and a yard, because those are the four rooms a
 * prisoner's day has actions for and no playtest has had all of them at once.
 */
const PLANS: readonly Plan[] = [
  { key: 'block-A', room: 'room.cell', x0: 1, y0: 1, x1: 12, y1: 6, doorAtX: 6, walls: true },
  { key: 'block-B', room: 'room.cell', x0: 1, y0: 9, x1: 12, y1: 14, doorAtX: 6, walls: true },
  { key: 'block-C', room: 'room.cell', x0: 1, y0: 17, x1: 8, y1: 22, doorAtX: 4, walls: true },
  { key: 'shower', room: 'room.shower-room', x0: 15, y0: 1, x1: 17, y1: 3, doorAtX: 16, walls: true },
  { key: 'classroom', room: 'room.classroom', x0: 19, y0: 1, x1: 23, y1: 5, doorAtX: 21, walls: true },
  { key: 'canteen', room: 'room.canteen', x0: 15, y0: 8, x1: 20, y1: 13, doorAtX: 17, walls: true },
  { key: 'common', room: 'room.common-room', x0: 15, y0: 16, x1: 19, y1: 20, doorAtX: 17, walls: true },
  { key: 'yard', room: 'room.yard', x0: 13, y0: 22, x1: 22, y1: 29, walls: false },
];

const bedRow = (y: number, from: number, to: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let x = from; x <= to; x += 1) out.push([x, y]);
  return out;
};

/** Every object press, grouped by buildable so the tool is armed once per group. */
const OBJECTS: readonly { buildable: string; at: readonly [number, number][] }[] = [
  {
    buildable: 'bed-wooden',
    at: [
      ...bedRow(1, 1, 12), ...bedRow(4, 1, 12), // block A, 24
      ...bedRow(9, 1, 12), ...bedRow(12, 1, 12), // block B, 24
      ...bedRow(17, 1, 8), ...bedRow(20, 1, 8), // block C, 16
    ],
  },
  { buildable: 'toilet-brick', at: [[1, 6], [2, 6], [3, 6], [1, 14], [2, 14], [3, 14], [1, 22], [2, 22]] },
  { buildable: 'shower-head-brick', at: [[15, 1], [16, 1]] },
  { buildable: 'bookshelf-wooden', at: [[19, 1]] },
  { buildable: 'chair-wooden', at: [[19, 3], [20, 3], [21, 3], [22, 3]] },
  { buildable: 'dining-table-wooden', at: [[15, 8], [18, 8]] },
  { buildable: 'bench-wooden', at: [[15, 11], [17, 11], [15, 12], [17, 12], [15, 16], [17, 16]] },
];

/**
 * 169 wall segments (176 perimeter minus 7 door gaps) at 2 brick each, 8
 * toilets and 2 shower heads at 1 -- 348 brick. Bought with headroom because a
 * shortfall stalls the queue rather than refusing the press.
 */
const BRICKS = 380;
/** 64 beds, 7 doors, 1 bookshelf (2), 4 chairs, 2 dining tables (3), 6 benches (2) -- 95 plank. */
const PLANKS = 110;
const ADMISSIONS = 64;
/** `ceil(64/8) = 8` posted, plus a reserve. */
const GUARDS = 10;
const RUN_ROUNDS = 8;
/** About one in-game day, measured at ~2,100 ticks in `2026-09-04-hour-two.md`. */
const TICKS_PER_ROUND = 2_200;

/**
 * Waits on the Build panel's own queue readout, sampling as it goes.
 *
 * The sampling is the measurement: `ConstructionSystem` runs one order at a
 * time (`crewBusy`, `src/simulation/construction/system.ts:1412`) at
 * `+10` progress per scheduled tick on a 10-tick schedule
 * (`schedule = { intervalTicks: 10 }`, `:269`), so a wall's 50 work is five
 * construction ticks and the queue drains in ticks-per-order, serially. How
 * that behaves with 176 orders in it is the thing no playtest has had enough
 * orders to see.
 */
async function drainQueue(
  page: import('@playwright/test').Page,
  label: string,
  timeoutMs: number,
): Promise<{ startTick: number; endTick: number; samples: number; ticksPerSample: string }> {
  await tab(page, 'build').click();
  const startTick = await currentTick(page);
  const started = Date.now();
  const marks: { tick: number; ms: number; text: string }[] = [];
  for (;;) {
    const text = (await panelText(page, '.hud-build__queue')).replace(/\n/g, ' ');
    const tick = await currentTick(page);
    marks.push({ tick, ms: Date.now() - started, text });
    if (marks.length % 6 === 1 || /(?<![0-9])0 waiting . 0 being built/.test(text)) {
      log(`  [${label}] tick ${tick} (+${tick - startTick}) page ${Math.round((Date.now() - started) / 1000)}s: ${text}`);
    }
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) break;
    if (Date.now() - started > timeoutMs) {
      log(`  [${label}] TIMED OUT with: ${text}`);
      break;
    }
    await page.waitForTimeout(4000);
  }
  const endTick = await currentTick(page);
  const rates = marks
    .slice(1)
    .map((m, i) => ((m.tick - marks[i]!.tick) / ((m.ms - marks[i]!.ms) / 1000)).toFixed(1))
    .join(',');
  return { startTick, endTick, samples: marks.length, ticksPerSample: rates };
}

/** Zones one plan, retrying the way `buildAndPopulate` does and for the same reason. */
async function designate(page: import('@playwright/test').Page, g: Grid, plan: Plan): Promise<string> {
  const started = Date.now();
  const before = (await latestCounts(page))?.rooms ?? 0;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    const row = page.locator(`.hud-rooms__list [data-room="${plan.room}"]`);
    if ((await row.count()) === 0) return `NO ROW for ${plan.room}`;
    await row.first().click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, mid(g, plan.x0, plan.y0), mid(g, plan.x1, plan.y1));
    const note = await panelText(page, '.hud-rooms');
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(900);
    const after = (await latestCounts(page))?.rooms ?? 0;
    if (after > before) return `ok on attempt ${attempt} after ${Date.now() - started}ms, rooms ${before}->${after}`;
    log(
      `  [zone] ${plan.key} attempt ${attempt}: rooms still ${after}` +
        ` | ${JSON.stringify(note.split('\n').filter((l) => /OPEN|ENCLOS|NEED|no way/i.test(l)))}` +
        ` | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    await page.waitForTimeout(4000);
  }
  return 'NEVER ACCEPTED';
}

/** One full reading of the prison: the numbers, then the sentences, kept apart. */
async function report(page: import('@playwright/test').Page, label: string): Promise<void> {
  const counts = await latestCounts(page);
  const nodes = await page.evaluate(() => document.querySelectorAll('.hud *').length);
  const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? -1);
  log(`[report:${label}] counts ${JSON.stringify(counts)}`);
  log(`[report:${label}] clock ${JSON.stringify(await currentClock(page))} | hudNodes ${nodes} | usedJSHeap ${heap}`);
  await tab(page, 'overview').click();
  log(`[report:${label}] strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  log(`[report:${label}] alerts: ${JSON.stringify((await panelText(page, '.hud-alerts__list')).split('\n'))}`);
  try {
    const roster = await ask<{ page?: { total?: number; offset?: number }; view?: { rows?: unknown[] } }>(page, 'hud/prisoner-roster', { limit: 500 });
    const rows = (roster.view?.rows ?? []) as {
      entityId?: unknown;
      currentActionId?: string;
      actionPhase?: string;
      lowestNeed?: { needId?: string; level?: number };
      riskTier?: number;
      accommodation?: unknown;
    }[];
    const byAction = new Map<string, number>();
    const byPhase = new Map<string, number>();
    const byNeed = new Map<string, number>();
    let housed = 0;
    let worstLevel = Number.POSITIVE_INFINITY;
    let worstNeed = '';
    for (const r of rows) {
      byAction.set(r.currentActionId ?? '(none)', (byAction.get(r.currentActionId ?? '(none)') ?? 0) + 1);
      byPhase.set(r.actionPhase ?? '(none)', (byPhase.get(r.actionPhase ?? '(none)') ?? 0) + 1);
      const need = r.lowestNeed?.needId ?? '(none)';
      byNeed.set(need, (byNeed.get(need) ?? 0) + 1);
      if (r.accommodation !== undefined) housed += 1;
      const level = r.lowestNeed?.level ?? Number.POSITIVE_INFINITY;
      if (level < worstLevel) {
        worstLevel = level;
        worstNeed = need;
      }
    }
    log(
      `[report:${label}] roster rows ${rows.length} of total ${String(roster.page?.total)}; housed ${housed};` +
        ` actions ${JSON.stringify([...byAction].sort((a, b) => b[1] - a[1]))};` +
        ` phases ${JSON.stringify([...byPhase])};` +
        ` lowestNeed ${JSON.stringify([...byNeed].sort((a, b) => b[1] - a[1]))};` +
        ` worst ${worstNeed}=${worstLevel}`,
    );
  } catch (error) {
    log(`[report:${label}] roster projection failed: ${String(error).slice(0, 200)}`);
  }
}

test.describe('A big prison — the scale pass', () => {
  /*
   * **An action timeout, because the config sets none and Playwright's default
   * is `0`.** The first run of act 0 wedged for eight minutes on
   * `locator.click()` against a point the HUD covers: the actionability check
   * ("receives pointer events") retried for ever, and a hung run reads exactly
   * like a hung game. Every gesture below that has to reach the world goes
   * through `page.mouse` for the same reason; this is the belt.
   */
  test.use({ actionTimeout: 20_000 });

  test.beforeEach(async ({ page }) => {
    await installTee(page);
    await installProjectionAsker(page);
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error' || message.type() === 'warning' || text.includes('HUD action failed')) {
        log(`  [page:${message.type()}] ${text.slice(0, 400)}`);
      }
    });
  });

  /**
   * act 0 — how much prison the player can reach at all.
   *
   * Three questions, and every later act's layout depends on all three:
   *   1. What tile window is pressable at 1440x900 and zoom 1?
   *   2. What does the keyboard zoom-out do to that window, and does the
   *      screen->tile transform stay measurable once the pitch is not 64?
   *   3. How big is the plot? `world.setOwned` has one call site
   *      (`src/simulation/runtime/new-session.ts:433`) and it owns one 32x32
   *      chunk, so this asks the build tool where the refusal starts.
   */
  test('act 0 — the reachable canvas, the zoom, and the size of the plot', async ({ page }) => {
    test.setTimeout(900_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'build').click();

    const origin = await calibrate(page);
    log(`[act0] zoom 1 origin: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

    // 1. The pressable window at zoom 1: walk tile centres and ask what is on top.
    const size = page.viewportSize() ?? { width: 1440, height: 900 };
    const reachable: string[] = [];
    const blocked: string[] = [];
    for (let ty = 0; ty < 32; ty += 1) {
      for (let tx = 0; tx < 32; tx += 1) {
        const p = centreOf(origin, tx, ty);
        if (p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height) continue;
        const top = await topAt(page, p.x, p.y);
        if (top.startsWith('canvas')) reachable.push(`${tx},${ty}`);
        else blocked.push(`${tx},${ty}=${top}`);
      }
    }
    const xs = reachable.map((k) => Number(k.split(',')[0]));
    const ys = reachable.map((k) => Number(k.split(',')[1]));
    log(`[act0] zoom 1: ${reachable.length} tile centres are on canvas, ${blocked.length} are covered`);
    log(`[act0] zoom 1 pressable tile box: x ${Math.min(...xs)}..${Math.max(...xs)}, y ${Math.min(...ys)}..${Math.max(...ys)}`);
    log(`[act0] zoom 1 covered, first 12: ${JSON.stringify(blocked.slice(0, 12))}`);

    // 2. Zoom out. `Minus` is `camera.zoom.out`, KEYBOARD_ZOOM_STEP 1.25,
    //    ZOOM_BOUNDS.min 0.2 (`src/rendering/scene/world-scene.ts:68,86`).
    // No focus click: `world-scene.ts:500` binds `keydown` on `window`.
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Minus');
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(500);

    // Re-derive the transform by direct read-back rather than by assuming TILE.
    await page.locator('.hud-build__remove').click();
    const probeXs = [420, 560, 700, 840, 980, 1120];
    const samples: { sx: number; tx: number }[] = [];
    for (const sx of probeXs) {
      const produced = await press(page, sx, 300);
      const removal = produced.find((c) => c['type'] === 'RemoveObject');
      if (removal === undefined) {
        log(`[act0] zoomed press at ${sx},300 produced no RemoveObject: ${JSON.stringify(produced)}`);
        continue;
      }
      samples.push({ sx, tx: removal['x'] as number });
    }
    log(`[act0] zoomed-out x samples: ${JSON.stringify(samples)}`);
    if (samples.length >= 2) {
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      const pitch = (last.sx - first.sx) / (last.tx - first.tx);
      log(`[act0] zoomed-out tile pitch from the read-back = ${pitch.toFixed(3)} px (zoom = ${(pitch / TILE).toFixed(4)})`);
    }
    const probeYs = [200, 320, 440, 560, 680];
    const ySamples: { sy: number; ty: number }[] = [];
    for (const sy of probeYs) {
      const produced = await press(page, 700, sy);
      const removal = produced.find((c) => c['type'] === 'RemoveObject');
      if (removal !== undefined) ySamples.push({ sy, ty: removal['y'] as number });
    }
    log(`[act0] zoomed-out y samples: ${JSON.stringify(ySamples)}`);
    await page.locator('.hud-build__remove').click();

    // 3. How big is the plot? Arm a wall and try to draw one well outside
    //    chunk (0,0), then read the refusal band.
    log(`[act0] refusal band before: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`[act0] status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
    log(`[act0] tick ${await currentTick(page)} clock ${JSON.stringify(await currentClock(page))}`);
    log(`[act0] counts: ${JSON.stringify(await latestCounts(page))}`);
    log(`[act0] total commands submitted this act: ${(await sentCommands(page)).length}`);
    log(`[act0] hud node count: ${await page.evaluate(() => document.querySelectorAll('.hud *').length)}`);
  });

  /**
   * act 1 — the big prison.
   *
   * Eight rooms across the plot, three of them cell blocks, 64 beds, doors so
   * the rooms can actually be walked into, then as many prisoners as the beds
   * will take and the guards `ceil(occupants/8)` asks for.
   *
   * **What is gesture and what is harness.** Everything the player does is a
   * real mouse gesture through the harness's `press`/`drag`/`armBuildable`/`buy`
   * — the same primitives `buildAndPopulate` is made of, driven from a layout
   * table instead of from one hard-coded 6x6 room. `buildAndPopulate` itself is
   * NOT used: it builds one 6x6 cell at fixed tiles and assumes a 64px pitch,
   * and this prison is neither. Nothing here writes simulation state directly.
   * The one non-gesture instrument is `__ask`, which asks the worker for the
   * projections the HUD asks for with a `limit` the HUD never uses — a read,
   * and never a command.
   */
  test('act 1 — build it, fill it, and see what it costs', async ({ page }) => {
    test.setTimeout(3_000_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'build').click();
    log(`[act1] hud nodes on arrival: ${await page.evaluate(() => document.querySelectorAll('.hud *').length)}`);

    // --- the camera -------------------------------------------------------
    for (let i = 0; i < ZOOM_OUT_NOTCHES; i += 1) {
      await page.keyboard.press('Minus');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(600);
    const g = await measureGrid(page, [400, 1050], [150, 780]);

    // Which of the 32x32 plot a pointer can actually reach, at this zoom.
    const covered: string[] = [];
    let onCanvas = 0;
    for (let ty = 0; ty < 32; ty += 1) {
      for (let tx = 0; tx < 32; tx += 1) {
        const p = mid(g, tx, ty);
        const top = await topAt(page, p.x, p.y);
        if (top.startsWith('canvas')) onCanvas += 1;
        else covered.push(`${tx},${ty}=${top}`);
      }
    }
    log(`[act1] at zoom ${(g.pitch / TILE).toFixed(4)}: ${onCanvas} of 1024 plot tiles are pressable, ${covered.length} are not`);
    log(`[act1] not pressable (first 20): ${JSON.stringify(covered.slice(0, 20))}`);
    const inPlan = covered.filter((entry) => {
      const [tx, ty] = entry.split('=')[0]!.split(',').map(Number) as [number, number];
      return PLANS.some((plan) => tx >= plan.x0 - 1 && tx <= plan.x1 + 1 && ty >= plan.y0 - 1 && ty <= plan.y1 + 1);
    });
    log(`[act1] planned tiles that are NOT pressable: ${inPlan.length} ${JSON.stringify(inPlan.slice(0, 10))}`);

    // --- materials --------------------------------------------------------
    await buy(page, 'wall-brick', BRICKS);
    await buy(page, 'bed-wooden', PLANKS);
    const afterBuying = await latestCounts(page);
    log(`[act1] after buying ${BRICKS} brick and ${PLANKS} plank: funds=${afterBuying?.treasuryMinorUnits}`);
    log(`[act1] strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

    await fastForwardToMax(page);
    await page.waitForTimeout(2000);
    log(`[act1] clock: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);
    await runUntilTick(page, (await currentTick(page)) + 150);
    log(`[act1] deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    // --- walls and doors --------------------------------------------------
    const wallsStartedAt = await currentTick(page);
    await tab(page, 'build').click();
    await armBuildable(page, 'wall-brick');
    let wallCommands = 0;
    for (const plan of PLANS.filter((p) => p.walls)) wallCommands += await wallsFor(page, g, plan);
    log(`[act1] ${wallCommands} wall command(s) submitted, from tick ${wallsStartedAt} to ${await currentTick(page)}`);

    await armBuildable(page, 'door-wooden');
    let doorCommands = 0;
    for (const plan of PLANS.filter((p) => p.walls && p.doorAtX !== undefined)) {
      const before = (await sentCommands(page)).length;
      const p = pt(g, plan.doorAtX! + 0.5, plan.y1 + 1);
      const top = await topAt(page, p.x, p.y);
      await press(page, p.x, p.y);
      const produced = (await sentCommands(page)).slice(before);
      doorCommands += produced.length;
      log(`  [door] ${plan.key} at (${plan.doorAtX},${plan.y1}) south: ${produced.length} command(s), top=${top}`);
    }
    log(`[act1] ${doorCommands} door command(s); queue now ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    const wallsBuilt = await drainQueue(page, 'walls+doors', 1_500_000);
    log(`[act1] walls+doors drained: ${JSON.stringify(wallsBuilt)}`);
    log(`[act1] funds after the shell: ${JSON.stringify(await latestCounts(page))}`);

    // --- zoning -----------------------------------------------------------
    for (const plan of PLANS) {
      const zoned = await designate(page, g, plan);
      log(`[act1] designate ${plan.key} (${plan.room}) -> ${zoned}`);
    }
    const afterZoning = await latestCounts(page);
    log(`[act1] after zoning: rooms=${afterZoning?.rooms} accommodationCapacity=${afterZoning?.accommodationCapacity} roomCapacity=${afterZoning?.roomCapacity}`);
    log(`[act1] rooms panel: ${await panelText(page, '.hud-rooms')}`);

    // --- furniture --------------------------------------------------------
    await tab(page, 'build').click();
    const objectsStartedAt = await currentTick(page);
    let objectCommands = 0;
    let objectMisses = 0;
    for (const group of OBJECTS) {
      await armBuildable(page, group.buildable);
      for (const [tx, ty] of group.at) {
        const before = (await sentCommands(page)).length;
        const p = mid(g, tx, ty);
        await press(page, p.x, p.y);
        const produced = (await sentCommands(page)).slice(before);
        if (produced.length === 0) {
          objectMisses += 1;
          if (objectMisses <= 8) log(`  [object] ${group.buildable} at (${tx},${ty}) produced NO command; top=${await topAt(page, p.x, p.y)}`);
        } else objectCommands += produced.length;
      }
      log(`  [object] ${group.buildable}: ${group.at.length} press(es)`);
    }
    log(`[act1] ${objectCommands} object command(s), ${objectMisses} press(es) produced nothing, from tick ${objectsStartedAt}`);
    const objectsBuilt = await drainQueue(page, 'objects', 1_500_000);
    log(`[act1] objects drained: ${JSON.stringify(objectsBuilt)}`);

    const furnished = await latestCounts(page);
    log(`[act1] furnished: ${JSON.stringify(furnished)}`);
    await tab(page, 'rooms').click();
    log(`[act1] rooms panel when furnished: ${await panelText(page, '.hud-rooms')}`);
    log(`[act1] room-list projection: ${JSON.stringify(await ask(page, 'hud/room-list', { limit: 64 }))}`);

    // --- people -----------------------------------------------------------
    await tab(page, 'overview').click();
    const admitFrom = (await sentCommands(page)).length;
    let admitThrew = 0;
    for (let i = 0; i < ADMISSIONS; i += 1) {
      try {
        await page.locator('.hud-intake__admit').click();
      } catch (error) {
        admitThrew += 1;
        log(`  [admit] press ${i + 1} threw: ${String(error).slice(0, 120)}`);
      }
      await page.waitForTimeout(120);
    }
    const admitCommands = (await sentCommands(page)).slice(admitFrom).filter((c) => c['type'] === 'AdmitPrisoner').length;
    log(`[act1] ${ADMISSIONS} Admit press(es) -> ${admitCommands} AdmitPrisoner command(s) reached the worker, ${admitThrew} threw`);
    await page.waitForTimeout(3000);
    const admitted = await latestCounts(page);
    log(`[act1] after admissions at tick ${admitted?.tick}: prisoners=${admitted?.prisoners} inIntake=${admitted?.prisonersInIntake} residents=${admitted?.roomOccupants} capacity=${admitted?.accommodationCapacity}`);
    log(`[act1] intake panel: ${await panelText(page, '.hud-intake')}`);

    await tab(page, 'security').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    for (let i = 0; i < GUARDS; i += 1) {
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1500);
    const staffed = await latestCounts(page);
    log(`[act1] after ${GUARDS} Hire press(es): staff=${staffed?.staff} wageBill=${staffed?.dailyWageBillMinorUnits} funds=${staffed?.treasuryMinorUnits}`);
    log(`[act1] staff panel: ${await panelText(page, '.hud-staff')}`);

    await report(page, 'built');

    // --- run it -----------------------------------------------------------
    const startTick = await currentTick(page);
    for (let round = 1; round <= RUN_ROUNDS; round += 1) {
      await runUntilTick(page, startTick + round * TICKS_PER_ROUND, 1_200_000);
      await report(page, `round ${round}`);
    }

    // --- the closing screen, whole -----------------------------------------
    for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(400);
      log(`[act1] === TAB ${id} ===\n${await panelText(page, '.hud')}`);
    }
    const series = await countsSeries(page);
    log(`[act1] counts series length ${series.length}; first ${JSON.stringify(series[0])}; last ${JSON.stringify(series[series.length - 1])}`);
  });

  /**
   * act 0b — the apparatus, proved on one small room before 176 walls are
   * spent on it. Zoom out, measure the pitch, draw a 3x3 shower room with a
   * door in it, zone it, furnish it, and ask the worker for a projection.
   */
  test('act 0b — the apparatus, on one room', async ({ page }) => {
    test.setTimeout(1_200_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await tab(page, 'build').click();
    for (let i = 0; i < ZOOM_OUT_NOTCHES; i += 1) {
      await page.keyboard.press('Minus');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(600);
    const g = await measureGrid(page, [400, 1050], [150, 780]);

    await buy(page, 'wall-brick', 40);
    await buy(page, 'bed-wooden', 10);
    await fastForwardToMax(page);
    await runUntilTick(page, (await currentTick(page)) + 150);

    const plan = PLANS.find((p) => p.key === 'shower')!;
    await tab(page, 'build').click();
    await armBuildable(page, 'wall-brick');
    const walls = await wallsFor(page, g, plan);
    await armBuildable(page, 'door-wooden');
    const doorPoint = pt(g, plan.doorAtX! + 0.5, plan.y1 + 1);
    const before = (await sentCommands(page)).length;
    await press(page, doorPoint.x, doorPoint.y);
    const doorCommands = (await sentCommands(page)).slice(before);
    log(`[act0b] ${walls} wall command(s); door produced ${doorCommands.length}: ${JSON.stringify(doorCommands)}`);

    log(`[act0b] drain: ${JSON.stringify(await drainQueue(page, 'shell', 600_000))}`);
    log(`[act0b] designate -> ${await designate(page, g, plan)}`);
    await tab(page, 'build').click();
    await armBuildable(page, 'shower-head-brick');
    for (const [tx, ty] of [[15, 1], [16, 1]] as const) {
      const p = mid(g, tx, ty);
      const produced = await press(page, p.x, p.y);
      log(`[act0b] shower head at (${tx},${ty}): ${produced.length} command(s), top=${await topAt(page, p.x, p.y)}`);
    }
    log(`[act0b] drain: ${JSON.stringify(await drainQueue(page, 'heads', 600_000))}`);
    await tab(page, 'rooms').click();
    log(`[act0b] rooms panel: ${await panelText(page, '.hud-rooms')}`);
    log(`[act0b] counts: ${JSON.stringify(await latestCounts(page))}`);
    log(`[act0b] room-list projection: ${JSON.stringify(await ask(page, 'hud/room-list', { limit: 32 }))}`);
    log(`[act0b] roster projection: ${JSON.stringify(await ask(page, 'hud/prisoner-roster', { limit: 500 }))}`);
  });
});
