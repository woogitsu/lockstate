import type { RoomDetailViewModel, RoomListViewModel } from '../simulation/presentation/room-projection';
import {
  ROOM_NEEDS_ROOMS_LIMIT,
  type HudRoomAtCapacityViewModel,
  type HudRoomNeedViewModel,
  type HudRoomNeedsViewModel,
} from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads what the designated rooms are still missing, over the projection
 * channel, and turns it into what the Rooms panel renders.
 *
 * ## The gap this closes
 *
 * The simulation has been able to answer "does this room satisfy its catalog
 * requirements" since #123: `projectRoomList` counts each instance's unmet
 * `object` requirements as `requirementSummary.missingCapability`, and
 * `projectRoomDetail` names the object behind each one. It is the same signal
 * `IntakeSystem` and `ActionSystem` gate on (`requiredObjectCapability`), so it
 * is load-bearing state and not a display-only derivation.
 *
 * Nothing under `src/ui/` asked. `src/ui/simulation-projections.ts` was the
 * only module in the tree that could send a `simulation/request-projection` and
 * nothing constructed one, which
 * `tests/foundation/projection-reachability-contract.test.ts` recorded as
 * `UNPAINTED_ROUTE` and wrote so that it would fail the day a module under
 * `src/ui/` mentioned the requester. This is that module: the entry is gone and
 * that test now asserts the painter exists instead.
 *
 * ## The fifth translator, and why it is a class
 *
 * It joins `simulation-clock.ts`, `simulation-counts.ts`, `simulation-alerts.ts`
 * and `simulation-zoning.ts` outside `src/ui/hud/`, and it is here for the same
 * reason they are: the HUD imports nothing from `src/simulation/**`
 * (`AGENTS.md` boundary 1, enforced by `tests/unit/ui-hud-messages.test.ts`),
 * so a module that has to know both a projection's shape and a view model sits
 * outside it.
 *
 * It differs from all four in *direction*, and that is why it is a class rather
 * than a function of a message. Those four map a publication the worker sent
 * unprompted. A room list is a **pull**: it exists only because something asked
 * for it, correlated by `messageId` (ADR 0003 decision 2), so this holds the
 * requester that asks. The mapping itself is still a pure function --
 * `roomNeedsFromProjections` below -- so what the panel is told can be proven
 * with no worker, no channel and no DOM.
 *
 * ## What it does not do
 *
 * It caches nothing. `SimulationProjectionRequester`'s own header states the
 * rule and it holds here for the same reason: a cache on this thread is a
 * second, stale copy of the prison, which is the boundary the projection
 * channel exists to keep. Every `read()` is a fresh question, and a caller that
 * stops asking is a caller that costs the worker nothing -- which is what makes
 * an `O(instances)` read affordable on a cadence while the Rooms tab is
 * showing, and free at every other moment.
 */

