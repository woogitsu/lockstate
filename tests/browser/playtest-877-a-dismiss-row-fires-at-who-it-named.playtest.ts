import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { armBuildable, buy, calibrate, currentTick, drag, installTee, latestCounts, openApp, tab } from './playtest-harness';

/**
 * **Does a press on a pooled row reach the subject the row named when the
 * player read it?** — asked of the two Staff panel pools and of the Build
 * panel's deliveries, which #877 names as the same index-bound shape #860
 * measured on the build queue.
 *
 * ## The instrument is #860's, deliberately
 *
 * `page.mouse.click(x, y)` at a button box captured by the **same read** that
 * captured the label. Never a Playwright locator: a locator re-resolves
 * `[data-staff]` immediately before the click and would therefore follow the
 * subject wherever the pool moved it, which is the one thing a player cannot
 * do. A player reads a label, decides, and puts the pointer where the button
 * *was*.
 *
 * Every press records three separate facts, because a press can miss for
 * reasons that need different fixes:
 *
 * - **what was read** — the id the row carried when its box was measured;
 * - **what that same pooled element named at press time** — `atPress`, read
 *   from the element at the same array index, so "this element now names
 *   somebody else" is distinguishable from "the list got shorter";
 * - **what crossed the wire** — the id in the last `DismissStaff` /
 *   `ReleaseGuardAssignment` / `CancelMaterialPurchase` on
 *   `window.lockstateSentToWorker`.
 *
 * ## Two probes per surface, because the two halves of #877 are different
 *   questions
 *
 * #877 says the roster *"changes under the player for reasons they did not
 * cause — a guard being released, a shift changing, coverage recomputing on the
 * clock heartbeat"*. That is a claim about **churn**, and it is separable from
 * the claim about **binding**. So each surface gets:
 *
 * 1. **A churn sample.** With the clock at maximum and the player touching
 *    nothing, the index→subject mapping is sampled every 250ms and every
 *    re-pointing counted. A surface that never re-points while the player is
 *    reading cannot misfire for a reason the player did not cause, however
 *    index-bound its assignment is.
 * 2. **A press measurement at 0 / 250 / 600ms decision delays**, the same three
 *    delays #860 used.
 *
 * For the roster the press measurement has a second form, and it is the one the
 * code's ordering says is the real hazard: `GuardRoster.allGuardIds()` sorts
 * ascending entity id and `StaffRosterReader` asks for the first
 * `STAFF_ROSTER_ROW_LIMIT` of them, so the window re-points when somebody
 * *inside* it leaves — and the only thing in `src/` that removes a staff member
 * is a dismissal. The player who is exposed is therefore the player sacking
 * **two** people: they read the list once, press the first row, and press the
 * second while the publication caused by the first is in flight. That is probe
 * `two-presses`, and its coordinates are all captured before the first press.
 *
 * ## It is not a gate
 *
 * `playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, so nothing here runs
 * in CI, and `test` is imported from `@playwright/test` directly for the reason
 * every other `*.playtest.ts` here does: the import contract in
 * `tests/foundation/browser-network-changed-retry-contract.test.ts` is scoped
 * to `*.spec.ts`. Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5342 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-877-a-dismiss-row-fires-at-who-it-named.playtest.ts \
 *   -g "the dismiss rows"
 * ```
 *
 * `git lfs pull` first in a worktree, or every actor atlas fails to decode and
 * the run passes anyway with nothing drawn.
 */

const ROSTER_ROW = '.hud-staff__roster .hud-staff__held-row';
const HELD_ROW = '.hud-staff__held-list .hud-staff__held-row';
const DELIVERY_ROW = '.hud-build__delivery-row';

const note = (line: string): void => {
  console.log(line);
};

const transport = (page: Page, which: 'pause' | 'play' | 'fast-forward') =>
  page.locator('.hud-strip__transport button').nth(which === 'pause' ? 0 : which === 'play' ? 1 : 2);

interface RowRead {
  /** Position among **all** nodes matching the selector, hidden ones included. */
  readonly index: number;
  readonly subjectId: string;
  readonly text: string;
  readonly buttonX: number;
  readonly buttonY: number;
}

