/**
 * Playing the rooms surface: designation, the two map controls, the build
 * queue's order, and what a demolition gives back.
 *
 * **A playtest, not a gate.** `tests/browser/playwright.config.ts` collects on
 * `*.spec.ts`, so nothing in CI runs this file; it is driven by hand through
 * `tests/browser/playwright.playtest.config.ts`. Its output is the deliverable,
 * and the findings it produced live in
 * `docs/research/2026-09-01-playing-the-rooms-surface.md`.
 *
 * It plays the surface the way a player meets it -- press the controls the
 * panel shows, drag on the world, read the screen -- and everything it reports
 * is what the *screen* said, not what the store held. Acts log rather than
 * assert, deliberately: a playtest that fails on its first finding stops before
 * the act where the next one is.
 *
 * **Two mechanics were paid for by a hung first run and are kept.**
 * `findFreeTile` measures which tiles a drag can actually reach before any
 * drag is attempted -- the first pass dragged at tile (2,2), which at
 * 1440x900 is off the left edge of the page entirely (the calibrated origin
 * is (-304, -574)), produced no rectangle, and then waited out the whole test
 * timeout on a Discard control that never appeared. And every wait on a
 * control that only *might* be there goes through `discardIfPending`, because
 * this config sets no `actionTimeout`, so a click on a control that never
 * arrives waits for the test timeout rather than failing fast.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  TILE,
  calibrate,
  centreOf,
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

/** What the two map controls say, and whether a player can read them. */
async function armingReadout(page: Page): Promise<string> {
  return page.evaluate(() => {
    const read = (selector: string): string => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) return `${selector}=ABSENT`;
      const laidOut = node.getClientRects().length > 0;
      const text = (node.textContent ?? '').trim();
      const armed = node.dataset['armed'] ?? '-';
      const removing = node.dataset['removing'] ?? '-';
      const disabled = node.hasAttribute('disabled') ? ' DISABLED' : '';
      return `${selector} { text=${JSON.stringify(text)} onScreen=${String(laidOut)}${disabled} data-armed=${armed} data-removing=${removing} }`;
    };
    const panel = document.querySelector<HTMLElement>('.hud-rooms');
    const collapsed = panel?.dataset['collapsed'] ?? '-';
    const area = document.querySelector<HTMLElement>('.hud-rooms__area-value');
    const note = document.querySelector<HTMLElement>('.hud-rooms__note');
    return [
      `panel data-collapsed=${collapsed}`,
      read('.hud-rooms__arm'),
      read('.hud-rooms__remove'),
      read('.hud-rooms__confirm'),
      read('.hud-rooms__cancel'),
      `area=${JSON.stringify((area?.textContent ?? '').trim())}`,
      `note=${JSON.stringify((note?.textContent ?? '').trim())}`,
    ].join('\n    ');
  });
}

/** Opens the Rooms tab and pulls the panel open if it folded itself shut. */
async function openRooms(page: Page): Promise<void> {
  await tab(page, 'rooms').click();
  const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
  if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
}

/** The refusal band, which is the one place a refused command reaches a player. */
async function refusalBand(page: Page): Promise<string> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('.hud__refusal');
    if (node === null) return 'ABSENT';
    if (node.hidden || node.getClientRects().length === 0) return 'not on screen';
    return (node.textContent ?? '').trim();
  });
}

/** The event band, which is where the prison says what it just did. */
async function eventBand(page: Page): Promise<string> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('.hud__event');
    if (node === null) return 'ABSENT';
    if (node.hidden || node.getClientRects().length === 0) return 'not on screen';
    return (node.textContent ?? '').trim();
  });
}

