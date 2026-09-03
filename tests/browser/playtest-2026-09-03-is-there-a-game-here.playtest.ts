/**
 * "Is there a game here?" -- a playtest that starts where the
 * first-twenty-minutes pass stops.
 *
 * **Not a CI gate.** `tests/browser/playwright.config.ts` collects only
 * `*.spec.ts`, so nothing in CI runs this file; it is collected by
 * `tests/browser/playwright.playtest.config.ts` and run by hand. Its console
 * output is the deliverable, and the findings live in
 * `docs/research/2026-09-03-is-there-a-game-here.md`.
 *
 * It builds a *working* prison -- nine rooms, twelve beds, a kitchen, a
 * canteen, a shower room, a laundry, a common room, a yard, a delivery bay and
 * a store -- through the **typed coordinate route**, because issue #878
 * records that a drag passing under a HUD island is silently truncated. Then it
 * admits twenty prisoners, hires guards, and runs the prison for as long as the
 * harness allows while sampling on a schedule, to answer one question: how long
 * can a player look away before the game needs them?
 */
import { expect, test, type Page } from '@playwright/test';
import {
  calibrate,
  currentClock,
  currentTick,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  sentCommands,
  tab,
  TILE,
  waitForQueueEmpty,
} from './playtest-harness.ts';

const LABEL = 'game';
const log = (line: string) => console.log(`[${LABEL}] ${line}`);

let presses = 0;
const pressCounter = new Map<string, number>();
function countPress(reason: string, n = 1): void {
  presses += n;
  pressCounter.set(reason, (pressCounter.get(reason) ?? 0) + n);
}
function pressReport(): string {
  return `${presses} presses: ${JSON.stringify([...pressCounter].sort((a, b) => b[1] - a[1]))}`;
}

async function click(page: Page, selector: string, reason: string): Promise<void> {
  await page.locator(selector).first().click();
  countPress(reason);
}
async function fill(page: Page, selector: string, value: string, reason: string): Promise<void> {
  await page.locator(selector).first().fill(value);
  countPress(reason);
}

// ---- the typed build route ------------------------------------------------

let selectedBuildable = '';
let selectedEdge = '';

async function openBuildCoordinates(page: Page): Promise<void> {
  await click(page, '.hud__tabs [data-tab="build"]', 'tab:build');
  const section = page.locator('.hud-build__coordinates');
  if ((await section.getAttribute('data-collapsed')) === 'true') {
    await click(page, '.hud-build__coordinates > .ui-section__header', 'open build coords');
  }
  await expect(section).toHaveAttribute('data-collapsed', 'false');
}

async function order(
  page: Page,
  buildableId: string,
  x: number,
  y: number,
  edge?: 'north' | 'west',
): Promise<number> {
  const before = (await sentCommands(page)).length;
  if (selectedBuildable !== buildableId) {
    await click(page, `.hud-build__list [data-buildable="${buildableId}"]`, 'select buildable');
    selectedBuildable = buildableId;
    selectedEdge = '';
  }
  const fields = page.locator('.hud-build__coords .ui-number__input');
  await fields.nth(0).fill(String(x));
  countPress('type tile x');
  await fields.nth(1).fill(String(y));
  countPress('type tile y');
  if (edge !== undefined && selectedEdge !== edge) {
    await click(page, `.hud-build__coordinates [data-choice="${edge}"]`, 'choose edge');
    selectedEdge = edge;
  }
  await click(page, '.hud-build__coordinates .ui-action', 'place order');
  return (await sentCommands(page)).length - before;
}

async function buy(page: Page, buildableId: string, quantity: number): Promise<void> {
  await click(page, `.hud-build__list [data-buildable="${buildableId}"]`, 'select buildable');
  selectedBuildable = buildableId;
  selectedEdge = '';
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await click(page, '.hud-build__buy-toggle', 'open buy fold');
  await fill(page, '.hud-build__buy .ui-number__input', String(quantity), 'type quantity');
  await click(page, '.hud-build__buy-submit', 'buy');
  await page.waitForTimeout(250);
}

