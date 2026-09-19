import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { armBuildable, buy, calibrate, currentTick, drag, installTee, openApp, panelText, sentCommands, tab } from './playtest-harness';

/**
 * **What the queue row promised, and what Cancel paid.**
 *
 * ## Why this file exists
 *
 * #843 landed the owner's ruling of 2026-09-02: a queued build order's row
 * says what cancelling it would give back, `hud.build.queue-order` reading
 * `'{buildable} · {x}, {y} · {edge} · {total} back'`. The figure is honest by
 * construction at the moment it is computed --
 * `HudBuildOrderViewModel.cancelRefundMinorUnits` is
 * `ConstructionSystem.previewCancelRefundMinorUnits(order.id)`, read in
 * `src/simulation/presentation/construction-projection.ts:359`, off the same
 * state machine `cancelOrder` pays through.
 *
 * **The gap this file plays for is not in that figure. It is in the interval
 * between reading it and pressing the button.**
 *
 * `previewCancelRefundMinorUnits` (`src/simulation/construction/system.ts:884`)
 * pays only from `'assigned'`, `'approved'` and `'materials-pending'`, and
 * returns `0` for `'in-progress'` and `'completed'` -- ruling 20's own
 * decision, that once the crew has started nothing comes back. The crew starts
 * an order inside the tick loop, `src/simulation/construction/system.ts:1311`
 * (`order.state = 'in-progress'`). And `CancelBuildOrder`
 * (`src/simulation/protocol/commands.ts:63-65`) carries **`orderId` and
 * nothing else** -- no expected refund, so no layer can notice that the number
 * on screen is not the number about to be paid.
 *
 * So a player who reads `40 back`, decides, and clicks can be paid `0`, and
 * the game will have named a figure it then does not honour. That is a
 * player-visible promise the code may not keep, which is the owner's surface
 * and not an agent's: **this file measures and changes nothing.**
 *
 * ## What it measures
 *
 * 1. How long a row advertises a non-zero refund before the crew starts that
 *    order and the row drops to `0 back` on its own. Minutes of wall clock
 *    means the trap is theoretical; a fraction of a second means a first-time
 *    player will hit it.
 * 2. Whether the FUNDS chip after `Cancel` moves by the figure the row was
 *    showing when the press was issued.
 *
 * Every press paying exactly what was advertised is evidence the window is too
 * narrow to reach by hand. One press paying less is the defect, with a number.
 *
 * ## Three things this file got wrong before it worked, kept because the next
 * playtest will hit all three
 *
 * 1. **`grep -rn 'data-metric' src/` finds nothing, and the attribute exists
 *    anyway.** `src/ui/hud/status-strip.ts:145` sets it as
 *    `chip.element.dataset['metric'] = descriptor.id`, which no search for the
 *    attribute's own name will ever match. So
 *    `[data-metric="funds"] .ui-stat__value` **works** --
 *    `tests/browser/app-shell.spec.ts:4703` uses exactly that and its failure
 *    log shows the locator resolving thirteen times.
 *
 *    **An earlier version of this header claimed the opposite, and the way it
 *    got there is the more useful warning.** A draft was edited to use that
 *    selector, the edit silently failed, the run therefore executed the
 *    PREVIOUS version, and its `NaN` was read as evidence against a selector
 *    that had never been exercised. Reading an outcome from a run that did not
 *    contain the change is the same error as asserting a mechanism without
 *    measuring it. This file still finds the chip by its label, which needs no
 *    attribute at all -- but not for the reason first written down.
 * 2. **The first number on the strip is the build's version, not money.** A
 *    draft that took `/([\d,]+)/` off the strip's first line parsed
 *    `v0.0.398 · a35121c`.
 * 3. **A fresh prison is not scrolled to tile 12.** `calibrate` returns the
 *    real origin and on this build it is **(-304, -574)**, so tile (12,12) sits
 *    at screen y = -174, off the top of the window. `buildAndPopulate` builds
 *    at (12,12)-(17,17) and gets away with it only because of what it does
 *    first. Which tile this run builds on does not matter to the question, so
 *    the drag goes through the middle of the canvas.
 *
 * ## It is not a gate
 *
 * `playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, so nothing in CI
 * collects `.playtest.ts`. Run it with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5231 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-what-the-row-promised.playtest.ts
 * ```
 *
 * `git lfs checkout` first in a worktree: `docs/AGENT_WORKFLOW.md` records a
 * playtest that ran green with no actor sprites at all.
 */

const QUEUE_ROW = '.hud-build__queue-row';

interface RowReading {
  readonly at: number;
  readonly tick: number;
  readonly orderId: string;
  readonly back: number;
  readonly text: string;
}

/** Every visible queue row, with the `N back` figure parsed out of its label. */
async function readRows(page: Page): Promise<readonly RowReading[]> {
  const at = Date.now();
  const tick = await currentTick(page);
  const raw = await page.evaluate((selector) => {
    const rows: { orderId: string; text: string }[] = [];
    for (const node of Array.from(document.querySelectorAll(selector))) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.hidden || node.getClientRects().length === 0) continue;
      rows.push({
        orderId: node.getAttribute('data-order') ?? '',
        text: (node.innerText ?? '').replace(/\s+/g, ' ').trim(),
      });
    }
    return rows;
  }, QUEUE_ROW);
  return raw.map((row) => {
    const match = /([\d  \s,.]+)\s*back/.exec(row.text);
    const back = match === null ? Number.NaN : Number.parseInt(match[1]!.replace(/[^\d]/g, ''), 10);
    return { at, tick, orderId: row.orderId, back, text: row.text };
  });
}

