import { expect, test, type Page } from './network-changed-fixture';

const APP_URL = '/index.html';

/**
 * The money the game spent for the player, and the control that gives it back,
 * on the page a player loads and with the *Buy* fold never touched
 * (issue #703 ruling 2).
 *
 * ## What this spec is the gate for
 *
 * The owner's ruling of 2026-08-31: *"The spent amount and the control that
 * reverses it both come out of the Buy fold."* Two alternatives were rejected
 * by name -- surfacing the amount alone and leaving the reversal behind a
 * click, and leaving both in the fold -- so this file asserts **both** halves,
 * and it asserts them as boxes.
 *
 * The state it measures is the one #640 created and no press of the player's
 * produces: a wall run buys its own materials, so the panel has pending
 * deliveries to report **without the player ever having opened the
 * procurement disclosure**. Before this ruling `deliveriesBlock` was the last
 * child of `buyRow` and `buyRow.hidden` is `true` on arrival, so the report
 * and its `Cancel` were painted into a `0x0` box:
 * `docs/research/2026-08-31-playing-the-nine-changes.md` §1b measured
 * `{"blockHidden":"false","pending":"24","visibleRows":3,"width":0,"height":0}`
 * with the fold shut, and §1c measured what that cost the refund #693 had just
 * fixed -- `locator.click` resolving to the button, then *"element is not
 * visible"* for twenty seconds.
 *
 * ## Why every assertion here is a box and an `offsetParent`
 *
 * Because the defect it guards against was **green under a text assertion**.
 * `docs/TESTING.md` states it: *"A text assertion does not imply visibility"* --
 * `toContainText` passes inside a `display: none` subtree and on a zero-size
 * box, which is exactly the shape the block had. So the questions asked below
 * are `getBoundingClientRect`, `offsetParent`, `elementFromPoint` and the
 * HUD's own `innerText`, and never the DOM alone.
 *
 * ## Why the real application and not `ui-harness.html`
 *
 * The harness leaves the rail's aside slot empty, `.hud__aside:empty {
 * display: none }` hands the Build panel the whole rail, and it is 128.7px
 * more than the application ever gives it -- the blindness that let a
 * collapsed queue block sit below the panel's fold with a green suite
 * (ADR 0031 decision 3, quoted in `app-shell.spec.ts`). A ruling about what a
 * player can see has to be measured on the page a player loads.
 *
 * ## Which viewports, and why these
 *
 * The owner's steer of the same day is that **the desktop browser comes first
 * and mobile is refined in a later pass** -- so the three desktop viewports are
 * the ones this ruling is judged at, and they lead the list.
 *
 * 900x600 and 375x812 are here anyway, and they are here because the same steer
 * says not to *break* the phone. They are the two viewports where this block
 * costs the panel the most, and what they measure is not the same claim: at
 * those two the block does not fit the panel's visible box, so what is asserted
 * of the rows below the fold is that the panel's own scroll reaches them, by
 * scrolling and re-measuring. Both were green when this spec landed; if a later
 * mobile pass changes the answer, the numbers below say what it changed from.
 */

/** Desktop first, per the owner's steer of 2026-08-31; the two tight viewports follow. */
const VIEWPORTS = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [900, 600],
  [375, 812],
] as const;

interface MeasuredBox {
  readonly width: number;
  readonly height: number;
  readonly hasOffsetParent: boolean;
  readonly hitsItself: boolean;
  /** Whether the whole box is inside the Build panel's *visible* box, not merely its scroll content. */
  readonly insideVisibleBox: boolean;
}

