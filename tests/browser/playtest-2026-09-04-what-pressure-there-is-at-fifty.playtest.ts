import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  armBuildable,
  buy,
  calibrate,
  centreOf,
  drag,
  fastForwardToMax,
  openApp,
  panelText,
  press,
  sentCommands,
  tab,
  TILE,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **The same question as
 * `tests/browser/playtest-2026-09-04-what-pressure-there-is.playtest.ts`, at
 * fifty prisoners instead of four.**
 *
 * That file measured the shipped treasury curve and the curve with
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` restored to `40`, and
 * closed by naming its own open item: *"every ratio here is at `n = 4`, so a
 * fifty-prisoner prison is unmeasured and is the one balance actually needs."*
 * The owner, shown those numbers, ruled: restore the constant to 40, but
 * measure at fifty prisoners first. This file is that measurement.
 *
 * NOT A GATE. `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, so nothing in CI collects this file.
 *
 * ## Why the prison this file builds looks nothing like the four-prisoner one
 *
 * Fifty beds is a hundred tiles, because `object.bed` is `{ width: 1, height:
 * 2 }` (`src/content/object-catalog.ts`) and `residentCapacity` is the summed
 * footprint *width* of the sleep surfaces standing in the room
 * (`deriveRoomCapacity`, `src/simulation/objects/room-capacity.ts`) -- one
 * place per bed, two tiles each.
 *
 * **A hundred tiles is exactly what the starting camera can enclose, and not
 * one more.** Walls are drawn along tile *edges*, so the reachable rectangle
 * is bounded by which edges the pointer can reach rather than by which tile
 * centres it can. With calibration putting tile (0,0)'s top-left at
 * `(-304, -574)` at 1440x900 -- measured by the four-prisoner file and again by
 * issue #957 -- a tile edge sits at `-304 + 64n` horizontally and `-574 + 64m`
 * vertically, and the HUD covers `x < 422` (`.hud__corner`, for y in 406..831),
 * `x > 1152` (`.hud__rail`), `y < 110` (`.hud-strip`) and `y > 831`
 * (`.hud__tabs`). So:
 *
 * ```
 * vertical edges   -304 + 64n in (422, 1152)  ->  n = 12 .. 22  ->  columns 12..21
 * horizontal edges -574 + 64m in (110,  831)  ->  m = 11 .. 21  ->  rows    11..20
 * ```
 *
 * **Ten by ten. A hundred tiles, fifty beds, and no tile left for the toilet
 * `room.cell` asks for** -- which is legal, because `RoomZoningService.zone`
 * enforces size, bounds, ownership, overlap and enclosure and *not* the
 * catalogue's `object` requirements (`src/simulation/rooms/zoning.ts`, "Only
 * `enclosed`"), and `findAvailableResidence` asks only for the room type, an
 * occupancy count and a `'sleep-surface'` capability
 * (`src/simulation/prisoners/room-instance-registry.ts`). Whether a prison
 * with fifty beds and no toilet really houses fifty is therefore a *reading*
 * until `accommodationCapacity` says so, and every act below prints it.
 *
 * The four-prisoner file built a 3x4 cell so that an 8x8 yard would also fit.
 * At fifty that trade is gone: the cell *is* the reachable rectangle. Act Y
 * therefore pans the camera east before it zones its yard, which is a
 * player-visible capability (`ArrowRight` -> `camera.right`,
 * `src/input/bindings.ts`) and the escape issue #957 §3 names.
 *
 * ## The one thing this file cannot do for you
 *
 * Acts P, F and Y measure the game with
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` at `40`. That is a
 * **source mutation**, not a fixture -- the constant's only production reader
 * is `stateIncomeForPrisonerDay` and its docblock states that nothing in
 * `src/` may pass a rate of its own:
 *
 * ```
 * sha256sum src/simulation/economy/income.ts > /tmp/income.sha256
 * sed -i 's/^export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;$/export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40;/' src/simulation/economy/income.ts
 * #   ... run the acts ...
 * git checkout -- src/simulation/economy/income.ts
 * sha256sum -c /tmp/income.sha256          # must print OK
 * ```
 *
 * Vite serves `src/**` live, so the edit must not be made while a run is in
 * flight (`docs/AGENT_WORKFLOW.md` §2). **Never push the mutated constant:**
 * balance is the owner's, and this file's output is a number rather than a
 * decision.
 *
 * Findings: `docs/research/2026-09-04-what-pressure-there-is-at-fifty.md`.
 */