/**
 * Every laid-out row of one pooled list, with what it names and where its
 * control is on screen.
 *
 * `index` is the position among all nodes rather than among the visible ones,
 * so the same pooled element can be re-read after a delay and asked what it
 * names *now*. That is what separates "this element was re-pointed" from "the
 * list is shorter".
 */
async function readRows(page: Page, selector: string, attribute: string): Promise<readonly RowRead[]> {
  return page.evaluate(
    ([sel, attr]) => {
      const out: RowRead[] = [];
      const nodes = Array.from(document.querySelectorAll(sel as string));
      for (const [index, node] of nodes.entries()) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.hidden || node.getClientRects().length === 0) continue;
        const button = node.querySelector('button');
        if (!(button instanceof HTMLElement)) continue;
        const box = button.getBoundingClientRect();
        /*
         * Inside the viewport, not merely laid out -- and the first run of this
         * instrument was wasted on the difference. `.ui-panel.hud-staff` is
         * `overflow-y: auto`, so the roster sits below the fold of a 1440x900
         * window: its three rows reported boxes at y=819, 871 and **923**, the
         * last of which is off the bottom of the page. Every press at those
         * coordinates submitted nothing, which reads exactly like the safe
         * outcome a fix is supposed to produce and is really a click that
         * landed outside the window. A player cannot press what is not on
         * screen either, so a row that is not is not a measurement.
         */
        if (box.bottom > window.innerHeight || box.top < 0) continue;
        if (box.right > window.innerWidth || box.left < 0) continue;
        out.push({
          index,
          subjectId: node.getAttribute(attr as string) ?? '',
          text: (node.innerText ?? '').replace(/\s+/g, ' ').trim(),
          buttonX: Math.round(box.x + box.width / 2),
          buttonY: Math.round(box.y + box.height / 2),
        });
      }
      return out;
    },
    [selector, attribute],
  ) as Promise<readonly RowRead[]>;
}

/** What this pooled element names right now, or `(hidden)` if it has no box. */
async function nameAtPress(page: Page, selector: string, attribute: string, index: number): Promise<string> {
  const rows = await readRows(page, selector, attribute);
  return rows.find((row) => row.index === index)?.subjectId ?? '(hidden)';
}

interface WireRead {
  readonly count: number;
  readonly last: string;
}

/**
 * How many commands of one type have been submitted, and the subject id on the
 * most recent one. Read off the tee rather than off any panel state, because
 * what a player is owed is what actually crossed the wire.
 */
async function wire(page: Page, type: string, field: string): Promise<WireRead> {
  return page.evaluate(
    ([commandType, idField]) => {
      const messages = (window as unknown as { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker ?? [];
      let count = 0;
      let last = '';
      for (const message of messages) {
        const shaped = message as {
          kind?: string;
          payload?: { command?: { data?: Record<string, unknown> } };
        };
        if (shaped.kind !== 'simulation/submit-command') continue;
        const data = shaped.payload?.command?.data;
        if (data?.['type'] !== commandType) continue;
        count += 1;
        last = String(data[idField as string] ?? '');
      }
      return { count, last };
    },
    [type, field],
  );
}

/** Opens a collapsible section whose body has no box until the player asks. */
async function openFold(page: Page, section: string): Promise<void> {
  const header = page.locator(`${section} > .ui-section__header`);
  if ((await header.count()) === 0) return;
  if ((await header.getAttribute('aria-expanded')) === 'true') return;
  await header.click();
  await page.waitForTimeout(150);
}

/**
 * Scrolls a block into the middle of the panel that owns it, **before** any box
 * is read.
 *
 * Never between a read and a press: a scroll there is layout motion under the
 * pointer, which is the separate defect #860's third run found and did not
 * diagnose. Here it is part of arriving at the list, which is what a player
 * does with a panel that scrolls.
 */
async function bringIntoView(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    document.querySelector(sel)?.scrollIntoView({ block: 'center' });
  }, selector);
  await page.waitForTimeout(200);
}

async function hireGuards(page: Page, count: number): Promise<void> {
  await tab(page, 'security').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let index = 0; index < count; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(400);
}

/**
 * How many staff the prison employs, off the counts stream rather than off the
 * panel: `.hud-staff__roster-count` carries the *wage bill* since #639 ruling 2,
 * so reading a number out of the header would count money.
 */
async function hiredCount(page: Page): Promise<number> {
  return (await latestCounts(page))?.staff ?? 0;
}

