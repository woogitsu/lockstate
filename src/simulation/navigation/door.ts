import type { TilePosition } from '../world/coordinates';
import { tileKey } from '../world/coordinates';

/**
 * A door lives on a specific tile edge, using the same axis convention as
 * `SparseWorld.getLeftEdge`/`getTopEdge`: `side: 'left'` is the boundary
 * between `position` and its west neighbor; `side: 'top'` is the boundary
 * between `position` and its north neighbor. A door is independent of the
 * world's raw wall geometry — the wall/edge numericId says a boundary
 * exists there at all; the door registry says whether that boundary is a
 * gated opening rather than a solid wall.
 */
export type DoorSide = 'left' | 'top';

/** `locked` is an absolute block regardless of clearance/permission, unless the route context sets `emergencyOverride`. */
export type DoorState = 'open' | 'closed' | 'locked';

export interface DoorDefinition {
  readonly id: string;
  readonly position: TilePosition;
  readonly side: DoorSide;
  readonly state: DoorState;
  /** 0 = no clearance required. */
  readonly requiredSecurityClearance: number;
  readonly requiredPermission?: string;
  /**
   * Relative traversal cost multiplier, `>= MINIMUM_DOOR_COST_MULTIPLIER`
   * and enforced there rather than only stated here. Closed doors cost more
   * than open ones to cross (see `doorTraversalCost`).
   */
  readonly costMultiplier: number;
}

/**
 * The least a door may cost to cross, as a multiple of a plain step between
 * two adjacent tiles.
 *
 * **Not a balance number, and not independently choosable**: it is equal to
 * `local-search.ts`'s `PLAIN_STEP_COST` because `boundedLocalSearch`'s
 * Manhattan heuristic charges exactly one step per remaining tile and never
 * reopens a closed tile. A door cheaper than a step makes that heuristic
 * overestimate the remaining cost, and the A* then returns a route that is
 * not the cheapest one inside its own bound -- silently, since a longer
 * route is still a route. `heuristic`'s own comment carries the full
 * argument; this constant is the half that is enforced.
 *
 * The docstring on `costMultiplier` above said `>= 1` and nothing checked
 * it, while `save-schema.ts` accepted any finite number from a save on the
 * field beside a bounded neighbour. Both halves are closed now: the schema
 * bounds the value where an authored one can enter, and `register` below
 * covers every other producer -- present and future -- so the precondition
 * is enforced rather than documented.
 *
 * A deliberate cheap-door *feature* would not raise this bound; it would
 * have to change the search (reopening closed nodes, or a heuristic scaled
 * to the cheapest edge in the bound) and say so here.
 */
export const MINIMUM_DOOR_COST_MULTIPLIER = 1;

export function doorEdgeKey(position: TilePosition, side: DoorSide): string {
  return `${side}:${tileKey(position)}`;
}

/**
 * The id a door built by a construction order gets.
 *
 * `docs/NAVIGATION.md` named identity as one of four things undecided about
 * construction-placed doors, and named the reason it could not be left to
 * whoever wrote the call: doors cross the save boundary (`doorsSnapshot` in
 * `runtime/session-systems.ts`) and `buildNavigationGraph` sorts portals by
 * door id, so the minted id decides routing tie-breaks. That is exactly the
 * choice [ADR 0012](../../../docs/adr/0012-derived-identifier-reproducibility.md)
 * requires a declaring module to make explicitly, so it is made here.
 *
 * **A pure function of the edge, never a counter and never
 * `crypto.randomUUID()`** -- the scheme `roomInstanceIdFor` and
 * `placedObjectIdFor` both use, for the reason all three share: the id has to
 * be reproducible from the state it names. It is unique because `register`
 * refuses a second door on an edge that already holds one, so the edge was
 * free a moment earlier and is taken afterwards. It is **not** the build
 * order's id: an order id is a function of how many gestures the player has
 * made, so two prisons with identical geometry would sort their portals
 * differently and route differently.
 *
 * This is neutral on ADR 0012 on the same condition `zoning.ts` and
 * `placed-object.ts` are neutral on it: reproducible from state like a derived
 * value, carried in the save like an allocated identity, because the state it
 * derives from cannot change while the door exists. **A feature that *moves* a
 * door must settle ADR 0012 first.** Removal is safe -- a removed door's id
 * simply stops existing, and rebuilding a door on the same edge mints the same
 * id, which is the correct answer rather than a collision: it is the same door
 * in the same place.
 *
 * The prefix is what keeps it out of the way of the hand-authored ids
 * scenarios and fixtures use (`door-clearance`, `sector-a-north`).
 *
 * **Colon-separated, deliberately not `doorEdgeKey`'s format**, which joins the
 * two coordinates with a comma because it is a `Map` key and never leaves this
 * file. This one is written into the save (`doorsSnapshot`) and read back by
 * `restoreSessionSystems`, so it follows the shape every other persisted
 * derived id in this tree has -- `roomInstanceIdFor`'s `<catalogId>:<x>:<y>`
 * and `placedObjectIdFor`'s `object:<x>:<y>` -- which is also the shape
 * `identifierSchema` accepts and a comma is not.
 *
 * Exported because a test asserting reproducibility must not restate the
 * format.
 */