/** `DAY_LENGTH_TICKS`, confirmed in play by the day counter rather than imported. */
const TICKS_PER_DAY = 2400;

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * The largest rectangle the pointer can wall in at 1440x900 without moving the
 * camera: columns 12..21, rows 11..20. See this file's header for the
 * arithmetic, and act B's log for the four wall runs that test it -- a drag
 * whose endpoint lands on the HUD submits no command at all, so a run
 * reporting `0 command(s)` is the refutation.
 */
const CELL: Rect = { x0: 12, y0: 11, x1: 21, y1: 20 };

/** Fifty, which is the population the owner's ruling names. */
const PRISONERS = 50;

/**
 * `Math.max(scheduledGuardCount, ceil(50 / 8))` -- what the game asks for at
 * fifty, and not one more (`resolveOccupancyScaledGuardCount`,
 * `src/simulation/security/sector-staffing.ts`). At four prisoners the same
 * rule asked for 1 rather than a half, which is why the four-prisoner acts
 * measured a wage share of 6.7% instead of the asymptote's 3.33%.
 */
const GUARDS = 7;

/**
 * The two guard counts acts F and G hire, in two stages, to find the sign flip
 * by measurement rather than by division.
 *
 * Defaults are the arithmetic prediction at the composition the four-prisoner
 * acts settled at -- five of six needs unmet, `safety` held served -- which
 * prices a place at 100 with the penalty restored and at 300 without:
 * `50 x 100 / 80 = 62.5` and `50 x 300 / 80 = 187.5`. Each act hires the lower
 * number, watches boundaries at it, hires **one** more and watches again, so
 * the flip is two measured signs either side of one hire rather than a
 * quotient. Overridable, because the composition at fifty is the thing being
 * measured and the prediction may be wrong.
 */
const BREAK_EVEN_WITH_PENALTY = Number(process.env['LOCKSTATE_PT_GUARDS_PENALTY'] ?? 62);
const BREAK_EVEN_SHIPPED = Number(process.env['LOCKSTATE_PT_GUARDS_SHIPPED'] ?? 187);

const note = (line: string): void => {
  console.log(line);
};

/**
 * Every `simulation/status-counts` field, and a projection channel of our own.
 *
 * **Replaces `installTee` rather than extending it**, for two reasons the
 * four-prisoner file's own §9 pays for. `CountsSample` there carries thirteen
 * of the payload's twenty-three fields and this measurement needs four it does
 * not -- `occupiedPlaces` (what `StateIncomeSystem` actually pays for, as
 * against `roomOccupants`, which is assignments), and
 * `prisonersCovered`/`prisonersUnderstaffed`/`prisonersUnguarded`, which
 * answer the safety question at fifty without reading a need bar at all.
 *
 * And it opens a **request** channel. `hud/prisoner-detail` carries all six
 * needs with `unmetForStateIncome` per prisoner, and the four-prisoner file
 * read that by clicking fifty-times-fewer roster rows and scraping
 * `data-need-permille` off the DOM. At fifty that is fifty clicks and fifty
 * settles per reading; a projection request is one worker round-trip. The tee
 * `installTee` installs *drops* `simulation/projection` to keep its array
 * bounded, so this one intercepts those replies into a pending map instead and
 * pushes nothing.
 *
 * Correlation is by `messageId`, and the ids here are `probe-N` while the
 * application's requester mints `crypto.randomUUID()` -- so neither can settle
 * the other's request (`ProjectionRequester.handleMessage` returns early on an
 * id it does not hold, and this map does the same). The listener is a second
 * `addEventListener`, so the application still receives every reply.
 */
async function installProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    const pending = new Map<string, (payload: unknown) => void>();
    let instance: Worker | undefined;
    let sequence = 0;
    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        instance ??= this;
        super.addEventListener('message', (event: MessageEvent) => {
          const data = event.data as { kind?: string; replyTo?: string; payload?: unknown };
          const kind = data?.kind ?? '';
          if (kind === 'simulation/projection') {
            const replyTo = data.replyTo ?? '';
            const settle = pending.get(replyTo);
            if (settle !== undefined) {
              pending.delete(replyTo);
              settle(data.payload);
            }
            return;
          }
          // Only the small messages, so the array cannot grow without bound.
          if (kind === 'simulation/delta' || kind === 'simulation/snapshot') return;
          received.push(event.data);
        });
      }

      public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        sent.push(message);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    (window as unknown as { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker = sent;
    (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker = received;
    (window as unknown as { lockstateProjection?: unknown }).lockstateProjection = (
      projectionId: string,
      query: Record<string, unknown>,
    ): Promise<unknown> =>
      new Promise((resolve, reject) => {
        if (instance === undefined) {
          reject(new Error('no simulation worker has been constructed yet'));
          return;
        }
        sequence += 1;
        const messageId = `probe-${sequence}`;
        const timer = setTimeout(() => {
          pending.delete(messageId);
          reject(new Error(`the worker did not answer "${projectionId}" within 20s`));
        }, 20_000);
        pending.set(messageId, (payload) => {
          clearTimeout(timer);
          resolve(payload);
        });
        instance.postMessage({
          protocolVersion: 1,
          messageId,
          kind: 'simulation/request-projection',
          payload: { projectionId, ...query },
        });
      });
  });
}

