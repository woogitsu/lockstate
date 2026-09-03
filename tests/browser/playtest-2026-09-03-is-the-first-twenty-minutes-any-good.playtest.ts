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
 * **Is the first twenty minutes of a new prison any good?**
 *
 * Not a bug hunt. This file plays as somebody who has never seen the game,
 * and measures the things a player would feel: what is on screen at second
 * zero, how many presses the three commonest actions cost, how long the
 * player sits stuck, whether anything ever tells them they are doing well.
 *
 * `tests/browser/playwright.config.ts` collects `*.spec.ts` only, so **CI
 * never runs this file**. It is driven by hand:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5371 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-is-the-first-twenty-minutes-any-good.playtest.ts \
 *   -g "act 1"
 * ```
 *
 * Findings live in
 * `docs/research/2026-09-03-is-the-first-twenty-minutes-any-good.md`.
 *
 * Acts log rather than assert, on the established reason in every playtest
 * here: a file that fails on its first finding never reaches the act that
 * would have found the next one. Every observation reads the screen
 * (`innerText`, `getAttribute`, a screenshot) or the worker's own tick
 * counter -- never wall-clock for anything timed, never simulation state
 * read directly.
 */

const SHOTS = 'docs/research/playtest-2026-09-03-twenty-minutes';

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(30_000);
});

/** Everything a sighted player can read, in DOM order, with its box. */
async function visibleSurface(page: Page): Promise<readonly { text: string; role: string; box: string }[]> {
  return page.evaluate(() => {
    const out: { text: string; role: string; box: string }[] = [];
    const seen = new Set<Element>();
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (node.hidden) continue;
      const rects = node.getClientRects();
      if (rects.length === 0) continue;
      const style = window.getComputedStyle(node);
      if (style.visibility === 'hidden' || style.opacity === '0') continue;
      // leaf-ish text holders only
      const own = Array.from(node.childNodes)
        .filter((c) => c.nodeType === Node.TEXT_NODE)
        .map((c) => (c.textContent ?? '').trim())
        .filter((t) => t.length > 0)
        .join(' ');
      if (own.length === 0) continue;
      if (seen.has(node)) continue;
      seen.add(node);
      const r = rects[0]!;
      out.push({
        text: own,
        role: `${node.tagName.toLowerCase()}${node.className === '' ? '' : `.${String(node.className).split(' ')[0]}`}`,
        box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      });
    }
    return out;
  });
}

/** Every control a player could press, and whether it is pressable. */
async function controls(page: Page): Promise<readonly { label: string; sel: string; enabled: boolean }[]> {
  return page.evaluate(() => {
    const out: { label: string; sel: string; enabled: boolean }[] = [];
    for (const node of Array.from(
      document.querySelectorAll<HTMLElement>('button, [role="button"], input, select, a[href]'),
    )) {
      if (node.hidden || node.getClientRects().length === 0) continue;
      const cls = node.className === '' ? '' : `.${String(node.className).split(' ')[0]}`;
      out.push({
        label: (node.innerText ?? (node as HTMLInputElement).value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        sel: `${node.tagName.toLowerCase()}${cls}`,
        enabled: !(node as HTMLButtonElement).disabled,
      });
    }
    return out;
  });
}

test('act 1 -- the first sixty seconds: what is on screen, and what does it invite', async ({ page }) => {
  const act = 'act 1';
  await installTee(page);
  const openedAt = Date.now();
  await openApp(page);
  log(act, `openApp resolved after ${Date.now() - openedAt} ms`);

  await page.screenshot({ path: `${SHOTS}/01-second-zero.png`, fullPage: false });

  const clock = await currentClock(page);
  log(act, `clock at arrival: ${JSON.stringify(clock)}`);
  log(act, `tick at arrival: ${await currentTick(page)}`);

  const surface = await visibleSurface(page);
  log(act, `--- ${surface.length} readable text nodes on arrival ---`);
  for (const s of surface) log(act, `  [${s.box}] ${s.role}: ${s.text}`);

  const ctl = await controls(page);
  log(act, `--- ${ctl.length} pressable controls on arrival (${ctl.filter((c) => !c.enabled).length} disabled) ---`);
  for (const c of ctl) log(act, `  ${c.enabled ? ' ' : 'x'} ${c.sel}: ${c.label}`);

  // What does the game itself say it wants?
  for (const sel of [
    '.hud-strip',
    '.hud__tabs',
    '.hud-overview',
    '.hud-alerts',
    '.hud-alerts__list',
    '.hud-objectives',
    '.hud-refusal',
    '.save-panel',
  ]) {
    log(act, `${sel} => ${JSON.stringify(await panelText(page, sel))}`);
  }

  // Is the world doing anything at all before the player presses anything?
  const before = await latestCounts(page);
  await page.waitForTimeout(20_000);
  const after = await latestCounts(page);
  log(act, `counts after 20 s idle: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  log(act, `tick after 20 s idle: ${await currentTick(page)}`);
  await page.screenshot({ path: `${SHOTS}/02-after-20s-idle.png` });

  expect(surface.length).toBeGreaterThan(0);
});

