import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { armBuildable, buy, calibrate, currentTick, drag, installTee, openApp, tab } from './playtest-harness';

/**
 * **Does the press cancel the order the row named when the player read it?**
 *
 * ## Why this file exists, and why it presses by coordinate
 *
 * #860 reports two presses of seven submitting `CancelBuildOrder` for an order
 * other than the one the row's own label described. #859's instrument found it
 * with a Playwright locator -- `[data-order="X"] >> role=button[name=Cancel]`
 * -- which re-resolves the selector immediately before the click. A player has
 * no selector. They read a label, they decide, and they put the pointer where
 * the button *was*.
 *
 * So this file presses with `page.mouse.click(x, y)` at coordinates captured
 * from the same read that captured the label. No re-resolution, no strictness
 * check, nothing that could notice the row had changed. That is the player's
 * act, and it is the only version of the act that can measure the hazard #860
 * describes.
 *
 * ## What it separates
 *
 * A press can miss for two different reasons and they need different fixes:
 *
 * 1. **The row was re-pointed.** `paintQueue` bound `queueRows[i]` to
 *    `orders[i]` before #860, so when the head of the queue completed every
 *    surviving order slid up one row. The *element* under the pointer then
 *    named a different order, and `row.orderId` read at press time was that
 *    different order. `assignPooledRows` is what stopped that.
 * 2. **The list got shorter.** The row is hidden, `row.orderId` is
 *    `undefined`, and the handler returns without submitting anything. The
 *    press is silently lost.
 *
 * Both are recorded per press, with the row index, so the reading says which.
 *
 * ## Three runs, and what each one said
 *
 * **Run 1, against `main`.** Four presses. Two aimed correctly at a 0ms delay;
 * one wrong at 250ms and one wrong at 600ms. In both failures `rowAtPress` --
 * what the pooled element named immediately before the click -- equalled what
 * the command submitted and did not equal what had been read. That is the pool
 * re-pointing the element, and it is #860's mechanism confirmed.
 *
 * **Run 2, against the first half of the fix** (every surviving order keeps its
 * row). Three presses; one lost, and **two still wrong**, at 250ms and 600ms.
 * The reason is arithmetic: three places over a queue losing its head every
 * ~625ms of wall clock at 4x means the order a player aimed at has usually left
 * the window, and keeping *survivors* in place does nothing for them. That run
 * is why `BUILD_QUEUE_ROW_SETTLE_MS` and the no-compaction rule exist.
 *
 * **Run 3, against the whole fix.** Two presses. One at 600ms was **lost** --
 * the place had gone blank and the press reached nothing, which is the safe
 * outcome this design aims for. One at 0ms was still wrong, and its record says
 * the mechanism is no longer the pool: `rowAtPress` was the *empty* string, so
 * the element whose coordinates had been read named nothing at press time, and
 * the `CancelBuildOrder` that was submitted therefore did not go through it. The
 * click landed on a different row's control -- which means the Build panel's own
 * layout moved under the coordinates between the read and the click.
 *
 * **That is a different defect from #860 and it is not in the pooled-row
 * machinery.** It is panel layout motion under a pointer, and the candidates
 * this file has not separated are the deliveries block gaining or losing its box
 * above the queue (`paintDeliveries`), a `scrollIntoView`, and the shortfall
 * line. Reported rather than diagnosed: one press is not a distribution, and
 * naming a cause from it would be the move `docs/AGENT_WORKFLOW.md` §3 calls out.
 *
 * ## It is not a gate
 *
 * `playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`. Run it with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5233 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-860-a-row-cancels-what-it-named.playtest.ts
 * ```
 *
 * `git lfs pull` first in a worktree.
 */

const QUEUE_ROW = '.hud-build__queue-row';

const note = (line: string): void => {
  console.log(line);
};

const transport = (page: Page, which: 'pause' | 'play' | 'fast-forward') =>
  page.locator('.hud-strip__transport button').nth(which === 'pause' ? 0 : which === 'play' ? 1 : 2);

