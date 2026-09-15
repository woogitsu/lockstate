import { type Page, expect, test } from './network-changed-fixture';
import type { HudBuildQueueViewModel } from '../../src/ui/hud';
import { BUILD_QUEUE_ROW_LIMIT } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * **Every order in a batch has a control a player can reach** — issue #862, in a
 * real browser.
 *
 * ## What was measured, and why this file is separate from `ui-build-queue.spec.ts`
 *
 * That file measures the queue block's *behaviour*: which row names which order,
 * what a row says, what a press cancels, and what the block costs the panel. Its
 * fixtures deliberately hand the panel a **window narrower than the queue** —
 * three rows of twelve — which is still a reachable production state, because a
 * queue longer than `BUILD_QUEUE_ROW_LIMIT` produces exactly that shape.
 *
 * This file measures the state that shape used to be produced by at *every*
 * length: a batch of fourteen orders, all of them inside the window the reader
 * now asks for. In the harness before #862, at all six viewports below:
 *
 * - collapsed, which is how the block arrives: **0 of 14** orders had a control.
 *   The rows are in the DOM, have no box, and a press on one does nothing.
 * - with the fold opened: **3 of 14**. Eleven orders had no row in the DOM at
 *   all, so eleven had nothing to press even with the fold open. `Undo` is not
 *   a substitute — it pops the transaction the run was drawn in, so one wall of
 *   fourteen back costs all fourteen.
 *
 * ## Why every assertion here is a rectangle or a hit test
 *
 * #220 is why the bar is this high, and `ui-build-queue.spec.ts`'s own header
 * records it: a message routed to the alerts list was asserted with
 * `toContainText` and was on screen at **no** viewport. A control is a worse
 * case than a message. So a row counts as reached here only when its cancel has
 * an `offsetParent`, a box of at least 44x44, a centre inside the panel's
 * *visible* box, and `document.elementFromPoint` at that centre resolving to
 * the button itself — which is a real hit test rather than an arithmetic one,
 * and the only assertion in this file that would notice something drawn over
 * the row.
 *
 * ## What makes the far rows reachable, and the guard that keeps this honest
 *
 * `.hud-build__queue-list` is a scroll container capped at three rows
 * (`hud.css`), so the eleventh row is reached by scrolling that list rather
 * than by the panel growing eleven rows taller — which it cannot, because the
 * queue's height is already bought out of the catalogue's floor and there is
 * nothing to buy it a second time. Each row is therefore scrolled into view
 * before it is measured, exactly as a player's thumb would — and *only* the way
 * a thumb would, which is `revealTheWayAPlayerCan` below rather than
 * `scrollIntoView`; see its docblock for what the difference was worth here.
 *
 * The vacuity guard is what stops that being a test about nothing: the list is
 * required to *be* over-full — `scrollHeight` greater than `clientHeight` — and
 * to be scrollable *by a player* at every viewport. If a future change made the
 * whole list fit, no scroll would happen and this file would pass without
 * exercising what it is named for.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** Every viewport `ui-build-queue.spec.ts` visits, so the two files are measured alike. */
const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1280, 720],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

/**
 * Fourteen: the batch #862 was measured on, and more than one panel-height's
 * worth at every viewport.
 *
 * A drag places up to `MAX_RUN_SEGMENTS` (64) orders in one gesture, which is
 * what `BUILD_QUEUE_ROW_LIMIT` is sized for; fourteen is a length a player
 * reaches without trying and is short enough that every row can be named in a
 * failure message.
 */
const BATCH = 14;

function order(index: number, state: HudBuildQueueViewModel['orders'][number]['state']) {
  return {
    orderId: `order-${String(index).padStart(2, '0')}`,
    labelKey: 'hud.build.buildable.wall-brick',
    // A distinct tile per order: two rows that read the same are two rows a
    // player cannot tell apart, whatever their ids say.
    tile: { x: 12, y: 30 + index },
    edge: index % 2 === 0 ? ('north' as const) : ('west' as const),
    state,
    // Fixed and arbitrary. What the figure should be is measured in
    // `tests/integration/construction-queue-row-pays-what-it-shows.test.ts`;
    // this file is about whether the control beside it can be pressed.
    cancelRefundMinorUnits: 80,
    // ADR 0107 made this a required field on the view model after this file
    // was written, and the two branches only met here. A fixed value is
    // right for this file's question: `revision` is what a Cancel press
    // carries so the worker can refuse a press aimed at a state the order
    // has already left, and this file asks whether the control can be
    // pressed at all, not what the press then pays. The refusal's own
    // behaviour is measured in
    // `tests/integration/construction-cancel-order-stale-revision.test.ts`.
    revision: 1,
  };
}

