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

test('act 8 -- the whole chain to a living prisoner, counted, and what tells the player it worked', async ({ page }) => {
  const act = 'act 8';
  const hand = new Hand(act);
  await installTee(page);
  await openApp(page);

  await page.locator('.save-panel__button', { hasText: 'New prison' }).click();
  hand.count('press New prison');
  await page.waitForTimeout(2500);
  await tab(page, 'build').click();
  hand.count('press the BUILD tab');
  await page.waitForTimeout(500);
  const origin = await calibrate(page);
  await page.locator('.hud-strip__transport button').nth(2).click();
  hand.count('press Fast forward');
  await page.locator('.hud-strip__transport button').nth(2).click();
  hand.count('press Fast forward again (to 4x)');

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

  // A door, so the cell can be reached.
  const doorHand = new Hand(`${act} door`);
  await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
  doorHand.count('scroll/click "Wooden door"');
  hand.count('click "Wooden door" in the list');
  let arm = (await page.locator('.hud-build__arm').innerText()).trim();
  log(act, `arm label after picking the door: ${JSON.stringify(arm)}`);
  if (/^(place|draw)/i.test(arm)) {
    await page.locator('.hud-build__arm').click();
    doorHand.count(`press "${arm}"`);
    hand.count(`press "${arm}"`);
  }
  log(act, `door click => ${JSON.stringify(await press(page, centreOf(origin, 15, 18).x, centreOf(origin, 15, 18).y))}`);
  doorHand.count('click the tile');
  hand.count('click the tile for the door');
  doorHand.report('ONE door, Build tab already open, a tool already armed');

  // A bed.
  const bedHand = new Hand(`${act} bed`);
  await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
  bedHand.count('click "Bed"');
  hand.count('click "Bed" in the list');
  arm = (await page.locator('.hud-build__arm').innerText()).trim();
  if (/^(place|draw)/i.test(arm)) {
    await page.locator('.hud-build__arm').click();
    bedHand.count(`press "${arm}"`);
    hand.count(`press "${arm}"`);
  }
  log(act, `bed click => ${JSON.stringify(await press(page, centreOf(origin, 15, 15).x, centreOf(origin, 15, 15).y))}`);
  bedHand.count('click the tile');
  hand.count('click the tile for the bed');
  bedHand.report('ONE bed, from the same open panel');
  await waitForQueueEmpty(page);
  await page.screenshot({ path: `${SHOTS}/40-cell-shell-with-bed-and-door.png` });
  log(act, `pulse: ${await pulse(page)}`);

  // Designate it a Cell. Note what is selected on arrival.
  const roomHand = new Hand(`${act} room`);
  await tab(page, 'rooms').click();
  roomHand.count('press the ROOMS tab');
  hand.count('press the ROOMS tab');
  await page.waitForTimeout(600);
  const preselected = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>('.hud-rooms [data-room]')).find((n) =>
        (n.innerText ?? '').includes('Selected'),
      )?.getAttribute('data-room') ?? 'none',
  );
  log(act, `the Rooms panel arrives with ${preselected} selected -- the player wants room.cell`);
  await page.locator('.hud-rooms [data-room="room.cell"]').click();
  roomHand.count('click "Cell" in the list (5th of 18)');
  hand.count('click "Cell" in the list');
  await page.waitForTimeout(400);
  log(act, `cell requirements shown => ${JSON.stringify((await panelText(page, '.hud-rooms')).slice(-400))}`);
  const drawLabel = (await page.locator('.hud-rooms__draw').innerText()).trim();
  await page.locator('.hud-rooms__draw').click();
  roomHand.count(`press "${drawLabel}"`);
  hand.count(`press "${drawLabel}"`);
  await page.waitForTimeout(300);
  const n0 = (await sentCommands(page)).length;
  await drag(page, centreOf(origin, 14, 14), centreOf(origin, 17, 17));
  roomHand.count('drag the rectangle across the interior');
  hand.count('drag the room rectangle');
  await page.waitForTimeout(1200);
  log(act, `designation sent ${(await sentCommands(page)).length - n0} command(s)`);
  roomHand.report('ONE cell designation, from the Build tab');
  await page.waitForTimeout(2500);
  log(act, `pulse after designating: ${await pulse(page)}`);
  await page.screenshot({ path: `${SHOTS}/41-cell-designated.png` });

  // Admit somebody.
  const admitHand = new Hand(`${act} admit`);
  await page.locator('.hud-intake__admit').click();
  admitHand.count('press "Admit a prisoner"');
  hand.count('press "Admit a prisoner"');
  admitHand.report('ONE admission, with the Intake island already on screen');
  await page.waitForTimeout(4000);
  log(act, `pulse after admitting: ${await pulse(page)}`);
  await page.screenshot({ path: `${SHOTS}/42-admitted.png` });

  // Watch for two in-game minutes of play. Does anything happen? Does the
  // game say anything about how it is going?
  const t0 = await currentTick(page);
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(15_000);
    log(act, `  t=${(await currentTick(page)) - t0} ticks: ${await pulse(page)}`);
  }
  await page.screenshot({ path: `${SHOTS}/43-two-minutes-of-a-resident.png` });
  hand.report('EVERYTHING: from an empty browser tab to one prisoner in one cell');

  // Finally: is there any goal, score, or objective surface anywhere?
  const goalish = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((n) => n.children.length === 0)
      .map((n) => (n.innerText ?? '').trim())
      .filter((t) => /objective|goal|target|task|tutorial|next step|score|rating|grade|help/i.test(t)),
  );
  log(act, `anything goal-shaped on screen: ${JSON.stringify(goalish)}`);
});
