import { describe, expect, it } from 'vitest';
import { assignPooledRows, type PooledRowAssignment } from '../../src/ui/hud/pooled-row-binding';

/**
 * The rule that decides which pooled HUD row names which item, at the only
 * layer it can be proved at.
 *
 * `vitest.config.ts` runs on `environment: 'node'` and there is no jsdom, so a
 * mounted Build panel is unreachable from this suite -- which is why the
 * decision these tests are about was extracted rather than left inline in
 * `paintQueue`. A mutation inside a paint function survives because nothing
 * here could observe it; `docs/AGENT_WORKFLOW.md` §3 records that move and why
 * reporting an unreachable survivor is not the answer.
 *
 * The property every block below is about is one sentence: **a row that names
 * an item never names a different item.** That is #860 -- a press reached an
 * order the row's label never described, because a completion re-pointed the
 * pool between the paint the player read and the click. The last block states
 * it as a property over a whole simulated queue rather than as an example.
 */

/** What each row names after a publication, for reading assignments back. */
const namedAfter = (
  before: readonly (string | undefined)[],
  itemIds: readonly string[],
): readonly (string | undefined)[] =>
  assignPooledRows(before, itemIds).map((assignment) =>
    assignment.kind === 'keeps' || assignment.kind === 'fills' ? assignment.itemId : undefined,
  );

const kinds = (assignments: readonly PooledRowAssignment[]): readonly string[] =>
  assignments.map((assignment) => assignment.kind);

describe('assignPooledRows', () => {
  it('fills an empty pool with the window in the order it arrived', () => {
    const assignments = assignPooledRows([undefined, undefined, undefined], ['a', 'b', 'c']);
    expect(assignments).toEqual([
      { kind: 'fills', itemId: 'a' },
      { kind: 'fills', itemId: 'b' },
      { kind: 'fills', itemId: 'c' },
    ]);
  });

  it('leaves a row with no item to show without a box', () => {
    expect(assignPooledRows([undefined, undefined, undefined], ['a'])).toEqual([
      { kind: 'fills', itemId: 'a' },
      { kind: 'empty' },
      { kind: 'empty' },
    ]);
  });

  it('keeps every surviving item in the row it was already in when the head leaves', () => {
    /*
     * The defect, stated as the arithmetic that produced it. The old rule was
     * `rows[i] = items[i]`, so this publication moved `b` from row 1 to row 0
     * and `c` from row 2 to row 1 -- and a press that had been aimed at row 1
     * because it said `b` cancelled `c`.
     */
    const assignments = assignPooledRows(['a', 'b', 'c'], ['b', 'c', 'd']);
    expect(assignments).toEqual([
      { kind: 'holds-open' },
      { kind: 'keeps', itemId: 'b' },
      { kind: 'keeps', itemId: 'c' },
    ]);
  });

  it('will not hand a row freed by this publication to the item that arrived in it', () => {
    // The one case the invariant would still lose: the item the player is
    // aiming at is the one that left. Its row goes inert for a publication
    // rather than passing the press to a substitute.
    const assignments = assignPooledRows(['a', 'b', 'c'], ['b', 'c', 'd']);
    expect(kinds(assignments)).not.toContain('fills');
    expect(assignments.some((assignment) => assignment.kind === 'keeps' && assignment.itemId === 'd')).toBe(false);
  });

  it('fills the row it held open on the next publication', () => {
    const first = namedAfter(['a', 'b', 'c'], ['b', 'c', 'd']);
    expect(first).toEqual([undefined, 'b', 'c']);
    // Same window again: the row that held its box open is free now.
    expect(assignPooledRows(first, ['b', 'c', 'd'])).toEqual([
      { kind: 'fills', itemId: 'd' },
      { kind: 'keeps', itemId: 'b' },
      { kind: 'keeps', itemId: 'c' },
    ]);
  });

  it('holds open the row of an item cancelled out of the middle of the list', () => {
    expect(assignPooledRows(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      { kind: 'keeps', itemId: 'a' },
      { kind: 'holds-open' },
      { kind: 'keeps', itemId: 'c' },
    ]);
  });

  it('gives up the box a publication after there is nothing to put in it', () => {
    const first = namedAfter(['a', 'b', 'c'], ['a', 'c']);
    expect(assignPooledRows(first, ['a', 'c'])).toEqual([
      { kind: 'keeps', itemId: 'a' },
      { kind: 'empty' },
      { kind: 'keeps', itemId: 'c' },
    ]);
  });

  it('empties every row when the window does', () => {
    expect(assignPooledRows(['a', 'b', 'c'], [])).toEqual([
      { kind: 'holds-open' },
      { kind: 'holds-open' },
      { kind: 'holds-open' },
    ]);
    expect(assignPooledRows([undefined, undefined, undefined], [])).toEqual([
      { kind: 'empty' },
      { kind: 'empty' },
      { kind: 'empty' },
    ]);
  });

  it('never aims two rows at one item, even when the producer sends it twice', () => {
    /*
     * A producer that sent a duplicate has a defect of its own, and the answer
     * here is not to draw it twice: two rows naming one order are two controls
     * that both destroy it, and the second press then reaches an order that is
     * already gone.
     */
    const assignments = assignPooledRows([undefined, undefined, undefined], ['a', 'a', 'b']);
    const named = assignments.flatMap((assignment) =>
      assignment.kind === 'fills' || assignment.kind === 'keeps' ? [assignment.itemId] : [],
    );
    expect(named).toEqual(['a', 'b']);
    expect(new Set(named).size).toBe(named.length);
  });

  it('holds the invariant across a whole queue draining through a three-row pool', () => {
    /*
     * The property, not an example: fifteen items entering a three-row window
     * one at a time as the head completes, which is what the crew does to a
     * dragged run of walls. **No row may ever go from naming one item straight
     * to naming another** -- an id may only appear on a row that named nothing
     * the publication before, which is the row having been inert for a
     * publication first.
     *
     * The same walk under the old `rows[i] = items[i]` rule re-points a row
     * on every single completion, which is the arithmetic in `#860`.
     */
    const all = Array.from({ length: 15 }, (_item, index) => `order-${String(index).padStart(2, '0')}`);
    let named: readonly (string | undefined)[] = [undefined, undefined, undefined];
    let head = 0;
    let repointed = 0;
    let publications = 0;

    while (head < all.length) {
      const window = all.slice(head, head + 3);
      for (let repeat = 0; repeat < 2; repeat += 1) {
        const next = namedAfter(named, window);
        publications += 1;
        for (const [index, before] of named.entries()) {
          const after = next[index];
          if (before !== undefined && after !== undefined && before !== after) repointed += 1;
        }
        named = next;
      }
      // The head completes, and the window slides by one.
      head += 1;
    }

    expect(publications).toBe(30);
    expect(repointed).toBe(0);
    // And the pool did real work rather than holding still: every item reached
    // a row at some point on the way through.
    expect(named.filter((itemId) => itemId !== undefined).length).toBeGreaterThan(0);
  });
});