/**
 * A queue of `total` orders with the whole of it in the window, which is what
 * `BuildQueueReader` asks the projection for whenever the queue is no longer
 * than the panel's pool.
 */
function batchOf(total = BATCH): HudBuildQueueViewModel {
  return {
    total,
    started: total === 0 ? 0 : 1,
    orders: Array.from({ length: Math.min(total, BUILD_QUEUE_ROW_LIMIT) }, (_unused, index) =>
      order(index, index === 0 ? 'in-progress' : 'assigned'),
    ),
    materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0 },
  };
}

/** One row's cancel, measured where a thumb would find it. */
interface Reach {
  readonly orderId: string;
  readonly reached: boolean;
  /** Why not, in numbers, so a failure message localises without a re-run. */
  readonly detail: string;
}

async function openBuildTab(page: Page): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
}

/**
 * Scrolls each drawn row into view in turn and hit-tests its cancel there.
 *
 * One `page.evaluate` rather than a Playwright locator per row, and the reason
 * is the measurement rather than the speed: `elementFromPoint` answers "what
 * would a tap at this pixel reach" for the row that is currently scrolled to,
 * and taking all fourteen answers inside one frame keeps them comparable. The
 * behavioural half — that a real press reaches the simulation — is a genuine
 * `locator.click()` in the last case below.
 *
 * ## Why the reveal is hand-written rather than `scrollIntoView`
 *
 * `scrollIntoView` scrolls **every** scrollport between the node and the
 * viewport, `overflow: hidden` ones included, because the specification tells
 * it to. A hidden box is scrollable by script and by no gesture a player has,
 * so a row clipped out of one is certified pressable by a movement the player
 * cannot make. #1204 replaced the call in the two `app-shell.spec.ts` and
 * `operations-reachability.spec.ts` sweeps for that reason and left this one,
 * on the reading that its two extra compensations — the centre must lie inside
 * the panel's own fold, and the list is established to scroll by *moving* it —
 * already closed the hole here.
 *
 * **Measured 2026-09-15, and they do not.** With the queue list's
 * `overflow-y: auto` changed to `overflow-y: hidden` in `src/ui/hud/hud.css`
 * — eleven of fourteen rows clipped, no gesture in the game reaching them —
 * this whole file passed **5 passed (12.3s)**, every one of the fourteen rows
 * at every one of the six viewports reported reached. Neither compensation
 * fires against that mutation, and the reason is the same for both: setting
 * `scrollTop` on an `overflow: hidden` box *works*. The list moves, so the
 * vacuity guard's `scrolled > 0` is satisfied; the row is brought inside the
 * list's own box, so its centre lands inside the panel's fold and the hit test
 * answers the button. The compensations are both real and both measure the
 * wrong thing when the scroll itself is the thing in question.
 *
 * `revealTheWayAPlayerCan` walks the same ancestor chain and moves only boxes
 * whose own computed `overflow` on that axis is `auto` or `scroll`, and reads
 * the viewport on the same rule (`src/styles.css:6` is
 * `html, body { overflow: hidden }`, so on this page the window never moves).
 * It is a copy of the helper in those two files rather than an import because
 * it runs inside `page.evaluate` and is serialised into the page.
 *
 * The panel's box is also re-read per row rather than measured once before the
 * sweep, which the `scrollIntoView` version did not do: a reveal that moves any
 * ancestor of the panel moves the panel, and a stale rectangle then judges the
 * row against a fold that is no longer there.
 */
