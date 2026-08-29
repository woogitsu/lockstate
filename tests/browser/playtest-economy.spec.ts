import { expect, test, type Page } from '@playwright/test';

/**
 * A *playtest*, not a regression suite, and **deliberately not a CI gate**.
 *
 * It answers issue #601 -- what "a neglected twelve-prisoner prison earns
 * about 150/day" was actually measuring -- by playing: build a prison with
 * the mouse, admit prisoners, run past a day boundary, and read the roster
 * count, the resident count and the amount actually credited, separately.
 *
 * Its output is the deliverable. The findings live in
 * `docs/research/2026-08-29-what-a-day-actually-pays.md`.
 */

const APP_URL = '/index.html';
const TILE = 64;

interface TeeWindow {
  lockstateSentToWorker?: unknown[];
  lockstateFromWorker?: unknown[];
}

interface SubmittedCommand {
  readonly kind?: string;
  readonly payload?: { readonly command?: { readonly data?: Record<string, unknown> } };
}

async function installTee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    class TeeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const kind = (event.data as { kind?: string })?.kind ?? '';
          // Only the small messages, so the array cannot grow without bound.
          if (kind === 'simulation/delta' || kind === 'simulation/snapshot' || kind === 'simulation/projection') return;
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
    (window as unknown as { Worker: typeof Worker }).Worker = TeeWorker as unknown as typeof Worker;
    (window as unknown as TeeWindow).lockstateSentToWorker = sent;
    (window as unknown as TeeWindow).lockstateFromWorker = received;
  });
}

async function sentCommands(page: Page): Promise<readonly Record<string, unknown>[]> {
  return page.evaluate(() =>
    ((window as unknown as TeeWindow).lockstateSentToWorker ?? [])
      .map((message) => message as SubmittedCommand)
      .filter((message) => message.kind === 'simulation/submit-command')
      .map((message) => message.payload?.command?.data ?? {}),
  );
}

interface CountsSample {
  readonly tick: number;
  readonly prisoners: number;
  readonly prisonersInIntake: number;
  readonly prisonersHighRisk: number;
  readonly rooms: number;
  readonly roomCapacity: number;
  readonly accommodationCapacity: number;
  readonly roomOccupants: number;
  readonly treasuryMinorUnits: number;
  readonly stateIncomeAccruedTodayMinorUnits: number;
  readonly dailyWageBillMinorUnits: number;
  readonly unpaidWagesMinorUnits: number;
  readonly staff: number;
}

/** Every `simulation/status-counts` the worker has published so far. */
async function countsSeries(page: Page): Promise<readonly CountsSample[]> {
  return page.evaluate(() =>
    ((window as unknown as TeeWindow).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/status-counts')
      .map((message) => {
        const payload = (message as { payload: { tick: number; counts: Record<string, number> } }).payload;
        return {
          tick: payload.tick,
          prisoners: payload.counts['prisoners'] ?? -1,
          prisonersInIntake: payload.counts['prisonersInIntake'] ?? -1,
          prisonersHighRisk: payload.counts['prisonersHighRisk'] ?? -1,
          rooms: payload.counts['rooms'] ?? -1,
          roomCapacity: payload.counts['roomCapacity'] ?? -1,
          accommodationCapacity: payload.counts['accommodationCapacity'] ?? -1,
          roomOccupants: payload.counts['roomOccupants'] ?? -1,
          treasuryMinorUnits: payload.counts['treasuryMinorUnits'] ?? -1,
          stateIncomeAccruedTodayMinorUnits: payload.counts['stateIncomeAccruedTodayMinorUnits'] ?? -1,
          dailyWageBillMinorUnits: payload.counts['dailyWageBillMinorUnits'] ?? -1,
          unpaidWagesMinorUnits: payload.counts['unpaidWagesMinorUnits'] ?? -1,
          staff: payload.counts['staff'] ?? -1,
        };
      }),
  );
}

async function latestCounts(page: Page): Promise<CountsSample | undefined> {
  const series = await countsSeries(page);
  return series[series.length - 1];
}

/**
 * The tick, read from `simulation/clock-state`.
 *
 * **Not from `simulation/status-counts`**, and that is a finding rather than a
 * detail: the worker skips a counts publication whose payload equals the last
 * one (`statusCountsEqual`, `src/simulation/worker/status-counts.ts`), and the
 * `tick` lives in the envelope beside `counts` rather than in it -- so an empty
 * prison publishes counts once and then never again, however long it runs. The
 * first version of this harness polled that tick and concluded the simulation
 * was frozen at 0 while construction was visibly progressing.
 */
async function currentTick(page: Page): Promise<number> {
  return page.evaluate(() => {
    const messages = (window as unknown as TeeWindow).lockstateFromWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { tick?: number } };
      if (message.kind === 'simulation/clock-state') return message.payload?.tick ?? -1;
    }
    return -1;
  });
}

