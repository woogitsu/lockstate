import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  armBuildable,
  calibrate,
  centreOf,
  currentTick,
  drag,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  sentCommands,
  tab,
  TILE,
} from './playtest-harness';

/**
 * **Does building feel good?** A player's pass over the act of building things
 * and paying for them.
 *
 * NOT A GATE. `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, so nothing in CI collects this file. Run it:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5391 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-does-building-feel-good.playtest.ts
 * ```
 *
 * `git lfs checkout` first in a worktree, or the atlases fail to decode and
 * every actor is missing while the run still passes.
 *
 * Findings: `docs/research/2026-09-03-does-building-feel-good.md`.
 */

const SHOTS = process.env['PLAYTEST_SHOT_DIR'] ?? '/tmp/shots';

const note = (line: string): void => {
  console.log(line);
};

/** Every press a player would have to make, counted and narrated. */
class Presses {
  private count = 0;
  private readonly ledger: string[] = [];

  public constructor(private readonly label: string) {}

  public async click(target: Locator, why: string): Promise<void> {
    this.count += 1;
    this.ledger.push(`${String(this.count).padStart(3)} click  ${why}`);
    note(`[${this.label}] press ${this.count}: ${why}`);
    await target.click();
  }

  public async fill(target: Locator, value: string, why: string): Promise<void> {
    // A number field a player has to type into is not one press. Counted as
    // one "interaction" but marked, so the report can say what it really is.
    this.count += 1;
    this.ledger.push(`${String(this.count).padStart(3)} type   ${why} = ${value}`);
    note(`[${this.label}] press ${this.count}: TYPE ${why} = ${value}`);
    await target.fill(value);
  }

  public async drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }, why: string): Promise<void> {
    this.count += 1;
    this.ledger.push(`${String(this.count).padStart(3)} drag   ${why}`);
    note(`[${this.label}] press ${this.count}: DRAG ${why}`);
    await drag(page, a, b);
  }

  public async press(page: Page, x: number, y: number, why: string): Promise<readonly Record<string, unknown>[]> {
    this.count += 1;
    this.ledger.push(`${String(this.count).padStart(3)} world  ${why}`);
    note(`[${this.label}] press ${this.count}: WORLD ${why}`);
    return press(page, x, y);
  }

  public get total(): number {
    return this.count;
  }

  public report(): void {
    note(`[${this.label}] ===== ${this.count} interactions =====`);
    for (const line of this.ledger) note(`[${this.label}]   ${line}`);
  }
}

interface Sample {
  readonly ms: number;
  readonly tick: number;
  readonly funds: string;
  readonly treasury: number;
  readonly queue: string;
  readonly deliveries: string;
  readonly refusal: string;
}

async function sample(page: Page, startedAt: number): Promise<Sample> {
  const [funds, queue, deliveries, refusal] = await Promise.all([
    page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-metric="funds"] .ui-stat__value');
      return node === null ? 'ABSENT' : (node.textContent ?? '').trim();
    }),
    panelText(page, '.hud-build__queue'),
    panelText(page, '.hud-build__deliveries'),
    panelText(page, '.hud__refusal'),
  ]);
  const counts = await latestCounts(page);
  return {
    ms: Date.now() - startedAt,
    tick: await currentTick(page),
    funds,
    treasury: counts?.treasuryMinorUnits ?? -1,
    queue: queue.replace(/\n/g, ' / '),
    deliveries: deliveries.replace(/\n/g, ' / '),
    refusal: refusal.replace(/\n/g, ' / '),
  };
}

/** Polls, logging only when something a player could see actually changed. */
async function watch(page: Page, startedAt: number, label: string, forMs: number, everyMs = 400): Promise<readonly Sample[]> {
  const out: Sample[] = [];
  let last = '';
  const until = Date.now() + forMs;
  while (Date.now() < until) {
    const s = await sample(page, startedAt);
    const key = `${s.funds}|${s.queue}|${s.deliveries}|${s.refusal}`;
    if (key !== last) {
      note(
        `[${label}] t+${s.ms}ms tick=${s.tick} FUNDS=${s.funds} treasury=${s.treasury}` +
          ` | queue: ${s.queue}` +
          ` | deliveries: ${s.deliveries}` +
          ` | band: ${s.refusal}`,
      );
      last = key;
      out.push(s);
    }
    await page.waitForTimeout(everyMs);
  }
  return out;
}

