import { describe, expect, it } from 'vitest';
import {
  assignPooledRows,
  type PooledRowAssignment,
  type PooledRowState,
} from '../../src/ui/hud/pooled-row-binding';

/**
 * The rule that decides which pooled HUD row names which item, at the only
 * layer it can be proved at.
 *
 * `vitest.config.ts` runs on `environment: 'node'` and there is no jsdom, so a
 * mounted Build panel is unreachable from this suite -- which is why the
 * decision these tests are about was extracted rather than left inline in
 * `paintQueue`, and why the clock is a parameter rather than a `Date.now()`
 * read. A mutation inside a paint function survives because nothing here could
 * observe it; `docs/AGENT_WORKFLOW.md` §3 records that move and why reporting
 * an unreachable survivor is not the answer.
 *
 * The property every block below is about is one sentence: **a place in the
 * list names one item for as long as that item is in the window, and a new item
 * only ever appears in a place that has been blank for the settle window.**
 * That is #860 -- a press reached an order the row's label never described,
 * because a completion re-pointed the pool between the paint the player read
 * and the click. The last block states it as a property over a whole queue
 * draining rather than as an example.
 */

const SETTLE = 1_000;

/** A pool that has never drawn anything. */
const fresh = (count: number): readonly PooledRowState[] =>
  Array.from({ length: count }, () => ({ itemId: undefined, freedAtMs: undefined }));

/** A pool holding exactly these items, none of them ever emptied. */
const holding = (...itemIds: readonly (string | undefined)[]): readonly PooledRowState[] =>
  itemIds.map((itemId) => ({ itemId, freedAtMs: undefined }));

const kinds = (assignments: readonly PooledRowAssignment[]): readonly string[] =>
  assignments.map((assignment) => assignment.kind);

/**
 * One publication, applied the way `paintQueue` applies it: the assignment
 * decides, and the caller stamps `freedAtMs` from the transition it can see --
 * a row that held an item before the call and holds none after.
 */
function publish(
  rows: readonly PooledRowState[],
  itemIds: readonly string[],
  nowMs: number,
): { readonly rows: readonly PooledRowState[]; readonly assignments: readonly PooledRowAssignment[] } {
  const assignments = assignPooledRows(rows, itemIds, nowMs, SETTLE);
  const next = rows.map((row, index): PooledRowState => {
    const assignment = assignments[index]!;
    if (assignment.kind === 'keeps' || assignment.kind === 'fills') {
      return { itemId: assignment.itemId, freedAtMs: row.freedAtMs };
    }
    return { itemId: undefined, freedAtMs: row.itemId === undefined ? row.freedAtMs : nowMs };
  });
  return { rows: next, assignments };
}

