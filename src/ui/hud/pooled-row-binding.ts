/**
 * Which pooled row names which item, decided once for every HUD list block
 * that puts a destructive control on a row.
 *
 * ## The defect this exists to make impossible
 *
 * The HUD's list blocks -- the Build panel's queue and its pending deliveries,
 * the Staff panel's held guards and its roster -- draw a **fixed pool** of rows
 * and repaint them from each publication. The pool is not an allocation
 * micro-optimisation: each row's control joins the HUD's busy group,
 * `createBusyGroup` has `add` and no `remove`, so a block that built a row per
 * item would grow that group without bound over a session and keep every dead
 * control in it.
 *
 * Every one of those blocks bound `rows[i]` to `items[i]`. A queue advances by
 * losing its head, so **one completion re-points every row in the pool at a
 * different item** -- and the row's control then acts on whatever landed in it,
 * which is not what the label said when the player read it.
 *
 * **Past tense, and the date is the point.** The queue was the first to be
 * fixed (#860, 2026-09-03) and the Staff panel's roster the second (#877, the
 * same day). The other two blocks that issue named -- `paintDeliveries` and
 * `paintHeld` -- were left index-bound when it closed, and its own last section
 * says why: *"`paintHeld` and `paintDeliveries` are **not yet measured** -- the
 * pass was cut off by a transient API overload before reaching them."* They
 * were substituted on 2026-09-17, by an audit of this whole shape rather than
 * by a second measuring pass, and gated in
 * `tests/browser/ui-pooled-rows-aim.spec.ts`. **So this function now has four
 * callers and no block in the HUD binds a destructive control by position.**
 * That is a sentence about a count, which `docs/AGENT_WORKFLOW.md` §4 says rots
 * first: a fifth pooled list added later is exactly what it will not notice.
 *
 * The two later substitutions differ from the first two in what re-points the
 * list, and that difference is why neither needed a press from the player to be
 * exposed. A queue and a payroll change when the player or the crew acts; a
 * **delivery** leaves its window by landing, on the procurement clock, and a
 * **hold** ends when the search or incident response that owns the guard does.
 *
 * Measured in a browser on 2026-09-03 (#860, and #859's instrument before it):
 * with the clock at 4x and a queue deeper than the three rows shown, a press
 * issued 250ms after reading a row cancelled a **different wall** than the row
 * named, and so did a press issued 600ms after -- two presses of four. At a 0ms
 * delay both presses were aimed correctly, which is the shape of the defect: it
 * is a function of how long the player takes to decide.
 *
 * **Reading the id at press time does not close it, and neither would carrying
 * that id in the command.** The label and the id are written in the same
 * synchronous paint, so the id read at press time is exactly the id the row was
 * painted with; both failures above submitted precisely that. There is no
 * moment at which a row's label and its id disagree, so no comparison between
 * the two can detect anything. **Nor would un-pooling the rows:** the harm is
 * that the *screen position* the player aimed at holds a different item, and a
 * freshly built element for the new item sits in that same position and takes
 * the same click.
 *
 * ## The invariant is about the place, not about the row
 *
 * **A place in the list names one item for as long as that item is in the
 * window, and a new item only ever appears in a place that has been visibly
 * blank for `settleMs`.** A player who reads a row and presses it therefore
 * gets that item, however long they take to decide; a player whose item has
 * gone presses a blank row and gets nothing, which the simulation already
 * treats as a non-event (`createConstructionCommandHandler` swallows a cancel
 * for an order that is not there).
 *
 * **Keeping the item in its row is only half of that, and a first version of
 * this module shipped with only that half and was re-measured failing.** Two
 * presses of three still cancelled a different wall, at decision delays of
 * 250ms and 600ms. The reason is arithmetic rather than a bug: the pool is
 * three rows over a queue that loses its head roughly every 625ms of wall clock
 * at 4x, so inside a human decision the order a player aimed at has usually
 * left the window **entirely**. Keeping every surviving item in place does
 * nothing for the player whose item did not survive -- their row was freed, and
 * the next order took the place their pointer was already over.
 *
 * So a freed place is held in two ways, and both are about the position rather
 * than the item:
 *
 * 1. **A freed row is not filled again for `settleMs`.** It sits there naming
 *    nothing, with a box and no label, so a new item cannot appear under a
 *    pointer inside the time a person takes to read a row and press it. Nothing
 *    is refused that was ever offered, because a blank row promises nothing --
 *    which is what keeps this a paint rule rather than a player-facing refusal
 *    needing a sentence of its own (`AGENTS.md` exclusion 4).
 * 2. **A row naming nothing keeps its box while any row after it names
 *    something.** Hiding it would slide every row below it up a row's height
 *    into whatever pointer was resting there, which is the same defect by
 *    geometry rather than by binding. Only the trailing run of empty rows gives
 *    its boxes up, and giving those up moves nothing.
 *
 * **Neither half is about a pixel, and one measurement says that is a gap
 * rather than a simplification (#1294, 2026-09-17).** `.hud__side` carries
 * `margin-top: auto`, so the rail this function's four callers all live in is
 * anchored to the **bottom** of the viewport: a block that changes height moves
 * its own rows rather than the space below them. Measured in a browser at
 * 1280x800 on the Staff panel's held-guards block, one held guard whose hold
 * ends as another guard is claimed: the Release box sat at y=690 before the
 * publication, and after it the freed place sat at y=635 with the **arriving
 * guard's** Release at y=690 -- the pixel the departed guard's was on. The same
 * anchoring moves three rows by 3-5px when a held row's two-line sentence is
 * blanked and the row gets shorter. The Build panel's two lists do not show it
 * (a one-line label shorter than its 44px control changes no height, and
 * `ui-pending-deliveries.spec.ts` asserts the surviving boxes to the pixel), so
 * this is the half of the invariant none of the four fixes reaches rather than
 * a defect any of them introduced. #1294 carries the measurement and what a fix
 * would have to decide.
 *
 * `settleMs` is the caller's figure -- `BUILD_QUEUE_ROW_SETTLE_MS` in
 * `build-panel.ts` carries it and what bounds it from below. It is the weakest
 * number in this design: it is a claim about how long a person takes, and only
 * its lower bound has been measured.
 *
 * ## What it costs
 *
 * The list is no longer in the crew's order once the queue has advanced -- a
 * window of three over a queue that loses its head cannot both keep every item
 * in the place it arrived in and list the items in queue order, because the
 * freed place is at the top and the arriving item belongs at the back. And
 * while the queue churns the block draws fewer than its three rows.
 *
 * Neither is silent. Every row carries its tile and its edge, which
 * `projectBuildQueue`'s own docblock records as what a player aims by --
 * *"a player aims at a wall by where it is, never by how far down the list it
 * sits"* -- `data-state` still accents the row the crew is on, and the "and N
 * more" line is counted against the rows actually drawn, so a queue of twelve
 * showing one row says eleven are behind it.
 *
 * ## Why it is a pure function
 *
 * `vitest.config.ts` runs on `environment: 'node'` with no DOM, so a mounted
 * panel is unreachable from the unit suite entirely -- a mutation inside a paint
 * function survives because nothing can observe it. Extracting the decision is
 * the answer this repository has settled on rather than reporting a survivor
 * (`docs/AGENT_WORKFLOW.md` §3, and how `orderPrisonsForDisplay` and
 * `hud/tool-arming.ts` came to exist). The clock is a parameter for the same
 * reason: a settle window read off `Date.now()` inside the paint would be
 * unreachable from any test, and this way every case below is exact arithmetic.
 */