/**
 * Every re-pointing of a pooled place while the player does nothing at all.
 *
 * Sampled on wall clock rather than on publications, because the question is
 * what happens inside the seconds a person spends reading — the interval a
 * `settleMs` would have to cover. A place that goes blank and comes back
 * naming the same subject is not counted; only a place whose subject changed
 * to a *different* subject is, because that is the one a press cannot survive.
 */
async function sampleChurn(
  page: Page,
  selector: string,
  attribute: string,
  label: string,
  durationMs: number,
): Promise<number> {
  const seen = new Map<number, string>();
  let repointings = 0;
  const startedAt = Date.now();
  const transitions: string[] = [];
  while (Date.now() - startedAt < durationMs) {
    for (const row of await readRows(page, selector, attribute)) {
      const previous = seen.get(row.index);
      if (previous !== undefined && previous !== '' && row.subjectId !== '' && previous !== row.subjectId) {
        repointings += 1;
        transitions.push(`row#${String(row.index)} ${previous}->${row.subjectId}`);
      }
      seen.set(row.index, row.subjectId);
    }
    await page.waitForTimeout(250);
  }
  note(
    `CHURN ${label}: ${String(repointings)} re-pointing(s) in ${String(Date.now() - startedAt)}ms`
      + ` with the player touching nothing`
      + (transitions.length === 0 ? '' : ` -- ${JSON.stringify(transitions.slice(0, 12))}`),
  );
  return repointings;
}

interface Outcome {
  readonly probe: string;
  readonly delayMs: number;
  /**
   * Wall-clock milliseconds from the read that captured the box to the click
   * landing, which is always larger than `delayMs` by the probe's own round
   * trips. **This is the figure a settle window has to cover**, not the
   * nominal delay -- #860's own window is 1,000ms because its 600ms presses
   * were measured at about 800ms elapsed.
   */
  readonly elapsedMs: number;
  readonly rowIndex: number;
  readonly readId: string;
  readonly readText: string;
  readonly atPress: string;
  readonly submitted: string;
  readonly verdict: 'aimed' | 'wrong-subject' | 'lost';
}

function report(label: string, outcomes: readonly Outcome[]): void {
  note('');
  for (const probe of [...new Set(outcomes.map((outcome) => outcome.probe))]) {
    for (const delayMs of [0, 250, 600]) {
      const group = outcomes.filter((outcome) => outcome.probe === probe && outcome.delayMs === delayMs);
      if (group.length === 0) continue;
      const wrong = group.filter((outcome) => outcome.verdict === 'wrong-subject').length;
      const lost = group.filter((outcome) => outcome.verdict === 'lost').length;
      const elapsed = group.map((outcome) => outcome.elapsedMs);
      note(
        `${label} [${probe}] delay ${String(delayMs)}ms:`
          + ` ${String(wrong)} of ${String(group.length)} reached a DIFFERENT subject,`
          + ` ${String(lost)} submitted nothing,`
          + ` ${String(group.length - wrong - lost)} aimed`
          + ` | read-to-click elapsed ${JSON.stringify(elapsed)}ms`,
      );
    }
  }
  const wrongTotal = outcomes.filter((outcome) => outcome.verdict === 'wrong-subject').length;
  note(`${label} TOTAL: ${String(wrongTotal)} of ${String(outcomes.length)} presses reached a different subject.`);
  note(`${label} outcomes: ${JSON.stringify(outcomes)}`);
}

/* ==================================================================== */
/* The dismiss rows (`staff-panel.ts` paintRoster)                       */
/* ==================================================================== */