describe('assignPooledRows', () => {
  it('fills a pool that has never drawn anything with the window in the order it arrived', () => {
    expect(assignPooledRows(fresh(3), ['a', 'b', 'c'], 0, SETTLE)).toEqual([
      { kind: 'fills', itemId: 'a' },
      { kind: 'fills', itemId: 'b' },
      { kind: 'fills', itemId: 'c' },
    ]);
  });

  it('gives no box to a leading row with nothing to show', () => {
    expect(assignPooledRows(fresh(3), ['a'], 0, SETTLE)).toEqual([
      { kind: 'empty' },
      { kind: 'empty' },
      { kind: 'fills', itemId: 'a' },
    ]);
  });

  it('keeps every surviving item in the place it was already in when the head leaves', () => {
    /*
     * The defect, stated as the arithmetic that produced it. The old rule was
     * `rows[i] = items[i]`, so this publication moved `b` from row 1 to row 0
     * and `c` from row 2 to row 1 -- and a press aimed at row 1 because it said
     * `b` cancelled `c`.
     */
    expect(assignPooledRows(holding('a', 'b', 'c'), ['b', 'c', 'd'], 5_000, SETTLE)).toEqual([
      { kind: 'holds-open' },
      { kind: 'keeps', itemId: 'b' },
      { kind: 'keeps', itemId: 'c' },
    ]);
  });

  it('will not hand a place freed by this publication to the item that arrived with it', () => {
    // The case the first version of this module lost: the item the player is
    // aiming at is the one that left. Its place goes blank rather than passing
    // the press to a substitute.
    const assignments = assignPooledRows(holding('a', 'b', 'c'), ['b', 'c', 'd'], 5_000, SETTLE);
    expect(kinds(assignments)).not.toContain('fills');
  });

  it('holds the freed place blank for the whole settle window, and no longer', () => {
    /*
     * The half the re-measurement of 2026-09-03 added. One publication of
     * blankness was not enough: the queue loses its head about every 625ms at
     * 4x, so a press 600ms after reading a row was still landing on a
     * replacement that had arrived one publication later.
     */
    const freed = publish(holding('a', 'b', 'c'), ['b', 'c', 'd'], 5_000).rows;
    expect(freed[0]).toEqual({ itemId: undefined, freedAtMs: 5_000 });

    // Publications keep arriving on the clock cadence and the place stays blank.
    for (const at of [5_250, 5_500, 5_750, 5_999]) {
      expect(kinds(assignPooledRows(freed, ['b', 'c', 'd'], at, SETTLE)), `at ${String(at)}`).toEqual([
        'holds-open',
        'keeps',
        'keeps',
      ]);
    }
    // And the moment the window is up, it takes the waiting order.
    expect(assignPooledRows(freed, ['b', 'c', 'd'], 6_000, SETTLE)).toEqual([
      { kind: 'fills', itemId: 'd' },
      { kind: 'keeps', itemId: 'b' },
      { kind: 'keeps', itemId: 'c' },
    ]);
  });

  it('keeps the box of a blank place while any place after it is occupied', () => {
    /*
     * The same defect by geometry rather than by binding: dropping the box
     * would slide `c` up a row's height into whatever pointer was resting on
     * it. Only the unused leading run gives its boxes up.
     */
    const freed = publish(holding('a', 'b', 'c'), ['a', 'c'], 5_000).rows;
    expect(kinds(assignPooledRows(freed, ['a', 'c'], 9_000, SETTLE))).toEqual(['keeps', 'holds-open', 'keeps']);
  });

  it('keeps lower boxes while an item remains above them', () => {
    const freed = publish(holding('a', 'b', 'c'), ['a'], 5_000).rows;
    expect(kinds(assignPooledRows(freed, ['a'], 9_000, SETTLE))).toEqual(['keeps', 'holds-open', 'holds-open']);
  });

  it('keeps departed boxes inert until the settle window ends even when the list empties', () => {
    const freed = publish(holding('a', 'b', 'c'), [], 5_000).rows;
    expect(kinds(assignPooledRows(holding('a', 'b', 'c'), [], 5_000, SETTLE))).toEqual(['holds-open', 'holds-open', 'holds-open']);
    expect(kinds(assignPooledRows(freed, [], 5_999, SETTLE))).toEqual(['holds-open', 'holds-open', 'holds-open']);
    expect(kinds(assignPooledRows(freed, [], 6_000, SETTLE))).toEqual(['empty', 'empty', 'empty']);
    expect(kinds(assignPooledRows(fresh(3), [], 5_000, SETTLE))).toEqual(['empty', 'empty', 'empty']);
  });

  it('never aims two rows at one item, even when the producer sends it twice', () => {
    /*
     * A producer that sent a duplicate has a defect of its own, and the answer
     * here is not to draw it twice: two rows naming one order are two controls
     * that both destroy it, and the second press then reaches an order that is
     * already gone.
     */
    const assignments = assignPooledRows(fresh(3), ['a', 'a', 'b'], 0, SETTLE);
    const named = assignments.flatMap((assignment) =>
      assignment.kind === 'fills' || assignment.kind === 'keeps' ? [assignment.itemId] : [],
    );
    expect(named).toEqual(['a', 'b']);
    expect(new Set(named).size).toBe(named.length);
  });

  it('holds the invariant across a whole queue draining through a three-row pool', () => {
    /*
     * The property, not an example: twenty orders entering a three-row window
     * as the head completes, which is what the crew does to a dragged run of
     * walls. Publications land every 250ms
     * (`CLOCK_STATE_PUBLISH_INTERVAL_MS`) and the head completes every 625ms,
     * which is the 4x figure the browser run measured.
     *
     * **Two things may never happen.** No place may go from naming one item
     * straight to naming another, and no place may take a new item less than
     * the settle window after it was blanked. The same walk under the old
     * `rows[i] = items[i]` rule breaks the first on every completion.
     */
    const all = Array.from({ length: 20 }, (_item, index) => `order-${String(index).padStart(2, '0')}`);
    let rows = fresh(3);
    let head = 0;
    let repointed = 0;
    let filledTooSoon = 0;
    let publications = 0;
    let drawnAtLeastOnce = new Set<string>();

    for (let nowMs = 0; nowMs < 20_000 && head < all.length; nowMs += 250) {
      const before = rows;
      const window = all.slice(head, head + 3);
      const step = publish(before, window, nowMs);
      publications += 1;
      for (const [index, was] of before.entries()) {
        const now = step.rows[index]!;
        if (was.itemId !== undefined && now.itemId !== undefined && was.itemId !== now.itemId) repointed += 1;
        if (
          step.assignments[index]?.kind === 'fills'
          && was.freedAtMs !== undefined
          && nowMs - was.freedAtMs < SETTLE
        ) {
          filledTooSoon += 1;
        }
        if (now.itemId !== undefined) drawnAtLeastOnce = new Set([...drawnAtLeastOnce, now.itemId]);
      }
      rows = step.rows;
      // The head completes every 625ms of wall clock, so on average every
      // second or third publication.
      if (nowMs > 0 && nowMs % 1_250 === 0) head += 2;
    }

    // 51 publications is this loop's own arithmetic rather than a fact about
    // the code under test, and it is pinned so that a loop that stopped early
    // could not pass the two assertions below by never running.
    expect(publications).toBe(51);
    expect(repointed).toBe(0);
    expect(filledTooSoon).toBe(0);
    // And the pool did real work rather than holding still.
    expect(drawnAtLeastOnce.size).toBeGreaterThan(3);
  });
});
