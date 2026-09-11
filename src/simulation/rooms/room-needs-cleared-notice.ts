import { defaultObjectRegistry, type ObjectDefinition } from '../../content/object-catalog';
import { defaultRoomContentRegistry, type RoomCatalogDefinition } from '../../content/room-catalog';
import type { ContentRegistry } from '../../content/registry';
import type { SimulationEventLog } from '../events';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { DAY_LENGTH_TICKS } from '../prisoners/regime';
import { projectRoomList, type RoomObjectSource, type RoomProjectionSource } from '../presentation';
import type { RoomDoorReader, RoomEdgeReader } from './enclosure';
import type { RoomRegionGraphSource } from './reachability';

/**
 * Requested once per scheduled read, large enough that no session's room
 * count ever truncates it.
 *
 * `projectRoomList` already builds every row before this ever sees one --
 * `allRows` there is `instances.map(...)`, unconditioned on `request` -- and
 * only its *returned* `rooms.rows` field is windowed by `pageOf`. So this
 * buys nothing in cost and everything in correctness: a caller that left the
 * default (100) would silently stop watching every room past the hundredth,
 * which is exactly the under-count `HudRoomNeedsViewModel`'s own comment
 * already discloses about the HUD's badge. This system has no such excuse,
 * because it pays the `O(instances)` cost either way.
 */
const UNPAGED_ROOM_LIST_LIMIT = Number.MAX_SAFE_INTEGER;

/**
 * Fires a one-off, per-instance notice the day a room stops being short of
 * anything the Rooms panel's own `NOT READY` block checks for
 * ([#1006](https://github.com/matmaxalez/lockstate/issues/1006) finding 3).
 *
 * ## The defect, in the issue's own terms
 *
 * The panel's `NOT READY` block simply *disappears* the moment a room's
 * shortfall reaches zero; nothing replaces it, and the alerts column carries
 * no record that a repair happened at all -- unlike a designation, which
 * gets `rooms.zoned`'s *"{room} designated."* `src/ui/hud/messages.ts`
 * (`hud.rooms.needs`'s own docblock) already argues, correctly, that the
 * panel itself must not grow an "every room is ready" line: it measured the
 * always-visible readout's own height budget at 7.9px (ADR 0022) and a
 * three-row list at 101.3px, which is the panel's whole argument. #1006
 * accepts that argument for the *panel* and says it is not an argument
 * against a *one-off alert* in the column that already carries the
 * designation notice -- a different surface with a different (scrolling,
 * historical) budget.
 *
 * ## What "short of something" means, restated rather than borrowed
 *
 * `roomNeedsFromProjections` (`src/ui/simulation-room-needs.ts`) defines the
 * panel's own predicate as `shortfallOf(row) = row.requirementSummary
 * .missingCapability + (row.access === 'no-way-in' ? 1 : 0)` -- every
 * `object` requirement not yet held in the quantity the room's definition
 * asks for, plus one more if the perimeter holds no doorway at all. `update`
 * below computes the identical sum from the identical two
 * `RoomListRowViewModel` fields, because the two must not be able to
 * disagree about which rooms this fires for -- and it is restated rather
 * than imported because that module lives under `src/ui/`, which a
 * worker-side tick system may not depend on (`AGENTS.md` boundary 3: the
 * main thread owns the HUD, the worker owns the tick).
 *
 * ## What this event must not claim, argued before any word was chosen
 *
 * `row.access` reads `'doorway'` the moment `roomPerimeterAccess`
 * (`enclosure.ts`) finds *any* door in the room's perimeter -- issue #1006's
 * own comment: it "never asks whether anything can reach that door" -- so a
 * cell whose only door is walled in from outside reads exactly as
 * `shortfallOf === 0` as a working one, and #938 already measured a
 * doorless-from-outside room at hygiene 0 of 255 with 162 route failures.
 * So `shortfallOf(row) === 0` is true of "the panel's checklist is clear"
 * and **not** of "a prisoner can reach this room", and
 * `hud.alert.event.rooms.needs-cleared`'s own docblock in
 * `src/content/default-locale-en.ts` is where that boundary is kept in the
 * sentence itself. Whether `roomPerimeterAccess` should answer about
 * reachability instead of edge adjacency is the issue's own reserved
 * decision and this class does not touch, work around, or add a check for
 * it -- it reads the function's existing answer exactly as the HUD does.
 *
 * ## Why a system that scans every room, rather than a hook at every place
 * `missingCapability` or `access` can move
 *
 * The two facts have no one call site each. An object finishing construction
 * (`ObjectPlacementService.onOrderCompleted`) can clear the first; so can a
 * removed object make it worse again. A completed door order writes
 * `DOOR_EDGE_NUMERIC_ID` into an edge the room's perimeter reads, and that
 * write today "registers nothing" with any room-facing consumer at all
 * (`ConstructionSystem`'s door arm, `system.ts:346`) -- there is no existing
 * hook to attach to for the second fact. Recomputing both from
 * `projectRoomList`, the one function every rendered readout already goes
 * through, is the one mechanism guaranteed to see every route that can move
 * either fact, including one nobody has written yet.
 *
 * ## Why once a day and not every tick
 *
 * Rooms number in the hundreds and `roomPerimeterAccess` walks
 * `2 * (width + height)` edges per instance -- cheap for the one HUD poll it
 * was sized for (`projectRoomList`'s own comment: "unlike the prisoner
 * roster this is not an actor-tier concern"), and a different cost
 * multiplied by every tick of a session that can run for simulated years.
 * This runs on `PayrollSystem`'s own cadence -- once per in-game day, its
 * last tick -- so a repair is confirmed within a day rather than never
 * (which is what #1006 measured), at a cost bounded the same way
 * `PayrollSystem`'s own daily bill is bounded. **Stated rather than hidden:
 * a room repaired and broken again inside one in-game day announces
 * nothing**, because there is nothing to compare against until the next
 * scheduled read.
 *
 * ## No count and no coordinates, and one event per instance
 *
 * The same two reasons `rooms.zoned` carries neither: the player who fixed a
 * room already knows which one, and carrying a rectangle would give every
 * repair a distinct `simulationEventIdentity` where the room type alone lets
 * a run of same-type repairs collapse into one counted row. One event per
 * instance crossing the threshold, exactly as `prisoners.relocated` is one
 * per resident rather than a batch total -- a day that repairs three cells
 * reports three of these.
 *
 * ## Determinism and restore
 *
 * A pure read of live state (`projectRoomList` touches nothing) compared
 * against an in-memory `Set`, on a fixed schedule -- no RNG stream taken, so
 * two runs of the same command stream cross the same threshold on the same
 * tick. `this.ready` keeps the same `seeded` idiom `InsolvencyRungSystem`
 * does: its first `update()` call after construction -- fresh session or
 * restored one, since `restoreSessionSystems` runs before the kernel ever
 * steps -- seeds every instance's current state silently, so a session that
 * reloads with every room already fine announces nothing. Only a transition
 * observed *between* two of this system's own reads is a real crossing.
 */
