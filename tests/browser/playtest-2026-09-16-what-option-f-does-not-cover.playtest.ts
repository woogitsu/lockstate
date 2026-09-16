import { expect, test } from '@playwright/test';

import {
  ARM_TIMEOUT_MS,
  TILE,
  armBuildable,
  buy,
  calibrate,
  centreOf,
  currentTick,
  drag,
  fastForwardToMax,
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
 * **What ADR 0091 decision 2 option F does NOT cover, measured by playing.**
 *
 * Option F shipped on 2026-09-16 (#1261, on the owner's ruling recorded in
 * this ADR's Status block): the refusal band retires its sentence when a
 * *decided outcome of the same command route* arrives, where the route is the
 * supersession key's own prefix (`supersessionKeyRoute`,
 * `src/simulation/refusals/refusal-log.ts`). The alerts list keeps the row --
 * the deliberate divergence F buys.
 *
 * #1261's own pull request named two things it does not cover, honestly and
 * without measuring them. This file measures them, and one more figure the
 * choice of F over option D rests on.
 *
 * 1. **`RemoveWall`'s object arm.** The ADR asserts that F kills the measured
 *    act-3-step-E contradiction because *"act 3 step E was a successful
 *    `RemoveWall` ... Same route, so F retires it."* But
 *    `session-commands.ts`'s `RemoveWall` branch tries the **object arm
 *    first** (`objectPlacement.remove`, the identical call `RemoveObject`'s
 *    own branch makes), and when that arm wins it supersedes under
 *    `removeObjectSupersessionKey` -- route `remove-object` -- not
 *    `removeWallSupersessionKey`'s `remove-wall`. Both arms raise the same
 *    `recordBuildOrderCancelled` event, so the recorded sentence cannot say
 *    which happened. `test 1` and `test 2` below run each arm against an
 *    identical standing `remove-wall.nothing-to-remove` refusal and read the
 *    corner.
 *
 * 2. **#780's different-location case.** A `zone.not-enclosed` refusal about
 *    a rectangle the player abandons. `test 3` stands one and then plays a
 *    cold start past it, recording when it goes.
 *
 * 3. **F's own band lifetime on a route the player repeats.** F was chosen
 *    over D on one number -- D's 2 ms band lifetime inside an ordinary wall
 *    drag, against the 600 ms `EVENT_BAND_DWELL_FLOOR_MS` the owner ruled for
 *    the event band. `test 1` times F's band from the refusal landing to the
 *    corner emptying, in the fastest removal sequence a player can perform.
 *
 * **Every figure below is DOM text and `performance.now()`.** Git LFS is
 * unprovisioned in this container, so every atlas fails to decode and
 * `World renderer: InvalidStateError` appears in every run. Nothing here
 * reads the canvas and nothing here claims anything about art.
 *
 * This is a playtest, not a gate: `tests/browser/playwright.config.ts`
 * collects `*.spec.ts` and never sees this file. Run it with
 * `node_modules/.bin/playwright test --config
 * tests/browser/playwright.playtest.config.ts <this file>`.
 */

/** Every change of `.hud__refusal`'s visible text, stamped with `performance.now()`. */
interface BandTransition {
  readonly at: number;
  readonly text: string;
}

interface RecorderWindow {
  lockstateBandLog?: BandTransition[];
}

/**
 * A 20 ms poller on the refusal corner, the same instrument ADR 0091's own
 * 2026-09-16 measurement section used.
 *
 * A poller rather than a `MutationObserver` because the band is emptied by
 * `clearRefusalLine` setting `hidden` on an element whose text may not change
 * -- "hidden with the same text" and "showing that text" are two states one
 * observer callback cannot tell apart without reading layout anyway.
 */
async function recordBand(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const log: BandTransition[] = [];
    (window as unknown as RecorderWindow).lockstateBandLog = log;
    const read = (): string => {
      const node = document.querySelector<HTMLElement>('.hud__refusal');
      if (node === null) return '<absent>';
      if (node.hidden || node.getClientRects().length === 0) return '<hidden>';
      return (node.innerText ?? '').trim();
    };
    const tick = (): void => {
      const text = read();
      const last = log[log.length - 1];
      if (last === undefined || last.text !== text) log.push({ at: performance.now(), text });
      setTimeout(tick, 20);
    };
    tick();
  });
}

