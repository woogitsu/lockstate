import { expect, test } from '@playwright/test';
import {
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
  showPanel,
  tab,
  TILE,
} from './playtest-harness';

/**
 * **The first ten minutes, played twice.**
 *
 * The question this instrument answers is not "can the prison be built" --
 * earlier passes settled that, and `docs/research/2026-08-30-the-naive-route.md`
 * settled that the *wrong* order is recoverable. It is the next question:
 *
 * > A person who has never seen this game opens it. What happens in their
 * > first ten minutes -- and does the game ever tell them what they are
 * > supposed to be doing?
 *
 * The owner's standing directive is the standard: *"gra ma być łatwa
 * przyjazna do grania, a nie jakieś ukryte funkcje"* -- the game should be
 * easy and friendly to play, not full of hidden features. So the test is not
 * whether the information exists somewhere; it is whether the player is
 * **led** or **left to guess**.
 *
 * ## The shape: two runs, and the gap between them is the finding
 *
 * - **Act 2, the naive run.** Only what the screen says. Press what looks
 *   pressable, read what is written, and *never* use knowledge that came from
 *   a source file or from another playtest. Where the run gets stuck, it hunts
 *   the way a player hunts: opening folds, changing tabs, pressing again.
 * - **Act 3, the informed run.** The same goal, with the order already known.
 *   Deliberately **not** `buildAndPopulate` from `playtest-harness.ts`, even
 *   though it encodes exactly that order: it does not count interactions, and
 *   the comparison this file exists to make is a *count*. Act 3 replicates its
 *   order step for step (buy -> run the clock -> four wall drags -> wait for
 *   the queue -> designate -> furniture -> admit) through the same counter act
 *   2 uses, so the two numbers are commensurable.
 *
 * ## The instrumentation rules this file inherits, and why
 *
 * 1. **Print the container, not the parts** (#569's retraction). Every
 *    observation point dumps `.hud` whole through `screen()`. `innerText`
 *    reflects layout, so a sentence inside a shut fold is correctly *absent*
 *    from the dump -- which makes "was this reachable without unfolding
 *    anything?" a substring test rather than an argument.
 *
 *    **With one limit this pass measured and the inherited rule does not
 *    state: `innerText` does NOT respect a scroll container's clipping.** The
 *    Build catalogue's own numbers, from act 1 -- `{"rows":21,
 *    "fullyVisible":5,"scrollHeight":924,"clientHeight":223}` -- sit beside an
 *    `innerText` dump that lists all twenty-one row labels. A fold is
 *    `display:none` and vanishes from `innerText`; an overflowing list is not,
 *    and does not. So every `guidance()` reading below is an **upper bound** on
 *    what a player can read without scrolling, and any claim that a word is
 *    *reachable* is checked against the measured fold instead.
 * 2. **A press on a HUD-covered point submits nothing at all** -- no command,
 *    no refusal, no band -- and reads exactly like the game ignoring you.
 *    Three findings have been withdrawn to it. So `assertCanvasAt` runs
 *    `document.elementFromPoint` on every world point before it is pressed and
 *    fails loudly if anything but the canvas is on top.
 * 3. **A tile edge normalises to the lower-numbered tile**: the south edge of
 *    (13,14) is `13,15 north`. Wall runs here are therefore driven at the
 *    rectangle's outer edge coordinates, exactly as `buildAndPopulate` does.
 * 4. **No finding rests on wall-clock time.** Times are reported in
 *    simulation ticks, read from `simulation/clock-state` (published every
 *    tick, unlike `simulation/status-counts`). Wall-clock is printed only as
 *    an aside, and this container was under load average ~13 while it ran.
 *
 * ## The forward-guidance probe
 *
 * The mechanical half of the question is one repeated measurement:
 * `guidance()` tests the *visible* screen text for the vocabulary a player
 * would need in order to work out the next step -- wall, enclose, brick, buy,
 * material, deliver, and the ordinal words a tutorial uses (first, next,
 * then, start, begin). It reports which of those words are present at each
 * state. The word list is the reproducible part; classifying a sentence as
 * guidance or not is done in the note, against the pasted dump.
 *
 * ## Findings live in
 * `docs/research/2026-09-04-the-first-ten-minutes.md`.
 */