interface DeliveriesGeometry {
  readonly pending: string | null;
  /**
   * `HTMLElement.hidden` verbatim, and the type is `boolean | 'until-found'`
   * because the DOM's is: the attribute takes that third value. Reported as it
   * is found rather than coerced, so an element hidden the *other* way cannot be
   * read here as `true`.
   */
  readonly buyFoldHidden: boolean | 'until-found';
  readonly buyFoldBoxes: number;
  readonly buyToggleExpanded: string | null;
  readonly block: MeasuredBox | null;
  readonly count: MeasuredBox | null;
  readonly countText: string;
  readonly rows: readonly { readonly delivery: string; readonly row: MeasuredBox | null; readonly cancel: MeasuredBox | null; readonly labelText: string }[];
  readonly panelOverflow: number;
  readonly panelScrollTop: number;
  readonly hudText: string;
}

/**
 * The one measurement, taken in the page.
 *
 * `insideVisibleBox` is reported for every box rather than only asserted,
 * because "laid out" and "on screen inside a scroll container" are different
 * questions and #220 is the record of what conflating them costs.
 */
async function deliveriesGeometry(page: Page): Promise<DeliveriesGeometry | null> {
  return page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.hud-build');
    const hud = document.querySelector<HTMLElement>('.hud');
    if (panel === null || hud === null) return null;
    const panelBox = panel.getBoundingClientRect();
    const fold = panelBox.top + panel.clientTop + panel.clientHeight;
    const round = (value: number): number => Math.round(value * 10) / 10;
    const measure = (node: Element | null): MeasuredBox | null => {
      if (node === null) return null;
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        width: round(rect.width),
        height: round(rect.height),
        hasOffsetParent: (node as HTMLElement).offsetParent !== null,
        hitsItself: hit !== null && (node === hit || node.contains(hit)),
        insideVisibleBox: rect.top >= panelBox.top - 0.5 && rect.bottom <= fold + 0.5,
      };
    };
    const buyFold = document.querySelector<HTMLElement>('.hud-build__buy');
    const block = document.querySelector<HTMLElement>('.hud-build__deliveries');
    return {
      pending: block?.dataset['pending'] ?? null,
      buyFoldHidden: buyFold?.hidden ?? true,
      buyFoldBoxes: buyFold?.getClientRects().length ?? 0,
      buyToggleExpanded:
        document.querySelector<HTMLElement>('.hud-build__buy-toggle')?.getAttribute('aria-expanded') ?? null,
      block: measure(block),
      count: measure(document.querySelector('.hud-build__deliveries-count')),
      countText: document.querySelector<HTMLElement>('.hud-build__deliveries-count')?.textContent?.trim() ?? '',
      rows: [...document.querySelectorAll<HTMLElement>('.hud-build__delivery-row')]
        .filter((row) => row.hidden === false)
        .map((row) => ({
          delivery: row.dataset['delivery'] ?? '',
          row: measure(row),
          cancel: measure(row.querySelector('.ui-action')),
          labelText: row.querySelector<HTMLElement>('.hud-build__delivery-label')?.textContent?.trim() ?? '',
        })),
      panelOverflow: panel.scrollHeight - panel.clientHeight,
      panelScrollTop: panel.scrollTop,
      hudText: hud.innerText,
    };
  });
}

/** Loads the real application entry and waits for the renderer to have put a canvas on the page. */
async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
}

/**
 * A prison, the Build tool armed, and a wall run dragged on the world -- with
 * `.hud-build__buy-toggle` never pressed.
 *
 * The whole point of the route: since #640 a `PlaceBuildOrder` buys its own
 * materials, so the deliveries this produces are money the game spent for the
 * player. `playtest-just-in-time.playtest.ts` plays the same route by hand and
 * states the same rule -- nothing here opens the fold.
 *
 * The clock is started for the drag and stopped straight after the panel has
 * reported the deliveries, because `ProcurementSystem.update` runs on a tick:
 * left running, the deliveries land mid-measurement and the block correctly
 * disappears.
 */