async function currentClock(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const messages = (window as unknown as TeeWindow).lockstateFromWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as { kind?: string; payload?: { clock?: unknown } };
      if (message.kind === 'simulation/clock-state') return message.payload?.clock ?? null;
    }
    return null;
  });
}

/**
 * The tab bar, by `data-tab` rather than by accessible name.
 *
 * `getByRole('button', { name: 'Build' })` matched two elements once the wall
 * tool was armed -- the tab and the Build panel's own arm control, whose label
 * changes -- and a strict-mode violation killed a ten-minute run. A tab is
 * addressed by its id here for the same reason a test addresses a room row by
 * `data-room`.
 */
function tab(page: Page, id: 'overview' | 'build' | 'rooms' | 'security' | 'regime') {
  return page.locator(`.hud__tabs [data-tab="${id}"]`);
}

async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
}

async function panelText(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const node = document.querySelector<HTMLElement>(sel);
    if (node === null) return `${sel}: ABSENT`;
    if (node.hidden || node.getClientRects().length === 0) return `${sel}: not laid out`;
    return (node.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
  }, selector);
}

async function press(page: Page, x: number, y: number): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(100);
  return (await sentCommands(page)).slice(before);
}

async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }): Promise<void> {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 8 });
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(150);
}

/** Measures the screen->tile transform against the real page, by bisection. */
async function calibrate(page: Page): Promise<{ originX: number; originY: number }> {
  await page.locator('.hud-build__remove').click();
  const probeX = 700;
  const probeY = 300;
  const at = async (x: number, y: number): Promise<{ x: number; y: number }> => {
    const commands = await press(page, x, y);
    const removal = commands.find((c) => c['type'] === 'RemoveObject');
    if (removal === undefined) throw new Error(`no RemoveObject from a press at ${x},${y}: ${JSON.stringify(commands)}`);
    return { x: removal['x'] as number, y: removal['y'] as number };
  };

  const base = await at(probeX, probeY);
  let lo = probeX;
  let hi = probeX + TILE;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const tile = await at(mid, probeY);
    if (tile.x === base.x) lo = mid;
    else hi = mid;
  }
  const originX = hi - (base.x + 1) * TILE;

  lo = probeY;
  hi = probeY + TILE;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const tile = await at(probeX, mid);
    if (tile.y === base.y) lo = mid;
    else hi = mid;
  }
  const originY = hi - (base.y + 1) * TILE;

  await page.locator('.hud-build__remove').click();
  return { originX, originY };
}

const centreOf = (o: { originX: number; originY: number }, tx: number, ty: number) => ({
  x: o.originX + tx * TILE + TILE / 2,
  y: o.originY + ty * TILE + TILE / 2,
});

async function armBuildable(page: Page, id: string): Promise<void> {
  await page.locator(`.hud-build__list [data-buildable="${id}"]`).click();
  const label = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
  if (label.startsWith('place') || label.startsWith('draw')) await page.locator('.hud-build__arm').click();
}

async function buy(page: Page, buildableId: string, quantity: number): Promise<void> {
  await page.locator(`.hud-build__list [data-buildable="${buildableId}"]`).click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(200);
}

/**
 * Polls the Build panel's queue readout until it says nothing is left, and
 * answers the page-clock time at which it said so.
 */
async function waitForQueueEmpty(page: Page, timeoutMs = 240_000): Promise<number> {
  const started = Date.now();
  await tab(page, 'build').click();
  for (;;) {
    const text = await panelText(page, '.hud-build__queue');
    if (/0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) {
      return Date.now() - started;
    }
    if (Date.now() - started > timeoutMs) throw new Error(`the build queue never emptied: ${text}`);
    await page.waitForTimeout(1000);
  }
}