const GUIDANCE_WORDS = [
  'wall',
  'enclos',
  'brick',
  'buy',
  'purchas',
  'material',
  'deliver',
  'stock',
  'first',
  'next',
  'then',
  'start',
  'begin',
  'how to',
  'goal',
  'objective',
  'tutorial',
] as const;

/** The whole HUD as a player sees it laid out, newlines squeezed. */
async function screen(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud');
    if (hud === null) return 'HUD ABSENT';
    return (hud.innerText ?? '').replace(/\n{2,}/g, '\n').trim();
  });
}

function guidance(text: string): string {
  const lower = text.toLowerCase();
  const present = GUIDANCE_WORDS.filter((word) => lower.includes(word));
  return present.length === 0 ? '(none of the guidance vocabulary is on screen)' : present.join(', ');
}

/**
 * Fails unless the canvas is the topmost element at that point.
 *
 * This is the guard for the trap the brief names: a press on a HUD-covered
 * point produces no command and no refusal, which is indistinguishable from
 * the game ignoring the player.
 */
async function assertCanvasAt(page: import('@playwright/test').Page, x: number, y: number, label: string): Promise<void> {
  const top = await page.evaluate(
    ([px, py]) => {
      const element = document.elementFromPoint(px as number, py as number);
      if (element === null) return 'nothing';
      return `${element.tagName.toLowerCase()}${element.className === '' ? '' : `.${String(element.className)}`}`;
    },
    [x, y],
  );
  expect(top, `${label}: the point (${x},${y}) is not clear canvas, so a press there proves nothing`).toContain('canvas');
}

/**
 * True when the Build panel is no longer reporting anything left to build.
 *
 * **The second clause is load-bearing and this file paid for it.** An empty
 * queue is not `0 waiting · 0 being built` -- the whole `QUEUED` block is
 * *removed* when nothing is left (recorded in
 * `docs/research/2026-08-30-a-wall-that-buys-itself.md` §2c, "the empty build
 * queue is an *absent* block"), so a poll that only matches the zero readout
 * never terminates. Act 2's first run and act 3's first run both sat out their
 * poll budgets against a queue that had been empty for minutes, and act 3's
 * first run then printed *"the queue emptied 23417 ticks after the wall runs"*,
 * which was this poll giving up rather than anything the game did.
 * `waitForQueueEmpty` in `playtest-harness.ts` has always carried the clause;
 * this file did not, which is exactly the shape of re-deriving a shared
 * harness badly.
 */
