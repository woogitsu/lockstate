import { expect, type Page, test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buy,
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
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **§9's own weakest claim, tested rather than argued.**
 *
 * `docs/research/2026-09-02-playing-what-landed-today.md` §9: every measured
 * run so far found zero guard movement, but always with the precondition
 * missing -- either a hire standing on its own post already (§1), or a
 * released guard with no spare standing off-post at all (§2f). The open
 * question is narrower than "does a guard ever walk": it is *"does a guard
 * who is genuinely elsewhere walk when Released, and if Release alone cannot
 * do it, can anything?"*
 *
 * Two acts, one fixture, no restart between them:
 *
 * - **Act A** gets a spare guard genuinely off-post (confirmed on the render
 *   channel, not assumed), then presses Release on the *other* guard -- the
 *   one control §2f identified as the only lever that can create a shortage
 *   -- and watches whether the off-post spare is the one reclaimed.
 * - **Act B** answers the question Act A's outcome raises, using the same
 *   session: if pressing Release cannot reach the off-post spare, can
 *   *anything*? It grows the sector's required guard count past what the
 *   currently-posted guard alone satisfies -- no Release press -- and
 *   watches the same spare.
 *
 * Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5344 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-release-an-off-post-guard.playtest.ts -g "act A"
 * ```
 *
 * Not a CI gate for the same reason every other `*.playtest.ts` in this
 * directory is not one: `playwright.config.ts` matches `*.spec.ts` only, and
 * `tests/foundation/browser-network-changed-retry-contract.test.ts` records
 * the playtest config as one it deliberately does not drive. `test` is
 * imported from `@playwright/test` directly for the same reason every
 * existing `*.playtest.ts` in this directory does: the import rule that
 * forbids it is scoped to `*.spec.ts`
 * (`browser-network-changed-retry-contract.test.ts:73` filters on that
 * suffix).
 *
 * Every duration is in **ticks**, read off `simulation/clock-state`, never
 * wall clock. `FixedStepClock.stepMilliseconds` is 50 (20 ticks/wall-second
 * at speed 1, `src/simulation/clock/fixed-step-clock.ts:29`).
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/* ==================================================================== */
/* Probes -- lifted verbatim from                                       */
/* playtest-2026-09-02-what-landed-today.playtest.ts, which lifted them  */
/* from playtest-740-does-a-guard-walk.playtest.ts                       */
/* ==================================================================== */

interface GuardDeltaSample {
  readonly at: number;
  readonly guards: readonly {
    readonly id: number;
    readonly subX: number;
    readonly subY: number;
    readonly vx: number;
    readonly vy: number;
  }[];
}

/**
 * Decodes every `simulation/delta` the page receives into guard-position
 * records. `id` here is the guard's real `EntityId`, not a positional index --
 * `encodeRenderActorsKeyframe` writes `guardId` itself as the record's first
 * field (`src/simulation/worker/render-actors-keyframe.ts:196`), in
 * `allGuardIds()`'s ascending order -- which is what lets this file correlate
 * a render-delta record with a specific `data-staff`/`data-guard` DOM row.
 */
async function installGuardProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const samples: GuardDeltaSample[] = [];
    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as { kind?: string; payload?: { tick?: number; delta?: { data?: ArrayBuffer } } };
          if (message.kind !== 'simulation/delta') return;
          const buffer = message.payload?.delta?.data;
          if (!(buffer instanceof ArrayBuffer)) return;
          const view = new DataView(buffer);
          const recordCount = view.getUint32(8, true);
          const guards: { id: number; subX: number; subY: number; vx: number; vy: number }[] = [];
          for (let record = 0; record < recordCount; record += 1) {
            const offset = (4 + record * 5) * 4;
            const packed = view.getUint32(offset + 4, true);
            if ((packed & 0xff) !== 1) continue; // RENDER_ACTOR_POPULATION_GUARD
            guards.push({
              id: view.getUint32(offset, true),
              subX: view.getInt32(offset + 8, true),
              subY: view.getInt32(offset + 12, true),
              vx: view.getInt16(offset + 16, true),
              vy: view.getInt16(offset + 18, true),
            });
          }
          samples.push({ at: message.payload?.tick ?? -1, guards });
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    (window as unknown as { lockstateGuardSamples?: GuardDeltaSample[] }).lockstateGuardSamples = samples;
  });
}

async function guardSamples(page: Page): Promise<readonly GuardDeltaSample[]> {
  return page.evaluate(() => (window as unknown as { lockstateGuardSamples?: GuardDeltaSample[] }).lockstateGuardSamples ?? []);
}

/** The most recent render-delta position for one guard id, or `undefined` if none has arrived. */
function latestTileOf(samples: readonly GuardDeltaSample[], guardId: number): { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number } | undefined {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const record = samples[index]!.guards.find((g) => g.id === guardId);
    if (record !== undefined) return { x: record.subX / 256, y: record.subY / 256, vx: record.vx, vy: record.vy };
  }
  return undefined;
}

/** One staff roster row: its entity id (`data-staff`) and its status word, read separately so a press can name a specific guard. */
async function rosterRowsWithId(page: Page): Promise<readonly { readonly id: number; readonly phase: string; readonly text: string }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.hud-staff__roster [data-staff]'))
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => {
        const text = (row.innerText ?? '').replace(/\n+/g, ' | ').trim();
        const afterRole = text.split('·').slice(1).join('·');
        return { id: Number(row.dataset['staff']), phase: (afterRole.split('|')[0] ?? '').trim(), text };
      }),
  );
}

function analyseGuardTracks(act: string, samples: readonly GuardDeltaSample[]): void {
  const byGuard = new Map<number, { at: number; subX: number; subY: number; moving: boolean }[]>();
  for (const sample of samples) {
    for (const guard of sample.guards) {
      const track = byGuard.get(guard.id) ?? [];
      track.push({ at: sample.at, subX: guard.subX, subY: guard.subY, moving: guard.vx !== 0 || guard.vy !== 0 });
      byGuard.set(guard.id, track);
    }
  }
  for (const [id, track] of [...byGuard.entries()].sort((a, b) => a[0] - b[0])) {
    const offTile = track.filter((p) => p.subX % 256 !== 0 || p.subY % 256 !== 0).length;
    const moving = track.filter((p) => p.moving).length;
    log(act, `guard entity ${id}: ${track.length} delta sample(s), ${moving} with a non-zero velocity, ${offTile} not on a tile centre`);
    for (let index = 1; index < track.length; index += 1) {
      const previous = track[index - 1]!;
      const current = track[index]!;
      if (previous.subX === current.subX && previous.subY === current.subY) continue;
      const tiles = (Math.abs(current.subX - previous.subX) + Math.abs(current.subY - previous.subY)) / 256;
      const ticks = current.at - previous.at;
      const walkable = ticks / 2;
      log(
        act,
        `  guard ${id} t${previous.at} (${previous.subX / 256},${previous.subY / 256}) -> t${current.at} (${current.subX / 256},${current.subY / 256}):` +
          ` ${tiles.toFixed(3)} tile(s) in ${ticks} tick(s); walking could cover ${walkable.toFixed(1)} -> ${tiles > walkable + 0.001 ? 'TELEPORT' : 'consistent with a walk'}`,
      );
    }
  }
}

async function underPoint(page: Page, x: number, y: number): Promise<unknown> {
  return page.evaluate(
    ([px, py]) => document.elementsFromPoint(px, py).slice(0, 4).map((el) => ({ tag: el.tagName, cls: el.className, pointerEvents: getComputedStyle(el).pointerEvents })),
    [x, y] as const,
  );
}

/* ==================================================================== */
/* Shared fixture -- same recipe as playtest-2026-09-02-what-landed-today */
/* (the 6x6 cell around POST_TILE), extended with more bed capacity so   */
/* Act B can grow occupancy past 8 without rebuilding                    */
/* ==================================================================== */

const POST_TILE = { x: 16, y: 16 } as const;
const CELL = { west: 12, north: 12, east: 17, south: 17 } as const;

function cellShiftClearing(minimapRight: number | undefined, originX: number): number {
  if (minimapRight === undefined) return 0;
  const wanted = Math.ceil((minimapRight + 40 - originX) / TILE) - CELL.west;
  return Math.min(4, Math.max(0, wanted));
}

async function wallSide(
  page: Page,
  edge: 'north' | 'west',
  tiles: readonly { readonly x: number; readonly y: number }[],
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
  pointFor: (tile: { readonly x: number; readonly y: number }) => { readonly x: number; readonly y: number },
): Promise<string> {
  const key = (t: { readonly x: number; readonly y: number }) => `${t.x},${t.y},${edge}`;
  const missingOf = async (): Promise<readonly { readonly x: number; readonly y: number }[]> => {
    const got = new Set((await sentCommands(page)).map((c) => `${String(c['x'])},${String(c['y'])},${String(c['edge'])}`));
    return tiles.filter((t) => !got.has(key(t)));
  };
  const before = (await sentCommands(page)).length;
  await drag(page, a, b);
  const byDrag = (await sentCommands(page)).length - before;
  const notes: string[] = [];
  for (const tile of await missingOf()) {
    const point = pointFor(tile);
    const countBefore = (await sentCommands(page)).length;
    await press(page, point.x, point.y);
    if ((await sentCommands(page)).length === countBefore) {
      notes.push(`press at ${tile.x},${tile.y} produced NOTHING; under it: ${JSON.stringify(await underPoint(page, point.x, point.y))}`);
    } else {
      notes.push(`repaired ${tile.x},${tile.y} by press`);
    }
  }
  const stillMissing = (await missingOf()).map((t) => `${t.x},${t.y}`);
  return `${edge} run: ${byDrag} by drag; ${JSON.stringify(notes)}; still missing ${JSON.stringify(stillMissing)}`;
}

interface SealedCellResult {
  readonly origin: { readonly originX: number; readonly originY: number };
  readonly zoned: boolean;
}

/** A sealed, zoned 6x6 cell at (12,12)-(17,17), 10 beds (2 rows of 5-6), a toilet, containing POST_TILE. */
async function buildSealedCell(page: Page, label: string): Promise<SealedCellResult> {
  const act = label;
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  const minimapRect = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap');
    if (el === null || (el as HTMLElement).offsetParent === null) return undefined;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  const shift = cellShiftClearing(minimapRect?.right, origin.originX);
  const west = CELL.west + shift;
  const east = CELL.east + shift;
  const westX = origin.originX + west * TILE;
  const eastX = origin.originX + (east + 1) * TILE;
  const northY = origin.originY + CELL.north * TILE;
  const southY = origin.originY + (CELL.south + 1) * TILE;
  log(act, `.hud-minimap rect ${JSON.stringify(minimapRect)}; shift ${shift} -> cell (${west},${CELL.north})-(${east},${CELL.south})`);

  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', 11);

  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(2_500);
  log(act, `clock after two fast-forward presses: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

  await armBuildable(page, 'wall-brick');
  const columns = [0, 1, 2, 3, 4, 5].map((offset) => west + offset);
  const rows = [12, 13, 14, 15, 16, 17];
  const wallReport = [
    await wallSide(page, 'north', columns.map((x) => ({ x, y: CELL.north })), { x: westX + TILE / 2, y: northY }, { x: eastX - TILE / 2, y: northY }, (t) => ({ x: centreOf(origin, t.x, t.y).x, y: northY })),
    await wallSide(page, 'north', columns.map((x) => ({ x, y: CELL.south + 1 })), { x: westX + TILE / 2, y: southY }, { x: eastX - TILE / 2, y: southY }, (t) => ({ x: centreOf(origin, t.x, t.y).x, y: southY })),
    await wallSide(page, 'west', rows.map((y) => ({ x: west, y })), { x: westX, y: northY + TILE / 2 }, { x: westX, y: southY - TILE / 2 }, (t) => ({ x: westX, y: centreOf(origin, t.x, t.y).y })),
    await wallSide(page, 'west', rows.map((y) => ({ x: east + 1, y })), { x: eastX, y: northY + TILE / 2 }, { x: eastX, y: southY - TILE / 2 }, (t) => ({ x: eastX, y: centreOf(origin, t.x, t.y).y })),
  ];
  for (const line of wallReport) log(act, line);

  await waitForQueueEmpty(page);

  let zoned = false;
  let attempts = 0;
  for (; attempts < 12 && !zoned; attempts += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, west, CELL.north), centreOf(origin, east, CELL.south));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    zoned = ((await latestCounts(page))?.rooms ?? 0) > 0;
    if (!zoned) await page.waitForTimeout(4_000);
  }
  log(act, `zoned: ${zoned} after ${attempts} attempt(s)`);

  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  let placed = 0;
  // 10 beds across rows 12-13, so the fixture can admit past the 8-occupant
  // scaling threshold (`DEFAULT_SECTOR_PRISONERS_PER_GUARD` = 8,
  // `src/simulation/security/sector-staffing.ts:147`) later, in Act B, without
  // rebuilding.
  for (const row of [12, 13]) {
    for (let column = west; column <= east && placed < 10; column += 1) {
      const point = centreOf(origin, column, row);
      await press(page, point.x, point.y);
      placed += 1;
    }
  }
  await armBuildable(page, 'toilet-brick');
  await press(page, centreOf(origin, west, 17).x, centreOf(origin, west, 17).y);
  log(act, `${placed} bed order(s) + 1 toilet placed`);

  await waitForQueueEmpty(page);
  await page.waitForTimeout(1_500);
  const built = await latestCounts(page);
  log(act, `built at tick ${built?.tick}: rooms=${built?.rooms} roomCapacity=${built?.roomCapacity} accommodationCapacity=${built?.accommodationCapacity}`);

  return { origin, zoned };
}

