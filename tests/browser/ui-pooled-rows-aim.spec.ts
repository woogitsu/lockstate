import { expect, test, type Page } from './network-changed-fixture';
import type { HudHeldGuardsViewModel, HudPendingDeliveriesViewModel } from '../../src/ui/hud/view-model';

/**
 * **The other two pooled lists fire at what they named** — the Build panel's
 * pending deliveries and the Staff panel's held guards.
 *
 * ## Why this file exists
 *
 * `src/ui/hud/pooled-row-binding.ts`'s header names four HUD blocks that draw a
 * fixed pool of rows and put a destructive control on each: the Build panel's
 * queue, its pending deliveries, the Staff panel's held guards and its roster.
 * Two of them were fixed and gated — the queue by #860
 * (`playtest-860-a-row-cancels-what-it-named.playtest.ts`) and the roster by
 * #877 (`ui-staff-dismiss.spec.ts`). **The other two were named by #877 and
 * left index-bound**, and that issue's own closing comment says so in as many
 * words: *"`paintHeld` and `paintDeliveries` are **not yet measured** — the
 * pass was cut off by a transient API overload before reaching them."*
 *
 * This file is the gate for the substitution that closes them. It is built the
 * way `ui-staff-dismiss.spec.ts` is and for the same reasons, which that file's
 * header argues at length and this one does not repeat:
 *
 * - **`ui-harness.html`, not the application.** The two publications differ by
 *   precisely the change under test, with no clock, tick lead or projection
 *   cadence in the way. #877's own measuring pass spent four runs failing to get
 *   a real prison into the state a delivery landing produces.
 * - **`page.mouse.click` at a box captured by the same read that captured the
 *   label, never a locator.** A locator re-resolves `[data-delivery]`
 *   immediately before the click and would follow the subject wherever the pool
 *   moved it, which is the one thing a player cannot do. A player reads a label,
 *   decides, and puts the pointer where the control *was*.
 * - **The harm is asserted before the mechanism.** What a player suffers is the
 *   wrong purchase refunded or the wrong guard released; a gate whose first red
 *   is about a `data-delivery` array would report the mechanism instead.
 *
 * ## What each list loses its head to, which is why neither needs a press
 *
 * The queue re-points when the crew finishes a wall. These two re-point on the
 * simulation's own clock with the player touching nothing:
 *
 * - a **delivery** leaves the window by *landing*, `PROCUREMENT_DELIVERY_DELAY_TICKS`
 *   after the purchase was consumed, and the rows are the three landing soonest;
 * - a **hold** ends when the search or the incident response that owns the guard
 *   does.
 *
 * So the exposure is not confined to the player who presses twice: it is any
 * player who reads a row and takes a second to decide.
 *
 * ## What was watched going red
 *
 * The table is in this file's commit message and in the report that accompanied
 * it. Each mutation restores the index binding the fix displaced, one panel at a
 * time, and is reverted by `git checkout` of that file alone.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** One pooled row, and where a press aimed at it would land. */
interface RowReading {
  /** The subject the row names — `data-delivery` or `data-guard` — or `null` on a place naming nobody. */
  readonly subject: string | null;
  /** The row's own readout, never the whole row: the control's word would otherwise land inside it. */
  readonly label: string;
  /** Whether the row has a box at all — a trailing empty row has none. */
  readonly laidOut: boolean;
  /** The centre of the row's own control, in viewport coordinates. */
  readonly x: number;
  readonly y: number;
  /**
   * Whether that point is inside the window, so a press at it can reach
   * anything. This is the check a run of #877's instrument paid for: nine
   * presses at coordinates off the bottom of the page submitted nothing at all,
   * which reads exactly like the safe outcome a fix is meant to produce.
   */
  readonly pressable: boolean;
}

async function readRows(page: Page, rowSelector: string, labelSelector: string, attribute: string): Promise<readonly RowReading[]> {
  return page.evaluate(
    ([rows, readouts, attr]) =>
      [...document.querySelectorAll<HTMLElement>(rows as string)].map((row): RowReading => {
        const control = row.querySelector<HTMLButtonElement>('.ui-action');
        const readout = row.querySelector<HTMLElement>(readouts as string);
        const box = control?.getBoundingClientRect();
        const x = box === undefined ? -1 : box.left + box.width / 2;
        const y = box === undefined ? -1 : box.top + box.height / 2;
        return {
          subject: row.dataset[attr as string] ?? null,
          label: (readout?.textContent ?? '').trim(),
          laidOut: row.offsetParent !== null,
          x,
          y,
          pressable:
            box !== undefined &&
            box.width > 0 &&
            box.height > 0 &&
            x >= 0 &&
            y >= 0 &&
            x <= window.innerWidth &&
            y <= window.innerHeight,
        };
      }),
    [rowSelector, labelSelector, attribute],
  );
}

const intents = (page: Page): Promise<readonly string[]> =>
  page.evaluate(() => window.lockstateUiHarness.hudIntents());