interface Counts {
  readonly tick: number;
  readonly prisoners: number;
  readonly prisonersInIntake: number;
  readonly rooms: number;
  readonly roomCapacity: number;
  readonly accommodationCapacity: number;
  readonly roomOccupants: number;
  readonly occupiedPlaces: number;
  readonly prisonersCovered: number;
  readonly prisonersUnderstaffed: number;
  readonly prisonersUnguarded: number;
  readonly activeIncidents: number;
  readonly activeIncidentType: string;
  readonly treasuryMinorUnits: number;
  readonly stateIncomeAccruedTodayMinorUnits: number;
  readonly dailyWageBillMinorUnits: number;
  readonly unpaidWagesMinorUnits: number;
  readonly staff: number;
  readonly staffUnassigned: number;
}

const COUNT_FIELDS: readonly (keyof Counts)[] = [
  'prisoners',
  'prisonersInIntake',
  'rooms',
  'roomCapacity',
  'accommodationCapacity',
  'roomOccupants',
  'occupiedPlaces',
  'prisonersCovered',
  'prisonersUnderstaffed',
  'prisonersUnguarded',
  'activeIncidents',
  'activeIncidentType',
  'treasuryMinorUnits',
  'stateIncomeAccruedTodayMinorUnits',
  'dailyWageBillMinorUnits',
  'unpaidWagesMinorUnits',
  'staff',
  'staffUnassigned',
];

async function countsSeries(page: Page): Promise<readonly Counts[]> {
  return page.evaluate((fields) => {
    const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
    const out: Record<string, unknown>[] = [];
    for (const message of messages) {
      const envelope = message as { kind?: string; payload?: { tick: number; counts: Record<string, unknown> } };
      if (envelope.kind !== 'simulation/status-counts' || envelope.payload === undefined) continue;
      const sample: Record<string, unknown> = { tick: envelope.payload.tick };
      for (const field of fields) sample[field] = envelope.payload.counts[field] ?? -1;
      out.push(sample);
    }
    return out;
  }, COUNT_FIELDS as unknown as string[]) as unknown as readonly Counts[];
}

async function latestCounts(page: Page): Promise<Counts | undefined> {
  const series = await countsSeries(page);
  return series[series.length - 1];
}

/** The tick, from `simulation/clock-state` -- never from a deduped counts publication. */
async function currentTick(page: Page): Promise<number> {
  return page.evaluate(() => {
    const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { tick?: number } };
      if (message.kind === 'simulation/clock-state' && typeof message.payload?.tick === 'number') {
        return message.payload.tick;
      }
    }
    return 0;
  });
}

interface NeedReading {
  readonly needId: string;
  readonly permille: number;
  readonly unmet: boolean;
}

interface PrisonerNeeds {
  readonly entityId: number;
  readonly stage: string;
  readonly needs: readonly NeedReading[];
}

/**
 * All six needs of every prisoner on the roster, off `hud/prisoner-roster`
 * and `hud/prisoner-detail`.
 *
 * `unmetForStateIncome` is the projection's own flag and the exact term
 * `stateIncomeForPrisonerDay` multiplies, so the count this returns is the
 * income composition rather than a reader's interpretation of a bar.
 * `MAX_PROJECTION_PAGE_LIMIT` is 500, so one page holds fifty.
 */
async function readAllNeeds(page: Page): Promise<readonly PrisonerNeeds[]> {
  return page.evaluate(async () => {
    const request = (window as unknown as {
      lockstateProjection: (id: string, query: Record<string, unknown>) => Promise<unknown>;
    }).lockstateProjection;
    const roster = (await request('hud/prisoner-roster', { limit: 500 })) as {
      view?: { data?: { prisoners?: { entityId: number }[] } };
    };
    const rows = roster.view?.data?.prisoners ?? [];
    const out: unknown[] = [];
    for (const row of rows) {
      const reply = (await request('hud/prisoner-detail', {
        target: { kind: 'entity', entityId: row.entityId },
      })) as {
        view?: {
          data?: {
            intakeStage?: string;
            needs?: { needId: string; level?: { permille?: number }; unmetForStateIncome?: boolean }[];
          };
        };
      };
      const detail = reply.view?.data;
      out.push({
        entityId: row.entityId,
        stage: detail?.intakeStage ?? '?',
        needs: (detail?.needs ?? []).map((need) => ({
          needId: need.needId,
          permille: need.level?.permille ?? -1,
          unmet: need.unmetForStateIncome === true,
        })),
      });
    }
    return out;
  }) as unknown as readonly PrisonerNeeds[];
}