interface RowRead {
  readonly index: number;
  readonly orderId: string;
  readonly text: string;
  readonly buttonX: number;
  readonly buttonY: number;
}

/**
 * Every laid-out queue row, with its label, the order it names, and where its
 * Cancel button is on screen.
 *
 * `index` is the row's position among **all** `.hud-build__queue-row` nodes,
 * hidden ones included, so it names the pooled element rather than the visible
 * ordinal. That is what makes "the same element now names a different order"
 * distinguishable from "the list is shorter".
 */
async function readRows(page: Page): Promise<readonly RowRead[]> {
  return page.evaluate((selector) => {
    const out: RowRead[] = [];
    const nodes = Array.from(document.querySelectorAll(selector));
    for (const [index, node] of nodes.entries()) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.hidden || node.getClientRects().length === 0) continue;
      const button = node.querySelector('button');
      if (!(button instanceof HTMLElement)) continue;
      const box = button.getBoundingClientRect();
      out.push({
        index,
        orderId: node.getAttribute('data-order') ?? '',
        text: (node.innerText ?? '').replace(/\s+/g, ' ').trim(),
        buttonX: Math.round(box.x + box.width / 2),
        buttonY: Math.round(box.y + box.height / 2),
      });
    }
    return out;
  }, QUEUE_ROW) as Promise<readonly RowRead[]>;
}

/** Which order the last `CancelBuildOrder` on the wire named, or `''` for none. */
async function lastCancelled(page: Page): Promise<string> {
  return page.evaluate(() => {
    const messages = (window as unknown as { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as {
        kind?: string;
        payload?: { command?: { data?: { type?: string; orderId?: string } } };
      };
      if (message.kind !== 'simulation/submit-command') continue;
      const data = message.payload?.command?.data;
      if (data?.type !== 'CancelBuildOrder') continue;
      return data.orderId ?? '';
    }
    return '';
  });
}

async function countCancels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const messages = (window as unknown as { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker ?? [];
    let total = 0;
    for (const message of messages) {
      const shaped = message as { kind?: string; payload?: { command?: { data?: { type?: string } } } };
      if (shaped.kind !== 'simulation/submit-command') continue;
      if (shaped.payload?.command?.data?.type === 'CancelBuildOrder') total += 1;
    }
    return total;
  });
}

/** Opens the QUEUED fold, without which no row has a client rect. */
async function openQueueFold(page: Page): Promise<void> {
  const section = page.locator('.hud-build__queue');
  if ((await section.count()) === 0) return;
  if ((await section.getAttribute('data-collapsed')) !== 'true') return;
  await section.locator('.ui-section__header').click();
  await page.waitForTimeout(150);
}

interface Outcome {
  readonly delayMs: number;
  readonly rowIndex: number;
  readonly readOrderId: string;
  readonly readText: string;
  readonly submitted: string;
  readonly verdict: 'aimed' | 'wrong-order' | 'lost';
  readonly rowAtPress: string;
}