/**
 * The rooms the projection says are missing something, nearest to finished
 * first.
 *
 * `requirementSummary.missingCapability` is the verdict, read and not
 * recomputed: the predicate is `> 0` and nothing else. Deriving "unfinished"
 * here from `objectCapabilities` -- which the same row carries -- would put a
 * second definition of the rule on the main thread, and the second definition
 * is the one that drifts.
 *
 * ## Why this is sorted at all, and why by this
 *
 * **It used to be `rows`'s own order**, ascending instance id, and the comment
 * here said that mattered "because it decides which rooms get named when there
 * are more than there is room for". That reason is still exactly right and the
 * order it chose is not, which is what #529 measured: the panel names one room,
 * so ascending instance id means it names *the oldest unfinished room*, which
 * is the one the player zoned first and has been stuck on longest. A prison
 * with three empty cells and a kitchen one stove short showed a cell.
 *
 * A player reading this readout is trying to **finish something**, not to audit
 * everything -- there is no surface in this application that audits, and #529
 * says so. The cheapest available completion is the room with the fewest unmet
 * requirements, so that is what gets named, and finishing it moves the readout
 * to the next-cheapest rather than back to the same stuck room. Ties break on
 * `instanceId`, so the order is total and deterministic
 * (`docs/DETERMINISM.md`): two rooms short of one thing each are named in the
 * projection's own canonical order, which is what
 * `tests/determinism/projection-ordering.test.ts` pins `rows` to.
 *
 * **What this sorts by is requirements, not objects, and the difference is
 * visible.** A cell short of a bed and a canteen short of four benches both
 * report `missingCapability === 1`, so they tie here and the older is named
 * first -- even though one is a single build and the other is four. The
 * object-level shortfall lives on `RoomDetailViewModel.requirements`, which
 * costs one message *per room*; sorting by it would make an `O(rooms)` read out
 * of a readout that runs on a cadence, which is the unbounded-in-the-prison
 * cost `RoomNeedsReader.read`'s bound exists to refuse. A tie broken slightly
 * wrong is worth a great deal less than that, and it is written down rather
 * than left for a reader to discover.
 *
 * **A room with no way into it is unfinished too, and that is #938.** The
 * predicate above was `missingCapability > 0` and nothing else, so a shower
 * room with both its heads placed and no door in its wall line was reported
 * complete by every readout a player has -- the measurement is in
 * `tests/integration/dead-room-no-doorway.test.ts`: hygiene 254.8 of 255 with
 * a door, **0** without, on the same seed and the same geometry with one edge
 * different, and `missingCapability` **0 in both**. `shortfallOf` below is now
 * the predicate, and it counts the missing doorway as one more thing the room
 * is short.
 *
 * The verdict is still read and not recomputed: `access` is
 * `roomPerimeterAccess`' own answer, decided in the simulation beside the
 * navigation rule that makes it true, exactly as `missingCapability` is
 * decided beside the requirement rule. Nothing here re-derives either.
 *
 * The array is a copy: `rows` is `readonly` and belongs to the reply.
 */
export function unfinishedRoomIds(list: RoomListViewModel): readonly string[] {
  return list.rooms.rows
    .filter((row) => shortfallOf(row) > 0)
    .slice()
    .sort((left, right) => shortfallOf(left) - shortfallOf(right) || compareInstanceIds(left.instanceId, right.instanceId))
    .map((row) => row.instanceId);
}

/**
 * How many things this room is short: its unmet object requirements, plus one
 * for a room nobody can get into (#938, and ADR 0108 for the second value).
 *
 * One function rather than the same sum in three places -- the sort key, the
 * unfinished predicate and the header's `totalNeeds` all have to agree, and
 * two of them disagreeing is a header that counts a room the list does not
 * name.
 *
 * **Two values count, not one, and they are two different repairs.**
 * `'no-way-in'` is a perimeter with no door in it at all; `'unreachable'` is a
 * door nothing can get to, which ADR 0108 added because collapsing the two
 * would have the panel tell a player to build a door they already built. Both
 * are rooms nobody can enter, so both are one thing short.
 *
 * **`'gap'` counts as nothing here and that is not an oversight.** A rectangle
 * open on one side has a way across its boundary; whether the space beyond that
 * side is itself sealed is a question `roomAccess` answers only for a *closed*
 * perimeter (`reachability.ts`, "The three questions in order"). So this sum
 * reaching zero says the panel's checklist is clear and still does not say a
 * prisoner can reach the room -- which is why
 * `hud.alert.event.rooms.needs-cleared` keeps its disclaiming clause.
 *
 * `access` is absent in exactly the states `RoomListRowViewModel.access`
 * records -- a caller that supplied the projection no perimeter, or an
 * instance with no rectangle -- and absent adds nothing here rather than
 * counting as a doorway or as a missing one. That keeps "nobody asked" out of
 * a figure a player reads, which is the same rule `missingQuantityOf` follows
 * for an uncounted object.
 */