/** Runs the clock forward until the worker reports a tick at or past `target`. */
async function runUntilTick(page: Page, target: number, timeoutMs = 180_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= target) return;
    if (Date.now() - started > timeoutMs) throw new Error(`stuck at tick ${tick}, wanted ${target}`);
    await page.waitForTimeout(1000);
  }
}

async function fastForwardToMax(page: Page): Promise<void> {
  // 1 -> 2 -> 4. Two presses from a paused/1x clock.
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(200);
}

interface PrisonOptions {
  readonly beds: number;
  readonly admits: number;
  readonly guards: number;
  readonly label: string;
}

/**
 * Builds an enclosed 6x6 cell at tiles (12,12)-(17,17) with `beds` beds and
 * one toilet, with the mouse, then admits `admits` prisoners.
 */
async function buildAndPopulate(page: Page, options: PrisonOptions): Promise<{ originX: number; originY: number }> {
  const log = (line: string) => console.log(`[${options.label}] ${line}`);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // Materials. 24 wall segments = 48 bricks, +1 for the toilet.
  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', options.beds + 2);
  log(`after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await fastForwardToMax(page);
  await page.waitForTimeout(3000);
  log(`clock after two Fast forward presses: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);
  log(`deliveries after running: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  // Four wall runs around tiles 12..17.
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    const produced = (await sentCommands(page)).slice(before);
    log(`wall run ${run.name}: ${produced.length} command(s) -> ${JSON.stringify(produced.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  }
  log(`queue right after the wall runs (tick ${await currentTick(page)}): ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // Wait for the Build panel to say every wall is up, the way a player does.
  const queueEmptyAt = await waitForQueueEmpty(page);
  log(`Build panel says the queue is empty at page t=${queueEmptyAt}ms, tick ${await currentTick(page)}`);

  // Zone it -- retrying, because the Rooms panel's enclosure verdict is read
  // off a world view a *snapshot* replaces and a completed wall does not mark
  // dirty (2026-08-29-playtest-ordering-and-the-second-room.md §7). How many
  // attempts this takes is itself the measurement.
  const zoneStarted = Date.now();
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    const note = await panelText(page, '.hud-rooms');
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    log(
      `designate attempt ${attempts} at t+${Date.now() - zoneStarted}ms: rooms=${counts?.rooms}` +
        ` | panel said ${JSON.stringify(note.split('\n').filter((l) => /OPEN|ENCLOS/i.test(l)))}` +
        ` | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempts >= 12) throw new Error('the rectangle was never accepted as a room');
    await page.waitForTimeout(5000);
  }
  const zoned = await latestCounts(page);
  log(`zoned after ${attempts} attempt(s), ${Date.now() - zoneStarted}ms after the queue emptied: rooms=${zoned?.rooms} accommodationCapacity=${zoned?.accommodationCapacity}`);

  // Beds and a toilet, inside.
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  let placed = 0;
  for (const row of [12, 14]) {
    for (let column = 12; column <= 17 && placed < options.beds; column += 1) {
      const point = centreOf(origin, column, row);
      const commands = await press(page, point.x, point.y);
      if (commands.length === 0) log(`bed at (${column},${row}) produced NO command`);
      placed += 1;
    }
  }
  await armBuildable(page, 'toilet-brick');
  await press(page, centreOf(origin, 12, 16).x, centreOf(origin, 12, 16).y);
  log(`${placed} bed order(s) + 1 toilet placed`);

  await waitForQueueEmpty(page);
  await page.waitForTimeout(2000);
  const built = await latestCounts(page);
  log(`at tick ${built?.tick}: rooms=${built?.rooms} roomCapacity=${built?.roomCapacity} accommodationCapacity=${built?.accommodationCapacity}`);
  log(`queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  await tab(page, 'rooms').click();
  log(`rooms panel: ${await panelText(page, '.hud-rooms')}`);

  // Admit, from the Overview tab's Intake panel.
  await tab(page, 'overview').click();
  const admitMs: number[] = [];
  for (let index = 0; index < options.admits; index += 1) {
    const pressStarted = Date.now();
    await page.locator('.hud-intake__admit').click();
    admitMs.push(Date.now() - pressStarted);
    await page.waitForTimeout(150);
  }
  // How long each press *took*, which is how long Playwright had to wait for
  // the control to be actionable. A player pressing Admit twelve times pays
  // this twelve times.
  log(`admit press durations (ms): ${JSON.stringify(admitMs)}`);
  log(`admit control disabled attribute now: ${await page.locator('.hud-intake__admit').getAttribute('disabled')}`);
  await page.waitForTimeout(2000);
  log(`intake panel after ${options.admits} admissions: ${await panelText(page, '.hud-intake')}`);
  log(`no-place warning data: ${await page.locator('.hud-intake__no-place').getAttribute('data-without-place')}`);
  log(`status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  if (options.guards > 0) {
    await tab(page, 'security').click();
    // `staff-role.guard`, not `staff.guard`: the catalogue ids are
    // `staff-role.*` (`src/content/staff-role-catalog.ts:148`). The row is
    // clicked only if it is there -- the panel already selects Guard on
    // arrival, so a missing row must not stop the hire.
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    else log(`no [data-staff-role] rows: ${JSON.stringify(await panelText(page, '.hud-staff__list'))}`);
    log(`hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
    for (let index = 0; index < options.guards; index += 1) {
      await page.locator('.hud-staff__hire').click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1500);
    const hired = await latestCounts(page);
    log(`after hiring ${options.guards}: staff=${hired?.staff} dailyWageBill=${hired?.dailyWageBillMinorUnits} funds=${hired?.treasuryMinorUnits}`);
    log(`staff panel: ${await panelText(page, '.hud-staff')}`);
  }

  return origin;
}

function reportBoundary(label: string, series: readonly CountsSample[], boundaryTick: number): void {
  const before = [...series].filter((s) => s.tick < boundaryTick).pop();
  const after = series.find((s) => s.tick >= boundaryTick);
  console.log(`[${label}] === DAY BOUNDARY at tick ${boundaryTick} ===`);
  console.log(`[${label}] last sample before: ${JSON.stringify(before)}`);
  console.log(`[${label}] first sample at/after: ${JSON.stringify(after)}`);
  if (before !== undefined && after !== undefined) {
    console.log(
      `[${label}] treasury delta across the boundary = ${after.treasuryMinorUnits - before.treasuryMinorUnits}` +
        ` | accrual just before = ${before.stateIncomeAccruedTodayMinorUnits}` +
        ` | roster = ${after.prisoners} | residents = ${after.roomOccupants}`,
    );
  }
}

test.describe('playtest: what a day actually pays (#601)', () => {
  test('twelve on the roster, twelve beds', async ({ page }) => {
    test.setTimeout(900_000);
    const consoleLines: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      const text = m.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${m.type()}] ${text}`);
    });
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);

    await buildAndPopulate(page, { beds: 12, admits: 12, guards: 0, label: 'A/12-beds' });

    // The boundaries that come *after* the prison was populated, computed from
    // where the clock actually is rather than assumed to be day 1's.
    const populatedAt = await currentTick(page);
    console.log(`[A/12-beds] populated at tick ${populatedAt}`);
    for (let day = Math.floor(populatedAt / 2400) + 1; day <= Math.floor(populatedAt / 2400) + 2; day += 1) {
      const boundary = day * 2400 - 1;
      await runUntilTick(page, boundary + 60);
      reportBoundary('A/12-beds', await countsSeries(page), boundary);
    }

    const series = await countsSeries(page);
    console.log('[A/12-beds] === FULL SERIES (tick, roster, residents, capacity, accrued, treasury) ===');
    for (const s of series) {
      console.log(
        `[A/12-beds] t=${s.tick} roster=${s.prisoners} inIntake=${s.prisonersInIntake} highRisk=${s.prisonersHighRisk} residents=${s.roomOccupants} cap=${s.accommodationCapacity} accrued=${s.stateIncomeAccruedTodayMinorUnits} funds=${s.treasuryMinorUnits}`,
      );
    }
    console.log(`[A/12-beds] console: ${consoleLines.slice(0, 40).join('\n') || '(nothing)'}`);
  });

  test('twelve on the roster, three beds -- the brief’s prison', async ({ page }) => {
    test.setTimeout(900_000);
    const consoleLines: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      const text = m.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${m.type()}] ${text}`);
    });
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);

    await buildAndPopulate(page, { beds: 3, admits: 12, guards: 0, label: 'B/3-beds' });

    // The boundaries that come *after* the prison was populated, computed from
    // where the clock actually is rather than assumed to be day 1's.
    const populatedAt = await currentTick(page);
    console.log(`[B/3-beds] populated at tick ${populatedAt}`);
    for (let day = Math.floor(populatedAt / 2400) + 1; day <= Math.floor(populatedAt / 2400) + 2; day += 1) {
      const boundary = day * 2400 - 1;
      await runUntilTick(page, boundary + 60);
      reportBoundary('B/3-beds', await countsSeries(page), boundary);
    }

    const series = await countsSeries(page);
    console.log('[B/3-beds] === FULL SERIES ===');
    for (const s of series) {
      console.log(
        `[B/3-beds] t=${s.tick} roster=${s.prisoners} inIntake=${s.prisonersInIntake} highRisk=${s.prisonersHighRisk} residents=${s.roomOccupants} cap=${s.accommodationCapacity} accrued=${s.stateIncomeAccruedTodayMinorUnits} funds=${s.treasuryMinorUnits}`,
      );
    }
    console.log(`[B/3-beds] console: ${consoleLines.slice(0, 40).join('\n') || '(nothing)'}`);
  });

  test('three housed, three guards -- the other half of the loop', async ({ page }) => {
    test.setTimeout(900_000);
    const consoleLines: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      const text = m.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${m.type()}] ${text}`);
    });
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);

    await buildAndPopulate(page, { beds: 3, admits: 3, guards: 3, label: 'C/guards' });

    // The boundaries that come *after* the prison was populated, computed from
    // where the clock actually is rather than assumed to be day 1's.
    const populatedAt = await currentTick(page);
    console.log(`[C/guards] populated at tick ${populatedAt}`);
    for (let day = Math.floor(populatedAt / 2400) + 1; day <= Math.floor(populatedAt / 2400) + 2; day += 1) {
      const boundary = day * 2400 - 1;
      await runUntilTick(page, boundary + 60);
      reportBoundary('C/guards', await countsSeries(page), boundary);
    }

    const series = await countsSeries(page);
    console.log('[C/guards] === FULL SERIES ===');
    for (const s of series) {
      console.log(
        `[C/guards] t=${s.tick} roster=${s.prisoners} inIntake=${s.prisonersInIntake} highRisk=${s.prisonersHighRisk} residents=${s.roomOccupants} cap=${s.accommodationCapacity} accrued=${s.stateIncomeAccruedTodayMinorUnits} funds=${s.treasuryMinorUnits}`,
      );
    }
    console.log(`[C/guards] console: ${consoleLines.slice(0, 40).join('\n') || '(nothing)'}`);
  });
});

