import { test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  buildAndPopulate,
  calibrate,
  centreOf,
  currentClock,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  tab,
} from './playtest-harness';

/**
 * **Playing `main` at v0.0.273, after nine changes nobody has played.**
 *
 * Not a gate. `tests/browser/playwright.playtest.config.ts` collects this file
 * and nothing in CI runs that config; the deliverable is the console output and
 * the record in `docs/research/` that quotes it.
 *
 * The brief is the owner's: *"znajdź bugi i błędy grając, bo ja nie mogłem
 * postawić więzienia itp grając sam"* -- find defects by playing -- under the
 * standing directive *"gra ma być łatwa przyjazna do grania, a nie jakieś
 * ukryte funkcje"*.
 *
 * Four things landed on 2026-08-30/31 that no session has met:
 *
 * - **#690** stands the Rooms tool down at the confirm. Its own weakest claim
 *   is that the extra press per room reads as confirmation rather than
 *   friction. Act 2 builds five rooms in a row and counts every press.
 * - **#640 / #693** buy a build order's materials at the press and withdraw the
 *   orders behind a cancelled delivery. Act 1 plays the money story with the
 *   Buy fold never opened, then cancels and presses Play.
 * - **#650** quotes both halves of a hire. Act 1 reads the control.
 * - **#691** gives a successful escape a sentence, band `danger`. Act 3
 *   under-guards a prison on purpose and samples the band every 100 ms, because
 *   nobody has checked that the sentence is ever *painted*.
 *
 * The band sampler is the one piece of apparatus worth explaining. The events
 * band holds **one** sentence and the newest event replaces it
 * (`hudEventNoticeFromWorkerMessage`, *"The newest event is the one on the
 * line"*), so a sentence can arrive and be gone before any poll from the test
 * process sees it. Sampling from inside the page at 100 ms, recording only
 * *changes*, is what makes "the player could have read it" a measurement rather
 * than an inference.
 */

interface BandSample {
  readonly t: number;
  readonly text: string;
  readonly severity: string;
  readonly hidden: string;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly background: string;
}

interface SamplerWindow {
  lockstateBandSamples?: BandSample[];
}

interface DeliverySample {
  readonly t: number;
  readonly blockHidden: string;
  readonly pending: string;
  readonly header: string;
  readonly rows: readonly string[];
  readonly visibleRows: number;
  readonly width: number;
  readonly height: number;
}

interface SamplerWindow2 {
  lockstateDeliverySamples?: DeliverySample[];
}

/**
 * One write to the events band, seen by a `MutationObserver`.
 *
 * **A 100 ms poll cannot answer the question #691 raises, and reasoning showed
 * why before a run was spent on it.** `IncidentResponseSystem.lapse` records the
 * escape and then calls `reportAllClearIfCalm` **on the same tick**
 * (`src/simulation/incidents/response-system.ts:620` and `:625`), and
 * `SimulationWorkerStateMachine.publishEvents` posts one `simulation/event`
 * per event in a single tight loop (`state-machine.ts:701-723`). So the band's
 * two writes land in two message tasks with no frame boundary guaranteed
 * between them: the sentence can be in the DOM and gone again without ever
 * being *painted*, and a poll samples the DOM at 100 ms rather than the writes.
 *
 * A `MutationObserver` on the band's text node sees **every** write with the
 * time it happened. A `requestAnimationFrame` loop, recording the text at each
 * frame the browser actually produced, sees what could have reached a screen.
 * The pair separates "never written", "written and painted" and "written and
 * overwritten before any paint", which is the whole question.
 */
interface WriteSample {
  readonly t: number;
  readonly text: string;
  readonly severity: string;
  readonly hidden: string;
}

interface SamplerWindow3 {
  lockstateBandWrites?: WriteSample[];
  lockstateBandFrames?: WriteSample[];
}

/**
 * Records every *change* of the events band and of the deliveries block from
 * inside the page, at 100 ms.
 *
 * Both surfaces are transient in the same way and for the same reason: the band
 * holds one sentence that the next event replaces, and the deliveries block is
 * cleared by `setVisible(false)` and by any failed read
 * (`main.ts`'s `refreshPendingDeliveries` `.catch`). A poll from the test
 * process, which cannot run faster than a round trip, can miss either.
 */
