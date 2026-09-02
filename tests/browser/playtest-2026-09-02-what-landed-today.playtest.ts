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
 * **Playing the two features that landed on `main` on 2026-09-02 and that
 * nobody had played: a guard that walks to its post (#740, ADR 0088) and
 * `Medium` risk as a real waypoint (#788, ADR 0090).**
 *
 * An *instrument*, not a gate. `tests/browser/playwright.config.ts` collects
 * `*.spec.ts` only; `tests/browser/playwright.playtest.config.ts` is the one
 * that matches `*.playtest.ts`, and nothing in CI drives it. Run one act at a
 * time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5341 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-02-what-landed-today.playtest.ts -g "act 1"
 * ```
 *
 * `run-suite.ts` cannot drive it and that is deliberate rather than a gap:
 * `BROWSER_SUITES` in `tests/browser/browser-suites.ts` holds exactly
 * `browser` and `artifact`, an unknown `--suite` name is a hard refusal
 * (`selectBrowserSuite`'s three refusals), and
 * `tests/foundation/browser-network-changed-retry-contract.test.ts` records
 * the playtest config as the one the wrapper deliberately does not drive. So
 * there is no `--suite playtest`; the Playwright CLI is the entry point.
 *
 * ### Why `test` comes from `@playwright/test` here and not from
 * `./network-changed-fixture`
 *
 * The rule that forbids the direct import is scoped to gates.
 * `browser-network-changed-retry-contract.test.ts` walks `tests/browser/` and
 * filters `entry.name.endsWith('.spec.ts')` -- a `.playtest.ts` file is never
 * in the set -- and its own exclusion table says why: the playtest config is
 * *"not a gate ... there is no red run for a retry to act on"*. Every existing
 * `*.playtest.ts` in this directory imports `test` the same way.
 *
 * ### Every duration in this file is in **ticks**
 *
 * No act asserts on wall-clock time, and every loop that has to wait is
 * bounded by the worker's own published tick (`currentTick`, off
 * `simulation/clock-state`) rather than by a deadline. Wall-clock figures are
 * logged where they are the honest unit -- how long an act cost to run -- and
 * are never compared, subtracted or asserted. Eight agents were loading this
 * container while this ran; a finding derived from elapsed time here would be
 * a finding about the container.
 *
 * The two rates the reader needs, both READ rather than measured:
 * `FixedStepClock`'s `stepMilliseconds` defaults to 50, so the kernel is 20
 * ticks per wall second at speed 1, 40 at 2 and 80 at 4
 * (`src/simulation/clock/fixed-step-clock.ts:29`, and `SIMULATION_SPEEDS` is
 * `[1, 2, 4]` at line 17). One in-game day is `DAY_LENGTH_TICKS` = 2,400
 * (`src/simulation/prisoners/regime.ts:12`), which is 120 wall seconds at
 * speed 1 and 30 at speed 4.
 *
 * Findings live in
 * `docs/research/2026-09-02-playing-what-landed-today.md`.
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/* ==================================================================== */
/* Probes                                                               */
/* ==================================================================== */

interface GuardDeltaSample {
  /** The kernel tick the worker stamped on this publication. */
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
 * records -- the same bytes the renderer draws from.
 *
 * Lifted from `playtest-740-does-a-guard-walk.playtest.ts`, which established
 * the reason: the question is about *positions over ticks*, the render delta
 * carries a sub-tile position and a velocity per actor and is published every
 * `RENDER_DELTA_PUBLISH_INTERVAL_MS` (100 ms,
 * `src/simulation/worker/state-machine.ts:141`), and the staff roster is a
 * projection pulled on the `CLOCK_STATE_PUBLISH_INTERVAL_MS` heartbeat (250
 * ms, line 64 of the same file). At speed 1 that is a delta every ~2 ticks
 * against a roster every ~5; at speed 4 it is every ~8 against every ~20.
 * Both cadences matter to this pass and they are different instruments, so
 * both are read.
 *
 * `LOCOMOTION_SUBTILE_UNITS` is 256, so a tile centre is a multiple of 256 and
 * `subX / 256` is the tile column.
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
  return page.evaluate(
    () => (window as unknown as { lockstateGuardSamples?: GuardDeltaSample[] }).lockstateGuardSamples ?? [],
  );
}

/**
 * The status word out of one staff roster row.
 *
 * `formatStaffRosterText` renders `Guard · Unassigned` and the row's own
 * Dismiss button contributes a second line, so a laid-out row's `innerText` is
 * `Guard · Unassigned\nDismiss`. The word this pass is about is the middle
 * segment, and the first version of this function split on the newline
 * separator instead of on the interpunct and reported every phase as
 * `"Dismiss"` -- recorded because the instrument's own bug looked exactly like
 * a roster that never says anything.
 */
function phaseOf(row: string): string {
  const afterRole = row.split('·').slice(1).join('·');
  return (afterRole.split('|')[0] ?? '').trim();
}

/** Every laid-out staff roster row's text, as a player reads it. */
async function rosterRows(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.hud-staff__roster [data-staff]'))
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => (row.innerText ?? '').replace(/\n+/g, ' | ').trim()),
  );
}

interface PrisonerRowReading {
  readonly name: string;
  readonly badgeText: string;
  /** The badge's `title`, which is the copy #788's second half is about. */
  readonly badgeTitle: string | null;
  readonly badgeTone: string | undefined;
  readonly badgeAriaLabel: string | null;
  readonly rowTitle: string | null;
  readonly riskTier: string | undefined;
  readonly classificationGroup: string | undefined;
}

/** Every laid-out Regime-tab prisoner row, read off the DOM only. */
async function prisonerRows(page: Page): Promise<readonly PrisonerRowReading[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.hud-regime__roster-row'))
      .filter((row) => !row.hidden && row.getClientRects().length > 0)
      .map((row) => {
        const badge = row.querySelector<HTMLElement>('.ui-badge');
        return {
          name: (row.querySelector<HTMLElement>('.hud-regime__roster-name')?.textContent ?? '').trim(),
          badgeText: (row.querySelector<HTMLElement>('.ui-badge__text')?.textContent ?? '').trim(),
          badgeTitle: badge?.getAttribute('title') ?? null,
          badgeTone: badge?.dataset['tone'],
          badgeAriaLabel: badge?.getAttribute('aria-label') ?? null,
          rowTitle: row.getAttribute('title'),
          riskTier: row.dataset['riskTier'],
          classificationGroup: row.dataset['classificationGroup'],
        };
      }),
  );
}

/** One status-strip chip's whole reading: value, hover text, screen-reader text. */
async function readChip(
  page: Page,
  metric: string,
): Promise<{ value: string; title: string | null; srText: string } | undefined> {
  return page.evaluate((id) => {
    const chip = document.querySelector<HTMLElement>(`[data-metric="${id}"]`);
    if (chip === null) return undefined;
    return {
      value: (chip.querySelector<HTMLElement>('.ui-stat__value')?.textContent ?? '').trim(),
      title: chip.getAttribute('title'),
      srText: (chip.querySelector<HTMLElement>('.ui-sr-only')?.textContent ?? '').trim(),
    };
  }, metric);
}

/** The alerts column, as text. Laid out on every tab: it lives in `hud__aside`, outside the tab panels. */
async function alertsText(page: Page): Promise<string> {
  return panelText(page, '.hud-alerts__list');
}

/**
 * What DOM element actually sits under a screen point, top four of the stack.
 *
 * The brief's rule, and this repository has paid for it twice: a press that
 * silently lands on `.hud-minimap` produces zero commands and reads exactly
 * like a broken feature (2026-08-29 at 900x600, 2026-09-01 at 1280x800,
 * `docs/research/2026-09-02-the-world-view.md` §3). Nothing in this file
 * concludes "the press did nothing" without this read beside it.
 */
async function underPoint(page: Page, x: number, y: number): Promise<unknown> {
  return page.evaluate(
    ([px, py]) =>
      document
        .elementsFromPoint(px, py)
        .slice(0, 4)
        .map((el) => ({ tag: el.tagName, cls: el.className, pointerEvents: getComputedStyle(el).pointerEvents })),
    [x, y] as const,
  );
}

/* ==================================================================== */
/* Shared fixture: a sealed cell that contains the derived post tile     */
/* ==================================================================== */

/**
 * The tile every hire stands on and every post is derived to be, and the
 * reason this fixture is built *around* it rather than beside it.
 *
 * `src/main.ts:618` supplies `{ x: 16, y: 16 }` as the origin of every
 * `HireStaff` and every `AdmitPrisoner` the panels send, and
 * `deriveDefaultSecuritySectorPostTile` answers the middle of the first owned
 * chunk -- tile (16,16) of a 32-tile world
 * (`src/simulation/security/default-sector.ts:187`). The 6x6 rectangle
 * (12,12)-(17,17) contains it, which is what makes a housed prisoner and a
 * posted guard end up in the same room without a door existing.
 */
const POST_TILE = { x: 16, y: 16 } as const;
const CELL = { west: 12, north: 12, east: 17, south: 17 } as const;

/**
 * How far east the 6x6 footprint is shifted to clear `.hud-minimap`, and why
 * the shift is clamped rather than merely computed.
 *
 * **MEASURED, and it cost act 4's first run.** At 1280x800 `calibrate()`
 * answered an origin of `(-384, -624)`, which puts the cell's west wall at
 * screen `x = 384` and rows 14 to 17 of it at screen `y = 318..528` -- inside
 * `.hud-minimap`'s live rect of `x 12..410, y 317.8..718.8`. That panel has
 * `pointer-events: auto` and has swallowed world clicks in this repository
 * three times now (2026-08-29 at 900x600, 2026-09-01 at 1280x800,
 * `docs/research/2026-09-02-the-world-view.md` §3 at four viewports), so the
 * drag crosses it and four of the six west segments land on a panel instead of
 * the world.
 *
 * `playtest-2026-09-01-the-people.playtest.ts` already solved this by shifting
 * east; what it could not do, and what this fixture needs, is keep
 * `POST_TILE` **inside** the room. A hire and an admission both arrive at
 * (16,16), and if the cell does not contain that tile then no prisoner is ever
 * housed and no guard is ever in the same room as one -- which would make acts
 * 3 and 4 measure a different prison from the one they claim to. The footprint
 * spans `west .. west + 5`, so containing 16 bounds the shift at 4. Clamped
 * there rather than trusted, because the unclamped value is a function of a
 * viewport and an origin and would silently move the post outside the room at
 * some other size.
 */
function cellShiftClearing(minimapRight: number | undefined, originX: number): number {
  if (minimapRight === undefined) return 0;
  const wanted = Math.ceil((minimapRight + 40 - originX) / TILE) - CELL.west;
  return Math.min(4, Math.max(0, wanted));
}

interface SealedCellResult {
  readonly origin: { readonly originX: number; readonly originY: number };
  readonly zoned: boolean;
  readonly zoneAttempts: number;
  readonly wallReport: readonly string[];
  readonly shift: number;
  readonly containsPostTile: boolean;
}

/**
 * Lays one side of the perimeter with a drag, then repairs whatever the drag
 * dropped with one `press` per missing tile.
 *
 * Why the repair exists at all is `playtest-2026-09-01-the-people.playtest.ts`'s
 * finding, kept verbatim in intent: a `drag` is a mouse move interpolated over
 * sixteen steps, and on a loaded box one run watched a six-segment side
 * produce three. A missing segment is not a slow control, it is an unenclosed
 * rectangle -- and the zoning retry that follows has no way to close a gap
 * nothing redraws, so it retries the *designation* against a wall that was
 * never going to enclose. Not reported as a defect for exactly the reason that
 * file gives (it rests on dropped frames under load, which is wall-clock), and
 * repaired here so the acts that need a sealed cell do not inherit a coin
 * flip.
 */
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

/**
 * A sealed, zoned 6x6 cell at (12,12)-(17,17) with `beds` beds, and a toilet
 * only if asked for one.
 *
 * `withToilet: false` is what makes the neglect fixture a neglect fixture: it
 * is the same shape `tests/integration/risk-tier-neglect-reachability.test.ts`
 * calls *"a bed-only, unguarded prison built entirely from commands a player
 * can send: no toilet, no shower, no yard, no staff"*.
 */
async function buildSealedCell(
  page: Page,
  options: { readonly beds: number; readonly withToilet: boolean; readonly label: string },
): Promise<SealedCellResult> {
  const act = options.label;

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  // The single `calibrate()` this file spends per act. ~13 real presses; a
  // spec that called it three times spent 40 s of a 60 s budget, which is why
  // every screen point below is derived from this one reading rather than
  // re-measured.
  const origin = await calibrate(page);
  log(act, `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // Read live, because the panel's rect depends on the viewport and has moved
  // between every record that has measured it.
  const minimapRect = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap');
    if (el === null || (el as HTMLElement).offsetParent === null) return undefined;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  const shift = cellShiftClearing(minimapRect?.right, origin.originX);
  const west = CELL.west + shift;
  const east = CELL.east + shift;
  const containsPostTile = POST_TILE.x >= west && POST_TILE.x <= east && POST_TILE.y >= CELL.north && POST_TILE.y <= CELL.south;

  const westX = origin.originX + west * TILE;
  const eastX = origin.originX + (east + 1) * TILE;
  const northY = origin.originY + CELL.north * TILE;
  const southY = origin.originY + (CELL.south + 1) * TILE;
  log(
    act,
    `.hud-minimap rect ${JSON.stringify(minimapRect)}; shift ${shift} tile(s) east -> cell (${west},${CELL.north})-(${east},${CELL.south})` +
      ` at screen x ${westX}..${eastX} y ${northY}..${southY}; contains the post tile (${POST_TILE.x},${POST_TILE.y}): ${containsPostTile}`,
  );

  // 60 `wall-brick`, which is `buildAndPopulate`'s own figure and its own
  // arithmetic: 24 wall segments are 48 bricks, and the toilet is one more.
  // There is no separate purchase for the toilet.
  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', options.beds + 2);

  // Speed 4, so the delivery and the construction of 24 wall segments do not
  // cost an in-game week of real time. Two presses of fast-forward from the
  // paused clock a new prison starts on.
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

  // Zoned with a retry, because the Rooms panel's enclosure verdict is read
  // off a world view a snapshot replaces and a completed wall does not mark
  // dirty (`docs/research/2026-08-29-playtest-ordering-and-the-second-room.md`
  // §7). How many attempts it takes is logged rather than hidden.
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
  // Rows 12 and 13 -- the far side of the room from `POST_TILE` at (16,16), so
  // a housed prisoner is genuinely a few tiles away from where a guard stands.
  // The distance is what act 3 measures, so it is chosen rather than
  // incidental.
  for (const row of [12, 13]) {
    for (let column = west; column <= east && placed < options.beds; column += 1) {
      const point = centreOf(origin, column, row);
      const before = (await sentCommands(page)).length;
      await press(page, point.x, point.y);
      if ((await sentCommands(page)).length === before) {
        log(act, `bed at (${column},${row}) produced NO command; under it: ${JSON.stringify(await underPoint(page, point.x, point.y))}`);
      }
      placed += 1;
    }
  }
  if (options.withToilet) {
    await armBuildable(page, 'toilet-brick');
    const point = centreOf(origin, west, 17);
    await press(page, point.x, point.y);
  }
  log(act, `${placed} bed order(s)${options.withToilet ? ' + 1 toilet' : ' and deliberately NO toilet'} placed`);

  await waitForQueueEmpty(page);
  await page.waitForTimeout(1_500);
  const built = await latestCounts(page);
  log(act, `built at tick ${built?.tick}: rooms=${built?.rooms} roomCapacity=${built?.roomCapacity} accommodationCapacity=${built?.accommodationCapacity}`);

  return { origin, zoned, zoneAttempts: attempts, wallReport, shift, containsPostTile };
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

/** Opens the Staff panel's roster fold, which arrives collapsed, so its rows are laid out and readable. */
async function openRosterFold(page: Page): Promise<void> {
  await tab(page, 'security').click();
  const section = page.locator('.hud-staff__roster');
  if ((await section.getAttribute('data-collapsed')) === 'true') {
    // `.ui-section__header`, not `.ui-panel__header > .ui-panel__toggle`: the
    // roster is a `createCollapsibleSection`, and the wrong selector matched
    // nothing and hung for a whole test timeout when
    // `playtest-740-does-a-guard-walk.playtest.ts` first tried it.
    await section.locator('> .ui-section__header').click();
  }
}

/** Runs the clock forward until the worker publishes a tick at or past `target`, bounded by attempts rather than by a deadline. */
async function runToTick(page: Page, target: number, act: string): Promise<number> {
  for (let poll = 0; poll < 4_000; poll += 1) {
    const tick = await currentTick(page);
    if (tick >= target) return tick;
    await page.waitForTimeout(500);
  }
  const tick = await currentTick(page);
  log(act, `gave up waiting for tick ${target}; the clock is at ${tick}`);
  return tick;
}

/** A walk episode: a maximal run of render-delta samples in which one guard published a non-zero velocity. */
interface WalkEpisode {
  readonly guard: number;
  readonly fromTick: number;
  readonly toTick: number;
  readonly fromTile: string;
  readonly toTile: string;
  readonly samples: number;
}

/**
 * Splits the render-delta stream into per-guard tracks, and reports every
 * transition and every walk episode in **ticks**.
 *
 * The two shapes this exists to tell apart, both defined on ticks alone:
 *
 * - **A teleport.** Two tile positions in consecutive publications with more
 *   than `(tickGap / 2)` tiles between them -- more ground covered than
 *   `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` can cover, which is 128/256 of a
 *   tile per tick, so one tile every two ticks
 *   (`src/simulation/locomotion/locomotion.ts:102`).
 * - **A walk.** One tile per two ticks, on tile-aligned or off-tile positions,
 *   with a non-zero published velocity beside it.
 */
function analyseGuardTracks(act: string, samples: readonly GuardDeltaSample[]): readonly WalkEpisode[] {
  const byGuard = new Map<number, { at: number; subX: number; subY: number; moving: boolean }[]>();
  for (const sample of samples) {
    for (const guard of sample.guards) {
      const track = byGuard.get(guard.id) ?? [];
      track.push({ at: sample.at, subX: guard.subX, subY: guard.subY, moving: guard.vx !== 0 || guard.vy !== 0 });
      byGuard.set(guard.id, track);
    }
  }

  const episodes: WalkEpisode[] = [];
  for (const [id, track] of [...byGuard.entries()].sort((a, b) => a[0] - b[0])) {
    const offTile = track.filter((p) => p.subX % 256 !== 0 || p.subY % 256 !== 0).length;
    const moving = track.filter((p) => p.moving).length;
    log(act, `guard ${id}: ${track.length} delta sample(s), ${moving} with a non-zero velocity, ${offTile} not on a tile centre`);

    // Transitions, with the tick gap and the ground covered, so a teleport and
    // a walked step are told apart on the numbers rather than on a label.
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

    // Walk episodes: maximal runs of `moving`.
    let start: number | undefined;
    let startTile = '';
    let count = 0;
    for (let index = 0; index < track.length; index += 1) {
      const point = track[index]!;
      if (point.moving && start === undefined) {
        start = point.at;
        startTile = `${point.subX / 256},${point.subY / 256}`;
        count = 1;
      } else if (point.moving) {
        count += 1;
      } else if (start !== undefined) {
        episodes.push({ guard: id, fromTick: start, toTick: point.at, fromTile: startTile, toTile: `${point.subX / 256},${point.subY / 256}`, samples: count });
        start = undefined;
      }
    }
    if (start !== undefined) {
      const last = track[track.length - 1]!;
      episodes.push({ guard: id, fromTick: start, toTick: last.at, fromTile: startTile, toTile: `${last.subX / 256},${last.subY / 256}`, samples: count });
    }
  }
  return episodes;
}

/* ==================================================================== */
/* Act 1 — where a new hire stands, and whether `Travelling` is ever     */
/* on screen (#740, ADR 0088)                                           */
/* ==================================================================== */

/**
 * ADR 0088's own open question, asked as a player: *can a player ever see a
 * guard walk?*
 *
 * This act tests the cheapest half of the answer -- what a hire does -- with
 * no prison at all, because that is what a player does first. ADR 0036
 * decision 2 predicts the answer (a hire stands on the post tile, so
 * `beginDeployment` takes its `isAtPost` fast path and there is no distance to
 * cover), and the owner was told that before signing. The point of measuring
 * it is that the prediction is about *two* modules agreeing -- `src/main.ts`'s
 * origin and the sector derivation -- and neither knows about the other.
 */
test('act 1: a new hire stands on the post it is deployed to, so its walk has no distance (#740)', async ({ page }) => {
  const act = 'act1';
  test.setTimeout(600_000);
  const started = Date.now();
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await installGuardProbe(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  // Speed 1 -- the slowest the clock runs, which is the most generous case for
  // seeing anything at all. Nothing here is measured in seconds; the samples
  // below are stamped with the worker's own tick.
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(300);
  log(act, `clock: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

  await hireGuards(page, 4, act);
  await openRosterFold(page);
  log(act, `roster fold open; rows: ${JSON.stringify(await rosterRows(page))}`);

  const from = await currentTick(page);
  const phaseCounts = new Map<string, { count: number; firstTick: number; lastTick: number }>();
  let polls = 0;
  // 400 ticks of sampling, which is 20 wall seconds at speed 1 and is bounded
  // by the tick rather than by the clock on the wall.
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= from + 400) break;
    for (const row of await rosterRows(page)) {
      polls += 1;
      const phase = phaseOf(row);
      const seen = phaseCounts.get(phase);
      if (seen === undefined) phaseCounts.set(phase, { count: 1, firstTick: tick, lastTick: tick });
      else phaseCounts.set(phase, { count: seen.count + 1, firstTick: seen.firstTick, lastTick: tick });
    }
    await page.waitForTimeout(80);
  }
  const to = await currentTick(page);
  log(act, `sampled the roster from tick ${from} to ${to}: ${polls} row read(s)`);
  log(act, `phases seen: ${JSON.stringify([...phaseCounts.entries()].sort())}`);
  log(act, `staff panel now:\n${await panelText(page, '.hud-staff')}`);
  log(act, `coverage/held: ${JSON.stringify(await panelText(page, '.hud-staff__held'))}`);

  const samples = await guardSamples(page);
  log(act, `render-delta samples over that window: ${samples.length}`);
  const episodes = analyseGuardTracks(act, samples);
  log(act, `walk episodes (non-zero published velocity): ${JSON.stringify(episodes)}`);

  const tiles = new Set<string>();
  for (const sample of samples) for (const guard of sample.guards) tiles.add(`${guard.subX / 256},${guard.subY / 256}`);
  log(act, `every distinct tile any guard was ever published on: ${JSON.stringify([...tiles].sort())}`);
  log(act, `the tile \`src/main.ts\` sends every hire to, and the tile the sector derives its post as: ${POST_TILE.x},${POST_TILE.y}`);

  // The one hard assertion this act makes, and it is the composition claim
  // rather than the movement claim: a hire is published exactly on the tile
  // the post is derived to be. If this ever fails, ADR 0036 decision 2 has
  // stopped being true and ADR 0088's deployment walk has become reachable
  // from the Hire button -- which would be a finding, not a regression.
  expect(samples.length, 'the render-delta probe must have decoded something, or nothing below means anything').toBeGreaterThan(0);
  expect(
    [...tiles].filter((tile) => tile !== `${POST_TILE.x},${POST_TILE.y}`),
    'every hire should stand on the derived post tile, so its deployment walk has no distance',
  ).toEqual([]);

  log(act, `act 1 standalone cost: ${Math.round((Date.now() - started) / 1000)}s of wall clock (reported, never asserted on)`);
});

/* ==================================================================== */
/* Act 2 — what `Medium` looks like the first way a player can meet it   */
/* ==================================================================== */

/**
 * **`Medium` at intake, which is a different fact from `Medium` as a warning
 * and wears the same badge.**
 *
 * `classifyPrisoner` scores `sentenceLengthTicks >= 200_000` as one point and
 * adds a screening draw of -1, 0 or +1
 * (`src/simulation/prisoners/classification.ts:84`), and
 * `drawSentenceLengthTicks` draws 14..90 in-game days, so 84 days up (200,000
 * ticks up) carries that point (`src/simulation/prisoners/sentence.ts:226`).
 * Tier 2 is therefore reachable from the Admit button alone. `src/main.ts`'s
 * own docblock says so in as many words -- *"`[0, 1]` below 84 in-game days
 * and `[0, 1, 2]` at or above it"* -- and that has been true since `9a25700c`
 * (2026-08-30).
 *
 * ### How a `Medium` is attributed without a tick bound
 *
 * The first version of this act paused below tick 2,399 -- the early warning's
 * first possible fire (`intervalTicks` `DAY_LENGTH_TICKS`, `phaseTicks`
 * `DAY_LENGTH_TICKS - 1`) -- and read the roster there. That bound cannot
 * survive needing a cell: building one runs the clock past 2,399 long before
 * anybody is admitted. The replacement is stronger and needs no clock at all.
 * `reviewClassification`'s score is `sentence + intakeHistory + findings +
 * cleanConduct` (`src/simulation/prisoners/classification.ts:213`);
 * `intakeHistory` is always 0 because `ADMISSION_REQUEST` hard-codes
 * `priorIncidents: 0`; `cleanConduct` is never positive; and `findings` is 0
 * with no incident and no confiscation on record. So with the incidents and
 * contraband chips both reading zero, the early warning's ceiling is 1 and it
 * **cannot** have written a `Medium`. Both chips are therefore read at the
 * same moment as the roster.
 *
 * ### And the refusal a no-cell prison gives, since this act was already there
 *
 * The act as first written admitted with no cell at all and got **nothing**:
 * 24 presses, `prisoners: 0`. So it now measures that refusal properly before
 * building, because a control that can be pressed 24 times with no effect is
 * the design directive's own subject.
 *
 * **The seed is drawn per prison** (`SessionController.createPrison` draws a
 * fresh `masterSeed` per call, #479), so the tiers here are a sample and not a
 * reproduction: a re-run sees different ones. That is stated in the log so a
 * reader cannot mistake one run's tiers for the distribution.
 */
test('act 2: what a Medium badge says when it arrives at intake, before the early warning has run (#788)', async ({ page }) => {
  const act = 'act2';
  test.setTimeout(600_000);
  const started = Date.now();
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  // ---- phase 1: what Admit does on a prison with no cell ----------------
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'overview').click();
  log(act, `refusal band before any press: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  const admitBox = await page.locator('.hud-intake__admit').boundingBox();
  if (admitBox !== null) {
    log(act, `under the Admit control's centre: ${JSON.stringify(await underPoint(page, admitBox.x + admitBox.width / 2, admitBox.y + admitBox.height / 2))}`);
  }
  for (let index = 0; index < 3; index += 1) {
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(400);
    log(
      act,
      `no-cell Admit press ${index + 1}: disabled=${String(await page.locator('.hud-intake__admit').getAttribute('disabled'))}` +
        ` | refusal band ${JSON.stringify(await panelText(page, '.hud__refusal'))}` +
        ` | event notice ${JSON.stringify(await panelText(page, '.hud__event'))}` +
        ` | alerts ${JSON.stringify(await alertsText(page))}` +
        ` | prisoners ${(await latestCounts(page))?.prisoners ?? -1}`,
    );
  }
  log(act, `intake panel after three refused presses: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

  // ---- phase 2: a cell, then as many admissions as the panel accepts -----
  const built = await buildSealedCell(page, { beds: 8, withToilet: true, label: act });
  log(act, `cell (a SECOND prison -- phase 1 above used the first): ${JSON.stringify({ zoned: built.zoned, zoneAttempts: built.zoneAttempts, shift: built.shift, containsPostTile: built.containsPostTile })}`);
  const pressed = await admit(page, 24, act);
  log(act, `refusal band after ${pressed} press(es): ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

  const settled = await runToTick(page, (await currentTick(page)) + 2_400, act);
  await page.locator('.hud-strip__transport button').nth(0).click();
  await page.waitForTimeout(400);
  log(act, `paused at tick ${settled}; counts ${JSON.stringify(await latestCounts(page))}`);

  await tab(page, 'regime').click();
  await page.waitForTimeout(600);

  const rows = await prisonerRows(page);
  log(act, `Regime roster rows on screen (${rows.length} of ${(await latestCounts(page))?.prisoners ?? -1} admitted; PRISONER_ROSTER_ROW_LIMIT is 4): ${JSON.stringify(rows)}`);
  log(act, `distinct badge words: ${JSON.stringify([...new Set(rows.map((r) => r.badgeText))].sort())}`);
  log(act, `distinct tiers: ${JSON.stringify([...new Set(rows.map((r) => r.riskTier))].sort())}`);
  log(act, `high-risk chip: ${JSON.stringify(await readChip(page, 'high-risk'))}`);
  log(act, `prisoners chip: ${JSON.stringify(await readChip(page, 'prisoners'))}`);
  // The two chips that decide whether a `Medium` on that roster can possibly
  // be the early warning's: with both at zero there is no disciplinary
  // evidence, so `findings` is 0 and its ceiling is tier 1.
  log(act, `incidents chip: ${JSON.stringify(await readChip(page, 'incidents'))}`);
  log(act, `contraband chip: ${JSON.stringify(await readChip(page, 'contraband'))}`);
  log(act, `alerts column: ${JSON.stringify(await alertsText(page))}`);
  log(act, `whole Regime tab as text: ${JSON.stringify(await panelText(page, '.hud-regime'))}`);
  log(act, `admissions pressed: ${pressed}. The master seed is drawn per prison, so these tiers are ONE SAMPLE and a re-run will differ.`);

  // Whatever the tiers turn out to be, the copy question is seed-independent:
  // no row carries a `title` or an `aria-label` on its badge, so nothing on
  // screen explains the word.
  log(
    act,
    `badge titles: ${JSON.stringify(rows.map((r) => r.badgeTitle))}; badge aria-labels: ${JSON.stringify(rows.map((r) => r.badgeAriaLabel))}; row titles: ${JSON.stringify(rows.map((r) => r.rowTitle))}`,
  );

  log(act, `act 2 standalone cost: ${Math.round((Date.now() - started) / 1000)}s of wall clock (reported, never asserted on)`);
});

/* ==================================================================== */
/* Act 3 — the one walk a player can actually provoke                    */
/* ==================================================================== */

/**
 * **A sector sweep, and the walk back from it.**
 *
 * The two errands ADR 0088 converts are deployment travel and a patrol leg.
 * Neither is reachable the way the brief assumed, and this act is built around
 * why:
 *
 * - **Deployment travel from a hire is always zero-length** (act 1).
 * - **A patrol leg needs a `patrolRoute`, and no session a player can start
 *   has one.** `deriveDefaultSecuritySector` returns `doorIds: []` and no
 *   route at all, with its own stated reason -- *"a derived loop would be a
 *   made-up path across whatever the player happens to have built.
 *   `PatrolSystem` therefore stays inert"*
 *   (`src/simulation/security/default-sector.ts:218`). Nothing in `src/`
 *   authors a route.
 *
 * What is left, and it needs no player gesture at all:
 * `SectorSearchDutySystem` orders a sweep every
 * `DEFAULT_SECTOR_SEARCH_INTERVAL_TICKS` (600) whenever a claimable guard is
 * spare (`src/simulation/contraband/sector-search-duty.ts:176`); `SearchSystem`
 * puts that guard on each target with `GuardRoster.setTile` -- a teleport, out
 * of ADR 0088's scope deliberately
 * (`src/simulation/contraband/search-system.ts:372`) -- and then `unassign`s
 * it where it stands; and `DeploymentSystem` then walks it back, either
 * through `assignUnassignedGuards` or through `walkBackToPost`. So the walk a
 * player can see is the **return** from a search, and its length is however
 * far the last search target was from the post.
 *
 * Three guards, because the sector's requirement grows with occupancy
 * (`resolveOccupancyScaledGuardCount`) and a sweep needs one guard spare on
 * top of it.
 */
test('act 3: a sector sweep teleports a guard out and walks it back — how many ticks, and is it on screen? (#740)', async ({ page }) => {
  const act = 'act3';
  test.setTimeout(1_500_000);
  const started = Date.now();
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await installGuardProbe(page);
  await openApp(page);

  const built = await buildSealedCell(page, { beds: 6, withToilet: true, label: act });
  log(act, `cell: ${JSON.stringify({ zoned: built.zoned, zoneAttempts: built.zoneAttempts, shift: built.shift, containsPostTile: built.containsPostTile })}`);
  await admit(page, 6, act);
  await hireGuards(page, 3, act);
  await openRosterFold(page);

  // Back to speed 1 for the sampling window: the render delta arrives every
  // 100 ms, which is ~2 ticks at speed 1 and ~8 at speed 4, and a walk that
  // may be a handful of ticks long has to be sampled at the finer of the two.
  await page.locator('.hud-strip__transport button').nth(1).click();
  await page.waitForTimeout(300);
  log(act, `clock for the sampling window: ${JSON.stringify(await currentClock(page))}`);

  const from = await currentTick(page);
  const phaseCounts = new Map<string, { count: number; firstTick: number; lastTick: number }>();
  const phaseTimeline: string[] = [];
  let lastRow = '';
  // 2,000 ticks, which spans at least three 600-tick sweep boundaries however
  // the clock happened to be phased when the window opened.
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= from + 2_000) break;
    const rows = await rosterRows(page);
    const joined = rows.join(' // ');
    if (joined !== lastRow) {
      phaseTimeline.push(`t${tick}: ${joined}`);
      lastRow = joined;
    }
    for (const row of rows) {
      const phase = phaseOf(row);
      const seen = phaseCounts.get(phase);
      if (seen === undefined) phaseCounts.set(phase, { count: 1, firstTick: tick, lastTick: tick });
      else phaseCounts.set(phase, { count: seen.count + 1, firstTick: seen.firstTick, lastTick: tick });
    }
    await page.waitForTimeout(80);
  }
  const to = await currentTick(page);

  log(act, `sampled the roster from tick ${from} to ${to} at speed 1`);
  log(act, `every roster change, in ticks:\n${phaseTimeline.join('\n')}`);
  log(act, `phases seen with tick ranges: ${JSON.stringify([...phaseCounts.entries()].sort())}`);
  log(act, `contraband chip: ${JSON.stringify(await readChip(page, 'contraband'))}`);
  log(act, `coverage chip: ${JSON.stringify(await readChip(page, 'coverage'))}`);
  log(act, `held guards panel: ${JSON.stringify(await panelText(page, '.hud-staff__held'))}`);
  log(act, `alerts column: ${JSON.stringify(await alertsText(page))}`);

  const samples = await guardSamples(page);
  const windowed = samples.filter((s) => s.at >= from);
  log(act, `render-delta samples in the window: ${windowed.length} (of ${samples.length} since page load)`);
  const episodes = analyseGuardTracks(act, windowed);
  log(act, `walk episodes: ${JSON.stringify(episodes)}`);

  /*
   * **Phase 2, added after phase 1 measured zero walks.**
   *
   * Phase 1's sweeps all teleported and none produced a walk back, and the
   * reason is readable in its own roster timeline: the guard a sweep claims is
   * a *spare*. `claimableGuardIds` draws only from `unassignedGuardIds()`,
   * which is `'unassigned'` only
   * (`src/simulation/security/guard-roster.ts:236`), so the posted guard is
   * never sent searching and never leaves its post; and a spare released back
   * from a search has no post to walk to, because
   * `DeploymentSystem.assignUnassignedGuards` only draws when the sector is
   * short and a six-resident prison asks for exactly one guard
   * (`DEFAULT_SECTOR_PRISONERS_PER_GUARD` is 8,
   * `src/simulation/security/sector-staffing.ts:147`).
   *
   * So the missing ingredient is a **shortage while a spare is standing
   * somewhere else**, and there is exactly one control that manufactures one:
   * the Release button on the ON DUTY row, which frees the posted guard. The
   * next deployment cycle then has a shortage of one and a pool of spares, and
   * whichever it picks is walked from wherever the last sweep left it.
   *
   * This is the only player gesture found in this pass that can produce a
   * guard walk, so it is measured rather than argued -- and the press is
   * checked with `elementsFromPoint` first, because "Release did nothing" and
   * "the click missed" look identical.
   */
  const heldRow = page.locator('.hud-staff__held-row', { hasText: 'Release' });
  if ((await heldRow.count()) === 0) {
    log(act, 'phase 2 SKIPPED: no ON DUTY row with a Release control was laid out');
    return;
  }
  const releaseButton = heldRow.first().getByRole('button', { name: 'Release' });
  const releaseBox = await releaseButton.boundingBox();
  if (releaseBox !== null) {
    log(act, `under the Release control's centre: ${JSON.stringify(await underPoint(page, releaseBox.x + releaseBox.width / 2, releaseBox.y + releaseBox.height / 2))}`);
  }
  const releasedAt = await currentTick(page);
  await releaseButton.click();
  log(act, `pressed Release at tick ${releasedAt}; held panel now ${JSON.stringify(await panelText(page, '.hud-staff__held'))}`);

  const phaseTwoTimeline: string[] = [];
  let lastPhaseTwoRow = '';
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= releasedAt + 400) break;
    const joined = (await rosterRows(page)).join(' // ');
    if (joined !== lastPhaseTwoRow) {
      phaseTwoTimeline.push(`t${tick}: ${joined}`);
      lastPhaseTwoRow = joined;
    }
    await page.waitForTimeout(60);
  }
  log(act, `phase 2 roster changes over 400 ticks after Release:\n${phaseTwoTimeline.join('\n')}`);
  log(act, `phase 2 held panel: ${JSON.stringify(await panelText(page, '.hud-staff__held'))}`);

  const phaseTwoSamples = (await guardSamples(page)).filter((sample) => sample.at >= releasedAt);
  log(act, `phase 2 render-delta samples: ${phaseTwoSamples.length}`);
  const phaseTwoEpisodes = analyseGuardTracks(`${act}p2`, phaseTwoSamples);
  log(act, `phase 2 walk episodes: ${JSON.stringify(phaseTwoEpisodes)}`);
  for (const episode of phaseTwoEpisodes) {
    const ticks = episode.toTick - episode.fromTick;
    log(
      `${act}p2`,
      `episode: guard ${episode.guard} walked (${episode.fromTile}) -> (${episode.toTile}) across ${ticks} tick(s)` +
        ` = ${(ticks / 20).toFixed(2)}s at speed 1 and ${(ticks / 80).toFixed(2)}s at speed 4;` +
        ` the roster refreshes on a 250 ms heartbeat, ~5 ticks at speed 1 and ~20 at speed 4`,
    );
  }
  for (const episode of episodes) {
    const ticks = episode.toTick - episode.fromTick;
    log(
      act,
      `episode: guard ${episode.guard} walked from (${episode.fromTile}) to (${episode.toTile}) across ${ticks} tick(s)` +
        ` = ${(ticks / 20).toFixed(2)}s at speed 1, ${(ticks / 80).toFixed(2)}s at speed 4;` +
        ` the roster refreshes on a 250 ms heartbeat, which is ~5 ticks at speed 1 and ~20 at speed 4`,
    );
  }
  log(act, `act 3 standalone cost: ${Math.round((Date.now() - started) / 1000)}s of wall clock (reported, never asserted on)`);
});