/**
 * Prints the need composition of the whole population as a histogram over
 * `unmetNeedCount`, plus which needs are unmet and for how many.
 *
 * A histogram rather than fifty rows, because what the income line multiplies
 * is the *count* per prisoner: a population all at five-of-six is one price,
 * and a population split four/five is two. The per-need tally beside it is
 * what says which need moved, which is the whole of act Y's measurement.
 */
async function reportNeeds(page: Page, label: string, tag: string): Promise<void> {
  const all = await readAllNeeds(page);
  const histogram = new Map<number, number>();
  const perNeedUnmet = new Map<string, number>();
  const perNeedPermille = new Map<string, number[]>();
  for (const prisoner of all) {
    const unmet = prisoner.needs.filter((need) => need.unmet);
    histogram.set(unmet.length, (histogram.get(unmet.length) ?? 0) + 1);
    for (const need of prisoner.needs) {
      if (need.unmet) perNeedUnmet.set(need.needId, (perNeedUnmet.get(need.needId) ?? 0) + 1);
      const bucket = perNeedPermille.get(need.needId) ?? [];
      bucket.push(need.permille);
      perNeedPermille.set(need.needId, bucket);
    }
  }
  note(`[${label}] ${tag} NEEDS over ${all.length} prisoner(s)`);
  note(
    `[${label}] ${tag}   unmetNeedCount histogram: ${JSON.stringify(
      [...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([count, many]) => `${many} prisoner(s) at ${count} unmet`),
    )}`,
  );
  for (const [needId, levels] of [...perNeedPermille.entries()].sort()) {
    const sorted = [...levels].sort((a, b) => a - b);
    note(
      `[${label}] ${tag}   ${needId}: unmet for ${perNeedUnmet.get(needId) ?? 0} of ${all.length}` +
        ` permille min=${sorted[0]} median=${sorted[Math.floor(sorted.length / 2)]} max=${sorted[sorted.length - 1]}`,
    );
  }
  const stages = new Map<string, number>();
  for (const prisoner of all) stages.set(prisoner.stage, (stages.get(prisoner.stage) ?? 0) + 1);
  note(`[${label}] ${tag}   intake stages: ${JSON.stringify([...stages.entries()])}`);
}

interface Screen {
  readonly ms: number;
  readonly tick: number;
  readonly day: string;
  readonly metrics: Record<string, string>;
  readonly event: string;
  readonly counts: Counts | undefined;
}

async function readScreen(page: Page, startedAt: number): Promise<Screen> {
  const dom = await page.evaluate(() => {
    const flat = (node: Element | null): string =>
      node === null ? 'ABSENT' : ((node as HTMLElement).innerText ?? '').replace(/\s*\n\s*/g, ' · ').trim();
    const metrics: Record<string, string> = {};
    for (const chip of Array.from(document.querySelectorAll('[data-metric]'))) {
      metrics[chip.getAttribute('data-metric') ?? '?'] = flat(chip);
    }
    return { day: flat(document.querySelector('.hud-clock__day')), metrics, event: flat(document.querySelector('.hud__event')) };
  });
  return { ms: Date.now() - startedAt, tick: await currentTick(page), counts: await latestCounts(page), ...dom };
}

function logScreen(label: string, tag: string, screen: Screen): void {
  note(`[${label}] ${tag} t+${(screen.ms / 1000).toFixed(1)}s tick=${screen.tick} day=${screen.day}`);
  note(`[${label}] ${tag}   chips: ${JSON.stringify(screen.metrics)}`);
  note(`[${label}] ${tag}   band: ${JSON.stringify(screen.event)}`);
  note(`[${label}] ${tag}   counts: ${JSON.stringify(screen.counts)}`);
}

/**
 * Runs to `targetTick`, printing the screen on every change of the in-game day
 * counter.
 *
 * The day boundary is where money moves -- `StateIncomeSystem` (order 120) and
 * `PayrollSystem` (order 130) both run on a day's last tick -- so a sample
 * taken there shows a curve rather than an accrual. Every reading is printed
 * as it is taken, because a run killed by the per-test timeout keeps whatever
 * it has already said and loses everything it was saving up.
 */