async function bandLog(page: import('@playwright/test').Page): Promise<readonly BandTransition[]> {
  return page.evaluate(() => [...((window as unknown as RecorderWindow).lockstateBandLog ?? [])]);
}

/**
 * `performance.now()` against every command the page submits, on the page's own
 * clock so a command stamp and a band stamp are comparable.
 *
 * Added **after** `installTee`, deliberately: `addInitScript` runs its scripts
 * in the order they were added, so by the time this one runs `window.Worker`
 * is already the tee's subclass and wrapping its prototype's `postMessage`
 * sees every submission the tee sees. Wrapping the real `Worker` instead would
 * be a second replacement of the same global and would fight the tee for it.
 */
async function stampCommands(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const stamps: { at: number; type: string }[] = [];
    (window as unknown as { lockstateCommandStamps?: typeof stamps }).lockstateCommandStamps = stamps;
    const worker = window.Worker as unknown as { prototype: { postMessage: (m: unknown, t?: unknown) => void } };
    const original = worker.prototype.postMessage;
    worker.prototype.postMessage = function patched(message: unknown, transfer?: unknown): void {
      const envelope = message as { kind?: string; payload?: { command?: { data?: { type?: string } } } };
      if (envelope?.kind === 'simulation/submit-command') {
        stamps.push({ at: performance.now(), type: String(envelope.payload?.command?.data?.type ?? '?') });
      }
      if (transfer === undefined) original.call(this, message);
      else original.call(this, message, transfer);
    };
  });
}

async function commandStamps(page: import('@playwright/test').Page): Promise<readonly { at: number; type: string }[]> {
  return page.evaluate(() => [
    ...((window as unknown as { lockstateCommandStamps?: { at: number; type: string }[] }).lockstateCommandStamps ?? []),
  ]);
}

/** What the corner says right now, and what the alerts list says right now, read together. */
async function bothSurfaces(
  page: import('@playwright/test').Page,
): Promise<{ readonly band: string; readonly event: string; readonly alerts: string }> {
  return {
    band: await panelText(page, '.hud__refusal'),
    event: await panelText(page, '.hud__event'),
    alerts: await panelText(page, '.hud-alerts__list'),
  };
}

/**
 * Arms removal, or stands it down. `.hud-build__remove` is a toggle, and it
 * reports its own state on `data-removing` (`build-panel.ts:1604`) -- read
 * rather than assumed, for the reason `armBuildable`'s docblock gives about
 * the Rooms panel's arm control, which is a toggle of the same shape.
 */
async function setRemoval(page: import('@playwright/test').Page, on: boolean): Promise<void> {
  const control = page.locator('.hud-build__remove');
  const armed = (await control.getAttribute('data-removing')) === 'true';
  if (armed !== on) await control.click();
  await page.waitForTimeout(150);
}

/** The `performance.now()` clock inside the page, so band stamps and gesture stamps share one origin. */
async function pageNow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