/* ==================================================================== */
/* Act 4 — neglect a prison until `Medium` arrives, and watch the screen  */
/* ==================================================================== */

interface ScreenSample {
  readonly tick: number;
  readonly tiers: readonly (string | undefined)[];
  readonly badges: readonly string[];
  readonly tones: readonly (string | undefined)[];
  readonly highRisk: string;
  readonly alerts: string;
  readonly incidentsChip: string;
}

/**
 * **What a player sees at the moment `Medium` arrives, and whether they can
 * act on it.**
 *
 * The fixture is the browser analogue of
 * `tests/integration/risk-tier-neglect-reachability.test.ts`'s neglected
 * prison: beds, no toilet, no shower, no yard, **no guards**. That test
 * measures `Medium` at tick 4,800 and `High` still at 48,000 in its own
 * post-step convention, on 8 residents in 8 separate one-bed cells; this is
 * one 6x6 room and the browser's own random sentence draw, so its ticks are
 * this prison's and not that one's.
 *
 * Everything is sampled together and stamped with the tick, because the
 * question is not *when* the tier moves -- the integration test already
 * answers that -- but **what else on screen moves with it**: the badge word,
 * the badge tone, the `high-risk` chip, the incidents chip, the alerts
 * column. A sample that read only the roster could not tell "the badge
 * changed colour and nothing else happened" from "the game told the player".
 */