test('act 2 -- what a naive player presses, in the order the screen suggests', async ({ page }) => {
  const act = 'act 2';
  await installTee(page);
  await openApp(page);

  /*
   * The brightest, largest, highest-contrast control on the arrival screen is
   * `Admit a prisoner` (filled accent fill, 246x44 at 1173,720). The control
   * that the game actually needs first -- `New prison` -- is a dim 99x44
   * outline button in a corner panel. A player presses the bright one. So do
   * we, and we record what the game says back.
   */
  const bright = page.locator('.hud-intake__admit');
  log(act, `press 1: the brightest button, "${(await bright.innerText()).trim()}"`);
  await bright.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/03-pressed-admit-with-no-prison.png` });
  log(act, `commands sent: ${JSON.stringify(await sentCommands(page))}`);
  for (const sel of ['.hud-refusal', '.hud-alerts__list', '.hud-intake']) {
    log(act, `  ${sel} => ${JSON.stringify(await panelText(page, sel))}`);
  }

  // Now the five tabs, in the order they are laid out. What is behind each,
  // before a prison exists?
  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(400);
    const body = await panelText(page, '.hud__panel');
    log(act, `tab ${id} (no prison) => ${JSON.stringify(body.slice(0, 700))}`);
    const ctl = await controls(page);
    log(act, `  ${ctl.length} controls, ${ctl.filter((c) => !c.enabled).length} disabled`);
    await page.screenshot({ path: `${SHOTS}/04-tab-${id}-no-prison.png` });
  }

  // Give up and press New prison. How many presses did the first one cost?
  log(act, '--- pressing New prison ---');
  const t0 = Date.now();
  await page.locator('.save-panel__button', { hasText: 'New prison' }).click();
  await page.waitForTimeout(2000);
  log(act, `after New prison: tick=${await currentTick(page)} clock=${JSON.stringify(await currentClock(page))}`);
  log(act, `save-panel => ${JSON.stringify(await panelText(page, '.save-panel'))}`);
  log(act, `strip => ${JSON.stringify(await panelText(page, '.hud-strip'))}`);
  log(act, `alerts => ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  log(act, `New prison settled in ${Date.now() - t0} ms`);
  await page.screenshot({ path: `${SHOTS}/05-after-new-prison.png` });

  // Does the world appear? Is the clock running, or still paused?
  await page.waitForTimeout(10_000);
  log(act, `10 s later: tick=${await currentTick(page)} clock=${JSON.stringify(await currentClock(page))}`);
  log(act, `strip => ${JSON.stringify(await panelText(page, '.hud-strip'))}`);
  await page.screenshot({ path: `${SHOTS}/06-new-prison-plus-10s.png` });

  // And what does the game now tell the player to do next?
  await tab(page, 'overview').click();
  await page.waitForTimeout(500);
  log(act, `overview panel => ${JSON.stringify(await panelText(page, '.hud__panel'))}`);
  await page.screenshot({ path: `${SHOTS}/07-overview-with-prison.png` });
});

/** Counts every discrete interaction a human hand would make. */
class Hand {
  private n = 0;
  private readonly ledger: string[] = [];
  constructor(private readonly act: string) {}
  count(what: string): void {
    this.n += 1;
    this.ledger.push(`${this.n}. ${what}`);
  }
  get total(): number {
    return this.n;
  }
  report(label: string): void {
    log(this.act, `--- ${label}: ${this.n} interactions ---`);
    for (const line of this.ledger) log(this.act, `  ${line}`);
  }
}