export class RoomNeedsClearedNoticeSystem implements SystemRegistration {
  public readonly id = 'rooms.needs-cleared-notice';
  /**
   * After `economy.insolvency-rungs` (135) and before `navigation` (150), an
   * unused slot: this reads room, door and placed-object state, all of which
   * a command handler or `construction` (100) has already settled for the
   * tick by this point, and nothing between here and `navigation` writes any
   * of the three.
   */
  public readonly order = 140;
  /** Once per in-game day, on its last tick -- the same boundary `PayrollSystem` runs on, and for the same reason: see the class comment's "Why once a day". */
  public readonly schedule = { intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 };

  /** Instance ids this system currently believes are not short of anything. */
  private readonly ready = new Set<string>();
  private seeded = false;

  public constructor(
    private readonly source: RoomProjectionSource,
    private readonly placedObjects: RoomObjectSource,
    private readonly edges: RoomEdgeReader,
    private readonly doors: RoomDoorReader,
    /**
     * The region partition, read through its holder rather than handed over as
     * a value: `getGraph()` refreshes a stale graph on the spot, so this
     * system's `order = 140` reading it before `navigation`'s 150 still gets a
     * graph current for the tick. See `RoomRegionGraphSource`.
     */
    private readonly regions: RoomRegionGraphSource,
    private readonly events: SimulationEventLog,
    private readonly rooms: ContentRegistry<RoomCatalogDefinition> = defaultRoomContentRegistry,
    private readonly objects: ContentRegistry<ObjectDefinition> = defaultObjectRegistry,
  ) {}

  public update(context: SimulationContext): void {
    const list = projectRoomList(
      this.source,
      { limit: UNPAGED_ROOM_LIST_LIMIT },
      {
        rooms: this.rooms,
        objects: this.objects,
        placedObjects: this.placedObjects,
        perimeter: { edges: this.edges, doors: this.doors, regions: this.regions.getGraph() },
      },
    );

    const seenInstanceIds = new Set<string>();
    for (const row of list.rooms.rows) {
      seenInstanceIds.add(row.instanceId);
      // The panel's own predicate, restated rather than imported -- see the
      // class comment's "What 'short of something' means".
      const shortfall = row.requirementSummary.missingCapability + (row.access === 'no-way-in' || row.access === 'unreachable' ? 1 : 0);
      const isReady = shortfall === 0;
      const wasReady = this.ready.has(row.instanceId);
      if (isReady === wasReady) continue;
      if (isReady) {
        this.ready.add(row.instanceId);
        // The seeding pass (see class comment) establishes the baseline
        // silently; only a transition discovered on a *later* call is a
        // real crossing. `roomNameKey` is absent only for an instance whose
        // catalog id this build does not define, which is unreachable with
        // the shipped catalogues (`collectRoomInstances` enumerates *by*
        // catalog id) and is skipped rather than guessed at, the same
        // reading `roomNeedsFromProjections` gives the identical absence.
        if (this.seeded && row.roomNameKey !== undefined) {
          this.events.recordRoomNeedsCleared(row.roomNameKey, context.tick);
        }
      } else {
        this.ready.delete(row.instanceId);
      }
    }

    // Drop any instance this pass did not see -- removed since the last read
    // -- so a reused instance id can never read as "still ready" from a room
    // that no longer exists. `list.rooms.rows` is the unpaged set (see
    // `UNPAGED_ROOM_LIST_LIMIT`), so "not seen" means "no longer registered",
    // never "outside the window".
    for (const instanceId of this.ready) {
      if (!seenInstanceIds.has(instanceId)) this.ready.delete(instanceId);
    }

    this.seeded = true;
  }
}