/**
 * Why a press takes two seconds: the in-flight gate, or click stability?
 *
 * The Intake panel's Admit control measured ~2.1 s per press across twelve
 * consecutive presses. Two candidates fit and they have opposite consequences
 * for a player, so this separates them on a control that needs no prison: the
 * Build panel's Buy submit goes through exactly the same `busy` set
 * (`src/ui/hud/hud.ts`), and a fresh session can press it immediately.
 *
 * It samples the button's `disabled` property and its `getBoundingClientRect`
 * every 25 ms from inside the page, so the answer is what the DOM did rather
 * than what the driver decided.
 */
test.describe('probe: what holds a command control between presses', () => {
  test('disabled, or unstable', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('1');

    await page.evaluate(() => {
      const samples: { t: number; disabled: boolean; x: number; y: number }[] = [];
      (window as unknown as { lockstateProbe: typeof samples }).lockstateProbe = samples;
      const start = performance.now();
      const tick = (): void => {
        const node = document.querySelector<HTMLButtonElement>('.hud-build__buy-submit');
        if (node !== null) {
          const box = node.getBoundingClientRect();
          samples.push({ t: Math.round(performance.now() - start), disabled: node.disabled, x: Math.round(box.x), y: Math.round(box.y) });
        }
        if (performance.now() - start < 60_000) setTimeout(tick, 25);
      };
      tick();
    });

    const durations: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const started = Date.now();
      await page.locator('.hud-build__buy-submit').click();
      durations.push(Date.now() - started);
      await page.waitForTimeout(120);
    }
    console.log(`[probe] buy press durations (ms): ${JSON.stringify(durations)}`);

    const summary = await page.evaluate(() => {
      const samples = (window as unknown as { lockstateProbe: { t: number; disabled: boolean; x: number; y: number }[] }).lockstateProbe;
      const runs: { from: number; to: number }[] = [];
      let open: number | undefined;
      for (const sample of samples) {
        if (sample.disabled && open === undefined) open = sample.t;
        if (!sample.disabled && open !== undefined) {
          runs.push({ from: open, to: sample.t });
          open = undefined;
        }
      }
      if (open !== undefined) runs.push({ from: open, to: samples[samples.length - 1]!.t });
      const positions = [...new Set(samples.map((s) => `${s.x},${s.y}`))];
      return { sampleCount: samples.length, disabledRuns: runs, distinctPositions: positions };
    });
    console.log(`[probe] samples=${summary.sampleCount}`);
    console.log(`[probe] intervals the control was disabled (ms): ${JSON.stringify(summary.disabledRuns)}`);
    console.log(`[probe] distinct button positions seen: ${JSON.stringify(summary.distinctPositions)}`);
  });
});