function shortfallOf(row: RoomListViewModel['rooms']['rows'][number]): number {
  // One line, and it has to stay one line: `room-shortfall-parity-contract`
  // holds this text and the worker's copy as the same literal string, and a
  // wrap would indent one of them differently and fail it.
  return row.requirementSummary.missingCapability + (row.access === 'no-way-in' || row.access === 'unreachable' ? 1 : 0);
}

/**
 * The tie-break: `rows`'s own ordering, not a second opinion about it.
 *
 * A second declaration of `compareStableIds`
 * (`src/simulation/presentation/view-model.ts`), and it has to be one. This
 * module is pinned `kind: 'type-only'` against the simulation tree in
 * `tests/unit/ui-orchestration-boundaries.test.ts`, whose recorded reason says
 * what a value import here would mean -- "the readout had started projecting
 * rooms on the main thread from state it does not own" -- and importing a
 * three-line comparator would flip that gate for a trivial gain. The gate is
 * worth more than the deduplication.
 *
 * Two declarations of one rule drift, so `tests/unit/ui-simulation-room-needs.test.ts`
 * imports both and holds them together -- the shape `MAX_ROOM_SIDE_TILES` and
 * `HUD_BUILD_EDGES` already use for exactly this trade.
 *
 * Why it must be that comparator and not merely *a* total order: `rows` is
 * published sorted by `compareStableIds`, so resolving a tie the same way means
 * equal-cost rooms come out in the order the projection published them, and the
 * sort above is stable in the only sense that matters here.
 */
function compareInstanceIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * What the panel renders, from the list and whichever details were fetched.
 *
 * Pure, and every number in it is the projection's. `totalRooms` is
 * `totals.instances`, which counts every registered instance whatever window
 * was asked for; `unfinishedRooms` and `totalNeeds` are counted over the rows
 * that came back, which is the projection's default window
 * (`DEFAULT_VIEW_MODEL_PAGE_LIMIT`, 100) because `read()` asks for no window of
 * its own. In a prison with more than a hundred rooms those two therefore
 * describe the first hundred; `HudRoomNeedsViewModel` says so, and asking for
 * every row to make a two-number summary exact would be an unbounded read on a
 * cadence.
 *
 * A detail whose room names a `roomNameKey` the catalogue does not define is
 * skipped rather than carried: there is no name for the line to print, and this
 * layer may not invent one. It is unreachable with the shipped catalogues --
 * `collectRoomInstances` enumerates *by* catalogue id, so an instance under an
 * unknown id is invisible to the projection in the first place -- and it is
 * written down because "unreachable" and "handled" are different claims. The
 * room still counts in `unfinishedRooms`, which comes from the list rather than
 * from the details.
 */
/**
 * How many more of the object the room needs, when the projection counted (#529).
 *
 * **The subtraction happens here and nowhere else**, and it is the only
 * arithmetic this module does on the simulation's numbers. `minQuantity` is
 * what the room asks for and `satisfyingQuantity` is what it holds; neither
 * alone is actionable, and the projection deliberately publishes both rather
 * than the difference, because the difference is a statement about a *readout*
 * -- "build this many" -- while the two figures are statements about the room.
 *
 * Returns a spreadable object rather than `number | undefined` because
 * `exactOptionalPropertyTypes` is on: "the simulation could not count" must be
 * an absent property on `HudRoomNeedViewModel`, not a present one holding
 * nothing, and building it here keeps that decision in one place instead of at
 * every call site.
 *
 * **Three ways to get nothing, and all three are the same statement**: the
 * requirement is not an `object` one (so it carries neither figure), the
 * projection was handed nothing to attribute to the room (so
 * `satisfyingQuantity` is absent -- see its own comment), or the subtraction
 * does not come out positive. That last is not reachable through
 * `roomNeedsFromProjections`, which reads only `'missing-capability'` entries,
 * and a `'missing-capability'` verdict is *defined* as holding fewer than
 * `minQuantity` -- so it is a guard against the two figures contradicting the
 * status beside them rather than a case. It answers with no numeral rather than
 * with a zero or a negative, because a line reading "0 x Bed" would be a
 * rendering bug wearing the clothes of a fact.
 */