async function admit(page: Page, count: number, act: string): Promise<number> {
  await tab(page, 'overview').click();
  let pressed = 0;
  for (let index = 0; index < count; index += 1) {
    if ((await page.locator('.hud-intake__admit').getAttribute('disabled')) !== null) {
      log(act, `Admit went disabled after ${pressed} press(es)`);
      break;
    }
    await page.locator('.hud-intake__admit').click();
    pressed += 1;
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1_500);
  log(act, `${pressed} Admit press(es); intake panel now: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  return pressed;
}

async function hireGuards(page: Page, count: number, act: string): Promise<void> {
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let index = 0; index < count; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1_200);
  log(act, `after hiring ${count}: ${JSON.stringify(await latestCounts(page))}`);
}

async function openRosterFold(page: Page): Promise<void> {
  await tab(page, 'security').click();
  const section = page.locator('.hud-staff__roster');
  if ((await section.getAttribute('data-collapsed')) === 'true') {
    await section.locator('> .ui-section__header').click();
  }
}

/* ==================================================================== */
/* The combined test                                                     */
/* ==================================================================== */

test('does a genuinely off-post guard walk when Released, and if not, does anything move it? (#740, ADR 0088)', async ({ page }) => {
  test.setTimeout(2_400_000);
  const started = Date.now();
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await installGuardProbe(page);
  await openApp(page);

  await buildSealedCell(page, 'setup');
  // 6 residents, 2 guards: required stays at its schedule floor of 1
  // throughout Act A (`ceil(6/8) = 1`), so exactly one guard is posted and
  // the other is the sector's only spare.
  await admit(page, 6, 'setup');
  await hireGuards(page, 2, 'setup');
  await openRosterFold(page);

  await page.locator('.hud-strip__transport button').nth(1).click(); // speed 1
  await page.waitForTimeout(300);
  log('setup', `clock for the sampling window: ${JSON.stringify(await currentClock(page))}`);

  const rows0 = await rosterRowsWithId(page);
  log('setup', `roster right after hiring: ${JSON.stringify(rows0)}`);
  expect(rows0.length, 'exactly two guards must be hired for the id-ordering argument below to mean anything').toBe(2);
  const sortedIds = [...rows0.map((r) => r.id)].sort((a, b) => a - b);
  const lowId: number = sortedIds[0]!;
  const highId: number = sortedIds[1]!;
  log('setup', `guard entity ids: lower=${lowId}, higher=${highId} -- the low-id one is expected to be posted first, structurally (claimableGuardIds is ascending, post-eligibility.ts:98)`);

  /* ==================================================================== */
  /* Act A -- get the higher-id guard genuinely off-post via search duty,  */
  /* then press Release on the posted (lower-id) guard, and watch          */
  /* ==================================================================== */

  const actA = 'actA';
  const fromA = await currentTick(page);
  log(actA, `waiting for the spare to go on a contraband search and come back off-post (watching up to 3,000 ticks)`);

  // Poll the roster + render channel together until the higher-id guard is
  // observed genuinely off POST_TILE while its own claim is `Unassigned`
  // (parked, per §2c) -- OR while it is mid-`On Search` and off-tile, either
  // is a genuine off-post reading. Recorded rather than assumed.
  let offPostConfirmedAt: number | undefined;
  let offPostTile: { x: number; y: number } | undefined;
  const timelineA: string[] = [];
  let lastJoinedA = '';
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= fromA + 3_000) break;
    const rows = await rosterRowsWithId(page);
    const joined = rows.map((r) => `${r.id}:${r.phase}`).join(' // ');
    if (joined !== lastJoinedA) {
      timelineA.push(`t${tick}: ${joined}`);
      lastJoinedA = joined;
    }
    if (offPostConfirmedAt === undefined) {
      const samples = await guardSamples(page);
      const tile = latestTileOf(samples, highId);
      const highRow = rows.find((r) => r.id === highId);
      if (tile !== undefined && (tile.x !== POST_TILE.x || tile.y !== POST_TILE.y) && highRow !== undefined && highRow.phase !== 'On Post' && highRow.phase !== 'Travelling') {
        offPostConfirmedAt = tick;
        offPostTile = tile;
      }
    }
    if (offPostConfirmedAt !== undefined && tick >= offPostConfirmedAt + 40) break; // a little buffer after confirmation, then act
    await page.waitForTimeout(80);
  }
  log(actA, `roster timeline while waiting:\n${timelineA.join('\n')}`);
  log(actA, `off-post confirmation: ${offPostConfirmedAt === undefined ? 'NEVER -- act A cannot proceed' : `tick ${offPostConfirmedAt}, guard ${highId} at (${offPostTile?.x},${offPostTile?.y}) vs post (${POST_TILE.x},${POST_TILE.y})`}`);

  if (offPostConfirmedAt === undefined) {
    log(actA, 'STOPPING: no genuinely off-post spare was observed in 3,000 ticks; nothing below would test what it claims to');
  } else {
    const coverageBefore = await panelText(page, '.hud-staff__held');
    log(actA, `held panel before Release: ${JSON.stringify(coverageBefore)}`);

    // Press Release on the LOWER-id (posted) guard specifically, via its
    // `data-guard` row -- never "the first held row", because with the spare
    // possibly also `on-search` (held, with its own row) at this instant, a
    // positional selector could press the wrong one.
    const heldRow = page.locator(`.hud-staff__held-row[data-guard="${lowId}"]`);
    const heldRowCount = await heldRow.count();
    log(actA, `held row for guard ${lowId} (the posted one) present: ${heldRowCount > 0}`);
    if (heldRowCount === 0) {
      log(actA, 'STOPPING: the posted guard has no held row to press Release on -- cannot proceed');
    } else {
      const releaseButton = heldRow.getByRole('button', { name: 'Release' });
      const box = await releaseButton.boundingBox();
      if (box !== null) log(actA, `under Release's centre: ${JSON.stringify(await underPoint(page, box.x + box.width / 2, box.y + box.height / 2))}`);

      const preReleaseSamples = await guardSamples(page);
      const highTileAtPress = latestTileOf(preReleaseSamples, highId);
      const releasedAt = await currentTick(page);
      await releaseButton.click();
      log(actA, `pressed Release on guard ${lowId} at tick ${releasedAt}; guard ${highId} was at that instant published at (${highTileAtPress?.x},${highTileAtPress?.y})`);
      log(actA, `held panel right after: ${JSON.stringify(await panelText(page, '.hud-staff__held'))}`);

      const timelineA2: string[] = [];
      let lastJoinedA2 = '';
      for (;;) {
        const tick = await currentTick(page);
        if (tick >= releasedAt + 500) break;
        const joined = (await rosterRowsWithId(page)).map((r) => `${r.id}:${r.phase}`).join(' // ');
        if (joined !== lastJoinedA2) {
          timelineA2.push(`t${tick}: ${joined}`);
          lastJoinedA2 = joined;
        }
        await page.waitForTimeout(60);
      }
      log(actA, `roster changes over 500 ticks after Release:\n${timelineA2.join('\n')}`);

      const samplesA = (await guardSamples(page)).filter((s) => s.at >= releasedAt);
      log(actA, `render-delta samples after Release: ${samplesA.length}`);
      analyseGuardTracks(actA, samplesA);
      const highFinal = latestTileOf(await guardSamples(page), highId);
      log(actA, `guard ${highId} (the off-post spare) final published position: (${highFinal?.x},${highFinal?.y}), velocity (${highFinal?.vx},${highFinal?.vy})`);
      log(actA, `VERDICT: did the off-post spare (guard ${highId}) move after Release was pressed on the OTHER guard? ${highFinal !== undefined && offPostTile !== undefined && (highFinal.x !== offPostTile.x || highFinal.y !== offPostTile.y) ? 'YES, it moved' : 'NO, its tile is unchanged'}`);
    }
  }

  /* ==================================================================== */
  /* Act B -- same session: no Release press. Grow the sector's required   */
  /* guard count past what one posted guard satisfies, and watch the same  */
  /* spare, so the walk-vs-no-walk question is settled independent of      */
  /* whether Release specifically can do it                                */
  /* ==================================================================== */

  const actB = 'actB';
  const beforeGrowth = await rosterRowsWithId(page);
  log(actB, `roster before growing occupancy: ${JSON.stringify(beforeGrowth)}`);
  log(actB, `coverage chip before growth: ${JSON.stringify(await panelText(page, '.hud-staff__held'))}`);

  // Admit up to 4 more (10 total against the 10 beds built), crossing
  // `ceil(9/8) = 2` -- `DEFAULT_SECTOR_PRISONERS_PER_GUARD` = 8
  // (`src/simulation/security/sector-staffing.ts:147`), so the sector's
  // required guard count should become 2 once occupancy exceeds 8, while
  // only one guard is posted.
  const admittedB = await admit(page, 4, actB);
  log(actB, `admitted ${admittedB} more in act B`);

  // `admit()` switches to the 'overview' tab, which un-lays-out
  // `.hud-staff__roster` and `.hud-staff__held` entirely (`hidden` while the
  // panel is not the active tab) -- read here on the first run and it produced
  // an empty timeline and "not laid out" for the whole window, which is an
  // instrument bug, not a finding. Switch back before sampling.
  await tab(page, 'security').click();
  await openRosterFold(page);

  const fromB = await currentTick(page);
  const timelineB: string[] = [];
  let lastJoinedB = '';
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= fromB + 2_000) break;
    const joined = (await rosterRowsWithId(page)).map((r) => `${r.id}:${r.phase}`).join(' // ');
    if (joined !== lastJoinedB) {
      timelineB.push(`t${tick}: ${joined}`);
      lastJoinedB = joined;
    }
    await page.waitForTimeout(70);
  }
  log(actB, `roster changes over 2,000 ticks after growing occupancy:\n${timelineB.join('\n')}`);
  log(actB, `held panel now: ${JSON.stringify(await panelText(page, '.hud-staff__held'))}`);

  const samplesB = (await guardSamples(page)).filter((s) => s.at >= fromB);
  log(actB, `render-delta samples in the window: ${samplesB.length}`);
  analyseGuardTracks(actB, samplesB);

  const highFinalB = latestTileOf(await guardSamples(page), highId);
  const lowFinalB = latestTileOf(await guardSamples(page), lowId);
  log(actB, `final positions: guard ${lowId} (originally posted) at (${lowFinalB?.x},${lowFinalB?.y}); guard ${highId} (the spare) at (${highFinalB?.x},${highFinalB?.y})`);

  log('summary', `total wall-clock cost (reported, never asserted on): ${Math.round((Date.now() - started) / 1000)}s`);
});
