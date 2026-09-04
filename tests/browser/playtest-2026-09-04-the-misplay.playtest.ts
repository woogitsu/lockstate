import { expect, test, type Page } from '@playwright/test';
import {
  TILE,
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
} from './playtest-harness';

/**
 * **The misplay: every mistake a new player makes, made deliberately, and the
 * route out of each one measured.**
 *
 * > A player gets it wrong. They put the wall in the wrong place, they buy
 * > sixty bricks instead of six, they zone the room a tile short, they hire a
 * > guard they did not want. Can they get back? And what does the game say to
 * > them while they try?
 *
 * ## What this instrument deliberately does NOT re-measure
 *
 * `docs/research/2026-09-04-is-there-a-way-back.md` (branch
 * `playtest/is-there-a-way-back`) already played the *finished wall* case end
 * to end and produced issues #927 and #928, and
 * `docs/research/2026-09-03-what-cancel-actually-gives-back.md` already priced
 * every cancellable build-order state against the tick the command executes
 * at. Repeating either would be a second copy of a settled measurement. This
 * file starts where those two stop:
 *
 * - **act 1** — a *queued* run (not a finished one) drawn on the wrong line,
 *   and the three routes back off it, priced and counted while paused so no
 *   figure here is a lead artefact.
 * - **act 2** — the impatient **double-press**, on six different controls.
 *   Nothing in `docs/research/` has asked what the second press does.
 * - **act 3** — the **room** zoned wrong four ways, the route back off each,
 *   and what happens to furniture standing in a room that is un-zoned.
 * - **act 4** — the **over-buy**, the unaffordable buy, and whether a player
 *   can tell 60 was the wrong number before they press.
 * - **act 5** — **hired and admitted, then unwanted**: the two-press dismissal
 *   against the admission, swept for any route back at all.
 *
 * ## The instrumentation rules inherited, each paid for by a past failure
 *
 * 1. **A press on a HUD-covered point submits nothing at all** — no command,
 *    no refusal, no band — and reads exactly like the game ignoring you.
 *    `assertCanvasAt` runs `document.elementFromPoint` before every world
 *    press.
 * 2. **Sentences and numbers are different channels.** `say()` reads only what
 *    is laid out in `.hud`; every figure comes off the worker tee. A claim
 *    never mixes them.
 * 3. **Nothing rests on wall-clock time.** Times are ticks off
 *    `simulation/clock-state`.
 * 4. **Paused unless the act says otherwise**, so a cancel executes at the
 *    tick its row was priced at (`DEFAULT_LEAD_TICKS` is 20 while running —
 *    `src/ui/simulation-commands.ts`).
 *
 * Findings live in `docs/research/2026-09-04-the-misplay.md`.
 */

/** What the player can actually read, by band. Layout-aware: a folded sentence is absent. */
async function say(page: Page): Promise<{ refusal: string; event: string }> {
  return page.evaluate(() => {
    const read = (selector: string): string => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) return '(absent)';
      if (node.hidden || node.getClientRects().length === 0) return '(not laid out)';
      return (node.innerText ?? '').replace(/\s+/g, ' ').trim();
    };
    return { refusal: read('.hud__refusal'), event: read('.hud__event') };
  });
}

async function funds(page: Page): Promise<{ chip: string; worker: number }> {
  const chip = await page.evaluate(() => {
    const node = [...document.querySelectorAll<HTMLElement>('.hud-strip *')].find((n) =>
      (n.innerText ?? '').includes('FUNDS'),
    );
    return node === undefined ? '(no FUNDS chip)' : (node.innerText ?? '').replace(/\s+/g, ' ').trim();
  });
  const counts = await latestCounts(page);
  return { chip, worker: counts?.treasuryMinorUnits ?? -1 };
}

async function assertCanvasAt(page: Page, x: number, y: number, label: string): Promise<void> {
  const top = await page.evaluate(
    ([px, py]) => {
      const element = document.elementFromPoint(px as number, py as number);
      if (element === null) return 'nothing';
      return `${element.tagName.toLowerCase()}${element.className === '' ? '' : `.${String(element.className)}`}`;
    },
    [x, y],
  );
  expect(top, `${label}: (${x},${y}) is not clear canvas, so a press there proves nothing`).toContain('canvas');
}