function missingQuantityOf(
  requirement: RoomDetailViewModel['requirements'][number],
): { readonly missingQuantity?: number } {
  const { minQuantity, satisfyingQuantity } = requirement;
  if (minQuantity === undefined || satisfyingQuantity === undefined) return {};
  const missing = minQuantity - satisfyingQuantity;
  return missing > 0 ? { missingQuantity: missing } : {};
}

/**
 * The room's ceiling that is fully claimed, or nothing (ADR 0028 phase 5).
 *
 * **The first one in the row's own order, and no priority is invented.**
 * `RoomListRowViewModel.concurrentUse` is ascending by capability, which is
 * `RoomInstance.objectCapabilities`' order, which is state-derived and
 * canonical (`docs/DETERMINISM.md`) -- so two full ceilings in one room resolve
 * the same way on every run and on every machine. Ranking them would need a
 * rule about which use of a room matters more, and there is no such rule
 * anywhere in this tree to read: the actions that consume these capabilities
 * carry need weights, not room weights, and inventing one here would be this
 * layer deciding something the simulation has not.
 *
 * `capacity > 0` is not redundant beside `inUse >= capacity`. A capability with
 * a ceiling of zero is a room that cannot be used for that thing at all -- an
 * unresolved fixture instance, or a capability the objects no longer supply --
 * and `0 >= 0` would report it as full, which is the opposite of what it is.
 * Nobody is standing in it: `claimUse` cannot take a claim against a ceiling of
 * zero, so `inUse` there is zero too, and "full" would be a sentence about an
 * empty room.
 */
function fullestUseOf(
  row: RoomListViewModel['rooms']['rows'][number],
): { readonly capacity: number; readonly inUse: number } | undefined {
  for (const use of row.concurrentUse) {
    if (use.capacity > 0 && use.inUse >= use.capacity) return use;
  }
  return undefined;
}

/**
 * Every room in the list that cannot take another user right now.
 *
 * Read off the **list** reply, which `RoomNeedsReader.read` already fetches, so
 * this costs no extra message however many rooms are full -- unlike `needs`,
 * which needs one detail projection per room named. That is why this one is
 * complete over the page and that one is not.
 *
 * A row whose `roomNameKey` the catalogue does not define is skipped, for
 * `roomNeedsFromProjections`' own recorded reason: there is no name for the
 * line to print and this layer may not invent one. Unreachable with the
 * shipped catalogues, because `collectRoomInstances` enumerates *by* catalogue
 * id.
 *
 * The order is `rows`' own, which the projection publishes ascending by
 * instance id. Nothing re-sorts it: `unfinishedRoomIds` sorts because it has a
 * cheapness gradient to sort on -- the room nearest to finished is the one
 * worth naming -- and full rooms have no such gradient. Every one of them is
 * refusing arrivals equally.
 */
function atCapacityFrom(list: RoomListViewModel): readonly HudRoomAtCapacityViewModel[] {
  const full: HudRoomAtCapacityViewModel[] = [];
  for (const row of list.rooms.rows) {
    if (row.roomNameKey === undefined) continue;
    const use = fullestUseOf(row);
    if (use === undefined) continue;
    full.push({
      instanceId: row.instanceId,
      roomLabelKey: row.roomNameKey,
      tile: { x: row.anchorTile.x, y: row.anchorTile.y },
      places: use.capacity,
      inUse: use.inUse,
    });
  }
  return full;
}

