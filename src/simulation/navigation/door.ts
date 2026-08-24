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
  /** Relative traversal cost multiplier, >= 1. Closed doors cost more than open ones to cross (see `doorTraversalCost`). */
  readonly costMultiplier: number;
}

export function doorEdgeKey(position: TilePosition, side: DoorSide): string {
  return `${side}:${tileKey(position)}`;
}

/**
 * Mutable set of doors keyed by their edge.
 *
 * Two separate revision counters, because they invalidate different
 * things: which edges are gated at all is a *topology* fact (a door
 * always splits a region regardless of its lock state), while whether a
 * given actor may currently cross one is a *traversal-time* fact.
 * - `structuralRevision` increments only when a door is added, since only
 *   that changes the region/portal graph (`region-graph.ts`).
 * - `accessRevision` increments on every mutation (add or state change).
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

  public register(door: DoorDefinition): void {
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
