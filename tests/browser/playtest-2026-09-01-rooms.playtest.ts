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
 * panel shows, drag on the world, read the screen -- and every assertion below
 * is about what the *screen* said, not about what the store held. Where an act
 * only measures, it logs and does not assert: a playtest that fails on a
 * finding stops before the next act, and the next act is where the next finding
 * is.
 */
import { expect, test } from '@playwright/test';

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
async function armingReadout(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const read = (selector: string): string => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) return `${selector}=ABSENT`;
      const laidOut = node.getClientRects().length > 0;
      const text = (node.textContent ?? '').trim();
      const armed = node.dataset['armed'] ?? '-';
      const removing = node.dataset['removing'] ?? '-';
      return `${selector} { text=${JSON.stringify(text)} onScreen=${String(laidOut)} data-armed=${armed} data-removing=${removing} }`;
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
async function openRooms(page: import('@playwright/test').Page): Promise<void> {
  await tab(page, 'rooms').click();
  const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
  if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
}

/** The refusal band, which is the one place a refused command reaches a player. */
async function refusalBand(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('.hud__refusal');
    if (node === null) return 'ABSENT';
    if (node.hidden || node.getClientRects().length === 0) return 'not on screen';
    return (node.textContent ?? '').trim();
  });
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

    await openRooms(page);
    console.log(`[act1] on arrival:\n    ${await armingReadout(page)}`);

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

    await probe('a. arm from a standing start', ['arm'], 2, 2);
    // Discard, so the pass continues with the tool where the last probe left it.
    await page.locator('.hud-rooms__cancel').click();
    await page.waitForTimeout(150);

    await probe('b. press the arm control again (stand down)', ['arm'], 6, 2);
    await probe('c. arm to remove from a standing start', ['remove'], 10, 2);
    if (await page.locator('.hud-rooms__cancel').isVisible()) {
      await page.locator('.hud-rooms__cancel').click();
      await page.waitForTimeout(150);
    }
    await probe('d. press "Draw on map" while removal is on (#735)', ['arm'], 14, 2);
    if (await page.locator('.hud-rooms__cancel').isVisible()) {
      await page.locator('.hud-rooms__cancel').click();
      await page.waitForTimeout(150);
    }
    await probe('e. press the removal control to stop removing (#689)', ['remove', 'remove'], 18, 2);
    if (await page.locator('.hud-rooms__cancel').isVisible()) {
      await page.locator('.hud-rooms__cancel').click();
      await page.waitForTimeout(150);
    }

    // Leaving the tab must hand the pointer back.
    await page.locator('.hud-rooms__arm').click();
    await page.waitForTimeout(120);
    console.log(`[act1] armed, about to leave the tab:\n    ${await armingReadout(page)}`);
    await tab(page, 'build').click();
    await page.waitForTimeout(150);
    await drag(page, centreOf(origin, 2, 8), centreOf(origin, 4, 10));
    await openRooms(page);
    console.log(`[act1] back on the Rooms tab after a drag from the Build tab:\n    ${await armingReadout(page)}`);

    /*
     * Choosing a different room type while the removal tool is armed. The
     * panel repaints the rules for the newly selected type; the tool is still
     * a removal tool. Whether the screen still says so is the question.
     */
    await page.locator('.hud-rooms__remove').click();
    await page.waitForTimeout(120);
    const collapsedForPick = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsedForPick === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    const secondRoom = page.locator('.hud-rooms__list [data-room]').nth(3);
    const secondRoomId = await secondRoom.getAttribute('data-room');
    await secondRoom.click();
    await page.waitForTimeout(150);
    console.log(`[act1] removal armed, then picked room type ${String(secondRoomId)}:\n    ${await armingReadout(page)}`);
  });

  test('act 2: is the build queue in the order I drew it? (ADR 0082)', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    const origin = await calibrate(page);

    // Arm the wall tool and draw one run west to east, so placement order is
    // the order of the tiles along it and nothing else.
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const armLabel = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
    if (armLabel.startsWith('place') || armLabel.startsWith('draw')) await page.locator('.hud-build__arm').click();

    const before = (await sentCommands(page)).length;
    await drag(page, { x: origin.originX + 4 * TILE + TILE / 2, y: origin.originY + 4 * TILE }, { x: origin.originX + 10 * TILE - TILE / 2, y: origin.originY + 4 * TILE });
    const placed = (await sentCommands(page)).slice(before).filter((c) => c['type'] === 'PlaceBuildOrder');
    const placementOrder = placed.map((c) => `${String(c['x'])},${String(c['y'])}`);
    console.log(`[act2] the drag submitted ${placed.length} PlaceBuildOrder(s), in this order: ${JSON.stringify(placementOrder)}`);

    // Now read the queue the panel shows, which says it lists them "in the
    // order the crew will reach them".
    const queueSection = page.locator('.hud-build__queue');
    const collapsed = await queueSection.getAttribute('data-collapsed');
    if (collapsed === 'true') await queueSection.locator('> .ui-section__header').click();
    await page.waitForTimeout(300);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
        .filter((row) => !row.hidden)
        .map((row) => `${(row.querySelector('.hud-build__queue-label')?.textContent ?? '').trim()} [${row.dataset['state'] ?? '?'}]`),
    );
    console.log(`[act2] the Queued fold shows ${rows.length} row(s): ${JSON.stringify(rows)}`);
    console.log(`[act2] queue count readout: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    // And the order the crew actually reaches them in, watched rather than
    // inferred: buy the bricks, run the clock, and record which tile leaves
    // the queue first.
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('40');
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(300);
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();

    const completionOrder: string[] = [];
    const deadline = Date.now() + 180_000;
    let lastSeen = '';
    while (Date.now() < deadline) {
      const head = await page.evaluate(() => {
        const row = [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')].find((r) => !r.hidden);
        if (row === undefined) return '';
        return (row.querySelector('.hud-build__queue-label')?.textContent ?? '').trim();
      });
      if (head === '') break;
      if (head !== lastSeen) {
        completionOrder.push(head);
        lastSeen = head;
      }
      await page.waitForTimeout(400);
    }
    console.log(`[act2] the head of the queue, in the order it changed: ${JSON.stringify(completionOrder)}`);
    console.log(`[act2] final queue readout: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  });

  test('act 3: what the panel says when a designation cannot work', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    const origin = await calibrate(page);
    await openRooms(page);

    const designate = async (label: string, roomId: string, area: { x: number; y: number; w: number; h: number }): Promise<void> => {
      const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
      if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      await page.locator(`.hud-rooms__list [data-room="${roomId}"]`).click();
      await page.locator('.hud-rooms__arm').click();
      await drag(page, centreOf(origin, area.x, area.y), centreOf(origin, area.x + area.w - 1, area.y + area.h - 1));
      const readout = await armingReadout(page);
      const confirmDisabled = await page.locator('.hud-rooms__confirm').getAttribute('disabled');
      console.log(`[act3] --- ${label}: ${roomId} over ${area.w}x${area.h} at (${area.x},${area.y}) ---`);
      console.log(`[act3] before pressing confirm:\n    ${readout}`);
      console.log(`[act3] confirm disabled attribute = ${String(confirmDisabled)}`);
      if (confirmDisabled === null) {
        const seen = (await sentCommands(page)).length;
        await page.locator('.hud-rooms__confirm').click();
        await page.waitForTimeout(900);
        const produced = (await sentCommands(page)).slice(seen);
        console.log(`[act3] confirm submitted: ${JSON.stringify(produced)}`);
        console.log(`[act3] refusal band says: ${JSON.stringify(await refusalBand(page))}`);
        console.log(`[act3] rooms now: ${String((await latestCounts(page))?.rooms)}`);
        await openRooms(page);
        console.log(`[act3] panel after the press:\n    ${await armingReadout(page)}`);
      } else {
        await page.locator('.hud-rooms__cancel').click();
        await page.waitForTimeout(150);
      }
    };

    // Nothing is walled: an enclosed room over bare ground.
    await designate('a. an enclosed room type on open ground', 'room.cell', { x: 4, y: 4, w: 4, h: 4 });
    // Below the authored minimum.
    await designate('b. under the authored minimum', 'room.cell', { x: 20, y: 4, w: 1, h: 1 });
    // A room type that needs no enclosure, on open ground.
    await designate('c. an outdoor room type on open ground', 'room.yard', { x: 4, y: 20, w: 8, h: 8 });
    // And then the same tiles again, over what act c just designated.
    await designate('d. a second room over the first one', 'room.yard', { x: 6, y: 22, w: 8, h: 8 });
  });

  test('act 4: what a finished object gives back when it is taken away (ADR 0076)', async ({ page }) => {
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await tab(page, 'build').click();
    const origin = await calibrate(page);

    const funds = async (): Promise<number | undefined> => (await latestCounts(page))?.treasuryMinorUnits;
    // Nothing on the Build panel reports the construction container's stock,
    // so "what came back" is read from the whole panel and from the treasury.
    const stock = async (): Promise<string> => (await panelText(page, '.hud-build')).replace(/\n/g, ' | ');

    console.log(`[act4] funds at the start: ${String(await funds())}`);

    // Buy one bed's worth of material, place a bed, let the crew finish it.
    await page.locator('.hud-build__list [data-buildable="bed-wooden"]').click();
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('1');
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(300);
    console.log(`[act4] funds after buying one bed's material: ${String(await funds())}`);

    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(6000);

    const armLabel = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
    if (armLabel.startsWith('place') || armLabel.startsWith('draw')) await page.locator('.hud-build__arm').click();
    const bedPoint = centreOf(origin, 6, 6);
    const placeCommands = await press(page, bedPoint.x, bedPoint.y);
    console.log(`[act4] placing a bed at tile (6,6) submitted: ${JSON.stringify(placeCommands)}`);
    const fundsAfterOrder = await funds();
    console.log(`[act4] funds right after the order: ${String(fundsAfterOrder)}`);

    await waitForQueueEmpty(page);
    await page.waitForTimeout(2500);
    const fundsBuilt = await funds();
    console.log(`[act4] funds once the bed is standing: ${String(fundsBuilt)}`);
    console.log(`[act4] materials block: ${JSON.stringify(await stock())}`);
    console.log(`[act4] accommodation capacity: ${String((await latestCounts(page))?.accommodationCapacity)}`);

    // Now take it away with the Remove tool, which is the only control on
    // screen that reaches a finished object.
    await page.locator('.hud-build__remove').click();
    await page.waitForTimeout(150);
    const removeCommands = await press(page, bedPoint.x, bedPoint.y);
    console.log(`[act4] the Remove tool submitted: ${JSON.stringify(removeCommands)}`);
    await page.waitForTimeout(2500);
    const fundsRemoved = await funds();
    console.log(`[act4] funds after the bed is taken away: ${String(fundsRemoved)}`);
    console.log(`[act4] materials block after removal: ${JSON.stringify(await stock())}`);
    console.log(`[act4] accommodation capacity after removal: ${String((await latestCounts(page))?.accommodationCapacity)}`);
    console.log(`[act4] refusal band: ${JSON.stringify(await refusalBand(page))}`);
    console.log(
      `[act4] ADR 0076 amendment of 2026-09-01 says a finished object returns nothing.` +
        ` funds went ${String(fundsBuilt)} -> ${String(fundsRemoved)} (delta ${String((fundsRemoved ?? 0) - (fundsBuilt ?? 0))}).`,
    );

    // And a wall, which the same amendment says goes the same way.
    await page.locator('.hud-build__remove').click();
    await page.waitForTimeout(150);
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    if (await page.locator('.hud-build__buy').isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('4');
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(400);
    const wallArm = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
    if (wallArm.startsWith('place') || wallArm.startsWith('draw')) await page.locator('.hud-build__arm').click();
    const wallPoint = { x: origin.originX + 10 * TILE + TILE / 2, y: origin.originY + 10 * TILE };
    await press(page, wallPoint.x, wallPoint.y);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(2000);
    const fundsWall = await funds();
    console.log(`[act4] funds once the wall is standing: ${String(fundsWall)}`);
    await page.locator('.hud-build__remove').click();
    await page.waitForTimeout(150);
    const wallRemoval = await press(page, wallPoint.x, wallPoint.y);
    console.log(`[act4] the Remove tool on a standing wall submitted: ${JSON.stringify(wallRemoval)}`);
    await page.waitForTimeout(2500);
    console.log(`[act4] funds after the wall is taken away: ${String(await funds())}`);
    console.log(`[act4] materials block: ${JSON.stringify(await stock())}`);
    console.log(`[act4] refusal band: ${JSON.stringify(await refusalBand(page))}`);
  });
});
