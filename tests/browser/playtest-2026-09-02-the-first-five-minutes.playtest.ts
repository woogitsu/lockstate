import { expect, type Page, test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buy,
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
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * A bounded per-action timeout, on every page this file opens.
 *
 * `playwright.playtest.config.ts` sets `expect.timeout` but no default
 * `actionTimeout`, so a `.click()` on a control that never becomes visible
 * waits with **no timeout at all** rather than failing fast — measured here:
 * act 4's first draft picked an off-screen tile pair (see its own comment)
 * and the resulting `.click()` on a `.hud-rooms__confirm` that was never
 * laid out ran past this file's own 120s harness timeout with no output.
 * 30s turns that class of instrument mistake into a fast, readable failure
 * instead of a silent hang.
 */
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(30_000);
});

/**
 * **Playing the first five minutes: a brand-new player, using only what the
 * screen tells them.**
 *
 * `tests/browser/playwright.config.ts` collects `*.spec.ts` only, so nothing
 * in CI runs this file. It is driven by hand through
 * `tests/browser/playwright.playtest.config.ts`, one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5340 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-02-the-first-five-minutes.playtest.ts -g "act 1" --reporter=line
 * ```
 *
 * **The assignment is not "play the mechanisms"** — five prior playtests the
 * same day already did money, rooms, save/reload, alerts and people, each
 * against one system. This one asks whether a player who has never opened
 * this repository can get anywhere at all, reading nothing but the screen:
 * can they zone a room, put a bed in it, and get a resident, without being
 * told outside the game? Where does that chain break, and what does the game
 * say when it does?
 *
 * Findings live in
 * `docs/research/2026-09-02-the-first-five-minutes.md`.
 *
 * Acts log rather than hard-assert on most steps, on the established reason
 * in every prior playtest here: a playtest that fails on its first finding
 * stops before the act that would have found the next one. Every observation
 * reads the DOM (`innerText`, `getAttribute`) or the simulation's own tick
 * counter, never wall-clock time and never simulation state read directly —
 * `docs/AGENT_WORKFLOW.md`'s "read the screen, not the store".
 *
 * **Ticks, not wall-clock, for anything timed.** `currentTick` reads
 * `simulation/clock-state`, which is published on every tick regardless of
 * whether anything else changed (`playtest-harness.ts`'s own comment on why
 * `simulation/status-counts` is the wrong channel to time against).
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/**
 * Every status-strip chip's live accessible surface: its visible text, its
 * `title`, and whether it carries a screen-reader-only sentence beyond that
 * text — read off the assembled page, not off `HudMetricDescriptor`'s own
 * shape in `src/ui/hud/projection.ts`, so a mismatch between the source
 * comment and what actually painted would show up here.
 */
interface ChipReading {
  readonly metric: string | null;
  readonly label: string;
  readonly value: string;
  readonly chipTitle: string | null;
  readonly srOnlyText: string | null;
}

async function readChips(page: Page): Promise<readonly ChipReading[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-strip__metrics [data-metric]')].map((chip) => {
      const label = chip.querySelector<HTMLElement>('.ui-stat__label')?.textContent?.trim() ?? '';
      const value = chip.querySelector<HTMLElement>('.ui-stat__value')?.textContent?.trim() ?? '';
      const srOnly = chip.querySelector<HTMLElement>('.ui-sr-only');
      return {
        metric: chip.getAttribute('data-metric'),
        label,
        value,
        chipTitle: chip.getAttribute('title'),
        srOnlyText: srOnly === null ? null : (srOnly.textContent ?? '').trim() || null,
      };
    }),
  );
}

/* ==================================================================== */
/* Act 1 — the very first screen, before and immediately after           */
/* "New prison", read exactly as a first-time player would               */
/* ==================================================================== */

