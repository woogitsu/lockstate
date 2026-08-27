import { describe, expect, it } from 'vitest';
import { FrontierHeap } from '../../src/simulation/navigation/frontier-heap';

/**
 * `FrontierHeap` is the one place where issue #413's risk lives.
 *
 * A binary heap is not a stable sort: among entries its comparator calls
 * equal, which one surfaces first is decided by sift direction and insertion
 * history. Both navigation searches feed it and both must return the identical
 * route for identical inputs on every seed, so the property under test here is
 * not "pops the cheapest" -- it is **"pop order is a function of the entry set
 * alone"**, which holds only while the comparator is a total order.
 *
 * The oracle is a plain `Array.prototype.sort` with the ordering rule written
 * out independently below. It judges the heap the way
 * `tests/unit/navigation-local-search-admissibility.test.ts`'s Dijkstra judges
 * the A*: a method that cannot fail the way the subject can, since a sort
 * over a total order is a total order whatever its own internals do. No case
 * here states an expected sequence the heap produced.
 */

interface Entry {
  readonly cost: number;
  readonly key: string;
  readonly value: number;
}

/** A small, self-contained LCG so every case runs on the identical entries. */
function seededRandom(seed: number): () => number {
  let state = (seed * 1103515245 + 12345) & 0x7fffffff;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * The ordering the searches need, stated here and not imported: least cost,
 * ties to the smaller tie-break key. `local-search.ts` supplies the canonical
 * `${x},${y}` tile key and `region-dijkstra.ts` the numeric region id, and
 * both rely on this exact rule.
 */
function compareEntries(left: Entry, right: Entry): number {
  if (left.cost !== right.cost) return left.cost - right.cost;
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

/**
 * `costCeiling` is deliberately far smaller than `count`: the interesting
 * entries are the ones whose costs collide, and a heap fed distinct costs
 * never exercises its tie-break at all.
 */
function buildEntries(seed: number, count: number, costCeiling: number): readonly Entry[] {
  const random = seededRandom(seed);
  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    // Two-dimensional keys, so ordering is by code unit ('10,0' before '2,0')
    // and never by a numeric reading of the key -- which is the order
    // `tileKey` produces and the tie-break tests pin.
    const x = Math.floor(random() * 40);
    const y = Math.floor(random() * 40);
    entries.push({ cost: Math.floor(random() * costCeiling), key: `${x},${y}`, value: index });
  }
  // Distinct keys only: that is what both call sites supply (a tile key, a
  // region id), and it is what makes the comparator total.
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
}

function drain(entries: readonly Entry[]): readonly Entry[] {
  const heap = new FrontierHeap<string, number>();
  for (const entry of entries) heap.push(entry.cost, entry.key, entry.value);

  const popped: Entry[] = [];
  while (heap.size > 0) {
    popped.push({ cost: heap.minimumCost, key: heap.minimumTieBreak, value: heap.minimumValue });
    heap.pop();
  }
  return popped;
}

function shuffled(entries: readonly Entry[], seed: number): readonly Entry[] {
  const random = seededRandom(seed);
  const copy = [...entries];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const held = copy[index];
    const other = copy[swapIndex];
    if (held === undefined || other === undefined) throw new Error('Shuffle indices must exist.');
    copy[index] = other;
    copy[swapIndex] = held;
  }
  return copy;
}

const SEEDS = Array.from({ length: 20 }, (_unused, index) => index + 1);