async function zone(
  page: Page,
  roomId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<{ status: string; rooms: number; refusal: string }> {
  await click(page, '.hud__tabs [data-tab="rooms"]', 'tab:rooms');
  const panel = page.locator('.hud-rooms');
  if ((await panel.getAttribute('data-collapsed')) === 'true') {
    await click(page, '.hud-rooms > .ui-panel__header > .ui-panel__toggle', 'expand rooms panel');
  }
  await click(page, `.hud-rooms__list [data-room="${roomId}"]`, 'select room type');
  const section = page.locator('.hud-rooms__coordinates');
  if ((await section.getAttribute('data-collapsed')) === 'true') {
    await click(page, '.hud-rooms__coordinates > .ui-section__header', 'open rooms coords');
  }
  await fill(page, '.hud-rooms__coord-x .ui-number__input', String(x), 'type room x');
  await fill(page, '.hud-rooms__coord-y .ui-number__input', String(y), 'type room y');
  await fill(page, '.hud-rooms__coord-width .ui-number__input', String(width), 'type room width');
  await fill(page, '.hud-rooms__coord-height .ui-number__input', String(height), 'type room height');
  await click(page, '.hud-rooms__coordinates-submit', 'submit rectangle');
  await page.waitForTimeout(250);
  const status = (await panelText(page, '.hud-rooms__status')).replace(/\n/g, ' | ');
  const confirm = page.locator('.hud-rooms__confirm');
  if (await confirm.isVisible()) await click(page, '.hud-rooms__confirm', 'confirm room');
  await page.waitForTimeout(700);
  const counts = await latestCounts(page);
  return {
    status,
    rooms: counts?.rooms ?? -1,
    refusal: (await panelText(page, '.hud__refusal')).replace(/\n/g, ' '),
  };
}

// ---- the plan -------------------------------------------------------------

interface Box {
  readonly room: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The one segment of its perimeter that becomes a door instead of a wall. */
  readonly door: readonly [number, number, 'north' | 'west'];
}

const BOXES: readonly Box[] = [
  { room: 'room.cell', name: 'cell block', x: 5, y: 9, w: 6, h: 5, door: [11, 11, 'west'] },
  { room: 'room.canteen', name: 'canteen', x: 12, y: 9, w: 6, h: 6, door: [12, 11, 'west'] },
  { room: 'room.kitchen', name: 'kitchen', x: 19, y: 9, w: 4, h: 4, door: [19, 10, 'west'] },
  { room: 'room.shower-room', name: 'shower room', x: 19, y: 15, w: 3, h: 3, door: [19, 15, 'north'] },
  { room: 'room.laundry', name: 'laundry', x: 12, y: 17, w: 3, h: 3, door: [12, 17, 'north'] },
  { room: 'room.common-room', name: 'common room', x: 5, y: 16, w: 5, h: 5, door: [10, 18, 'west'] },
  { room: 'room.delivery-bay', name: 'delivery bay', x: 24, y: 9, w: 4, h: 4, door: [24, 10, 'west'] },
  { room: 'room.storage-room', name: 'store', x: 24, y: 15, w: 3, h: 3, door: [24, 16, 'west'] },
];

/** The yard is `outdoors`, so it gets no perimeter at all. 8x8 is its minimum. */
const YARD = { room: 'room.yard', name: 'yard', x: 16, y: 19, w: 8, h: 8 };

function perimeter(box: Box): readonly { x: number; y: number; edge: 'north' | 'west'; door: boolean }[] {
  const segments: { x: number; y: number; edge: 'north' | 'west'; door: boolean }[] = [];
  const isDoor = (x: number, y: number, edge: 'north' | 'west') =>
    box.door[0] === x && box.door[1] === y && box.door[2] === edge;
  for (let x = box.x; x < box.x + box.w; x += 1) {
    segments.push({ x, y: box.y, edge: 'north', door: isDoor(x, box.y, 'north') });
    segments.push({ x, y: box.y + box.h, edge: 'north', door: isDoor(x, box.y + box.h, 'north') });
  }
  for (let y = box.y; y < box.y + box.h; y += 1) {
    segments.push({ x: box.x, y, edge: 'west', door: isDoor(box.x, y, 'west') });
    segments.push({ x: box.x + box.w, y, edge: 'west', door: isDoor(box.x + box.w, y, 'west') });
  }
  return segments;
}

/** Every object, keyed by the room that must be zoned before it can be placed. */
const FURNITURE: readonly { room: string; id: string; x: number; y: number }[] = [
  // cell block: twelve beds and two toilets
  ...[5, 6, 7, 8, 9, 10].map((x) => ({ room: 'cell block', id: 'bed-wooden', x, y: 10 })),
  ...[5, 6, 7, 8, 9, 10].map((x) => ({ room: 'cell block', id: 'bed-wooden', x, y: 12 })),
  { room: 'cell block', id: 'toilet-brick', x: 5, y: 9 },
  { room: 'cell block', id: 'toilet-brick', x: 6, y: 9 },
  // canteen: two tables (3x2) and four benches (2x1)
  { room: 'canteen', id: 'dining-table-wooden', x: 12, y: 10 },
  { room: 'canteen', id: 'dining-table-wooden', x: 12, y: 12 },
  { room: 'canteen', id: 'bench-wooden', x: 16, y: 10 },
  { room: 'canteen', id: 'bench-wooden', x: 16, y: 12 },
  { room: 'canteen', id: 'bench-wooden', x: 16, y: 14 },
  { room: 'canteen', id: 'bench-wooden', x: 12, y: 14 },
  // kitchen
  { room: 'kitchen', id: 'stove-brick', x: 19, y: 9 },
  { room: 'kitchen', id: 'prep-counter-brick', x: 19, y: 10 },
  { room: 'kitchen', id: 'fridge-brick', x: 19, y: 11 },
  // shower room
  { room: 'shower room', id: 'shower-head-brick', x: 19, y: 15 },
  { room: 'shower room', id: 'shower-head-brick', x: 20, y: 15 },
  // laundry
  { room: 'laundry', id: 'washing-machine-brick', x: 12, y: 17 },
  { room: 'laundry', id: 'washing-machine-brick', x: 12, y: 18 },
  // common room
  { room: 'common room', id: 'bench-wooden', x: 5, y: 16 },
  { room: 'common room', id: 'bench-wooden', x: 7, y: 16 },
  { room: 'common room', id: 'bench-wooden', x: 5, y: 18 },
  // delivery bay + store
  { room: 'delivery bay', id: 'loading-dock-door-wooden', x: 24, y: 9 },
  { room: 'store', id: 'storage-rack-wooden', x: 24, y: 15 },
  { room: 'store', id: 'storage-rack-wooden', x: 25, y: 15 },
];

// ---- reading the game -----------------------------------------------------

const METRICS = ['prisoners', 'high-risk', 'staff', 'coverage', 'rooms', 'incidents', 'contraband', 'funds', 'earned-today'] as const;

interface Sample {
  readonly wallMs: number;
  readonly tick: number;
  readonly clock: string;
  readonly metrics: Record<string, string>;
  readonly alerts: string;
  readonly refusal: string;
  readonly roster: string;
  readonly rosterCount: string;
  readonly counts: unknown;
}

async function sample(page: Page, startedAt: number): Promise<Sample> {
  const metrics: Record<string, string> = {};
  for (const id of METRICS) {
    metrics[id] = (await panelText(page, `[data-metric="${id}"] .ui-stat__value`)).replace(/\n/g, ' ');
  }
  return {
    wallMs: Date.now() - startedAt,
    tick: await currentTick(page),
    clock: JSON.stringify(await currentClock(page)),
    metrics,
    alerts: (await panelText(page, '.hud-alerts__list')).replace(/\n/g, ' ; '),
    refusal: (await panelText(page, '.hud__refusal')).replace(/\n/g, ' '),
    roster: (await panelText(page, '.hud-regime__roster-list')).replace(/\n/g, ' ; '),
    rosterCount: (await panelText(page, '.hud-regime__roster-count')).replace(/\n/g, ' '),
    counts: await latestCounts(page),
  };
}

// ---- the run --------------------------------------------------------------

test('a prison that works, run until it asks for something', async ({ page }) => {
  test.setTimeout(3_600_000);
  const started = Date.now();
  const t = () => `t+${Math.round((Date.now() - started) / 1000)}s`;

  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  countPress('New prison');
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  const visX = [Math.ceil(-origin.originX / TILE), Math.floor((1440 - origin.originX) / TILE) - 1];
  const visY = [Math.ceil(-origin.originY / TILE), Math.floor((900 - origin.originY) / TILE) - 1];
  log(`ACT 0  calibration origin=(${origin.originX},${origin.originY}); the viewport shows tiles x ${visX[0]}..${visX[1]}, y ${visY[0]}..${visY[1]} = ${(visX[1] - visX[0] + 1) * (visY[1] - visY[0] + 1)} tiles`);

  // ---- ACT 1: buy the materials --------------------------------------
  const wallSegments = BOXES.flatMap((b) => perimeter(b));
  const wallCount = wallSegments.filter((s) => !s.door).length;
  const doorCount = wallSegments.filter((s) => s.door).length;
  const bricks = wallCount * 2 + 2 /* toilets */ + 2 /* shower heads */ + 2 + 2 + 1 /* stove/prep/fridge */ + 4 /* washers */;
  const planks = doorCount + 12 /* beds */ + 6 /* tables */ + 7 * 2 /* benches */ + 3 /* dock door */ + 2 /* racks */;
  log(`ACT 1  the plan: ${BOXES.length} walled rooms + 1 yard, ${wallCount} wall segments, ${doorCount} doors, ${FURNITURE.length} objects -> ${bricks} bricks + ${planks} planks`);
  log(`ACT 1  funds before buying: ${await panelText(page, '[data-metric="funds"] .ui-stat__value')}`);

  await buy(page, 'wall-brick', bricks);
  await buy(page, 'bed-wooden', planks);
  log(`ACT 1  funds after buying: ${await panelText(page, '[data-metric="funds"] .ui-stat__value')} | refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log(`ACT 1  ${pressReport()}`);

  await fastForwardToMax(page);
  log(`ACT 1  clock: ${JSON.stringify(await currentClock(page))}`);
  const tickA = await currentTick(page);
  await page.waitForTimeout(10_000);
  const tickB = await currentTick(page);
  log(`ACT 1  tick rate at 4x: ${((tickB - tickA) / 10).toFixed(1)} ticks per wall second (${tickA} -> ${tickB} over 10s)`);
  log(`ACT 1  deliveries: ${(await panelText(page, '.hud-build__deliveries')).replace(/\n/g, ' | ')}`);

  // ---- ACT 2: the walls, typed --------------------------------------
  await openBuildCoordinates(page);
  const wallsStarted = Date.now();
  const pressesBeforeWalls = presses;
  let commandsFromWalls = 0;
  for (const box of BOXES) {
    for (const segment of perimeter(box)) {
      commandsFromWalls += await order(
        page,
        segment.door ? 'door-wooden' : 'wall-brick',
        segment.x,
        segment.y,
        segment.edge,
      );
    }
  }
  log(`ACT 2  ${wallSegments.length} typed orders -> ${commandsFromWalls} commands, in ${Math.round((Date.now() - wallsStarted) / 1000)}s, ${presses - pressesBeforeWalls} presses`);
  log(`ACT 2  queue: ${(await panelText(page, '.hud-build__queue')).replace(/\n/g, ' | ')}`);
  log(`ACT 2  refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  await page.screenshot({ path: 'playtest-out/01-walls-ordered.png' });

  const emptyMs = await waitForQueueEmpty(page, 900_000);
  log(`ACT 2  ${t()} the Build panel says the queue is empty ${Math.round(emptyMs / 1000)}s after the last order, at tick ${await currentTick(page)}`);
  await page.screenshot({ path: 'playtest-out/02-walls-built.png' });

  // ---- ACT 3: zone the rooms ----------------------------------------
  const pressesBeforeZoning = presses;
  for (const box of BOXES) {
    let result = await zone(page, box.room, box.x, box.y, box.w, box.h);
    let attempts = 1;
    while (result.status.includes('OPEN') && attempts < 6) {
      await page.waitForTimeout(4000);
      result = await zone(page, box.room, box.x, box.y, box.w, box.h);
      attempts += 1;
    }
    log(`ACT 3  ${box.name} (${box.room}) ${box.w}x${box.h} at (${box.x},${box.y}): attempts=${attempts} rooms=${result.rooms} status=${JSON.stringify(result.status)} refusal=${JSON.stringify(result.refusal)}`);
  }
  const yard = await zone(page, YARD.room, YARD.x, YARD.y, YARD.w, YARD.h);
  log(`ACT 3  ${YARD.name} ${YARD.w}x${YARD.h} at (${YARD.x},${YARD.y}): rooms=${yard.rooms} status=${JSON.stringify(yard.status)} refusal=${JSON.stringify(yard.refusal)}`);
  log(`ACT 3  zoning nine rooms cost ${presses - pressesBeforeZoning} presses`);
  log(`ACT 3  rooms panel:\n${await panelText(page, '.hud-rooms')}`);

  // ---- ACT 4: furnish -----------------------------------------------
  await openBuildCoordinates(page);
  const pressesBeforeFurniture = presses;
  let placed = 0;
  let refusedObjects = 0;
  for (const item of FURNITURE) {
    const produced = await order(page, item.id, item.x, item.y);
    if (produced === 0) {
      refusedObjects += 1;
      log(`ACT 4  NO COMMAND for ${item.id} at (${item.x},${item.y}) in the ${item.room} — band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    } else placed += 1;
  }
  log(`ACT 4  ${placed}/${FURNITURE.length} objects ordered (${refusedObjects} produced nothing), ${presses - pressesBeforeFurniture} presses`);
  await waitForQueueEmpty(page, 900_000);
  await page.waitForTimeout(3000);
  log(`ACT 4  ${t()} furnished. counts=${JSON.stringify(await latestCounts(page))}`);
  await click(page, '.hud__tabs [data-tab="rooms"]', 'tab:rooms');
  log(`ACT 4  rooms panel:\n${await panelText(page, '.hud-rooms')}`);
  await page.screenshot({ path: 'playtest-out/03-furnished.png' });

  // ---- ACT 5: staff and prisoners -----------------------------------
  await click(page, '.hud__tabs [data-tab="security"]', 'tab:security');
  log(`ACT 5  staff panel before hiring:\n${await panelText(page, '.hud-staff')}`);
  const pressesBeforeHiring = presses;
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await click(page, '.hud-staff__list [data-staff-role="staff-role.guard"]', 'select role');
  for (let i = 0; i < 6; i += 1) {
    await click(page, '.hud-staff__hire', 'hire');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(2000);
  log(`ACT 5  after 6 guards: ${presses - pressesBeforeHiring} presses, counts=${JSON.stringify(await latestCounts(page))}`);
  log(`ACT 5  staff panel after hiring:\n${await panelText(page, '.hud-staff')}`);

  await click(page, '.hud__tabs [data-tab="overview"]', 'tab:overview');
  const pressesBeforeAdmit = presses;
  const admitMs: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    const at = Date.now();
    const admit = page.locator('.hud-intake__admit');
    if ((await admit.getAttribute('disabled')) !== null) {
      log(`ACT 5  Admit went disabled after ${i} admissions`);
      break;
    }
    await admit.click();
    countPress('admit');
    admitMs.push(Date.now() - at);
    await page.waitForTimeout(120);
  }
  log(`ACT 5  ${admitMs.length} admissions, ${presses - pressesBeforeAdmit} presses, per-press ms=${JSON.stringify(admitMs)}`);
  await page.waitForTimeout(4000);
  log(`ACT 5  intake panel:\n${await panelText(page, '.hud-intake')}`);
  log(`ACT 5  ${t()} counts=${JSON.stringify(await latestCounts(page))}`);
  log(`ACT 5  TOTAL TO BUILD AND POPULATE: ${pressReport()}`);
  await page.screenshot({ path: 'playtest-out/04-populated.png' });

  // ---- ACT 6: the long look-away ------------------------------------
  // Nothing is pressed from here on. Everything below is reading.
  await click(page, '.hud__tabs [data-tab="regime"]', 'tab:regime');
  const watchStarted = Date.now();
  const samples: Sample[] = [];
  const first = await sample(page, watchStarted);
  samples.push(first);
  log(`ACT 6  watch begins at tick ${first.tick}. metrics=${JSON.stringify(first.metrics)}`);
  log(`ACT 6  alerts at the start: ${JSON.stringify(first.alerts)}`);
  log(`ACT 6  roster at the start: ${JSON.stringify(first.roster)}`);

  const WATCH_MS = 1_500_000; // 25 minutes of wall clock at 4x
  const EVERY_MS = 20_000;
  let lastAlerts = first.alerts;
  const firstChanges = new Map<string, string>();
  while (Date.now() - watchStarted < WATCH_MS) {
    await page.waitForTimeout(EVERY_MS);
    const s = await sample(page, watchStarted);
    samples.push(s);
    if (s.alerts !== lastAlerts) {
      log(`ACT 6  ALERTS CHANGED at ${Math.round(s.wallMs / 1000)}s / tick ${s.tick}: ${JSON.stringify(s.alerts)}`);
      if (!firstChanges.has('alerts')) firstChanges.set('alerts', `${Math.round(s.wallMs / 1000)}s / tick ${s.tick}`);
      lastAlerts = s.alerts;
    }
    for (const id of METRICS) {
      if (s.metrics[id] !== first.metrics[id] && !firstChanges.has(`metric:${id}`)) {
        firstChanges.set(`metric:${id}`, `${Math.round(s.wallMs / 1000)}s / tick ${s.tick}: ${first.metrics[id]} -> ${s.metrics[id]}`);
        log(`ACT 6  metric ${id} first moved at ${Math.round(s.wallMs / 1000)}s / tick ${s.tick}: ${first.metrics[id]} -> ${s.metrics[id]}`);
      }
    }
    if (samples.length % 6 === 0) {
      log(`ACT 6  ${Math.round(s.wallMs / 1000)}s tick=${s.tick} day=${await panelText(page, '.hud-clock__day')} metrics=${JSON.stringify(s.metrics)}`);
      log(`ACT 6  ...roster=${JSON.stringify(s.roster)}`);
      log(`ACT 6  ...alerts=${JSON.stringify(s.alerts)} refusal=${JSON.stringify(s.refusal)}`);
    }
  }

  const last = samples[samples.length - 1]!;
  log(`ACT 7  watch ended after ${Math.round(last.wallMs / 1000)}s of wall clock, ticks ${first.tick} -> ${last.tick} (${((last.tick - first.tick) / 2400).toFixed(1)} in-game days)`);
  log(`ACT 7  first movement of each thing a player watches: ${JSON.stringify([...firstChanges], null, 1)}`);
  log(`ACT 7  metrics at the end: ${JSON.stringify(last.metrics)}`);
  log(`ACT 7  alerts at the end: ${JSON.stringify(last.alerts)}`);
  log(`ACT 7  refusal band at the end: ${JSON.stringify(last.refusal)}`);
  log(`ACT 7  roster at the end: ${JSON.stringify(last.roster)} (${last.rosterCount})`);

  // Every distinct activity the roster ever showed, and how often.
  const activityTally = new Map<string, number>();
  const needTally = new Map<string, number>();
  for (const s of samples) {
    for (const piece of s.roster.split(' ; ')) {
      const trimmed = piece.trim();
      if (trimmed.length === 0) continue;
      activityTally.set(trimmed, (activityTally.get(trimmed) ?? 0) + 1);
    }
    for (const m of s.roster.matchAll(/(Hunger|Sleep|Hygiene|Bladder|Safety|Recreation)/g)) {
      needTally.set(m[1]!, (needTally.get(m[1]!) ?? 0) + 1);
    }
  }
  log(`ACT 7  distinct roster lines over ${samples.length} samples: ${activityTally.size}`);
  log(`ACT 7  need names ever named in the roster: ${JSON.stringify([...needTally].sort((a, b) => b[1] - a[1]))}`);

  // Every panel, once, at the end -- what a returning player can read.
  for (const selector of ['.hud-strip', '.hud-alerts__list', '.hud-intake', '.hud-regime', '.hud-staff', '.hud-rooms', '.hud-build__queue', '.hud__refusal']) {
    await page.waitForTimeout(200);
    log(`ACT 7  ${selector}:\n${await panelText(page, selector)}`);
  }
  await page.screenshot({ path: 'playtest-out/05-after-the-long-run.png' });

  // And at 1x, to judge pacing at the speed a player actually watches.
  await click(page, '.hud-strip__transport button', 'pause');
  await page.waitForTimeout(500);
  log(`ACT 8  paused. clock=${JSON.stringify(await currentClock(page))} counts=${JSON.stringify(await latestCounts(page))}`);
  await page.screenshot({ path: 'playtest-out/06-paused.png' });
  log(`ACT 8  FINAL ${pressReport()}`);
});