/**
 * The top-left tile of a `width` x `height` block of world the mouse can
 * actually reach -- every corner, every edge midpoint and the centre of the
 * block's own outer **boundary** answering `CANVAS` to
 * `document.elementFromPoint`, so no part of the gesture lands on a HUD panel.
 *
 * **This is the second attempt and the first one's failure is the reason it
 * checks the whole block.** A version that measured one horizontal and one
 * vertical scan line through the middle of the page reported the world as
 * 1439px wide at 1440x900 -- true on that row, and false at the rows the rail
 * panels occupy. Drags taken on its answer came back as 3x3, then 2x2, then
 * 1x1 from three identical gestures, because their start points were under the
 * Rooms panel. A rectangle whose size depends on which panel is open is not a
 * measurement of anything.
 *
 * **This is the third attempt, and the second one's failure is why it checks
 * the boundary rather than the tile centres.** The nine probe points used to
 * sit half a tile in from each side -- `tx*TILE + TILE/2` and the like --
 * which is exactly right for a room-designation drag (it moves between tile
 * *centres*, `centreOf`) and exactly wrong for a wall-edge drag (it moves
 * along the tile *grid line* at `ty*TILE`, one half-tile further out). A run
 * of `findFreeTile(page, origin, 6, 2)` on the Build tab returned tile
 * (5,10), whose row spans screen y 98..162 -- clear of the status strip -- but
 * whose own top edge, the line a horizontal wall run is drawn along, is at
 * y=66, which `document.elementFromPoint(48, 66)` resolved to
 * `SPAN.ui-eyebrow.ui-stat__label` on the status strip. Act 2's "one
 * west-to-east drag submitted 0 PlaceBuildOrder(s)" was this: the drag's
 * mousedown landed on a HUD label, not the canvas, and produced nothing.
 * Checking the block's true outer boundary (`tx*TILE` .. `(tx+w)*TILE`,
 * `ty*TILE` .. `(ty+h)*TILE`) rather than the shrunk tile-centre rectangle
 * covers both callers: a designation drag's tile centres are strictly inside
 * this boundary, and a wall-edge drag's grid lines sit exactly on it.
 */
async function findFreeTile(
  page: Page,
  origin: { originX: number; originY: number },
  width: number,
  height: number,
): Promise<{ tx: number; ty: number }> {
  const found = await page.evaluate(
    ({ originX, originY, width: w, height: h, tile }) => {
      const isWorld = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
        const node = document.elementFromPoint(x, y);
        return node !== null && node.tagName === 'CANVAS';
      };
      const firstTx = Math.ceil(-originX / tile);
      const firstTy = Math.ceil(-originY / tile);
      const lastTx = Math.floor((window.innerWidth - originX) / tile) - w;
      const lastTy = Math.floor((window.innerHeight - originY) / tile) - h;
      for (let ty = firstTy; ty <= lastTy; ty += 1) {
        for (let tx = firstTx; tx <= lastTx; tx += 1) {
          const left = originX + tx * tile;
          const top = originY + ty * tile;
          const right = originX + (tx + w) * tile;
          const bottom = originY + (ty + h) * tile;
          const midX = (left + right) / 2;
          const midY = (top + bottom) / 2;
          const points: readonly (readonly [number, number])[] = [
            [left, top], [right, top], [left, bottom], [right, bottom],
            [midX, top], [midX, bottom], [left, midY], [right, midY], [midX, midY],
          ];
          if (points.every(([x, y]) => isWorld(x, y))) return { tx, ty };
        }
      }
      return undefined;
    },
    { originX: origin.originX, originY: origin.originY, width, height, tile: TILE },
  );
  if (found === undefined) throw new Error(`no ${width}x${height} block of bare world on this page`);
  return found;
}