const reachOf = (page: Page): Promise<readonly Reach[]> =>
  page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.ui-panel.hud-build');
    if (panel === null) return [];

    /**
     * Whether a box with this computed `overflow` on one axis is one a player
     * can scroll on that axis. `hidden` and `clip` are not: the content is
     * outside the box and no gesture brings it in. `visible` is not either —
     * there is nothing to scroll, and the first clipping ancestor above it
     * decides whether the row is ever seen.
     */
    const playerScrollable = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll';

    /**
     * Bring `node` into view using only the scrolls a player has: innermost
     * outwards, re-reading the node's rect at each step, because scrolling an
     * inner box is what puts the node where the outer box has to judge it.
     */
    const revealTheWayAPlayerCan = (node: Element): void => {
      for (let ancestor = node.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const border = ancestor.getBoundingClientRect();
        // The *client* box, which is what `scrollTop` moves content through:
        // the border box less its borders and any scrollbar gutter.
        const top = border.top + ancestor.clientTop;
        const left = border.left + ancestor.clientLeft;
        const bottom = top + ancestor.clientHeight;
        const right = left + ancestor.clientWidth;

        if (playerScrollable(style.overflowY) && ancestor.scrollHeight > ancestor.clientHeight) {
          const rect = node.getBoundingClientRect();
          if (rect.bottom > bottom) ancestor.scrollTop += rect.bottom - bottom;
          else if (rect.top < top) ancestor.scrollTop += rect.top - top;
        }
        if (playerScrollable(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth) {
          const rect = node.getBoundingClientRect();
          if (rect.right > right) ancestor.scrollLeft += rect.right - right;
          else if (rect.left < left) ancestor.scrollLeft += rect.left - left;
        }
      }

      // And the viewport itself, on the same rule. The root's `overflow`
      // propagates to the viewport and falls through to `body` only when the
      // root is `visible`. Written out rather than assumed, because the
      // assumption is exactly the kind that rots when a stylesheet changes.
      const root = document.documentElement;
      const rootOverflowY = getComputedStyle(root).overflowY;
      const rootOverflowX = getComputedStyle(root).overflowX;
      const bodyStyle = getComputedStyle(document.body);
      const viewportOverflowY = rootOverflowY === 'visible' ? bodyStyle.overflowY : rootOverflowY;
      const viewportOverflowX = rootOverflowX === 'visible' ? bodyStyle.overflowX : rootOverflowX;
      // `visible` on the viewport is the ordinary scrolling page: it scrolls.
      const viewportScrollsY = viewportOverflowY !== 'hidden' && viewportOverflowY !== 'clip';
      const viewportScrollsX = viewportOverflowX !== 'hidden' && viewportOverflowX !== 'clip';
      const rect = node.getBoundingClientRect();
      let byX = 0;
      let byY = 0;
      if (viewportScrollsY) {
        if (rect.bottom > window.innerHeight) byY = rect.bottom - window.innerHeight;
        else if (rect.top < 0) byY = rect.top;
      }
      if (viewportScrollsX) {
        if (rect.right > window.innerWidth) byX = rect.right - window.innerWidth;
        else if (rect.left < 0) byX = rect.left;
      }
      if (byX !== 0 || byY !== 0) window.scrollBy(byX, byY);
    };

    const out: { orderId: string; reached: boolean; detail: string }[] = [];
    for (const row of [...document.querySelectorAll<HTMLElement>('.hud-build__queue-row')]) {
      if (row.hidden) continue;
      const orderId = row.dataset['order'] ?? '';
      const button = row.querySelector<HTMLButtonElement>('.ui-action');
      if (button === null) {
        out.push({ orderId, reached: false, detail: 'the row has no button' });
        continue;
      }
      revealTheWayAPlayerCan(button);
      // Read after the reveal, and per row: the panel is where the reveal has
      // left it, not where it was before the sweep started.
      const panelRect = panel.getBoundingClientRect();
      const visibleBottom = panelRect.top + panel.clientHeight;
      const rect = button.getBoundingClientRect();
      const centreX = rect.left + rect.width / 2;
      const centreY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centreX, centreY);
      const detail =
        `box=${String(Math.round(rect.width))}x${String(Math.round(rect.height))}` +
        ` centreY=${String(Math.round(centreY))} panel=${String(Math.round(panelRect.top))}..${String(Math.round(visibleBottom))}` +
        ` offsetParent=${String(button.offsetParent !== null)}` +
        ` hit=${hit === null ? 'nothing' : (hit as HTMLElement).className || (hit as HTMLElement).tagName}` +
        ` disabled=${String(button.disabled)}`;
      const reached =
        button.offsetParent !== null &&
        !button.disabled &&
        rect.width >= 44 &&
        rect.height >= 44 &&
        centreY >= panelRect.top &&
        centreY <= visibleBottom &&
        hit !== null &&
        (hit === button || button.contains(hit));
      out.push({ orderId, reached, detail });
    }
    return out;
  });