export function roomNeedsFromProjections(
  list: RoomListViewModel,
  details: readonly RoomDetailViewModel[],
): HudRoomNeedsViewModel {
  const rows = list.rooms.rows;
  let unfinishedRooms = 0;
  let totalNeeds = 0;
  for (const row of rows) {
    // `shortfallOf`, so the header's two figures count the same thing
    // `unfinishedRoomIds` selects and sorts on -- a missing doorway included
    // (#938).
    const missing = shortfallOf(row);
    if (missing <= 0) continue;
    unfinishedRooms += 1;
    totalNeeds += missing;
  }

  /*
   * Every unmet requirement of every room that was asked about, and **no cap
   * here**.
   *
   * This loop used to stop at `ROOM_NEEDS_NAMED_LIMIT`, and that was the same
   * conflation `RoomNeedsReader.read`'s budget carried: one constant standing
   * for "how many rooms to ask about" and "how many lines the panel draws"
   * while both were 1. Truncating *here* is the worse half of it, because the
   * panel then cannot say how many it did not show -- the remainder was
   * subtracted from the prison-wide `totalNeeds`, which is how
   * "Cell at 2, 2 needs Bed, and 5 more" came to attach five other rooms'
   * requirements to a sentence about one cell.
   *
   * `ROOM_NEEDS_NAMED_LIMIT`'s own comment states the division this restores:
   * "The boundary carries the answer; the panel decides how much of it fits."
   * So the answer crosses whole and `rooms-panel.ts` slices it, which is what
   * lets it count its own remainder honestly.
   *
   * Bounded by content rather than by a number chosen here:
   * `ROOM_NEEDS_ROOMS_LIMIT` rooms were asked about, and
   * `roomRequirementSchema` caps a room at 32 requirements. The deepest shipped
   * room has three object requirements.
   */
  const needs: HudRoomNeedViewModel[] = [];
  for (const detail of details) {
    if (detail.roomNameKey === undefined) continue;
    /*
     * **The way in goes first, before this room's object lines** (#938).
     *
     * Not a tie-break and not taste: `ROOM_NEEDS_NAMED_LIMIT` is 4, so a room
     * short of four objects would push the doorway line off the panel
     * entirely and into the "and 1 more" remainder -- and it is the one line
     * that makes the other four pointless, because nothing can be carried
     * into a room nobody can enter. The order within a room is this layer's
     * to choose; which rooms are named is the projection's, and that is
     * untouched.
     */
    if (detail.access === 'no-way-in' || detail.access === 'unreachable') {
      needs.push({
        // Two values, two sentences, and the distinction is carried across
        // rather than flattened here: the panel says "build a door" for one and
        // "the door leads nowhere" for the other, and a player given the wrong
        // one of those goes and does the wrong work (ADR 0108 decision 3).
        kind: detail.access === 'no-way-in' ? 'doorway' : 'unreachable',
        instanceId: detail.instanceId,
        roomLabelKey: detail.roomNameKey,
        tile: { x: detail.anchorTile.x, y: detail.anchorTile.y },
      });
    }
    for (const requirement of detail.requirements) {
      if (requirement.status !== 'missing-capability') continue;
      needs.push({
        kind: 'object',
        instanceId: detail.instanceId,
        roomLabelKey: detail.roomNameKey,
        tile: { x: detail.anchorTile.x, y: detail.anchorTile.y },
        // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
        // is on, so "the catalogue names no object" has to be an absent
        // property and not a present one holding nothing.
        ...(requirement.objectNameKey === undefined ? {} : { objectLabelKey: requirement.objectNameKey }),
        ...missingQuantityOf(requirement),
      });
    }
  }

  return { unfinishedRooms, totalRooms: list.totals.instances, totalNeeds, needs, atCapacity: atCapacityFrom(list) };
}