test.describe('the dismiss rows fire at who they named', () => {
  test('a press on a roster row dismisses the person the row named when it was read', async ({ page }) => {
    test.setTimeout(600_000);

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // The clock first, so a hire is consumed while this act watches rather
    // than draining later, and at maximum, because the hazard is a function of
    // how much the world changes inside a human decision.
    await transport(page, 'play').click();
    await transport(page, 'fast-forward').click();
    await page.waitForTimeout(200);
    await transport(page, 'fast-forward').click();
    note(`clock running; tick ${String(await currentTick(page))}`);

    // Nine, so the window of three is refilled from behind after every
    // dismissal for the whole measurement. Hiring needs no rooms and no
    // materials -- which is itself worth recording, because it means this
    // list, and its irreversible control, is reachable in the first minute of
    // a session.
    await hireGuards(page, 9);
    await openFold(page, '.hud-staff__roster');
    await bringIntoView(page, '.hud-staff__roster');
    note(`hired ${String(await hiredCount(page))}; roster header reads`
      + ` ${JSON.stringify((await page.locator('.hud-staff__roster > .ui-section__header').innerText()).trim())}`);

    const initial = await readRows(page, ROSTER_ROW, 'data-staff');
    note(`roster rows after hiring: ${JSON.stringify(initial)}`);
    expect(initial.length).toBeGreaterThan(0);

    // Probe 0: does this list re-point while the player reads it? #877 says it
    // does; the ordering in `GuardRoster.allGuardIds` says it cannot without a
    // removal, and only a dismissal removes.
    await sampleChurn(page, ROSTER_ROW, 'data-staff', 'roster (clock at max, nobody dismissed)', 12_000);
    note(`roster rows in view before the presses: ${JSON.stringify(await readRows(page, ROSTER_ROW, 'data-staff'))}`);

    const outcomes: Outcome[] = [];
    const delays = [0, 250, 600] as const;

    // Probe 1: #860's instrument exactly -- read one row, wait, press it.
    for (const delayMs of delays) {
      if ((await hiredCount(page)) < 5) await hireGuards(page, 5);
      await openFold(page, '.hud-staff__roster');
      await bringIntoView(page, '.hud-staff__roster');
      const rows = await readRows(page, ROSTER_ROW, 'data-staff');
      const target = rows[rows.length - 1];
      if (target === undefined || target.subjectId === '') continue;
      const readAt = Date.now();
      const before = await wire(page, 'DismissStaff', 'staffId');
      if (delayMs > 0) await page.waitForTimeout(delayMs);
      const atPress = await nameAtPress(page, ROSTER_ROW, 'data-staff', target.index);
      await page.mouse.click(target.buttonX, target.buttonY);
      const elapsedMs = Date.now() - readAt;
      await page.waitForTimeout(400);
      const after = await wire(page, 'DismissStaff', 'staffId');
      const submitted = after.count > before.count ? after.last : '';
      outcomes.push({
        probe: 'one-press',
        delayMs,
        elapsedMs,
        rowIndex: target.index,
        readId: target.subjectId,
        readText: target.text,
        atPress,
        submitted,
        verdict: submitted === '' ? 'lost' : submitted === target.subjectId ? 'aimed' : 'wrong-subject',
      });
      note(
        `one-press delay ${String(delayMs)}ms (${String(elapsedMs)}ms elapsed) row#${String(target.index)}:`
          + ` read [${target.text}] = ${target.subjectId}`
          + ` | that element named ${atPress} just before the click`
          + ` | submitted ${submitted === '' ? 'NOTHING' : submitted}`
          + ` | ${outcomes[outcomes.length - 1]!.verdict.toUpperCase()}`,
      );
      await page.waitForTimeout(300);
    }

    // Probe 2: the player sacking two people. Both boxes are read *before* the
    // first press, which is the whole point -- a player reads the list once.
    for (const delayMs of delays) {
      for (let repeat = 0; repeat < 2; repeat += 1) {
        if ((await hiredCount(page)) < 6) await hireGuards(page, 6);
        await openFold(page, '.hud-staff__roster');
        await bringIntoView(page, '.hud-staff__roster');
        const rows = await readRows(page, ROSTER_ROW, 'data-staff');
        const first = rows[0];
        const second = rows[rows.length - 1];
        if (first === undefined || second === undefined || first.index === second.index) continue;
        if (first.subjectId === '' || second.subjectId === '') continue;

        // The first victim, pressed at once and not measured: it is the cause,
        // not the observation.
        const readAt = Date.now();
        await page.mouse.click(first.buttonX, first.buttonY);
        const before = await wire(page, 'DismissStaff', 'staffId');
        if (delayMs > 0) await page.waitForTimeout(delayMs);
        const atPress = await nameAtPress(page, ROSTER_ROW, 'data-staff', second.index);
        await page.mouse.click(second.buttonX, second.buttonY);
        const elapsedMs = Date.now() - readAt;
        await page.waitForTimeout(400);
        const after = await wire(page, 'DismissStaff', 'staffId');
        const submitted = after.count > before.count ? after.last : '';
        outcomes.push({
          probe: 'two-presses',
          delayMs,
          elapsedMs,
          rowIndex: second.index,
          readId: second.subjectId,
          readText: second.text,
          atPress,
          submitted,
          verdict: submitted === '' ? 'lost' : submitted === second.subjectId ? 'aimed' : 'wrong-subject',
        });
        note(
          `two-presses delay ${String(delayMs)}ms (${String(elapsedMs)}ms elapsed): sacked ${first.subjectId} first,`
            + ` then pressed row#${String(second.index)} read as [${second.text}] = ${second.subjectId}`
            + ` | that element named ${atPress} just before the second click`
            + ` | submitted ${submitted === '' ? 'NOTHING' : submitted}`
            + ` | ${outcomes[outcomes.length - 1]!.verdict.toUpperCase()}`,
        );
        await page.waitForTimeout(300);
      }
    }

    await transport(page, 'pause').click();
    report('ROSTER', outcomes);
    expect(outcomes.length).toBeGreaterThan(0);
  });
});