describe('FrontierHeap drains in the total order its comparator declares', () => {
  it('matches an independent sort by (cost, tie-break key), over 20 seeded entry sets', () => {
    let tiedPairs = 0;
    let comparedEntries = 0;

    for (const seed of SEEDS) {
      const entries = buildEntries(seed, 400, 12);
      const expected = [...entries].sort(compareEntries);
      const popped = drain(entries);

      expect(popped.map((entry) => entry.key)).toEqual(expected.map((entry) => entry.key));
      expect(popped.map((entry) => entry.cost)).toEqual(expected.map((entry) => entry.cost));
      // The payload has to travel with its own entry, not merely in the right
      // order: the searches read `minimumValue` as the tile they expand.
      expect(popped.map((entry) => entry.value)).toEqual(expected.map((entry) => entry.value));

      comparedEntries += entries.length;
      for (let index = 1; index < expected.length; index += 1) {
        const previous = expected[index - 1];
        const current = expected[index];
        if (previous !== undefined && current !== undefined && previous.cost === current.cost) tiedPairs += 1;
      }
    }

    // The denominator. A sweep whose costs never collided would satisfy every
    // assertion above without the tie-break ever deciding anything.
    expect(comparedEntries).toBeGreaterThan(2_000);
    expect(tiedPairs).toBeGreaterThan(1_000);
  });

  it('drains the same entry set the same way whatever order it was pushed in', () => {
    for (const seed of SEEDS) {
      const entries = buildEntries(seed, 200, 8);
      const canonical = drain(entries).map((entry) => `${entry.cost}@${entry.key}`);

      for (const shuffleSeed of [7, 11, 13, 17]) {
        const permuted = shuffled(entries, seed * 100 + shuffleSeed);
        // Non-vacuity: a permutation that left the push order alone would make
        // this case a second copy of the one above.
        expect(permuted.map((entry) => entry.key)).not.toEqual(entries.map((entry) => entry.key));
        expect(drain(permuted).map((entry) => `${entry.cost}@${entry.key}`)).toEqual(canonical);
      }
    }
  });

  it('orders numeric tie-breaks numerically and string tie-breaks by code unit', () => {
    // The two call sites disagree about what "smaller key" means and both are
    // right: `region-dijkstra.ts` compares region ids as numbers (9 before 10),
    // `local-search.ts` compares `${x},${y}` tile keys as strings ('10,0'
    // before '2,0'). A heap that coerced either way would reroute the game.
    const numeric = new FrontierHeap<number, number>();
    for (const region of [10, 2, 9, 1]) numeric.push(5, region, region);
    const numericOrder: number[] = [];
    while (numeric.size > 0) {
      numericOrder.push(numeric.minimumTieBreak);
      numeric.pop();
    }
    expect(numericOrder).toEqual([1, 2, 9, 10]);

    const textual = new FrontierHeap<string, string>();
    for (const key of ['2,0', '10,0', '1,0']) textual.push(5, key, key);
    const textualOrder: string[] = [];
    while (textual.size > 0) {
      textualOrder.push(textual.minimumTieBreak);
      textual.pop();
    }
    expect(textualOrder).toEqual(['1,0', '10,0', '2,0']);
  });
});

describe('FrontierHeap under the lazy deletion both searches rely on', () => {
  it('surfaces a relaxed entry before the copy it superseded', () => {
    // What a relaxation does: push the same node again, strictly cheaper, and
    // leave the dearer copy to be discarded when it eventually surfaces.
    const heap = new FrontierHeap<string, string>();
    heap.push(9, '3,4', '3,4');
    heap.push(4, '1,1', '1,1');
    heap.push(6, '3,4', '3,4'); // the relaxation
    heap.push(7, '0,9', '0,9');

    const order: { readonly cost: number; readonly key: string }[] = [];
    while (heap.size > 0) {
      order.push({ cost: heap.minimumCost, key: heap.minimumTieBreak });
      heap.pop();
    }

    expect(order).toEqual([
      { cost: 4, key: '1,1' },
      { cost: 6, key: '3,4' },
      { cost: 7, key: '0,9' },
      { cost: 9, key: '3,4' },
    ]);
  });

  it('refuses to report or remove a minimum it does not have', () => {
    const heap = new FrontierHeap<string, string>();
    expect(heap.size).toBe(0);
    expect(() => heap.minimumCost).toThrow(RangeError);
    expect(() => heap.minimumTieBreak).toThrow(RangeError);
    expect(() => heap.minimumValue).toThrow(RangeError);
    expect(() => heap.pop()).toThrow(RangeError);

    heap.push(1, '0,0', '0,0');
    heap.pop();
    expect(heap.size).toBe(0);
    expect(() => heap.pop()).toThrow(RangeError);
  });
});