export class RoomNeedsReader {
  private readonly requester: SimulationProjectionRequester;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  /**
   * One list read, then one detail read per unfinished room until the panel has
   * as many rooms as it can draw.
   *
   * **At most `1 + ROOM_NEEDS_ROOMS_LIMIT` messages**, which today is two, and
   * that is a bound on *requests* rather than on needs named. The loop stops
   * on the panel's room budget rather than on the room count, so the cost is
   * bounded by what the panel can show and not by how many rooms are unfinished
   * -- and the header's counts come from the list, which is one message however
   * large the prison is.
   *
   * **The budget used to be `ROOM_NEEDS_NAMED_LIMIT` and #529 split the two
   * apart.** One constant served as both "how many rooms to ask about" and "how
   * many lines to draw" only because both were 1; once the panel began naming
   * every object a room is short, they became different quantities -- a single
   * detail reply now yields up to three lines. Reusing the item budget as the
   * request budget after that change would have asked the worker for three
   * rooms to fill lines the first room already filled.
   *
   * The sentence was **false as written**: the budget it named was spent in
   * needs, and a detail that answered with no `view` named none, so the loop
   * asked about the next room instead of stopping. Eight unfinished cells whose
   * details all raced away cost nine requests, not two
   * (`tests/unit/ui-simulation-room-needs.test.ts` pins the figure), which is
   * the unbounded-in-the-prison read the paragraph existed to deny.
   *
   * A detail that comes back with no `view` is dropped, not an error: the room
   * was removed between the two requests, which is the race
   * `ProjectionReply.view`'s own comment says a caller is expected to handle.
   * It still costs one of the two messages, because it was one of the two
   * messages.
   *
   * `undefined` while another read is in flight. A caller on a cadence must not
   * queue a second question about a prison it has not heard the answer for
   * once, and returning rather than throwing keeps that a non-event: the next
   * publication asks again.
   */
  public async read(): Promise<HudRoomNeedsViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      // No `limit`: the projection's own default window is the right one here,
      // and naming a number would put a copy of a simulation bound on this side
      // of the boundary.
      const list = await this.requester.request<RoomListViewModel>('hud/room-list');
      if (list.view === undefined) return undefined;

      const details: RoomDetailViewModel[] = [];
      // Questions asked, not needs found. Counting needs made the loop's stop
      // condition depend on what came *back*, so a detail that answered with no
      // view -- the unzoned-in-between race two paragraphs below calls expected,
      // and equally a room that finished between the two reads -- left the
      // budget untouched and the loop moved to the next room. That made the real
      // bound `1 + unfinishedRoomIds(list).length`: measured at nine requests
      // with eight unfinished cells, on a reader the Rooms tab drives on the
      // counts cadence. A question costs the worker whether or not it is
      // answered, so a question is what the budget has to be spent in.
      //
      // **"the counts cadence" is kept and corrected (2026-09-02, issues #718
      // and #765): this reader does not ride it.** What makes the Rooms tab ask
      // is the worker's clock heartbeat -- `CLOCK_STATE_PUBLISH_INTERVAL_MS` is
      // 250 against the counts channel's 500, and the counts channel is
      // change-gated where the heartbeat is not, so a prison with nobody housed
      // publishes counts **once** in thirty seconds and refreshes this readout
      // **120 times** (ADR 0086 §3). Nine requests per drive at up to about
      // four drives a second is twice the traffic this paragraph priced, which
      // is an argument for the budget rather than against it. The spacing is
      // `ceil(250 / 15) * 15` = 255 ms on the harness, 292.8-299.6 ms measured
      // in a browser (PR #762).
      //
      // The counters coincide in the ordinary case -- a detail for a room the
      // list called unfinished names at least one missing requirement -- so this
      // changes nothing about what a settled prison shows. What it gives up is a
      // raced tick naming one fewer thing than it might have; the next
      // publication asks again, off a list that no longer holds the room that
      // moved, and the header's counts come from that list either way.
      let asked = 0;
      for (const instanceId of unfinishedRoomIds(list.view)) {
        if (asked >= ROOM_NEEDS_ROOMS_LIMIT) break;
        asked += 1;
        const reply = await this.requester.request<RoomDetailViewModel>('hud/room-detail', {
          target: { kind: 'id', id: instanceId },
        });
        if (reply.view === undefined) continue;
        details.push(reply.view);
      }

      return roomNeedsFromProjections(list.view, details);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