export function constructedDoorIdFor(position: TilePosition, side: DoorSide): string {
  return `door:${side}:${position.x}:${position.y}`;
}

/**
 * Mutable set of doors keyed by their edge.
 *
 * Two separate revision counters, because they invalidate different
 * things: which edges are gated at all is a *topology* fact (a door
 * always splits a region regardless of its lock state), while whether a
 * given actor may currently cross one is a *traversal-time* fact.
 * - `structuralRevision` increments when a door is added **or removed**,
 *   since those are the two mutations that change the region/portal graph
 *   (`region-graph.ts`). It said "only when a door is added" until doors
 *   became buildable: `ConstructionSystem.cancelOrder`/`undo` reverse a
 *   completed order's geometry on purpose, so a built door has to be
 *   removable, and a removal changes which edges are gated in exactly the way
 *   an addition does. `docs/NAVIGATION.md` recorded that widening as a
 *   precondition for wiring door placement, and this is it.
 * - `accessRevision` increments on every mutation (add, remove or state
 *   change).
 * - each door additionally has its own `getAccessVersion(id)`, bumped only
 *   when *that* door changes, so a route cache can invalidate just the
 *   entries that actually crossed the door that changed (see
 *   route-cache.ts) rather than the whole cache on any lockdown toggle
 *   anywhere in the prison.
 */
export class DoorRegistry {
  private readonly doorsByEdge = new Map<string, DoorDefinition>();
  private readonly doorsById = new Map<string, DoorDefinition>();
  private readonly accessVersionById = new Map<string, number>();
  private _structuralRevision = 0;
  private _accessRevision = 0;

  public get structuralRevision(): number {
    return this._structuralRevision;
  }

  public get accessRevision(): number {
    return this._accessRevision;
  }

  /**
   * Adds a door, refusing a `costMultiplier` the searches cannot route
   * correctly over.
   *
   * The multiplier check throws like the duplicate-edge and duplicate-id
   * checks below, and for the same reason: all three are conditions no
   * caller can recover from at this point, and a registry that quietly
   * accepted one would push the consequence into a search that reports no
   * failure. See `MINIMUM_DOOR_COST_MULTIPLIER`. `NaN`/`Infinity` are
   * refused by the same comparison being written as a finiteness test
   * first -- `NaN < 1` is `false`, so a bare comparison would let `NaN`
   * through and turn every route across the door into `NaN` cost.
   */
  public register(door: DoorDefinition): void {
    if (!Number.isFinite(door.costMultiplier) || door.costMultiplier < MINIMUM_DOOR_COST_MULTIPLIER) {
      throw new RangeError(
        `Door "${door.id}" has costMultiplier ${door.costMultiplier}; a door may not cost less than a plain step (>= ${MINIMUM_DOOR_COST_MULTIPLIER}).`,
      );
    }
    const edgeKey = doorEdgeKey(door.position, door.side);
    if (this.doorsByEdge.has(edgeKey)) {
      throw new RangeError(`A door is already registered at edge "${edgeKey}".`);
    }
    if (this.doorsById.has(door.id)) {
      throw new RangeError(`Duplicate door id "${door.id}".`);
    }
    this.doorsByEdge.set(edgeKey, door);
    this.doorsById.set(door.id, door);
    this.accessVersionById.set(door.id, 0);
    this._structuralRevision += 1;
    this._accessRevision += 1;
  }