test.describe('a pooled queue row and the press that follows it', () => {
  test('the press names the order the row named when it was read', async ({ page }) => {
    test.setTimeout(600_000);

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();

    // Enough bricks that nothing in the run stalls on money or materials: a
    // queue that stalls stops reshuffling, and a queue that does not reshuffle
    // cannot show this defect at all.
    await buy(page, 'wall-brick', 240);

    const origin = await calibrate(page);
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    note(`origin ${JSON.stringify(origin)} viewport ${JSON.stringify(viewport)}`);

    // Three long runs, so the queue is deep enough that the head window keeps
    // being refilled from behind for the whole measurement.
    await armBuildable(page, 'wall-brick');
    for (const [runIndex, fraction] of [0.35, 0.5, 0.65].entries()) {
      const y = Math.round(viewport.height * fraction);
      await drag(
        page,
        { x: Math.round(viewport.width * 0.2), y },
        { x: Math.round(viewport.width * 0.8), y },
      );
      note(`run ${String(runIndex + 1)} placed at y=${String(y)}`);
      await page.waitForTimeout(200);
    }

    await openQueueFold(page);
    const initial = await readRows(page);
    note(`rows after placing: ${JSON.stringify(initial)}`);
    if (initial.length === 0) {
      note('NO LAID-OUT QUEUE ROWS, which is this run’s finding rather than a step to work around.');
      expect(initial.length).toBeGreaterThan(0);
      return;
    }

    await transport(page, 'play').click();
    await transport(page, 'fast-forward').click();
    await page.waitForTimeout(200);
    await transport(page, 'fast-forward').click();
    note(`clock running; tick ${String(await currentTick(page))}`);

    const outcomes: Outcome[] = [];
    // Three decision delays, because the hazard is a function of how long the
    // player spends between reading and pressing. 0 is "as fast as a machine
    // can", 250 is one publication interval (`CLOCK_STATE_PUBLISH_INTERVAL_MS`),
    // 600 is a human reading a label and deciding.
    const delays = [0, 250, 600];
    const startedAt = Date.now();
    let attempt = 0;
    while (outcomes.length < 24 && Date.now() - startedAt < 200_000) {
      const delayMs = delays[attempt % delays.length]!;
      attempt += 1;
      const rows = await readRows(page);
      if (rows.length === 0) {
        // The queue drained. Place another run and carry on.
        const y = Math.round(viewport.height * 0.45);
        await armBuildable(page, 'wall-brick');
        await drag(page, { x: Math.round(viewport.width * 0.2), y }, { x: Math.round(viewport.width * 0.8), y });
        await openQueueFold(page);
        await page.waitForTimeout(200);
        continue;
      }
      // The last laid-out row, because it is the one furthest from the crew and
      // therefore the one a player has time to read.
      const target = rows[rows.length - 1]!;
      if (target.orderId === '') continue;

      const before = await countCancels(page);
      if (delayMs > 0) await page.waitForTimeout(delayMs);
      const atPress = await readRows(page);
      const rowAtPress = atPress.find((row) => row.index === target.index)?.orderId ?? '(hidden)';
      await page.mouse.click(target.buttonX, target.buttonY);
      await page.waitForTimeout(250);
      const after = await countCancels(page);
      const submitted = after > before ? await lastCancelled(page) : '';
      const verdict: Outcome['verdict'] =
        submitted === '' ? 'lost' : submitted === target.orderId ? 'aimed' : 'wrong-order';
      outcomes.push({
        delayMs,
        rowIndex: target.index,
        readOrderId: target.orderId,
        readText: target.text,
        submitted,
        verdict,
        rowAtPress,
      });
      note(
        `press ${String(outcomes.length)} delay ${String(delayMs)}ms row#${String(target.index)}:`
          + ` read [${target.text}] = ${target.orderId}`
          + ` | that element named ${rowAtPress} just before the click`
          + ` | submitted ${submitted === '' ? 'NOTHING' : submitted}`
          + ` | ${verdict.toUpperCase()}`,
      );
      await page.waitForTimeout(150);
    }

    await transport(page, 'pause').click();

    note('');
    for (const delayMs of delays) {
      const group = outcomes.filter((outcome) => outcome.delayMs === delayMs);
      const wrong = group.filter((outcome) => outcome.verdict === 'wrong-order').length;
      const lost = group.filter((outcome) => outcome.verdict === 'lost').length;
      note(
        `delay ${String(delayMs)}ms: ${String(group.length)} presses,`
          + ` ${String(group.length - wrong - lost)} aimed, ${String(wrong)} cancelled a DIFFERENT order,`
          + ` ${String(lost)} submitted nothing at all`,
      );
    }
    const wrongTotal = outcomes.filter((outcome) => outcome.verdict === 'wrong-order').length;
    note(`TOTAL: ${String(outcomes.length)} presses, ${String(wrongTotal)} cancelled an order the row never named.`);
    note(`outcomes: ${JSON.stringify(outcomes)}`);

    expect(outcomes.length).toBeGreaterThan(0);
  });
});