async function intentSubjects<T>(page: Page, kind: string, field: string): Promise<readonly T[]> {
  return (await intents(page))
    .map((intent) => JSON.parse(intent) as Record<string, unknown>)
    .filter((intent) => intent['kind'] === kind)
    .map((intent) => intent[field] as T);
}

/* ==================================================================== */
/* The Build panel's pending deliveries (`paintDeliveries`)              */
/* ==================================================================== */

/**
 * Three purchases of distinguishable amounts.
 *
 * The amounts differ so the labels do: `formatPendingDeliveryText` renders the
 * quantity and the refund, and a fixture whose rows read identically could not
 * fail the assertion this file makes about *which* label was at a coordinate.
 *
 * **Derived from the order id and never from its position in the list**, which
 * the first run of this file got wrong and which matters for exactly the reason
 * the file exists: a fixture that numbered the rows by position would give the
 * same purchase a different label in the second publication, and *"the label is
 * still the one that was read"* would then be a statement about the fixture.
 */
function deliveries(orderIds: readonly string[], total: number): HudPendingDeliveriesViewModel {
  const nth = (orderId: string): number => Number(orderId.replace('buy-', ''));
  return {
    total,
    refundableMinorUnits: orderIds.length * 1_000,
    deliveries: orderIds.map((orderId) => ({
      orderId,
      labelKey: 'item.brick.name',
      quantity: nth(orderId) * 5,
      paidMinorUnits: nth(orderId) * 1_000,
    })),
  };
}

const publishDeliveries = (page: Page, next: HudPendingDeliveriesViewModel): Promise<void> =>
  page.evaluate((model) => {
    window.lockstateUiHarness.reportPendingDeliveries(model);
  }, next);