/** Opens the Build panel's QUEUED block, which arrives collapsed (#862). */
async function openQueue(page: Page): Promise<{ wasCollapsed: boolean }> {
  await tab(page, 'build').click();
  const section = page.locator('.hud-build__queue');
  if ((await section.count()) === 0) return { wasCollapsed: false };
  const collapsed = (await section.getAttribute('data-collapsed')) === 'true';
  if (collapsed) await section.locator('.ui-section__header').first().click();
  await page.waitForTimeout(150);
  return { wasCollapsed: collapsed };
}

/** Every queue row a player can see, with its text and its order id. */
async function queueRows(page: Page): Promise<readonly { text: string; order: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => ({
        text: (node.innerText ?? '').replace(/\s+/g, ' ').trim(),
        order: node.dataset['order'] ?? '(no data-order)',
      })),
  );
}

/** Every visible control in the HUD, label plus enabled/unavailable state. */
async function controls(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud button, .hud [role="button"]')]
      .filter((node) => node.getClientRects().length > 0)
      .map(
        (node) =>
          `${(node.innerText ?? '').replace(/\s+/g, ' ').trim() || '(no label)'}` +
          `${node.hasAttribute('disabled') ? ' [disabled]' : ''}` +
          `${node.getAttribute('aria-disabled') === 'true' ? ' [aria-disabled]' : ''}` +
          `${node.dataset['unavailable'] === 'true' ? ' [unavailable]' : ''}`,
      ),
  );
}