/** One pooled row, as the panel that owns it holds it between publications. */
export interface PooledRowState {
  /** The item this row names, or `undefined` while it names nothing. */
  readonly itemId: string | undefined;
  /**
   * When this row was last emptied, on the caller's clock. `undefined` for a
   * row that has never named an item -- which is free immediately, because
   * there was never a label in that place for a player to have read.
   */
  readonly freedAtMs: number | undefined;
}

/** What one row does with one publication. */
export type PooledRowAssignment =
  /** Goes on naming the item it already named. */
  | { readonly kind: 'keeps'; readonly itemId: string }
  /** Takes an item no row was naming. Only ever a row that named nothing. */
  | { readonly kind: 'fills'; readonly itemId: string }
  /**
   * Names nothing and keeps its box: it has just been emptied, or it is still
   * inside its settle window, or a row after it is occupied and giving this box
   * up would move that row. See the header.
   */
  | { readonly kind: 'holds-open' }
  /** Names nothing and has no box. Only ever in the trailing run. */
  | { readonly kind: 'empty' };

/**
 * Assigns a publication's items to a pool of rows without ever putting a
 * different item in a place a player may still be aiming at.
 *
 * `rows` is the pool's own state, positionally. `itemIds` is the window the
 * panel can draw, in the order the producer sent it; a duplicate id is treated
 * as one item, because a pool keyed by identity cannot represent two rows
 * naming the same thing and a producer that sent one twice must not become two
 * controls aimed at one order.
 *
 * `nowMs` and `settleMs` are the caller's clock and its settle window. A
 * `settleMs` of `0` gives the invariant's first half alone -- items keep their
 * places -- which the measurement in the header says is not enough by itself.
 *
 * Returns one assignment per row, positionally. An item the pool has no free row
 * for is simply not assigned, so the caller must count what it actually drew
 * before saying how many are behind it rather than assuming the window and the
 * row count are the same number.
 */
