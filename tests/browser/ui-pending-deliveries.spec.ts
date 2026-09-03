import { type Page, expect, test } from './network-changed-fixture';
import type { HudPendingDeliveriesViewModel } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * What has been bought and has not arrived, in a real browser (#285, and the
 * surface that gives `ProcurementSystem.cancel` a caller at last).
 *
 * ## Why this cannot be proven below this layer
 *
 * Because the claim is that a **refund is reachable on a phone**, and every part
 * of that is a browser answer. The default Vitest environment is `node`
 * (`docs/TESTING.md`), so nothing headless can call `createBuildPanel` at all --
 * and a fake DOM could not settle it either. This surface was *sized* by a
 * rectangle: at 900x600 on the assembled page the open buy disclosure holds three
 * delivery rows in a 337.0px visible panel box at 312.9px, and a fourth row takes
 * it to 360.9px and puts the last Cancel 7.9px below the panel's visible bottom
 * **with a full 78x44 box and an `offsetParent`**. That is #220's exact shape: a
 * control that is laid out, hit-tests to itself, and is not on screen. Only
 * `getBoundingClientRect` tells the two apart.
 *
 * A control promising money back is the worst case of all, which is why every
 * assertion here is a box or an `offsetParent`, the press is a real `click()`, and
 * "which delivery did it cancel" is read off the intent the panel dispatched
 * rather than off the DOM.
 *
 * ## What each block measures
 *
 * - **It costs the panel nothing.** The block lives inside the buy disclosure,
 *   which has no box until the player opens it, so the arrival state is
 *   byte-identical with five purchases out and with none. That is the measurement
 *   that decided the placement: the catalogue is the only block this panel can
 *   take height from, ADR 0031 decision 3 already spends 45px of it on the queue,
 *   and its open question 4 asks whether that can go on.
 *   **Corrected 2026-08-31, issue #703 ruling 2: the block is no longer inside
 *   the buy disclosure**, so what that block of tests measures now is the
 *   identity in the state that still has one -- nothing on its way -- plus the
 *   ruling's own claim, that the spend and its `Cancel` are laid out with the
 *   fold shut, plus what the panel pays for it. The bullet is kept rather than
 *   rewritten because the argument it records is why the panel could not simply
 *   grow a third block, and that constraint has not gone away: ADR 0031's open
 *   question 4 is still open and this block still donates nothing.
 * - **Aiming.** Three deliveries, the *second* cancelled, and the assertion is
 *   about the two that were not pressed. There is no `Undo` for a purchase, so a
 *   control that cancelled "the next one" would be wrong in a way no other
 *   control could compensate for.
 * - **Reachability at 375x812**, the viewport this repository has shipped
 *   laid-out-but-unreachable controls at.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** Every viewport `ui-build-queue.spec.ts` visits, so the two surfaces are measured alike. */
const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1280, 720],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

/** One pending delivery, in the shape the projection's reader produces. */
function delivery(index: number, quantity: number) {
  return {
    orderId: `buy-${String(index).padStart(2, '0')}`,
    labelKey: 'item.brick.name',
    quantity,
    // The recorded price: `item.brick` is 40, so a row's figure is 40 × quantity
    // — written out per row rather than computed, so a row that printed the wrong
    // delivery's figure is visible.
    paidMinorUnits: quantity * 40,
  };
}

/**
 * `total` purchases out, showing the first three, which is what the reader asks
 * for and what the block draws.
 *
 * Five by default: more than the rows, so the "and N more" line is exercised in
 * the same state the reachability assertions run in -- that line is the tallest
 * version of the block and therefore the one the 337.0px box has to hold.
 */
function pending(total = 5): HudPendingDeliveriesViewModel {
  const rows = Array.from({ length: Math.min(total, 3) }, (_unused, index) => delivery(index, index + 1));
  return {
    total,
    // What every pending delivery would refund, not what the rows add up to:
    // 1..total bricks at 40 each.
    refundableMinorUnits: Array.from({ length: total }, (_unused, index) => (index + 1) * 40).reduce(
      (sum, paid) => sum + paid,
      0,
    ),
    deliveries: rows,
  };
}