/**
 * The queue list's own scroll geometry, which is what the far rows are reached
 * through.
 *
 * `scrolled` is measured by **moving** it rather than by reading a computed
 * `overflow-y`, and that is the difference between this guard working and not:
 * with `overflow-y` deleted and the `max-height` left in place, the rows spill
 * out of the box visibly, `scrollHeight` still exceeds `clientHeight`, and
 * `scrollIntoView` reaches them by scrolling the *panel* instead — so every
 * other assertion in this file's first case still passed. Measured that way
 * while mutating the fix. A box that does not move when it is scrolled is not a
 * scroll container, whatever its heights say.
 *
 * **And moving is not sufficient either, which was measured on 2026-09-15 and
 * is why `overflowY` is reported beside `scrolled` rather than instead of it.**
 * `scrollTop` assignment moves an `overflow: hidden` box perfectly well; it is
 * the *player* who cannot move it. With `overflow-y: hidden` in place of
 * `auto`, `scrolled` came back positive at all six viewports and this guard was
 * satisfied by a list eleven of whose fourteen rows no gesture reaches. So both
 * halves are required and neither is redundant: the box must move, **and** the
 * movement must be one a player has.
 */
const listOf = (
  page: Page,
): Promise<{ scrollHeight: number; clientHeight: number; boxHeight: number; scrolled: number; overflowY: string }> =>
  page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.hud-build__queue-list');
    if (list === null)
      return { scrollHeight: -1, clientHeight: -1, boxHeight: -1, scrolled: -1, overflowY: 'no list' };
    const wasAt = list.scrollTop;
    list.scrollTop = list.scrollHeight;
    const scrolled = list.scrollTop;
    list.scrollTop = wasAt;
    return {
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      boxHeight: Math.round(list.getBoundingClientRect().height * 10) / 10,
      scrolled,
      overflowY: getComputedStyle(list).overflowY,
    };
  });

const probeQueue = (page: Page) => page.evaluate(() => window.lockstateUiHarness.buildProbe().queue);
const intents = (page: Page) => page.evaluate(() => window.lockstateUiHarness.hudIntents());