/**
 * The FUNDS chip's value, found by its own label.
 *
 * `[data-metric="funds"] .ui-stat__value` would work too -- see fact 1 in the
 * header, and the correction under it. A label lookup is kept because it
 * depends on nothing but what a player can see.
 */
async function money(page: Page): Promise<number> {
  const text = await page.evaluate(() => {
    for (const chip of Array.from(document.querySelectorAll('.ui-stat'))) {
      const label = chip.querySelector('.ui-stat__label');
      if (label instanceof HTMLElement && label.innerText.trim().toUpperCase() === 'FUNDS') {
        const value = chip.querySelector('.ui-stat__value');
        if (value instanceof HTMLElement) return value.innerText;
      }
    }
    return '';
  });
  const digits = text.replace(/[^\d-]/g, '');
  return digits === '' ? Number.NaN : Number.parseInt(digits, 10);
}

test.describe('the queue row and the press that follows it', () => {
  test('a row that advertises a refund is still advertising it when Cancel arrives', async ({ page }) => {
    const note = (line: string): void => {
      console.log(line);
    };

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();

    note(`money at start: ${String(await money(page))}`);

    await buy(page, 'wall-brick', 40);
    note(`money after buying 40 bricks: ${String(await money(page))}`);

    const origin = await calibrate(page);
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    note(`calibrated origin: ${JSON.stringify(origin)}; viewport: ${JSON.stringify(viewport)}`);

    await armBuildable(page, 'wall-brick');
    const midY = Math.round(viewport.height / 2);
    await drag(
      page,
      { x: Math.round(viewport.width * 0.35), y: midY },
      { x: Math.round(viewport.width * 0.6), y: midY },
    );

    const afterPlacing = await readRows(page);
    note(`queue readout: ${await panelText(page, '.hud-build__queue')}`);
    note(`rows after placing: ${JSON.stringify(afterPlacing)}`);
    if (afterPlacing.length === 0) {
      note('NO QUEUE ROWS after the drag, and that is this run’s finding rather than a step to work around.');
      note(`commands the drag sent: ${JSON.stringify((await sentCommands(page)).slice(-6))}`);
      return;
    }

    // 1. How long does a paying figure stay on screen by itself?
    let firstPaying: RowReading | undefined;
    let droppedToZero: RowReading | undefined;
    let samples = 0;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30_000) {
      const rows = await readRows(page);
      samples += 1;
      const paying = rows.find((row) => Number.isFinite(row.back) && row.back > 0);
      if (firstPaying === undefined && paying !== undefined) {
        firstPaying = paying;
        note(`first paying row at sample ${String(samples)}: ${JSON.stringify(paying)}`);
      }
      if (firstPaying !== undefined) {
        const followed = rows.find((row) => row.orderId === firstPaying!.orderId);
        if (followed === undefined || followed.back === 0) {
          droppedToZero = followed ?? { ...firstPaying, at: Date.now(), back: 0, text: 'row no longer present' };
          break;
        }
      }
      if (rows.length === 0) break;
      await page.waitForTimeout(50);
    }

    note(`samples taken: ${String(samples)}`);
    if (firstPaying === undefined) {
      note('NO ROW EVER ADVERTISED A NON-ZERO REFUND in 30s of wall clock, which is a finding on its own:');
      note('either every queued order sat in a state that pays nothing, or `{total}` renders 0 always.');
      note(`last rows: ${JSON.stringify(await readRows(page))}`);
      return;
    }
    if (droppedToZero === undefined) {
      note('THE WINDOW IS AT LEAST 30,000ms WIDE: the figure was still paying after 30s with the clock running.');
      note('On this evidence the trap is theoretical for a player who decides in seconds.');
    } else {
      note(
        `THE WINDOW: advertised ${String(firstPaying.back)} back for ${String(droppedToZero.at - firstPaying.at)}ms`
          + ` (${String(droppedToZero.tick - firstPaying.tick)} ticks) before going to 0 by itself.`,
      );
      note(`the row then read: ${droppedToZero.text}`);
    }

    // 2. Does a press pay what the row was showing?
    const rowsNow = await readRows(page);
    const target = rowsNow.find((row) => Number.isFinite(row.back) && row.back > 0);
    if (target === undefined) {
      note(`nothing advertises a refund at press time, so the press half is skipped: ${JSON.stringify(rowsNow)}`);
      return;
    }

    const before = await money(page);
    note(`pressing Cancel on ${target.orderId}, which says ${String(target.back)} back; FUNDS ${String(before)}`);
    const commandsBefore = (await sentCommands(page)).length;
    await page.locator(`${QUEUE_ROW}[data-order="${target.orderId}"]`).getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(600);
    const after = await money(page);
    note(`commands the press sent: ${JSON.stringify((await sentCommands(page)).slice(commandsBefore))}`);
    note(`FUNDS after: ${String(after)}; delta ${String(after - before)}; advertised ${String(target.back)}`);
    note(
      after - before === target.back
        ? 'PAID WHAT IT PROMISED on this timing.'
        : 'MISMATCH: the row advertised one figure and the press moved the treasury by another. Reported, not repaired.',
    );

    // Nothing asserts on the mismatch: a playtest that went red on it would be
    // a gate, and this is a measurement. The reading is the deliverable.
    expect(samples).toBeGreaterThan(0);
  });
});
