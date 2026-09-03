import { type Page, expect, test } from './network-changed-fixture';
import type { HudBuildQueueViewModel } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * The Build panel's queue block, in a real browser (#348, and the surface that
 * gave `CancelBuildOrder` a producer).
 *
 * ## Why this cannot be proven below this layer
 *
 * Because the claim is that a **cancel control is pressable on a phone**, and
 * every part of that is a browser answer. The default Vitest environment is
 * `node` (`docs/TESTING.md`), so nothing headless can call `createBuildPanel` at
 * all -- and even a fake DOM could not settle it. #220 is the reason the bar is
 * this high: a message routed to the alerts list was asserted with
 * `toContainText` and was on screen at **no** viewport, because `hud.css` drops
 * `.hud__corner` at 720px and below and the section starts folded, so the row was
 * `offsetParent === null` with a 0x0 box everywhere. A rendered-text assertion
 * agreed with the defect for releases.
 *
 * A control is a worse case than a message. So every assertion here is a
 * `getBoundingClientRect` or an `offsetParent`, the press is a real `click()` on
 * a real button, and the "which order did it cancel" half is read off the intent
 * the panel dispatched rather than off the DOM.
 *
 * ## What each block measures
 *
 * - **Arrival costs nothing.** The panel has 7.8px of always-visible budget at
 *   900x600 (`buyToggle` in `build-panel.ts` measured it), so the whole design
 *   rests on the block having no box until something is queued. Measured at all
 *   six viewports.
 * - **Aiming.** Three orders, the *second* cancelled, and the assertion is about
 *   the two that were not pressed. A test that cancelled the only row would prove
 *   nothing: `Undo` already does that.
 * - **Reachability at 375x812**, which is the viewport this repository has
 *   shipped laid-out-but-unreachable controls at.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * Every viewport `ui-shell.spec.ts`'s catalogue assertions visit, plus
 * 1280x800.
 *
 * 900x600 is the one that presses: it is where the panel's arrival budget was
 * measured at 7.8px. 375x812 is the one the *feature* turns on.
 */
const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1280, 720],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

/** One order, in the shape the projection's reader produces. */
function order(index: number, state: HudBuildQueueViewModel['orders'][number]['state']) {
  return {
    orderId: `order-${String(index).padStart(2, '0')}`,
    labelKey: 'hud.build.buildable.wall-brick',
    tile: { x: 12, y: 30 + index },
    edge: index % 2 === 0 ? ('north' as const) : ('west' as const),
    state,
    // Arbitrary and fixed: this file is about the block's layout and which
    // control cancels which order, never about the figure's arithmetic --
    // `tests/unit/construction-preview-cancel-refund.test.ts` and
    // `tests/integration/construction-queue-row-pays-what-it-shows.test.ts`
    // are where that is measured.
    cancelRefundMinorUnits: 80,
  };
}

/**
 * A queue of `total` orders showing the first three, which is what the reader
 * asks for and what the block draws.
 *
 * Twelve by default: one drag along twelve edges is the gesture #348 turned into
 * a 730-tick wait, and it is the gesture this whole surface is sized for.
 */
function queueOf(total = 12): HudBuildQueueViewModel {
  return {
    total,
    started: total === 0 ? 0 : 1,
    orders: Array.from({ length: Math.min(total, 3) }, (_unused, index) =>
      order(index, index === 0 ? 'in-progress' : 'assigned'),
    ),
    // A queue that is paid for, which is what every case in this file is about:
    // these assert the window, the ids and the pooled rows. The funded state is
    // the one that leaves the block's drawing unchanged, so no case here is
    // silently measuring a shortfall it did not ask for.
    materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0 },
  };
}

/**
 * The same queue, stalled on money: the prison could not pay for `shortfall`.
 *
 * `80` is one wall segment all in -- two bricks at forty -- which is the figure
 * `tests/integration/construction-just-in-time-materials.test.ts` measures the
 * simulation producing for exactly this state. Written out here rather than
 * imported, because a fixture that took its expected value from the code under
 * test would agree with any price (`docs/TESTING.md`).
 */
function unfundedQueueOf(total = 12, shortfall = 80): HudBuildQueueViewModel {
  return { ...queueOf(total), materialsFunding: { unfunded: true, shortfallMinorUnits: shortfall, nextOrderShortfallMinorUnits: shortfall } };
}