test('act 1: the first screen a player sees, and the default tab', async ({ page }) => {
  await installTee(page);
  await openApp(page);

  log('act1', `page title: ${await page.title()}`);
  log('act1', `save panel, before any prison exists: ${JSON.stringify(await panelText(page, '.save-panel'))}`);
  log('act1', `hud region, before any prison exists (does it even exist?): ${await panelText(page, '.hud')}`);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  // `currentTick` reads the last `simulation/clock-state` message the tee has
  // seen; the UI's own paint (the day label above) can land a frame before
  // that channel's first message does, so a read with no wait at all can
  // read -1. Waited out here rather than reported as a finding: it says
  // something about this harness's two channels, nothing about what a player
  // sees, and `.hud-clock__day` already reading "1" is the on-screen fact.
  await page.waitForTimeout(200);
  log('act1', `tick right after New prison (200ms settle): ${await currentTick(page)}`);

  // `hud.ts` stamps `data-active-tab` on `.hud` itself (`hud.dataset['activeTab']
  // = state.activeTab`), not on `.hud__tabs` — read wrong once here and
  // corrected before trusting it. The tab bar's own selection attribute is
  // `aria-current`, not `aria-selected`: `hud.ts` passes `selection:
  // 'aria-current'` to `createTabButton`, whose own comment says why
  // (`aria-selected` needs a real `tablist`/`tabpanel` pairing this bar does
  // not have yet) — read as `aria-selected` first, which is why every tab
  // below would otherwise have printed `null`.
  const activeTab = await page.locator('.hud').getAttribute('data-active-tab');
  log('act1', `.hud data-active-tab: ${activeTab}`);
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    const el = tab(page, id);
    const label = (await el.innerText()).trim();
    const active = await el.getAttribute('aria-current');
    log('act1', `tab "${id}": label=${JSON.stringify(label)} aria-current=${active}`);
  }

  // What the default (Overview) tab actually shows — this is the very first
  // content-bearing thing on screen after New prison, before any click into
  // another tab.
  log('act1', `Overview/.hud-intake panel, verbatim: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  const admit = page.locator('.hud-intake__admit');
  log('act1', `Admit button label: ${JSON.stringify((await admit.innerText()).trim())}`);
  log('act1', `Admit button disabled attribute (with zero cells zoned): ${await admit.getAttribute('disabled')}`);

  log('act1', `status strip, verbatim: ${JSON.stringify((await panelText(page, '.hud-strip')).replace(/\n/g, ' | '))}`);
  const chips = await readChips(page);
  log('act1', `status strip chips, ${chips.length} of them: ${JSON.stringify(chips)}`);
});

/* ==================================================================== */
/* Act 2 — pressing the one button the default tab offers, before        */
/* anything else exists, and finding out where (if anywhere) the game    */
/* says why it did nothing                                               */
/* ==================================================================== */

test('act 2: pressing Admit on a prison with no cell at all', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  const beforeTick = await currentTick(page);
  const before = (await sentCommands(page)).length;
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(300);
  const produced = (await sentCommands(page)).slice(before);
  log('act2', `tick before/after the press: ${beforeTick} / ${await currentTick(page)}`);
  log('act2', `command(s) the press actually submitted: ${JSON.stringify(produced)}`);

  // Every place a refusal could plausibly surface, read simultaneously so
  // whichever one (if any) lit up is on the record rather than assumed from
  // the source comment alone.
  log('act2', `.hud__refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log('act2', `.hud__event band: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
  log('act2', `.hud-alerts__list: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  log('act2', `Intake panel after the press: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  log('act2', `status strip after the press: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  const counts = await latestCounts(page);
  log('act2', `simulation counts after the press: ${JSON.stringify(counts)}`);
});

/* ==================================================================== */
/* Act 3 — the Rooms tab's built-in disclosure: what does it say about   */
/* a room type before a single tile is drawn?                            */
/* ==================================================================== */

test('act 3: what the Rooms tab tells a player before they draw anything', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'rooms').click();
  if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  }
  log('act3', `Rooms panel, nothing selected yet: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

  // Every row the catalogue actually offers, in the order it lists them, and
  // whether the list itself carries any per-row facts (as opposed to a name
  // only) before a row is selected.
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-rooms__list [data-room]')].map((row) => ({
      roomId: row.getAttribute('data-room'),
      text: (row.textContent ?? '').trim(),
    })),
  );
  log('act3', `catalogue rows before any selection (${rows.length}): ${JSON.stringify(rows)}`);

  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  log('act3', `Rooms panel after selecting "Cell", verbatim: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
});

