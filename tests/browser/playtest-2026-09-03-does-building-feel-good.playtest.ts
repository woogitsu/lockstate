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

  /*
   * A 4x4 cell on tiles **(13,11)-(16,14)**, and the tiles are the correction
   * this act needed most.
   *
   * It was written against (6,6)-(9,9). With the real world origin of
   * (-304, -574) that puts the room's north gridline at screen y = -190 and
   * its west gridline at x = 80 -- one off the top of the window, the other
   * under the minimap panel. Every mouse gesture in the act would have missed
   * the canvas, fallen through to the typed route, and reported a press count
   * that measured Playwright's aim rather than the game's.
   *
   * (13,11)-(16,14) spans screen x 528..784 and y 130..386, which is inside
   * the one rectangle of canvas that no HUD island covers at 1440x900:
   * roughly x 420..1160, y 90..430. The status strip takes the top ~82px, the
   * minimap and alerts take x 10..410 below y 430, the right-hand rail takes
   * x 1164 rightwards, and the tab bar takes the bottom ~70px.
   *
   * First: try the mouse, because that is what a player does.
   */
  await presses.click(page.locator('.hud-build__list [data-buildable="wall-brick"]'), 'select Brick wall');
  await presses.click(page.locator('.hud-build__arm'), 'arm');

  const west = origin.originX + 13 * TILE;
  const east = origin.originX + 17 * TILE;
  const north = origin.originY + 11 * TILE;
  const south = origin.originY + 15 * TILE;
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
  for (let tx = 13; tx <= 16; tx += 1) {
    wanted.push({ tx, ty: 11, edge: 'north' });
    wanted.push({ tx, ty: 14, edge: 'south' });
  }
  for (let ty = 11; ty <= 14; ty += 1) {
    wanted.push({ tx: 13, ty, edge: 'west' });
    wanted.push({ tx: 16, ty, edge: 'east' });
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
    await presses.drag(page, centreOf(origin, 13, 11), centreOf(origin, 16, 14), `zone drag attempt ${attempts}`);
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
  const bedPoint = centreOf(origin, 14, 12);
  const bedCmds = await presses.press(page, bedPoint.x, bedPoint.y, 'place the bed at (14,12)');
  note(`[B] bed press produced ${bedCmds.length} command(s): ${JSON.stringify(bedCmds)}`);
  if (bedCmds.length === 0) {
    note('[B] the bed press produced nothing; falling back to the typed route');
    await presses.click(page.locator('.hud-build__list [data-buildable="bed-wooden"]'), 'select Wooden bed (typed)');
    await openCoordinates(page);
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile X' }), '14', 'Tile X');
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile Y' }), '12', 'Tile Y');
    await presses.click(page.locator('.hud-build__coordinates .ui-action'), 'Place order');
  }
  await presses.click(page.locator('.hud-build__list [data-buildable="toilet-brick"]'), 'select Toilet');
  await presses.click(page.locator('.hud-build__arm'), 'arm the toilet');
  const wcPoint = centreOf(origin, 15, 13);
  const wcCmds = await presses.press(page, wcPoint.x, wcPoint.y, 'place the toilet at (15,13)');
  note(`[B] toilet press produced ${wcCmds.length} command(s): ${JSON.stringify(wcCmds)}`);
  if (wcCmds.length === 0) {
    note('[B] the toilet press produced nothing; falling back to the typed route');
    await presses.click(page.locator('.hud-build__list [data-buildable="toilet-brick"]'), 'select Toilet (typed)');
    await openCoordinates(page);
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile X' }), '15', 'Tile X');
    await presses.fill(page.getByRole('spinbutton', { name: 'Tile Y' }), '13', 'Tile Y');
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

/* ------------------------------------------------------------------ ACT F */

/**
 * The five questions acts A-E left open, each one a thing a player does
 * without being told to.
 *
 * F1 **what does it cost, and when am I told.** Every catalogue row, read the
 *    way a player reads it: the row itself, the arm control, the WHERE
 *    readout, and only then the Buy fold. Then one wall is placed and the
 *    funds delta compared against everything the panel had offered first.
 * F2 **the warning that will not go away.** `hud.ts` says a refusal *"stays
 *    until the same action later succeeds"*. So: miss with Remove, then hit
 *    with Remove, and see whether it does.
 * F3 **running out of money with orders queued.** Spend the treasury down,
 *    then order a run, and read what the queue says about the wall it cannot
 *    pay for.
 * F4 **changing my mind.** Order six, build one, cancel the rest, and count
 *    what came back.
 * F5 **does anything ever say what to build.** Every tab, on a prison with
 *    nothing in it.
 */
test('act F: cost, regret, and being told what to do', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  /* --- F5 first, because it is about the prison before anything happens --- */
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(200);
    note(`[F5] the ${id} tab on an empty prison:\n${(await panelText(page, '.hud__side')).replace(/^/gm, '      ')}`);
  }
  note(`[F5] alerts list: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  note(`[F5] event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  await shot(page, 'F01-empty-prison-overview');

  /* --- F1: what does each row tell me about its price? --- */
  await tab(page, 'build').click();
  const ids = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud-build__list [data-buildable]')).map((n) => n.getAttribute('data-buildable') ?? ''),
  );
  note(`[F1] ${ids.length} catalogue rows`);
  for (const id of ids) {
    const row = page.locator(`.hud-build__list [data-buildable="${id}"]`);
    await row.click();
    await page.waitForTimeout(90);
    const shown = await page.evaluate(() => {
      const q = (sel: string): string => {
        const n = document.querySelector<HTMLElement>(sel);
        if (n === null) return 'ABSENT';
        if (n.hidden || n.getClientRects().length === 0) return 'not laid out';
        return (n.innerText ?? '').replace(/\n/g, ' / ').trim();
      };
      return {
        row: q('.hud-build__list [aria-pressed="true"], .hud-build__list [data-selected="true"]'),
        arm: q('.hud-build__arm'),
        target: q('.hud-build__target'),
        buyFold: q('.hud-build__buy'),
        buySubmit: q('.hud-build__buy-submit'),
        anyMoneyOnScreenInThePanel: (document.querySelector<HTMLElement>('.hud-build')?.innerText ?? '')
          .split('\n')
          .filter((line) => /[0-9]/.test(line))
          .join(' | '),
      };
    });
    note(`[F1] ${id.padEnd(26)} closed-fold: arm=${JSON.stringify(shown.arm)} target=${JSON.stringify(shown.target)} buyFold=${JSON.stringify(shown.buyFold)} | numerals anywhere in the panel: ${JSON.stringify(shown.anyMoneyOnScreenInThePanel)}`);
  }

  // And now the one press that reveals a price, on the row a player starts on.
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(200);
  note(`[F1] with the Buy fold OPEN, brick wall: submit reads ${JSON.stringify((await page.locator('.hud-build__buy-submit').innerText()).trim())}`);
  note(`[F1] the fold as a player reads it:\n${await panelText(page, '.hud-build__buy')}`);
  await shot(page, 'F02-buy-fold-open');
  await page.locator('.hud-build__buy-toggle').click();

  // Measure what one wall actually takes.
  const origin = await calibrate(page);
  note(`[F2] the Remove probe calibration just missed ${''}-- band now: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  const beforeWall = await sample(page, started);
  await armBuildable(page, 'wall-brick');
  const gridX = origin.originX + 8 * TILE;
  const gridY = origin.originY + 8 * TILE;
  const wallCmds = await press(page, gridX + TILE / 2, gridY);
  await page.waitForTimeout(400);
  const afterWall = await sample(page, started);
  note(`[F1] ONE wall: ${wallCmds.length} order(s), funds ${beforeWall.funds} -> ${afterWall.funds} (treasury ${beforeWall.treasury} -> ${afterWall.treasury}, delta ${beforeWall.treasury - afterWall.treasury})`);
  note(`[F1] the panel after it: queue=${JSON.stringify(afterWall.queue)} deliveries=${JSON.stringify(afterWall.deliveries)}`);

  /* --- F2: does a successful Remove clear the missed one? --- */
  note(`[F2] band before the clock runs: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  note(`[F2] alerts before the clock runs: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  await transport(page, 'fast').click();
  await transport(page, 'fast').click();
  for (let i = 0; i < 40; i += 1) {
    const text = await panelText(page, '.hud-build__queue');
    if (text.includes('not laid out')) break;
    await page.waitForTimeout(1000);
  }
  await transport(page, 'pause').click();
  await page.waitForTimeout(400);
  note(`[F2] the wall is up at tick ${await currentTick(page)}. band still: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  await shot(page, 'F03-wall-up-band-still-there');

  await page.locator('.hud-build__remove').click();
  const removed = await press(page, gridX + TILE / 2, gridY);
  await page.waitForTimeout(700);
  note(`[F2] a Remove that should HIT: ${removed.length} command(s) ${JSON.stringify(removed)}`);
  note(`[F2] band after a Remove that hit: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  note(`[F2] alerts after it: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  note(`[F2] is there any control that dismisses the band or an alert row? ${JSON.stringify(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hud__refusal button, .hud-alerts__list button, .hud__event button')).map(
        (n) => (n as HTMLElement).innerText.trim(),
      ),
    ),
  )}`);
  await shot(page, 'F04-after-a-remove-that-hit');
  const removeStillArmed = (await page.locator('.hud-build__remove').innerText()).trim();
  if (removeStillArmed.toLowerCase().startsWith('stop')) await page.locator('.hud-build__remove').click();

  /* --- F3: spend it all, then order a wall --- */
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  const buyToggle = page.locator('.hud-build__buy-toggle');
  if (await page.locator('.hud-build__buy').isHidden()) await buyToggle.click();
  const qty = page.locator('.hud-build__buy .ui-number__input');
  const submit = page.locator('.hud-build__buy-submit');
  for (let round = 0; round < 12; round += 1) {
    const s = await sample(page, started);
    if (s.treasury < 20_000) break;
    await qty.fill('500');
    await page.waitForTimeout(150);
    if ((await submit.getAttribute('aria-disabled')) === 'true') break;
    await submit.click();
    await page.waitForTimeout(400);
    note(`[F3] bought 500 bricks; treasury now ${(await sample(page, started)).treasury}`);
  }
  // Trim to nearly nothing.
  for (const step of [100, 50, 10, 5, 1]) {
    for (let round = 0; round < 60; round += 1) {
      await qty.fill(String(step));
      await page.waitForTimeout(120);
      if ((await submit.getAttribute('aria-disabled')) === 'true') break;
      await submit.click();
      await page.waitForTimeout(220);
    }
    note(`[F3] after the ${step}s: treasury ${(await sample(page, started)).treasury} shortfall ${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}`);
  }
  const broke = await sample(page, started);
  note(`[F3] broke: funds=${broke.funds} treasury=${broke.treasury}`);
  note(`[F3] status strip while broke: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  await shot(page, 'F05-broke');

  // Now order a run with no money. Bricks are in stock; money is not.
  await armBuildable(page, 'wall-brick');
  const runBefore = (await sentCommands(page)).length;
  await drag(page, { x: origin.originX + 12 * TILE, y: origin.originY + 12 * TILE }, { x: origin.originX + 16 * TILE, y: origin.originY + 12 * TILE });
  const runCmds = (await sentCommands(page)).slice(runBefore);
  await page.waitForTimeout(600);
  note(`[F3] a 4-tile run with no money produced ${runCmds.length} order(s)`);
  note(`[F3] band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  note(`[F3] queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  note(`[F3] treasury after it: ${(await sample(page, started)).treasury}`);
  await shot(page, 'F06-ordered-while-broke');
  await transport(page, 'fast').click();
  await transport(page, 'fast').click();
  await page.waitForTimeout(12_000);
  await transport(page, 'pause').click();
  await page.waitForTimeout(400);
  note(`[F3] 12s later at 4x, tick ${await currentTick(page)}: queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  note(`[F3] band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  note(`[F3] full build panel while stuck:\n${await panelText(page, '.hud-build')}`);
  await shot(page, 'F07-stuck-with-no-money');

  /* --- F4: changing my mind --- */
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud-build__queue-row')).map((n) => {
      const el = n as HTMLElement;
      return { text: el.innerText.replace(/\n/g, ' / '), laidOut: el.getClientRects().length > 0 };
    }),
  );
  note(`[F4] queue rows offered: ${JSON.stringify(rows)}`);
  const beforeCancel = await sample(page, started);
  const cancelButtons = page.locator('.hud-build__queue-row button');
  const cancelCount = await cancelButtons.count();
  note(`[F4] ${cancelCount} cancel control(s) on screen for ${runCmds.length} order(s)`);
  for (let i = 0; i < cancelCount; i += 1) {
    if (await cancelButtons.nth(0).isVisible()) {
      await cancelButtons.nth(0).click();
      await page.waitForTimeout(500);
      note(`[F4] cancel ${i + 1}: treasury ${(await sample(page, started)).treasury} queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    }
  }
  const afterCancel = await sample(page, started);
  note(`[F4] cancelling gave back ${afterCancel.treasury - beforeCancel.treasury} (treasury ${beforeCancel.treasury} -> ${afterCancel.treasury})`);
  note(`[F4] band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  await shot(page, 'F08-after-cancelling');
});

/* ------------------------------------------------------------------ ACT G */

/**
 * The samples act F needed and did not get, each one chosen because it could
 * refute what act F appeared to show.
 *
 * G1 **the refuting sample for the stuck refusal.** `hud.ts` promises a
 *    refusal clears *"when the same action later succeeds"*. Act F aimed its
 *    successful Remove at a wall, which is edge geometry, and the press
 *    produced no command at all -- so the promise was never tested. Here the
 *    object is a **bed**, on a tile, pressed at the tile centre, and the
 *    Remove that follows is checked for having actually been sent before the
 *    band is read.
 * G2 **one press, one wall.** Act F's single press on a gridline produced
 *    zero commands while a drag along the same line produced five. Nine
 *    offsets across one tile, counted, so the report can say what fraction of
 *    a tile is a dead zone rather than guessing.
 * G3 **cancel, with the clock genuinely stopped.** Act F cancelled after 12 s
 *    at 4x had already drained the queue, so it measured nothing. Nothing runs
 *    here between the order and the cancel.
 * G4 **what each tab says**, read off the panels themselves rather than off a
 *    container that turned out to hold no text.
 * G5 **is a price hiding in an attribute** -- `title`, `aria-label`,
 *    `aria-description` -- anywhere in the panel a player has not opened.
 */
test('act G: the refuting samples', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  /* --- G4: every tab, panel by panel --- */
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(250);
    const panels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ui-panel'))
        .filter((n) => (n as HTMLElement).getClientRects().length > 0)
        .map((n) => (n as HTMLElement).innerText.replace(/\n+/g, ' / ').trim()),
    );
    note(`[G4] ${id}: ${panels.length} panel(s) laid out`);
    for (const text of panels) note(`[G4]   ${text}`);
  }

  /* --- G5: a price in an attribute? --- */
  await tab(page, 'build').click();
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  await page.waitForTimeout(200);
  const attributes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud-build *'))
      .filter((n) => (n as HTMLElement).getClientRects().length > 0)
      .flatMap((n) =>
        ['title', 'aria-label', 'aria-description', 'aria-describedby', 'data-cost', 'data-price'].flatMap((name) => {
          const value = n.getAttribute(name);
          return value === null ? [] : [`${n.className.toString().slice(0, 40)} [${name}]=${value}`];
        }),
      ),
  );
  note(`[G5] every attribute in the visible Build panel that could carry a price:`);
  for (const line of attributes) note(`[G5]   ${line}`);
  note(`[G5] any of them containing a digit: ${JSON.stringify(attributes.filter((a) => /[0-9]/.test(a)))}`);

  /* --- G2: nine offsets across one tile, one press each --- */
  const origin = await calibrate(page);
  note(`[G2] origin (${origin.originX}, ${origin.originY})`);
  await armBuildable(page, 'wall-brick');
  const baseX = origin.originX + 20 * TILE;
  const baseY = origin.originY + 10 * TILE;
  for (const dy of [0, 2, 8, 16, 31, 32, 33, 48, 56, 62, 63]) {
    const before = (await sentCommands(page)).length;
    await press(page, baseX + TILE / 2, baseY + dy);
    const got = (await sentCommands(page)).slice(before);
    const armed = (await page.locator('.hud-build__arm').innerText()).trim();
    note(
      `[G2] press at tile-centre-x, +${String(dy).padStart(2)}px into the tile: ${got.length} command(s)` +
        `${got.length > 0 ? ` -> ${String(got[0]?.['x'])},${String(got[0]?.['y'])} ${String(got[0]?.['edge'])}` : ''}` +
        ` | arm control still reads ${JSON.stringify(armed)}` +
        ` | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    if (armed.toLowerCase().startsWith('place')) {
      note('[G2]   (the tool had DISARMED itself; re-arming)');
      await page.locator('.hud-build__arm').click();
    }
  }
  await shot(page, 'G01-nine-presses');

  /* --- G1: the refuting sample. A bed, on a tile, removed. --- */
  const bandBefore = await panelText(page, '.hud__refusal');
  note(`[G1] band before anything: ${JSON.stringify(bandBefore)}`);
  await armBuildable(page, 'bed-wooden');
  const bedTile = { tx: 24, ty: 14 };
  const bedPoint = centreOf(origin, bedTile.tx, bedTile.ty);
  const bedCmds = await press(page, bedPoint.x, bedPoint.y);
  note(`[G1] a bed pressed at the CENTRE of tile (${bedTile.tx},${bedTile.ty}): ${bedCmds.length} command(s) ${JSON.stringify(bedCmds)}`);
  if (bedCmds.length === 0) {
    note('[G1] the pointer route gave nothing; using the typed route so the sample can still be taken');
    await placeAt(page, 'bed-wooden', bedTile.tx, bedTile.ty);
  }
  await transport(page, 'fast').click();
  await transport(page, 'fast').click();
  for (let i = 0; i < 40; i += 1) {
    if ((await panelText(page, '.hud-build__queue')).includes('not laid out')) break;
    await page.waitForTimeout(1000);
  }
  await transport(page, 'pause').click();
  await page.waitForTimeout(600);
  note(`[G1] the bed is built at tick ${await currentTick(page)}`);
  await shot(page, 'G02-bed-built');

  await page.locator('.hud-build__remove').click();
  const removeCmds = await press(page, bedPoint.x, bedPoint.y);
  await page.waitForTimeout(900);
  note(`[G1] the Remove press sent ${removeCmds.length} command(s): ${JSON.stringify(removeCmds)}`);
  const bandAfter = await panelText(page, '.hud__refusal');
  note(`[G1] band after a Remove that WAS sent: ${JSON.stringify(bandAfter)}`);
  note(`[G1] DID THE STUCK REFUSAL CLEAR? ${bandBefore === bandAfter ? 'NO -- identical text' : 'YES'}`);
  note(`[G1] alerts list: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  await shot(page, 'G03-after-a-remove-that-was-sent');
  if ((await page.locator('.hud-build__remove').innerText()).trim().toLowerCase().startsWith('stop')) {
    await page.locator('.hud-build__remove').click();
  }

  /* --- G3: cancel, nothing running --- */
  const beforeOrder = await sample(page, started);
  await armBuildable(page, 'wall-brick');
  const runBefore = (await sentCommands(page)).length;
  await drag(
    page,
    { x: origin.originX + 26 * TILE + TILE / 2, y: origin.originY + 16 * TILE },
    { x: origin.originX + 30 * TILE + TILE / 2, y: origin.originY + 16 * TILE },
  );
  const runCmds = (await sentCommands(page)).slice(runBefore);
  await page.waitForTimeout(900);
  const afterOrder = await sample(page, started);
  note(`[G3] a 4-tile run: ${runCmds.length} order(s), treasury ${beforeOrder.treasury} -> ${afterOrder.treasury} (cost ${beforeOrder.treasury - afterOrder.treasury})`);
  note(`[G3] the queue block as a player reads it:\n${await panelText(page, '.hud-build__queue')}`);
  note(`[G3] the deliveries block:\n${await panelText(page, '.hud-build__deliveries')}`);
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud-build__queue-row')).map((n) => {
      const el = n as HTMLElement;
      return { text: el.innerText.replace(/\n/g, ' / '), laidOut: el.getClientRects().length > 0, order: el.getAttribute('data-order') };
    }),
  );
  note(`[G3] ${rows.length} row element(s), ${rows.filter((r) => r.laidOut).length} laid out, for ${runCmds.length} order(s):`);
  for (const row of rows) note(`[G3]   ${JSON.stringify(row)}`);
  note(`[G3] the "more" line: ${JSON.stringify(await panelText(page, '.hud-build__queue-more'))}`);
  await shot(page, 'G04-five-orders-queued-paused');

  // Cancel every control the panel offers, with the clock stopped.
  for (let n = 0; n < 8; n += 1) {
    const buttons = page.locator('.hud-build__queue-row button:visible');
    if ((await buttons.count()) === 0) break;
    const before = await sample(page, started);
    await buttons.nth(0).click();
    await page.waitForTimeout(700);
    const after = await sample(page, started);
    note(`[G3] cancel ${n + 1}: treasury ${before.treasury} -> ${after.treasury} (+${after.treasury - before.treasury}) | queue ${JSON.stringify(after.queue)}`);
  }
  const end = await sample(page, started);
  note(`[G3] TOTAL: paid ${beforeOrder.treasury - afterOrder.treasury} for the run, got back ${end.treasury - afterOrder.treasury}, net ${beforeOrder.treasury - end.treasury}`);
  note(`[G3] band at the end: ${JSON.stringify(end.refusal)}`);
  note(`[G3] deliveries at the end:\n${await panelText(page, '.hud-build__deliveries')}`);
  await shot(page, 'G05-after-cancelling-paused');
});

/* ------------------------------------------------------------------ ACT H */

/**
 * The three samples still outstanding, all of them inside the one rectangle
 * of canvas no HUD island covers.
 *
 * **Why that rectangle is stated as a constant here.** Acts F and G lost most
 * of their pointer measurements to it. `press` at a point the HUD covers
 * submits **nothing at all** -- no command, no refusal, no band -- so a
 * measurement taken there reads exactly like a game that ignored the press.
 * Act F's "single presses produce zero commands while a drag produces five"
 * and act G's "a bed at a tile centre produces nothing" were both this, not a
 * finding: F's wall was at screen y = -62 and G's bed at x = 1264, behind the
 * Build panel. That HUD occlusion is #878's subject and is not re-derived
 * here; what it cost this playtest is recorded because it will cost the next
 * one the same three runs otherwise.
 *
 * H1 **does a refusal clear when the same action succeeds**, which is what
 *    `src/ui/hud/hud.ts` promises and what act F could not test. Refuse a
 *    build order (place the same wall twice), then place a *different* wall
 *    that must succeed, and read the band. Clock stopped throughout.
 * H2 **what the Build tab does not say about furniture.** Act G's bed was
 *    refused with *"it has to stand in a room you have zoned"* -- so 19 of
 *    the 21 catalogue rows are unplaceable on a fresh prison. This walks the
 *    catalogue on an unzoned prison and counts how many rows the panel offers
 *    that the simulation will refuse, and checks whether the panel says so
 *    anywhere before the press.
 * H3 **cancel, with the clock genuinely stopped.**
 */

/** The one rectangle of canvas no HUD island covers at 1440x900, in tiles. */
const CLEAR_TILES = { minX: 12, maxX: 22, minY: 11, maxY: 15 } as const;

test('act H: what the panel does not say, and what cancel gives back', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);

  // Prove the clear rectangle really is clear, rather than asserting it.
  const cover = await page.evaluate(
    ([ox, oy, tile, box]) => {
      const islands = Array.from(document.querySelectorAll('.hud-strip, .hud__tabs, .ui-panel, .save-panel, .hud__corner, .hud__rail'))
        .map((n) => (n as HTMLElement).getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0);
      const out: string[] = [];
      const r = box as { minX: number; maxX: number; minY: number; maxY: number };
      for (let tx = r.minX; tx <= r.maxX; tx += 1) {
        for (let ty = r.minY; ty <= r.maxY; ty += 1) {
          const cx = (ox as number) + tx * (tile as number) + (tile as number) / 2;
          const cy = (oy as number) + ty * (tile as number) + (tile as number) / 2;
          const hit = islands.find((b) => cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom);
          if (hit !== undefined) out.push(`${tx},${ty}`);
        }
      }
      return { covered: out, viewport: { w: window.innerWidth, h: window.innerHeight } };
    },
    [origin.originX, origin.originY, TILE, CLEAR_TILES] as const,
  );
  note(`[H] at ${cover.viewport.w}x${cover.viewport.h}, of the ${(CLEAR_TILES.maxX - CLEAR_TILES.minX + 1) * (CLEAR_TILES.maxY - CLEAR_TILES.minY + 1)} tile centres in the rectangle this act uses, ${cover.covered.length} are under a HUD island: ${JSON.stringify(cover.covered)}`);

  /* --- H1: does a refusal clear when the same action succeeds? --- */
  await armBuildable(page, 'wall-brick');
  const edgeAt = (tx: number, ty: number) => ({ x: origin.originX + tx * TILE + TILE / 2, y: origin.originY + ty * TILE + TILE / 2 });
  const first = edgeAt(18, 12);
  const one = await press(page, first.x, first.y - TILE / 2 + 40);
  await page.waitForTimeout(900);
  note(`[H1] the first wall: ${one.length} command(s) ${JSON.stringify(one.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))} | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  const two = await press(page, first.x, first.y - TILE / 2 + 40);
  await page.waitForTimeout(1200);
  const refusedBand = await panelText(page, '.hud__refusal');
  note(`[H1] the SAME wall again: ${two.length} command(s) | band ${JSON.stringify(refusedBand)}`);
  const three = await press(page, edgeAt(20, 12).x, edgeAt(20, 12).y - TILE / 2 + 40);
  await page.waitForTimeout(1500);
  const afterSuccess = await panelText(page, '.hud__refusal');
  note(`[H1] a DIFFERENT wall, which must succeed: ${three.length} command(s) ${JSON.stringify(three.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  note(`[H1] band after that success: ${JSON.stringify(afterSuccess)}`);
  note(`[H1] DID THE REFUSAL CLEAR WHEN THE SAME ACTION SUCCEEDED? ${refusedBand === afterSuccess ? 'NO -- identical text' : 'YES'}`);
  note(`[H1] alerts list now: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  await shot(page, 'H01-refusal-then-success');

  /* --- H2: which catalogue rows can a fresh prison actually place? --- */
  const catalogue = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud-build__list [data-buildable]')).map((n) => n.getAttribute('data-buildable') ?? ''),
  );
  const refused: string[] = [];
  const accepted: string[] = [];
  const silent: string[] = [];
  let ty = CLEAR_TILES.minY;
  let tx = CLEAR_TILES.minX;
  for (const id of catalogue) {
    if (id === 'wall-brick' || id === 'door-wooden' || id === 'loading-dock-door-wooden') continue;
    tx += 1;
    if (tx > CLEAR_TILES.maxX) {
      tx = CLEAR_TILES.minX;
      ty += 1;
    }
    if (ty > CLEAR_TILES.maxY) break;
    const rowText = (await page.locator(`.hud-build__list [data-buildable="${id}"]`).innerText()).replace(/\n/g, ' / ').trim();
    await armBuildable(page, id);
    const point = centreOf(origin, tx, ty);
    const cmds = await press(page, point.x, point.y);
    await page.waitForTimeout(1100);
    const band = await panelText(page, '.hud__refusal');
    const queue = await panelText(page, '.hud-build__queue');
    const verdict = cmds.length === 0 ? 'NO COMMAND' : /was not placed|failed|not enough/i.test(band) ? 'REFUSED' : 'accepted';
    if (verdict === 'REFUSED') refused.push(id);
    else if (verdict === 'NO COMMAND') silent.push(id);
    else accepted.push(id);
    note(`[H2] ${id.padEnd(26)} row says ${JSON.stringify(rowText)} -> pressed (${tx},${ty}): ${verdict} | band ${JSON.stringify(band)} | queue ${JSON.stringify(queue)}`);
  }
  note(`[H2] on a prison with no rooms zoned: ${accepted.length} accepted, ${refused.length} REFUSED, ${silent.length} sent nothing`);
  note(`[H2] refused: ${JSON.stringify(refused)}`);
  note(`[H2] accepted: ${JSON.stringify(accepted)}`);
  note(`[H2] does the Build panel say anywhere that furniture needs a room first? panel text:\n${await panelText(page, '.hud-build')}`);
  await shot(page, 'H02-furniture-on-an-unzoned-prison');

  /* --- H3: cancel with nothing running --- */
  const beforeOrder = await sample(page, started);
  await armBuildable(page, 'wall-brick');
  const runBefore = (await sentCommands(page)).length;
  await drag(page, { x: origin.originX + 13 * TILE, y: origin.originY + 15 * TILE }, { x: origin.originX + 17 * TILE, y: origin.originY + 15 * TILE });
  const runCmds = (await sentCommands(page)).slice(runBefore);
  await page.waitForTimeout(1500);
  const afterOrder = await sample(page, started);
  note(`[H3] a 4-tile run: ${runCmds.length} order(s), treasury ${beforeOrder.treasury} -> ${afterOrder.treasury} (it took ${beforeOrder.treasury - afterOrder.treasury})`);
  note(`[H3] the queue block:\n${await panelText(page, '.hud-build__queue')}`);
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud-build__queue-row')).map((n) => {
      const el = n as HTMLElement;
      return { text: el.innerText.replace(/\n/g, ' / '), laidOut: el.getClientRects().length > 0 };
    }),
  );
  note(`[H3] ${rows.length} row element(s), ${rows.filter((r) => r.laidOut).length} laid out, for ${runCmds.length} order(s):`);
  for (const row of rows) note(`[H3]   ${JSON.stringify(row)}`);
  note(`[H3] the "more" line: ${JSON.stringify(await panelText(page, '.hud-build__queue-more'))}`);
  await shot(page, 'H03-run-queued-clock-stopped');

  for (let n = 0; n < 10; n += 1) {
    const buttons = page.locator('.hud-build__queue-row button:visible');
    if ((await buttons.count()) === 0) {
      note(`[H3] after ${n} cancel(s) the panel offers no more controls; queue says ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
      break;
    }
    const before = await sample(page, started);
    await buttons.nth(0).click();
    await page.waitForTimeout(900);
    const after = await sample(page, started);
    note(`[H3] cancel ${n + 1}: treasury ${before.treasury} -> ${after.treasury} (+${after.treasury - before.treasury}) | queue ${JSON.stringify(after.queue)} | band ${JSON.stringify(after.refusal)}`);
  }
  const end = await sample(page, started);
  note(`[H3] TOTAL: the run took ${beforeOrder.treasury - afterOrder.treasury}, cancelling returned ${end.treasury - afterOrder.treasury}, net loss ${beforeOrder.treasury - end.treasury}`);
  note(`[H3] deliveries at the end:\n${await panelText(page, '.hud-build__deliveries')}`);
  await shot(page, 'H04-after-cancelling-clock-stopped');
});

/* ------------------------------------------------------------------ ACT I */

/**
 * The last four samples, each one aimed at refuting a reading acts A-H
 * produced rather than at confirming it.
 *
 * I1 **the QUEUED block is a fold, so open it.** Act D read "3 row elements,
 *    0 laid out" and that is *by design*: `BUILD_QUEUE_ROW_LIMIT`'s comment
 *    says the block *"is collapsed when it appears, so a queue costs a header
 *    and not a list until the player asks for one"*. So the question is not
 *    whether the rows are hidden but whether a player can find the press that
 *    shows them, and whether a Cancel works once they have.
 * I2 **Undo.** `hud.build.queue-more` tells a player *"undo takes back a whole
 *    run"* and `src/input/bindings.ts:64` binds it to bare **KeyZ**. There is
 *    no Undo control in the Build panel. So: press Z with a run queued, and
 *    separately enumerate everything on screen that could have told a player
 *    the key exists.
 * I3 **the panel's overflow.** Act D measured the body at scrollHeight 803 in
 *    a clientHeight of 461 with `overflow-y: visible`. This lists which
 *    sections fall outside the box, so the report can name them.
 * I4 **the placement hint with a non-wall row selected.** Act H's panel text
 *    read *"Click a tile edge to place a wall"* with Storage Rack selected.
 *    `build-panel.ts:1271` swaps that line for the *remove* hint only, so this
 *    checks it against a bed rather than trusting one reading.
 */
test('act I: the fold, the key nobody is told about, and the overflow', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);

  /* --- I4: the hint, per row --- */
  for (const id of ['wall-brick', 'door-wooden', 'bed-wooden', 'toilet-brick', 'storage-rack-wooden']) {
    await page.locator(`.hud-build__list [data-buildable="${id}"]`).click();
    await page.waitForTimeout(150);
    note(`[I4] with ${id.padEnd(22)} selected, the hint reads ${JSON.stringify((await page.locator('.hud-build__note').first().innerText()).trim())}`);
  }

  /* --- I2 part one: what on screen names a key at all? --- */
  const keyMentions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.hud, .save-panel'))
      .flatMap((root) => ((root as HTMLElement).innerText ?? '').split('\n'))
      .filter((line) => /\bkey|keyboard|press [A-Z]\b|\bZ\b|shortcut|undo/i.test(line))
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
  note(`[I2] every line on screen that mentions a key, a shortcut or undo: ${JSON.stringify(keyMentions)}`);

  /* --- queue a run so there is something to cancel and to undo --- */
  await armBuildable(page, 'wall-brick');
  const before = await sample(page, started);
  const runBefore = (await sentCommands(page)).length;
  await drag(page, { x: origin.originX + 13 * TILE, y: origin.originY + 13 * TILE }, { x: origin.originX + 18 * TILE, y: origin.originY + 13 * TILE });
  const runCmds = (await sentCommands(page)).slice(runBefore);
  await page.waitForTimeout(1500);
  const queued = await sample(page, started);
  note(`[I1] a 5-tile run: ${runCmds.length} order(s), treasury ${before.treasury} -> ${queued.treasury} (took ${before.treasury - queued.treasury})`);

  /* --- I1: is the QUEUED block openable, and does it look openable? --- */
  const foldBefore = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('.hud-build__queue');
    const header = section?.querySelector<HTMLElement>('.ui-section__header') ?? null;
    return {
      sectionFound: section !== null,
      headerFound: header !== null,
      headerTag: header?.tagName ?? '',
      headerText: (header?.innerText ?? '').replace(/\n/g, ' / '),
      ariaExpanded: header?.getAttribute('aria-expanded') ?? 'ABSENT',
      headerRole: header?.getAttribute('role') ?? 'ABSENT',
      headerHasIcon: (header?.querySelector('svg, .ui-icon, [class*="chevron"], [class*="caret"]') ?? null) !== null,
      headerHtmlHead: (header?.innerHTML ?? '').slice(0, 300),
    };
  });
  note(`[I1] the QUEUED header, before any press: ${JSON.stringify(foldBefore, null, 1)}`);
  await shot(page, 'I01-queue-fold-shut');

  const header = page.locator('.hud-build__queue .ui-section__header');
  if ((await header.count()) > 0) {
    await header.click();
    await page.waitForTimeout(700);
    const opened = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hud-build__queue-row')).map((n) => {
        const el = n as HTMLElement;
        const b = el.getBoundingClientRect();
        const button = el.querySelector('button');
        const bb = button === null ? null : (button as HTMLElement).getBoundingClientRect();
        return {
          text: el.innerText.replace(/\n/g, ' / '),
          hidden: el.hidden,
          laidOut: el.getClientRects().length > 0,
          y: Math.round(b.top),
          insideViewport: b.top >= 0 && b.bottom <= window.innerHeight,
          cancelAt: bb === null ? null : { x: Math.round(bb.x + bb.width / 2), y: Math.round(bb.y + bb.height / 2), w: Math.round(bb.width), h: Math.round(bb.height) },
        };
      }),
    );
    note(`[I1] after ONE press on the QUEUED header, ${opened.filter((r) => r.laidOut).length} of ${opened.length} rows are laid out:`);
    for (const row of opened) note(`[I1]   ${JSON.stringify(row)}`);
    note(`[I1] the "more" line now: ${JSON.stringify(await panelText(page, '.hud-build__queue-more'))}`);
    note(`[I1] aria-expanded now: ${JSON.stringify(await header.getAttribute('aria-expanded'))}`);
    await shot(page, 'I02-queue-fold-open');

    // And can a Cancel actually be pressed, and does it pay back?
    const button = page.locator('.hud-build__queue-row button:visible').first();
    if ((await button.count()) > 0) {
      const pre = await sample(page, started);
      await button.click();
      await page.waitForTimeout(1000);
      const post = await sample(page, started);
      note(`[I1] one Cancel, pressed: treasury ${pre.treasury} -> ${post.treasury} (+${post.treasury - pre.treasury}) | queue ${JSON.stringify(post.queue)} | band ${JSON.stringify(post.refusal)}`);
    } else {
      note('[I1] NO cancel control is pressable even with the fold open');
    }
  }

  /* --- I3: what falls outside the panel's box --- */
  const overflow = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.hud-build > .ui-panel__body');
    if (body === null) return null;
    const box = body.getBoundingClientRect();
    const style = getComputedStyle(body);
    const sections = Array.from(body.querySelectorAll(':scope > *, :scope > * > .ui-section__header'))
      .map((n) => {
        const el = n as HTMLElement;
        const b = el.getBoundingClientRect();
        if (b.height === 0) return null;
        return {
          cls: el.className.toString().slice(0, 46),
          text: (el.innerText ?? '').split('\n')[0]?.slice(0, 40) ?? '',
          top: Math.round(b.top),
          bottom: Math.round(b.bottom),
          belowThePanel: b.top > box.bottom,
          clippedByThePanel: b.bottom > box.bottom && b.top < box.bottom,
        };
      })
      .filter((v) => v !== null);
    return {
      body: { top: Math.round(box.top), bottom: Math.round(box.bottom), clientHeight: body.clientHeight, scrollHeight: body.scrollHeight, overflowY: style.overflowY, maxHeight: style.maxHeight },
      sections,
    };
  });
  note(`[I3] the Build panel's body: ${JSON.stringify(overflow?.body)}`);
  for (const s of overflow?.sections ?? []) {
    note(`[I3]   ${s.belowThePanel ? 'BELOW THE PANEL ' : s.clippedByThePanel ? 'CLIPPED         ' : 'inside          '} ${JSON.stringify(s)}`);
  }
  await shot(page, 'I03-panel-overflow');

  /* --- I2 part two: does Z undo, and does anything say it happened? --- */
  const preUndo = await sample(page, started);
  note(`[I2] before Z: treasury ${preUndo.treasury} | queue ${JSON.stringify(preUndo.queue)}`);
  // Focus the world by pressing a point the HUD does not cover -- (5,5) is
  // under the status strip, and Playwright refuses that click as intercepted,
  // which is what ended this act on its first run.
  await page.mouse.click(700, 300);
  await page.waitForTimeout(200);
  const preKeyCommands = (await sentCommands(page)).length;
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(1500);
  const zCommands = (await sentCommands(page)).slice(preKeyCommands);
  const postUndo = await sample(page, started);
  note(`[I2] pressing Z sent ${zCommands.length} command(s): ${JSON.stringify(zCommands)}`);
  note(`[I2] after Z: treasury ${preUndo.treasury} -> ${postUndo.treasury} (+${postUndo.treasury - preUndo.treasury}) | queue ${JSON.stringify(postUndo.queue)}`);
  note(`[I2] band ${JSON.stringify(postUndo.refusal)} | event band ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  note(`[I2] alerts ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  await shot(page, 'I04-after-pressing-z');
});

/* ------------------------------------------------------------------ ACT J */

/**
 * Does bare **Z** take back a run, and does anything say it happened?
 *
 * Split out of act I rather than folded back into it: act I is ten minutes of
 * play and this is the one measurement it lost, at the very end, to a click
 * Playwright refused as intercepted. A sample worth re-taking is worth being
 * cheap to re-take.
 *
 * `src/input/bindings.ts:64` binds `edit.undo` to `KeyZ` in the `world` and
 * `construction` contexts, and `hud.build.queue-more` is the only place in the
 * interface that mentions undo at all -- *"and {count} more behind these --
 * undo takes back a whole run"* -- inside a section that arrives collapsed.
 */
test('act J: does Z take back a run', async ({ page }) => {
  test.setTimeout(300_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  await armBuildable(page, 'wall-brick');

  const before = await sample(page, started);
  const runBefore = (await sentCommands(page)).length;
  await drag(page, { x: origin.originX + 13 * TILE, y: origin.originY + 13 * TILE }, { x: origin.originX + 18 * TILE, y: origin.originY + 13 * TILE });
  const runCmds = (await sentCommands(page)).slice(runBefore);
  await page.waitForTimeout(1500);
  const queued = await sample(page, started);
  note(`[J] a 5-tile run: ${runCmds.length} order(s), treasury ${before.treasury} -> ${queued.treasury} (took ${before.treasury - queued.treasury})`);
  note(`[J] queue: ${JSON.stringify(queued.queue)}`);

  // The world, at a point no HUD island covers.
  await page.mouse.click(700, 300);
  await page.waitForTimeout(300);
  const preKey = (await sentCommands(page)).length;
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(2000);
  const zCmds = (await sentCommands(page)).slice(preKey);
  const after = await sample(page, started);
  note(`[J] pressing Z sent ${zCmds.length} command(s): ${JSON.stringify(zCmds)}`);
  note(`[J] treasury ${queued.treasury} -> ${after.treasury} (${after.treasury - queued.treasury >= 0 ? '+' : ''}${after.treasury - queued.treasury})`);
  note(`[J] queue after Z: ${JSON.stringify(after.queue)}`);
  note(`[J] refusal band: ${JSON.stringify(after.refusal)}`);
  note(`[J] event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  note(`[J] alerts: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  await shot(page, 'J01-after-z');

  // And a second Z, to see whether it walks back further or refuses.
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(2000);
  const second = await sample(page, started);
  note(`[J] a second Z: treasury ${after.treasury} -> ${second.treasury} | queue ${JSON.stringify(second.queue)} | band ${JSON.stringify(second.refusal)}`);
  note(`[J] event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  await shot(page, 'J02-after-a-second-z');
});

/* ------------------------------------------------------------------ ACT K */

/**
 * Act J's first Z sent `{"type":"Undo"}`, left the treasury and the queue
 * exactly where they were, and put *"The last change to the build queue was
 * undone."* on the event band and in the alerts list. Its **second** Z gave
 * back all 480 and emptied the queue.
 *
 * There is an obvious innocent explanation and this act exists to test it:
 * `calibrate` fires about twenty-eight `RemoveObject` presses at empty tiles,
 * every one refused. If a refused removal takes a place in the undo stack then
 * act J's first Z popped one of *those*, and a player who never pressed Remove
 * would see the first Z work.
 *
 * So two prisons, identical but for one press:
 *
 * K1 draws a run with **no Remove press anywhere before it** -- no
 *    calibration, coordinates taken from the origin four separate runs have
 *    now measured at (-304, -574), and checked against the tiles the orders
 *    actually name -- then presses Z once.
 * K2 does the same with **one Remove press on an empty tile** first.
 *
 * If K1's single Z takes back the run and K2's does not, the finding is that a
 * refused Remove occupies a place in the undo stack. If neither does, it is
 * that the first Undo of a session never works. Either way the sentence on the
 * band is the same sentence, and in one of the two cases it is false.
 *
 * It also reads the alerts list's own controls, because act J showed a "Clear
 * this alert" press beside the Info row and none beside the Warning one.
 */
test('act K: which Z is the one that works', async ({ page }) => {
  test.setTimeout(600_000);

  const measuredOrigin = { originX: -304, originY: -574 };

  const walk = async (label: string, pressRemoveFirst: boolean): Promise<void> => {
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    const started = Date.now();

    if (pressRemoveFirst) {
      await page.locator('.hud-build__remove').click();
      const missed = await press(page, 700, 300);
      await page.waitForTimeout(900);
      note(`[${label}] one Remove press at an empty tile sent ${missed.length} command(s) ${JSON.stringify(missed.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])}`))}`);
      note(`[${label}] band after it: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
      if ((await page.locator('.hud-build__remove').innerText()).trim().toLowerCase().startsWith('stop')) {
        await page.locator('.hud-build__remove').click();
      }
    } else {
      note(`[${label}] no Remove press of any kind before this run`);
    }

    await armBuildable(page, 'wall-brick');
    const before = await sample(page, started);
    const runBefore = (await sentCommands(page)).length;
    await drag(
      page,
      { x: measuredOrigin.originX + 13 * TILE, y: measuredOrigin.originY + 13 * TILE },
      { x: measuredOrigin.originX + 18 * TILE, y: measuredOrigin.originY + 13 * TILE },
    );
    const runCmds = (await sentCommands(page)).slice(runBefore);
    await page.waitForTimeout(1500);
    const queued = await sample(page, started);
    note(
      `[${label}] the run: ${runCmds.length} order(s) at ${JSON.stringify(runCmds.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}` +
        ` -- the origin is confirmed if those are tiles 13-18 on row 13`,
    );
    note(`[${label}] treasury ${before.treasury} -> ${queued.treasury} (took ${before.treasury - queued.treasury}) | queue ${JSON.stringify(queued.queue)}`);

    await page.mouse.click(700, 300);
    await page.waitForTimeout(300);
    const preKey = (await sentCommands(page)).length;
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(2500);
    const zCmds = (await sentCommands(page)).slice(preKey);
    const after = await sample(page, started);
    note(`[${label}] ONE Z sent ${zCmds.length} command(s): ${JSON.stringify(zCmds)}`);
    note(`[${label}] treasury ${queued.treasury} -> ${after.treasury} (${after.treasury - queued.treasury >= 0 ? '+' : ''}${after.treasury - queued.treasury})`);
    note(`[${label}] queue after ONE Z: ${JSON.stringify(after.queue)}`);
    note(`[${label}] DID ONE Z TAKE BACK THE RUN? ${after.treasury === before.treasury ? 'YES -- the money is all back' : 'NO'}`);
    note(`[${label}] the event band says: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
    note(`[${label}] the alerts list:\n${await panelText(page, '.hud-alerts__list')}`);
    const alertControls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hud-alerts__list > *')).map((n) => {
        const el = n as HTMLElement;
        return {
          text: el.innerText.replace(/\n/g, ' / ').slice(0, 90),
          buttons: Array.from(el.querySelectorAll('button')).map((b) => (b as HTMLElement).innerText.trim()),
        };
      }),
    );
    note(`[${label}] each alert row and the controls it offers: ${JSON.stringify(alertControls, null, 1)}`);
    await shot(page, `${label}-after-one-z`);
  };

  await installTee(page);
  await walk('K1', false);
  await walk('K2', true);
});

/* ------------------------------------------------------------------ ACT L */

/**
 * The last thing that could refute act K, and it is the weakest point in the
 * whole finding.
 *
 * Act K read the treasury and the queue 2.5 s after a single Z and found both
 * unchanged while the event band said *"The last change to the build queue was
 * undone."* Act J then pressed a second Z and the money came back. Two
 * readings fit that: the first Z did nothing and the second one worked, **or**
 * the first Z was simply slower than 2.5 s and what act J attributed to the
 * second press was the first one landing late. Both end in the same state, so
 * the two presses cannot tell them apart.
 *
 * One press can. Press Z **once**, run the clock, wait fifteen seconds, and
 * read again. If the queue still holds six orders and the treasury is still
 * down by 480 after that, the first Undo did nothing -- and the sentence the
 * band showed at the time was false when it was shown.
 */
test('act L: was the first undo slow, or was it nothing', async ({ page }) => {
  test.setTimeout(400_000);
  await installTee(page);
  await openApp(page);
  const started = Date.now();

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  await armBuildable(page, 'wall-brick');

  const before = await sample(page, started);
  const runBefore = (await sentCommands(page)).length;
  await drag(page, { x: -304 + 13 * TILE, y: -574 + 13 * TILE }, { x: -304 + 18 * TILE, y: -574 + 13 * TILE });
  const runCmds = (await sentCommands(page)).slice(runBefore);
  await page.waitForTimeout(1500);
  const queued = await sample(page, started);
  note(`[L] the run: ${runCmds.length} order(s), treasury ${before.treasury} -> ${queued.treasury} | queue ${JSON.stringify(queued.queue)}`);

  await page.mouse.click(700, 300);
  await page.waitForTimeout(300);
  const preKey = (await sentCommands(page)).length;
  await page.keyboard.press('KeyZ');
  note(`[L] Z pressed once. Nothing else will be pressed for the rest of this act except the transport.`);
  for (const wait of [500, 1000, 2000, 4000]) {
    await page.waitForTimeout(wait);
    const s = await sample(page, started);
    note(`[L] paused, t+${s.ms}ms: treasury ${s.treasury} | queue ${JSON.stringify(s.queue)} | event ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  }
  note(`[L] the Z press sent ${(await sentCommands(page)).slice(preKey).length} command(s): ${JSON.stringify((await sentCommands(page)).slice(preKey))}`);

  // Now run the clock, in case an Undo needs a tick to be applied.
  await transport(page, 'play').click();
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(2000);
    const s = await sample(page, started);
    note(`[L] running, tick ${s.tick}: treasury ${s.treasury} | queue ${JSON.stringify(s.queue)}`);
  }
  await transport(page, 'pause').click();
  await page.waitForTimeout(600);
  const end = await sample(page, started);
  note(`[L] FIFTEEN SECONDS AND ${end.tick} TICKS AFTER ONE Z: treasury ${queued.treasury} -> ${end.treasury}, queue ${JSON.stringify(end.queue)}`);
  note(`[L] SO THE FIRST UNDO WAS ${end.treasury === before.treasury ? 'SLOW -- the money came back' : 'A NO-OP -- the money never came back'}`);
  note(`[L] the event band still says: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  note(`[L] alerts:\n${await panelText(page, '.hud-alerts__list')}`);
  await shot(page, 'L01-fifteen-seconds-after-one-z');
});