async function openBuildTab(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
}

const probeQueue = (page: Page) => page.evaluate(() => window.lockstateUiHarness.buildProbe().queue);
const intents = (page: Page) => page.evaluate(() => window.lockstateUiHarness.hudIntents());

test.describe('the Build panel queue', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => 'lockstateUiHarness' in window);
  });

  test('has no box at all until something is queued, at every viewport', async ({ page }) => {
    /*
     * The load-bearing measurement of the whole design. The panel's
     * always-visible budget at 900x600 is 7.8px and a collapsed section is 45px,
     * so an always-drawn block was never affordable -- and an empty queue is the
     * state a player arrives in. Two silences draw the same here on purpose:
     * "nothing has asked" and "the queue is empty" both have nothing to say about
     * the queue.
     */
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openBuildTab(page);

      const nothingAsked = await probeQueue(page);
      expect(nothingAsked.sectionLaidOut, `the queue block has a box before anything asked at ${width}x${height}`).toBe(
        false,
      );
      expect(nothingAsked.rows).toEqual([]);

      // And an answered question with an empty prison draws nothing either.
      await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(0));
      const emptyQueue = await probeQueue(page);
      expect(emptyQueue.sectionLaidOut, `an empty queue draws a block at ${width}x${height}`).toBe(false);
      expect(emptyQueue.rows).toEqual([]);

      // The panel is exactly as it was: nothing scrolls, and its last visible
      // section is still the numeric fallback.
      const layout = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());
      expect(layout.panelOverflow, `the Build panel scrolls in the arrival state at ${width}x${height}`).toBe(0);
      expect(layout.lastSectionHeaderText, `the panel's last visible section at ${width}x${height}`).toBe(
        'Enter coordinates',
      );
    }
  });

  test('appears collapsed, above the fold, and states the whole queue rather than the rows it drew', async ({
    page,
  }) => {
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openBuildTab(page);
      await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(12));

      const queue = await probeQueue(page);
      const layout = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());

      expect(queue.sectionLaidOut, `the queue block has no box at ${width}x${height}`).toBe(true);
      // Collapsed, which is what keeps a queue costing a header rather than a
      // list. The rows are in the DOM and have no box.
      expect(queue.open, `the queue block arrives open at ${width}x${height}`).toBe(false);
      expect(queue.rows, `the queue block draws rows while collapsed at ${width}x${height}`).toEqual([]);

      // 45px: a 1px border-top plus a 44px header, which is what `hud.css`'s
      // body floor says a collapsed section is.
      expect(queue.sectionBox?.height, `the collapsed queue block's height at ${width}x${height}`).toBe(45);

      // Above the fold and unscrolled. A header the player has to find by
      // scrolling is a header that does not tell them the queue exists.
      expect(layout.panelScrollTop, `the Build panel is pre-scrolled at ${width}x${height}`).toBe(0);
      expect(
        queue.sectionBox?.bottom ?? Number.POSITIVE_INFINITY,
        `the collapsed queue header ends at y=${String(queue.sectionBox?.bottom)} in a panel clipped at y=${String(layout.panelVisibleBottom)} at ${width}x${height}`,
      ).toBeLessThanOrEqual(layout.panelVisibleBottom);

      // The whole queue, not the three rows behind the fold. A header built from
      // the row count would tell a player with twelve queued walls they have
      // three -- and the figure has to be *rendered*, so an unresolved
      // `hud.build.queue-count` shows up here as its own dotted key.
      expect(queue.countText, `the queue count at ${width}x${height}`).toBe('12 waiting · 1 being built');
    }
  });

  test('opens to reachable cancel controls at 375x812, which is the viewport this repository has shipped unreachable ones at', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openBuildTab(page);
    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(12));
    expect(await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue())).toBe(true);

    const queue = await probeQueue(page);
    const layout = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());
    expect(queue.open).toBe(true);
    expect(queue.rows).toHaveLength(3);

    for (const row of queue.rows) {
      /*
       * The three answers #220 taught this repository to demand, per control.
       *
       * `offsetParent` catches an ancestor with `display: none` -- the state the
       * alerts row was in at every viewport. A box catches a node that has an
       * `offsetParent` and is still 0x0. And the box has to be a *tap target*,
       * because a 4px-tall button on a phone is unreachable in the way that
       * matters even though every other assertion passes.
       */
      expect(row.cancelHasOffsetParent, `${row.orderId}'s cancel has no offsetParent`).toBe(true);
      expect(row.cancelBox, `${row.orderId}'s cancel has no box`).not.toBeNull();
      expect(row.cancelBox?.height ?? 0, `${row.orderId}'s cancel is shorter than a tap target`).toBeGreaterThanOrEqual(
        44,
      );
      expect(row.cancelBox?.width ?? 0, `${row.orderId}'s cancel is narrower than a tap target`).toBeGreaterThanOrEqual(
        44,
      );
      expect(row.cancelDisabled, `${row.orderId}'s cancel is disabled`).toBe(false);

      // Inside the panel and inside the viewport, not merely somewhere on the
      // page: a control laid out past the fold is the defect one step along.
      expect(row.cancelBox?.bottom ?? Number.POSITIVE_INFINITY, `${row.orderId}'s cancel is below the panel's fold`)
        .toBeLessThanOrEqual(layout.panelVisibleBottom);
      expect(row.cancelBox?.bottom ?? Number.POSITIVE_INFINITY, `${row.orderId}'s cancel is off the viewport`)
        .toBeLessThanOrEqual(812);
      expect(row.cancelBox?.right ?? Number.POSITIVE_INFINITY, `${row.orderId}'s cancel overflows the panel`)
        .toBeLessThanOrEqual(375);
    }

    // The rows do not overlap: three controls stacked on one another would pass
    // every per-row assertion above and be one control to a finger.
    const bottoms = queue.rows.map((row) => row.cancelBox?.bottom ?? 0);
    expect(new Set(bottoms).size).toBe(3);

    // Each row names its own order, and each button says which. Three buttons
    // reading "Cancel" are one control repeated to a screen reader.
    expect(queue.rows.map((row) => row.orderId)).toEqual(['order-00', 'order-01', 'order-02']);
    expect(new Set(queue.rows.map((row) => row.cancelAccessibleName)).size).toBe(3);
    for (const row of queue.rows) {
      expect(row.cancelAccessibleName, `${row.orderId}'s cancel does not name the order`).toContain(row.labelText);
    }
  });

  test('says what each order is waiting for, in words rather than in dotted keys', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBuildTab(page);
    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(12));
    await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue());

    const queue = await probeQueue(page);
    // The row a player is looking for and the rows behind it, told apart. The
    // words come from `build-order-state` in the simulation enum catalogue, so
    // an unlabelled state renders as `build-order-state.assigned.name` and
    // fails here.
    expect(queue.rows.map((row) => row.state)).toEqual(['in-progress', 'assigned', 'assigned']);
    for (const row of queue.rows) {
      expect(row.stateText, `${row.orderId} renders a raw key`).not.toMatch(/^build-order-state\./);
      expect(row.stateText.length).toBeGreaterThan(0);
      expect(row.labelText, `${row.orderId} renders a raw key`).not.toMatch(/^hud\./);
    }
    expect(queue.rows[0]?.stateText).not.toBe(queue.rows[1]?.stateText);

    // What it is, where it is, which edge -- and the tile is what tells two
    // walls apart, so two rows must never read the same.
    expect(new Set(queue.rows.map((row) => row.labelText)).size).toBe(3);

    // And the tail is counted rather than hidden: nine behind three.
    expect(queue.moreText).toContain('9');
  });

  test('cancels the order that was pressed and leaves the other rows alone', async ({ page }) => {
    /*
     * The load-bearing behavioural test. The **second** row is pressed, so the
     * assertion is about the two that were not: a control that cancelled "the
     * current one" or "the last one" would pass a one-row test and fail this,
     * and that control already exists -- it is `Undo`.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await openBuildTab(page);
    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(12));
    await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue());

    expect(await page.evaluate(() => window.lockstateUiHarness.pressBuildQueueCancel('order-01'))).toBe(true);

    await expect
      .poll(async () => (await intents(page)).filter((intent) => intent.includes('cancel-build-order')))
      .toEqual([JSON.stringify({ kind: 'cancel-build-order', orderId: 'order-01' })]);

    // One intent, for one order, and *not* an undo. The two are different
    // requests and the panel must never substitute one for the other.
    const recorded = await intents(page);
    expect(recorded.filter((intent) => intent.includes('"undo"'))).toEqual([]);
    expect(recorded.filter((intent) => intent.includes('cancel-build-order'))).toHaveLength(1);

    // Nothing changed locally: the panel waits for the next publication rather
    // than optimistically dropping the row, exactly as placing an order waits
    // for the wall to appear.
    const afterPress = await probeQueue(page);
    expect(afterPress.rows.map((row) => row.orderId)).toEqual(['order-00', 'order-01', 'order-02']);

    // And when the simulation's answer arrives, the block follows it -- the two
    // surviving rows are still there and still aimed at their own orders.
    await page.evaluate(
      (model) => window.lockstateUiHarness.reportBuildQueue(model),
      { total: 11, started: 1, orders: [order(0, 'in-progress'), order(2, 'assigned')], materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0 } } as HudBuildQueueViewModel,
    );
    const settled = await probeQueue(page);
    expect(settled.rows.map((row) => row.orderId)).toEqual(['order-00', 'order-02']);
    expect(settled.countText).toContain('11');
    // The third pooled row is repainted away rather than left holding a dead
    // order id: a stale row is a control aimed at something that no longer
    // exists.
    expect(settled.rows).toHaveLength(2);
  });

  test('re-aims a pooled row at the order that is in it now, not the one that was', async ({ page }) => {
    /*
     * The defect a pooled row buys with one hand and could give back with the
     * other. The rows are created once and repainted per publication -- which is
     * what keeps the HUD's busy group, `add` with no `remove`, from growing over
     * a session -- so a cancel handler that captured its id at construction
     * would cancel whatever order sat in that row two seconds ago.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBuildTab(page);
    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(12));
    await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue());

    // The queue advances: the first order finished, so every row shifts up one.
    await page.evaluate(
      (model) => window.lockstateUiHarness.reportBuildQueue(model),
      { total: 11, started: 1, orders: [order(1, 'in-progress'), order(2, 'assigned'), order(3, 'assigned')], materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0 } } as HudBuildQueueViewModel,
    );
    const advanced = await probeQueue(page);
    expect(advanced.rows.map((row) => row.orderId)).toEqual(['order-01', 'order-02', 'order-03']);

    // Pressing the first row now cancels `order-01`, which is what is in it --
    // never `order-00`, which is what was.
    expect(await page.evaluate(() => window.lockstateUiHarness.pressBuildQueueCancel('order-01'))).toBe(true);
    await expect
      .poll(async () => (await intents(page)).filter((intent) => intent.includes('cancel-build-order')))
      .toEqual([JSON.stringify({ kind: 'cancel-build-order', orderId: 'order-01' })]);
  });

  test('cannot be pressed through the fold, so a collapsed block reaches no order', async ({ page }) => {
    // The other half of #220's lesson: a control in a folded section is in the
    // DOM and is not on screen. `pressBuildQueueCancel` refuses on
    // `offsetParent`, and the real `click()` behind it would do nothing anyway.
    await page.setViewportSize({ width: 375, height: 812 });
    await openBuildTab(page);
    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(12));

    expect(await page.evaluate(() => window.lockstateUiHarness.pressBuildQueueCancel('order-01'))).toBe(false);
    expect((await intents(page)).filter((intent) => intent.includes('cancel-build-order'))).toEqual([]);
  });

  test('takes the block off when the tab leaves, rather than leaving ids nothing answers for', async ({ page }) => {
    /*
     * Nothing refreshes the queue from another tab -- `src/main.ts` only asks
     * while the Build tab is showing -- so a block left behind would be a list of
     * order ids that were true when the player walked away, and every row in it a
     * control aimed at an order that may already be a wall.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBuildTab(page);
    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(12));
    expect((await probeQueue(page)).sectionLaidOut).toBe(true);

    await page.evaluate(() => window.lockstateUiHarness.clickTab('rooms'));
    expect((await probeQueue(page)).sectionLaidOut).toBe(false);

    // Coming back shows nothing until the host answers again, which is the
    // honest state: this thread has not asked yet.
    await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));
    const returned = await probeQueue(page);
    expect(returned.sectionLaidOut).toBe(false);
    expect(returned.rows).toEqual([]);
  });

  test('leaves every revealed cancel inside the panel, scrolling to them where it has to', async ({ page }) => {
    /*
     * The property, and it is deliberately stated as one rather than as a
     * per-viewport number, because **this test's first version asserted a
     * number and the fix for a real defect falsified it.** It required the
     * opened block to push the panel into overflow at 1280x720, which it did --
     * by 42px -- until `.hud-build[data-queued]` made the catalogue donate 44px
     * to keep the collapsed header above the fold on the assembled page. The
     * donation is a floor, so the harness's taller panel then had room for the
     * whole open block and the overflow went to 0. A green suite would have said
     * nothing about that; this one went red, which is the assertion working
     * against its own author.
     *
     * So what is asserted is what a player needs: every cancel is inside the
     * panel's visible box after the fold is opened, and *where* the panel has
     * more content than box, opening scrolled it all the way -- which is the buy
     * row's own behaviour (`paintBuy`) and legitimate for the same reason, that
     * the player opened it.
     *
     * The vacuity guard is the second half. If no viewport in the sweep overflows
     * at all, the scroll branch never runs and this test would pass without
     * exercising the thing it is named for, so the viewports that did overflow
     * are collected and required to be non-empty.
     */
    const overflowed: string[] = [];

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openBuildTab(page);
      await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(12));
      await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue());

      const layout = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());
      const queue = await probeQueue(page);
      expect(queue.open, `the fold did not open at ${width}x${height}`).toBe(true);
      expect(queue.rows, `the open fold drew no rows at ${width}x${height}`).toHaveLength(3);

      if (layout.panelOverflow > 0) {
        overflowed.push(`${width}x${height}:${layout.panelOverflow}`);
        // All the way, not merely somewhere: `scrollIntoView({ block: 'nearest' })`
        // on the section brings its *bottom* edge in, and the last row's cancel is
        // the thing at that edge.
        expect(
          layout.panelScrollTop,
          `opening the fold did not scroll the panel to its rows at ${width}x${height}`,
        ).toBe(layout.panelOverflow);
      }

      for (const row of queue.rows) {
        expect(row.cancelHasOffsetParent, `${row.orderId}'s cancel has no offsetParent at ${width}x${height}`).toBe(
          true,
        );
        expect(
          row.cancelBox?.bottom ?? Number.POSITIVE_INFINITY,
          `${row.orderId}'s cancel is below the panel's fold at ${width}x${height}`,
        ).toBeLessThanOrEqual(layout.panelVisibleBottom);
        expect(
          row.cancelBox?.y ?? -1,
          `${row.orderId}'s cancel is above the panel's visible box at ${width}x${height}`,
        ).toBeGreaterThanOrEqual(layout.panel?.y ?? 0);
      }
    }

    expect(
      overflowed,
      'the open fold fits the panel at every viewport this sweep visits, so the scroll it is named for was never exercised. Add a shorter viewport, or this test is about nothing',
    ).not.toEqual([]);
  });

  /*
   * #629's directive, on this surface: *"a mechanic the player must discover in
   * order to proceed is a defect."* Everything below is about the word
   * **discover**.
   */
  test('says what the queue is short of with the fold still shut, which is where the last one failed (#629)', async ({
    page,
  }) => {
    /*
     * The defect this is shaped against is #625, in this exact block. *"Awaiting
     * Materials"* was present, correct, and inside `queueSection` -- which opens
     * collapsed -- so it reached nobody, and the owner met the consequence live
     * (#627): forty walls, 25,000 in the bank, nothing built.
     *
     * So the assertion is not "the sentence exists". It is that the sentence is
     * on screen **without the player opening anything**, and the test never
     * calls `toggleBuildQueue`.
     */
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openBuildTab(page);
      await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), unfundedQueueOf(12));

      const queue = await probeQueue(page);
      const layout = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());

      // Nothing was pressed, so the block is still folded. If this ever arrives
      // `true` the test has stopped measuring what it is named for.
      expect(queue.open, `the fold opened by itself at ${width}x${height}`).toBe(false);

      // The rendered sentence, with the figure substituted. An unresolved
      // `hud.build.queue-shortfall` shows up here as its own dotted key, and an
      // unsubstituted parameter shows up as a literal brace.
      //
      // "80" here is `unfundedQueueOf`'s single unfunded order, so the front
      // of the queue and the queue's total are the same figure -- the
      // divergent case is `tests/integration/construction-just-in-time-materials.test.ts`,
      // *"answers what unblocks the front of the queue, not the queue's total,
      // when a later order slips through (#771)"*.
      expect(queue.shortfallText, `the shortfall line at ${width}x${height}`).toBe(
        'Waiting for 80 to unblock the next order.',
      );

      /*
       * The three answers #220 taught this repository to demand. `.hud-build__note`
       * carries an author `display: -webkit-box` that beats `[hidden]`, so a
       * missing `.hud-build__queue-shortfall[hidden]` rule is a real failure mode
       * here in the other direction -- and an attribute read would agree with
       * either defect.
       */
      expect(queue.shortfallHasOffsetParent, `the shortfall line has no offsetParent at ${width}x${height}`).toBe(true);
      expect(queue.shortfallBox, `the shortfall line has no box at ${width}x${height}`).not.toBeNull();
      expect(queue.shortfallBox?.height ?? 0, `the shortfall line is 0px tall at ${width}x${height}`).toBeGreaterThan(0);

      // Inside the panel's visible box and unscrolled: a sentence laid out past
      // the fold is the same defect as a control laid out past it, and this one
      // is the only thing telling the player why nothing is being built.
      expect(layout.panelScrollTop, `the Build panel is pre-scrolled at ${width}x${height}`).toBe(0);
      expect(
        queue.shortfallBox?.bottom ?? Number.POSITIVE_INFINITY,
        `the shortfall line ends at y=${String(queue.shortfallBox?.bottom)} in a panel clipped at y=${String(layout.panelVisibleBottom)} at ${width}x${height}`,
      ).toBeLessThanOrEqual(layout.panelVisibleBottom);
      expect(
        queue.shortfallBox?.bottom ?? Number.POSITIVE_INFINITY,
        `the shortfall line is off the viewport at ${width}x${height}`,
      ).toBeLessThanOrEqual(height);

      // And nothing anywhere in this panel is showing a template. One
      // unsubstituted parameter is the whole of what "the number cannot render"
      // would look like on screen.
      const texts = await page.evaluate(() => window.lockstateUiHarness.buildProbe().texts);
      expect(
        texts.filter((text) => text.includes('{') || text.includes('}')),
        `unresolved message parameters in the Build panel at ${width}x${height}`,
      ).toEqual([]);
    }
  });

  test('draws the money line from the model in both directions, and never over a paid-for queue', async ({ page }) => {
    /*
     * Two claims a single publication cannot separate.
     *
     * **The figure is the model's**, not a constant: the same block is published
     * twice with different amounts and the sentence follows.
     *
     * **It withdraws.** A queue that is paid for must draw no line at all --
     * not an empty one. `.hud-build__note`'s author `display` beats `[hidden]`,
     * so "hidden" here has to mean *no box*, which is what the browser is asked.
     * A permanent empty line under the queue would be furniture bought with the
     * height ADR 0031 decision 3 already spends on this block.
     */
    await page.setViewportSize({ width: 900, height: 600 });
    await openBuildTab(page);

    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), unfundedQueueOf(12, 80));
    expect((await probeQueue(page)).shortfallText).toBe('Waiting for 80 to unblock the next order.');

    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), unfundedQueueOf(12, 240));
    expect((await probeQueue(page)).shortfallText, 'the figure is a constant, not the model').toBe(
      'Waiting for 240 to unblock the next order.',
    );

    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), queueOf(12));
    const funded = await probeQueue(page);
    expect(funded.shortfallText, 'a paid-for queue still says it is waiting for money').toBe('');
    expect(funded.shortfallLaidOut, 'the withdrawn line still has a box').toBe(false);
    expect(funded.shortfallHasOffsetParent, 'the withdrawn line still has an offsetParent').toBe(false);

    // And the queue itself is untouched by any of it: this line is beside the
    // block, never inside it.
    expect(funded.countText).toBe('12 waiting · 1 being built');
    expect(funded.sectionLaidOut).toBe(true);
  });
});