async function runAndWatch(page: Page, label: string, targetTick: number, startedAt: number, budgetMs: number): Promise<void> {
  const watchStartedAt = Date.now();
  let lastDay = '';
  for (;;) {
    const screen = await readScreen(page, startedAt);
    if (screen.day !== lastDay) {
      logScreen(label, `DAY ${screen.day}`, screen);
      lastDay = screen.day;
    }
    if (screen.tick >= targetTick) return;
    if (Date.now() - watchStartedAt > budgetMs) {
      note(`[${label}] WALL-CLOCK BUDGET SPENT at tick ${screen.tick} of ${targetTick}`);
      return;
    }
    await page.waitForTimeout(700);
  }
}

/** Prints the treasury at every in-game day boundary the counts series crossed. */
function printCurve(label: string, series: readonly Counts[]): void {
  note(`[${label}] ===== the treasury curve, read at every in-game day boundary =====`);
  const last = series[series.length - 1];
  const lastDay = last === undefined ? 0 : Math.floor(last.tick / TICKS_PER_DAY) + 1;
  for (let day = 1; day <= lastDay; day += 1) {
    const boundary = day * TICKS_PER_DAY;
    const before = [...series].filter((sample) => sample.tick < boundary).pop();
    const after = series.find((sample) => sample.tick >= boundary);
    if (before === undefined || after === undefined) continue;
    const delta = after.treasuryMinorUnits - before.treasuryMinorUnits;
    /*
     * The accrual is `floor(grant * (tickOfDay + 1) / DAY_LENGTH_TICKS)`
     * (`stateIncomeAccruedByTick`), so dividing back out of the last sample
     * before the boundary recovers the day's whole grant without waiting for
     * it -- and it is printed beside the delta so the two can disagree in the
     * log rather than in a reader's head.
     */
    const tickOfDay = before.tick % TICKS_PER_DAY;
    const impliedGrant = Math.round((before.stateIncomeAccruedTodayMinorUnits * TICKS_PER_DAY) / (tickOfDay + 1));
    note(
      `[${label}] day ${day} boundary (tick ${boundary}): treasury ${before.treasuryMinorUnits} -> ${after.treasuryMinorUnits}` +
        ` delta=${delta} | accrual just before=${before.stateIncomeAccruedTodayMinorUnits} at tickOfDay=${tickOfDay}` +
        ` impliedDailyGrant=${impliedGrant}` +
        ` wageBill=${after.dailyWageBillMinorUnits} arrears=${after.unpaidWagesMinorUnits}` +
        ` places=${after.occupiedPlaces} assignments=${after.roomOccupants} roster=${after.prisoners}` +
        ` intake=${after.prisonersInIntake} staff=${after.staff} free=${after.staffUnassigned}` +
        ` covered=${after.prisonersCovered} understaffed=${after.prisonersUnderstaffed} unguarded=${after.prisonersUnguarded}`,
    );
  }
  note(`[${label}] ===== every status-counts publication =====`);
  for (const sample of series) note(`[${label}] counts ${JSON.stringify(sample)}`);
}

/**
 * Builds the enclosed 10x10 cell at `CELL` and fills it with `PRISONERS` beds.
 *
 * **No toilet, and that is a measurement rather than a shortcut.** A hundred
 * tiles is fifty beds exactly; see this file's header for why a hundred tiles
 * is what the starting camera can enclose. Whether the missing toilet costs
 * the prison anything is what act B's `bladder` reading answers -- the
 * four-prisoner acts *had* a toilet standing in the cell and `bladder` still
 * read `0` permille on every prisoner in every act, so the prediction is that
 * it costs nothing at all.
 */