/* ==================================================================== */
/* Act 4 — the natural first mistake: draw a Cell directly on open,      */
/* unwalled ground, the way a player following the Intake hint ("a       */
/* prison needs a cell") would, with no idea yet that a cell needs walls */
/* ==================================================================== */

test('act 4: zoning a cell on open ground before any wall exists', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log('act4', `calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  await tab(page, 'rooms').click();
  if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  }
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  await page.locator('.hud-rooms__arm').click();

  /*
   * **First attempt at this act used tiles (2,2)-(6,6), and it hung the
   * `.hud-rooms__confirm` click forever rather than reporting anything.**
   * `calibrate()` measured this run's origin at `(-304, -574)` — this
   * config's 1440x900 default viewport puts the camera somewhere this
   * session's earlier playtests at 1280x800 never landed — so tile (2,2)'s
   * *centre* was screen point `(-144, -414)`: off the visible viewport
   * entirely, in negative coordinates. The mouse events landed nowhere real,
   * no rectangle was ever held, and `.hud-rooms__confirm` stayed not laid
   * out while Playwright's `.click()` waited for it with no timeout
   * configured on this action (`playwright.playtest.config.ts` sets
   * `expect.timeout` but not a default `actionTimeout`) — a genuine hang,
   * not a slow pass. This is a bug in this instrument's own choice of tile,
   * not in the product: (12,12)-(17,17), the footprint every other playtest
   * in this repository already builds at, is on-screen precisely because it
   * was chosen for that reason (see `buildAndPopulate` and
   * `buildResilientCell` elsewhere in this directory). Reusing that
   * footprint here too, at row 12 rather than row 2.
   */
  await drag(page, centreOf(origin, 12, 12), centreOf(origin, 16, 16));
  const preConfirm = await panelText(page, '.hud-rooms');
  log('act4', `Rooms panel with the rectangle held, before Confirm is pressed: ${JSON.stringify(preConfirm)}`);
  const confirmDisabled = await page.locator('.hud-rooms__confirm').getAttribute('disabled');
  log('act4', `Confirm control's disabled attribute: ${confirmDisabled}`);

  const beforeTick = await currentTick(page);
  const before = (await sentCommands(page)).length;
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(500);
  const produced = (await sentCommands(page)).slice(before);
  log('act4', `tick of the confirm press: ${beforeTick} (now ${await currentTick(page)})`);
  log('act4', `command(s) Confirm actually submitted: ${JSON.stringify(produced)}`);
  log('act4', `refusal band right after: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log('act4', `Rooms panel right after the refused confirm: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  const counts = await latestCounts(page);
  log('act4', `rooms count after the refused attempt: ${counts?.rooms}`);
});

/* ==================================================================== */
/* Act 5 — building the walls (the resilient way, clear of the minimap), */
/* then zoning the same rectangle: does it work, and does the refusal   */
/* band from act 4's mistake still say something false about it?        */
/* ==================================================================== */

async function wallSide(
  page: Page,
  tiles: readonly { readonly x: number; readonly y: number }[],
  dragA: { readonly x: number; readonly y: number },
  dragB: { readonly x: number; readonly y: number },
  pointFor: (tile: { readonly x: number; readonly y: number }) => { readonly x: number; readonly y: number },
): Promise<{ readonly byDrag: number; readonly repairs: readonly string[]; readonly stillMissing: readonly string[] }> {
  const key = (t: { readonly x: number; readonly y: number }) => `${t.x},${t.y}`;
  const missingOf = async (): Promise<readonly { readonly x: number; readonly y: number }[]> => {
    const all = await sentCommands(page);
    const got = new Set(all.map((c) => `${String(c['x'])},${String(c['y'])}`));
    return tiles.filter((t) => !got.has(key(t)));
  };

  const before = (await sentCommands(page)).length;
  await drag(page, dragA, dragB);
  const byDrag = (await sentCommands(page)).length - before;

  const repairs: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const missing = await missingOf();
    if (missing.length === 0) break;
    const points = missing.map(pointFor);
    const a = points[0]!;
    const b = points[points.length - 1]!;
    repairs.push(`re-drag over ${JSON.stringify(missing.map((t) => `${t.x},${t.y}`))}`);
    await drag(page, a, b);
  }
  for (const tile of await missingOf()) {
    const point = pointFor(tile);
    await press(page, point.x, point.y);
  }
  const stillMissing = (await missingOf()).map((t) => `${t.x},${t.y}`);
  return { byDrag, repairs, stillMissing };
}