async function buyMaterialsByBuildingAWall(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day'), 'the prison was never created').toHaveText('1');
  await page.getByRole('button', { name: 'Build' }).click();
  const arm = page.locator('.hud-build__arm');
  await expect(arm).toBeVisible();
  await arm.click();
  await expect(arm).toHaveText('Stop placing');

  await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();

  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('the viewport size is needed to aim the drag');
  const x = Math.round(viewport.width / 2);
  const y = Math.round(viewport.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + 320, y, { steps: 12 });
  await page.mouse.up({ button: 'left' });

  await expect
    .poll(async () => Number(await page.locator('.hud-build__deliveries').getAttribute('data-pending')), {
      message: 'the wall run never became pending deliveries, so there is no spend to report',
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(3);
  await page.locator('.hud-strip__transport [title="Pause"]').click();
}

test.describe('the money the game spent for the player', () => {
  test('is reported with a box, and so is its Cancel, with the Buy fold never opened (#703)', async ({ page }) => {
    await page.setViewportSize({ width: VIEWPORTS[0][0], height: VIEWPORTS[0][1] });
    await openApp(page);
    await buyMaterialsByBuildingAWall(page);

    /** Every refund a player has to scroll the panel to reach, printed at the end. */
    const belowTheFold: string[] = [];

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      const at = `${width}x${height}`;
      const geometry = await deliveriesGeometry(page);
      expect(geometry, `the Build panel is not laid out at ${at}`).not.toBeNull();
      // The numbers, printed: this spec's own measurement is the evidence the
      // ruling was implemented, and `hudText` is left out of the line because
      // it is the whole HUD.
      console.log(
        `[703] ${at} ${JSON.stringify({
          pending: geometry?.pending,
          buyFoldHidden: geometry?.buyFoldHidden,
          buyFoldBoxes: geometry?.buyFoldBoxes,
          block: geometry?.block,
          count: geometry?.count,
          countText: geometry?.countText,
          rows: geometry?.rows,
          panelOverflow: geometry?.panelOverflow,
          panelScrollTop: geometry?.panelScrollTop,
        })}`,
      );

      // The fold is untouched, which is the precondition for every assertion
      // below: this is a player who never pressed "Buy".
      expect(geometry?.buyToggleExpanded, `the buy fold was opened at ${at}`).toBe('false');
      expect(geometry?.buyFoldHidden, `the buy fold is not hidden at ${at}`).toBe(true);
      expect(geometry?.buyFoldBoxes, `the shut buy fold has a box at ${at}`).toBe(0);

      // Vacuity guard: the panel has to be reporting deliveries at all, or
      // every box assertion below is about an empty block.
      expect(Number(geometry?.pending ?? '0'), `the panel forgot the pending deliveries at ${at}`).toBeGreaterThanOrEqual(3);
      expect(geometry?.rows.length, `the block drew no rows at ${at}`).toBe(3);

      // The spent amount: a box, an `offsetParent`, and words rather than a key.
      expect(geometry?.block?.height ?? 0, `the deliveries block has no height at ${at}`).toBeGreaterThan(0);
      expect(geometry?.block?.width ?? 0, `the deliveries block has no width at ${at}`).toBeGreaterThan(0);
      expect(geometry?.block?.hasOffsetParent, `the deliveries block has no offsetParent at ${at}`).toBe(true);
      expect(geometry?.count?.height ?? 0, `the refundable total has no height at ${at}`).toBeGreaterThan(0);
      expect(geometry?.count?.hasOffsetParent, `the refundable total has no offsetParent at ${at}`).toBe(true);
      expect(geometry?.countText, `the refundable total renders a raw key at ${at}`).not.toMatch(/^hud\./);
      expect(geometry?.countText, `the refundable total states no figure at ${at}`).toMatch(/\d/);

      for (const row of geometry?.rows ?? []) {
        expect(row.row?.height ?? 0, `${row.delivery} has no height at ${at}`).toBeGreaterThan(0);
        expect(row.row?.hasOffsetParent, `${row.delivery} has no offsetParent at ${at}`).toBe(true);
        expect(row.labelText, `${row.delivery} renders a raw key at ${at}`).not.toMatch(/^hud\./);

        // And the control that reverses the spend, which is the half of the
        // ruling that a "surface the amount alone" fix would have missed.
        expect(row.cancel, `${row.delivery} has no cancel control at ${at}`).not.toBeNull();
        expect(row.cancel?.hasOffsetParent, `${row.delivery}'s cancel has no offsetParent at ${at}`).toBe(true);
        expect(row.cancel?.height ?? 0, `${row.delivery}'s cancel is shorter than a tap target at ${at}`).toBeGreaterThanOrEqual(44);
        expect(row.cancel?.width ?? 0, `${row.delivery}'s cancel is narrower than a tap target at ${at}`).toBeGreaterThanOrEqual(44);
      }

      /*
       * ---- what the ruling does *not* buy, measured rather than assumed ----
       *
       * A box is not a place on the screen. The Build panel is a scroll
       * container (`.ui-panel.hud-build`) and this block is real height it did
       * not have before, so from 1280x800 down the last rows land below the
       * panel's own fold -- one row at 1280x800 and 375x812, two of the three at
       * 900x600, which is the viewport this panel has least height at. Measured
       * on this page with six `jit:` deliveries pending from one wall run:
       *
       * | Viewport | block | panel overflow | rows inside the visible box |
       * | --- | --- | --- | --- |
       * | 1920x1080 | 238x226.9 | 0px | 3 of 3 |
       * | 1440x900 | 238x226.9 | 94px | 3 of 3 |
       * | 1280x800 | 238x226.9 | 169px | 2 of 3 |
       * | 900x600 | 238x180.5 | 178px | 1 of 3 |
       * | 375x812 | 333x213.7 | 158px | 2 of 3 |
       *
       * So the two halves are asserted separately and neither is softened.
       * **Without touching anything**, the spend and the first refund -- the
       * delivery landing soonest, whose refund is the first to stop being
       * available -- are on screen at every viewport. **The rest are reached by
       * the scroll the panel already performs**, and that is asserted by
       * scrolling and re-measuring rather than by supposing a scroll container
       * scrolls.
       */
      expect(geometry?.count?.insideVisibleBox, `the spend is not on screen at ${at}`).toBe(true);
      const first = geometry?.rows[0];
      expect(first?.cancel?.insideVisibleBox, `the first refund is not on screen at ${at}`).toBe(true);
      expect(first?.cancel?.hitsItself, `the first refund is covered by something else at ${at}`).toBe(true);

      for (const row of (geometry?.rows ?? []).filter((candidate) => candidate.cancel?.insideVisibleBox === false)) {
        belowTheFold.push(`${at}:${row.delivery}`);
        await page
          .locator(`.hud-build__delivery-row[data-delivery="${row.delivery}"] .ui-action`)
          .scrollIntoViewIfNeeded();
        const scrolled = await deliveriesGeometry(page);
        const reached = scrolled?.rows.find((candidate) => candidate.delivery === row.delivery);
        expect(
          reached?.cancel?.insideVisibleBox,
          `${row.delivery}'s cancel cannot be scrolled into the panel's visible box at ${at}`,
        ).toBe(true);
        expect(
          reached?.cancel?.hitsItself,
          `${row.delivery}'s cancel is covered by something else once scrolled to at ${at}`,
        ).toBe(true);
        expect(
          scrolled?.buyFoldBoxes,
          `the buy fold gained a box while scrolling to ${row.delivery} at ${at}`,
        ).toBe(0);
      }
      // Back where a player would find it, so the next viewport is measured
      // from the arrival scroll position rather than from this one's.
      await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('.hud-build');
        if (panel !== null) panel.scrollTop = 0;
      });

      // Rows do not sit on top of one another: three controls stacked in one
      // place would satisfy every per-row assertion above and be one control
      // to a finger.
      expect(new Set((geometry?.rows ?? []).map((row) => row.row?.height)).size, `the rows have no distinct boxes at ${at}`).toBeGreaterThan(0);
      expect(new Set((geometry?.rows ?? []).map((row) => row.delivery)).size, `two rows name the same delivery at ${at}`).toBe(3);

      // The last question, and the one a text assertion is allowed to answer
      // *because* the boxes above have already been measured: can the sentence
      // be read off the HUD without opening anything?
      const sentence = first?.labelText ?? '';
      expect(sentence, `the first row says nothing at ${at}`).not.toBe('');
      expect(geometry?.hudText ?? '', `the HUD does not read out the spend at ${at}`).toContain(sentence);
      expect(geometry?.hudText ?? '', `the HUD does not read out the refundable total at ${at}`).toContain(
        geometry?.countText ?? '',
      );
    }

    console.log(`[703] refunds that needed the panel scrolled: ${JSON.stringify(belowTheFold)}`);
  });

  test('is given back by pressing that Cancel, still with the fold never opened (#693, #703)', async ({ page }) => {
    /*
     * #693's subject is a **cancellation**: cancelling a `jit:` delivery
     * withdraws queued build orders until the prison no longer has to buy the
     * material back. The only producer of that command in the interface is the
     * `Cancel` on a delivery row, so before this ruling the fix had no reachable
     * trigger at all -- §1c of the research pass measured the click timing out
     * against a button that "is not visible".
     *
     * The figure asserted is the row's **own promise**, parsed out of the
     * sentence the panel painted, against the treasury the status strip prints.
     * Neither side is computed here: the row says what it gives back and the
     * strip says what the prison has, and this asserts that the second moved by
     * the first.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page);
    await buyMaterialsByBuildingAWall(page);

    const funds = page.locator('[data-metric="funds"] .ui-stat__value');
    const digits = (value: string): number => Number(value.replace(/\D/gu, ''));
    const before = digits((await funds.textContent()) ?? '');
    expect(before, 'the treasury reads no figure at all').toBeGreaterThan(0);

    const geometry = await deliveriesGeometry(page);
    const first = geometry?.rows[0];
    expect(first, 'there is no delivery row to cancel').not.toBeUndefined();
    expect(geometry?.buyToggleExpanded, 'the buy fold was opened').toBe('false');
    const promised = digits((first?.labelText ?? '').replace(/^\D*\d+\s*×/u, ''));
    expect(promised, `the row promises no refund: "${first?.labelText ?? ''}"`).toBeGreaterThan(0);
    const pendingBefore = Number(geometry?.pending ?? '0');

    /*
     * A real press on the real control, with the fold shut. `click()` waits for
     * actionability, so this line is itself the assertion that the button is
     * visible -- it is what timed out for twenty seconds before the ruling.
     *
     * **Pressed against a paused clock, and that is the deterministic half of
     * this test rather than a convenience.** ADR 0051 gave the worker a paused
     * drain, so a command submitted while paused is executed and acknowledged
     * without a tick -- and no tick means no delivery can *land* between the
     * measurement above and this press. Measured with the clock running
     * instead: the refund never appeared, the treasury sat at its pre-press
     * figure for the full 20s budget, and the cancel had been refused because
     * the delivery it named had already arrived. That is a real race in the
     * test, not in the panel.
     */
    await page.locator('.hud-build__delivery-row .ui-action').first().click();

    await expect
      .poll(async () => digits((await funds.textContent()) ?? ''), {
        message: 'pressing Cancel with the fold shut never credited the treasury',
        timeout: 20_000,
      })
      .toBe(before + promised);
    await expect
      .poll(async () => Number(await page.locator('.hud-build__deliveries').getAttribute('data-pending')), {
        message: 'the cancelled delivery never left the list',
        timeout: 20_000,
      })
      .toBe(pendingBefore - 1);
    // Nothing was refused: this is the credit path and not
    // `cancel-purchase.not-pending`.
    await expect(page.locator('.hud__refusal')).toBeHidden();
    // And the fold is still shut, so the whole loop happened outside it.
    await expect(page.locator('.hud-build__buy')).toBeHidden();
  });
});