async function buildTheFiftyBedPrison(page: Page, label: string): Promise<{ originX: number; originY: number }> {
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  note(`[${label}] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  const width = CELL.x1 - CELL.x0 + 1;
  const height = CELL.y1 - CELL.y0 + 1;
  const segments = 2 * (width + height);
  note(`[${label}] the cell is ${width}x${height} = ${width * height} tiles, perimeter ${segments} segments`);

  // 2 bricks a segment, 1 plank a bed. Bought with a margin, and the margin is
  // reported by the deliveries readout rather than assumed.
  await buy(page, 'wall-brick', segments * 2 + 10);
  await buy(page, 'bed-wooden', PRISONERS);
  await fastForwardToMax(page);
  await page.waitForTimeout(4000);
  note(`[${label}] deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + CELL.x0 * TILE;
  const eastX = origin.originX + (CELL.x1 + 1) * TILE;
  const northY = origin.originY + CELL.y0 * TILE;
  const southY = origin.originY + (CELL.y1 + 1) * TILE;
  note(`[${label}] wall edges: west x=${westX} east x=${eastX} north y=${northY} south y=${southY}`);
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    note(`[${label}] wall run ${run.name} from (${run.a.x},${run.a.y}) to (${run.b.x},${run.b.y}): ${(await sentCommands(page)).length - before} command(s)`);
  }
  await waitForQueueEmpty(page);

  // Retried, because the Rooms panel's enclosure verdict is read off a world
  // view a snapshot replaces and a completed wall does not mark it dirty.
  for (let attempt = 1; ; attempt += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, CELL.x0, CELL.y0), centreOf(origin, CELL.x1, CELL.y1));
    note(`[${label}] rooms panel before confirm: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(900);
    const counts = await latestCounts(page);
    note(`[${label}] designate cell attempt ${attempt}: rooms=${String(counts?.rooms)} band=${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempt >= 8) throw new Error('the cell rectangle was never accepted as a room');
    await page.waitForTimeout(4000);
  }

  /*
   * Fifty beds, five to a column: `object.bed` is 1 wide and 2 tall, so a bed
   * anchored at row r covers r and r+1 and a ten-row cell takes five per
   * column. Ten columns, and the count that matters to the measurement is the
   * `accommodationCapacity` the prison reports rather than the presses made.
   */
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  let placed = 0;
  let refusedPresses = 0;
  for (let column = CELL.x0; column <= CELL.x1; column += 1) {
    for (let row = CELL.y0; row + 1 <= CELL.y1; row += 2) {
      const point = centreOf(origin, column, row);
      const commands = await press(page, point.x, point.y);
      if (commands.length > 0) placed += 1;
      else {
        refusedPresses += 1;
        note(`[${label}] bed at (${column},${row}) produced NO command`);
      }
    }
  }
  note(`[${label}] ${placed} bed order(s) placed, ${refusedPresses} press(es) produced nothing`);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(2500);
  const furnished = await latestCounts(page);
  note(
    `[${label}] furnished: rooms=${String(furnished?.rooms)} roomCapacity=${String(furnished?.roomCapacity)}` +
      ` accommodationCapacity=${String(furnished?.accommodationCapacity)} funds=${String(furnished?.treasuryMinorUnits)}`,
  );
  await tab(page, 'rooms').click();
  note(`[${label}] rooms panel after furnishing: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  return origin;
}

/**
 * Presses `ArrowRight` until the camera has moved far enough east that an 8x8
 * yard is reachable clear of the cell, and answers the recalibrated origin.
 *
 * **The escape issue #957 §3 names, exercised.** It measured twelve presses
 * moving the origin 779 px -- about 12.2 tiles -- and recorded that nothing on
 * screen suggests the camera can move at all. `ArrowRight` is bound to
 * `camera.right` in the `world` and `construction` contexts
 * (`src/input/bindings.ts`), so the press has to land while the focus is not
 * in a text field: `buy` fills a number input, which is why a tab is clicked
 * first.
 */
async function panEastForAYard(page: Page, label: string): Promise<{ origin: { originX: number; originY: number }; yard: Rect } | undefined> {
  await tab(page, 'overview').click();
  await page.locator('.hud-clock__day').click({ timeout: 5000 }).catch(() => undefined);
  for (let round = 1; round <= 4; round += 1) {
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(60);
    }
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    note(`[${label}] pan round ${round} (${round * 8} ArrowRight presses): origin = (${origin.originX}, ${origin.originY})`);
    /*
     * Which columns and rows the pointer can reach at this origin, on the same
     * HUD bounds this file's header derives the cell from -- computed rather
     * than assumed, because the pan distance per press is not a documented
     * number and this is the measurement that says what it bought.
     */
    const columns: number[] = [];
    for (let column = 0; column <= 31; column += 1) {
      const centre = origin.originX + column * TILE + TILE / 2;
      if (centre > 440 && centre < 1140) columns.push(column);
    }
    const rows: number[] = [];
    for (let row = 0; row <= 31; row += 1) {
      const centre = origin.originY + row * TILE + TILE / 2;
      if (centre > 130 && centre < 810) rows.push(row);
    }
    note(`[${label}] reachable columns ${JSON.stringify(columns)} rows ${JSON.stringify(rows)}`);
    const eastOfTheCell = columns.filter((column) => column > CELL.x1 && column <= 31);
    if (eastOfTheCell.length >= 8 && rows.length >= 8) {
      const x0 = eastOfTheCell[0] as number;
      const y0 = rows[0] as number;
      const yard: Rect = { x0, y0, x1: x0 + 7, y1: y0 + 7 };
      note(`[${label}] the yard will be ${JSON.stringify(yard)}`);
      return { origin, yard };
    }
  }
  note(`[${label}] panning never produced eight reachable columns east of the cell`);
  return undefined;
}

/** Zones `yard` as `room.yard` and reports exactly what the game said back. */
async function zoneTheYard(page: Page, label: string, origin: { originX: number; originY: number }, yard: Rect): Promise<boolean> {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    const yardRow = page.locator('.hud-rooms__list [data-room="room.yard"]');
    if ((await yardRow.count()) === 0) {
      note(`[${label}] YARD: no [data-room="room.yard"] row in the Rooms catalogue at all`);
      return false;
    }
    await yardRow.click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, yard.x0, yard.y0), centreOf(origin, yard.x1, yard.y1));
    note(`[${label}] YARD panel before confirm: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1200);
    const counts = await latestCounts(page);
    note(
      `[${label}] YARD attempt ${attempt}: rooms=${String(counts?.rooms)} roomCapacity=${String(counts?.roomCapacity)}` +
        ` band=${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    if ((counts?.rooms ?? 0) >= 2) {
      note(`[${label}] YARD accepted on attempt ${attempt}; rooms panel: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
      return true;
    }
    await page.waitForTimeout(2500);
  }
  note(`[${label}] YARD was never accepted`);
  return false;
}