const transport = (page: Page, which: 'pause' | 'play' | 'fast') =>
  page.locator('.hud-strip__transport button').nth(which === 'pause' ? 0 : which === 'play' ? 1 : 2);

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  note(`[shot] ${name}.png`);
}

async function openCoordinates(page: Page): Promise<Locator> {
  const header = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
  return header;
}

/** The reliable route: type the tile, press Place. Two fills + one click. */
async function placeAt(page: Page, buildableId: string, tx: number, ty: number, edge?: string): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.locator(`.hud-build__list [data-buildable="${buildableId}"]`).click();
  await openCoordinates(page);
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill(String(tx));
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill(String(ty));
  if (edge !== undefined) {
    const choice = page.locator(`.hud-build__coordinates [data-choice="${edge}"]`);
    if ((await choice.count()) > 0) await choice.click();
  }
  await page.locator('.hud-build__coordinates .ui-action').click();
  await page.waitForTimeout(120);
  return (await sentCommands(page)).slice(before);
}

/* ------------------------------------------------------------------ ACT A */

test('act A: arm a tool, draw a wall, and watch for the thing to exist (1x)', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();

  await shot(page, 'A01-arrival');
  note(`[A] arrival status strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  const presses = new Presses('A');
  await presses.click(page.getByRole('button', { name: 'New prison' }), 'New prison');
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await shot(page, 'A02-new-prison');

  await presses.click(tab(page, 'build'), 'Build tab');
  await shot(page, 'A03-build-panel-as-it-arrives');
  note(`[A] build panel as it arrives:\n${await panelText(page, '.hud-build')}`);

  const origin = await calibrate(page);
  note(`[A] world origin: (${origin.originX}, ${origin.originY}) -- tile (0,0) top-left`);

  // The naive act: arm the wall tool and draw. No shopping trip first.
  await presses.click(page.locator('.hud-build__list [data-buildable="wall-brick"]'), 'select Brick wall in the catalogue');
  note(`[A] arm control reads: ${JSON.stringify((await page.locator('.hud-build__arm').innerText()).trim())}`);
  await presses.click(page.locator('.hud-build__arm'), 'arm the tool');
  await shot(page, 'A04-armed');
  note(`[A] arm control now reads: ${JSON.stringify((await page.locator('.hud-build__arm').innerText()).trim())}`);
  note(`[A] target readout: ${JSON.stringify(await panelText(page, '.hud-build__target'))}`);

  const before = await sample(page, started);
  note(`[A] before the drag: ${JSON.stringify(before)}`);

  // A four-tile run through the middle of the canvas. Tiles are chosen from
  // the calibrated origin so they are genuinely on screen.
  const tileOf = (sx: number, sy: number) => ({
    tx: Math.floor((sx - origin.originX) / TILE),
    ty: Math.floor((sy - origin.originY) / TILE),
  });
  const a = { x: 620, y: 420 };
  const b = { x: 620 + 4 * TILE, y: 420 };
  note(`[A] dragging screen ${JSON.stringify(a)} -> ${JSON.stringify(b)} = tiles ${JSON.stringify(tileOf(a.x, a.y))} -> ${JSON.stringify(tileOf(b.x, b.y))}`);
  const cmdBefore = (await sentCommands(page)).length;
  await presses.drag(page, a, b, 'draw a 4-tile wall run through the middle of the canvas');
  const produced = (await sentCommands(page)).slice(cmdBefore);
  note(`[A] the drag produced ${produced.length} command(s): ${JSON.stringify(produced)}`);
  await shot(page, 'A05-just-after-the-drag');
  note(`[A] immediately after the drag: ${JSON.stringify(await sample(page, started))}`);

  // Paused clock: what does the game say before anything can happen?
  note('[A] --- the clock is still paused. What does the panel say? ---');
  await watch(page, started, 'A-paused', 3000, 500);
  note(`[A] build panel while paused:\n${await panelText(page, '.hud-build')}`);
  await shot(page, 'A06-paused-with-orders');

  // 1x. Not 4x: this act is about pacing.
  await presses.click(transport(page, 'play'), 'Play (1x)');
  note('[A] --- clock at 1x. Watching for money, materials and walls. ---');
  const timeline = await watch(page, started, 'A-1x', 90_000, 400);
  await shot(page, 'A07-after-90s-at-1x');
  note(`[A] build panel after 90s at 1x:\n${await panelText(page, '.hud-build')}`);
  note(`[A] timeline had ${timeline.length} visible changes in 90s`);

  await transport(page, 'pause').click();
  await page.waitForTimeout(500);
  note(`[A] paused. final: ${JSON.stringify(await sample(page, started))}`);
  presses.report();
});

/* ------------------------------------------------------------------ ACT B */

test('act B: how many presses is one cell with a bed and a toilet', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();
  const presses = new Presses('B');

  await presses.click(page.getByRole('button', { name: 'New prison' }), 'New prison');
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await presses.click(tab(page, 'build'), 'Build tab');
  const origin = await calibrate(page);
  note(`[B] origin (${origin.originX}, ${origin.originY})`);

  // A 4x4 cell: tiles (6,6)-(9,9). Perimeter drawn with the reliable route
  // where the mouse cannot be trusted, so the count is honest about what a
  // player would actually have to do. Both routes are counted below.
  //
  // First: try the mouse, because that is what a player does.
  await presses.click(page.locator('.hud-build__list [data-buildable="wall-brick"]'), 'select Brick wall');
  await presses.click(page.locator('.hud-build__arm'), 'arm');

  const west = origin.originX + 6 * TILE;
  const east = origin.originX + 10 * TILE;
  const north = origin.originY + 6 * TILE;
  const south = origin.originY + 10 * TILE;
  const runs = [
    { name: 'north', a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
    { name: 'south', a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
    { name: 'west', a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
    { name: 'east', a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
  ];
  let mouseCommands = 0;
  for (const run of runs) {
    const before = (await sentCommands(page)).length;
    await presses.drag(page, run.a, run.b, `wall run ${run.name} (4 segments wanted)`);
    const got = (await sentCommands(page)).slice(before);
    mouseCommands += got.length;
    note(`[B] run ${run.name}: wanted 4 segments, got ${got.length} command(s) -> ${JSON.stringify(got.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
    note(`[B]   band after the run: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  }
  note(`[B] FOUR DRAGS WANTED 16 SEGMENTS AND PRODUCED ${mouseCommands}`);
  await shot(page, 'B01-after-four-drags');
  note(`[B] queue after the four drags: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // Now finish the perimeter by hand with the typed route, counting what it
  // costs. Which segments are missing is read off the tee.
  const submitted = new Set(
    (await sentCommands(page))
      .filter((c) => c['type'] === 'PlaceObject' || c['type'] === 'QueueBuildOrder' || c['edge'] !== undefined)
      .map((c) => `${String(c['x'])},${String(c['y'])},${String(c['edge'])}`),
  );
  note(`[B] segments the mouse actually submitted: ${JSON.stringify([...submitted])}`);

  const wanted: { tx: number; ty: number; edge: string }[] = [];
  for (let tx = 6; tx <= 9; tx += 1) {
    wanted.push({ tx, ty: 6, edge: 'north' });
    wanted.push({ tx, ty: 9, edge: 'south' });
  }
  for (let ty = 6; ty <= 9; ty += 1) {
    wanted.push({ tx: 6, ty, edge: 'west' });
    wanted.push({ tx: 9, ty, edge: 'east' });
  }
  let typed = 0;
  for (const seg of wanted) {
    if (submitted.has(`${seg.tx},${seg.ty},${seg.edge}`)) continue;
    await presses.click(page.locator('.hud-build__list [data-buildable="wall-brick"]'), `select Brick wall (for ${seg.tx},${seg.ty} ${seg.edge})`);
    await openCoordinates(page);
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile X' }), String(seg.tx), 'Tile X');
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile Y' }), String(seg.ty), 'Tile Y');
    await presses.click(page.locator(`.hud-build__coordinates [data-choice="${seg.edge}"]`), `edge ${seg.edge}`);
    await presses.click(page.locator('.hud-build__coordinates .ui-action'), 'Place order');
    typed += 1;
  }
  note(`[B] ${typed} segment(s) had to be typed in by hand after the mouse`);
  await shot(page, 'B02-perimeter-ordered');
  note(`[B] presses so far, perimeter only: ${presses.total}`);
  const perimeterPresses = presses.total;

  // Run the clock until the walls exist.
  await transport(page, 'fast').click();
  await transport(page, 'fast').click();
  note('[B] --- 4x while the perimeter builds ---');
  for (let i = 0; i < 60; i += 1) {
    const text = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out')) break;
    if (i % 10 === 0) note(`[B] queue: ${text.replace(/\n/g, ' / ')} at tick ${await currentTick(page)}`);
    await page.waitForTimeout(2000);
  }
  await transport(page, 'pause').click();
  await page.waitForTimeout(400);
  note(`[B] perimeter done at tick ${await currentTick(page)}: ${JSON.stringify(await sample(page, started))}`);
  await shot(page, 'B03-walls-up');

  // Zone it as a cell. Every press counted.
  await presses.click(tab(page, 'rooms'), 'Rooms tab');
  if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
    await presses.click(page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle'), 'expand the Rooms panel');
  }
  await shot(page, 'B04-rooms-panel');
  note(`[B] rooms panel as it arrives:\n${await panelText(page, '.hud-rooms')}`);
  await presses.click(page.locator('.hud-rooms__list [data-room="room.cell"]'), 'select Cell');
  await presses.click(page.locator('.hud-rooms__arm'), 'arm the zone tool');

  let attempts = 0;
  for (;;) {
    attempts += 1;
    await presses.drag(page, centreOf(origin, 6, 6), centreOf(origin, 9, 9), `zone drag attempt ${attempts}`);
    note(`[B] rooms panel after the drag:\n${await panelText(page, '.hud-rooms')}`);
    await presses.click(page.locator('.hud-rooms__confirm'), `confirm the room (attempt ${attempts})`);
    await page.waitForTimeout(900);
    const counts = await latestCounts(page);
    note(`[B] attempt ${attempts}: rooms=${counts?.rooms} band=${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempts >= 4) {
      note('[B] gave up zoning by mouse after 4 attempts');
      break;
    }
    // Re-arm, because the tool disarms on a refusal.
    await presses.click(page.locator('.hud-rooms__list [data-room="room.cell"]'), 're-select Cell');
    await presses.click(page.locator('.hud-rooms__arm'), 're-arm');
  }
  await shot(page, 'B05-zoned');
  note(`[B] presses through zoning: ${presses.total} (perimeter was ${perimeterPresses})`);
  const zonedPresses = presses.total;

  // A bed and a toilet, by pointer, inside the cell.
  await presses.click(tab(page, 'build'), 'Build tab');
  await presses.click(page.locator('.hud-build__list [data-buildable="bed-wooden"]'), 'select Wooden bed');
  note(`[B] bed arm control reads: ${JSON.stringify((await page.locator('.hud-build__arm').innerText()).trim())}`);
  await presses.click(page.locator('.hud-build__arm'), 'arm the bed');
  const bedPoint = centreOf(origin, 7, 7);
  const bedCmds = await presses.press(page, bedPoint.x, bedPoint.y, 'place the bed at (7,7)');
  note(`[B] bed press produced ${bedCmds.length} command(s): ${JSON.stringify(bedCmds)}`);
  if (bedCmds.length === 0) {
    note('[B] the bed press produced nothing; falling back to the typed route');
    await presses.click(page.locator('.hud-build__list [data-buildable="bed-wooden"]'), 'select Wooden bed (typed)');
    await openCoordinates(page);
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile X' }), '7', 'Tile X');
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile Y' }), '7', 'Tile Y');
    await presses.click(page.locator('.hud-build__coordinates .ui-action'), 'Place order');
  }
  await presses.click(page.locator('.hud-build__list [data-buildable="toilet-brick"]'), 'select Toilet');
  await presses.click(page.locator('.hud-build__arm'), 'arm the toilet');
  const wcPoint = centreOf(origin, 8, 8);
  const wcCmds = await presses.press(page, wcPoint.x, wcPoint.y, 'place the toilet at (8,8)');
  note(`[B] toilet press produced ${wcCmds.length} command(s): ${JSON.stringify(wcCmds)}`);
  if (wcCmds.length === 0) {
    note('[B] the toilet press produced nothing; falling back to the typed route');
    await presses.click(page.locator('.hud-build__list [data-buildable="toilet-brick"]'), 'select Toilet (typed)');
    await openCoordinates(page);
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile X' }), '8', 'Tile X');
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile Y' }), '8', 'Tile Y');
    await presses.click(page.locator('.hud-build__coordinates .ui-action'), 'Place order');
  }
  await shot(page, 'B06-furniture-ordered');

  await transport(page, 'fast').click();
  await transport(page, 'fast').click();
  for (let i = 0; i < 45; i += 1) {
    const text = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out')) break;
    await page.waitForTimeout(2000);
  }
  await transport(page, 'pause').click();
  await page.waitForTimeout(500);
  const done = await latestCounts(page);
  note(`[B] FINISHED at tick ${done?.tick}: rooms=${done?.rooms} roomCapacity=${done?.roomCapacity} accommodationCapacity=${done?.accommodationCapacity} treasury=${done?.treasuryMinorUnits}`);
  await shot(page, 'B07-finished-cell');
  note(`[B] rooms panel at the end:\n${await panelText(page, '.hud-rooms')}`);
  note(`[B] PRESS BUDGET: perimeter ${perimeterPresses}, through zoning ${zonedPresses}, total ${presses.total}`);
  presses.report();
});

/* ------------------------------------------------------------------ ACT C */

test('act C: can I tell what I can afford, before and after the limit', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  note(`[C] status strip on arrival: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  note(`[C] catalogue as a player reads it:\n${await panelText(page, '.hud-build__catalogue')}`);
  await shot(page, 'C01-catalogue');

  // Every buildable, with whatever the panel says about its price.
  const items = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud-build__list [data-buildable]')).map((node) => ({
      id: node.getAttribute('data-buildable') ?? '',
      text: (node as HTMLElement).innerText.replace(/\n/g, ' / '),
      disabled: node.matches('[disabled],[aria-disabled="true"]'),
    })),
  );
  note(`[C] catalogue rows: ${JSON.stringify(items, null, 1)}`);

  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const buyToggle = page.locator('.hud-build__buy-toggle');
  note(`[C] buy disclosure control reads: ${JSON.stringify((await buyToggle.innerText()).trim())}`);
  await buyToggle.click();
  await shot(page, 'C02-buy-open');
  note(`[C] buy row opened:\n${await panelText(page, '.hud-build__buy')}`);
  note(`[C] shortfall line at rest: ${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}`);

  const submit = page.locator('.hud-build__buy-submit');
  const qty = page.locator('.hud-build__buy .ui-number__input');

  // Walk the quantity up and see when the game admits the limit.
  for (const n of [1, 10, 100, 500, 1000, 2000, 5000, 10_000]) {
    await qty.fill(String(n));
    await page.waitForTimeout(250);
    note(
      `[C] qty=${n}: submit disabled=${await submit.getAttribute('disabled')}` +
        ` aria-disabled=${await submit.getAttribute('aria-disabled')}` +
        ` | label ${JSON.stringify((await submit.innerText()).trim())}` +
        ` | shortfall ${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}` +
        ` | funds ${JSON.stringify(await sample(page, started).then((s) => s.funds))}`,
    );
  }
  await shot(page, 'C03-unaffordable-quantity');

  // Now the real question: buy until the money is gone, in affordable steps,
  // and see whether the game warns before the wall or only at it.
  // 500 first, then 100s: six rounds of 100 is six minutes on a loaded box.
  await qty.fill('500');
  await submit.click();
  await page.waitForTimeout(600);
  note(`[C] one press of Buy 500 took funds to ${JSON.stringify((await sample(page, started)).funds)}`);
  await qty.fill('100');
  let round = 0;
  for (;;) {
    round += 1;
    const beforeSample = await sample(page, started);
    const disabledBefore = await submit.getAttribute('aria-disabled');
    if (disabledBefore === 'true') {
      note(`[C] round ${round}: Buy is disabled BEFORE the press. funds=${beforeSample.funds} shortfall=${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}`);
      break;
    }
    await submit.click();
    await page.waitForTimeout(600);
    const afterSample = await sample(page, started);
    note(
      `[C] round ${round}: bought 100 bricks. funds ${beforeSample.funds} -> ${afterSample.funds}` +
        ` (treasury ${beforeSample.treasury} -> ${afterSample.treasury})` +
        ` | shortfall ${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}` +
        ` | band ${JSON.stringify(afterSample.refusal)}`,
    );
    if (round > 40) {
      note('[C] gave up after 40 rounds');
      break;
    }
  }
  await shot(page, 'C04-at-the-limit');
  note(`[C] build panel at the limit:\n${await panelText(page, '.hud-build')}`);
  note(`[C] status strip at the limit: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  // What does the shortfall line say, and does it move with the quantity?
  for (const n of [1, 2, 5, 20, 100]) {
    await qty.fill(String(n));
    await page.waitForTimeout(250);
    note(`[C] at the limit, qty=${n}: aria-disabled=${await submit.getAttribute('aria-disabled')} shortfall=${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))} label=${JSON.stringify((await submit.innerText()).trim())}`);
  }
  await shot(page, 'C05-shortfall-line');

  // Overdraft: is there one, and does the game say so?
  const counts = await latestCounts(page);
  note(`[C] treasury now = ${counts?.treasuryMinorUnits}`);
  note(`[C] can I still queue a build order with no money? placing a wall by coordinates`);
  const cmds = await placeAt(page, 'wall-brick', 20, 20, 'north');
  note(`[C] the order produced ${cmds.length} command(s): ${JSON.stringify(cmds)}`);
  note(`[C] band after it: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  note(`[C] queue after it: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  await shot(page, 'C06-order-with-no-money');
});

/* ------------------------------------------------------------------ ACT D */

test('act D: are twelve queued orders legible, followable, cancellable', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();

  // Twelve orders, mixed kinds, clock paused so nothing completes underneath.
  const plan: { id: string; tx: number; ty: number; edge?: string }[] = [
    { id: 'wall-brick', tx: 6, ty: 6, edge: 'north' },
    { id: 'wall-brick', tx: 7, ty: 6, edge: 'north' },
    { id: 'wall-brick', tx: 8, ty: 6, edge: 'north' },
    { id: 'wall-brick', tx: 6, ty: 6, edge: 'west' },
    { id: 'wall-brick', tx: 6, ty: 7, edge: 'west' },
    { id: 'wall-brick', tx: 6, ty: 8, edge: 'west' },
    { id: 'bed-wooden', tx: 7, ty: 7 },
    { id: 'bed-wooden', tx: 8, ty: 7 },
    { id: 'bed-wooden', tx: 7, ty: 8 },
    { id: 'toilet-brick', tx: 8, ty: 8 },
    { id: 'toilet-brick', tx: 9, ty: 8 },
    { id: 'wall-brick', tx: 9, ty: 6, edge: 'east' },
  ];
  for (const [index, item] of plan.entries()) {
    const cmds = await placeAt(page, item.id, item.tx, item.ty, item.edge);
    note(`[D] order ${index + 1}: ${item.id} at (${item.tx},${item.ty})${item.edge ?? ''} -> ${cmds.length} command(s)`);
  }
  await page.waitForTimeout(1200);
  await shot(page, 'D01-twelve-queued');
  note(`[D] queue readout: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  note(`[D] the whole queue block as a player reads it:\n${await panelText(page, '.hud-build__queue')}`);

  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud-build__queue-row')).map((node, index) => {
      const el = node as HTMLElement;
      const box = el.getBoundingClientRect();
      const button = el.querySelector('button');
      return {
        index,
        order: el.getAttribute('data-order') ?? '',
        hidden: el.hidden || el.getClientRects().length === 0,
        text: el.innerText.replace(/\n/g, ' / '),
        y: Math.round(box.top),
        height: Math.round(box.height),
        button: button === null ? null : (button as HTMLElement).innerText.trim(),
        buttonBox: button === null ? null : (() => { const b = (button as HTMLElement).getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) }; })(),
      };
    }),
  );
  note(`[D] ${rows.length} row element(s), ${rows.filter((r) => !r.hidden).length} laid out:`);
  for (const row of rows) note(`[D]   ${JSON.stringify(row)}`);
  note(`[D] "more" line: ${JSON.stringify(await panelText(page, '.hud-build__queue-more'))}`);

  // Can I find one specific order? Try to cancel the SECOND bed.
  const visible = rows.filter((r) => !r.hidden);
  const target = visible.find((r) => /bed/i.test(r.text) && visible.filter((v) => /bed/i.test(v.text)).indexOf(r) === 1);
  note(`[D] rows mentioning a bed: ${JSON.stringify(visible.filter((r) => /bed/i.test(r.text)).map((r) => r.text))}`);
  if (target === undefined) {
    note('[D] COULD NOT IDENTIFY "the second bed" from the visible rows at all');
  } else {
    note(`[D] aiming at ${JSON.stringify(target)}`);
    const before = (await sentCommands(page)).length;
    if (target.buttonBox !== null) {
      await page.mouse.click(target.buttonBox.x, target.buttonBox.y);
      await page.waitForTimeout(500);
    }
    const got = (await sentCommands(page)).slice(before);
    note(`[D] the press submitted: ${JSON.stringify(got)}`);
    note(`[D] did it cancel the order the row named (${target.order})? ${JSON.stringify(got.map((c) => c['orderId'] ?? c['id'] ?? c))}`);
  }
  await shot(page, 'D02-after-a-cancel');
  note(`[D] queue after the cancel: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  note(`[D] funds after the cancel: ${JSON.stringify((await sample(page, started)).funds)}`);
  note(`[D] band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

  // And what does the panel look like scrolled? Is the whole queue reachable?
  const metrics = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.hud-build__queue-list');
    const panelBody = document.querySelector<HTMLElement>('.hud-build > .ui-panel__body');
    return {
      list: list === null ? null : { scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, overflowY: getComputedStyle(list).overflowY },
      panel: panelBody === null ? null : { scrollHeight: panelBody.scrollHeight, clientHeight: panelBody.clientHeight, overflowY: getComputedStyle(panelBody).overflowY },
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });
  note(`[D] scroll metrics: ${JSON.stringify(metrics)}`);
});