test('act 3 -- building the first cell with the mouse, counting every press', async ({ page }) => {
  const act = 'act 3';
  const hand = new Hand(act);
  await installTee(page);
  await openApp(page);

  await page.locator('.save-panel__button', { hasText: 'New prison' }).click();
  hand.count('press New prison');
  await page.waitForTimeout(2500);

  // Find the refusal band's real selector, since '.hud-refusal' is absent.
  const bandInfo = await page.evaluate(() => {
    const hit = Array.from(document.querySelectorAll<HTMLElement>('body *')).find(
      (n) => (n.innerText ?? '').includes('was refused') && n.children.length === 0,
    );
    return hit === undefined ? 'no band' : `${hit.tagName.toLowerCase()}.${String(hit.className)}`;
  });
  log(act, `refusal band element: ${bandInfo}`);

  await tab(page, 'build').click();
  hand.count('press the BUILD tab');
  await page.waitForTimeout(500);

  // calibrate presses the Remove tool twice; a player would not, so it is not
  // charged to the hand. It needs the Build panel laid out, hence the order.
  const origin = await calibrate(page);
  log(act, `world origin: ${JSON.stringify(origin)}`);

  // The arrival selection is already Brick wall, and the arm button says
  // "Place on map". A player presses it.
  const armLabel = (await page.locator('.hud-build__arm').innerText()).trim();
  log(act, `arm button reads: ${JSON.stringify(armLabel)}`);
  await page.locator('.hud-build__arm').click();
  hand.count(`press "${armLabel}"`);
  await page.waitForTimeout(300);

  /*
   * Now the player drags four wall runs to enclose a 6x6 cell. The tiles are
   * chosen inside the *visibly reachable* band -- the HUD islands eat drags,
   * so a naive player's first attempt lands somewhere reasonable-looking and
   * we record what actually got through.
   */
  const before = (await sentCommands(page)).length;
  const runs: readonly [readonly [number, number], readonly [number, number], string][] = [
    [[13, 13], [18, 13], 'top edge'],
    [[13, 18], [18, 18], 'bottom edge'],
    [[13, 13], [13, 18], 'left edge'],
    [[18, 13], [18, 18], 'right edge'],
  ];
  for (const [a, b, name] of runs) {
    const from = centreOf(origin, a[0], a[1]);
    const to = centreOf(origin, b[0], b[1]);
    const n0 = (await sentCommands(page)).length;
    await drag(page, from, to);
    hand.count(`drag the ${name} (${a[0]},${a[1]})->(${b[0]},${b[1]})`);
    const got = (await sentCommands(page)).length - n0;
    log(act, `  ${name}: screen ${Math.round(from.x)},${Math.round(from.y)} -> ${Math.round(to.x)},${Math.round(to.y)} => ${got} commands`);
  }
  const total = (await sentCommands(page)).length - before;
  log(act, `four drags asked for 24 wall segments; the game received ${total} commands`);
  await page.screenshot({ path: `${SHOTS}/08-four-wall-drags.png` });
  log(act, `queue => ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  log(act, `band => ${JSON.stringify(await panelText(page, '.hud-strip__refusal'))}`);

  hand.report('four wall drags, from opening the tab');
  log(act, `funds now: ${await page.locator('[data-metric="funds"] .ui-stat__value').innerText()}`);
});

/** The status strip's chips, and the two feedback surfaces, in one line. */
async function pulse(page: Page): Promise<string> {
  return page.evaluate(() => {
    const chip = (m: string) =>
      document.querySelector<HTMLElement>(`[data-metric="${m}"] .ui-stat__value`)?.innerText.trim() ?? '?';
    const band = Array.from(document.querySelectorAll<HTMLElement>('body *')).find(
      (n) => n.children.length === 0 && /refused|Nothing was|admitted/.test(n.innerText ?? ''),
    );
    const alerts = document.querySelector<HTMLElement>('.hud-alerts__list')?.innerText.replace(/\s+/g, ' ').trim() ?? '?';
    return [
      `prisoners=${chip('prisoners')}`,
      `staff=${chip('staff')}`,
      `rooms=${chip('rooms')}`,
      `funds=${chip('funds')}`,
      `earned=${chip('earned-today')}`,
      `band=${JSON.stringify((band?.innerText ?? '').trim().slice(0, 90))}`,
      `alerts=${JSON.stringify(alerts.slice(0, 140))}`,
    ].join(' ');
  });
}

test('act 4 -- the twenty minutes, at 1x, from New prison to a resident', async ({ page }) => {
  const act = 'act 4';
  const hand = new Hand(act);
  await installTee(page);
  await openApp(page);

  await page.locator('.save-panel__button', { hasText: 'New prison' }).click();
  hand.count('New prison');
  await page.waitForTimeout(2500);

  await tab(page, 'build').click();
  hand.count('BUILD tab');
  await page.waitForTimeout(500);
  const origin = await calibrate(page);

  // A player who has just made a prison presses Play. It is the only control
  // that looks like "start". Record how the clock behaves at 1x.
  await page.locator('.hud-strip__transport button').nth(1).click();
  hand.count('press Play (1x)');
  await page.waitForTimeout(2000);
  const t1 = await currentTick(page);
  await page.waitForTimeout(10_000);
  const t2 = await currentTick(page);
  log(act, `1x rate: ${t1} -> ${t2} over ~10 s = ${((t2 - t1) / 10).toFixed(1)} ticks/s`);
  log(act, `clock: ${JSON.stringify(await currentClock(page))}`);

  await page.locator('.hud-build__arm').click();
  hand.count('press Place on map');
  await page.waitForTimeout(300);
  for (const [a, b, name] of [
    [[13, 13], [18, 13], 'top'],
    [[13, 18], [18, 18], 'bottom'],
    [[13, 13], [13, 18], 'left'],
    [[18, 13], [18, 18], 'right'],
  ] as readonly [readonly [number, number], readonly [number, number], string][]) {
    await drag(page, centreOf(origin, a[0], a[1]), centreOf(origin, b[0], b[1]));
    hand.count(`drag the ${name} wall`);
  }
  log(act, `after ordering the perimeter: ${await pulse(page)}`);
  await page.screenshot({ path: `${SHOTS}/10-perimeter-ordered-running.png` });

  // How long does 24 walls take at 1x, and what does the screen say meanwhile?
  const startTick = await currentTick(page);
  const started = Date.now();
  for (let i = 0; i < 24; i += 1) {
    await page.waitForTimeout(10_000);
    const q = (await panelText(page, '.hud-build__queue')).replace(/\s+/g, ' ');
    log(act, `  t+${Math.round((Date.now() - started) / 1000)}s tick=${await currentTick(page)} queue=${JSON.stringify(q)}`);
    if (/(?<![0-9])0 waiting . 0 being built/.test(q)) break;
  }
  const builtTick = await currentTick(page);
  log(act, `the perimeter took ${builtTick - startTick} ticks / ${Math.round((Date.now() - started) / 1000)} s of real time at 1x`);
  await page.screenshot({ path: `${SHOTS}/11-perimeter-built.png` });
  log(act, `after the perimeter is up: ${await pulse(page)}`);
  hand.report('New prison -> an enclosed 6x6 perimeter standing');
});

test('act 5 -- room, door, bed, resident: the rest of the chain, counted', async ({ page }) => {
  const act = 'act 5';
  const hand = new Hand(act);
  await installTee(page);
  await openApp(page);

  await page.locator('.save-panel__button', { hasText: 'New prison' }).click();
  hand.count('New prison');
  await page.waitForTimeout(2500);
  await tab(page, 'build').click();
  hand.count('BUILD tab');
  await page.waitForTimeout(500);
  const origin = await calibrate(page);
  await page.locator('.hud-strip__transport button').nth(2).click();
  await page.locator('.hud-strip__transport button').nth(2).click();
  hand.count('press Fast forward twice (to 4x, to stop waiting)');
  hand.count('  (second fast-forward press)');

  await page.locator('.hud-build__arm').click();
  hand.count('press Place on map');
  for (const [a, b] of [
    [[13, 13], [18, 13]],
    [[13, 18], [18, 18]],
    [[13, 13], [13, 18]],
    [[18, 13], [18, 18]],
  ] as readonly [readonly [number, number], readonly [number, number]][]) {
    await drag(page, centreOf(origin, a[0], a[1]), centreOf(origin, b[0], b[1]));
    hand.count(`drag a wall run (${a[0]},${a[1]})->(${b[0]},${b[1]})`);
  }
  log(act, `waiting for the perimeter at 4x...`);
  const walls = await waitForQueueEmpty(page);
  log(act, `perimeter standing after ${Math.round(walls / 1000)} s of real time at 4x`);
  await page.screenshot({ path: `${SHOTS}/20-perimeter-4x.png` });

  // --- ACTION A: place one object (a door). How many presses? ---
  log(act, '=== placing one door ===');
  const doorHand = new Hand(`${act}/door`);
  await page.locator('.hud-build__list [data-buildable="door-wood"]').click();
  doorHand.count('pick "Wooden door" in the list');
  hand.count('pick "Wooden door" in the list');
  const doorArm = (await page.locator('.hud-build__arm').innerText()).trim();
  log(act, `arm label after picking a door: ${JSON.stringify(doorArm)}`);
  if (/^(place|draw)/i.test(doorArm)) {
    await page.locator('.hud-build__arm').click();
    doorHand.count(`press "${doorArm}"`);
    hand.count(`press "${doorArm}"`);
  }
  const doorCmds = await press(page, centreOf(origin, 15, 18).x, centreOf(origin, 15, 18).y);
  doorHand.count('click the tile (15,18)');
  hand.count('click the tile (15,18) for the door');
  log(act, `door press => ${JSON.stringify(doorCmds)}`);
  doorHand.report('placing ONE door, with the Build tab already open and the wall tool armed');

  // --- ACTION B: place one bed ---
  log(act, '=== placing one bed ===');
  const bedHand = new Hand(`${act}/bed`);
  await page.locator('.hud-build__list [data-buildable="bed-basic"]').click();
  bedHand.count('pick "Bed" in the list');
  hand.count('pick "Bed" in the list');
  const bedArm = (await page.locator('.hud-build__arm').innerText()).trim();
  if (/^(place|draw)/i.test(bedArm)) {
    await page.locator('.hud-build__arm').click();
    bedHand.count(`press "${bedArm}"`);
    hand.count(`press "${bedArm}"`);
  }
  const bedCmds = await press(page, centreOf(origin, 15, 15).x, centreOf(origin, 15, 15).y);
  bedHand.count('click the tile (15,15)');
  hand.count('click the tile (15,15) for the bed');
  log(act, `bed press => ${JSON.stringify(bedCmds)}`);
  bedHand.report('placing ONE bed, from the same open panel');
  await waitForQueueEmpty(page);
  await page.screenshot({ path: `${SHOTS}/21-door-and-bed.png` });
  log(act, `pulse: ${await pulse(page)}`);

  // --- ACTION C: designate the room ---
  log(act, '=== designating one cell ===');
  const roomHand = new Hand(`${act}/room`);
  await tab(page, 'rooms').click();
  roomHand.count('press the ROOMS tab');
  hand.count('press the ROOMS tab');
  await page.waitForTimeout(600);
  log(act, `rooms panel => ${JSON.stringify((await panelText(page, '.hud-rooms')).slice(0, 1200))}`);
  await page.screenshot({ path: `${SHOTS}/22-rooms-panel.png` });
  const roomCtl = await controls(page);
  log(act, `rooms tab controls: ${roomCtl.map((c) => `${c.sel}[${c.label}]${c.enabled ? '' : ' DISABLED'}`).join(' | ')}`);
  hand.report('so far');
});

test('act 6 -- what is actually in the Build and Rooms catalogues, and can a player see it', async ({ page }) => {
  const act = 'act 6';
  await installTee(page);
  await openApp(page);
  await page.locator('.save-panel__button', { hasText: 'New prison' }).click();
  await page.waitForTimeout(2500);
  await tab(page, 'build').click();
  await page.waitForTimeout(600);

  const list = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.hud-build__list');
    if (root === null) return { note: 'ABSENT', rows: [] as unknown[], scroll: '' };
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-buildable]')).map((n) => {
      const r = n.getBoundingClientRect();
      const rootR = root.getBoundingClientRect();
      return {
        id: n.getAttribute('data-buildable'),
        text: (n.innerText ?? '').replace(/\s+/g, ' ').trim(),
        visible: r.top >= rootR.top - 1 && r.bottom <= rootR.bottom + 1,
      };
    });
    return {
      note: '',
      rows,
      scroll: `clientH=${root.clientHeight} scrollH=${root.scrollHeight} overflowY=${getComputedStyle(root).overflowY}`,
    };
  });
  log(act, `build list: ${list.scroll}`);
  log(act, `${list.rows.length} buildables, ${list.rows.filter((r) => (r as { visible: boolean }).visible).length} fully inside the scroll box`);
  for (const r of list.rows) log(act, `  ${JSON.stringify(r)}`);

  const filter = await page.evaluate(() => {
    const sel = document.querySelector<HTMLSelectElement>('.hud-build select');
    return sel === null ? 'no select' : Array.from(sel.options).map((o) => `${o.value}=${o.text}`).join(' | ');
  });
  log(act, `"what to build" filter options: ${filter}`);

  // Every text node the Build panel clips.
  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.hud-build *, .save-panel *, .hud-intake *'))
      .filter((n) => n.children.length === 0 && n.scrollWidth > n.clientWidth + 1 && (n.innerText ?? '').trim() !== '')
      .map((n) => `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]} "${(n.innerText ?? '').trim().slice(0, 50)}" ${n.clientWidth}<${n.scrollWidth}`),
  );
  log(act, `--- ${clipped.length} clipped text nodes in the right-hand column ---`);
  for (const c of clipped) log(act, `  ${c}`);

  // Overlapping HUD islands.
  const overlaps = await page.evaluate(() => {
    const islands = Array.from(document.querySelectorAll<HTMLElement>('.ui-panel, .save-panel')).filter(
      (n) => !n.hidden && n.getClientRects().length > 0,
    );
    const out: string[] = [];
    for (let i = 0; i < islands.length; i += 1)
      for (let j = i + 1; j < islands.length; j += 1) {
        const a = islands[i]!.getBoundingClientRect();
        const b = islands[j]!.getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2)
          out.push(
            `${String(islands[i]!.className).split(' ')[0]} x ${String(islands[j]!.className).split(' ')[0]}: ${Math.round(w)}x${Math.round(h)} px`,
          );
      }
    return out;
  });
  log(act, `--- ${overlaps.length} overlapping HUD islands ---`);
  for (const o of overlaps) log(act, `  ${o}`);

  // Now the Rooms catalogue.
  await tab(page, 'rooms').click();
  await page.waitForTimeout(600);
  log(act, `rooms panel => ${JSON.stringify((await panelText(page, '.hud-rooms')).slice(0, 1500))}`);
  const rooms = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.hud-rooms [data-room]')).map(
      (n) => `${n.getAttribute('data-room')}: ${(n.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)}`,
    ),
  );
  log(act, `${rooms.length} room kinds: ${rooms.join(' | ')}`);
  await page.screenshot({ path: `${SHOTS}/30-rooms-catalogue.png` });

  // And Security and Regime, which a first-time player will also open.
  for (const id of ['security', 'regime'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(600);
    log(act, `${id} => ${JSON.stringify((await panelText(page, `.hud-${id}`)).slice(0, 1200))}`);
    await page.screenshot({ path: `${SHOTS}/31-${id}.png` });
  }
});

test('act 7 -- what each of the five tabs actually shows, and what the panels clip', async ({ page }) => {
  const act = 'act 7';
  await installTee(page);
  await openApp(page);
  await page.locator('.save-panel__button', { hasText: 'New prison' }).click();
  await page.waitForTimeout(2500);

  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(700);
    const shown = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.ui-panel, .save-panel'))
        .filter((n) => !n.hidden && n.getClientRects().length > 0)
        .map((n) => {
          const r = n.getBoundingClientRect();
          const title = n.querySelector<HTMLElement>('.ui-panel__title, .save-panel__heading')?.innerText.trim() ?? '(no title)';
          return `${title} [${String(n.className).split(' ').join('.')}] ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
        }),
    );
    log(act, `tab ${id.toUpperCase()} shows ${shown.length} islands:`);
    for (const s of shown) log(act, `    ${s}`);
    // Anything the browser is clipping vertically.
    const vclip = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.ui-panel, .save-panel'))
        .filter((n) => !n.hidden && n.getClientRects().length > 0 && n.scrollHeight > n.clientHeight + 2)
        .map((n) => {
          const t = n.querySelector<HTMLElement>('.ui-panel__title, .save-panel__heading')?.innerText.trim() ?? '(no title)';
          return `${t}: ${n.clientHeight} shown of ${n.scrollHeight} (overflowY=${getComputedStyle(n).overflowY})`;
        }),
    );
    for (const v of vclip) log(act, `  CLIPPED VERTICALLY -> ${v}`);
    const below = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.ui-panel, .save-panel'))
        .filter((n) => !n.hidden && n.getClientRects().length > 0 && n.getBoundingClientRect().bottom > window.innerHeight + 1)
        .map((n) => {
          const t = n.querySelector<HTMLElement>('.ui-panel__title, .save-panel__heading')?.innerText.trim() ?? '(no title)';
          return `${t}: bottom ${Math.round(n.getBoundingClientRect().bottom)} vs viewport ${window.innerHeight}`;
        }),
    );
    for (const b of below) log(act, `  OFF THE BOTTOM -> ${b}`);
  }
});