test('act 4: neglect until Medium — what changes on screen at that tick, and what a player can do about it (#788)', async ({ page }) => {
  const act = 'act4';
  test.setTimeout(2_400_000);
  const started = Date.now();
  await page.setViewportSize({ width: 1280, height: 800 });
  await installTee(page);
  await openApp(page);

  const built = await buildSealedCell(page, { beds: 8, withToilet: false, label: act });
  log(act, `cell: ${JSON.stringify({ zoned: built.zoned, zoneAttempts: built.zoneAttempts, shift: built.shift, containsPostTile: built.containsPostTile })}`);
  /*
   * Twelve admissions against eight beds, not eight against eight.
   *
   * The integration fixture houses everybody and still opens its first riot at
   * tick 1,801, so overcrowding is not required -- but it is the pressure
   * `docs/research/2026-08-26-failure-modes.md`'s own in-place correction
   * (#396) names as the reachable one, an unhoused arrival's `safety` being
   * the need that actually decays to zero. Four arrivals with no bed cost
   * nothing and can only shorten the wait for the evidence this act needs.
   * Both halves are stated because if `Medium` does not arrive, which of them
   * failed matters.
   */
  await admit(page, 12, act);
  log(act, `NO guards hired, and no toilet built: this is the neglect fixture, played`);

  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(400);
  log(act, `clock: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

  await tab(page, 'regime').click();
  await page.waitForTimeout(500);

  const timeline: ScreenSample[] = [];
  const changes: string[] = [];
  let previousKey = '';
  let firstMediumAt: number | undefined;
  let firstMediumSample: ScreenSample | undefined;
  let sampleBeforeMedium: ScreenSample | undefined;

  /*
   * The loop is bounded by the **tick**, not by a deadline: it stops at tick
   * 30,000 (12.5 in-game days) or 2,400 ticks past the first `Medium`,
   * whichever comes first. `page.waitForTimeout` here is only a polling
   * interval and no finding rests on it -- every sample carries the tick the
   * worker published.
   */
  for (;;) {
    const tick = await currentTick(page);
    const rows = await prisonerRows(page);
    const sample: ScreenSample = {
      tick,
      tiers: rows.map((r) => r.riskTier),
      badges: rows.map((r) => r.badgeText),
      tones: rows.map((r) => r.badgeTone),
      highRisk: (await readChip(page, 'high-risk'))?.value ?? 'ABSENT',
      alerts: await alertsText(page),
      incidentsChip: (await readChip(page, 'incidents'))?.value ?? 'ABSENT',
    };
    const key = JSON.stringify([sample.tiers, sample.badges, sample.tones, sample.highRisk, sample.alerts, sample.incidentsChip]);
    if (key !== previousKey) {
      changes.push(`t${tick}: ${key}`);
      timeline.push(sample);
      if (firstMediumAt === undefined) sampleBeforeMedium = timeline[timeline.length - 2];
      previousKey = key;
    }

    if (firstMediumAt === undefined && sample.tiers.some((tier) => tier !== undefined && Number(tier) >= 2)) {
      firstMediumAt = tick;
      firstMediumSample = sample;
      log(act, `=== FIRST tier >= 2 observed at tick ${tick} ===`);
      log(act, `the sample immediately before it: ${JSON.stringify(sampleBeforeMedium)}`);
      log(act, `the sample at it: ${JSON.stringify(sample)}`);
      log(act, `full rows at that moment: ${JSON.stringify(rows)}`);
      log(act, `whole Regime tab: ${JSON.stringify(await panelText(page, '.hud-regime'))}`);
      log(act, `whole status strip: ${JSON.stringify((await panelText(page, '.hud-strip')).replace(/\n/g, ' | '))}`);
      log(act, `alerts column: ${JSON.stringify(sample.alerts)}`);
      /*
       * **Can a player act on it?** The three things a player could plausibly
       * do next, each read rather than assumed: hover the badge (a `title`),
       * press the row (any handler at all), and look for the word anywhere
       * else on the tab. The press is checked with `elementsFromPoint` first,
       * so "pressing did nothing" cannot be a click that missed.
       */
      const rowBox = await page.locator('.hud-regime__roster-row').first().boundingBox();
      if (rowBox !== null) {
        const cx = rowBox.x + rowBox.width / 2;
        const cy = rowBox.y + rowBox.height / 2;
        log(act, `under the first roster row's centre (${cx},${cy}): ${JSON.stringify(await underPoint(page, cx, cy))}`);
        const before = (await sentCommands(page)).length;
        await page.mouse.move(cx, cy);
        await page.waitForTimeout(700);
        log(act, `after hovering the row for 700 ms, the badge's title is still ${JSON.stringify((await prisonerRows(page))[0]?.badgeTitle ?? null)}`);
        await page.mouse.down({ button: 'left' });
        await page.mouse.up({ button: 'left' });
        await page.waitForTimeout(400);
        log(act, `pressing the row produced ${(await sentCommands(page)).length - before} command(s); refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
      }
    }

    if (tick >= 30_000) break;
    if (firstMediumAt !== undefined && tick >= firstMediumAt + 2_400) break;
    await page.waitForTimeout(700);
  }

  log(act, `every distinct screen state, in ticks:\n${changes.join('\n')}`);
  log(act, `first tier >= 2 at tick: ${firstMediumAt ?? 'NEVER within 30,000 ticks'}`);
  log(act, `final counts: ${JSON.stringify(await latestCounts(page))}`);
  log(act, `final Regime tab: ${JSON.stringify(await panelText(page, '.hud-regime'))}`);
  log(act, `final alerts column: ${JSON.stringify(await alertsText(page))}`);
  log(act, `high-risk chip at the end: ${JSON.stringify(await readChip(page, 'high-risk'))}`);
  if (firstMediumSample !== undefined && sampleBeforeMedium !== undefined) {
    const fields: readonly (keyof ScreenSample)[] = ['tiers', 'badges', 'tones', 'highRisk', 'alerts', 'incidentsChip'];
    for (const field of fields) {
      const before = JSON.stringify(sampleBeforeMedium[field]);
      const after = JSON.stringify(firstMediumSample[field]);
      log(act, `across the Medium transition, ${field}: ${before} -> ${after} ${before === after ? '(UNCHANGED)' : '(changed)'}`);
    }
  }

  log(act, `act 4 standalone cost: ${Math.round((Date.now() - started) / 1000)}s of wall clock (reported, never asserted on)`);
});