test.describe('a delivery row refunds the purchase it named (#877)', () => {
  /*
   * Tall enough that all three rows are inside the window without scrolling.
   * `.ui-panel.hud-build` is `overflow-y: auto`, and a press at a coordinate
   * off the bottom of the page submits nothing — which is indistinguishable
   * from the fix working.
   */
  test.use({ viewport: { width: 1_280, height: 1_024 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
  });

  test('a press reaches the purchase whose label was at that coordinate, not whatever landing moved there', async ({
    page,
  }) => {
    /*
     * **Five pending, three of them drawn**, and the totals below are chosen so
     * that the "and N more" line is present in *both* publications and under
     * *either* binding. That is not tidiness: it is what isolates the binding
     * from the geometry, and the first run of this file against the restored
     * index binding proved it necessary.
     *
     * With a 4 -> 3 total the line goes from *"and 1 more"* to hidden across the
     * publication when the rows are bound by position, the panel loses a line of
     * `--font-size-eyebrow`, every row moves, and the press at the read
     * coordinate landed back on the purchase it had been aimed at **by
     * accident**. The gate went red on the places below rather than on the
     * command, which is the mechanism reported instead of the harm. With the
     * line standing either way, the press is a measurement of the binding alone.
     */
    await publishDeliveries(page, deliveries(['buy-1', 'buy-2', 'buy-3'], 5));

    const before = await readRows(page, '.hud-build__delivery-row', '.hud-build__delivery-label', 'delivery');
    expect(
      before.map((row) => row.subject),
      'the deliveries block did not draw its three purchases',
    ).toEqual(['buy-1', 'buy-2', 'buy-3']);
    expect(
      before.every((row) => row.pressable),
      `a row control is not inside the window, so a press at it would reach nothing: ${JSON.stringify(before.map((row) => [row.subject, row.x, row.y]))}`,
    ).toBe(true);

    const aimedAt = before[1]!;
    expect(aimedAt.subject, 'the second place is not the one that named buy-2').toBe('buy-2');
    const labelRead = aimedAt.label;
    expect(labelRead.length, 'the row the press is aimed at has no readout').toBeGreaterThan(0);

    // The list as it is the moment `buy-1` has landed: it leaves the window and
    // the fourth purchase comes in behind. Nothing else about the prison
    // changes, and the player pressed nothing to cause it.
    await publishDeliveries(page, deliveries(['buy-2', 'buy-3', 'buy-4'], 4));

    const after = await readRows(page, '.hud-build__delivery-row', '.hud-build__delivery-label', 'delivery');

    await page.mouse.click(aimedAt.x, aimedAt.y);

    /*
     * The whole of it in one line. Restoring `shown.deliveries[index]` makes
     * this read `['buy-3']`: the press refunds a different purchase, for a
     * different amount, than the label the player read.
     */
    expect(
      await intentSubjects<string>(page, 'cancel-material-purchase', 'orderId'),
      'the press did not cancel the purchase the row named',
    ).toEqual(['buy-2']);

    /*
     * And the mechanism, stated as the places rather than as the list: `buy-2`
     * is still in the second place and `buy-3` in the third, and the place
     * `buy-1` was in names nothing. Under the index binding this reads
     * `['buy-2', 'buy-3', 'buy-4']` — every place re-pointed by one landing.
     */
    expect(
      after.map((row) => row.subject),
      'a landing re-pointed the places under the player',
    ).toEqual([null, 'buy-2', 'buy-3']);
    /*
     * And the freed place kept its **box** while a place after it was occupied:
     * hiding it would slide the two rows below it up a row's height into
     * whatever pointer was resting there, which is the same harm by geometry
     * rather than by binding.
     */
    expect(
      after.map((row) => row.laidOut),
      'the freed place gave its box up, so the rows below it moved under the pointer',
    ).toEqual([true, true, true]);
    /* And it names nothing rather than naming the arriving purchase quietly. */
    expect(after[0]!.label, 'the held-open place still carries a label').toBe('');
    /*
     * And the place did not move. The "and N more" line is counted against the
     * rows actually drawn for this reason as well as for the sentence's: a count
     * that flipped that line between the read and the press would take a line of
     * `--font-size-eyebrow` out of the panel and move every row in it.
     */
    expect(
      Math.abs(after[1]!.y - aimedAt.y),
      'the second place moved between the read and the press, so a press at the read coordinate is aimed at a different row',
    ).toBeLessThan(1);
    /* And the label the player read is still the label at that coordinate. */
    expect(after[1]!.label, 'the second place reads differently than when it was read').toBe(labelRead);
  });
});

/* ==================================================================== */
/* The Staff panel's held guards (`paintHeld`)                           */
/* ==================================================================== */

/**
 * Three held guards, each held by a different thing so the labels differ.
 *
 * The claim is chosen by the guard's own id rather than by its place in the
 * list, for the reason the deliveries fixture above derives its amounts that
 * way: a label that changed with the position would make the place-holding
 * assertions statements about the fixture.
 */
const CLAIMS = ['guard-claim.search.name', 'guard-claim.incident-response.name', 'guard-claim.post.name'] as const;

function heldGuards(entityIds: readonly number[], held: number): HudHeldGuardsViewModel {
  return {
    held,
    unassigned: 0,
    guards: entityIds.map((entityId) => ({
      entityId,
      claimLabelKey: CLAIMS[entityId % CLAIMS.length]!,
      roleLabelKey: 'staff-role.guard.name',
    })),
  };
}

const publishHeld = (page: Page, next: HudHeldGuardsViewModel): Promise<void> =>
  page.evaluate((model) => {
    window.lockstateUiHarness.reportHeldGuards(model);
  }, next);

test.describe('a release row frees the guard it named (#877)', () => {
  test.use({ viewport: { width: 1_280, height: 1_024 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);
  });

  test('a press reaches the guard whose label was at that coordinate, not whoever the list moved there', async ({
    page,
  }) => {
    // Five held, three of them drawn, for the reason the deliveries fixture
    // above states at length: the overflow line stands in both publications and
    // under either binding, so the press measures the binding and not the
    // panel's height.
    await publishHeld(page, heldGuards([1, 2, 3], 5));

    const before = await readRows(page, '.hud-staff__held > .hud-staff__held-list .hud-staff__held-row', '.hud-staff__held-label', 'guard');
    expect(
      before.map((row) => row.subject),
      'the held block did not draw its three guards',
    ).toEqual(['1', '2', '3']);
    expect(
      before.every((row) => row.pressable),
      `a row control is not inside the window, so a press at it would reach nothing: ${JSON.stringify(before.map((row) => [row.subject, row.x, row.y]))}`,
    ).toBe(true);

    const aimedAt = before[1]!;
    expect(aimedAt.subject, 'the second place is not the one that named guard 2').toBe('2');

    // The block as it is the moment guard 1's hold ends on its own — the search
    // they were on finished. Guard 4 comes into the window behind them.
    await publishHeld(page, heldGuards([2, 3, 4], 4));

    const after = await readRows(page, '.hud-staff__held > .hud-staff__held-list .hud-staff__held-row', '.hud-staff__held-label', 'guard');

    await page.mouse.click(aimedAt.x, aimedAt.y);

    /*
     * Restoring `guards[index]` makes this read `[3]`: the press releases a
     * guard from a duty the player meant to leave standing.
     */
    expect(
      await intentSubjects<number>(page, 'release-guard', 'guardId'),
      'the press did not release the guard the row named',
    ).toEqual([2]);

    expect(
      after.map((row) => row.subject),
      'a hold ending re-pointed the places under the player',
    ).toEqual([null, '2', '3']);
    expect(
      after.map((row) => row.laidOut),
      'the freed place gave its box up, so the rows below it moved under the pointer',
    ).toEqual([true, true, true]);
    expect(after[0]!.label, 'the held-open place still carries a label').toBe('');
    expect(
      Math.abs(after[1]!.y - aimedAt.y),
      'the second place moved between the read and the press, so a press at the read coordinate is aimed at a different row',
    ).toBeLessThan(1);
  });
});