async function installSamplers(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const samples: BandSample[] = [];
    const deliveries: DeliverySample[] = [];
    (window as unknown as SamplerWindow).lockstateBandSamples = samples;
    (window as unknown as SamplerWindow2).lockstateDeliverySamples = deliveries;
    let last = '';
    let lastDelivery = '';
    const started = Date.now();
    setInterval(() => {
      const node = document.querySelector<HTMLElement>('.hud__event');
      if (node !== null) {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const sample: BandSample = {
          t: Date.now() - started,
          text: (node.textContent ?? '').trim(),
          severity: node.dataset['severity'] ?? '',
          hidden: String(node.hidden),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          color: style.color,
          background: style.backgroundColor,
        };
        const key = `${sample.text}|${sample.severity}|${sample.hidden}|${sample.width}x${sample.height}`;
        if (key !== last) {
          last = key;
          samples.push(sample);
        }
      }

      const block = document.querySelector<HTMLElement>('.hud-build__deliveries');
      if (block !== null) {
        const rect = block.getBoundingClientRect();
        const rows = [...block.querySelectorAll<HTMLElement>('.hud-build__delivery-row')];
        const sample: DeliverySample = {
          t: Date.now() - started,
          blockHidden: String(block.hidden),
          pending: block.dataset['pending'] ?? '',
          header: (block.querySelector('.hud-build__deliveries-header')?.textContent ?? '').trim(),
          rows: rows.map((row) => `${row.hidden ? 'HIDDEN ' : ''}${(row.textContent ?? '').trim()}`),
          visibleRows: rows.filter((row) => !row.hidden).length,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        const key = `${sample.blockHidden}|${sample.pending}|${sample.header}|${sample.rows.join('/')}|${sample.width}x${sample.height}`;
        if (key !== lastDelivery) {
          lastDelivery = key;
          deliveries.push(sample);
        }
      }
    }, 100);

    /*
     * The two instruments the poll above cannot replace. Both are armed as soon
     * as the band exists, which is at HUD mount -- the band element is created
     * hidden and stays in the DOM, so one observer lasts the session.
     */
    const writes: WriteSample[] = [];
    const frames: WriteSample[] = [];
    (window as unknown as SamplerWindow3).lockstateBandWrites = writes;
    (window as unknown as SamplerWindow3).lockstateBandFrames = frames;
    const readBand = (): WriteSample | undefined => {
      const node = document.querySelector<HTMLElement>('.hud__event');
      if (node === null) return undefined;
      return {
        t: Date.now() - started,
        text: (node.textContent ?? '').trim(),
        severity: node.dataset['severity'] ?? '',
        hidden: String(node.hidden),
      };
    };
    let armed = false;
    /*
     * `undefined` rather than a sentinel string, because the first attempt here
     * was `' '` and a heredoc turned it into a literal NUL byte -- which made
     * `git diff` call this whole file `Bin 0 -> 44968 bytes` and hid every line
     * of it from review. It worked as a sentinel and was unreviewable, which is
     * a worse trade than it sounds.
     */
    let lastFrameText: string | undefined;
    const arm = (): void => {
      const node = document.querySelector<HTMLElement>('.hud__event');
      if (node === null || armed) return;
      armed = true;
      new MutationObserver(() => {
        const sample = readBand();
        if (sample !== undefined) writes.push(sample);
      }).observe(node, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-severity', 'hidden'] });
    };
    const frame = (): void => {
      arm();
      const sample = readBand();
      if (sample !== undefined && sample.text !== lastFrameText) {
        lastFrameText = sample.text;
        frames.push(sample);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

async function bandWrites(page: import('@playwright/test').Page): Promise<readonly WriteSample[]> {
  return page.evaluate(() => (window as unknown as SamplerWindow3).lockstateBandWrites ?? []);
}

async function bandFrames(page: import('@playwright/test').Page): Promise<readonly WriteSample[]> {
  return page.evaluate(() => (window as unknown as SamplerWindow3).lockstateBandFrames ?? []);
}

async function bandSamples(page: import('@playwright/test').Page): Promise<readonly BandSample[]> {
  return page.evaluate(() => (window as unknown as SamplerWindow).lockstateBandSamples ?? []);
}

async function deliverySamples(page: import('@playwright/test').Page): Promise<readonly DeliverySample[]> {
  return page.evaluate(() => (window as unknown as SamplerWindow2).lockstateDeliverySamples ?? []);
}

/** Every `simulation/event` the worker has published, in order. */
async function eventSeries(
  page: import('@playwright/test').Page,
): Promise<readonly { sequence: number; type: string; tick: number }[]> {
  return page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => (message as { kind?: string }).kind === 'simulation/event')
      .map((message) => {
        const payload = (message as { payload: { tick: number; event: { sequence: number; type: string } } }).payload;
        return { sequence: payload.event.sequence, type: payload.event.type, tick: payload.tick };
      }),
  );
}

async function strip(page: import('@playwright/test').Page): Promise<string> {
  return (await panelText(page, '.hud-strip')).replace(/\n/g, ' | ');
}

/* ------------------------------------------------------------------ */
/* Act 1: the money story, with the Buy fold never opened              */
/* ------------------------------------------------------------------ */

test('act 1: an ambitious first prison, buying nothing on purpose (#640, #693, #650)', async ({ page }) => {
  test.setTimeout(900_000);
  const log = (line: string) => console.log(`[act1] ${line}`);

  await installTee(page);
  await installSamplers(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  log(`strip at day 1: ${await strip(page)}`);
  // Whether a fresh prison is running or stopped decides how long a delivery is
  // on screen at all: `PROCUREMENT_DELIVERY_DELAY_TICKS` is 100, which is five
  // real seconds at x1 and nothing at all while paused.
  log(`clock on arrival: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  log(`treasury before any order: ${(await latestCounts(page))?.treasuryMinorUnits}`);
  log(`deliveries fold before any order: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  /*
   * A 6x6 perimeter, dragged, with no purchase pressed first -- which is the
   * whole of #640: the order buys its own bricks. Treasury read after each run
   * so the money story is a series and not a difference.
   */
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
    await drag(page, run.a, run.b);
    const counts = await latestCounts(page);
    log(`after the ${run.name} run: treasury=${counts?.treasuryMinorUnits} queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    log(`  deliveries fold: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    log(`  refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  }

  /*
   * The cancellation, with the clock still stopped -- #693's own subject.
   *
   * **Only a Cancel that is actually laid out counts**, because the point is
   * what a player can press. `.hud-build__delivery-row` is a *pool* of three
   * rows created hidden (`build-panel.ts`, `row.element.hidden = true`), and a
   * `Locator.count()` of 3 says nothing about whether any of them has a box --
   * a `click()` on a hidden one waits for ever, which is how the first run of
   * this act was spent.
   */
  log(`delivery samples so far: ${JSON.stringify(await deliverySamples(page))}`);
  /*
   * **`:not([hidden])` is not the question and the first run of this act proved
   * it.** `paintDeliveries` sets `row.element.hidden = false` on every row it
   * fills, so the rows really are not hidden -- and the block is a child of
   * `buyRow`, which is. Playwright resolved the control, then spent twenty
   * seconds reporting *"element is not visible"*. So the gate is
   * `isVisible()`, which is the player's question.
   */
  const visibleCancel = page.locator('.hud-build__delivery-row button').first();
  const boxes = await page.evaluate(() => {
    const rowNode = document.querySelector<HTMLElement>('.hud-build__delivery-row');
    const buyNode = document.querySelector<HTMLElement>('.hud-build__buy');
    const rect = rowNode?.getBoundingClientRect();
    return {
      rowHidden: rowNode === null ? 'ABSENT' : String(rowNode.hidden),
      rowBox: rect === undefined ? 'ABSENT' : `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      buyRowHidden: buyNode === null ? 'ABSENT' : String(buyNode.hidden),
      buyRowDisplay: buyNode === null ? 'ABSENT' : getComputedStyle(buyNode).display,
    };
  });
  log(`the first delivery row and the fold above it: ${JSON.stringify(boxes)}`);
  const cancellable = await visibleCancel.isVisible();
  log(`is the first Cancel visible to a player? ${String(cancellable)}`);
  if (cancellable) {
    const rowText = (await page.locator('.hud-build__delivery-row:not([hidden])').first().innerText()).replace(/\n/g, ' | ');
    const before = (await latestCounts(page))?.treasuryMinorUnits;
    log(`cancelling the first delivery. row says: ${JSON.stringify(rowText)} | treasury before = ${before}`);
    await visibleCancel.click({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    const afterCancel = (await latestCounts(page))?.treasuryMinorUnits;
    log(`treasury right after Cancel = ${afterCancel} (delta ${(afterCancel ?? 0) - (before ?? 0)})`);
    log(`queue right after Cancel: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    log(`deliveries right after Cancel: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

    await fastForwardToMax(page);
    log(`clock: ${JSON.stringify(await currentClock(page))}`);
    for (const wait of [5000, 10_000, 15_000]) {
      await page.waitForTimeout(wait);
      const counts = await latestCounts(page);
      log(`t+${wait}ms into Play: tick=${counts?.tick} treasury=${counts?.treasuryMinorUnits} queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    }
    log(`deliveries after Play: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
  } else {
    /*
     * **The fold, which is where `docs/research/2026-08-30-a-wall-that-buys-itself.md`
     * §2b already found this block living.** `deliveriesBlock` is the last child
     * of `buyRow` and `buyRow.hidden = true`, so *On the way* -- and with it the
     * only `Cancel` in the game -- is inside the procurement disclosure that
     * #627/#640 exist so a player never has to open.
     *
     * That record stopped at "the report is inside the fold". What it did not
     * measure, because #693 had not landed, is that the **control #693 fixed**
     * is in there too. So: press the toggle, and see whether the same
     * cancellation then behaves.
     */
    log('NOTHING TO CANCEL with the fold shut. Opening .hud-build__buy-toggle, which is the fold #640 exists to make unnecessary.');
    await page.locator('.hud-build__buy-toggle').click();
    await page.waitForTimeout(600);
    log(`deliveries after opening the Buy fold: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);
    log(`delivery samples after opening the fold: ${JSON.stringify(await deliverySamples(page))}`);
    const inFold = page.locator('.hud-build__delivery-row:not([hidden]) button');
    const foldCount = await inFold.count();
    log(`Cancel controls with a box, fold open: ${foldCount}`);
    if (foldCount > 0) {
      const rowText = (await page.locator('.hud-build__delivery-row:not([hidden])').first().innerText()).replace(/\n/g, ' | ');
      const before = (await latestCounts(page))?.treasuryMinorUnits;
      const queueBefore = await panelText(page, '.hud-build__queue');
      log(`cancelling from inside the fold. row says ${JSON.stringify(rowText)} | treasury ${before} | queue ${JSON.stringify(queueBefore)}`);
      await inFold.first().click({ timeout: 20_000 });
      await page.waitForTimeout(1200);
      const afterCancel = (await latestCounts(page))?.treasuryMinorUnits;
      log(`treasury right after Cancel = ${afterCancel} (delta ${(afterCancel ?? 0) - (before ?? 0)})`);
      log(`queue right after Cancel: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
      await fastForwardToMax(page);
      log(`clock: ${JSON.stringify(await currentClock(page))}`);
      for (const wait of [5000, 10_000, 15_000]) {
        await page.waitForTimeout(wait);
        const counts = await latestCounts(page);
        log(`t+${wait}ms into Play: tick=${counts?.tick} treasury=${counts?.treasuryMinorUnits} queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
      }
    } else {
      log('still nothing to cancel with the fold OPEN. That is the measurement.');
      await fastForwardToMax(page);
      log(`clock: ${JSON.stringify(await currentClock(page))}`);
    }
  }

  /*
   * The prison still has to go up, so the perimeter is re-dragged where the
   * cancellation took orders out. This is what a player who changed their mind
   * actually does next, and whether it is affordable is the measurement.
   */
  await tab(page, 'build').click();
  await armBuildable(page, 'wall-brick');
  for (const run of [
    { name: 'north(again)', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south(again)', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west(again)', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east(again)', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    await drag(page, run.a, run.b);
    const counts = await latestCounts(page);
    log(`${run.name}: treasury=${counts?.treasuryMinorUnits} queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))} refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  }
  log(`delivery samples through the whole build: ${JSON.stringify(await deliverySamples(page))}`);

  // Let the crew work.
  for (let index = 0; index < 12; index += 1) {
    await page.waitForTimeout(5000);
    const queue = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(queue)) break;
  }
  const walled = await latestCounts(page);
  log(`perimeter done at tick ${walled?.tick}: treasury=${walled?.treasuryMinorUnits} queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  /* ---------------- Act 2, in the same session: five rooms in a row --------- */
  log('=== ROOMS TOOL, five designations in a row (#690) ===');
  const roomRects: readonly { readonly name: string; readonly a: readonly [number, number]; readonly b: readonly [number, number] }[] = [
    { name: 'room 1 (the walled 6x6)', a: [12, 12], b: [17, 17] },
    { name: 'room 2', a: [12, 12], b: [14, 14] },
    { name: 'room 3', a: [15, 12], b: [17, 14] },
    { name: 'room 4', a: [12, 15], b: [14, 17] },
    { name: 'room 5', a: [15, 15], b: [17, 17] },
  ];

  for (const rect of roomRects) {
    let presses = 0;
    await tab(page, 'zones').click();
    presses += 1;
    const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    log(`${rect.name}: Rooms panel data-collapsed on arrival = ${collapsed}`);
    if (collapsed === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      presses += 1;
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    presses += 1;
    const armLabelBefore = (await page.locator('.hud-rooms__arm').innerText()).trim();
    const armedBefore = await page.locator('.hud-rooms__arm').getAttribute('data-armed');
    await page.locator('.hud-rooms__arm').click();
    presses += 1;
    const armedAfter = await page.locator('.hud-rooms__arm').getAttribute('data-armed');
    const armLabelAfter = (await page.locator('.hud-rooms__arm').innerText().catch(() => 'NOT LAID OUT')).trim();
    log(
      `${rect.name}: arm control before = ${JSON.stringify(armLabelBefore)} data-armed=${armedBefore}` +
        ` -> after = ${JSON.stringify(armLabelAfter)} data-armed=${armedAfter}`,
    );
    await drag(page, centreOf(origin, rect.a[0], rect.a[1]), centreOf(origin, rect.b[0], rect.b[1]));
    const noteText = await panelText(page, '.hud-rooms');
    const confirmEnabled = await page.locator('.hud-rooms__confirm').isEnabled();
    log(`${rect.name}: after the drag the panel says ${JSON.stringify(noteText.split('\n').slice(0, 8))} | Confirm enabled=${confirmEnabled}`);
    if (confirmEnabled) {
      await page.locator('.hud-rooms__confirm').click();
      presses += 1;
    }
    await page.waitForTimeout(1200);
    const counts = await latestCounts(page);
    const foldedAfter = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    const armedAfterConfirm = await page.locator('.hud-rooms__arm').getAttribute('data-armed').catch(() => 'NO BOX');
    log(
      `${rect.name}: DONE in ${presses} press(es) + 1 drag -> rooms=${counts?.rooms}` +
        ` roomCapacity=${counts?.roomCapacity} | panel data-collapsed=${foldedAfter} arm data-armed=${armedAfterConfirm}`,
    );
    log(`${rect.name}: refusal band = ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`${rect.name}: rooms panel now = ${JSON.stringify((await panelText(page, '.hud-rooms')).split('\n').slice(0, 10))}`);
  }

  /* ---------------- Beds, then hiring (#650) -------------------------------- */
  await tab(page, 'build').click();
  await armBuildable(page, 'bed-wooden');
  let bedsPlaced = 0;
  for (const row of [12, 13]) {
    for (let column = 12; column <= 17; column += 1) {
      const point = centreOf(origin, column, row);
      const produced = await press(page, point.x, point.y);
      if (produced.length > 0) bedsPlaced += 1;
      else log(`bed at (${column},${row}) produced NO command; refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    }
  }
  log(`${bedsPlaced} bed order(s) accepted; treasury=${(await latestCounts(page))?.treasuryMinorUnits}`);
  for (let index = 0; index < 10; index += 1) {
    await page.waitForTimeout(5000);
    const queue = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(queue)) break;
  }
  const furnished = await latestCounts(page);
  log(`furnished at tick ${furnished?.tick}: rooms=${furnished?.rooms} roomCapacity=${furnished?.roomCapacity} accommodationCapacity=${furnished?.accommodationCapacity} treasury=${furnished?.treasuryMinorUnits}`);

  await tab(page, 'manage').click();
  log(`staff panel, collapsed=${await page.locator('.hud-staff').getAttribute('data-collapsed')}`);
  log(`hire control reads: ${JSON.stringify((await page.locator('.hud-staff__hire').innerText()).trim())}`);
  log(`staff panel text: ${JSON.stringify((await panelText(page, '.hud-staff')).split('\n'))}`);
  for (let index = 0; index < 4; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  const hired = await latestCounts(page);
  log(`after four hires: staff=${hired?.staff} dailyWageBill=${hired?.dailyWageBillMinorUnits} treasury=${hired?.treasuryMinorUnits}`);
  log(`staff panel after hiring: ${JSON.stringify((await panelText(page, '.hud-staff')).split('\n'))}`);

  await tab(page, 'overview').click();
  for (let index = 0; index < 10; index += 1) {
    await page.locator('.hud-intake__admit').click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(2000);
  log(`intake panel after ten admissions: ${JSON.stringify((await panelText(page, '.hud-intake')).split('\n'))}`);
  log(`strip: ${await strip(page)}`);

  // Run to the first classification review (tick 23,999) and a little past it.
  const target = 30_000;
  const started = Date.now();
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= target) break;
    if (Date.now() - started > 600_000) {
      log(`gave up waiting for tick ${target}, stuck at ${tick}`);
      break;
    }
    await page.waitForTimeout(15_000);
    const counts = await latestCounts(page);
    log(
      `tick=${counts?.tick} prisoners=${counts?.prisoners} highRisk=${counts?.prisonersHighRisk}` +
        ` residents=${counts?.roomOccupants} treasury=${counts?.treasuryMinorUnits} | strip: ${await strip(page)}`,
    );
  }
  log(`events: ${JSON.stringify(await eventSeries(page))}`);
  log(`band samples: ${JSON.stringify(await bandSamples(page))}`);
  log(`final strip: ${await strip(page)}`);
});

/* ------------------------------------------------------------------ */
/* Act 2: five rooms in a row, the measurement #690 asked for          */
/* ------------------------------------------------------------------ */

test('act 2: four rooms in a row, none overlapping, all inside the bare world (#690)', async ({ page }) => {
  test.setTimeout(1_500_000);
  const log = (line: string) => console.log(`[act2] ${line}`);

  await installTee(page);
  await installSamplers(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  /*
   * **Where the world actually is, before anything is drawn on it.**
   *
   * #690's commit message cites the measurement that decided it: *"at 375x812
   * with both rail panels expanded, the largest square of bare world on the page
   * is 16px."* Nobody has taken the same measurement at a desktop viewport, and
   * this act needs it for its own sake: the previous version of this act laid a
   * terrace of five cells eastwards and its fourth drag landed on the Build
   * panel, so no rectangle was ever drawn and the Confirm stayed hidden. That
   * cost a run and it is a fact about the game, not about the script.
   */
  const bare = await page.evaluate(() => {
    const covered: { l: number; t: number; r: number; b: number; what: string }[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('.hud > *')) {
      if (node.hidden) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (getComputedStyle(node).pointerEvents === 'none') continue;
      covered.push({ l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom), what: node.className });
    }
    return { viewport: `${window.innerWidth}x${window.innerHeight}`, covered };
  });
  log(`HUD boxes that take the pointer at ${bare.viewport}: ${JSON.stringify(bare.covered)}`);

  /*
   * **Two by two, in the middle of the screen.** Interiors x=[12..14] and
   * [16..18] against y=[12..14] and [16..18], which at this calibration is
   * screen x 464..912 and y 194..642 -- clear of both rails. Party walls on
   * x=12,15,16,19 and y=12,15,16,19, three segments each, 48 in total.
   */
  await armBuildable(page, 'wall-brick');
  const px = (tileX: number) => origin.originX + tileX * TILE;
  const py = (tileY: number) => origin.originY + tileY * TILE;
  for (const column of [12, 15, 16, 19]) {
    for (const band of [[12, 14], [16, 18]] as const) {
      await drag(page, { x: px(column), y: py(band[0]) + TILE / 2 }, { x: px(column), y: py(band[1]) + TILE / 2 });
    }
  }
  for (const row of [12, 15, 16, 19]) {
    for (const band of [[12, 14], [16, 18]] as const) {
      await drag(page, { x: px(band[0]) + TILE / 2, y: py(row) }, { x: px(band[1]) + TILE / 2, y: py(row) });
    }
  }
  log(`after the wall grid: treasury=${(await latestCounts(page))?.treasuryMinorUnits} queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  await fastForwardToMax(page);
  for (let index = 0; index < 30; index += 1) {
    await page.waitForTimeout(5000);
    const queue = await panelText(page, '.hud-build__queue');
    if (/(?<![0-9])0 waiting . 0 being built/.test(queue) || queue.includes('not laid out')) break;
  }
  log(`grid built at tick ${await currentTick(page)}: treasury=${(await latestCounts(page))?.treasuryMinorUnits}`);

  const cells: readonly { readonly name: string; readonly a: readonly [number, number]; readonly b: readonly [number, number] }[] = [
    { name: 'cell 1', a: [12, 12], b: [14, 14] },
    { name: 'cell 2', a: [16, 12], b: [18, 14] },
    { name: 'cell 3', a: [12, 16], b: [14, 18] },
    { name: 'cell 4', a: [16, 16], b: [18, 18] },
  ];

  for (const cell of cells) {
    const started = Date.now();
    let presses = 0;
    await tab(page, 'zones').click();
    presses += 1;
    const collapsedOnArrival = await page.locator('.hud-rooms').getAttribute('data-collapsed');
    if (collapsedOnArrival === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      presses += 1;
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    presses += 1;
    const armBefore = `${(await page.locator('.hud-rooms__arm').innerText()).trim()} data-armed=${await page.locator('.hud-rooms__arm').getAttribute('data-armed')}`;
    await page.locator('.hud-rooms__arm').click();
    presses += 1;
    const armAfter = `${(await page.locator('.hud-rooms__arm').innerText()).trim()} data-armed=${await page.locator('.hud-rooms__arm').getAttribute('data-armed')}`;
    /*
     * #690's claim is that the panel "gets out of the way" while the tool is
     * armed and comes back afterwards reading what the player is about to
     * press. The fold state and the arm control's *box* are read at the two
     * moments that claim is about: mid-drag, and after the confirm.
     */
    await page.mouse.move(centreOf(origin, cell.a[0], cell.a[1]).x, centreOf(origin, cell.a[0], cell.a[1]).y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(centreOf(origin, cell.b[0], cell.b[1]).x, centreOf(origin, cell.b[0], cell.b[1]).y, { steps: 8 });
    const midDrag = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.hud-rooms');
      const armNode = document.querySelector<HTMLElement>('.hud-rooms__arm');
      const rect = armNode?.getBoundingClientRect();
      return {
        collapsed: panel?.dataset['collapsed'] ?? 'ABSENT',
        armBox: rect === undefined ? 'ABSENT' : `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      };
    });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(300);
    const afterDrag = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.hud-rooms');
      const confirmNode = document.querySelector<HTMLElement>('.hud-rooms__confirm');
      const rect = confirmNode?.getBoundingClientRect();
      return {
        collapsed: panel?.dataset['collapsed'] ?? 'ABSENT',
        confirmBox: rect === undefined ? 'ABSENT' : `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        confirmHidden: confirmNode === null ? 'ABSENT' : String(confirmNode.hidden),
      };
    });
    const note = await panelText(page, '.hud-rooms');
    /*
     * **`isVisible()`, not `isEnabled()`, and the previous run paid for the
     * difference twice.** A hidden button is `enabled`, so the gate passed and
     * the click spent twenty seconds on a control with no box -- the same trap
     * §1 records for the delivery row's Cancel, in a second panel.
     */
    const confirmVisible = await page.locator('.hud-rooms__confirm').isVisible();
    if (confirmVisible) {
      await page.locator('.hud-rooms__confirm').click({ timeout: 20_000 });
      presses += 1;
    }
    await page.waitForTimeout(1200);
    const counts = await latestCounts(page);
    log(
      `${cell.name}: ${presses} press(es) + 1 drag in ${Date.now() - started}ms -> rooms=${counts?.rooms}` +
        ` | Confirm visible=${String(confirmVisible)}` +
        ` | fold on arrival=${collapsedOnArrival} mid-drag=${JSON.stringify(midDrag)} after drag=${JSON.stringify(afterDrag)}` +
        ` | arm ${JSON.stringify(armBefore)} -> ${JSON.stringify(armAfter)}` +
        ` -> after confirm data-armed=${await page.locator('.hud-rooms__arm').getAttribute('data-armed')}`,
    );
    log(`${cell.name}: enclosure verdict lines = ${JSON.stringify(note.split('\n').filter((line) => /OPEN|ENCLOS|MISSING|NEEDS|missing/i.test(line)))}`);
    log(`${cell.name}: refusal band = ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  }

  const zoned = await latestCounts(page);
  log(`four designations later: rooms=${zoned?.rooms} roomCapacity=${zoned?.roomCapacity} treasury=${zoned?.treasuryMinorUnits}`);
  await tab(page, 'zones').click();
  log(`rooms panel at the end: ${JSON.stringify((await panelText(page, '.hud-rooms')).split('\n'))}`);
});

/* ------------------------------------------------------------------ */
/* Act 3: the same prison, under-guarded on purpose                    */
/* ------------------------------------------------------------------ */

test('act 3: a deliberately neglected prison — the escape sentence and a weapon (#691, #681)', async ({ page }) => {
  test.setTimeout(2_400_000);
  const log = (line: string) => console.log(`[act3] ${line}`);

  await installTee(page);
  await installSamplers(page);
  await openApp(page);

  // Two beds for fourteen people and nobody watching: the neglect the escape
  // gate is measured against.
  await buildAndPopulate(page, { beds: 2, admits: 14, guards: 0, label: 'act3' });

  await fastForwardToMax(page);
  log(`clock: ${JSON.stringify(await currentClock(page))} at tick ${await currentTick(page)}`);

  const target = 100_000;
  const started = Date.now();
  let lastReported = -1;
  for (;;) {
    const tick = await currentTick(page);
    if (tick >= target) break;
    if (Date.now() - started > 2_100_000) {
      log(`stopping at tick ${tick} rather than ${target}: wall-clock budget spent`);
      break;
    }
    await page.waitForTimeout(20_000);
    const counts = await latestCounts(page);
    const events = await eventSeries(page);
    if (events.length !== lastReported) {
      log(`events so far (${events.length}): ${JSON.stringify(events)}`);
      lastReported = events.length;
    }
    log(
      `tick=${counts?.tick} prisoners=${counts?.prisoners} highRisk=${counts?.prisonersHighRisk}` +
        ` residents=${counts?.roomOccupants} staff=${counts?.staff} treasury=${counts?.treasuryMinorUnits}`,
    );
    log(`  strip: ${await strip(page)}`);
    log(`  band now: ${JSON.stringify(await panelText(page, '.hud__event'))}`);
    /*
     * What the player can see about *who* is dangerous. The Regime tab's
     * Prisoners roster carries a tier word per row -- Minimal, Low, Medium,
     * High -- and `describePrisonerRow` tones the high-risk group `warning`.
     * That badge is the only surface in the game that says a review has raised
     * somebody, and #681 makes tier 3 the gate on both a weapon and an escape,
     * so it is the one place a weapon could show up indirectly.
     */
    if ((counts?.tick ?? 0) > 20_000) {
      await tab(page, 'day-plan').click();
      await page.waitForTimeout(800);
      log(`  regime roster: ${JSON.stringify((await panelText(page, '.hud-regime')).split('\n').slice(0, 24))}`);
      await tab(page, 'overview').click();
    }
  }

  log(`=== EVENTS, all of them ===`);
  log(JSON.stringify(await eventSeries(page), undefined, 1));
  log(`=== BAND SAMPLES (100 ms poll), every change ===`);
  log(JSON.stringify(await bandSamples(page), undefined, 1));
  log(`=== BAND WRITES (MutationObserver): every write, whether or not it was painted ===`);
  log(JSON.stringify(await bandWrites(page), undefined, 1));
  log(`=== BAND FRAMES (requestAnimationFrame): what a screen could have shown ===`);
  log(JSON.stringify(await bandFrames(page), undefined, 1));

  /*
   * The alerts list lives in a `ui-section` inside the minimap panel, and
   * `hud-state.ts`'s `collapsedPanels: ['alerts']` folds that section on every
   * fresh page. So this is the fold a player has to find to read back an event
   * the band has already replaced.
   */
  const alertsSection = page.locator('.ui-section:has(.hud-alerts__list)');
  log(`alerts section data-collapsed on arrival = ${await alertsSection.getAttribute('data-collapsed')}`);
  log(`alerts list while folded: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
  await alertsSection.locator('> .ui-section__header, > .ui-section__header-row > .ui-section__header').first().click();
  await page.waitForTimeout(500);
  log(`alerts section data-collapsed after one press = ${await alertsSection.getAttribute('data-collapsed')}`);
  log(`alerts list after opening it: ${JSON.stringify((await panelText(page, '.hud-alerts__list')).split('\n'))}`);

  log(`final strip: ${await strip(page)}`);
  log(`final counts: ${JSON.stringify(await latestCounts(page))}`);
});

/* ------------------------------------------------------------------ */
/* Act 4: where the world actually is, at 1440x900                     */
/* ------------------------------------------------------------------ */

test('act 4: which screen points reach the world and which reach the HUD (1440x900)', async ({ page }) => {
  test.setTimeout(300_000);
  const log = (line: string) => console.log(`[act4] ${line}`);

  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1000);

  /*
   * **Why this act exists.** Act 2's fourth designation drew no rectangle at
   * all, its drag having started at screen x=1232, and *"the HUD covered it"* is
   * a plausible cause rather than a measured one -- unowned land and an
   * off-parcel tile would look the same from the outside. `elementFromPoint` is
   * what settles it, because it answers the browser's own question: which
   * element receives a press here.
   *
   * Taken with the Build tab showing, which is the state a player building a
   * prison is in, and then again with the Rooms tab showing.
   */
  const sweep = async (label: string): Promise<void> => {
    const result = await page.evaluate(() => {
      const panels = [...document.querySelectorAll<HTMLElement>('.ui-panel, .hud-strip')]
        .filter((node) => !node.hidden && node.getBoundingClientRect().width > 0)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return `${node.className.split(' ').slice(-1)[0]} ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)} pointer-events=${getComputedStyle(node).pointerEvents}`;
        });
      const points: string[] = [];
      for (let y = 100; y <= 800; y += 100) {
        const row: string[] = [];
        for (let x = 100; x <= 1400; x += 100) {
          const node = document.elementFromPoint(x, y);
          const isWorld = node !== null && (node.tagName === 'CANVAS' || node.id === 'game-root');
          row.push(isWorld ? '.' : '#');
        }
        points.push(`y=${String(y).padStart(3)} ${row.join('')}`);
      }
      return { viewport: `${window.innerWidth}x${window.innerHeight}`, panels, points };
    });
    log(`--- ${label} at ${result.viewport} ---`);
    for (const panel of result.panels) log(`  panel: ${panel}`);
    log(`  '.' = a press reaches the world, '#' = it reaches the HUD. x = 100..1400 step 100`);
    for (const row of result.points) log(`  ${row}`);
  };

  await tab(page, 'build').click();
  await page.waitForTimeout(500);
  await sweep('Build tab showing');
  await tab(page, 'zones').click();
  await page.waitForTimeout(500);
  await sweep('Rooms tab showing');
  await tab(page, 'zones').click();
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  await page.locator('.hud-rooms__arm').click();
  await page.waitForTimeout(500);
  await sweep('Rooms tool armed (the panel folds itself to its header)');
});

/* ------------------------------------------------------------------ */
/* Act 5: a tab press before the first New prison (#685)               */
/* ------------------------------------------------------------------ */

test('act 5: pressing a tab before the first New prison (#685)', async ({ page }) => {
  test.setTimeout(300_000);
  const log = (line: string) => console.log(`[act5] ${line}`);

  await installTee(page);
  await installSamplers(page);
  await openApp(page);

  /*
   * #685's subject, played as the player who did it: land on the page and press
   * a tab out of curiosity **before** pressing *New prison*. The defect was that
   * this spent the page's boot worker and the refusal the player then read was
   * false. So: press three tabs, then press *New prison*, then build something
   * and admit somebody -- because "the message is right now" and "the prison
   * works now" are two claims and only the second is worth having.
   */
  for (const id of ['build', 'zones', 'manage'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(400);
    log(`pressed the ${id} tab before any prison exists: refusal=${JSON.stringify(await panelText(page, '.hud__refusal'))} unavailable=${JSON.stringify(await panelText(page, '.hud__unavailable'))}`);
  }
  log(`strip before New prison: ${await strip(page)}`);

  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(2000);
  log(`day readout after New prison: ${JSON.stringify((await page.locator('.hud-clock__day').innerText()).trim())}`);
  log(`strip after New prison: ${await strip(page)}`);
  log(`refusal after New prison: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log(`unavailable band: ${JSON.stringify(await panelText(page, '.hud__unavailable'))}`);

  // Does the prison actually work? One wall run and one admission is enough to
  // tell, and both go through the worker the tab press used to spend.
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  await armBuildable(page, 'wall-brick');
  const before = (await latestCounts(page))?.treasuryMinorUnits;
  await drag(
    page,
    { x: origin.originX + 12 * TILE + TILE / 2, y: origin.originY + 12 * TILE },
    { x: origin.originX + 18 * TILE - TILE / 2, y: origin.originY + 12 * TILE },
  );
  const after = (await latestCounts(page))?.treasuryMinorUnits;
  log(`one wall run after a pre-boot tab press: treasury ${before} -> ${after} queue=${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  await tab(page, 'overview').click();
  await page.locator('.hud-intake__admit').click({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  log(`after one Admit: ${JSON.stringify((await panelText(page, '.hud-intake')).split('\n'))}`);
  log(`refusal at the end: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  log(`counts at the end: ${JSON.stringify(await latestCounts(page))}`);
});
