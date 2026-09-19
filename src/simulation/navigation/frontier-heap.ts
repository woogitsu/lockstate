/**
 * The frontier data structure both navigation searches select their next node
 * from: a binary min-heap ordered by cost, ties broken by a key that is
 * **unique per node** (issue #413).
 *
 * ## Why a heap, and what it is allowed to change
 *
 * `local-search.ts` and `region-dijkstra.ts` used to pick the cheapest
 * frontier node by scanning the whole frontier, so a search over `E` nodes
 * cost `O(E * |frontier|)`. The cost of one expansion therefore grew with the
 * size of the search, which is what made ADR 0007's budget -- denominated in
 * expansions -- a budget in a unit that is not proportional to time. A heap
 * makes one expansion `O(log |frontier|)` and the unit close to constant.
 *
 * It is allowed to change *how long* a search takes and nothing else. Both
 * searches must return the identical route for identical inputs, on every
 * seed, forever: `docs/DETERMINISM.md`, and
 * `tests/determinism/navigation-search-tie-breaks.test.ts` is the behavioural
 * guard.
 *
 * ## Why the order is total by construction rather than by care
 *
 * A binary heap is not a stable sort. Sift direction and insertion history
 * decide which of two *equal* entries surfaces first, so an ordering that is
 * merely a partial order -- "cheapest cost, and whatever among equals" --
 * makes the route depend on heap internals, silently and not on every seed.
 *
 * `precedes` avoids that structurally instead of by convention. It compares
 * `cost` first and then `tieBreak`, and every caller supplies a `tieBreak`
 * that is a **unique identity of the node** derived from search state: the
 * canonical `${x},${y}` tile key in `local-search.ts`, the numeric region id
 * in `region-dijkstra.ts` -- the same two keys, compared in the same
 * direction, that the linear scans used. Two entries for *different* nodes
 * therefore always differ in `tieBreak`, so `precedes` is a strict total order
 * over them, the heap's minimum is unique, and pop order is fully determined
 * whatever arrangement the array happens to be in.
 *
 * Two entries for the *same* node are the one remaining case, and they cannot
 * be tied either: an entry is only ever pushed by a relaxation that strictly
 * lowered that node's cost (both call sites), so a node's live entries have
 * pairwise distinct costs. Even if a caller did push the identical
 * `(cost, tieBreak)` twice, the two would be interchangeable -- same node,
 * same cost, and the second one popped is discarded as stale.
 *
 * ## Lazy deletion instead of decrease-key
 *
 * There is no `decreaseKey`, and no node-to-index map to maintain. A
 * relaxation pushes a second, strictly cheaper entry for the node and leaves
 * the dearer one in place; because it is strictly dearer it is popped later,
 * by which time the node is already settled (`closed`/`visited`) and the
 * caller discards it. Callers must therefore skip a popped entry whose node is
 * already settled -- and must not count it as an expansion, so the counted
 * work `SearchStats` reports keeps meaning exactly what it meant before.
 *
 * Parallel arrays rather than one array of entry objects: this is on the hot
 * path of every route the game computes, and the entry object would be a
 * per-relaxation allocation that buys nothing.
 */
export class FrontierHeap<TTieBreak extends number | string, TValue> {
  private readonly costs: number[] = [];
  private readonly tieBreaks: TTieBreak[] = [];
  private readonly values: TValue[] = [];

  public get size(): number {
    return this.costs.length;
  }

  /** The minimum entry's cost. Throws when the heap is empty; guard with `size`. */
  public get minimumCost(): number {
    return this.costAt(0);
  }

  /** The minimum entry's tie-break key -- the node's unique identity. Throws when the heap is empty. */
  public get minimumTieBreak(): TTieBreak {
    return this.tieBreakAt(0);
  }

  /** The payload pushed alongside the minimum entry. Throws when the heap is empty. */
  public get minimumValue(): TValue {
    const value = this.values[0];
    if (value === undefined) throw new RangeError('The frontier heap is empty.');
    return value;
  }

  public push(cost: number, tieBreak: TTieBreak, value: TValue): void {
    this.costs.push(cost);
    this.tieBreaks.push(tieBreak);
    this.values.push(value);
    this.siftUp(this.costs.length - 1);
  }

  /** Removes the minimum entry. Reading it first through the `minimum*` accessors is the caller's job. */
  public pop(): void {
    const lastIndex = this.costs.length - 1;
    if (lastIndex < 0) throw new RangeError('The frontier heap is empty.');

    if (lastIndex > 0) {
      this.moveEntry(lastIndex, 0);
    }
    this.costs.pop();
    this.tieBreaks.pop();
    this.values.pop();
    if (this.costs.length > 1) this.siftDown(0);
  }

  /**
   * Strict total order over entries: cheaper first, and among equal costs the
   * smaller tie-break key. See this module's header for why "total" is the
   * load-bearing word and why the callers' keys make it so.
   */
  private precedes(left: number, right: number): boolean {
    const leftCost = this.costAt(left);
    const rightCost = this.costAt(right);
    if (leftCost !== rightCost) return leftCost < rightCost;
    return this.tieBreakAt(left) < this.tieBreakAt(right);
  }

  private siftUp(startIndex: number): void {
    let index = startIndex;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.precedes(index, parent)) return;
      this.swap(index, parent);
      index = parent;
    }
  }

  private siftDown(startIndex: number): void {
    const length = this.costs.length;
    let index = startIndex;

    for (;;) {
      const left = index * 2 + 1;
      if (left >= length) return;
      const right = left + 1;
      const child = right < length && this.precedes(right, left) ? right : left;
      if (!this.precedes(child, index)) return;
      this.swap(index, child);
      index = child;
    }
  }

  private swap(left: number, right: number): void {
    const cost = this.costAt(left);
    const tieBreak = this.tieBreakAt(left);
    const value = this.valueAt(left);
    this.moveEntry(right, left);
    this.costs[right] = cost;
    this.tieBreaks[right] = tieBreak;
    this.values[right] = value;
  }

  private moveEntry(from: number, to: number): void {
    this.costs[to] = this.costAt(from);
    this.tieBreaks[to] = this.tieBreakAt(from);
    this.values[to] = this.valueAt(from);
  }

  // `noUncheckedIndexedAccess` is on, and these three are the only places that
  // index the arrays. Every call site is inside `0 <= index < size`, so an
  // `undefined` here is a broken heap, not a missing entry.
  private costAt(index: number): number {
    const cost = this.costs[index];
    if (cost === undefined) throw new RangeError(`Frontier heap has no entry at index ${index}.`);
    return cost;
  }

  private tieBreakAt(index: number): TTieBreak {
    const tieBreak = this.tieBreaks[index];
    if (tieBreak === undefined) throw new RangeError(`Frontier heap has no entry at index ${index}.`);
    return tieBreak;
  }

  private valueAt(index: number): TValue {
    const value = this.values[index];
    if (value === undefined) throw new RangeError(`Frontier heap has no entry at index ${index}.`);
    return value;
  }
}