test.describe('every queued order has a control a player can reach', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => 'lockstateUiHarness' in window);
  });

  test('draws a row for every order in the batch and reaches all fourteen cancels, at every viewport (#862)', async ({
    page,
  }) => {
    test.slow();
    const overFull: string[] = [];

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await openBuildTab(page);
      await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), batchOf());
      expect(await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue())).toBe(true);

      const queue = await probeQueue(page);
      expect(queue.open, `the fold did not open at ${width}x${height}`).toBe(true);

      // A row per order, aimed at that order. Before #862 this was three, and
      // the eleven orders with no row were the whole defect.
      expect(
        queue.rows.map((row) => row.orderId),
        `the rows drawn at ${width}x${height}`,
      ).toEqual(Array.from({ length: BATCH }, (_unused, index) => `order-${String(index).padStart(2, '0')}`));

      // The tail line says nothing, because nothing is behind the list.
      expect(queue.moreText, `the queue claims a tail at ${width}x${height}`).toBe('');

      const list = await listOf(page);
      if (
        list.scrollHeight > list.clientHeight &&
        list.scrolled > 0 &&
        (list.overflowY === 'auto' || list.overflowY === 'scroll')
      ) {
        overFull.push(`${width}x${height}:${String(list.scrollHeight)}/${String(list.clientHeight)}`);
      }

      const reach = await reachOf(page);
      expect(reach, `rows measured at ${width}x${height}`).toHaveLength(BATCH);
      for (const row of reach) {
        expect(row.reached, `${row.orderId}'s cancel is out of reach at ${width}x${height} — ${row.detail}`).toBe(true);
      }
    }

    // The guard that keeps the sweep above honest: if the list fitted its
    // content at every viewport, no row was ever scrolled to and this test would
    // be measuring a three-row list under a fourteen-row name.
    expect(
      overFull.length,
      'the queue list is not an over-full scroll container a player can scroll at every viewport, so the scroll every assertion above depends on never happened — either all fourteen rows fitted, or the box does not move when it is scrolled, or its computed overflow-y says only a script can move it',
    ).toBe(VIEWPORTS.length);
  });

  test('costs the panel exactly what a three-order queue costs, however long the queue is', async ({ page }) => {
    /*
     * The substitution #862 made, asserted as the property it is: the block's
     * height is its list's **box**, not its row count. That is what let the pool
     * grow at all — the panel's own budget is 7.8px at 900x600 (`buyToggle` in
     * `build-panel.ts` measured it), and a list that grew with the queue would
     * put rows below the fold with nothing having scrolled, which is #174.
     *
     * Stated as an equality between two queues rather than as a pixel figure,
     * for the reason `ui-build-queue.spec.ts`'s own scrolling case gives: its
     * first version asserted a number and a real fix falsified it. A number
     * here would have to be re-measured every time a row's typography moved;
     * the equality holds whatever a row is.
     */
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });

      await openBuildTab(page);
      await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), batchOf(3));
      await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue());
      const three = await probeQueue(page);
      const threeLayout = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());

      await openBuildTab(page);
      await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), batchOf(BATCH));
      await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue());
      const fourteen = await probeQueue(page);
      const fourteenLayout = await page.evaluate(() => window.lockstateUiHarness.buildLayoutProbe());

      expect(three.rows, `the three-order queue drew the wrong rows at ${width}x${height}`).toHaveLength(3);
      expect(fourteen.rows, `the fourteen-order queue drew the wrong rows at ${width}x${height}`).toHaveLength(BATCH);

      expect(
        fourteen.sectionBox?.height,
        `the opened block is taller with fourteen orders than with three at ${width}x${height}`,
      ).toBe(three.sectionBox?.height);
      expect(
        fourteenLayout.panelOverflow,
        `the panel scrolls further with fourteen orders than with three at ${width}x${height}`,
      ).toBe(threeLayout.panelOverflow);
    }
  });

  test('cancels the fourteenth order when the fourteenth order is pressed, at 375x812', async ({ page }) => {
    /*
     * The behavioural half, and the press is Playwright's own `click()` rather
     * than the harness's helper: a locator click performs the actionability
     * checks — visible, stable, receives pointer events — and scrolls the
     * element into view first, which is a second opinion on the hit test above
     * from something that is not this file's arithmetic.
     *
     * The **last** order is the one pressed, because it is the one that had no
     * control at all before #862 and because a control that cancelled "the next
     * one" would pass a first-row test. 375x812 is the viewport this repository
     * has shipped laid-out-but-unreachable controls at.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await openBuildTab(page);
    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), batchOf());
    expect(await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue())).toBe(true);

    const last = `order-${String(BATCH - 1).padStart(2, '0')}`;
    // Asserted before the click, and not only for the message: a locator click
    // on a row that does not exist spends the whole 60s test timeout before it
    // says so, which is a minute of CI per failure and a stack that reads like a
    // hung page rather than a missing row.
    expect(
      (await probeQueue(page)).rows.map((row) => row.orderId),
      `no row names ${last}, so there is nothing to press`,
    ).toContain(last);
    await page.locator(`.hud-build__queue-row[data-order="${last}"] .ui-action`).click();

    await expect
      .poll(async () => (await intents(page)).filter((intent) => intent.includes('cancel-build-order')))
      // `revision` joined this intent in ADR 0107, after this file was
      // written; the two branches only met at integration. It is the order's
      // revision as the row was published at, and it is what lets the worker
      // refuse a press aimed at a state the order has already left. The
      // fixture publishes 1, so the press carries 1 -- asserted whole rather
      // than loosened to a substring, because the shape of what a press sends
      // is exactly what this file is for.
      .toEqual([JSON.stringify({ kind: 'cancel-build-order', orderId: last, revision: 1 })]);

    // One order, and not an undo. `Undo` takes the whole run back and is the
    // control #862 measured as the only one a player had for eleven of these.
    const recorded = await intents(page);
    expect(recorded.filter((intent) => intent.includes('"undo"'))).toEqual([]);
    expect(recorded.filter((intent) => intent.includes('cancel-build-order'))).toHaveLength(1);
  });

  test('states the tail and keeps every drawn row reachable when the queue is longer than the pool', async ({
    page,
  }) => {
    /*
     * The branch `hud.build.queue-more` still exists for, one gesture further
     * along: a queue longer than `BUILD_QUEUE_ROW_LIMIT` fills the pool and
     * says how many are behind it. That is the same shape the block was in at
     * *every* length before #862, which is why `ui-build-queue.spec.ts`'s
     * narrow-window fixtures are still measuring a reachable state.
     *
     * The count is what has to be right: the header states the whole queue and
     * the tail line states the whole queue minus what a row can reach, so the
     * two together never imply the queue is shorter than it is.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await openBuildTab(page);
    const longer = BUILD_QUEUE_ROW_LIMIT + 7;
    await page.evaluate((model) => window.lockstateUiHarness.reportBuildQueue(model), batchOf(longer));
    expect(await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue())).toBe(true);

    const queue = await probeQueue(page);
    expect(queue.rows, 'the pool is full').toHaveLength(BUILD_QUEUE_ROW_LIMIT);
    expect(queue.countText, 'the header states the whole queue').toContain(String(longer));
    expect(queue.moreText, 'the tail line states what is behind the pool').toContain('7');
    expect(queue.moreText, 'the tail line renders a raw key').not.toMatch(/^hud\./);

    const reach = await reachOf(page);
    expect(reach).toHaveLength(BUILD_QUEUE_ROW_LIMIT);
    for (const row of reach) {
      expect(row.reached, `${row.orderId}'s cancel is out of reach — ${row.detail}`).toBe(true);
    }
  });

  test('never claims a queue is shorter than it is, even handed more orders than it has rows for', async ({ page }) => {
    /*
     * The tail line is counted against the rows the block **can hold** and not
     * only against the window it was handed, and those are two numbers rather
     * than one. They agree by construction in the application — one constant
     * feeds both the pool and the projection window `BuildQueueReader` asks
     * for — so nothing in production can tell them apart, and that is exactly
     * why the panel must not depend on their agreeing: the guarantee lives in a
     * different module from the code that relies on it.
     *
     * Handed a longer window than its pool, which is what the harness does the
     * moment a test writes its own view model, the old line reported **nothing**
     * behind the list while every order past the pool had no row. Measured that
     * way on 2026-09-03, before the fix, at every viewport: fourteen orders in
     * the window, three rows drawn, and the tail line empty.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await openBuildTab(page);

    const beyond = BUILD_QUEUE_ROW_LIMIT + 6;
    await page.evaluate(
      (model) => window.lockstateUiHarness.reportBuildQueue(model),
      {
        total: beyond,
        started: 1,
        // Every order in the window, which is more than the pool has rows for.
        orders: Array.from({ length: beyond }, (_unused, index) =>
          order(index, index === 0 ? 'in-progress' : 'assigned'),
        ),
        materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0 },
      } satisfies HudBuildQueueViewModel,
    );
    expect(await page.evaluate(() => window.lockstateUiHarness.toggleBuildQueue())).toBe(true);

    const queue = await probeQueue(page);
    expect(queue.rows, 'the pool drew more rows than it has').toHaveLength(BUILD_QUEUE_ROW_LIMIT);
    expect(queue.countText, 'the header states the whole queue').toContain(String(beyond));
    // Six behind the pool, and the figure has to be *rendered* — an unresolved
    // `hud.build.queue-more` shows up here as its own dotted key.
    expect(queue.moreText, 'the tail line is silent about six unreachable orders').toContain('6');
    expect(queue.moreText).not.toMatch(/^hud\./);
  });
});
