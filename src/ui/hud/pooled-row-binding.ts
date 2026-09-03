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
 * Every one of those blocks binds `rows[i]` to `items[i]`. That is the whole
 * defect. A queue advances by losing its head, so **one completion re-points
 * every row in the pool at a different item** -- and the row's control then acts
 * on whatever landed in it, which is not what the label said when the player
 * read it.
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
 * ## The invariant, and the one thing it costs
 *
 * **A row that names an item never names a different item.** It keeps that item
 * until the item leaves the window and is then emptied. A press therefore
 * reaches the item the row has been naming all along, or -- on a row whose item
 * has gone -- reaches nothing, which the simulation already treats as a
 * non-event (`createConstructionCommandHandler` swallows a cancel for an order
 * that is no longer there).
 *
 * Holding that invariant costs the list its **order**. A window of three over a
 * queue that loses its head cannot both keep every item in the row it arrived
 * in and list the items in the queue's order: the freed row is at the top and
 * the arriving item belongs at the back. One of the two has to go, and the
 * destructive control decides which -- `projectBuildQueue`'s own docblock
 * already says which way, *"a player aims at a wall by where it is, never by how
 * far down the list it sits"*, and every row still carries its tile, its state
 * in words, and `data-state` for the accent that marks the one the crew is on.
 *
 * ## Why a freed row holds its box open for one publication
 *
 * If a freed row were filled in the same paint that freed it, the invariant
 * would break in the one case that matters most: the item the player is aiming
 * at is exactly the one that left, and its row would hand the press straight to
 * a substitute. And if a freed row were merely hidden, every row *below* it
 * would slide up a row's height into the pointer -- the same defect by geometry
 * rather than by binding.
 *
 * So a row emptied by a pass reports `'holds-open'`: it keeps its box, it names
 * nothing, and the *next* publication may fill it. On a running clock that is
 * about 250ms (`CLOCK_STATE_PUBLISH_INTERVAL_MS`); with the clock paused nothing
 * publishes and nothing repaints, so it costs nothing there.
 *
 * ## What it still does not close, stated rather than implied
 *
 * One residual, and it is the same shape whichever way the freed row is
 * afterwards used. A player aiming at the item that *itself* leaves the window
 * reads a row, watches it go inert, and -- a publication later -- that row
 * either takes an arriving item or is given up so that the row below it moves
 * into the place it held. A press arriving after **both** of those has still
 * reached something the player did not choose. Two things are different from
 * the defect: the row was blank under their pointer for a whole publication
 * first, and the item they were aiming at has gone in any case, so there is
 * nothing left that the press could correctly have done. Closing even that
 * needs the pool to know what the player has looked at, and nothing on this
 * thread can: the `pointerenter`/`focusin` route answers for a mouse and a
 * keyboard and does not exist on a touch device, which `AGENTS.md` boundary 10
 * puts out of reach as a fix.
 *
 * ## Why it is a pure function
 *
 * `vitest.config.ts` runs on `environment: 'node'` with no DOM, so a mounted
 * panel is unreachable from the unit suite entirely -- a mutation inside a paint
 * function survives because nothing can observe it. Extracting the decision is
 * the answer this repository has settled on rather than reporting a survivor
 * (`docs/AGENT_WORKFLOW.md` §3, and how `orderPrisonsForDisplay` and
 * `hud/tool-arming.ts` came to exist).
 */

/** What one row does with one publication. */
export type PooledRowAssignment =
  /** Goes on naming the item it already named. */
  | { readonly kind: 'keeps'; readonly itemId: string }
  /** Takes an item no row was naming. Only ever a row that named nothing. */
  | { readonly kind: 'fills'; readonly itemId: string }
  /**
   * Named an item that has left the window. Emptied, box kept, inert until the
   * next publication -- see the header.
   */
  | { readonly kind: 'holds-open' }
  /** Names nothing and has nothing to hold open. The row has no box. */
  | { readonly kind: 'empty' };

/**
 * Assigns a publication's items to a pool of rows without ever re-pointing a
 * row that already names one.
 *
 * `named` is what each row names right now, positionally, `undefined` for a row
 * naming nothing -- which covers both a row that has never held an item and one
 * that was emptied by the previous publication and has now finished holding its
 * box open. Those two are the same state to this function and differ only in
 * whether the caller's element currently has a box.
 *
 * `itemIds` is the window the panel can draw, in the order the producer sent it.
 * A duplicate id is treated as one item: a pool keyed by identity cannot
 * represent two rows naming the same thing, and a producer that sent one twice
 * has a defect of its own that must not become two controls aimed at one order.
 *
 * Returns one assignment per row, positionally. An item the pool has no free row
 * for is simply not assigned -- so the caller must count what it actually drew
 * before saying how many are behind it, rather than assuming the window and the
 * row count are the same number.
 */
export function assignPooledRows(
  named: readonly (string | undefined)[],
  itemIds: readonly string[],
): readonly PooledRowAssignment[] {
  const wanted = new Set(itemIds);
  const held = new Set<string>();
  const assignments: PooledRowAssignment[] = [];

  /*
   * Pass one: who keeps what, and who is emptied. Nothing is filled yet,
   * because a row's own item may sit anywhere in `itemIds` and an arriving item
   * must not be handed to a row that is about to keep something.
   */
  for (const itemId of named) {
    if (itemId !== undefined && wanted.has(itemId) && !held.has(itemId)) {
      held.add(itemId);
      assignments.push({ kind: 'keeps', itemId });
      continue;
    }
    if (itemId !== undefined) {
      assignments.push({ kind: 'holds-open' });
      continue;
    }
    assignments.push({ kind: 'empty' });
  }

  /*
   * Pass two: the arriving items, in the producer's order, into the rows that
   * are genuinely free -- never into one this pass emptied, which is what the
   * `'holds-open'` kind is for.
   */
  const arriving = [...new Set(itemIds)].filter((itemId) => !held.has(itemId));
  let next = 0;
  for (const [index, assignment] of assignments.entries()) {
    if (assignment.kind !== 'empty') continue;
    const itemId = arriving[next];
    if (itemId === undefined) break;
    next += 1;
    assignments[index] = { kind: 'fills', itemId };
  }

  return assignments;
}
