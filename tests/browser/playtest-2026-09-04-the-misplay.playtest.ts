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
 * The `is-there-a-way-back` record on branch `playtest/is-there-a-way-back`
 * already played the *finished wall* case end to end and produced issues #927
 * and #928 -- it is named rather than cited as a path because that branch is
 * unmerged, and `tests/foundation/documentation-links-contract.test.ts`
 * rightly fails a rooted path that is not on disk. And
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

/**
 * Every queue row a player can see, with its text, its order id and whether
 * its Cancel is actually pressable.
 *
 * **`aria-disabled` is the read that matters and it cost this file a run.** A
 * row whose order has gone is emptied but *keeps its box* and keeps a button
 * still reading `Cancel` (`build-panel.ts:2270-2290`, the `holds-open` arm);
 * only `setUnavailable` marks it, and Playwright's actionability treats
 * `aria-disabled="true"` as not enabled. A `hasText: 'Cancel'` locator
 * therefore resolves to a dead control and waits out its whole timeout, which
 * reads exactly like a broken button.
 */
async function queueRows(
  page: Page,
): Promise<readonly { text: string; order: string; pressable: boolean }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const button = node.querySelector<HTMLElement>('button');
        return {
          text: (node.innerText ?? '').replace(/\s+/g, ' ').trim(),
          order: node.dataset['order'] ?? '(no data-order)',
          pressable:
            button !== null &&
            button.getAttribute('aria-disabled') !== 'true' &&
            !button.hasAttribute('disabled'),
        };
      }),
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

/**
 * Arms the Rooms tool, reading the label first.
 *
 * **`.hud-rooms__arm` is a toggle and clicking it blind disarms an already
 * armed tool.** That cost this file act 3's 3b reading: `Discard` leaves the
 * tool armed, the control then reads "Stop drawing", and the click that was
 * meant to arm it put it down instead — after which the drag produced nothing
 * and the confirm read `Designate 0 × 0`, which looks exactly like a drag the
 * world refused. `armBuildable` in the shared harness reads the label for the
 * same reason; this is that rule one panel over.
 */