interface BuiltCell {
  readonly origin: { readonly originX: number; readonly originY: number };
  readonly westTile: number;
  readonly eastTile: number;
}

/**
 * A 6x6 walled cell — no bed, no toilet, nothing zoned yet — clear of
 * `.hud-minimap`, whose live rect is read rather than assumed (the exact
 * hazard this branch's brief names: at 1280x800 it measured `x:12 y:317.8
 * w:398 h:401` with `pointer-events: auto`, silently swallowing wall clicks).
 */
async function buildWalls(
  page: Page,
  label: string,
  // A caller that already has an origin passes it so this function does not
  // call `calibrate()` a second time. `calibrate()` presses the Remove tool
  // to bisect the screen-to-tile transform (`playtest-harness.ts`), which is
  // itself a real command and leaves its own "nothing to remove" refusal
  // standing in `.hud__refusal` -- act 5 measured this directly: calling it
  // between a genuine mistake and the genuine success it wanted to compare
  // against overwrote the mistake's own refusal with the calibration probe's,
  // and produced a false read of the very thing being measured.
  precomputedOrigin?: { readonly originX: number; readonly originY: number },
): Promise<BuiltCell> {
  const log2 = (line: string) => console.log(`[${label}] ${line}`);
  await tab(page, 'build').click();
  const origin = precomputedOrigin ?? (await calibrate(page));

  const minimapRect = await page.evaluate(() => {
    const el = document.querySelector('.hud-minimap');
    if (el === null || (el as HTMLElement).offsetParent === null) return undefined;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  const tileShift =
    minimapRect === undefined ? 0 : Math.max(0, Math.ceil((minimapRect.right + 40 - origin.originX) / TILE) - 12);
  log2(`.hud-minimap rect: ${JSON.stringify(minimapRect)} — tile shift applied to clear it: ${tileShift}`);

  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', 3);
  await buy(page, 'toilet-brick', 2);

  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(150);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.waitForTimeout(3_000);

  await armBuildable(page, 'wall-brick');
  const westTile = 12 + tileShift;
  const eastTile = 18 + tileShift;
  const westX = origin.originX + westTile * TILE;
  const eastX = origin.originX + eastTile * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  const columns = [0, 1, 2, 3, 4, 5].map((i) => westTile + i);
  const rows = [12, 13, 14, 15, 16, 17];

  const sides: Record<string, { byDrag: number; repairs: readonly string[]; stillMissing: readonly string[] }> = {};
  sides['north'] = await wallSide(
    page,
    columns.map((x) => ({ x, y: 12 })),
    { x: westX + TILE / 2, y: northY },
    { x: eastX - TILE / 2, y: northY },
    (t) => ({ x: centreOf(origin, t.x, t.y).x, y: northY }),
  );
  sides['south'] = await wallSide(
    page,
    columns.map((x) => ({ x, y: 18 })),
    { x: westX + TILE / 2, y: southY },
    { x: eastX - TILE / 2, y: southY },
    (t) => ({ x: centreOf(origin, t.x, t.y).x, y: southY }),
  );
  sides['west'] = await wallSide(
    page,
    rows.map((y) => ({ x: westTile, y })),
    { x: westX, y: northY + TILE / 2 },
    { x: westX, y: southY - TILE / 2 },
    (t) => ({ x: westX, y: centreOf(origin, t.x, t.y).y }),
  );
  sides['east'] = await wallSide(
    page,
    rows.map((y) => ({ x: eastTile, y })),
    { x: eastX, y: northY + TILE / 2 },
    { x: eastX, y: southY - TILE / 2 },
    (t) => ({ x: eastX, y: centreOf(origin, t.x, t.y).y }),
  );
  for (const [name, side] of Object.entries(sides)) {
    log2(`wall ${name}: ${side.byDrag} by the drag; repairs: ${JSON.stringify(side.repairs)}; still missing: ${JSON.stringify(side.stillMissing)}`);
  }

  const beforeQueueEmpty = await currentTick(page);
  await waitForQueueEmpty(page);
  log2(`queue emptied between tick ${beforeQueueEmpty} and tick ${await currentTick(page)}`);

  return { origin, westTile, eastTile };
}

test('act 5: build the walls, then zone the same rectangle — does the stale refusal from a real mistake still lie?', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  // Reproduce act 4's honest mistake first, in the same session, the way a
  // real first five minutes would actually happen: try before building
  // walls, get refused, *then* build and succeed.
  //
  // `calibrate()` presses `.hud-build__remove`, which is only laid out while
  // the Build tab is active — a fresh session's default tab is Overview
  // (`hud-state.ts`'s `activeTab: 'overview'`), so calling it before this
  // line ran into exactly the 30s guard added after act 4's hang: the
  // control existed in the DOM but was never visible. Caught by that guard
  // in seconds rather than by another silent hang.
  await tab(page, 'build').click();
  const origin0 = await calibrate(page);
  await tab(page, 'rooms').click();
  if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  }
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  await page.locator('.hud-rooms__arm').click();
  // Tiles (12,20)-(16,24): on the same on-screen column act 4 found safe
  // (see its comment on why (2,2) hung this instrument), at a row clear of
  // the walled cell `buildWalls` puts at rows 12-17 below, so this failed
  // attempt and the later success are genuinely two different rectangles —
  // the exact shape act 3's rooms-surface playtest measured the stale
  // refusal band under.
  await drag(page, centreOf(origin0, 12, 20), centreOf(origin0, 16, 24));
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(500);
  log('act5', `first (open-ground) attempt refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log('act5', `rooms count after the mistake: ${(await latestCounts(page))?.rooms}`);

  const built = await buildWalls(page, 'act5', origin0);

  let zoned = false;
  let attempts = 0;
  for (; attempts < 12 && !zoned; attempts += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(built.origin, built.westTile, 12), centreOf(built.origin, built.eastTile - 1, 17));
    const enclosurePreview = await panelText(page, '.hud-rooms');
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    zoned = (counts?.rooms ?? 0) > 0;
    log(
      'act5',
      `zone attempt ${attempts + 1} at tick ${await currentTick(page)}: rooms=${counts?.rooms}` +
        ` | enclosure line(s): ${JSON.stringify(enclosurePreview.split('\n').filter((l) => /OPEN|ENCLOS/i.test(l)))}` +
        ` | refusal band NOW says: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
    );
    if (!zoned) await page.waitForTimeout(4_000);
  }
  log('act5', `zoned: ${zoned} after ${attempts} attempt(s)`);

  // The key question this act exists to answer: once the zoning has
  // genuinely succeeded, does the band still show act 4/5's earlier failure?
  const refusalAfterSuccess = await panelText(page, '.hud__refusal');
  log('act5', `refusal band read again, 1200ms after a real success: ${JSON.stringify(refusalAfterSuccess)}`);
  await page.waitForTimeout(1200);
  log('act5', `refusal band once more, +1200ms: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);

  // What the Rooms panel says about the freshly-zoned, empty cell — this is
  // the game's own answer to "what do I do next", if it has one.
  log('act5', `Rooms panel right after zoning (should show what is still needed): ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
});