async function admit(page: Page, label: string, wanted: number): Promise<number> {
  await tab(page, 'overview').click();
  let admitted = 0;
  for (let index = 0; index < wanted; index += 1) {
    const control = page.locator('.hud-intake__admit');
    if ((await control.getAttribute('disabled')) !== null) {
      note(`[${label}] Admit went disabled after ${admitted} press(es); intake says ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
      return admitted;
    }
    await control.click({ timeout: 10_000 });
    admitted += 1;
    await page.waitForTimeout(120);
  }
  note(`[${label}] pressed Admit ${admitted} time(s); intake: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  return admitted;
}

async function hire(page: Page, label: string, wanted: number): Promise<void> {
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  const control = page.locator('.hud-staff__hire');
  note(`[${label}] hire control reads: ${JSON.stringify((await control.innerText()).trim())}`);
  for (let index = 0; index < wanted; index += 1) {
    if ((await control.getAttribute('disabled')) !== null) {
      note(`[${label}] Hire Guard went disabled after ${index} press(es) of ${wanted}`);
      break;
    }
    await control.click({ timeout: 10_000 });
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(2000);
  const counts = await latestCounts(page);
  note(
    `[${label}] after asking for ${wanted} hire(s): staff=${String(counts?.staff)} free=${String(counts?.staffUnassigned)}` +
      ` wageBill=${String(counts?.dailyWageBillMinorUnits)} funds=${String(counts?.treasuryMinorUnits)}`,
  );
  note(`[${label}] staff panel: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
}

/** The shared opening of every act: a fresh prison, fifty beds, fifty prisoners. */
async function openTheFiftyBedPrison(
  page: Page,
  label: string,
  startedAt: number,
  withYard: boolean,
): Promise<void> {
  await installProbe(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  logScreen(label, 'OPENING', await readScreen(page, startedAt));

  await buildTheFiftyBedPrison(page, label);
  if (withYard) {
    const panned = await panEastForAYard(page, label);
    if (panned === undefined) note(`[${label}] no yard was zoned, because the camera never reached clear ground`);
    else note(`[${label}] yard zoned: ${String(await zoneTheYard(page, label, panned.origin, panned.yard))}`);
  }
  const admitted = await admit(page, label, PRISONERS);
  note(`[${label}] admitted ${admitted} of ${PRISONERS}`);
  await page.waitForTimeout(4000);
}

/** Acts B, P and Y: build, populate, staff at the requirement, run, read the curve. */
async function playTheFiftyBedPrison(page: Page, label: string, days: number, withYard: boolean): Promise<void> {
  const startedAt = Date.now();
  await openTheFiftyBedPrison(page, label, startedAt, withYard);
  await hire(page, label, GUARDS);
  await fastForwardToMax(page);
  logScreen(label, 'READY', await readScreen(page, startedAt));
  await reportNeeds(page, label, 'READY');

  const admittedAt = await currentTick(page);
  note(`[${label}] the watch starts at tick ${admittedAt} and runs ${days} in-game day(s) to ${admittedAt + TICKS_PER_DAY * days}`);
  await runAndWatch(page, label, admittedAt + TICKS_PER_DAY * days, startedAt, 420_000);
  logScreen(label, 'FINAL', await readScreen(page, startedAt));
  await reportNeeds(page, label, 'FINAL');
  await tab(page, 'security').click();
  note(`[${label}] staff panel at the end: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
  printCurve(label, await countsSeries(page));
  note(`[${label}] done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s wall clock`);
}

/**
 * Acts F and G: the break-even guard count, found by hiring one more guard and
 * watching the sign of the day-boundary delta change.
 *
 * Two stages in one act, because the two prisons either side of the flip
 * differ by one hire and nothing else -- same world, same population, same
 * need composition -- which is a stronger comparison than two runs of the same
 * script (the four-prisoner note's own weakest claim was exactly that its two
 * curves were two worlds).
 */
async function playToTheBreakEven(page: Page, label: string, firstStage: number, daysPerStage: number): Promise<void> {
  const startedAt = Date.now();
  await openTheFiftyBedPrison(page, label, startedAt, false);
  await hire(page, label, firstStage);
  await fastForwardToMax(page);
  logScreen(label, 'STAGE-1 READY', await readScreen(page, startedAt));
  await reportNeeds(page, label, 'STAGE-1');
  let from = await currentTick(page);
  note(`[${label}] STAGE 1 (${firstStage} guards asked for): watching from tick ${from} for ${daysPerStage} day(s)`);
  await runAndWatch(page, label, from + TICKS_PER_DAY * daysPerStage, startedAt, 300_000);
  logScreen(label, 'STAGE-1 END', await readScreen(page, startedAt));
  printCurve(`${label} stage 1`, await countsSeries(page));

  await hire(page, label, 1);
  logScreen(label, 'STAGE-2 READY', await readScreen(page, startedAt));
  from = await currentTick(page);
  note(`[${label}] STAGE 2 (one more guard): watching from tick ${from} for ${daysPerStage} day(s)`);
  await runAndWatch(page, label, from + TICKS_PER_DAY * daysPerStage, startedAt, 300_000);
  logScreen(label, 'STAGE-2 END', await readScreen(page, startedAt));
  await reportNeeds(page, label, 'STAGE-2');
  await tab(page, 'security').click();
  note(`[${label}] staff panel at the end: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
  printCurve(label, await countsSeries(page));
  note(`[${label}] done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s wall clock`);
}

/*
 * `test.setTimeout` rather than a change to
 * `tests/browser/playwright.playtest.config.ts`, and the distinction matters:
 * that config's 600 s is the budget every playtest in the repository is
 * written against, and the four-prisoner file's yard act already hit it. A
 * fifty-bed prison is ninety-one build orders instead of nineteen and fifty
 * Admit presses instead of four, so these acts need longer -- but nothing else
 * should inherit that. This is not a timeout raised to hide a race: no
 * assertion in this file waits on anything, and every reading is printed as it
 * is taken so a kill loses only the readings not yet taken.
 */
const ACT_TIMEOUT_MS = 1_500_000;

test.describe('What pressure there is at fifty', () => {
  /** **B -- the shipped curve at fifty.** Unmodified tree, `withheld = 0`. */
  test('B the shipped curve at fifty', async ({ page }) => {
    test.setTimeout(ACT_TIMEOUT_MS);
    await playTheFiftyBedPrison(page, 'B50', 7, false);
  });

  /** **P -- the same prison with the penalty restored.** Requires the source mutation in this file's header. */
  test('P the curve with the penalty restored at fifty', async ({ page }) => {
    test.setTimeout(ACT_TIMEOUT_MS);
    await playTheFiftyBedPrison(page, 'P50', 7, false);
  });

  /** **F -- where the treasury turns over with the penalty restored.** Requires the mutation. */
  test('F the break-even guard count with the penalty restored', async ({ page }) => {
    test.setTimeout(ACT_TIMEOUT_MS);
    await playToTheBreakEven(page, 'F50', BREAK_EVEN_WITH_PENALTY, 3);
  });

  /** **G -- where the treasury turns over on the shipped tree.** Unmodified tree. */
  test('G the break-even guard count on the shipped tree', async ({ page }) => {
    test.setTimeout(ACT_TIMEOUT_MS);
    await playToTheBreakEven(page, 'G50', BREAK_EVEN_SHIPPED, 3);
  });

  /**
   * **Y -- does one 8x8 yard serve fifty people?** Requires the mutation: at a
   * withheld rate of `0` a served need is worth exactly nothing and the act
   * can measure nothing.
   *
   * `TILES_PER_OPEN_GROUND_PLACE` is 16 and an 8x8 yard is 64 tiles, so the
   * smallest legal yard admits **four**
   * (`src/simulation/prisoners/room-instance-registry.ts`). Whether four
   * places rotating serve fifty prisoners' `recreation` -- and how many of
   * them the state therefore pays the extra 40 for -- is what this measures.
   */
  test('Y the yard with the penalty restored at fifty', async ({ page }) => {
    test.setTimeout(ACT_TIMEOUT_MS);
    await playTheFiftyBedPrison(page, 'Y50', 7, true);
  });
});