async function armRooms(page: Page): Promise<void> {
  const arm = page.locator('.hud-rooms__arm');
  if (!(await arm.isVisible())) return;
  const label = (await arm.innerText()).trim().toLowerCase();
  if (label.startsWith('draw') || label.startsWith('place')) await arm.click();
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
    for (let index = 0; index < 8; index += 1) {
      const live = await queueRows(page);
      const row = live.find((candidate) => candidate.pressable && candidate.order !== '(no data-order)');
      if (row === undefined) {
        console.log(`[${L}] no pressable Cancel left after ${index} press(es). Rows: ${JSON.stringify(live)}`);
        break;
      }
      const fundsBefore = await funds(page);
      await page.locator(`.hud-build__queue-row[data-order="${row.order}"] button`).last().click();
      await page.waitForTimeout(600);
      const fundsAfter = await funds(page);
      const delta = fundsAfter.worker - fundsBefore.worker;
      paid += delta;
      console.log(
        `[${L}] Cancel #${index + 1}: row said ${JSON.stringify(row.text)} | worker ${fundsBefore.worker} -> ${fundsAfter.worker} (${delta >= 0 ? '+' : ''}${delta})` +
          ` | ${JSON.stringify(await say(page))}`,
      );
      console.log(`[${L}]   rows after that press: ${JSON.stringify(await queueRows(page))}`);
      console.log(`[${L}]   header now: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
      /*
       * **Can a player tell the dead Cancel from a live one?** A cancelled
       * row keeps its box and a button still labelled `Cancel`, marked only by
       * `aria-disabled` — so this reads what the pixels say, not what the
       * attribute says. If the two look identical, a press on the dead one is
       * a control that does nothing and says nothing.
       */
      if (index === 0) {
        const look = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]
            .filter((row) => row.getClientRects().length > 0)
            .map((row) => {
              const button = row.querySelector<HTMLElement>('button');
              if (button === null) return 'no button';
              const style = getComputedStyle(button);
              const box = button.getBoundingClientRect();
              return {
                dead: button.getAttribute('aria-disabled') === 'true',
                label: (button.innerText ?? '').trim(),
                opacity: style.opacity,
                color: style.color,
                background: style.backgroundColor,
                cursor: style.cursor,
                box: `${Math.round(box.width)}x${Math.round(box.height)}`,
              };
            }),
        );
        console.log(`[${L}]   how the three Cancel controls LOOK: ${JSON.stringify(look)}`);
      }
    }
    const afterCancels = await funds(page);
    console.log(`[${L}] after pressing every Cancel on offer: worker=${afterCancels.worker}, ${paid} back of ${before.worker - afterDraw.worker} spent`);

    // Does the pool refill once the clock runs? If it only refills on a
    // publication, a paused player has one press and then a dead block.
    console.log(`[${L}] --- pressing Play ---`);
    await page.locator('.hud-strip__transport button').nth(1).click();
    await page.waitForTimeout(2500);
    console.log(`[${L}] rows after the clock ran: ${JSON.stringify(await queueRows(page))}`);
    console.log(`[${L}] header after the clock ran: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    console.log(`[${L}] clock: ${JSON.stringify(await currentClock(page))} tick=${await currentTick(page)}`);
    // And pause again, so the undo presses below are not lead artefacts.
    await page.locator('.hud-strip__transport button').nth(0).click();
    await page.waitForTimeout(500);
    console.log(`[${L}] paused again: ${JSON.stringify(await currentClock(page))}`);
    console.log(`[${L}] funds after that: ${(await funds(page)).worker}`);

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
    const bed = centreOf(origin, 8, 13);
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
    await tab(page, 'manage').click();
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
    await tab(page, 'zones').click();
    const roomsPanel = page.locator('.hud-rooms');
    if ((await roomsPanel.getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.holding-cell"]').click();
    await armRooms(page);
    const yardA = centreOf(origin, 12, 13);
    const yardB = centreOf(origin, 15, 16);
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
    await page.locator('.hud-rooms__list [data-room="room.holding-cell"]').click();
    await armRooms(page);
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

    await tab(page, 'zones').click();
    const roomsPanel = page.locator('.hud-rooms');
    if ((await roomsPanel.getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    console.log(`[${L}] rooms panel on arrival: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

    const designate = async (roomId: string, ax: number, ay: number, bx: number, by: number, what: string) => {
      await tab(page, 'zones').click();
      /*
       * A rectangle left pending swaps the action row over to
       * `Designate`/`Discard` and *hides* the arm control
       * (`rooms-panel.ts:1179-1191`, "four controls sharing one 44px box"), so
       * a run that walked straight to `.hud-rooms__arm` waits out its whole
       * timeout on a hidden button. Discarding first is what a player does
       * too: it is the only way out of a rectangle the panel will not accept.
       */
      const cancel = page.locator('.hud-rooms__cancel');
      if (await cancel.isVisible()) {
        console.log(`[${L}] a rectangle was still pending; pressing ${JSON.stringify((await cancel.innerText()).trim())} to get out of it`);
        await cancel.click();
        await page.waitForTimeout(300);
      }
      /*
       * **Discarding a rectangle folds the whole Rooms panel away.** The panel
       * is collapsed for the length of a *drawing pass* — armed with nothing
       * pending — by `folded()` (`rooms-panel.ts:522`, `panel.setCollapsed`
       * at `:1771`), and Discard puts the panel back into exactly that state
       * with the tool still armed. So the room-type list and the requirement
       * text a player needs in order to correct their mistake go off the
       * screen at the moment they said "no, not that". Counted here rather
       * than worked around silently.
       */
      const shut = (await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true';
      if (shut) {
        console.log(`[${L}] the whole Rooms panel was folded shut and had to be re-opened before anything could be chosen`);
        await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
        await page.waitForTimeout(200);
      }
      /*
       * **Arming folds the room-type list** (`rooms-panel.ts`, `drawingFolded
       * = true` on the arm transition), so choosing a *different* room type
       * after one arm means opening the catalogue again. Reported rather than
       * silently worked around: it is a step in every do-over.
       */
      const catalogue = page.locator('.hud-rooms__catalogue');
      const catalogueShut = (await catalogue.getAttribute('data-collapsed')) === 'true';
      if (catalogueShut) {
        console.log(`[${L}] the room-type list was folded shut and had to be opened again`);
        await catalogue.locator('.ui-section__header').first().click();
        await page.waitForTimeout(150);
      }
      await page.locator(`.hud-rooms__list [data-room="${roomId}"]`).click();
      await armRooms(page);
      const p1 = centreOf(origin, ax, ay);
      const p2 = centreOf(origin, bx, by);
      await assertCanvasAt(page, p1.x, p1.y, `${L} ${what} start`);
      await assertCanvasAt(page, p2.x, p2.y, `${L} ${what} end`);
      await drag(page, p1, p2);
      const armHint = await panelText(page, '.hud-rooms');
      const confirm = page.locator('.hud-rooms__confirm');
      const confirmLabel = (await confirm.innerText().catch(() => '(absent)')).trim();
      /*
       * **Whether the control is pressable at all is the measurement**, not a
       * precondition of it. The Rooms panel disables `Designate` for a
       * rectangle it can already tell will be refused, which is the opposite
       * of the Buy control's shape in #772 — so a run that only clicked would
       * report a timeout where the finding is that the game stopped the player
       * before the press.
       */
      const disabled = (await confirm.getAttribute('disabled')) !== null;
      const describedBy = await confirm.getAttribute('aria-describedby');
      const note = await page.evaluate((id: string | null) => {
        if (id === null) return '(no aria-describedby)';
        const node = document.getElementById(id);
        if (node === null) return '(described by an element that is not there)';
        return (node.innerText ?? '').replace(/\s+/g, ' ').trim();
      }, describedBy);
      const before = await latestCounts(page);
      if (!disabled) {
        await confirm.click();
        await page.waitForTimeout(700);
      }
      const after = await latestCounts(page);
      console.log(
        `[${L}] ${what}: ${roomId} ${ax},${ay}..${bx},${by} | confirm read ${JSON.stringify(confirmLabel)}` +
          ` disabled=${disabled} | its own note: ${JSON.stringify(note)}` +
          ` | rooms ${before?.rooms} -> ${after?.rooms} | ${JSON.stringify(await say(page))}`,
      );
      console.log(`[${L}] ${what}: panel before the press said ${JSON.stringify(armHint.split('\n').filter((l) => /OPEN|ENCLOS|AREA|×|NEEDS|TILES/i.test(l)))}`);
      return after?.rooms ?? -1;
    };

    // 3a. A cell a tile short. `room.cell` is min 2×3 / 6 tiles
    // (`src/content/room-catalog.ts:94`), so 2×2 is below it.
    await designate('room.cell', 7, 12, 8, 13, '3a cell 2x2 (below minimum, needs 2x3)');

    // 3b. A cell of legal size but with no wall around it.
    await designate('room.cell', 7, 12, 8, 14, '3b cell 2x3, no wall built');

    /*
     * 3c. The one room type that lands with no wall built: `room.yard` is the
     * only entry in `src/content/room-catalog.ts` whose requirements are
     * `outdoors` rather than `enclosed` (every other one of the eighteen
     * carries `{ type: 'enclosed' }`), so it is the cheapest way to get a
     * *standing* room to take back. 8x8 is its minimum.
     */
    const zoned = await designate('room.yard', 7, 12, 14, 19, '3c yard 8x8 in the wrong place');

    // 3d. Overlapping the yard that is now there.
    await designate('room.yard', 12, 12, 19, 19, '3d yard overlapping the first');
    const beforeSuccess = await say(page);

    // 3f. The route back: is a Remove control on the panel without hunting?
    await tab(page, 'zones').click();
    console.log(`[${L}] 3f controls visible on the Rooms tab: ${JSON.stringify(await controls(page))}`);

    // Furniture first, so the removal has something to strand.
    if (zoned > 0) {
      await armBuild(page, 'bed-wooden');
      const bed1 = centreOf(origin, 8, 13);
      await assertCanvasAt(page, bed1.x, bed1.y, `${L} bed in yard`);
      const fundsBeforeBed = await funds(page);
      const bedCommands = await press(page, bed1.x, bed1.y);
      await page.waitForTimeout(500);
      const fundsAfterBed = await funds(page);
      console.log(
        `[${L}] 3e a bed inside the mis-placed yard: ${bedCommands.length} command(s) -> ${JSON.stringify(bedCommands)}` +
          ` | worker ${fundsBeforeBed.worker} -> ${fundsAfterBed.worker} (${fundsAfterBed.worker - fundsBeforeBed.worker})` +
          ` | ${JSON.stringify(await say(page))}`,
      );
      await openQueue(page);
      console.log(`[${L}] 3e queue after the bed: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
      // Let the crew stand it up, so the removal below has a standing object
      // rather than a pending order to take away.
      await page.locator('.hud-strip__transport button').nth(2).click();
      await page.waitForTimeout(200);
      await page.locator('.hud-strip__transport button').nth(2).click();
      for (let index = 0; index < 40; index += 1) {
        const text = await panelText(page, '.hud-build__queue');
        if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) break;
        await page.waitForTimeout(1000);
      }
      await page.locator('.hud-strip__transport button').nth(0).click();
      await page.waitForTimeout(400);
      console.log(`[${L}] 3e the bed is standing at tick ${await currentTick(page)}; clock ${JSON.stringify(await currentClock(page))}`);
    }

    const beforeRemove = await latestCounts(page);
    await tab(page, 'zones').click();
    await page.locator('.hud-rooms__remove').click();
    console.log(`[${L}] 3f band immediately before the removal: ${JSON.stringify(beforeSuccess)}`);
    const removeArmed = await page.locator('.hud-rooms__remove').innerText();
    console.log(`[${L}] 3f Remove armed, control now reads ${JSON.stringify(removeArmed.trim())}`);
    await drag(page, centreOf(origin, 7, 12), centreOf(origin, 14, 19));
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
    const afterSuccess = await say(page);
    console.log(`[${L}] 3f what the game said about the removal: ${JSON.stringify(afterSuccess)}`);
    console.log(`[${L}] #780 check — the 3d refusal was ${JSON.stringify(beforeSuccess.refusal)}; after a successful removal the band reads ${JSON.stringify(afterSuccess.refusal)}`);
    console.log(`[${L}] 3f rooms panel after: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

    /*
     * 3g. What became of the bed standing on the un-zoned tile?
     *
     * `RoomZoningService.unzone` (`src/simulation/rooms/zoning.ts:755`) writes
     * `world.setZoning(tile, 0)` and unregisters the instance and touches no
     * object, so the question is what the player can see and do about a bed
     * that is now standing on bare ground. Three probes, in order: a placement
     * (refused if something is there), a removal, and a placement again
     * (accepted if the tile is now free).
     */
    await armBuild(page, 'bed-wooden');
    const orphan = centreOf(origin, 8, 13);
    const rePlace = await press(page, orphan.x, orphan.y);
    await page.waitForTimeout(400);
    console.log(`[${L}] 3g placing a bed on the un-zoned tile: ${rePlace.length} command(s) | ${JSON.stringify(await say(page))}`);

    await tab(page, 'build').click();
    await page.locator('.hud-build__remove').click();
    const fundsBeforeRemove = await funds(page);
    const removed = await press(page, orphan.x, orphan.y);
    await page.waitForTimeout(600);
    const fundsAfterRemove = await funds(page);
    console.log(
      `[${L}] 3g armed Remove on that tile: ${removed.length} command(s) -> ${JSON.stringify(removed)}` +
        ` | worker ${fundsBeforeRemove.worker} -> ${fundsAfterRemove.worker} (${fundsAfterRemove.worker - fundsBeforeRemove.worker})` +
        ` | ${JSON.stringify(await say(page))}`,
    );
    await page.locator('.hud-build__remove').click();

    await armBuild(page, 'bed-wooden');
    const after = await press(page, orphan.x, orphan.y);
    await page.waitForTimeout(400);
    console.log(`[${L}] 3g placing a bed there again, after the removal: ${after.length} command(s) | ${JSON.stringify(await say(page))}`);
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
    await tab(page, 'manage').click();
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

    /*
     * **Whether a Dismiss control is on the screen at all is the measurement.**
     * The roster rows are pooled and painted from a publication
     * (`staff-panel.ts:1200-1250`, `assignPooledRows`), so this reports the row
     * count and how many of them are laid out — first with the clock as the
     * player found it, then after the clock has run.
     */
    const rosterState = async (): Promise<string> =>
      page.evaluate(() => {
        const section = document.querySelector<HTMLElement>('.hud-staff__roster');
        const rows = [...document.querySelectorAll<HTMLElement>('.hud-staff__roster-row')];
        const visible = rows.filter((row) => row.getClientRects().length > 0);
        return JSON.stringify({
          sectionCollapsed: section?.dataset['collapsed'] ?? '(no section)',
          rows: rows.length,
          rowsLaidOut: visible.length,
          labels: visible.map((row) => (row.innerText ?? '').replace(/\s+/g, ' ').trim()),
        });
      });
    console.log(`[${L}] roster with the clock as the player found it: ${await rosterState()}`);
    console.log(`[${L}] roster block text: ${JSON.stringify(await panelText(page, '.hud-staff__roster'))}`);
    console.log(`[${L}] clock: ${JSON.stringify(await currentClock(page))}`);
    // Open the block if it is folded, which is a step a player has to find.
    if ((await page.locator('.hud-staff__roster').getAttribute('data-collapsed')) === 'true') {
      console.log(`[${L}] the ON THE PAYROLL block was folded shut; opening it`);
      await page.locator('.hud-staff__roster .ui-section__header').first().click();
      await page.waitForTimeout(300);
      console.log(`[${L}] roster after opening the block: ${await rosterState()}`);
    }
    // And then with the clock running, because the rows are painted from a
    // publication and a publication needs a tick.
    await page.locator('.hud-strip__transport button').nth(1).click();
    await page.waitForTimeout(2500);
    console.log(`[${L}] roster after the clock ran to tick ${await currentTick(page)}: ${await rosterState()}`);
    console.log(`[${L}] roster block text now: ${JSON.stringify(await panelText(page, '.hud-staff__roster'))}`);
    await page.locator('.hud-strip__transport button').nth(0).click();
    await page.waitForTimeout(400);

    const dismiss = page.locator('.hud-staff__roster-row button').first();
    console.log(`[${L}] dismiss controls in the roster block: ${await page.locator('.hud-staff__roster-row button').count()}`);
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
    // Back to the Build tab: `calibrate` presses `.hud-build__remove`, which is
    // not laid out while the Security tab is showing.
    await tab(page, 'build').click();
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
      await tab(page, 'zones').click();
      if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
        await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      }
      await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
      await armRooms(page);
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
    for (const id of ['overview', 'build', 'zones', 'manage', 'day-plan'] as const) {
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

/**
 * ACT 6 — the two mistakes the first five acts did not make.
 *
 * The brief asked for a wall drawn **through** something and a wall drawn
 * while the **clock runs**; acts 1 to 5 made neither. This act makes both, in
 * one prison:
 *
 * - a wall on the tile edge of a tile a **standing bed** occupies, and a wall
 *   drawn **across a zoned room**, so the question is whether the world lets a
 *   player cut their own prison in half and what it says about it;
 * - the same six-segment run as act 1, but at 4x, cancelled from the queue row
 *   — which is the state `docs/research/2026-09-03-what-cancel-actually-gives-back.md`
 *   priced, re-read here in the player's terms: **did the row pay what it
 *   said?**
 */
test.describe('the misplay, part two', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60_000);
    await installTee(page);
  });

  test('act 6 - a wall through something, and a wall drawn while the clock runs', async ({ page }) => {
    const L = 'act6';
    const origin = await newPrison(page, L);

    // A yard, because it is the only room type that needs no wall built first
    // (`src/content/room-catalog.ts`: `{ type: 'outdoors' }` rather than
    // `{ type: 'enclosed' }`), and a bed inside it.
    await tab(page, 'zones').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.yard"]').click();
    await armRooms(page);
    await drag(page, centreOf(origin, 7, 12), centreOf(origin, 14, 19));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(700);
    console.log(`[${L}] yard zoned: rooms=${(await latestCounts(page))?.rooms}`);

    await armBuild(page, 'bed-wooden');
    const bed = centreOf(origin, 9, 14);
    await assertCanvasAt(page, bed.x, bed.y, `${L} bed tile`);
    await press(page, bed.x, bed.y);
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();
    for (let index = 0; index < 40; index += 1) {
      const text = await panelText(page, '.hud-build__queue');
      if (/(?<![0-9])0 waiting . 0 being built/.test(text) || text.includes('not laid out') || text.includes('ABSENT')) break;
      await page.waitForTimeout(1000);
    }
    await page.locator('.hud-strip__transport button').nth(0).click();
    await page.waitForTimeout(400);
    console.log(`[${L}] the bed is standing at tick ${await currentTick(page)}`);

    // --- 6a. a wall on the edge of the tile the bed stands on ---
    await armBuild(page, 'wall-brick');
    const throughBed = { x: origin.originX + 9 * TILE + TILE / 2, y: origin.originY + 14 * TILE };
    await assertCanvasAt(page, throughBed.x, throughBed.y, `${L} wall through the bed`);
    const beforeThrough = await funds(page);
    const throughCommands = await press(page, throughBed.x, throughBed.y);
    await page.waitForTimeout(500);
    const afterThrough = await funds(page);
    console.log(
      `[${L}] 6a a wall on the north edge of the bed's own tile: ${throughCommands.length} command(s)` +
        ` -> ${JSON.stringify(throughCommands)} | worker ${beforeThrough.worker} -> ${afterThrough.worker}` +
        ` | ${JSON.stringify(await say(page))}`,
    );

    // --- 6b. a wall drawn straight across the zoned yard ---
    /*
     * Row **13**'s north edge, tiles 10..13, and the row number is a
     * measurement rather than a choice. At 1440x900 the world points for row
     * 16 on the left of the map — (240,450) and (368,450) — both answer
     * `nothing` to `elementFromPoint`: the HUD's left rail reaches them, so a
     * press there submits no command at all and reads exactly like the game
     * ignoring the player. `assertCanvasAt` caught both, twice, which is the
     * whole reason it is in front of every world press in this file.
     */
    const acrossA = { x: origin.originX + 10 * TILE + TILE / 2, y: origin.originY + 13 * TILE };
    const acrossB = { x: origin.originX + 13 * TILE + TILE / 2, y: origin.originY + 13 * TILE };
    await assertCanvasAt(page, acrossA.x, acrossA.y, `${L} across a`);
    await assertCanvasAt(page, acrossB.x, acrossB.y, `${L} across b`);
    const beforeAcross = await funds(page);
    let mark = (await sentCommands(page)).length;
    await drag(page, acrossA, acrossB);
    const across = (await sentCommands(page)).slice(mark);
    await page.waitForTimeout(500);
    const afterAcross = await funds(page);
    console.log(
      `[${L}] 6b a wall run straight across the zoned yard: ${across.length} command(s)` +
        ` | worker ${beforeAcross.worker} -> ${afterAcross.worker} (${afterAcross.worker - beforeAcross.worker})` +
        ` | rooms=${(await latestCounts(page))?.rooms} | ${JSON.stringify(await say(page))}`,
    );
    await openQueue(page);
    console.log(`[${L}] 6b queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    await tab(page, 'zones').click();
    console.log(`[${L}] 6b rooms panel now: ${JSON.stringify(await panelText(page, '.hud-rooms'))}`);

    // Take those back, so 6c starts from a clean queue.
    await openQueue(page);
    for (let index = 0; index < 8; index += 1) {
      const live = await queueRows(page);
      const row = live.find((candidate) => candidate.pressable && candidate.order !== '(no data-order)');
      if (row === undefined) break;
      await page.locator(`.hud-build__queue-row[data-order="${row.order}"] button`).last().click();
      await page.waitForTimeout(400);
    }
    console.log(`[${L}] 6b after cancelling those back: worker=${(await funds(page)).worker}`);

    /*
     * --- 6c and 6d. the same six-segment mistake, with the clock running ---
     *
     * The row is read, then pressed, with nothing in between, and the two are
     * compared against each other, against the wire, and against the sentence
     * the game puts up. The `what-cancel-actually-gives-back` record of
     * 2026-09-03 established that a running clock puts 36-55 ticks of lead
     * between the pricing and the press; this asks the player's version of
     * that question — **did the button pay what it promised, and did the
     * sentence tell the truth?**
     *
     * **Run at both speeds, and the two speeds are not the same experiment.**
     * At 1x a player gets several presses in before the crew finishes the run;
     * at 4x the run is built underneath them. Two arms, so a reader can see
     * which figures belong to which.
     */
    const runningArm = async (arm: string, speedPresses: number, row: number): Promise<void> => {
    await armBuild(page, 'wall-brick');
    // Tiles 15..20 on the given row's north edge. Tile 25 on row 20 is
    // x=1328, which the HUD's right-hand rail covers at 1440x900 —
    // `assertCanvasAt` caught it — and (1008,706) is the rightmost point
    // measured clear on that row.
    const runA = { x: origin.originX + 15 * TILE + TILE / 2, y: origin.originY + row * TILE };
    const runB = { x: origin.originX + 20 * TILE + TILE / 2, y: origin.originY + row * TILE };
    await assertCanvasAt(page, runA.x, runA.y, `${L} ${arm} run a`);
    await assertCanvasAt(page, runB.x, runB.y, `${L} ${arm} run b`);
    const beforeRun = await funds(page);
    mark = (await sentCommands(page)).length;
    await drag(page, runA, runB);
    const run = (await sentCommands(page)).slice(mark);
    const afterRun = await funds(page);
    console.log(`[${L}] ${arm} the wrong run: ${run.length} order(s), worker ${beforeRun.worker} -> ${afterRun.worker}`);

    await openQueue(page);
    let honoured = 0;
    let presses = 0;
    let vanished = 0;
    let aimedElsewhere = 0;
    for (let index = 0; index < speedPresses; index += 1) {
      const live = await queueRows(page);
      const which = live.findIndex((candidate) => candidate.pressable && candidate.order !== '(no data-order)');
      const row = live[which];
      if (row === undefined) break;
      const promised = /·\s*([\d,]+)\s*back/.exec(row.text);
      const promisedMinorUnits = promised === null ? -1 : Number(promised[1]?.replace(/,/g, '') ?? '-1');
      const fundsBefore = await funds(page);
      const wireBefore = (await sentCommands(page)).length;
      /*
       * Pressed by **position**, with a short timeout, because addressing the
       * row by the `data-order` it had a moment ago does not work while the
       * clock runs: the pool is re-pointed on every publication, so the
       * attribute selector stops resolving and a 60s stall is the result.
       * That stall is itself the measurement — `vanished` counts it — and it
       * is the same churn `2026-09-03-what-cancel-actually-gives-back.md` §4.1
       * recorded from the other side ("a pooled queue row can submit a
       * `CancelBuildOrder` for a different order than its label described").
       */
      try {
        await page
          .locator('.hud-build__queue-row')
          .nth(which)
          .locator('button')
          .last()
          .click({ timeout: 4_000 });
      } catch {
        vanished += 1;
        console.log(`[${L}] ${arm} press ${presses + 1}: the control read as ${JSON.stringify(row.text)} was gone before it could be pressed`);
        continue;
      }
      await page.waitForTimeout(700);
      const submitted = (await sentCommands(page))
        .slice(wireBefore)
        .filter((command) => command['type'] === 'CancelBuildOrder');
      const namedOnTheWire = submitted[0]?.['orderId'];
      const fundsAfter = await funds(page);
      const paid = fundsAfter.worker - fundsBefore.worker;
      presses += 1;
      if (paid === promisedMinorUnits) honoured += 1;
      if (namedOnTheWire !== undefined && namedOnTheWire !== row.order) aimedElsewhere += 1;
      console.log(
        `[${L}] ${arm} press ${presses}: row promised ${promisedMinorUnits}, paid ${paid}` +
          ` — ${paid === promisedMinorUnits ? 'HONOURED' : 'DID NOT MATCH'}` +
          ` | the wire named ${namedOnTheWire === row.order ? 'the order the row described' : `a DIFFERENT order (${String(namedOnTheWire).slice(0, 14)}… vs ${row.order.slice(0, 14)}…)`}` +
          ` | tick ${await currentTick(page)} | row was ${JSON.stringify(row.text)}` +
          ` | ${JSON.stringify((await say(page)).event)}`,
      );
    }
    console.log(`[${L}] ${arm} ${vanished} press(es) found the control gone; ${aimedElsewhere} named a different order than the row described`);
    const end = await funds(page);
    /*
     * **The net figure is reported and is deliberately NOT a recovery
     * measure.** While the clock runs the just-in-time pass buys materials for
     * the orders that are still going, so the treasury moves for reasons that
     * are not this player's cancellations. Only the per-press deltas above are
     * clean, because each was read across a 700 ms window in which no purchase
     * happened (every one of them was exactly the advertised figure).
     */
    console.log(
      `[${L}] ${arm} ${honoured} of ${presses} press(es) paid what their row said` +
        ` | treasury across the whole arm ${beforeRun.worker} -> ${end.worker}` +
        ` (NOT a recovery figure: just-in-time purchases move it too)`,
    );
    console.log(`[${L}] ${arm} queue at the end: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    };

    // 6c: 1x, where a player gets several presses in.
    await page.locator('.hud-strip__transport button').nth(1).click();
    await page.waitForTimeout(300);
    console.log(`[${L}] 6c clock: ${JSON.stringify(await currentClock(page))}`);
    await runningArm('6c 1x', 6, 20);

    // 6d: 4x, where the crew finishes the run underneath the player.
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(300);
    console.log(`[${L}] 6d clock: ${JSON.stringify(await currentClock(page))}`);
    await runningArm('6d 4x', 6, 21);
  });
});