async function openBuildTab(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
}

const probe = (page: Page) => page.evaluate(() => window.lockstateUiHarness.buildProbe().deliveries);
const layout = (page: Page) => page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());
const intents = (page: Page) => page.evaluate(() => window.lockstateUiHarness.hudIntents());
const report = (page: Page, model: HudPendingDeliveriesViewModel | undefined) =>
  page.evaluate((next) => window.lockstateUiHarness.reportPendingDeliveries(next), model);

test.describe('the Build panel deliveries block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => 'lockstateUiHarness' in window);
  });

  test('has no box at all until something is on the way, at every viewport', async ({ page }) => {
    /*
     * Two silences draw the same here on purpose: "nothing has asked" and "no
     * money is in transit" both have nothing to say inside a disclosure the
     * player opened in order to spend some.
     */
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openBuildTab(page);

      const nothingAsked = await probe(page);
      expect(nothingAsked.blockLaidOut, `the block has a box before anything asked at ${width}x${height}`).toBe(false);
      expect(nothingAsked.rows).toEqual([]);
      expect(nothingAsked.pending).toBeNull();

      // An answered question with nothing bought draws nothing either.
      await report(page, pending(0));
      const nonePending = await probe(page);
      expect(nonePending.blockLaidOut, `an empty list drew a box at ${width}x${height}`).toBe(false);
      expect(nonePending.rows).toEqual([]);

      // And it is still nothing with the disclosure *open*, which is the state
      // that would otherwise draw an empty box with a header and a hairline.
      expect(await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle())).toBe(true);
      const opened = await probe(page);
      expect(opened.blockLaidOut, `an empty list drew a box in the open row at ${width}x${height}`).toBe(false);
      expect(opened.countText).toBe('');

      // Non-vacuity, and it is not optional: every assertion above is about
      // something *not* being drawn, so a panel with no such block at all would
      // satisfy all of them. Measured -- against the panel before this surface
      // existed, the three assertions above passed and this one failed.
      await report(page, pending(5));
      const bought = await probe(page);
      expect(bought.blockLaidOut, `a non-empty list drew nothing at ${width}x${height}`).toBe(true);
      expect(bought.rows.length, `a non-empty list drew no rows at ${width}x${height}`).toBe(3);
    }
  });

  test('is drawn with the disclosure closed, and costs the panel nothing while nothing is on the way (#703)', async ({
    page,
  }) => {
    /*
     * **This test used to assert the opposite, and both halves are kept.** Until
     * 2026-08-31 it was named *"costs the panel nothing while the disclosure is
     * closed, which is what decided the placement"* and it asserted an identity:
     *
     * > A block of its own -- the shape ADR 0031 gave the queue -- costs 45px
     * > whenever it is non-empty, and the only block this panel can take that
     * > from is the catalogue, which is already down to one row of twenty-one at
     * > 900x600 while a queue exists. This block lives inside a row that has no
     * > box until it is opened, so there is nothing to pay for and nothing to
     * > donate: the panel's arrival geometry with five purchases out is
     * > identical to its arrival geometry with none.
     *
     * Issue #703 ruling 2 overturned that placement: *"The spent amount and the
     * control that reverses it both come out of the Buy fold."* #640 made a
     * placement press buy its own materials, so "five purchases out" stopped
     * being a state the player put the panel in, and the identity above was
     * bought by painting a charge nobody ordered into a 0x0 box.
     *
     * **So the identity is not deleted, it is moved to the state where it is
     * still true**: nothing on its way. That is the arrival state and the common
     * one, `paintDeliveries` is what keeps it, and it is now the only mechanism
     * doing so rather than the second of two. What replaces the old claim for a
     * *pending* delivery is the ruling itself, asserted as boxes, plus the cost
     * stated rather than hidden -- the panel absorbs the block by growing or by
     * scrolling, and this says which.
     *
     * Figures are read rather than pinned, for the reason the old comment gave:
     * this harness gives the panel the whole rail (128.7px more than the
     * application does), so only the differences are the claim.
     * `build-deliveries-outside-the-fold.spec.ts` takes the same measurement on
     * the assembled page, where the absolutes are real.
     */
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openBuildTab(page);

      const before = await layout(page);
      await report(page, pending(5));
      const after = await layout(page);
      const at = `${width}x${height}`;

      // The ruling: laid out, with the disclosure never touched.
      const closed = await probe(page);
      expect(closed.blockLaidOut, `the block has no box while the fold is shut at ${at}`).toBe(true);
      expect(closed.pending, `the block does not carry the count at ${at}`).toBe('5');
      expect(closed.rows, `the block drew no rows while the fold is shut at ${at}`).toHaveLength(3);
      for (const row of closed.rows) {
        expect(row.cancelHasOffsetParent, `${row.orderId}'s cancel has no offsetParent at ${at}`).toBe(true);
        expect(row.cancelBox?.height ?? 0, `${row.orderId}'s cancel is shorter than a tap target at ${at}`).toBeGreaterThanOrEqual(44);
        expect(row.cancelBox?.width ?? 0, `${row.orderId}'s cancel is narrower than a tap target at ${at}`).toBeGreaterThanOrEqual(44);
        expect(row.cancelDisabled, `${row.orderId}'s cancel is disabled at ${at}`).toBe(false);
      }

      // What it costs, said out loud: the panel either grew or started
      // scrolling. Either is the panel absorbing its own content, which is what
      // `overflow-y: auto` on `.ui-panel.hud-build` is for; nothing changing at
      // all would mean the block still has no box.
      expect(
        (after.panel?.height ?? 0) > (before.panel?.height ?? 0) || after.panelOverflow > before.panelOverflow,
        `the panel absorbed the block without growing or scrolling at ${at}`,
      ).toBe(true);
      // The panel is still the panel: the catalogue keeps at least its floor and
      // the numeric fallback is still the last section a player can see.
      expect(after.rows, `the catalogue lost a row from its list at ${at}`).toBe(before.rows);
      expect(after.lastSectionHeaderText, `the panel's last visible section at ${at}`).toBe('Enter coordinates');

      // And the identity that survived the ruling, in the state it survived in:
      // with nothing on its way the panel is byte-identical to the panel that
      // was never told about a delivery at all.
      await report(page, pending(0));
      const emptied = await layout(page);
      expect((await probe(page)).blockLaidOut, `an empty list kept a box at ${at}`).toBe(false);
      expect(emptied, `the panel did not return to its arrival geometry at ${at}`).toEqual(before);
    }
  });

  test('states the whole list and the whole refund rather than the rows it drew', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBuildTab(page);
    await report(page, pending(5));
    expect(await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle())).toBe(true);

    const block = await probe(page);
    expect(block.blockLaidOut).toBe(true);
    expect(block.pending).toBe('5');
    expect(block.rows).toHaveLength(3);
    // Five purchases of 1..5 bricks at 40 is 600. A header built from the three
    // rows it drew would say 3 and 240 -- understating both the count and the
    // money by the same two purchases.
    expect(block.countText).toBe('5 bought · 600 back if cancelled');
    // The tail is counted rather than hidden: two behind three.
    expect(block.moreText).toContain('2');
    expect(block.moreText).not.toMatch(/^hud\./);
  });

  test('says what each delivery gives back, in words and figures rather than dotted keys', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBuildTab(page);
    await report(page, pending(5));
    await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());

    const block = await probe(page);
    expect(block.rows.map((row) => row.orderId)).toEqual(['buy-00', 'buy-01', 'buy-02']);
    // One, two and three bricks at 40: the figures a player is deciding on, and
    // each row's own.
    expect(block.rows.map((row) => row.labelText)).toEqual([
      '1 × Brick · 40 back',
      '2 × Brick · 80 back',
      '3 × Brick · 120 back',
    ]);
    for (const row of block.rows) {
      expect(row.labelText, `${row.orderId} renders a raw key`).not.toMatch(/^hud\./);
      expect(row.cancelAccessibleName, `${row.orderId}'s cancel does not name what it refunds`).toContain(row.labelText);
    }
    // Three buttons reading "Cancel" are one control repeated to a screen reader.
    expect(new Set(block.rows.map((row) => row.cancelAccessibleName)).size).toBe(3);
  });

  test('opens to reachable cancel controls at 375x812, which is the viewport this repository has shipped unreachable ones at', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openBuildTab(page);
    await report(page, pending(5));
    expect(await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle())).toBe(true);

    const block = await probe(page);
    const box = await layout(page);
    expect(block.rows).toHaveLength(3);

    for (const row of block.rows) {
      // The three answers #220 taught this repository to demand, per control:
      // an `offsetParent`, a box, and a box that is a tap target.
      expect(row.cancelHasOffsetParent, `${row.orderId}'s cancel has no offsetParent`).toBe(true);
      expect(row.cancelBox, `${row.orderId}'s cancel has no box`).not.toBeNull();
      expect(row.cancelBox?.height ?? 0, `${row.orderId}'s cancel is shorter than a tap target`).toBeGreaterThanOrEqual(
        44,
      );
      expect(row.cancelBox?.width ?? 0, `${row.orderId}'s cancel is narrower than a tap target`).toBeGreaterThanOrEqual(
        44,
      );
      expect(row.cancelDisabled, `${row.orderId}'s cancel is disabled`).toBe(false);
      expect(
        row.cancelBox?.bottom ?? Number.POSITIVE_INFINITY,
        `${row.orderId}'s cancel is below the panel's fold`,
      ).toBeLessThanOrEqual(box.panelVisibleBottom);
      expect(row.cancelBox?.bottom ?? Number.POSITIVE_INFINITY, `${row.orderId}'s cancel is off the viewport`).toBeLessThanOrEqual(812);
      expect(row.cancelBox?.right ?? Number.POSITIVE_INFINITY, `${row.orderId}'s cancel overflows the panel`).toBeLessThanOrEqual(375);
    }

    // The rows do not overlap: three controls stacked on one another would pass
    // every per-row assertion above and be one control to a finger.
    expect(new Set(block.rows.map((row) => row.cancelBox?.bottom ?? 0)).size).toBe(3);
  });

  test('leaves every revealed cancel inside the panel at every viewport, scrolling to them where it has to', async ({
    page,
  }) => {
    /*
     * The property the row limit is a measurement of, asserted as a property
     * rather than as a per-viewport number -- `ui-build-queue.spec.ts` records
     * what asserting the number costs when a real fix falsifies it.
     *
     * The vacuity guard is the second half: if no viewport overflowed, the
     * disclosure's scroll branch never ran and this test would pass without
     * exercising what it is named for.
     */
    const overflowed: string[] = [];

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openBuildTab(page);
      await report(page, pending(5));
      await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());

      const box = await layout(page);
      const block = await probe(page);
      expect(block.rows, `the open disclosure drew no rows at ${width}x${height}`).toHaveLength(3);
      if (box.panelOverflow > 0) overflowed.push(`${width}x${height}:${box.panelOverflow}`);

      for (const row of block.rows) {
        expect(row.cancelHasOffsetParent, `${row.orderId}'s cancel has no offsetParent at ${width}x${height}`).toBe(
          true,
        );
        expect(
          row.cancelBox?.bottom ?? Number.POSITIVE_INFINITY,
          `${row.orderId}'s cancel is below the panel's fold at ${width}x${height}`,
        ).toBeLessThanOrEqual(box.panelVisibleBottom);
        expect(
          row.cancelBox?.y ?? Number.NEGATIVE_INFINITY,
          `${row.orderId}'s cancel is above the panel's top at ${width}x${height}`,
        ).toBeGreaterThanOrEqual(box.panel?.y ?? 0);
      }

      // The buy control the player came for is still reachable too: revealing the
      // deliveries must not push what buys off the screen.
      const buy = await page.evaluate(() => {
        const button = document.querySelector('.hud-build__buy-submit');
        if (button === null) return null;
        const rect = button.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      });
      expect(buy, `the buy button vanished at ${width}x${height}`).not.toBeNull();
      expect(buy?.bottom ?? Number.POSITIVE_INFINITY, `the buy button is below the fold at ${width}x${height}`).toBeLessThanOrEqual(
        box.panelVisibleBottom,
      );
    }

    expect(
      overflowed.length,
      'no viewport put the open disclosure past the panel\'s box, so the scrolling this test is named for never happened',
    ).toBeGreaterThan(0);
  });

  test('cancels the delivery that was pressed and leaves the others paid for', async ({ page }) => {
    /*
     * The load-bearing behavioural test, and the reason it presses the **second**
     * row: a control that cancelled "the next one to arrive" would pass a
     * one-row test. Unlike a build order there is no `Undo` to fall back on, so
     * a mis-aimed refund has no recovery.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await openBuildTab(page);
    await report(page, pending(5));
    await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());

    expect(await page.evaluate(() => window.lockstateUiHarness.pressPendingDeliveryCancel('buy-01'))).toBe(true);

    await expect
      .poll(async () => (await intents(page)).filter((intent) => intent.includes('cancel-material-purchase')))
      .toEqual([JSON.stringify({ kind: 'cancel-material-purchase', orderId: 'buy-01' })]);

    // One intent, for one purchase, and not a build-order cancellation: the two
    // name different records and the panel must never substitute one for the
    // other.
    const recorded = await intents(page);
    expect(recorded.filter((intent) => intent.includes('cancel-build-order'))).toEqual([]);
    expect(recorded.filter((intent) => intent.includes('"undo"'))).toEqual([]);

    // Nothing changed locally: the panel waits for the next publication rather
    // than optimistically dropping the row, exactly as buying waits for the
    // balance to move.
    expect((await probe(page)).rows.map((row) => row.orderId)).toEqual(['buy-00', 'buy-01', 'buy-02']);

    // And when the simulation's answer arrives, the block follows it.
    await report(page, {
      total: 4,
      refundableMinorUnits: 520,
      deliveries: [delivery(0, 1), delivery(2, 3)],
    });
    const settled = await probe(page);
    expect(settled.rows.map((row) => row.orderId)).toEqual(['buy-00', 'buy-02']);
    expect(settled.countText).toContain('4');
    // The third pooled row is repainted away rather than left holding a dead
    // purchase id: a stale row is a control promising a refund nothing will make.
    expect(settled.rows).toHaveLength(2);
  });

  test('re-aims a pooled row at the delivery that is in it now, not the one that was', async ({ page }) => {
    /*
     * The defect a pooled row buys with one hand and could give back with the
     * other. The rows are created once and repainted per publication -- which is
     * what keeps the HUD's busy group, `add` with no `remove`, from growing over a
     * session -- so a cancel handler that captured its id at construction would
     * refund whichever delivery sat in that row two seconds ago.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBuildTab(page);
    await report(page, pending(5));
    await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());

    // The first delivery lands, so every row shifts up one.
    await report(page, {
      total: 4,
      refundableMinorUnits: 560,
      deliveries: [delivery(1, 2), delivery(2, 3), delivery(3, 4)],
    });
    expect((await probe(page)).rows.map((row) => row.orderId)).toEqual(['buy-01', 'buy-02', 'buy-03']);

    // Pressing the first row now cancels `buy-01`, which is what is in it --
    // never `buy-00`, which is what was.
    expect(await page.evaluate(() => window.lockstateUiHarness.pressPendingDeliveryCancel('buy-01'))).toBe(true);
    await expect
      .poll(async () => (await intents(page)).filter((intent) => intent.includes('cancel-material-purchase')))
      .toEqual([JSON.stringify({ kind: 'cancel-material-purchase', orderId: 'buy-01' })]);
  });

  test('can be pressed with the disclosure closed, and that is the whole of #703 ruling 2', async ({ page }) => {
    /*
     * **This test asserted the exact opposite until 2026-08-31, and the old
     * assertion is worth keeping in view.** It was named *"cannot be pressed
     * through the closed disclosure, so it reaches no purchase"* and it read:
     *
     * > The other half of #220's lesson: a control inside a `hidden` row is in
     * > the DOM and is not on screen. This is also the stated cost of the
     * > placement -- while the disclosure cannot be opened, the refunds cannot
     * > be reached.
     *
     * Both sentences were true and the second was a cost the owner declined to
     * go on paying (issue #703 ruling 2). The mechanism it describes is
     * unchanged -- `pressPendingDeliveryCancel` still refuses on a null
     * `offsetParent`, so this is a press that reached a control a player can
     * see, not a synthetic `click()` through a `hidden` subtree.
     *
     * 375x812 because that is the viewport this repository has shipped
     * laid-out-but-unreachable controls at, and the tightest one this block is
     * measured in.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await openBuildTab(page);
    await report(page, pending(5));

    expect(await page.evaluate(() => window.lockstateUiHarness.pressPendingDeliveryCancel('buy-01'))).toBe(true);
    await expect
      .poll(async () => (await intents(page)).filter((intent) => intent.includes('cancel-material-purchase')))
      .toEqual([JSON.stringify({ kind: 'cancel-material-purchase', orderId: 'buy-01' })]);
    // The fold really was shut for all of that: the press is not a disclosure
    // being opened by a side effect.
    expect(
      await page.evaluate(() => document.querySelector<HTMLElement>('.hud-build__buy')?.hidden ?? false),
      'the buy disclosure was open, so this proves nothing about a closed one',
    ).toBe(true);
  });

  test('takes the block off when the tab leaves, rather than leaving ids nothing answers for', async ({ page }) => {
    /*
     * Nothing refreshes the list from another tab -- `src/main.ts` only asks while
     * the Build tab is showing -- so a block left behind would promise refunds for
     * deliveries that may already have landed.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBuildTab(page);
    await report(page, pending(5));
    await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());
    expect((await probe(page)).blockLaidOut).toBe(true);

    await page.evaluate(() => window.lockstateUiHarness.clickTab('rooms'));
    expect((await probe(page)).blockLaidOut).toBe(false);

    // Coming back shows nothing until the host answers again, which is the honest
    // state: this thread has not asked yet.
    await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
    const returned = await probe(page);
    expect(returned.blockLaidOut).toBe(false);
    expect(returned.rows).toEqual([]);
  });

  test('keeps its rows reachable while a queue is also on the panel', async ({ page }) => {
    /*
     * The two surfaces share a panel and their heights interact: a queue takes
     * 45px out of the catalogue's floor (ADR 0031 decision 3), and the disclosure
     * below it still has to fit. Measured at 900x600, which is where the panel's
     * budget is tightest.
     */
    await page.setViewportSize({ width: 900, height: 600 });
    await openBuildTab(page);
    await page.evaluate(
      (model) =>
        window.lockstateUiHarness.reportPendingDeliveries(model, {
          total: 6,
          started: 1,
          orders: [
            { orderId: 'order-00', labelKey: 'hud.build.buildable.wall-brick', tile: { x: 4, y: 4 }, edge: 'north', state: 'in-progress', cancelRefundMinorUnits: 0 },
            { orderId: 'order-01', labelKey: 'hud.build.buildable.wall-brick', tile: { x: 4, y: 5 }, edge: 'north', state: 'assigned', cancelRefundMinorUnits: 80 },
            { orderId: 'order-02', labelKey: 'hud.build.buildable.wall-brick', tile: { x: 4, y: 6 }, edge: 'north', state: 'assigned', cancelRefundMinorUnits: 80 },
          ],
          materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0 },
        }),
      pending(5),
    );
    await page.evaluate(() => window.lockstateUiHarness.clickBuyToggle());

    const box = await layout(page);
    const block = await probe(page);
    const queue = await page.evaluate(() => window.lockstateUiHarness.buildProbe().queue);

    // Both surfaces are on the panel at once, and the queue is the one that is
    // paid for -- so the catalogue is on its one-row floor while the deliveries
    // block costs nothing.
    expect(queue.sectionLaidOut).toBe(true);
    expect(block.rows).toHaveLength(3);

    for (const row of block.rows) {
      expect(row.cancelHasOffsetParent, `${row.orderId}'s cancel has no offsetParent beside a queue`).toBe(true);
      expect(
        row.cancelBox?.bottom ?? Number.POSITIVE_INFINITY,
        `${row.orderId}'s cancel is below the panel's fold beside a queue`,
      ).toBeLessThanOrEqual(box.panelVisibleBottom);
    }
  });
});