/* ==================================================================== */
/* Act 6 — a bed alone, no toilet: is a resident reachable, and does     */
/* "Not ready" then say something true?                                 */
/* ==================================================================== */

test('act 6: a bed with no toilet — reachable resident, and what "Not ready" says while one object is still missing', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  const built = await buildWalls(page, 'act6');

  let zoned = false;
  for (let attempts = 0; attempts < 12 && !zoned; attempts += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(built.origin, built.westTile, 12), centreOf(built.origin, built.eastTile - 1, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    zoned = ((await latestCounts(page))?.rooms ?? 0) > 0;
    if (!zoned) await page.waitForTimeout(4_000);
  }
  log('act6', `zoned: ${zoned}`);
  log('act6', `Rooms panel immediately after zoning, no furniture placed yet: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

  // One bed only. No toilet.
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  const bedPoint = centreOf(built.origin, built.westTile, 12);
  await press(page, bedPoint.x, bedPoint.y);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(1500);
  const afterBed = await latestCounts(page);
  log('act6', `after one bed, no toilet, tick ${afterBed?.tick}: roomCapacity=${afterBed?.roomCapacity} accommodationCapacity=${afterBed?.accommodationCapacity}`);

  await tab(page, 'rooms').click();
  log('act6', `Rooms panel with a bed and no toilet: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

  await tab(page, 'overview').click();
  const beforeAdmitTick = await currentTick(page);
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(1500);
  const afterAdmit = await latestCounts(page);
  log(
    'act6',
    `admit pressed at tick ${beforeAdmitTick}, prisoners now ${afterAdmit?.prisoners}, occupants ${afterAdmit?.roomOccupants}` +
      ` (tick ${afterAdmit?.tick})`,
  );
  log('act6', `Intake panel after the press: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);
  log('act6', `Rooms panel after the admission (still "Not ready" for the missing toilet?): ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
});

/* ==================================================================== */
/* Act 7 — the whole chain end to end, ticks counted throughout, and     */
/* the status strip's nine chips read for an accessible name             */
/* ==================================================================== */

test('act 7: the whole chain end to end, and what the nine status-strip chips explain about themselves', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  const startTick = await currentTick(page);

  const built = await buildWalls(page, 'act7');

  let zoned = false;
  for (let attempts = 0; attempts < 12 && !zoned; attempts += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(built.origin, built.westTile, 12), centreOf(built.origin, built.eastTile - 1, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    zoned = ((await latestCounts(page))?.rooms ?? 0) > 0;
    if (!zoned) await page.waitForTimeout(4_000);
  }
  const zonedTick = await currentTick(page);
  log('act7', `zoned: ${zoned} at tick ${zonedTick} (started at tick ${startTick})`);

  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  await press(page, centreOf(built.origin, built.westTile, 12).x, centreOf(built.origin, built.westTile, 12).y);
  await armBuildable(page, 'toilet-brick');
  await press(page, centreOf(built.origin, built.westTile, 16).x, centreOf(built.origin, built.westTile, 16).y);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(1500);
  const furnishedTick = await currentTick(page);
  log('act7', `furnished (bed + toilet) by tick ${furnishedTick}`);
  log('act7', `Rooms panel once fully furnished (should read ready): ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

  await tab(page, 'overview').click();
  await page.locator('.hud-intake__admit').click();
  await page.waitForTimeout(1500);
  const admittedTick = await currentTick(page);
  const finalCounts = await latestCounts(page);
  log(
    'act7',
    `admitted by tick ${admittedTick}: prisoners=${finalCounts?.prisoners} occupants=${finalCounts?.roomOccupants}` +
      ` — total ticks from New Prison to a housed resident: ${admittedTick - startTick}`,
  );
  log('act7', `final Intake panel: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

  // The nine status-strip chips, and which of them explains itself.
  const chips = await readChips(page);
  log('act7', `all ${chips.length} status-strip chips at the end of the chain: ${JSON.stringify(chips, null, 0)}`);
  const withDescription = chips.filter((c) => c.chipTitle !== null && c.chipTitle !== '');
  log('act7', `chips carrying a title/description (${withDescription.length} of ${chips.length}): ${JSON.stringify(withDescription.map((c) => c.metric))}`);

  // Money's unit, read off the FUNDS chip exactly as painted.
  const funds = chips.find((c) => c.metric === 'funds');
  log('act7', `FUNDS chip as painted: label=${JSON.stringify(funds?.label)} value=${JSON.stringify(funds?.value)} title=${JSON.stringify(funds?.chipTitle)}`);
});