test('act 8 -- the whole chain to a living prisoner, counted, in the order a player would try it', async ({ page }) => {
  const act = 'act 8';
  const hand = new Hand(act);
  await installTee(page);
  await openApp(page);

  await page.locator('.save-panel__button', { hasText: 'New prison' }).click();
  hand.count('press "New prison"');
  await page.waitForTimeout(2500);
  await tab(page, 'build').click();
  hand.count('press the BUILD tab');
  await page.waitForTimeout(500);
  const origin = await calibrate(page);
  await page.locator('.hud-strip__transport button').nth(2).click();
  hand.count('press Fast forward (2x)');
  await page.locator('.hud-strip__transport button').nth(2).click();
  hand.count('press Fast forward again (4x)');

  await page.locator('.hud-build__arm').click();
  hand.count('press "Place on map"');
  for (const [a, b] of [
    [[13, 13], [18, 13]],
    [[13, 18], [18, 18]],
    [[13, 13], [13, 18]],
    [[18, 13], [18, 18]],
  ] as readonly [readonly [number, number], readonly [number, number]][]) {
    await drag(page, centreOf(origin, a[0], a[1]), centreOf(origin, b[0], b[1]));
    hand.count(`drag a wall run (${a[0]},${a[1]})->(${b[0]},${b[1]})`);
  }
  await waitForQueueEmpty(page);
  log(act, `perimeter up. pulse: ${await pulse(page)}`);

  /*
   * **The naive order first, because it is the order the panels teach.**
   * The Build list holds Bed at position 3 and the Rooms tab is a separate
   * tab, so a player who has just drawn four walls reaches for a bed next.
   * Recorded verbatim, refusal and all.
   */
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  hand.count('click "Bed" in the build list');
  let arm = (await page.locator('.hud-build__arm').innerText()).trim();
  log(act, `arm label with Bed picked: ${JSON.stringify(arm)}`);
  if (/^(place|draw)/i.test(arm)) {
    await page.locator('.hud-build__arm').click();
    hand.count(`press "${arm}"`);
  }
  log(act, `naive bed click => ${JSON.stringify(await press(page, centreOf(origin, 15, 15).x, centreOf(origin, 15, 15).y))}`);
  hand.count('click a tile inside the walls, for the bed');
  await page.waitForTimeout(1500);
  log(act, `after the naive bed: ${await pulse(page)}`);
  await page.screenshot({ path: `${SHOTS}/50-bed-before-zoning.png` });

  /*
   * So: zone first. Which raises the question the Cell rule asks --
   * "NEEDS 1 x BED, NEEDS 1 x TOILET" -- against an empty shell. Does the
   * game let a player zone a cell that has neither yet?
   */
  await tab(page, 'rooms').click();
  hand.count('press the ROOMS tab');
  await page.waitForTimeout(700);
  const preselected = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>('.hud-rooms [data-room]')).find((n) =>
        (n.innerText ?? '').includes('Selected'),
      )?.getAttribute('data-room') ?? 'none',
  );
  log(act, `Rooms arrives with ${preselected} pre-selected; the player wants room.cell (5th of 18)`);

  const roomHand = new Hand(`${act} room`);
  await page.locator('.hud-rooms [data-room="room.cell"]').click();
  roomHand.count('click "Cell" in the 18-item list');
  hand.count('click "Cell" in the room list');
  await page.waitForTimeout(400);
  log(act, `Cell rule reads => ${JSON.stringify((await panelText(page, '.hud-rooms__rule')).replace(/\s+/g, ' '))}`);
  const armLabel = (await page.locator('.hud-rooms__arm').innerText()).trim();
  await page.locator('.hud-rooms__arm').click();
  roomHand.count(`press "${armLabel}"`);
  hand.count(`press "${armLabel}"`);
  await page.waitForTimeout(300);

  const n0 = (await sentCommands(page)).length;
  await drag(page, centreOf(origin, 14, 14), centreOf(origin, 17, 17));
  roomHand.count('drag the rectangle over the interior');
  hand.count('drag the room rectangle (14,14)->(17,17)');
  await page.waitForTimeout(900);
  log(act, `after the drag, ${(await sentCommands(page)).length - n0} command(s) sent`);
  log(act, `status => ${JSON.stringify((await panelText(page, '.hud-rooms__status')).replace(/\s+/g, ' '))}`);
  log(act, `area => ${JSON.stringify((await panelText(page, '.hud-rooms__area')).replace(/\s+/g, ' '))}`);
  log(act, `enclosure => ${JSON.stringify((await panelText(page, '.hud-rooms__enclosure')).replace(/\s+/g, ' '))}`);
  log(act, `needs => ${JSON.stringify((await panelText(page, '.hud-rooms__needs')).replace(/\s+/g, ' '))}`);
  await page.screenshot({ path: `${SHOTS}/51-rectangle-dragged.png` });

  // Is there a confirm step, and is it pressable?
  const confirm = page.locator('.hud-rooms__confirm');
  if ((await confirm.count()) > 0 && (await confirm.isVisible())) {
    const cl = (await confirm.innerText()).trim();
    const enabled = await confirm.isEnabled();
    log(act, `confirm control: ${JSON.stringify(cl)} enabled=${enabled}`);
    if (enabled) {
      await confirm.click();
      roomHand.count(`press "${cl}"`);
      hand.count(`press "${cl}"`);
      await page.waitForTimeout(1500);
    }
  } else {
    log(act, 'no confirm control laid out');
  }
  roomHand.report('ONE cell zoned, counted from the moment the Rooms tab opened');
  log(act, `after zoning: ${await pulse(page)}`);
  log(act, `status => ${JSON.stringify((await panelText(page, '.hud-rooms__status')).replace(/\s+/g, ' '))}`);
  await page.screenshot({ path: `${SHOTS}/52-after-zoning.png` });

  // Now the bed, and the toilet the rule asks for.
  await tab(page, 'build').click();
  hand.count('press the BUILD tab again');
  await page.waitForTimeout(500);
  const objHand = new Hand(`${act} one object`);
  for (const [id, tx, ty, label] of [
    ['bed-wooden', 15, 15, 'Bed (3rd of 21)'],
    ['toilet-brick', 16, 16, 'Toilet (20th of 21, needs a scroll)'],
  ] as readonly [string, number, number, string][]) {
    const h = new Hand(`${act} ${id}`);
    await page.locator(`.hud-build__list [data-buildable="${id}"]`).click();
    h.count(`click "${label}"`);
    hand.count(`click "${label}"`);
    if (id === 'bed-wooden') objHand.count(`click "${label}"`);
    arm = (await page.locator('.hud-build__arm').innerText()).trim();
    if (/^(place|draw)/i.test(arm)) {
      await page.locator('.hud-build__arm').click();
      h.count(`press "${arm}"`);
      hand.count(`press "${arm}"`);
      if (id === 'bed-wooden') objHand.count(`press "${arm}"`);
    }
    const cmds = await press(page, centreOf(origin, tx, ty).x, centreOf(origin, tx, ty).y);
    h.count(`click the tile (${tx},${ty})`);
    hand.count(`click the tile (${tx},${ty})`);
    if (id === 'bed-wooden') objHand.count(`click the tile (${tx},${ty})`);
    log(act, `${id} => ${cmds.length} command(s) ${JSON.stringify(cmds.map((c) => c['type']))}`);
    await page.waitForTimeout(1200);
    log(act, `  pulse: ${await pulse(page)}`);
    h.report(`ONE ${id}, with the Build tab already open and a tool already armed`);
  }
  objHand.report('THE COMMONEST ACTION IN THE GAME: placing one furniture item');
  await waitForQueueEmpty(page);
  await page.screenshot({ path: `${SHOTS}/53-bed-and-toilet-built.png` });
  log(act, `cell furnished. pulse: ${await pulse(page)}`);
  await tab(page, 'rooms').click();
  await page.waitForTimeout(600);
  log(act, `rooms rows => ${JSON.stringify((await panelText(page, '.hud-rooms__rows')).replace(/\s+/g, ' '))}`);

  // Admit somebody.
  const admitHand = new Hand(`${act} admit`);
  await page.locator('.hud-intake__admit').click();
  admitHand.count('press "Admit a prisoner"');
  hand.count('press "Admit a prisoner"');
  admitHand.report('ONE admission');
  await page.waitForTimeout(5000);
  log(act, `after admitting: ${await pulse(page)}`);
  await page.screenshot({ path: `${SHOTS}/54-admitted.png` });

  hand.report('EVERYTHING: an empty browser tab to one prisoner in one furnished cell');
});