/* ==================================================================== */
/* The pending deliveries (`build-panel.ts` paintDeliveries)             */
/* ==================================================================== */

test.describe('the delivery rows fire at what they named', () => {
  test('a press on a delivery row cancels the purchase the row named when it was read', async ({ page }) => {
    test.setTimeout(600_000);

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();

    /*
     * Staggered **in ticks, not in wall clock** -- and two runs of this act
     * were spent learning why that matters.
     *
     * `PROCUREMENT_DELIVERY_DELAY_TICKS` is 100, counted from the tick the
     * purchase is consumed. Six purchases made with the clock paused are all
     * consumed on the same tick and therefore all arrive on the same tick: the
     * block goes from three rows to none in one publication and **no row is
     * ever re-pointed** (run 1: 0 re-pointings in 11,292ms, then nothing left
     * to press). Spacing the buys by wall clock instead does not fix it,
     * because on a loaded box a `buy()` takes several seconds and the whole
     * batch had already landed before the first read (run 2: `pending=null`).
     *
     * So the clock is driven by hand: buy, advance a fixed number of *ticks*,
     * buy again. Arrival times are then 22 ticks apart whatever the machine is
     * doing, and the last stretch stops 20 ticks short of the first arrival, so
     * the measurement begins with a full list and a head that is about to
     * leave -- which is the only state in which an index-bound row can
     * re-point, and the state a player buying a few loads is in.
     */
    /*
     * Runs to a tick and stops, polling **inside the page**.
     *
     * The obvious shape -- `await currentTick(page)` in a loop with a
     * `waitForTimeout` -- is one Playwright round trip per sample, and on a box
     * at load average 25 each of those took seconds: nine calls asking for tick
     * 100 overshot to tick **862**, by which time every delivery had landed and
     * `data-pending` read `null`. `waitForFunction` polls in the page at 20ms,
     * so the overshoot is bounded by the clock publication interval instead of
     * by how busy the machine is.
     */
    const advanceTo = async (target: number): Promise<void> => {
      await transport(page, 'play').click();
      await page.waitForFunction(
        (wanted) => {
          const messages = (window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [];
          for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index] as { kind?: string; payload?: { tick?: number } };
            if (message.kind === 'simulation/clock-state') return (message.payload?.tick ?? -1) >= wanted;
          }
          return false;
        },
        target,
        { polling: 20, timeout: 120_000 },
      );
      await transport(page, 'pause').click();
    };

    const STAGGER_TICKS = 22;
    const LOADS = 8;
    const restock = async (): Promise<number> => {
      await transport(page, 'pause').click();
      const base = await currentTick(page);
      for (let index = 0; index < LOADS; index += 1) {
        await buy(page, 'wall-brick', 3);
        await advanceTo(base + STAGGER_TICKS * (index + 1));
      }
      // 20 ticks short of the first arrival (`DEFAULT_LEAD_TICKS` is what the
      // first buy waited to be consumed, so it arrives at base + 20 + 100).
      await advanceTo(base + 100);
      await transport(page, 'play').click();
      return base;
    };

    const base = await restock();
    note(`${String(LOADS)} loads bought, staggered ${String(STAGGER_TICKS)} ticks from tick ${String(base)};`
      + ` now at tick ${String(await currentTick(page))} with the clock at speed 1`);
    await bringIntoView(page, '.hud-build__deliveries');
    const initial = await readRows(page, DELIVERY_ROW, 'data-delivery');
    note(`delivery rows after buying: ${JSON.stringify(initial)}`);
    note(`deliveries block says pending=${await page.locator('.hud-build__deliveries').getAttribute('data-pending')}`);
    expect(initial.length).toBeGreaterThan(0);

    await sampleChurn(page, DELIVERY_ROW, 'data-delivery', 'deliveries (speed 1, nothing pressed)', 10_000);

    const outcomes: Outcome[] = [];
    const delays = [0, 250, 600] as const;
    let attempt = 0;
    const startedAt = Date.now();
    while (outcomes.length < 9 && Date.now() - startedAt < 240_000) {
      const delayMs = delays[attempt % delays.length]!;
      attempt += 1;
      await bringIntoView(page, '.hud-build__deliveries');
      let rows = await readRows(page, DELIVERY_ROW, 'data-delivery');
      if (rows.length < 2) {
        // Fewer than two rows cannot show a re-pointing: the hazard is one
        // leaving while another is still there.
        note(
          `attempt ${String(attempt)}: only ${String(rows.length)} row(s) in view,`
            + ` pending=${await page.locator('.hud-build__deliveries').getAttribute('data-pending')}`
            + `, funds=${String((await latestCounts(page))?.treasuryMinorUnits)} -- restocking`,
        );
        await restock();
        await bringIntoView(page, '.hud-build__deliveries');
        rows = await readRows(page, DELIVERY_ROW, 'data-delivery');
        if (rows.length < 2) continue;
      }
      const target = rows[rows.length - 1]!;
      if (target.subjectId === '') continue;
      const readAt = Date.now();
      const before = await wire(page, 'CancelMaterialPurchase', 'orderId');
      if (delayMs > 0) await page.waitForTimeout(delayMs);
      const atPress = await nameAtPress(page, DELIVERY_ROW, 'data-delivery', target.index);
      await page.mouse.click(target.buttonX, target.buttonY);
      const elapsedMs = Date.now() - readAt;
      await page.waitForTimeout(300);
      const after = await wire(page, 'CancelMaterialPurchase', 'orderId');
      const submitted = after.count > before.count ? after.last : '';
      outcomes.push({
        probe: 'one-press',
        delayMs,
        elapsedMs,
        rowIndex: target.index,
        readId: target.subjectId,
        readText: target.text,
        atPress,
        submitted,
        verdict: submitted === '' ? 'lost' : submitted === target.subjectId ? 'aimed' : 'wrong-subject',
      });
      note(
        `delivery delay ${String(delayMs)}ms (${String(elapsedMs)}ms elapsed) row#${String(target.index)}:`
          + ` read [${target.text}] = ${target.subjectId}`
          + ` | that element named ${atPress} just before the click`
          + ` | submitted ${submitted === '' ? 'NOTHING' : submitted}`
          + ` | ${outcomes[outcomes.length - 1]!.verdict.toUpperCase()}`,
      );
      await page.waitForTimeout(150);
    }

    await transport(page, 'pause').click();
    report('DELIVERIES', outcomes);
    expect(outcomes.length).toBeGreaterThan(0);
  });
});