/**
 * The recovery path a mis-drag needs, with the mouse.
 *
 * `docs/research/README.md` records that a stray room drag was once
 * unrecoverable for the whole session and that #312 fixed it with `UnzoneRoom`.
 * No playtest has exercised the fix by dragging. This one does, and then takes
 * a placed object back out with the Build panel's Remove.
 */
test.describe('playtest: taking it back', () => {
  test('remove a room and remove an object, by dragging', async ({ page }) => {
    test.setTimeout(600_000);
    const consoleLines: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'debug') return;
      const text = m.text();
      if (text.startsWith('%cPhaser') || text.includes('WebGL')) return;
      consoleLines.push(`[${m.type()}] ${text}`);
    });
    page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await installTee(page);
    await openApp(page);

    const origin = await buildAndPopulate(page, { beds: 1, admits: 0, guards: 0, label: 'D/remove' });
    const log = (line: string) => console.log(`[D/remove] ${line}`);
    log(`before removal: ${JSON.stringify(await latestCounts(page))}`);

    // ---- take the room back out, by dragging across it -----------------
    await tab(page, 'rooms').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    log(`remove control label: ${JSON.stringify((await page.locator('.hud-rooms__remove').innerText()).trim())}`);
    await page.locator('.hud-rooms__remove').click();
    log(`panel in remove mode: ${JSON.stringify((await panelText(page, '.hud-rooms')).split('\n').slice(0, 8))}`);
    await drag(page, centreOf(origin, 13, 13), centreOf(origin, 15, 15));
    const pending = await panelText(page, '.hud-rooms');
    log(`panel with a removal pending: ${JSON.stringify(pending.split('\n').slice(0, 10))}`);
    const confirm = page.locator('.hud-rooms__confirm');
    log(`confirm reads: ${JSON.stringify((await confirm.innerText()).trim())} enabled=${await confirm.isEnabled()}`);
    await confirm.click();
    await page.waitForTimeout(1500);
    log(`after removal: ${JSON.stringify(await latestCounts(page))}`);
    log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

    // ---- put it back ----------------------------------------------------
    const again = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (again === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    const removeLabel = (await page.locator('.hud-rooms__remove').innerText()).trim().toLowerCase();
    if (removeLabel.startsWith('stop')) await page.locator('.hud-rooms__remove').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1500);
    log(`after re-zoning: ${JSON.stringify(await latestCounts(page))}`);

    // ---- take the bed back out ------------------------------------------
    await tab(page, 'build').click();
    await page.locator('.hud-build__remove').click();
    log(`build remove hint: ${JSON.stringify(await panelText(page, '.hud-build'))}`);
    const bed = centreOf(origin, 12, 12);
    log(`remove press at the bed tile: ${JSON.stringify(await press(page, bed.x, bed.y))}`);
    await page.waitForTimeout(1500);
    log(`after removing the bed: ${JSON.stringify(await latestCounts(page))}`);
    log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    console.log(`[D/remove] console: ${consoleLines.slice(0, 40).join('\n') || '(nothing)'}`);
  });
});