function queueIsEmpty(text: string): boolean {
  return /(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT');
}

/** Counts every interaction a player would have to perform. */
class Tally {
  public count = 0;
  private readonly log: string[] = [];
  public constructor(private readonly label: string) {}
  public step(what: string): void {
    this.count += 1;
    this.log.push(`${String(this.count).padStart(2, '0')}. ${what}`);
  }
  public dump(): void {
    console.log(`[${this.label}] === ${this.count} interactions ===`);
    for (const line of this.log) console.log(`[${this.label}] ${line}`);
  }
}

test.describe('the first ten minutes', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60_000);
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') {
        console.log(`[console.${message.type()}] ${message.text().slice(0, 400)}`);
      }
    });
    await installTee(page);
  });

  test('act 1 - what the arrival screen says, before and after New prison', async ({ page }) => {
    await openApp(page);

    const beforeAnything = await screen(page);
    console.log(`[act1] the very first screen, whole HUD:\n${beforeAnything}`);
    console.log(`[act1] guidance vocabulary on the very first screen: ${guidance(beforeAnything)}`);

    // Every button a player can see, in DOM order, with whether it is enabled.
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud button, .hud [role="button"]')]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => `${(node.innerText ?? '').replace(/\n/g, ' ').trim() || '(no label)'}${node.hasAttribute('disabled') ? ' [disabled]' : ''}`),
    );
    console.log(`[act1] ${controls.length} visible control(s) before New prison: ${JSON.stringify(controls)}`);

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    const fresh = await screen(page);
    console.log(`[act1] after New prison, whole HUD:\n${fresh}`);
    console.log(`[act1] guidance vocabulary after New prison: ${guidance(fresh)}`);
    console.log(`[act1] clock: ${JSON.stringify(await currentClock(page))} tick=${await currentTick(page)}`);

    // The five tabs, each dumped whole, with nothing else pressed. This is the
    // whole of what a player can read in their first minute.
    for (const id of ['overview', 'build', 'zones', 'manage', 'day-plan'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(200);
      const text = await screen(page);
      console.log(`[act1] --- tab ${id} ---\n${text}`);
      console.log(`[act1] tab ${id}: guidance vocabulary = ${guidance(text)}`);
      console.log(`[act1] tab ${id}: says the word "cell"? ${/\bcell\b/i.test(text) ? 'YES' : 'no'}`);
    }

    // How much of each catalogue is above its own fold, measured rather than
    // asserted -- #902 is the standing finding, this records the state of it
    // on the tree actually played.
    await tab(page, 'build').click();
    const buildFold = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.hud-build__list');
      if (list === null) return 'ABSENT';
      const listBox = list.getBoundingClientRect();
      const rows = [...list.querySelectorAll<HTMLElement>('[data-buildable]')];
      const visible = rows.filter((row) => {
        const box = row.getBoundingClientRect();
        return box.top >= listBox.top - 1 && box.bottom <= listBox.bottom + 1;
      });
      return JSON.stringify({
        rows: rows.length,
        fullyVisible: visible.length,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight,
        visibleLabels: visible.map((row) => (row.innerText ?? '').replace(/\n/g, ' ').trim()),
      });
    });
    console.log(`[act1] Build catalogue fold: ${buildFold}`);

    await tab(page, 'zones').click();
    const roomsFold = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.hud-rooms__list');
      if (list === null) return 'ABSENT';
      const listBox = list.getBoundingClientRect();
      const rows = [...list.querySelectorAll<HTMLElement>('[data-room]')];
      const visible = rows.filter((row) => {
        const box = row.getBoundingClientRect();
        return box.top >= listBox.top - 1 && box.bottom <= listBox.bottom + 1;
      });
      return JSON.stringify({
        rows: rows.length,
        fullyVisible: visible.length,
        scrollHeight: list.scrollHeight,
        clientHeight: list.clientHeight,
        visibleLabels: visible.map((row) => (row.innerText ?? '').replace(/\n/g, ' ').trim()),
      });
    });
    console.log(`[act1] Rooms catalogue fold: ${roomsFold}`);
  });

  test('act 2 - the naive run, using only what the screen says', async ({ page }) => {
    const tally = new Tally('act2');
    await openApp(page);

    await page.getByRole('button', { name: 'New prison' }).click();
    tally.step('press New prison');
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // ---- N1. The default tab offers exactly one action. Press it.
    console.log(`[act2] N1 the only thing the arrival tab offers: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
    await page.locator('.hud-intake__admit').click();
    tally.step('press Admit a prisoner (the only action on the arrival tab)');
    await page.waitForTimeout(500);
    console.log(`[act2] N1 refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    console.log(`[act2] N1 event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
    console.log(`[act2] N1 alerts: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
    console.log(`[act2] N1 commands the press submitted: ${JSON.stringify((await sentCommands(page)).slice(-3))}`);
    const afterAdmit = await screen(page);
    console.log(`[act2] N1 guidance vocabulary after the refusal: ${guidance(afterAdmit)}`);

    // ---- N2. The hint says "cell". Find a tab with that word on it.
    const tabsWithCell: string[] = [];
    for (const id of ['build', 'zones', 'manage', 'day-plan'] as const) {
      await tab(page, id).click();
      tally.step(`open the ${id} tab, hunting for the word "cell"`);
      await page.waitForTimeout(200);
      const text = await screen(page);
      if (/\bcell\b/i.test(text)) tabsWithCell.push(id);
    }
    console.log(`[act2] N2 tabs whose visible text contains "cell": ${JSON.stringify(tabsWithCell)}`);

    // ---- N3. Zone a cell on open ground. The natural first mistake.
    await tab(page, 'zones').click();
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      tally.step('unfold the Rooms panel');
    }
    // The naive player has to find "Cell" in the list; if it is below the
    // fold that is a press of its own, so it is counted.
    const cellRow = page.locator('.hud-rooms__list [data-room="room.cell"]');
    const cellVisible = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.hud-rooms__list');
      const row = document.querySelector<HTMLElement>('.hud-rooms__list [data-room="room.cell"]');
      if (list === null || row === null) return 'ABSENT';
      const listBox = list.getBoundingClientRect();
      const box = row.getBoundingClientRect();
      return box.top >= listBox.top - 1 && box.bottom <= listBox.bottom + 1 ? 'above the fold' : 'BELOW the fold';
    });
    console.log(`[act2] N3 the Cell row is ${cellVisible}`);
    await cellRow.scrollIntoViewIfNeeded();
    await cellRow.click();
    tally.step('select the Cell room type');
    await page.locator('.hud-rooms__arm').click();
    tally.step('press the Rooms arm control');

    // Calibration is done here, once, and BEFORE the deliberate mistake --
    // `calibrate` presses Remove against empty ground, which leaves its own
    // `nothing-to-remove` refusal standing, and two earlier playtests measured
    // that leftover instead of the thing they were testing.
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    console.log(`[act2] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
    await tab(page, 'zones').click();
    await cellRow.click();
    await page.locator('.hud-rooms__arm').click();

    const nw = centreOf(origin, 12, 12);
    const se = centreOf(origin, 17, 17);
    await assertCanvasAt(page, nw.x, nw.y, 'act2 N3 rectangle north-west');
    await assertCanvasAt(page, se.x, se.y, 'act2 N3 rectangle south-east');
    await drag(page, nw, se);
    tally.step('drag a 6x6 rectangle on open ground');
    const pendingScreen = await screen(page);
    console.log(`[act2] N3 with the rectangle held, whole HUD:\n${pendingScreen}`);
    console.log(`[act2] N3 guidance vocabulary with the rectangle held: ${guidance(pendingScreen)}`);
    await page.locator('.hud-rooms__confirm').click();
    tally.step('press Designate');
    await page.waitForTimeout(800);
    console.log(`[act2] N3 refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    console.log(`[act2] N3 rooms count: ${(await latestCounts(page))?.rooms}`);
    const afterRefusal = await screen(page);
    console.log(`[act2] N3 the whole HUD at the moment of the refusal:\n${afterRefusal}`);
    console.log(`[act2] N3 guidance vocabulary at the refusal: ${guidance(afterRefusal)}`);
    console.log(`[act2] N3 does the word "wall" appear anywhere on screen now? ${/wall/i.test(afterRefusal) ? 'YES' : 'no'}`);

    // ---- N4. The refusal says "enclosed". Go looking for a way to enclose.
    await tab(page, 'build').click();
    tally.step('open the Build tab, looking for a way to enclose an area');
    const buildScreen = await screen(page);
    console.log(`[act2] N4 the Build tab as it arrives:\n${buildScreen}`);
    console.log(`[act2] N4 guidance vocabulary on the Build tab: ${guidance(buildScreen)}`);
    console.log(`[act2] N4 note/hint line: ${JSON.stringify(await panelText(page, '.hud-build__note'))}`);
    console.log(`[act2] N4 queue readout: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    console.log(`[act2] N4 deliveries readout: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    const selectedRow = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.hud-build__list [data-buildable][aria-pressed="true"], .hud-build__list [data-buildable].is-selected');
      return row === null ? 'nothing is pre-selected' : (row.innerText ?? '').replace(/\n/g, ' ').trim();
    });
    console.log(`[act2] N4 the row the panel arrives with selected: ${JSON.stringify(selectedRow)}`);

    // Arm whatever the panel already had selected, without scrolling: the
    // naive player presses the arm control that is in front of them.
    const armLabel = (await page.locator('.hud-build__arm').innerText()).trim();
    console.log(`[act2] N4 arm control label: ${JSON.stringify(armLabel)}`);
    await page.locator('.hud-build__arm').click();
    tally.step(`press the arm control (${armLabel})`);
    await page.waitForTimeout(200);
    console.log(`[act2] N4 note/hint after arming: ${JSON.stringify(await panelText(page, '.hud-build__note'))}`);

    // ---- N5. Four drags around the rectangle, with an empty stock and a
    // paused clock. Nothing has been bought, and nothing said it had to be.
    const westX = origin.originX + 12 * TILE;
    const eastX = origin.originX + 18 * TILE;
    const northY = origin.originY + 12 * TILE;
    const southY = origin.originY + 18 * TILE;
    const runs = [
      { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ];
    let orders = 0;
    for (const run of runs) {
      await assertCanvasAt(page, run.a.x, run.a.y, `act2 N5 ${run.name} start`);
      await assertCanvasAt(page, run.b.x, run.b.y, `act2 N5 ${run.name} end`);
      const before = (await sentCommands(page)).length;
      await drag(page, run.a, run.b);
      tally.step(`drag the ${run.name} wall run`);
      const produced = (await sentCommands(page)).slice(before);
      orders += produced.length;
      console.log(`[act2] N5 ${run.name}: ${produced.length} command(s), first = ${JSON.stringify(produced[0] ?? null)}`);
    }
    console.log(`[act2] N5 total build orders placed with an empty stock and a paused clock: ${orders}`);
    console.log(`[act2] N5 funds now: ${(await latestCounts(page))?.treasuryMinorUnits}`);
    const afterOrders = await screen(page);
    console.log(`[act2] N5 the whole HUD after 24 orders against an empty stock:\n${afterOrders}`);
    console.log(`[act2] N5 guidance vocabulary: ${guidance(afterOrders)}`);
    console.log(`[act2] N5 queue readout: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    console.log(`[act2] N5 refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

    // ---- N6. The clock says PAUSED, so press the transport. A player who
    // has just placed 24 orders and seen nothing happen presses play.
    const transport = page.locator('.hud-strip__transport button');
    console.log(
      `[act2] N6 transport labels: ${JSON.stringify(
        await transport.evaluateAll((nodes) => nodes.map((n) => `${(n.getAttribute('aria-label') ?? n.textContent ?? '').trim()}|pressed=${n.getAttribute('aria-pressed') ?? '-'}`)),
      )}`,
    );
    await transport.nth(1).click();
    tally.step('press the play control');
    await page.waitForTimeout(500);
    console.log(`[act2] N6 clock now: ${JSON.stringify(await currentClock(page))}`);
    const startTick = await currentTick(page);
    // Watch, the way a player watches: three observations over the clock.
    for (let observation = 1; observation <= 3; observation += 1) {
      await page.waitForTimeout(6000);
      const text = await screen(page);
      console.log(
        `[act2] N6 observation ${observation} at tick ${await currentTick(page)}: queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))} | refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))} | event=${JSON.stringify(await panelText(page, '.hud__event'))} | alerts=${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`,
      );
      console.log(`[act2] N6 observation ${observation} guidance vocabulary: ${guidance(text)}`);
    }
    console.log(`[act2] N6 ticks elapsed while watching: ${(await currentTick(page)) - startTick}`);
    const watched = await screen(page);
    console.log(`[act2] N6 the whole HUD after watching the clock run with 24 orders standing:\n${watched}`);

    // Does anything on screen, anywhere, say why nothing is being built?
    const hunt = await page.evaluate(() => {
      const hud = document.querySelector<HTMLElement>('.hud');
      const laidOut = (hud?.innerText ?? '').toLowerCase();
      const inDom = (hud?.textContent ?? '').toLowerCase();
      const probe = (needle: string) => ({ needle, visible: laidOut.includes(needle), inDom: inDom.includes(needle) });
      return JSON.stringify(['await', 'material', 'brick', 'stock', 'buy', 'deliver'].map(probe));
    });
    console.log(`[act2] N6 where each explanatory word lives (visible vs only in the DOM): ${hunt}`);

    // ---- N7. Try to zone again. Still refused?
    await tab(page, 'zones').click();
    tally.step('go back to Rooms and try again');
    const collapsed2 = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsed2 === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      tally.step('unfold the Rooms panel again');
    }
    await cellRow.click();
    tally.step('select Cell again');
    await page.locator('.hud-rooms__arm').click();
    tally.step('arm again');
    await drag(page, nw, se);
    tally.step('drag the rectangle again');
    await page.locator('.hud-rooms__confirm').click();
    tally.step('press Designate again');
    await page.waitForTimeout(800);
    console.log(`[act2] N7 rooms count: ${(await latestCounts(page))?.rooms}`);
    console.log(`[act2] N7 refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    console.log(`[act2] N7 the requirement lines the Rooms panel shows: ${JSON.stringify((await panelText(page, '.hud-rooms')).split('\n').filter((l) => /OPEN|ENCLOS|NEEDS/i.test(l)))}`);

    // ---- N8. Open every fold on the Build tab, counting the presses, and see
    // what the game had been keeping there.
    await tab(page, 'build').click();
    tally.step('open the Build tab again');
    const foldsOpened = await page.evaluate(() => {
      const opened: string[] = [];
      for (const toggle of [...document.querySelectorAll<HTMLElement>('.hud-build [aria-expanded="false"], .hud-build__queue-label, .hud-build__deliveries-header')]) {
        if (toggle.getClientRects().length === 0) continue;
        opened.push((toggle.innerText ?? toggle.getAttribute('aria-label') ?? '').replace(/\n/g, ' ').trim());
      }
      return JSON.stringify(opened);
    });
    console.log(`[act2] N8 shut/foldable things on the Build tab: ${foldsOpened}`);
    for (const selector of ['.hud-build__queue-label', '.hud-build__deliveries-header', '.hud-build__buy-toggle']) {
      const locator = page.locator(selector);
      if ((await locator.count()) > 0 && (await locator.first().isVisible())) {
        await locator.first().click();
        tally.step(`open the fold at ${selector}`);
        await page.waitForTimeout(250);
      }
    }
    const unfolded = await screen(page);
    console.log(`[act2] N8 the Build tab with every fold opened:\n${unfolded}`);
    console.log(`[act2] N8 guidance vocabulary with every fold opened: ${guidance(unfolded)}`);
    console.log(`[act2] N8 queue readout unfolded: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    // ---- N9. Recovery: the player now knows the word "material". Buy.
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) {
      await page.locator('.hud-build__buy-toggle').click();
      tally.step('open the Buy disclosure');
    }
    console.log(`[act2] N9 the Buy disclosure, verbatim: ${JSON.stringify(await panelText(page, '.hud-build__buy'))}`);
    await page.locator('.hud-build__buy .ui-number__input').fill('60');
    tally.step('type a quantity (60 - a guess; nothing on screen says how many)');
    await page.locator('.hud-build__buy-submit').click();
    tally.step('press Buy');
    await page.waitForTimeout(1500);
    console.log(`[act2] N9 funds after buying: ${(await latestCounts(page))?.treasuryMinorUnits}`);
    console.log(`[act2] N9 queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    console.log(`[act2] N9 deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    // Wait for the standing orders to drain, watching in ticks.
    const drainFrom = await currentTick(page);
    let drained = false;
    for (let poll = 0; poll < 90; poll += 1) {
      const queue = await panelText(page, '.hud-build__queue');
      if (queueIsEmpty(queue)) {
        drained = true;
        console.log(`[act2] N9 the queue emptied ${(await currentTick(page)) - drainFrom} ticks after the purchase`);
        break;
      }
      await page.waitForTimeout(2000);
    }
    if (!drained) console.log(`[act2] N9 the queue did NOT empty within the poll budget: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    // ---- N10. Zone, for the third time.
    let zoned = 0;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await tab(page, 'zones').click();
      tally.step('Rooms tab');
      const shut = await page.locator('.hud-rooms').getAttribute('data-collapsed');
      if (shut === 'true') {
        await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
        tally.step('unfold Rooms');
      }
      await cellRow.click();
      tally.step('select Cell');
      await page.locator('.hud-rooms__arm').click();
      tally.step('arm');
      await drag(page, nw, se);
      tally.step('drag the rectangle');
      await page.locator('.hud-rooms__confirm').click();
      tally.step('press Designate');
      await page.waitForTimeout(1000);
      zoned = (await latestCounts(page))?.rooms ?? 0;
      console.log(`[act2] N10 designate attempt ${attempt} at tick ${await currentTick(page)}: rooms=${zoned} | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
      if (zoned > 0) break;
      await page.waitForTimeout(4000);
    }
    console.log(`[act2] N10 rooms=${zoned}`);
    const zonedScreen = await screen(page);
    console.log(`[act2] N10 the whole HUD once a room exists:\n${zonedScreen}`);
    console.log(`[act2] N10 guidance vocabulary once a room exists: ${guidance(zonedScreen)}`);

    // ---- N11. The room is "not ready". Does the screen say what to do?
    console.log(`[act2] N11 rooms panel: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
    await showPanel(page, 'manage', '.hud-intake');
    tally.step('Overview tab');
    await page.locator('.hud-intake__admit').click();
    tally.step('press Admit a prisoner');
    await page.waitForTimeout(1500);
    console.log(`[act2] N11 refusal band after admitting into a bed-less cell: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    console.log(`[act2] N11 counts: ${JSON.stringify(await latestCounts(page))}`);
    console.log(`[act2] N11 intake panel: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

    tally.dump();
    console.log(`[act2] NAIVE RUN: ${tally.count} interactions, final tick ${await currentTick(page)}, counts ${JSON.stringify(await latestCounts(page))}`);
  });

  test('act 4 - the newcomer who never presses Play', async ({ page }) => {
    /*
     * A new session's clock is constructed paused, and the strip says so --
     * `PAUSED`, measured in act 1. But *nothing ties that word to the twenty-four
     * orders standing still*, and a player who has just drawn a prison has no
     * reason to connect the two. This act plays that person: it never touches
     * the transport until the very end, and the last press is there only to
     * prove that the clock was the whole difference.
     */
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    console.log(`[act4] calibration: (${origin.originX}, ${origin.originY})`);
    console.log(`[act4] clock before anything: ${JSON.stringify(await currentClock(page))} tick=${await currentTick(page)}`);

    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const label = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
    if (label.startsWith('place') || label.startsWith('draw')) await page.locator('.hud-build__arm').click();

    const westX = origin.originX + 12 * TILE;
    const eastX = origin.originX + 18 * TILE;
    const northY = origin.originY + 12 * TILE;
    const southY = origin.originY + 18 * TILE;
    let orders = 0;
    for (const run of [
      { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      await assertCanvasAt(page, run.a.x, run.a.y, `act4 ${run.name} start`);
      const before = (await sentCommands(page)).length;
      await drag(page, run.a, run.b);
      orders += (await sentCommands(page)).slice(before).length;
    }
    console.log(`[act4] ${orders} orders placed, clock still ${JSON.stringify(await currentClock(page))}`);
    console.log(`[act4] funds: ${(await latestCounts(page))?.treasuryMinorUnits}`);

    for (let observation = 1; observation <= 3; observation += 1) {
      await page.waitForTimeout(7000);
      console.log(
        `[act4] observation ${observation}: tick=${await currentTick(page)} queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))} clock=${JSON.stringify(await currentClock(page))} speed=${JSON.stringify(await panelText(page, '.hud-clock__speed'))} refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))} alerts=${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`,
      );
    }
    const stalled = await screen(page);
    console.log(`[act4] the whole HUD with 24 orders and a stopped clock:\n${stalled}`);
    console.log(`[act4] guidance vocabulary: ${guidance(stalled)}`);
    // Does any sentence on screen connect a queued order to the clock? The
    // locale has one -- `hud.build.note`, "An order is queued now and built
    // while the clock runs." -- and this is the measurement of whether it is
    // on screen at the moment it is needed.
    console.log(`[act4] is the sentence "built while the clock runs" on screen? ${/built while the clock runs/i.test(stalled) ? 'YES' : 'no'}`);
    console.log(`[act4] does any visible sentence contain the word "clock"? ${/clock/i.test(stalled) ? 'YES' : 'no'}`);

    // And now the one press that was missing.
    await page.locator('.hud-strip__transport button').nth(1).click();
    await page.waitForTimeout(8000);
    console.log(
      `[act4] after one press of Play: tick=${await currentTick(page)} queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))} clock=${JSON.stringify(await currentClock(page))}`,
    );
  });

  test('act 3 - the informed run, the same goal with the order already known', async ({ page }) => {
    const tally = new Tally('act3');
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    tally.step('press New prison');
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    tally.step('Build tab');
    const origin = await calibrate(page);
    console.log(`[act3] calibration: (${origin.originX}, ${origin.originY})`);

    // 1. Buy first. 24 segments x 2 bricks = 48, plus slack; one bed, one toilet.
    for (const [id, quantity] of [
      ['wall-brick', 60],
      ['bed-wooden', 1],
      ['toilet-brick', 1],
    ] as const) {
      await page.locator(`.hud-build__list [data-buildable="${id}"]`).scrollIntoViewIfNeeded();
      await page.locator(`.hud-build__list [data-buildable="${id}"]`).click();
      tally.step(`select ${id}`);
      const buyRow = page.locator('.hud-build__buy');
      if (await buyRow.isHidden()) {
        await page.locator('.hud-build__buy-toggle').click();
        tally.step('open the Buy disclosure');
      }
      await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
      tally.step(`type the quantity ${quantity}`);
      await page.locator('.hud-build__buy-submit').click();
      tally.step(`press Buy for ${id}`);
      await page.waitForTimeout(300);
    }
    console.log(`[act3] funds after buying: ${(await latestCounts(page))?.treasuryMinorUnits}`);

    // 2. Run the clock so the delivery lands.
    const transport = page.locator('.hud-strip__transport button');
    await transport.nth(2).click();
    tally.step('press fast-forward');
    await transport.nth(2).click();
    tally.step('press fast-forward again');
    await page.waitForTimeout(4000);
    console.log(`[act3] deliveries after running: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))} at tick ${await currentTick(page)}`);

    // 3. Four wall runs.
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    tally.step('select the brick wall');
    const armLabel = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
    if (armLabel.startsWith('place') || armLabel.startsWith('draw')) {
      await page.locator('.hud-build__arm').click();
      tally.step('arm the wall tool');
    }
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
      await assertCanvasAt(page, run.a.x, run.a.y, `act3 ${run.name} start`);
      await assertCanvasAt(page, run.b.x, run.b.y, `act3 ${run.name} end`);
      await drag(page, run.a, run.b);
      tally.step(`drag the ${run.name} wall run`);
    }

    // 4. Wait for the queue.
    const from = await currentTick(page);
    for (let poll = 0; poll < 120; poll += 1) {
      const queue = await panelText(page, '.hud-build__queue');
      if (queueIsEmpty(queue)) break;
      await page.waitForTimeout(1500);
    }
    console.log(`[act3] the queue emptied ${(await currentTick(page)) - from} ticks after the wall runs`);

    // 5. Designate.
    let zoned = 0;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      await tab(page, 'zones').click();
      tally.step('Rooms tab');
      const shut = await page.locator('.hud-rooms').getAttribute('data-collapsed');
      if (shut === 'true') {
        await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
        tally.step('unfold Rooms');
      }
      await page.locator('.hud-rooms__list [data-room="room.cell"]').scrollIntoViewIfNeeded();
      await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
      tally.step('select Cell');
      await page.locator('.hud-rooms__arm').click();
      tally.step('arm');
      await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
      tally.step('drag the rectangle');
      await page.locator('.hud-rooms__confirm').click();
      tally.step('press Designate');
      await page.waitForTimeout(900);
      zoned = (await latestCounts(page))?.rooms ?? 0;
      console.log(`[act3] designate attempt ${attempt} at tick ${await currentTick(page)}: rooms=${zoned}`);
      if (zoned > 0) break;
      await page.waitForTimeout(4000);
    }

    // 6. Furniture.
    await tab(page, 'build').click();
    tally.step('Build tab');
    for (const [id, tx, ty] of [
      ['bed-wooden', 13, 13],
      ['toilet-brick', 15, 15],
    ] as const) {
      await page.locator(`.hud-build__list [data-buildable="${id}"]`).scrollIntoViewIfNeeded();
      await page.locator(`.hud-build__list [data-buildable="${id}"]`).click();
      tally.step(`select ${id}`);
      const label = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
      if (label.startsWith('place') || label.startsWith('draw')) {
        await page.locator('.hud-build__arm').click();
        tally.step(`arm ${id}`);
      }
      const point = centreOf(origin, tx, ty);
      await assertCanvasAt(page, point.x, point.y, `act3 ${id} placement`);
      const produced = await press(page, point.x, point.y);
      tally.step(`place ${id}`);
      console.log(`[act3] ${id} at (${tx},${ty}) produced ${JSON.stringify(produced)}`);
    }
    const fromFurniture = await currentTick(page);
    for (let poll = 0; poll < 120; poll += 1) {
      const queue = await panelText(page, '.hud-build__queue');
      if (queueIsEmpty(queue)) break;
      await page.waitForTimeout(1500);
    }
    console.log(`[act3] furniture built ${(await currentTick(page)) - fromFurniture} ticks later; counts ${JSON.stringify(await latestCounts(page))}`);

    // 7. Admit.
    await showPanel(page, 'manage', '.hud-intake');
    tally.step('Overview tab');
    await page.locator('.hud-intake__admit').click();
    tally.step('press Admit a prisoner');
    await page.waitForTimeout(2500);
    console.log(`[act3] refusal band after admitting: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    console.log(`[act3] counts: ${JSON.stringify(await latestCounts(page))}`);
    console.log(`[act3] intake panel: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

    tally.dump();
    console.log(`[act3] INFORMED RUN: ${tally.count} interactions, final tick ${await currentTick(page)}`);
  });
});