async function newPrison(page: Page, label: string): Promise<{ originX: number; originY: number }> {
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  console.log(`[${label}] tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  console.log(`[${label}] clock on arrival: ${JSON.stringify(await currentClock(page))} tick=${await currentTick(page)}`);
  return origin;
}

async function armBuild(page: Page, id: string): Promise<void> {
  await tab(page, 'build').click();
  await page.locator(`.hud-build__list [data-buildable="${id}"]`).click();
  const arm = page.locator('.hud-build__arm');
  const label = (await arm.innerText()).trim().toLowerCase();
  if (label.startsWith('place') || label.startsWith('draw')) await arm.click();
}

test.describe('the misplay', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60_000);
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(`[console.error] ${message.text().slice(0, 300)}`);
    });
    await installTee(page);
  });

  /**
   * ACT 1 — six walls on the wrong line, paused. Three routes back, priced.
   *
   * The player draws a run along the wrong row and notices immediately. What
   * can they reach, and what does each route give back? Paused throughout, so
   * every `Cancel` executes at the tick its own row was priced at.
   */
  test('act 1 - a wall run on the wrong line: what the queue offers and what each route pays', async ({ page }) => {
    const L = 'act1';
    const origin = await newPrison(page, L);

    const before = await funds(page);
    console.log(`[${L}] before the mistake: chip=${JSON.stringify(before.chip)} worker=${before.worker}`);

    await armBuild(page, 'wall-brick');
    // Six segments along the north edge of row 12, tiles 12..17.
    const a = { x: origin.originX + 12 * TILE + TILE / 2, y: origin.originY + 12 * TILE };
    const b = { x: origin.originX + 17 * TILE + TILE / 2, y: origin.originY + 12 * TILE };
    await assertCanvasAt(page, a.x, a.y, `${L} run start`);
    await assertCanvasAt(page, b.x, b.y, `${L} run end`);
    const sentBefore = (await sentCommands(page)).length;
    await drag(page, a, b);
    const placed = (await sentCommands(page)).slice(sentBefore);
    console.log(`[${L}] the wrong run: ${placed.length} command(s) -> ${JSON.stringify(placed.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);

    const afterDraw = await funds(page);
    console.log(`[${L}] straight after the wrong run: chip=${JSON.stringify(afterDraw.chip)} worker=${afterDraw.worker} (spent ${before.worker - afterDraw.worker})`);
    console.log(`[${L}] what the game said: ${JSON.stringify(await say(page))}`);
    console.log(`[${L}] clock: ${JSON.stringify(await currentClock(page))} tick=${await currentTick(page)}`);

    // What does the panel offer before the player opens anything?
    const shutText = await panelText(page, '.hud-build__queue');
    console.log(`[${L}] the QUEUED block as it arrives (nothing opened): ${JSON.stringify(shutText)}`);
    console.log(`[${L}] rows visible with the block as it arrives: ${(await queueRows(page)).length}`);

    const { wasCollapsed } = await openQueue(page);
    console.log(`[${L}] the block had to be opened by hand: ${wasCollapsed}`);
    const rows = await queueRows(page);
    console.log(`[${L}] ${placed.length} order(s) queued, ${rows.length} row(s) with a Cancel:`);
    for (const row of rows) console.log(`[${L}]   ${JSON.stringify(row.text)}  order=${row.order.slice(0, 12)}…`);
    console.log(`[${L}] whole block text: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

    // Route 1: press every Cancel the panel offers, one at a time.
    let paid = 0;
    for (let index = 0; index < 6; index += 1) {
      const live = await queueRows(page);
      if (live.length === 0) break;
      const row = live[0];
      if (row === undefined) break;
      const fundsBefore = await funds(page);
      await page.locator('.hud-build__queue-row').filter({ hasText: 'Cancel' }).first().locator('button').last().click();
      await page.waitForTimeout(400);
      const fundsAfter = await funds(page);
      const delta = fundsAfter.worker - fundsBefore.worker;
      paid += delta;
      console.log(
        `[${L}] Cancel #${index + 1}: row said ${JSON.stringify(row.text)} | worker ${fundsBefore.worker} -> ${fundsAfter.worker} (${delta >= 0 ? '+' : ''}${delta})` +
          ` | chip ${JSON.stringify(fundsAfter.chip)} | ${JSON.stringify(await say(page))}`,
      );
    }
    const afterCancels = await funds(page);
    console.log(`[${L}] after pressing every Cancel on offer: worker=${afterCancels.worker}, ${paid} back of ${before.worker - afterDraw.worker} spent`);
    console.log(`[${L}] queue block now: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    console.log(`[${L}] rows now: ${JSON.stringify(await queueRows(page))}`);

    // Route 2: the key nobody told them about.
    for (let index = 0; index < 3; index += 1) {
      const fundsBefore = await funds(page);
      await page.locator('#game-root canvas').press('KeyZ');
      await page.waitForTimeout(500);
      const fundsAfter = await funds(page);
      console.log(
        `[${L}] KeyZ #${index + 1}: worker ${fundsBefore.worker} -> ${fundsAfter.worker}` +
          ` (${fundsAfter.worker - fundsBefore.worker >= 0 ? '+' : ''}${fundsAfter.worker - fundsBefore.worker})` +
          ` | ${JSON.stringify(await say(page))} | queue ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`,
      );
    }

    const end = await funds(page);
    console.log(`[${L}] TOTAL: started ${before.worker}, spent ${before.worker - afterDraw.worker}, ended ${end.worker}, net loss ${before.worker - end.worker}`);
    console.log(`[${L}] final screen: ${JSON.stringify(await say(page))}`);
  });

  /**
   * ACT 2 — the impatient double-press, on six controls.
   *
   * A player who does not see a response presses again. Each pair below is
   * "the same order given twice"; what matters is whether the second press is
   * absorbed, refused with a reason, or executed a second time at full price.
   */
  test('act 2 - the same order given twice', async ({ page }) => {
    const L = 'act2';
    const origin = await newPrison(page, L);

    // --- 2a. the same wall drag, twice ---
    await armBuild(page, 'wall-brick');
    const a = { x: origin.originX + 20 * TILE + TILE / 2, y: origin.originY + 20 * TILE };
    const b = { x: origin.originX + 22 * TILE + TILE / 2, y: origin.originY + 20 * TILE };
    await assertCanvasAt(page, a.x, a.y, `${L} wall a`);
    const before2a = await funds(page);
    let mark = (await sentCommands(page)).length;
    await drag(page, a, b);
    const first = (await sentCommands(page)).slice(mark);
    const mid2a = await funds(page);
    mark = (await sentCommands(page)).length;
    await drag(page, a, b);
    const second = (await sentCommands(page)).slice(mark);
    const after2a = await funds(page);
    console.log(`[${L}] 2a first drag: ${first.length} command(s), worker ${before2a.worker} -> ${mid2a.worker}`);
    console.log(`[${L}] 2a second identical drag: ${second.length} command(s), worker ${mid2a.worker} -> ${after2a.worker} (${after2a.worker - mid2a.worker})`);
    console.log(`[${L}] 2a what the game said after the second drag: ${JSON.stringify(await say(page))}`);

    // --- 2b. the same Buy, twice, with no wait between ---
    await tab(page, 'build').click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').fill('5');
    const before2b = await funds(page);
    await page.locator('.hud-build__buy-submit').click();
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(600);
    const after2b = await funds(page);
    console.log(`[${L}] 2b two Buy presses of 5 × Brick: worker ${before2b.worker} -> ${after2b.worker} (${after2b.worker - before2b.worker})`);
    console.log(`[${L}] 2b deliveries block: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    console.log(`[${L}] 2b what the game said: ${JSON.stringify(await say(page))}`);

    // --- 2c. the same object tile, twice ---
    // First a room to stand it in: objects are refused outside one.
    console.log(`[${L}] 2c is measured in act 3, where a zoned room exists; here the refusal itself is the point.`);
    await armBuild(page, 'bed-wooden');
    const bed = centreOf(origin, 30, 30);
    await assertCanvasAt(page, bed.x, bed.y, `${L} bed tile`);
    const before2c = await funds(page);
    const bedFirst = await press(page, bed.x, bed.y);
    const say2c1 = await say(page);
    const bedSecond = await press(page, bed.x, bed.y);
    const say2c2 = await say(page);
    const after2c = await funds(page);
    console.log(`[${L}] 2c bed on an unzoned tile, press 1: ${bedFirst.length} command(s) | ${JSON.stringify(say2c1)}`);
    console.log(`[${L}] 2c bed on the same tile, press 2: ${bedSecond.length} command(s) | ${JSON.stringify(say2c2)}`);
    console.log(`[${L}] 2c worker ${before2c.worker} -> ${after2c.worker}`);

    // --- 2d. Admit, twice, with no cell ---
    await tab(page, 'overview').click();
    const admit = page.locator('.hud-intake__admit');
    console.log(`[${L}] 2d Admit control disabled=${await admit.getAttribute('disabled')} text=${JSON.stringify((await admit.innerText()).trim())}`);
    const before2d = await latestCounts(page);
    await admit.click({ force: true }).catch((error: unknown) => console.log(`[${L}] 2d first Admit press threw: ${String(error).slice(0, 120)}`));
    const say2d1 = await say(page);
    await admit.click({ force: true }).catch((error: unknown) => console.log(`[${L}] 2d second Admit press threw: ${String(error).slice(0, 120)}`));
    await page.waitForTimeout(400);
    const say2d2 = await say(page);
    const after2d = await latestCounts(page);
    console.log(`[${L}] 2d prisoners ${before2d?.prisoners} -> ${after2d?.prisoners}`);
    console.log(`[${L}] 2d after press 1: ${JSON.stringify(say2d1)}`);
    console.log(`[${L}] 2d after press 2: ${JSON.stringify(say2d2)}`);
    console.log(`[${L}] 2d intake panel: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

    // --- 2e. Hire, twice ---
    await tab(page, 'security').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    const hire = page.locator('.hud-staff__hire');
    console.log(`[${L}] 2e hire control reads ${JSON.stringify((await hire.innerText()).trim())}`);
    const before2e = await latestCounts(page);
    await hire.click();
    await hire.click();
    await page.waitForTimeout(800);
    const after2e = await latestCounts(page);
    console.log(`[${L}] 2e two Hire presses: staff ${before2e?.staff} -> ${after2e?.staff}, worker ${before2e?.treasuryMinorUnits} -> ${after2e?.treasuryMinorUnits}`);
    console.log(`[${L}] 2e what the game said: ${JSON.stringify(await say(page))}`);
    console.log(`[${L}] 2e staff panel: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);

    // --- 2f. Designate, twice, on the same rectangle ---
    await tab(page, 'rooms').click();
    const roomsPanel = page.locator('.hud-rooms');
    if ((await roomsPanel.getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.yard"]').click();
    await page.locator('.hud-rooms__arm').click();
    const yardA = centreOf(origin, 34, 34);
    const yardB = centreOf(origin, 41, 41);
    await assertCanvasAt(page, yardA.x, yardA.y, `${L} yard a`);
    await drag(page, yardA, yardB);
    const before2f = await latestCounts(page);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(600);
    const mid2f = await latestCounts(page);
    const say2f1 = await say(page);
    // Second press: the confirm control after the first designation.
    const confirmVisible = await page.locator('.hud-rooms__confirm').isVisible();
    console.log(`[${L}] 2f after the first Designate: rooms ${before2f?.rooms} -> ${mid2f?.rooms}, confirm still visible=${confirmVisible} | ${JSON.stringify(say2f1)}`);
    if (confirmVisible) {
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(600);
      const after2f = await latestCounts(page);
      console.log(`[${L}] 2f second Designate press: rooms ${mid2f?.rooms} -> ${after2f?.rooms} | ${JSON.stringify(await say(page))}`);
    }
    // And the whole gesture repeated: arm, drag the same rectangle, confirm.
    await page.locator('.hud-rooms__list [data-room="room.yard"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, yardA, yardB);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(600);
    const repeated = await latestCounts(page);
    console.log(`[${L}] 2f the whole gesture repeated on the same rectangle: rooms=${repeated?.rooms} | ${JSON.stringify(await say(page))}`);
    console.log(`[${L}] 2f rooms panel: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);
  });

  /**
   * ACT 3 — the room zoned wrong, four ways, and the route back.
   *
   * Too small, unenclosed, overlapping, and in the wrong place. Then the
   * removal, and what it does to furniture standing inside.
   */
  test('act 3 - a room zoned wrong, and the way back out of it', async ({ page }) => {
    const L = 'act3';
    const origin = await newPrison(page, L);

    await tab(page, 'rooms').click();
    const roomsPanel = page.locator('.hud-rooms');
    if ((await roomsPanel.getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    console.log(`[${L}] rooms panel on arrival: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

    const designate = async (roomId: string, ax: number, ay: number, bx: number, by: number, what: string) => {
      await tab(page, 'rooms').click();
      await page.locator(`.hud-rooms__list [data-room="${roomId}"]`).click();
      await page.locator('.hud-rooms__arm').click();
      const p1 = centreOf(origin, ax, ay);
      const p2 = centreOf(origin, bx, by);
      await assertCanvasAt(page, p1.x, p1.y, `${L} ${what} start`);
      await assertCanvasAt(page, p2.x, p2.y, `${L} ${what} end`);
      await drag(page, p1, p2);
      const armHint = await panelText(page, '.hud-rooms');
      const confirmLabel = (await page.locator('.hud-rooms__confirm').innerText().catch(() => '(absent)')).trim();
      const before = await latestCounts(page);
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(700);
      const after = await latestCounts(page);
      console.log(
        `[${L}] ${what}: ${roomId} ${ax},${ay}..${bx},${by} | confirm read ${JSON.stringify(confirmLabel)}` +
          ` | rooms ${before?.rooms} -> ${after?.rooms} | ${JSON.stringify(await say(page))}`,
      );
      console.log(`[${L}] ${what}: panel before the press said ${JSON.stringify(armHint.split('\n').filter((l) => /OPEN|ENCLOS|AREA|×/i.test(l)))}`);
      return after?.rooms ?? -1;
    };

    // 3a. A cell a tile short. `room.cell` is min 2×3 / 6 tiles
    // (`src/content/room-catalog.ts:94`), so 2×2 is below it.
    await designate('room.cell', 12, 12, 13, 13, '3a cell 2x2 (below minimum)');

    // 3b. A cell of legal size but with no wall around it.
    await designate('room.cell', 12, 12, 13, 14, '3b cell 2x3, no wall built');

    // 3c. A yard, which is `openArea` and needs no enclosure — this one lands.
    const zoned = await designate('room.yard', 20, 20, 27, 27, '3c yard 8x8 in the wrong place');

    // 3d. Overlapping the yard that is now there.
    await designate('room.yard', 24, 24, 31, 31, '3d yard overlapping the first');

    // #780 — does the refusal from 3d survive a success somewhere else?
    const beforeSuccess = await say(page);
    await designate('room.yard', 40, 40, 47, 47, '3e a different yard, far away, which succeeds');
    const afterSuccess = await say(page);
    console.log(`[${L}] #780 check — band before the unrelated success: ${JSON.stringify(beforeSuccess)}`);
    console.log(`[${L}] #780 check — band after the unrelated success:  ${JSON.stringify(afterSuccess)}`);

    // 3f. The route back: is a Remove control on the panel without hunting?
    await tab(page, 'rooms').click();
    console.log(`[${L}] 3f controls visible on the Rooms tab: ${JSON.stringify(await controls(page))}`);

    // Furniture first, so the removal has something to strand.
    if (zoned > 0) {
      await armBuild(page, 'bed-wooden');
      const bed1 = centreOf(origin, 21, 21);
      await assertCanvasAt(page, bed1.x, bed1.y, `${L} bed in yard`);
      const bedCommands = await press(page, bed1.x, bed1.y);
      console.log(`[${L}] 3f a bed inside the mis-placed yard: ${bedCommands.length} command(s) | ${JSON.stringify(await say(page))}`);
    }

    const beforeRemove = await latestCounts(page);
    await tab(page, 'rooms').click();
    await page.locator('.hud-rooms__remove').click();
    const removeArmed = await page.locator('.hud-rooms__remove').innerText();
    console.log(`[${L}] 3f Remove armed, control now reads ${JSON.stringify(removeArmed.trim())}`);
    await drag(page, centreOf(origin, 20, 20), centreOf(origin, 27, 27));
    const removeConfirm = (await page.locator('.hud-rooms__confirm').innerText().catch(() => '(absent)')).trim();
    console.log(`[${L}] 3f the confirm control for a removal reads ${JSON.stringify(removeConfirm)}`);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    const afterRemove = await latestCounts(page);
    console.log(
      `[${L}] 3f removal: rooms ${beforeRemove?.rooms} -> ${afterRemove?.rooms}` +
        ` | worker ${beforeRemove?.treasuryMinorUnits} -> ${afterRemove?.treasuryMinorUnits}` +
        ` | accommodationCapacity ${beforeRemove?.accommodationCapacity} -> ${afterRemove?.accommodationCapacity}`,
    );
    console.log(`[${L}] 3f what the game said about the removal: ${JSON.stringify(await say(page))}`);
    console.log(`[${L}] 3f rooms panel after: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

    // 3g. What became of the bed standing on the un-zoned tile?
    await armBuild(page, 'bed-wooden');
    const orphan = centreOf(origin, 21, 21);
    const rePlace = await press(page, orphan.x, orphan.y);
    console.log(`[${L}] 3g re-placing a bed on the un-zoned tile: ${rePlace.length} command(s) | ${JSON.stringify(await say(page))}`);
    await tab(page, 'build').click();
    await page.locator('.hud-build__remove').click();
    const removed = await press(page, orphan.x, orphan.y);
    console.log(`[${L}] 3g armed Remove on that tile: ${removed.length} command(s) -> ${JSON.stringify(removed)} | ${JSON.stringify(await say(page))}`);
    await page.locator('.hud-build__remove').click();
  });

  /**
   * ACT 4 — sixty bricks instead of six.
   *
   * Can the player tell the number is wrong before they press? What is the
   * route back before the truck lands, and after? And what does the control
   * do when the money is not there — #772's question, re-asked on this tree.
   */
  test('act 4 - a purchase too large, and a purchase they cannot afford', async ({ page }) => {
    const L = 'act4';
    await newPrison(page, L);

    await tab(page, 'build').click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    const buyRow = page.locator('.hud-build__buy');
    if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
    await page.waitForTimeout(200);

    // What does the buy row say before a number is chosen? Is there anything
    // anywhere that says how many bricks a wall needs?
    console.log(`[${L}] the buy row as opened: ${JSON.stringify(await panelText(page, '.hud-build__buy'))}`);
    const wholeBuild = await panelText(page, '.hud-build');
    console.log(`[${L}] whole Build panel text:\n${wholeBuild}`);
    console.log(`[${L}] does anything on the Build tab name how many bricks one wall costs? ${/\b2\b.*brick|brick.*\b2\b/i.test(wholeBuild) ? 'maybe' : 'no such pairing in the visible text'}`);

    const input = page.locator('.hud-build__buy .ui-number__input');
    for (const quantity of ['6', '60', '600', '6000']) {
      await input.fill(quantity);
      await page.waitForTimeout(250);
      const submit = page.locator('.hud-build__buy-submit');
      console.log(
        `[${L}] quantity ${quantity}: field reads ${JSON.stringify(await input.inputValue())}` +
          ` | submit ${JSON.stringify((await submit.innerText()).trim())}` +
          ` disabled=${await submit.getAttribute('disabled')}` +
          ` unavailable=${await submit.getAttribute('data-unavailable')}` +
          ` | shortfall ${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}`,
      );
    }

    // The over-buy: 60 when 6 walls need 12.
    await input.fill('60');
    await page.waitForTimeout(200);
    const before = await funds(page);
    await page.locator('.hud-build__buy-submit').click();
    await page.waitForTimeout(600);
    const afterBuy = await funds(page);
    console.log(`[${L}] bought 60 × Brick: worker ${before.worker} -> ${afterBuy.worker} (${afterBuy.worker - before.worker})`);
    console.log(`[${L}] what the game said: ${JSON.stringify(await say(page))}`);
    console.log(`[${L}] deliveries block: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    // The route back, before the truck lands.
    const cancelRow = page.locator('.hud-build__delivery-row').filter({ hasText: 'Cancel' }).first();
    const cancelRowText = await cancelRow.innerText().catch(() => '(no row)');
    console.log(`[${L}] the delivery row reads ${JSON.stringify(cancelRowText.replace(/\s+/g, ' ').trim())}`);
    const beforeCancel = await funds(page);
    await cancelRow.locator('button').last().click();
    await page.waitForTimeout(600);
    const afterCancel = await funds(page);
    console.log(`[${L}] delivery cancelled: worker ${beforeCancel.worker} -> ${afterCancel.worker} (${afterCancel.worker - beforeCancel.worker}) | ${JSON.stringify(await say(page))}`);

    // The unaffordable buy. Bricks are 40 each; 25,000 buys 625.
    await input.fill('1000');
    await page.waitForTimeout(300);
    const submit = page.locator('.hud-build__buy-submit');
    console.log(
      `[${L}] quantity 1000 (25,000 buys 625): field ${JSON.stringify(await input.inputValue())}` +
        ` | submit ${JSON.stringify((await submit.innerText()).trim())}` +
        ` disabled=${await submit.getAttribute('disabled')}` +
        ` unavailable=${await submit.getAttribute('data-unavailable')}` +
        ` aria-disabled=${await submit.getAttribute('aria-disabled')}`,
    );
    console.log(`[${L}] shortfall line: ${JSON.stringify(await panelText(page, '.hud-build__buy-shortfall'))}`);
    const beforeBad = await funds(page);
    await submit.click({ force: true }).catch((error: unknown) => console.log(`[${L}] the unaffordable Buy press threw: ${String(error).slice(0, 140)}`));
    await page.waitForTimeout(600);
    const afterBad = await funds(page);
    console.log(`[${L}] after the unaffordable press: worker ${beforeBad.worker} -> ${afterBad.worker} | ${JSON.stringify(await say(page))}`);
  });

  /**
   * ACT 5 — hired and admitted, then unwanted.
   *
   * A guard has a two-press dismissal. An admission is swept for any route
   * back at all: every tab, every control, and the page's whole vocabulary.
   */
  test('act 5 - hired, admitted, and then unwanted', async ({ page }) => {
    const L = 'act5';
    await newPrison(page, L);

    // --- the guard nobody wanted ---
    await tab(page, 'security').click();
    const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
    if ((await guardRow.count()) > 0) await guardRow.first().click();
    const hire = page.locator('.hud-staff__hire');
    console.log(`[${L}] hire control reads ${JSON.stringify((await hire.innerText()).trim())}`);
    console.log(`[${L}] staff panel before hiring: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);
    const beforeHire = await latestCounts(page);
    await hire.click();
    await page.waitForTimeout(900);
    const afterHire = await latestCounts(page);
    console.log(
      `[${L}] hired one guard: staff ${beforeHire?.staff} -> ${afterHire?.staff}` +
        ` | worker ${beforeHire?.treasuryMinorUnits} -> ${afterHire?.treasuryMinorUnits} (${(afterHire?.treasuryMinorUnits ?? 0) - (beforeHire?.treasuryMinorUnits ?? 0)})` +
        ` | dailyWageBill ${afterHire?.dailyWageBillMinorUnits}`,
    );
    console.log(`[${L}] what the game said: ${JSON.stringify(await say(page))}`);

    const dismiss = page.locator('.hud-staff__roster button').filter({ hasText: /dismiss/i }).first();
    console.log(`[${L}] dismiss controls found: ${await page.locator('.hud-staff__roster button').count()}`);
    console.log(`[${L}] roster block: ${JSON.stringify(await panelText(page, '.hud-staff__roster'))}`);
    const beforeDismiss = await latestCounts(page);
    await dismiss.click();
    await page.waitForTimeout(400);
    console.log(`[${L}] after ONE dismiss press: ${JSON.stringify(await panelText(page, '.hud-staff__dismiss-confirm'))}`);
    console.log(`[${L}] after ONE dismiss press, staff=${(await latestCounts(page))?.staff}`);
    await dismiss.click();
    await page.waitForTimeout(900);
    const afterDismiss = await latestCounts(page);
    console.log(
      `[${L}] after TWO dismiss presses: staff ${beforeDismiss?.staff} -> ${afterDismiss?.staff}` +
        ` | worker ${beforeDismiss?.treasuryMinorUnits} -> ${afterDismiss?.treasuryMinorUnits} (${(afterDismiss?.treasuryMinorUnits ?? 0) - (beforeDismiss?.treasuryMinorUnits ?? 0)})` +
        ` | dailyWageBill ${afterDismiss?.dailyWageBillMinorUnits}`,
    );
    console.log(`[${L}] what the game said: ${JSON.stringify(await say(page))}`);
    console.log(`[${L}] staff panel after: ${JSON.stringify(await panelText(page, '.hud-staff'))}`);

    // --- the prisoner nobody wanted ---
    // A cell first, because `admit.no-accommodation` refuses otherwise. The
    // fast route: a yard is `openArea`, but accommodation needs a cell, so
    // this builds the enclosed 2×3 the harness's own recipe uses.
    const origin = await calibrate(page);
    await armBuild(page, 'wall-brick');
    const westX = origin.originX + 12 * TILE;
    const eastX = origin.originX + 14 * TILE;
    const northY = origin.originY + 12 * TILE;
    const southY = origin.originY + 15 * TILE;
    for (const run of [
      { a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      await drag(page, run.a, run.b);
    }
    // The clock has to run for the crew to build.
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();
    for (let index = 0; index < 60; index += 1) {
      const text = await panelText(page, '.hud-build__queue');
      if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) break;
      await page.waitForTimeout(1000);
    }
    console.log(`[${L}] wall queue empty at tick ${await currentTick(page)}`);

    let rooms = 0;
    for (let attempt = 0; attempt < 10 && rooms === 0; attempt += 1) {
      await tab(page, 'rooms').click();
      if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
        await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      }
      await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
      await page.locator('.hud-rooms__arm').click();
      await drag(page, centreOf(origin, 12, 12), centreOf(origin, 13, 14));
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(1200);
      rooms = (await latestCounts(page))?.rooms ?? 0;
    }
    console.log(`[${L}] rooms=${rooms} at tick ${await currentTick(page)}`);
    await armBuild(page, 'bed-wooden');
    await press(page, centreOf(origin, 12, 12).x, centreOf(origin, 12, 12).y);
    for (let index = 0; index < 40; index += 1) {
      const text = await panelText(page, '.hud-build__queue');
      if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) break;
      await page.waitForTimeout(1000);
    }

    await tab(page, 'overview').click();
    const beforeAdmit = await latestCounts(page);
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(1500);
    const afterAdmit = await latestCounts(page);
    console.log(`[${L}] admitted: prisoners ${beforeAdmit?.prisoners} -> ${afterAdmit?.prisoners} | ${JSON.stringify(await say(page))}`);
    console.log(`[${L}] intake panel: ${JSON.stringify(await panelText(page, '.hud-intake'))}`);

    // The sweep: is there a route back from an admission anywhere on the page?
    const WORDS = /release|discharg|free|expel|transfer|deport|evict|let go|send away|remove prisoner|un-?admit/i;
    for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
      await tab(page, id).click();
      await page.waitForTimeout(250);
      const all = await controls(page);
      const matching = all.filter((label) => WORDS.test(label));
      const textNodes = await page.evaluate(
        (source: string) => {
          const pattern = new RegExp(source, 'i');
          const hud = document.querySelector<HTMLElement>('.hud');
          if (hud === null) return [];
          return (hud.innerText ?? '')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && pattern.test(line));
        },
        WORDS.source,
      );
      console.log(`[${L}] tab ${id}: ${all.length} controls, ${matching.length} naming a route back ${JSON.stringify(matching)}, ${textNodes.length} matching line(s) ${JSON.stringify(textNodes)}`);
    }
    console.log(`[${L}] prisoners still ${(await latestCounts(page))?.prisoners} at tick ${await currentTick(page)}`);
  });
});