  /**
   * Takes a door out of the registry, and reports whether there was one.
   *
   * **Answers `false` rather than throwing on an unknown id**, unlike
   * `setState`, and the asymmetry is deliberate. `setState` on a door that is
   * not there is a caller asking to change something that does not exist --
   * a bug in the caller. A removal of a door that is not there is the
   * *outcome the caller asked for*, and the two callers that reach this both
   * run inside a scheduled system update (`ConstructionSystem.cancelOrder`
   * via `revertConstruction`), where a throw faults the worker. It is the same
   * idempotence `ObjectPlacementService.onOrderReverted` and
   * `PathRequestQueue.cancel` both hold, for the same reason.
   *
   * ## What this does not reach into, and the one hazard it leaves
   *
   * `SecuritySectorRegistry` captures a baseline state per **governed** door
   * at the moment its sector is registered, and `setControlState` calls
   * `DoorRegistry.setState` for every id in `sector.doorIds` -- which throws on
   * an id this method has removed. That is unreachable today and is a fact
   * about the code rather than a hope: `SecuritySectorRegistry.register`
   * throws on a door id that is not already registered, so a sector can only
   * name doors that existed when the sector did, and nothing in `src/`
   * registers a sector after a build order completes (the only two callers are
   * scenario setup and `restoreSessionSystems`). **A surface that let a player
   * put a built door into a sector would have to answer this**, and the answer
   * is a decision about what a sector does when its perimeter is demolished --
   * not something to settle inside a removal.
   *
   * `RouteCache`/`FlowFieldCache` are not invalidated by this either, because
   * they key on `NavigationGraph.geometrySignature` and not on
   * `structuralRevision` (`docs/NAVIGATION.md` records the hazard). Removing a
   * *built* door is safe regardless: it reaches here from
   * `ConstructionSystem.revertConstruction`, which rewrites the tile edge in
   * the same call and therefore bumps the chunk's geometry revision.
   */
  public unregister(id: string): boolean {
    const door = this.doorsById.get(id);
    if (door === undefined) return false;
    this.doorsById.delete(id);
    this.doorsByEdge.delete(doorEdgeKey(door.position, door.side));
    this.accessVersionById.delete(id);
    this._structuralRevision += 1;
    this._accessRevision += 1;
    return true;
  }

  public getByEdge(position: TilePosition, side: DoorSide): DoorDefinition | undefined {
    return this.doorsByEdge.get(doorEdgeKey(position, side));
  }

  public getById(id: string): DoorDefinition | undefined {
    return this.doorsById.get(id);
  }

  /** Bumped only when this specific door's state changes; see the class doc for why. */
  public getAccessVersion(id: string): number {
    return this.accessVersionById.get(id) ?? 0;
  }

  public setState(id: string, state: DoorState): void {
    const door = this.doorsById.get(id);
    if (door === undefined) throw new RangeError(`Unknown door id "${id}".`);
    const updated: DoorDefinition = { ...door, state };
    this.doorsById.set(id, updated);
    this.doorsByEdge.set(doorEdgeKey(door.position, door.side), updated);
    this.accessVersionById.set(id, this.getAccessVersion(id) + 1);
    this._accessRevision += 1;
  }

  /**
   * Every door, in ascending id (code-unit order), never `Map` insertion
   * order -- the same contract every other registry `all()` in the codebase
   * holds (`ContentRegistry`, `SecuritySectorRegistry`, `GangRegistry`).
   *
   * This returned insertion order until #132. Nothing observably depended on
   * it: the one production caller (`doorsSnapshot` in
   * `runtime/session-systems.ts`) sorts what it gets, and the security
   * projection looks doors up by sorted `sector.doorIds` instead. But
   * `docs/DETERMINISM.md` ("Canonical iteration order") states the rule for
   * anything feeding simulation state with no exception, and an accessor that
   * hands out registration history is a trap for the next caller rather than
   * a safe default.
   */
  public all(): readonly DoorDefinition[] {
    return [...this.doorsById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
