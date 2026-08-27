import type { RoomDetailViewModel, RoomListViewModel } from '../simulation/presentation/room-projection';
import { ROOM_NEEDS_NAMED_LIMIT, type HudRoomNeedViewModel, type HudRoomNeedsViewModel } from './hud';
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
 * The rooms the projection says are missing something, in its own order.
 *
 * `requirementSummary.missingCapability` is the verdict, read and not
 * recomputed: this predicate is `> 0` and nothing else. Deriving "unfinished"
 * here from `objectCapabilities` -- which the same row carries -- would put a
 * second definition of the rule on the main thread, and the second definition
 * is the one that drifts.
 *
 * The order is `RoomListViewModel.rooms.rows`'s own, which is ascending
 * instance id (`tests/determinism/projection-ordering.test.ts` pins it). That
 * matters because it decides which rooms get named when there are more than
 * there is room for: the choice is the projection's canonical order rather than
 * whatever order a map iterated in.
 */
export function unfinishedRoomIds(list: RoomListViewModel): readonly string[] {
  return list.rooms.rows
    .filter((row) => row.requirementSummary.missingCapability > 0)
    .map((row) => row.instanceId);
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
export function roomNeedsFromProjections(
  list: RoomListViewModel,
  details: readonly RoomDetailViewModel[],
): HudRoomNeedsViewModel {
  const rows = list.rooms.rows;
  let unfinishedRooms = 0;
  let totalNeeds = 0;
  for (const row of rows) {
    const missing = row.requirementSummary.missingCapability;
    if (missing <= 0) continue;
    unfinishedRooms += 1;
    totalNeeds += missing;
  }

  const needs: HudRoomNeedViewModel[] = [];
  for (const detail of details) {
    if (detail.roomNameKey === undefined) continue;
    for (const requirement of detail.requirements) {
      if (requirement.status !== 'missing-capability') continue;
      if (needs.length >= ROOM_NEEDS_NAMED_LIMIT) break;
      needs.push({
        instanceId: detail.instanceId,
        roomLabelKey: detail.roomNameKey,
        tile: { x: detail.anchorTile.x, y: detail.anchorTile.y },
        // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
        // is on, so "the catalogue names no object" has to be an absent
        // property and not a present one holding nothing.
        ...(requirement.objectNameKey === undefined ? {} : { objectLabelKey: requirement.objectNameKey }),
      });
    }
    if (needs.length >= ROOM_NEEDS_NAMED_LIMIT) break;
  }

  return { unfinishedRooms, totalRooms: list.totals.instances, totalNeeds, needs };
}

export class RoomNeedsReader {
  private readonly requester: SimulationProjectionRequester;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  /**
   * One list read, then one detail read per unfinished room until the panel's
   * rows are full.
   *
   * **At most `1 + ROOM_NEEDS_NAMED_LIMIT` messages**, which today is two, and
   * that is now a bound on *requests* rather than on needs named. The loop stops
   * on the panel's naming budget rather than on the room count, so the cost is
   * bounded by what the panel can show and not by how many rooms are unfinished
   * -- and the header's counts come from the list, which is one message however
   * large the prison is.
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
      // The counters coincide in the ordinary case -- a detail for a room the
      // list called unfinished names at least one missing requirement -- so this
      // changes nothing about what a settled prison shows. What it gives up is a
      // raced tick naming one fewer thing than it might have; the next
      // publication asks again, off a list that no longer holds the room that
      // moved, and the header's counts come from that list either way.
      let asked = 0;
      for (const instanceId of unfinishedRoomIds(list.view)) {
        if (asked >= ROOM_NEEDS_NAMED_LIMIT) break;
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