test('option F: the wall arm retires the band, and how long the band lives on a repeated route', async ({ page }) => {
  const log = (line: string) => console.log(`[wall-arm] ${line}`);
  await installTee(page);
  await stampCommands(page);
  await recordBand(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  await buy(page, 'wall-brick', 40);
  await fastForwardToMax(page);
  await page.waitForTimeout(3000);
  log(`deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  // A short wall run to have something real to remove later.
  await armBuildable(page, 'wall-brick');
  const runY = origin.originY + 20 * TILE;
  const produced = await drag(
    page,
    { x: origin.originX + 10 * TILE + TILE / 2, y: runY },
    { x: origin.originX + 18 * TILE - TILE / 2, y: runY },
  );
  log(`wall run: ${produced.length} command(s) -> ${JSON.stringify(produced.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  const runTiles = produced.map((c) => ({ x: Number(c['x']), y: Number(c['y']), edge: String(c['edge']) }));
  await waitForQueueEmpty(page);
  log(`queue after waiting: ${JSON.stringify(await panelText(page, '.hud-build__queue'))} at tick ${await currentTick(page)}`);

  // === stand a remove-wall.nothing-to-remove refusal on an empty tile ===
  /*
   * **(8,16) and not (4,4), and the first run of this file used (4,4).** With
   * the camera where a new prison puts it, calibration measured tile (0,0)'s
   * top-left at screen (-304,-574), so tile (4,4)'s centre is screen
   * (-16,-286) -- off the page. The press produced no command at all and the
   * sentence the corner was showing was the one `calibrate`'s own bisection
   * presses had left there. That is a real `remove-wall.nothing-to-remove`
   * refusal and the wall-arm reading below is unaffected by it, but a press
   * that produced nothing cannot time anything, so the tile is chosen inside
   * the canvas now and the choice is asserted rather than assumed.
   */
  await setRemoval(page, true);
  const emptyTile = centreOf(origin, 8, 16);
  if (emptyTile.x < 0 || emptyTile.y < 0 || emptyTile.x > 1000 || emptyTile.y > 880) {
    throw new Error(`the empty probe tile is off the canvas at ${emptyTile.x},${emptyTile.y} (origin ${origin.originX},${origin.originY})`);
  }
  const refusalPress = await press(page, emptyTile.x, emptyTile.y);
  await page.waitForTimeout(600);
  log(`press at empty tile (8,16) -> screen (${emptyTile.x},${emptyTile.y}) produced ${JSON.stringify(refusalPress.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  const standing = await bothSurfaces(page);
  log(`AFTER THE REFUSAL  band=${JSON.stringify(standing.band)}`);
  log(`AFTER THE REFUSAL event=${JSON.stringify(standing.event)}`);
  log(`AFTER THE REFUSAL alerts=${JSON.stringify(standing.alerts)}`);

  // === the same route, decided: a press on a completed wall's own edge ===
  const target = runTiles[0];
  if (target === undefined) throw new Error('the wall run produced no command to aim at');
  const wallPoint = centreOf(origin, target.x, target.y);
  const removal = await press(page, wallPoint.x, wallPoint.y);
  log(`removal press at tile (${target.x},${target.y}) produced ${JSON.stringify(removal.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  await page.waitForTimeout(1200);

  const settled = await bothSurfaces(page);
  log(`AFTER THE WALL REMOVAL  band=${JSON.stringify(settled.band)}`);
  log(`AFTER THE WALL REMOVAL event=${JSON.stringify(settled.event)}`);
  log(`AFTER THE WALL REMOVAL alerts=${JSON.stringify(settled.alerts)}`);
  log(`band transitions so far: ${JSON.stringify((await bandLog(page)).map((t) => `${t.at.toFixed(1)} ${JSON.stringify(t.text)}`))}`);

  // === is a removal DRAG one command or a run? (ADR 0091 M3, re-checked) ===
  const dragBefore = (await sentCommands(page)).length;
  await drag(
    page,
    { x: origin.originX + 11 * TILE + TILE / 2, y: runY },
    { x: origin.originX + 17 * TILE - TILE / 2, y: runY },
  );
  const dragProduced = (await sentCommands(page)).slice(dragBefore);
  log(`a removal DRAG across six tiles produced ${dragProduced.length} command(s): ${JSON.stringify(dragProduced.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])}`))}`);
  await page.waitForTimeout(800);

  /*
   * === F's band lifetime on a route the player repeats ===
   *
   * Two raw `page.mouse.click`s with nothing between them -- not the harness's
   * `press`, which spends a `waitForTimeout(100)` and two `page.evaluate`
   * round trips per gesture and would be measuring Playwright. The first lands
   * on empty ground and refuses; the second lands on a completed wall of the
   * same run and succeeds. Both stamps come off the page's own
   * `performance.now()`: the commands from the `postMessage` wrapper, the band
   * from the 20 ms poller.
   */
  const remaining = runTiles.filter((tile) => tile.x >= 12 && tile.x <= 15);
  const secondTarget = remaining[remaining.length - 1] ?? runTiles[runTiles.length - 1];
  if (secondTarget === undefined) throw new Error('no wall left to remove');
  const secondPoint = centreOf(origin, secondTarget.x, secondTarget.y);
  const stampsBefore = (await commandStamps(page)).length;
  const bandBefore = (await bandLog(page)).length;
  await page.mouse.click(emptyTile.x, emptyTile.y);
  await page.mouse.click(secondPoint.x, secondPoint.y);
  await page.waitForTimeout(1500);
  const sequenceStamps = (await commandStamps(page)).slice(stampsBefore);
  const sequenceBand = (await bandLog(page)).slice(bandBefore);
  log(`TIGHT SEQUENCE commands: ${JSON.stringify(sequenceStamps.map((s) => `${s.type}@${s.at.toFixed(1)}`))}`);
  log(`TIGHT SEQUENCE band: ${JSON.stringify(sequenceBand.map((t) => `${t.at.toFixed(1)} ${JSON.stringify(t.text)}`))}`);
  if (sequenceStamps.length >= 2) {
    const first = sequenceStamps[0];
    const last = sequenceStamps[sequenceStamps.length - 1];
    if (first !== undefined && last !== undefined) {
      log(`TIGHT SEQUENCE: ${(last.at - first.at).toFixed(1)}ms between the refusing press and the deciding press`);
    }
  }
  const shown = sequenceBand.find((t) => t.text.length > 0 && !t.text.startsWith('<'));
  const cleared = shown === undefined ? undefined : sequenceBand.find((t) => t.at > shown.at && t.text.startsWith('<'));
  if (shown !== undefined && cleared !== undefined) {
    log(`F'S BAND LIFETIME on a repeated route: ${(cleared.at - shown.at).toFixed(1)}ms (shown ${shown.at.toFixed(1)}, cleared ${cleared.at.toFixed(1)})`);
  } else {
    log(`F'S BAND LIFETIME: not resolvable from this sequence (shown=${JSON.stringify(shown)}, cleared=${JSON.stringify(cleared)})`);
  }
  const final = await bothSurfaces(page);
  log(`FINAL  band=${JSON.stringify(final.band)}`);
  log(`FINAL alerts=${JSON.stringify(final.alerts)}`);
});

test('option F: the object arm of the same RemoveWall press, against the same standing refusal', async ({ page }) => {
  const log = (line: string) => console.log(`[object-arm] ${line}`);
  await installTee(page);
  await stampCommands(page);
  await recordBand(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  await buy(page, 'wall-brick', 60);
  await buy(page, 'bed-wooden', 3);
  await fastForwardToMax(page);
  await page.waitForTimeout(3000);

  // An enclosed 6x6 so a bed has somewhere legal to stand.
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
    const commands = await drag(page, run.a, run.b);
    log(`wall run ${run.name}: ${commands.length} command(s)`);
  }
  await waitForQueueEmpty(page);

  // Zone it, with the same retry the shared harness documents.
  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'zones').click();
    await expect(page.locator('.hud-rooms')).toBeVisible({ timeout: ARM_TIMEOUT_MS });
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    const roomRow = page.locator('.hud-rooms__list [data-room="room.cell"]');
    await roomRow.click();
    await expect(roomRow).toHaveAttribute('data-selected', 'true', { timeout: ARM_TIMEOUT_MS });
    const roomArm = page.locator('.hud-rooms__arm');
    if ((await roomArm.getAttribute('data-armed')) !== 'true') await roomArm.click();
    await expect(roomArm).toHaveAttribute('data-armed', 'true', { timeout: ARM_TIMEOUT_MS });
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    log(`designate attempt ${attempts}: rooms=${counts?.rooms}`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempts >= 12) throw new Error('the rectangle was never accepted as a room');
    await page.waitForTimeout(5000);
  }

  // A bed, built and standing.
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  const bedTile = { x: 14, y: 14 } as const;
  const bedPoint = centreOf(origin, bedTile.x, bedTile.y);
  const bedCommands = await press(page, bedPoint.x, bedPoint.y);
  log(`bed order at (${bedTile.x},${bedTile.y}): ${JSON.stringify(bedCommands.map((c) => c['type']))}`);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(2000);
  log(`queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  // === the identical standing refusal as the first test ===
  await setRemoval(page, true);
  const emptyPoint = centreOf(origin, 8, 16);
  if (emptyPoint.x < 0 || emptyPoint.y < 0) throw new Error(`the empty probe tile is off the canvas at ${emptyPoint.x},${emptyPoint.y}`);
  const refusalPress = await press(page, emptyPoint.x, emptyPoint.y);
  await page.waitForTimeout(600);
  log(`press at empty tile (8,16) -> screen (${emptyPoint.x},${emptyPoint.y}) produced ${JSON.stringify(refusalPress.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  const standing = await bothSurfaces(page);
  log(`AFTER THE REFUSAL  band=${JSON.stringify(standing.band)}`);
  log(`AFTER THE REFUSAL alerts=${JSON.stringify(standing.alerts)}`);

  // === the SAME gesture, resolved by the OBJECT arm: a press on a standing bed ===
  const removal = await press(page, bedPoint.x, bedPoint.y);
  log(`removal press on the bed produced ${JSON.stringify(removal.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  await page.waitForTimeout(1500);
  const settled = await bothSurfaces(page);
  log(`AFTER THE OBJECT REMOVAL  band=${JSON.stringify(settled.band)}`);
  log(`AFTER THE OBJECT REMOVAL event=${JSON.stringify(settled.event)}`);
  log(`AFTER THE OBJECT REMOVAL alerts=${JSON.stringify(settled.alerts)}`);
  log(`band transitions: ${JSON.stringify((await bandLog(page)).map((t) => `${t.at.toFixed(1)} ${JSON.stringify(t.text)}`))}`);

  // === and then a wall removal, same route, to show the contrast in one session ===
  // On the west run's own line, not the tile centre: that line is where the
  // drag that built the wall passed, so the press resolves to the same edge.
  const wallRemoval = await press(page, origin.originX + 12 * TILE, origin.originY + 14 * TILE + TILE / 2);
  log(`removal press on the west wall produced ${JSON.stringify(wallRemoval.map((c) => `${String(c['type'])} ${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
  await page.waitForTimeout(1500);
  const afterWall = await bothSurfaces(page);
  log(`AFTER THE WALL REMOVAL  band=${JSON.stringify(afterWall.band)}`);
  log(`AFTER THE WALL REMOVAL event=${JSON.stringify(afterWall.event)}`);
  log(`AFTER THE WALL REMOVAL alerts=${JSON.stringify(afterWall.alerts)}`);
  log(`band transitions: ${JSON.stringify((await bandLog(page)).map((t) => `${t.at.toFixed(1)} ${JSON.stringify(t.text)}`))}`);
});

test('#780: how long a zone.not-enclosed refusal about an abandoned rectangle survives under F', async ({ page }) => {
  const log = (line: string) => console.log(`[780] ${line}`);
  await installTee(page);
  await stampCommands(page);
  await recordBand(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  await buy(page, 'wall-brick', 60);
  await fastForwardToMax(page);
  await page.waitForTimeout(3000);

  // === the abandoned rectangle: a Cell drawn on open ground, far from
  // === anything this session will build, and then never returned to.
  await tab(page, 'zones').click();
  await expect(page.locator('.hud-rooms')).toBeVisible({ timeout: ARM_TIMEOUT_MS });
  if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  }
  const roomRow = page.locator('.hud-rooms__list [data-room="room.cell"]');
  await roomRow.click();
  await expect(roomRow).toHaveAttribute('data-selected', 'true', { timeout: ARM_TIMEOUT_MS });
  const roomArm = page.locator('.hud-rooms__arm');
  if ((await roomArm.getAttribute('data-armed')) !== 'true') await roomArm.click();
  await expect(roomArm).toHaveAttribute('data-armed', 'true', { timeout: ARM_TIMEOUT_MS });
  /*
   * (7,14)-(9,16), not (24,24)-(27,27). Tile 24's centre is screen x=1264 at
   * the camera a new prison starts on, which is under the HUD's right-hand
   * rail, and tile 27's is 1456 -- off a 1440-wide page entirely. The
   * rectangle has to be *reachable by a mouse* and *away from the cell this
   * run will build at 12..17*, and that is both.
   */
  const abandonedA = centreOf(origin, 7, 14);
  const abandonedB = centreOf(origin, 9, 16);
  if (abandonedA.x < 0 || abandonedA.y < 0 || abandonedB.x > 1000 || abandonedB.y > 880) {
    throw new Error(`the abandoned rectangle is off the canvas: ${JSON.stringify([abandonedA, abandonedB])} (origin ${origin.originX},${origin.originY})`);
  }
  await drag(page, abandonedA, abandonedB);
  await page.locator('.hud-rooms__confirm').click();
  await page.waitForTimeout(900);
  const stoodAt = await pageNow(page);
  const abandonedTick = await currentTick(page);
  const standing = await bothSurfaces(page);
  log(`ABANDONED RECTANGLE (7,14)-(9,16) refused at page t=${stoodAt.toFixed(1)}ms, tick ${abandonedTick}`);
  log(`  band=${JSON.stringify(standing.band)}`);
  log(`  alerts=${JSON.stringify(standing.alerts)}`);

  // === now play a cold start past it, logging the corner at every milestone ===
  const milestone = async (name: string): Promise<void> => {
    const surfaces = await bothSurfaces(page);
    log(`MILESTONE ${name} @ page t=${(await pageNow(page)).toFixed(1)}ms tick ${await currentTick(page)}: band=${JSON.stringify(surfaces.band)}`);
  };

  await tab(page, 'build').click();
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  let walls = 0;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    const commands = await drag(page, run.a, run.b);
    walls += commands.length;
    await milestone(`after the ${run.name} wall run (${walls} wall orders so far)`);
  }
  await waitForQueueEmpty(page);
  await milestone(`the build queue emptied (${walls} walls up)`);

  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'zones').click();
    await expect(page.locator('.hud-rooms')).toBeVisible({ timeout: ARM_TIMEOUT_MS });
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    const row = page.locator('.hud-rooms__list [data-room="room.cell"]');
    await row.click();
    await expect(row).toHaveAttribute('data-selected', 'true', { timeout: ARM_TIMEOUT_MS });
    const arm = page.locator('.hud-rooms__arm');
    if ((await arm.getAttribute('data-armed')) !== 'true') await arm.click();
    await expect(arm).toHaveAttribute('data-armed', 'true', { timeout: ARM_TIMEOUT_MS });
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const counts = await latestCounts(page);
    await milestone(`designate attempt ${attempts} (rooms=${counts?.rooms})`);
    if ((counts?.rooms ?? 0) > 0) break;
    if (attempts >= 12) throw new Error('the rectangle was never accepted as a room');
    await page.waitForTimeout(5000);
  }
  const zonedAt = await pageNow(page);
  const surfaces = await bothSurfaces(page);
  log(`THE CELL WAS ZONED at page t=${zonedAt.toFixed(1)}ms, ${(zonedAt - stoodAt).toFixed(1)}ms after the abandoned rectangle was refused`);
  log(`  band=${JSON.stringify(surfaces.band)}`);
  log(`  event=${JSON.stringify(surfaces.event)}`);
  log(`  alerts=${JSON.stringify(surfaces.alerts)}`);
  log(`band transitions: ${JSON.stringify((await bandLog(page)).map((t) => `${t.at.toFixed(1)} ${JSON.stringify(t.text)}`))}`);
});