test('act 9 -- the enclosure the wall tool actually made, and the rest of the chain', async ({ page }) => {
  const act = 'act 9';
  const hand = new Hand(act);
  await installTee(page);
  await openApp(page);
  await page.locator('.save-panel__button', { hasText: 'New prison' }).click();
  hand.count('press "New prison"');
  await page.waitForTimeout(2500);
  await tab(page, 'build').click();
  hand.count('press the BUILD tab');
  await page.waitForTimeout(500);
  const origin = await calibrate(page);
  await page.locator('.hud-strip__transport button').nth(2).click();
  hand.count('press Fast forward');
  await page.locator('.hud-strip__transport button').nth(2).click();
  hand.count('press Fast forward again');

  await page.locator('.hud-build__arm').click();
  hand.count('press "Place on map"');
  const runs: readonly [readonly [number, number], readonly [number, number]][] = [
    [[13, 13], [18, 13]],
    [[13, 18], [18, 18]],
    [[13, 13], [13, 18]],
    [[18, 13], [18, 18]],
  ];
  const placed: string[] = [];
  for (const [a, b] of runs) {
    const n = (await sentCommands(page)).length;
    await drag(page, centreOf(origin, a[0], a[1]), centreOf(origin, b[0], b[1]));
    hand.count(`drag a wall run (${a[0]},${a[1]})->(${b[0]},${b[1]})`);
    for (const c of (await sentCommands(page)).slice(n))
      placed.push(`${c['definitionId']}@${c['x']},${c['y']}:${c['edge']}`);
  }
  log(act, `--- what the four drags actually placed ---`);
  for (const p of placed) log(act, `  ${p}`);
  await waitForQueueEmpty(page);
  await page.screenshot({ path: `${SHOTS}/60-what-four-drags-enclose.png` });

  await tab(page, 'rooms').click();
  hand.count('press the ROOMS tab');
  await page.waitForTimeout(700);
  await page.locator('.hud-rooms [data-room="room.cell"]').click();
  hand.count('click "Cell"');
  await page.waitForTimeout(300);

  /*
   * Which rectangle is the enclosure? Try each candidate through the typed
   * coordinate fields, so the answer is not confounded by a truncated drag,
   * and read the refusal the game gives for each. This is the question a
   * player has to answer with nothing but trial and error.
   */
  const tries: readonly [number, number, number, number, string][] = [
    [14, 14, 4, 4, 'the interior a player would think is "inside the walls"'],
    [13, 13, 6, 6, 'the full 6x6 the drags spanned'],
    [13, 13, 5, 5, 'the 5x5 the edge-walls actually close'],
  ];
  await page.locator('.hud-rooms__coordinates-hint, .hud-rooms__coordinates').first().click().catch(() => {});
  for (const [x, y, w, h, why] of tries) {
    const open = await page.locator('.hud-rooms__coord-x').isVisible();
    if (!open) await page.locator('.hud-rooms__coordinates > *').first().click();
    await page.locator('.hud-rooms__coord-x').fill(String(x));
    await page.locator('.hud-rooms__coord-y').fill(String(y));
    await page.locator('.hud-rooms__coord-width').fill(String(w));
    await page.locator('.hud-rooms__coord-height').fill(String(h));
    await page.locator('.hud-rooms__coordinates-submit').click();
    await page.waitForTimeout(1500);
    log(act, `try ${x},${y} ${w}x${h} (${why})`);
    log(act, `   rooms chip=${await page.locator('[data-metric="rooms"] .ui-stat__value').innerText()}`);
    log(act, `   alerts=${JSON.stringify((await panelText(page, '.hud-alerts__list')).replace(/\s+/g, ' ').slice(0, 180))}`);
  }
  await page.screenshot({ path: `${SHOTS}/61-which-rectangle-zones.png` });
  log(act, `pulse: ${await pulse(page)}`);
  log(act, `rooms rows => ${JSON.stringify((await panelText(page, '.hud-rooms__rows')).replace(/\s+/g, ' ').slice(0, 400))}`);

  // With a room zoned, the bed and the toilet.
  await tab(page, 'build').click();
  hand.count('press the BUILD tab');
  await page.waitForTimeout(500);
  for (const [id, tx, ty] of [
    ['bed-wooden', 15, 15],
    ['toilet-brick', 16, 16],
  ] as readonly [string, number, number][]) {
    await page.locator(`.hud-build__list [data-buildable="${id}"]`).click();
    hand.count(`click "${id}" in the build list`);
    const arm = (await page.locator('.hud-build__arm').innerText()).trim();
    if (/^(place|draw)/i.test(arm)) {
      await page.locator('.hud-build__arm').click();
      hand.count(`press "${arm}"`);
    }
    const cmds = await press(page, centreOf(origin, tx, ty).x, centreOf(origin, tx, ty).y);
    hand.count(`click the tile (${tx},${ty})`);
    await page.waitForTimeout(1500);
    log(act, `${id}@${tx},${ty} => ${cmds.length} cmd; alerts=${JSON.stringify((await panelText(page, '.hud-alerts__list')).replace(/\s+/g, ' ').slice(0, 160))}`);
  }
  await waitForQueueEmpty(page);
  await page.screenshot({ path: `${SHOTS}/62-furnished.png` });
  log(act, `pulse: ${await pulse(page)}`);

  // A door, so somebody can get in.
  await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
  hand.count('click "Wooden door"');
  const darm = (await page.locator('.hud-build__arm').innerText()).trim();
  if (/^(place|draw)/i.test(darm)) {
    await page.locator('.hud-build__arm').click();
    hand.count(`press "${darm}"`);
  }
  log(act, `door => ${JSON.stringify(await press(page, centreOf(origin, 15, 13).x, centreOf(origin, 15, 13).y))}`);
  hand.count('click the tile (15,13) for the door');
  await waitForQueueEmpty(page);
  log(act, `pulse: ${await pulse(page)}`);

  // The Intake island is not laid out on Build/Rooms, so a tab press is owed.
  log(act, `intake visible on the Build tab: ${await page.locator('.hud-intake__admit').isVisible()}`);
  await tab(page, 'overview').click();
  hand.count('press the OVERVIEW tab, to reach the Admit button at all');
  await page.waitForTimeout(600);
  log(act, `intake visible on the Overview tab: ${await page.locator('.hud-intake__admit').isVisible()}`);
  await page.locator('.hud-intake__admit').click();
  hand.count('press "Admit a prisoner"');
  await page.waitForTimeout(5000);
  log(act, `after admitting: ${await pulse(page)}`);
  await page.screenshot({ path: `${SHOTS}/63-admitted.png` });
  hand.report('EVERYTHING: an empty browser tab to one prisoner in one furnished cell');
});
