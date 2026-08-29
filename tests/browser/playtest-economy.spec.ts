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
 * `docs/research/2026-08-30-economy-and-mouse-playtest.md`.
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

async function currentTick(page: Page): Promise<number> {
  return (await latestCounts(page))?.tick ?? -1;
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
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.waitForTimeout(200);
}

interface PrisonOptions {
  readonly beds: number;
  readonly admits: number;
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

  await page.getByRole('button', { name: 'Build' }).click();
  const origin = await calibrate(page);
  log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // Materials. 24 wall segments = 48 bricks, +1 for the toilet.
  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', options.beds + 2);
  log(`after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await fastForwardToMax(page);
  await page.waitForTimeout(3000);
  log(`deliveries after running: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  // Four wall runs around tiles 12..17.
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  await drag(page, { x: westX + TILE / 2, y: northY }, { x: eastX - TILE / 2, y: northY });
  await drag(page, { x: westX + TILE / 2, y: southY }, { x: eastX - TILE / 2, y: southY });
  await drag(page, { x: westX, y: northY + TILE / 2 }, { x: westX, y: southY - TILE / 2 });
  await drag(page, { x: eastX, y: northY + TILE / 2 }, { x: eastX, y: southY - TILE / 2 });
  log(`queue right after the wall runs: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // 24 walls x 50 work at 10 per scheduled tick, one order at a time = 1,200 ticks.
  await runUntilTick(page, 1400);
  log(`queue at tick ${await currentTick(page)}: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // Zone it.
  await page.getByRole('button', { name: 'Rooms' }).click();
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  await page.locator('.hud-rooms__arm').click();
  await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(600);
  const zoned = await latestCounts(page);
  log(`after zoning: rooms=${zoned?.rooms} accommodationCapacity=${zoned?.accommodationCapacity}`);
  log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

  // Beds and a toilet, inside.
  await page.getByRole('button', { name: 'Build' }).click();
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

  // 13 objects x 30 work = 390 ticks, plus whatever wall work is left.
  await runUntilTick(page, 2100);
  const built = await latestCounts(page);
  log(`at tick ${built?.tick}: rooms=${built?.rooms} roomCapacity=${built?.roomCapacity} accommodationCapacity=${built?.accommodationCapacity}`);
  log(`queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  await page.getByRole('button', { name: 'Rooms' }).click();
  log(`rooms panel: ${await panelText(page, '.hud-rooms')}`);

  // Admit, from the Overview tab's Intake panel.
  await page.getByRole('button', { name: 'Overview' }).click();
  for (let index = 0; index < options.admits; index += 1) {
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2000);
  log(`intake panel after ${options.admits} admissions: ${await panelText(page, '.hud-intake')}`);
  log(`no-place warning data: ${await page.locator('.hud-intake__no-place').getAttribute('data-without-place')}`);
  log(`status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

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

    await buildAndPopulate(page, { beds: 12, admits: 12, label: 'A/12-beds' });

    await runUntilTick(page, 2450);
    reportBoundary('A/12-beds', await countsSeries(page), 2399);
    await runUntilTick(page, 4850);
    reportBoundary('A/12-beds', await countsSeries(page), 4799);

    const series = await countsSeries(page);
    console.log('[A/12-beds] === FULL SERIES (tick, roster, residents, capacity, accrued, treasury) ===');
    for (const s of series) {
      console.log(
        `[A/12-beds] t=${s.tick} roster=${s.prisoners} inIntake=${s.prisonersInIntake} residents=${s.roomOccupants} cap=${s.accommodationCapacity} accrued=${s.stateIncomeAccruedTodayMinorUnits} funds=${s.treasuryMinorUnits}`,
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

    await buildAndPopulate(page, { beds: 3, admits: 12, label: 'B/3-beds' });

    await runUntilTick(page, 2450);
    reportBoundary('B/3-beds', await countsSeries(page), 2399);
    await runUntilTick(page, 4850);
    reportBoundary('B/3-beds', await countsSeries(page), 4799);

    const series = await countsSeries(page);
    console.log('[B/3-beds] === FULL SERIES ===');
    for (const s of series) {
      console.log(
        `[B/3-beds] t=${s.tick} roster=${s.prisoners} inIntake=${s.prisonersInIntake} residents=${s.roomOccupants} cap=${s.accommodationCapacity} accrued=${s.stateIncomeAccruedTodayMinorUnits} funds=${s.treasuryMinorUnits}`,
      );
    }
    console.log(`[B/3-beds] console: ${consoleLines.slice(0, 40).join('\n') || '(nothing)'}`);
  });
});