/* ------------------------------------------------------------------ ACT E */

test('act E: what a drag under the HUD feels like', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  await armBuildable(page, 'wall-brick');

  const islands = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud, .hud-strip, .hud__tabs, .ui-panel, .save-panel'))
      .map((node) => {
        const el = node as HTMLElement;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return null;
        return { cls: el.className, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      })
      .filter((v) => v !== null),
  );
  note(`[E] HUD islands over the canvas: ${JSON.stringify(islands, null, 1)}`);
  await shot(page, 'E01-hud-islands');

  const runs = [
    { name: 'middle of the canvas, 4 tiles', a: { x: 620, y: 430 }, b: { x: 620 + 4 * TILE, y: 430 } },
    { name: 'left to right across the whole canvas', a: { x: 120, y: 430 }, b: { x: 1320, y: 430 } },
    { name: 'top edge', a: { x: 400, y: 90 }, b: { x: 400 + 4 * TILE, y: 90 } },
    { name: 'down the left side', a: { x: 200, y: 200 }, b: { x: 200, y: 200 + 4 * TILE } },
    { name: 'toward the right-hand panel', a: { x: 900, y: 500 }, b: { x: 1300, y: 500 } },
    { name: 'bottom of the canvas', a: { x: 500, y: 820 }, b: { x: 500 + 4 * TILE, y: 820 } },
  ];
  for (const run of runs) {
    const wanted = Math.round(Math.max(Math.abs(run.b.x - run.a.x), Math.abs(run.b.y - run.a.y)) / TILE) + 1;
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    const got = (await sentCommands(page)).slice(before);
    note(
      `[E] ${run.name}: wanted ~${wanted} segments, got ${got.length}` +
        ` | band said ${JSON.stringify(await panelText(page, '.hud__refusal'))}` +
        ` | queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`,
    );
    // Re-arm if the tool dropped.
    const label = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
    if (label.startsWith('place') || label.startsWith('draw')) {
      note('[E]   (the tool had disarmed; re-arming)');
      await page.locator('.hud-build__arm').click();
    }
  }
  await shot(page, 'E02-after-the-runs');
});