export function assignPooledRows(
  rows: readonly PooledRowState[],
  itemIds: readonly string[],
  nowMs: number,
  settleMs: number,
): readonly PooledRowAssignment[] {
  const wanted = new Set(itemIds);
  const held = new Set<string>();
  const assignments: PooledRowAssignment[] = [];

  /*
   * Pass one: who keeps what. Nothing is filled yet, because a row's own item
   * may sit anywhere in `itemIds` and an arriving item must not be handed to a
   * row that is about to keep something.
   *
   * A row whose item has left the window drops to `'holds-open'` here, and the
   * caller stamps `freedAtMs` from the transition it can see for itself: it
   * held an item before this call and does not after.
   */
  for (const row of rows) {
    const { itemId } = row;
    if (itemId !== undefined && wanted.has(itemId) && !held.has(itemId)) {
      held.add(itemId);
      assignments.push({ kind: 'keeps', itemId });
      continue;
    }
    assignments.push({ kind: 'holds-open' });
  }

  /*
   * Pass two: the arriving items, in the producer's order, into the places that
   * have been blank long enough for a new label there not to land under a
   * pointer aimed at the last one. A row emptied by this very pass is never
   * eligible: its `freedAtMs` is stamped by the caller after the call, so on
   * this pass it still names an item and the guard below excludes it.
   */
  const arriving = [...new Set(itemIds)].filter((itemId) => !held.has(itemId));
  let next = 0;
  for (const [index, row] of rows.entries()) {
    if (assignments[index]?.kind !== 'holds-open') continue;
    if (row.itemId !== undefined) continue;
    if (row.freedAtMs !== undefined && nowMs - row.freedAtMs < settleMs) continue;
    const itemId = arriving[next];
    if (itemId === undefined) break;
    next += 1;
    assignments[index] = { kind: 'fills', itemId };
  }

  /*
   * Pass three: which rows still naming nothing may give their boxes up. Only
   * the trailing run, because dropping a box with an occupied row after it
   * moves that row -- the header's point 2.
   */
  let occupiedBelow = false;
  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const kind = assignments[index]?.kind;
    if (kind === 'keeps' || kind === 'fills') {
      occupiedBelow = true;
      continue;
    }
    if (!occupiedBelow) assignments[index] = { kind: 'empty' };
  }

  return assignments;
}