test.describe('playing the rooms surface, 2026-09-01', () => {
  test('act 1: the two map controls, and whether the screen ever disagrees with the tool', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    console.log(`[act1] calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
    // Five 3x3 probes stacked vertically need a 3x7 block of reachable world,
    // and they are taken with the Rooms panel open, so the block is found with
    // the Rooms panel open too.
    await openRooms(page);
    const { tx: baseTx, ty: baseTy } = await findFreeTile(page, origin, 3, 7);
    console.log(`[act1] probes run from tile (${baseTx},${baseTy}); screen x=${origin.originX + baseTx * TILE}, y=${origin.originY + baseTy * TILE}`);

    await openRooms(page);
    console.log(`[act1] on arrival:\n    ${await armingReadout(page)}`);

    const discardIfPending = async (): Promise<void> => {
      if (await page.locator('.hud-rooms__cancel').isVisible()) {
        await page.locator('.hud-rooms__cancel').click();
        await page.waitForTimeout(150);
      }
    };

    /**
     * One probe: press whatever the caller names, then drag a 3x3 on bare
     * world, then read the screen. The rectangle the drag produces (or does
     * not) is the only honest report of what the world tool actually is,
     * because the panel's own labels are the thing under test.
     */
    const probe = async (label: string, presses: readonly ('arm' | 'remove')[], tx: number, ty: number): Promise<void> => {
      for (const control of presses) {
        // The panel folds itself when it arms, so the control may be off
        // screen. A player has to open it again; so does this.
        const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
        if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
        await page.locator(control === 'arm' ? '.hud-rooms__arm' : '.hud-rooms__remove').click();
        await page.waitForTimeout(120);
      }
      const before = await armingReadout(page);
      await drag(page, centreOf(origin, tx, ty), centreOf(origin, tx + 2, ty + 2));
      const after = await armingReadout(page);
      console.log(`[act1] --- ${label} (${presses.join(' -> ')}) ---`);
      console.log(`[act1] after the presses:\n    ${before}`);
      console.log(`[act1] after a 3x3 drag at (${tx},${ty}):\n    ${after}`);
    };

    await probe('a. arm from a standing start', ['arm'], baseTx, baseTy);
    await discardIfPending();
    await probe('b. press the arm control again (stand down)', ['arm'], baseTx, baseTy + 1);
    await discardIfPending();
    await probe('c. arm to remove from a standing start', ['remove'], baseTx, baseTy + 2);
    await discardIfPending();
    await probe('d. press "Draw on map" while removal is on (#735)', ['arm'], baseTx, baseTy + 3);
    await discardIfPending();
    await probe('e. press the removal control to stop removing (#689)', ['remove', 'remove'], baseTx, baseTy);
    await discardIfPending();

    // Leaving the tab must hand the pointer back.
    await openRooms(page);
    await page.locator('.hud-rooms__arm').click();
    await page.waitForTimeout(120);
    console.log(`[act1] armed, about to leave the tab:\n    ${await armingReadout(page)}`);
    await tab(page, 'build').click();
    await page.waitForTimeout(150);
    await drag(page, centreOf(origin, baseTx, baseTy), centreOf(origin, baseTx + 2, baseTy + 2));
    await openRooms(page);
    console.log(`[act1] back on the Rooms tab after a drag taken from the Build tab:\n    ${await armingReadout(page)}`);
    await discardIfPending();

    /*
     * Choosing a different room type while the removal tool is armed. The
     * panel repaints the rules for the newly selected type; the tool is still
     * a removal tool. Whether the screen still says so is the question.
     */
    await openRooms(page);
    await page.locator('.hud-rooms__remove').click();
    await page.waitForTimeout(120);
    const collapsedForPick = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsedForPick === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    const pickedRoom = page.locator('.hud-rooms__list [data-room]').nth(3);
    const pickedRoomId = await pickedRoom.getAttribute('data-room');
    await pickedRoom.click();
    await page.waitForTimeout(150);
    console.log(`[act1] removal armed, then picked room type ${String(pickedRoomId)}:\n    ${await armingReadout(page)}`);
    console.log(`[act1] the whole Rooms panel then reads:\n${await panelText(page, '.hud-rooms')}`);
  });

  test('act 2: is the build queue in the order I drew it? (ADR 0082)', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    const runLength = 6;
    const { tx: runTx, ty: runTy } = await findFreeTile(page, origin, runLength, 2);
    console.log(`[act2] drawing one run of ${runLength} segments from tile (${runTx},${runTy}) eastward`);

    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const armLabel = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
    if (armLabel.startsWith('place') || armLabel.startsWith('draw')) await page.locator('.hud-build__arm').click();

    const before = (await sentCommands(page)).length;
    await drag(
      page,
      { x: origin.originX + runTx * TILE + TILE / 2, y: origin.originY + runTy * TILE },
      { x: origin.originX + (runTx + runLength) * TILE - TILE / 2, y: origin.originY + runTy * TILE },
    );
    const placed = (await sentCommands(page)).slice(before).filter((c) => c['type'] === 'PlaceBuildOrder');
    const placementOrder = placed.map((c) => `${String(c['x'])},${String(c['y'])}`);
    console.log(`[act2] one west-to-east drag submitted ${placed.length} PlaceBuildOrder(s), in this order: ${JSON.stringify(placementOrder)}`);

    const queueSection = page.locator('.hud-build__queue');
    if ((await queueSection.getAttribute('data-collapsed')) === 'true') {
      await queueSection.locator('> .ui-section__header').click();
    }
    await page.waitForTimeout(400);
    const readRows = async (): Promise<readonly string[]> =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
          .filter((row) => !row.hidden)
          .map((row) => `${(row.querySelector('.hud-build__queue-label')?.textContent ?? '').trim()} [${row.dataset['state'] ?? '?'}]`),
      );
    console.log(`[act2] the Queued fold shows: ${JSON.stringify(await readRows())}`);
    console.log(`[act2] queue readout: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    // And the order the crew actually reaches them in, watched rather than
    // inferred: buy the bricks, run the clock, and record the head of the
    // queue each time it changes.
    if (await page.locator('.hud-build__buy').isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('40');
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(300);
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();

    const headOrder: string[] = [];
    const deadline = Date.now() + 200_000;
    let lastSeen = '';
    while (Date.now() < deadline) {
      const head = await page.evaluate(() => {
        const row = [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')].find((r) => !r.hidden);
        if (row === undefined) return '';
        return (row.querySelector('.hud-build__queue-label')?.textContent ?? '').trim();
      });
      if (head === '') break;
      if (head !== lastSeen) {
        headOrder.push(head);
        lastSeen = head;
      }
      await page.waitForTimeout(300);
    }
    console.log(`[act2] the head of the queue, in the order it changed: ${JSON.stringify(headOrder)}`);
    console.log(`[act2] final queue readout: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  });

  test('act 3: what the panel says when a designation cannot work', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await openRooms(page);

    /*
     * The typed route, not the mouse -- and it is a player route, labelled
     * "Enter coordinates ... The keyboard route. Dragging on the map is
     * quicker." It is used here because the rectangles this act needs (8x8 for
     * a yard, twice, without overlapping the first) are larger than the bare
     * world a 1440x900 page leaves between the HUD's two rails, and because a
     * refusal is the same refusal whichever producer composed the rectangle.
     */
    const coordinates = page.locator('.hud-rooms__coordinates');
    if ((await coordinates.getAttribute('data-collapsed')) === 'true') {
      await coordinates.locator('> .ui-section__header').click();
    }

    const designate = async (
      label: string,
      roomId: string,
      area: { x: number; y: number; w: number; h: number },
    ): Promise<void> => {
      const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
      if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      if ((await coordinates.getAttribute('data-collapsed')) === 'true') {
        await coordinates.locator('> .ui-section__header').click();
      }
      await page.locator(`.hud-rooms__list [data-room="${roomId}"]`).click();
      await page.locator('.hud-rooms__coord-x .ui-number__input').fill(String(area.x));
      await page.locator('.hud-rooms__coord-y .ui-number__input').fill(String(area.y));
      await page.locator('.hud-rooms__coord-width .ui-number__input').fill(String(area.w));
      await page.locator('.hud-rooms__coord-height .ui-number__input').fill(String(area.h));
      await page.locator('.hud-rooms__coordinates-submit').click();
      await page.waitForTimeout(300);

      console.log(`[act3] --- ${label}: ${roomId} over ${area.w}x${area.h} at (${area.x},${area.y}) ---`);
      console.log(`[act3] with the rectangle pending:\n    ${await armingReadout(page)}`);
      const confirmDisabled = await page.locator('.hud-rooms__confirm').getAttribute('disabled');
      console.log(`[act3] confirm disabled attribute = ${String(confirmDisabled)}`);
      if (confirmDisabled !== null) {
        console.log('[act3] the control is disabled, so there is nothing to press; discarding.');
        await page.locator('.hud-rooms__cancel').click();
        await page.waitForTimeout(200);
        return;
      }
      const seen = (await sentCommands(page)).length;
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(1200);
      const produced = (await sentCommands(page)).slice(seen);
      console.log(`[act3] confirm submitted: ${JSON.stringify(produced)}`);
      console.log(`[act3] refusal band says: ${JSON.stringify(await refusalBand(page))}`);
      console.log(`[act3] rooms counted now: ${String((await latestCounts(page))?.rooms)}`);
      await openRooms(page);
      console.log(`[act3] the panel after the press:\n    ${await armingReadout(page)}`);
      console.log(`[act3] enclosure readout: ${JSON.stringify(await panelText(page, '.hud-rooms__enclosure'))}`);
      console.log(`[act3] needs readout: ${JSON.stringify(await panelText(page, '.hud-rooms__needs'))}`);
    };

    /*
     * A new prison materialises exactly one 32x32 chunk at (0,0)
     * (`createNewSimulationRuntime`, `src/simulation/runtime/new-session.ts:402-413`)
     * and nothing beyond it -- `RoomZoningService.zone` refuses a tile in an
     * unmaterialised chunk as `out-of-bounds` (`src/simulation/rooms/zoning.ts:515`).
     * Every rectangle below is chosen to stay inside x:0..31, y:0..31 for that
     * reason: an 8x8 yard at x=40 is not a probe of the world edge, it is a
     * probe of nothing, and the first version of this act found that out by
     * running it -- every one of c/d/e came back `zone.out-of-bounds`
     * ("part of that area is outside the map") instead of exercising the
     * overlap and corner-overlap refusals they were written to reach.
     */
    await designate('a. an enclosed room type on open ground', 'room.cell', { x: 20, y: 20, w: 4, h: 4 });
    await designate('b. under the authored minimum', 'room.cell', { x: 30, y: 20, w: 1, h: 1 });
    await designate('c. an outdoor room type on open ground', 'room.yard', { x: 2, y: 2, w: 8, h: 8 });
    await designate('d. a second room over the first one', 'room.yard', { x: 4, y: 4, w: 8, h: 8 });
    await designate('e. a small room over a corner of the yard', 'room.cell', { x: 2, y: 2, w: 2, h: 3 });
  });

  test('act 4: what a finished object gives back when it is taken away (ADR 0076)', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    const { tx, ty } = await findFreeTile(page, origin, 5, 5);

    const funds = async (): Promise<number | undefined> => (await latestCounts(page))?.treasuryMinorUnits;
    // Nothing on the Build panel reports the construction container's stock, so
    // "what came back" is read from the treasury and from the whole panel.
    const panel = async (): Promise<string> => (await panelText(page, '.hud-build')).replace(/\n/g, ' | ');

    console.log(`[act4] funds at the start: ${String(await funds())}`);

    await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
    if (await page.locator('.hud-build__buy').isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('1');
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(400);
    console.log(`[act4] funds after buying one bed's material: ${String(await funds())}`);

    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(6000);

    const armLabel = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
    if (armLabel.startsWith('place') || armLabel.startsWith('draw')) await page.locator('.hud-build__arm').click();
    const bedPoint = centreOf(origin, tx, ty);
    console.log(`[act4] placing a bed at tile (${tx},${ty}) submitted: ${JSON.stringify(await press(page, bedPoint.x, bedPoint.y))}`);
    console.log(`[act4] funds right after the order: ${String(await funds())}`);

    await waitForQueueEmpty(page);
    await page.waitForTimeout(2500);
    const fundsBuilt = await funds();
    console.log(`[act4] funds once the bed is standing: ${String(fundsBuilt)}`);
    console.log(`[act4] Build panel: ${JSON.stringify(await panel())}`);

    // The Remove tool is the only control on screen that reaches a finished
    // object: the Queued fold excludes `completed` deliberately.
    await page.locator('.hud-build__remove').click();
    await page.waitForTimeout(200);
    console.log(`[act4] the Remove tool submitted: ${JSON.stringify(await press(page, bedPoint.x, bedPoint.y))}`);
    await page.waitForTimeout(2500);
    const fundsRemoved = await funds();
    console.log(`[act4] funds after the bed is taken away: ${String(fundsRemoved)}`);
    console.log(`[act4] refusal band: ${JSON.stringify(await refusalBand(page))}`);
    console.log(`[act4] event band: ${JSON.stringify(await eventBand(page))}`);
    console.log(
      `[act4] ADR 0076's signed amendment of 2026-09-01 says a finished object returns nothing:` +
        ` funds went ${String(fundsBuilt)} -> ${String(fundsRemoved)}, delta ${String((fundsRemoved ?? 0) - (fundsBuilt ?? 0))}.`,
    );

    // A wall, which the same amendment says goes the same way.
    await page.locator('.hud-build__remove').click();
    await page.waitForTimeout(200);
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    if (await page.locator('.hud-build__buy').isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('4');
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(500);
    const wallArm = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
    if (wallArm.startsWith('place') || wallArm.startsWith('draw')) await page.locator('.hud-build__arm').click();
    const wallPoint = { x: origin.originX + (tx + 3) * TILE + TILE / 2, y: origin.originY + (ty + 3) * TILE };
    await press(page, wallPoint.x, wallPoint.y);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(2500);
    const fundsWall = await funds();
    console.log(`[act4] funds once the wall is standing: ${String(fundsWall)}`);
    await page.locator('.hud-build__remove').click();
    await page.waitForTimeout(200);
    console.log(`[act4] the Remove tool on a standing wall submitted: ${JSON.stringify(await press(page, wallPoint.x, wallPoint.y))}`);
    await page.waitForTimeout(2500);
    const fundsWallGone = await funds();
    console.log(`[act4] funds after the wall is taken away: ${String(fundsWallGone)}, delta ${String((fundsWallGone ?? 0) - (fundsWall ?? 0))}`);
    console.log(`[act4] refusal band: ${JSON.stringify(await refusalBand(page))}`);
    console.log(`[act4] Build panel: ${JSON.stringify(await panel())}`);
  });
});