/* ==================================================================== */
/* The held-guard rows (`staff-panel.ts` paintHeld)                      */
/* ==================================================================== */

test.describe('the held-guard rows fire at who they named', () => {
  test('a press on a held row releases the guard the row named when it was read', async ({ page }) => {
    test.setTimeout(900_000);

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // A held guard needs a *claim*, and `GuardReleaseService.claimOf` returns
    // one for any guard whose phase is not `'unassigned'` -- which means a
    // sector that requires guards. So this act has to build and zone a room
    // before it can measure anything, unlike the two above.
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    note(`origin ${JSON.stringify(origin)} viewport ${JSON.stringify(viewport)}`);
    await buy(page, 'wall-brick', 120);
    await transport(page, 'play').click();
    await transport(page, 'fast-forward').click();
    await page.waitForTimeout(200);
    await transport(page, 'fast-forward').click();
    await page.waitForTimeout(4000);

    const TILE = 64;
    const westX = origin.originX + 12 * TILE;
    const eastX = origin.originX + 18 * TILE;
    const northY = origin.originY + 12 * TILE;
    const southY = origin.originY + 18 * TILE;
    await armBuildable(page, 'wall-brick');
    for (const run of [
      { a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
      { a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
      { a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
      { a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
    ]) {
      await drag(page, run.a, run.b);
      await page.waitForTimeout(200);
    }
    note(`walls placed at tick ${String(await currentTick(page))}`);

    // Zone it, retrying: the enclosure verdict is read off a world view a
    // snapshot replaces and a completed wall does not mark dirty.
    let zoned = false;
    for (let attempt = 0; attempt < 14 && !zoned; attempt += 1) {
      await tab(page, 'rooms').click();
      const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
      if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
      await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
      await page.locator('.hud-rooms__arm').click();
      await drag(
        page,
        { x: origin.originX + 12.5 * TILE, y: origin.originY + 12.5 * TILE },
        { x: origin.originX + 16.5 * TILE, y: origin.originY + 16.5 * TILE },
      );
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(1200);
      zoned = (await page.locator('.hud-strip').innerText()).length > 0
        && (await page.locator('.hud-rooms').innerText()).includes('ENCLOSED');
      if (!zoned) await page.waitForTimeout(4000);
    }
    note(`zoned=${String(zoned)} at tick ${String(await currentTick(page))}`);

    await hireGuards(page, 8);
    await page.waitForTimeout(3000);
    note(`held block: ${JSON.stringify((await page.locator('.hud-staff__held').innerText()).replace(/\s+/g, ' ').trim())}`);

    await bringIntoView(page, '.hud-staff__held');
    const initial = await readRows(page, HELD_ROW, 'data-guard');
    note(`held rows: ${JSON.stringify(initial)}`);
    if (initial.length === 0) {
      note('NO LAID-OUT HELD ROWS. That is this act’s finding rather than a step to work around:');
      note('nothing this fixture does gives a guard a claim, so the release control is unreachable here.');
      expect(initial.length).toBeGreaterThanOrEqual(0);
      return;
    }

    await sampleChurn(page, HELD_ROW, 'data-guard', 'held guards (clock at max, nothing pressed)', 12_000);

    const outcomes: Outcome[] = [];
    for (const delayMs of [0, 250, 600] as const) {
      for (let repeat = 0; repeat < 2; repeat += 1) {
        await bringIntoView(page, '.hud-staff__held');
        const rows = await readRows(page, HELD_ROW, 'data-guard');
        const target = rows[rows.length - 1];
        if (target === undefined || target.subjectId === '') continue;
        const readAt = Date.now();
        const before = await wire(page, 'ReleaseGuardAssignment', 'guardId');
        if (delayMs > 0) await page.waitForTimeout(delayMs);
        const atPress = await nameAtPress(page, HELD_ROW, 'data-guard', target.index);
        await page.mouse.click(target.buttonX, target.buttonY);
        const elapsedMs = Date.now() - readAt;
        await page.waitForTimeout(400);
        const after = await wire(page, 'ReleaseGuardAssignment', 'guardId');
        const submitted = after.count > before.count ? after.last : '';
        outcomes.push({
          probe: 'one-press',
          delayMs,
          elapsedMs,
          rowIndex: target.index,
          readId: target.subjectId,
          readText: target.text,
          atPress,
          submitted,
          verdict: submitted === '' ? 'lost' : submitted === target.subjectId ? 'aimed' : 'wrong-subject',
        });
        note(
          `held delay ${String(delayMs)}ms (${String(elapsedMs)}ms elapsed) row#${String(target.index)}:`
            + ` read [${target.text}] = ${target.subjectId}`
            + ` | that element named ${atPress} just before the click`
            + ` | submitted ${submitted === '' ? 'NOTHING' : submitted}`
            + ` | ${outcomes[outcomes.length - 1]!.verdict.toUpperCase()}`,
        );
        await page.waitForTimeout(600);
      }
    }

    await transport(page, 'pause').click();
    report('HELD', outcomes);
    expect(outcomes.length).toBeGreaterThanOrEqual(0);
  });
});
