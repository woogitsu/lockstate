import type { ContentRegistry } from '../../content/registry';
import { defaultSecurityGradeRegistry, type SecurityGradeDefinition } from '../../content/security-grade-catalog';
import type { DoorDefinition, DoorRegistry, DoorSide, DoorState } from '../navigation/door';
import type { TilePosition } from '../world/coordinates';

/**
 * Builds a door whose access requirements come from a security grade
 * (issue #26: sectors have "grades/classification policy," "not merely
 * decorative overlays" -- the Context section's explicit words). A door
 * gating entry into a sector should be authored through this, not with
 * hand-picked `requiredSecurityClearance`/`requiredPermission` values that
 * could silently drift from the sector's own stated grade.
 */
export function createGradedDoor(
  id: string,
  position: TilePosition,
  side: DoorSide,
  state: DoorState,
  gradeId: string,
  options?: { readonly costMultiplier?: number },
  gradeRegistry: ContentRegistry<SecurityGradeDefinition> = defaultSecurityGradeRegistry,
): DoorDefinition {
  const grade = gradeRegistry.getById(gradeId);
  if (grade === undefined) throw new RangeError(`Unknown security grade id "${gradeId}".`);
  return {
    id,
    position,
    side,
    state,
    requiredSecurityClearance: grade.minSecurityClearance,
    ...(grade.requiredPermission !== undefined ? { requiredPermission: grade.requiredPermission } : {}),
    costMultiplier: options?.costMultiplier ?? 1,
  };
}

export type SectorControlState = 'normal' | 'restricted' | 'lockdown';

/**
 * Static definition of one security sector -- issue #26's "sectors/zoning
 * records with stable IDs and grades/classification policy." `doorIds`
 * names every door this sector governs (its perimeter, from #21's
 * `DoorRegistry`); `postTile` is where a deployed guard stands with no
 * assigned patrol; `patrolRoute` (optional) is an ordered loop of waypoint
 * tiles a deployed guard walks repeatedly (issue #26's "patrol route
 * definitions" as a *separate* concern from deployment itself -- a sector
 * can have static coverage with no patrol route at all).
 */
export interface SecuritySectorDefinition {
  readonly id: string;
  readonly gradeId: string;
  readonly doorIds: readonly string[];
  readonly postTile: TilePosition;
  readonly patrolRoute?: readonly TilePosition[];
  /** Authored budget for one full patrol loop; exceeding it records a late (not missed) completion. Meaningless if `patrolRoute` is absent. */
  readonly expectedPatrolLoopTicks?: number;
}

/**
 * Like sessions do not fabricate room instances (#24), a sector's static
 * definition is assumed re-registered identically by session/scenario setup
 * before `loadSnapshot` runs -- only the *mutable* control state is part of
 * the snapshot, matching `RoomInstanceRegistry`'s "occupancy only" restore
 * scope.
 */
export class SecuritySectorRegistry {
  private readonly definitions = new Map<string, SecuritySectorDefinition>();
  private readonly controlStates = new Map<string, SectorControlState>();
  /** Each governed door's state at the moment its sector was registered -- the baseline `'normal'` restores to. */
  private readonly normalDoorStates = new Map<string, DoorState>();

  public constructor(private readonly doors: DoorRegistry) {}

  public register(definition: SecuritySectorDefinition): void {
    if (this.definitions.has(definition.id)) throw new RangeError(`Duplicate security sector id "${definition.id}".`);
    for (const doorId of definition.doorIds) {
      const door = this.doors.getById(doorId);
      if (door === undefined) throw new RangeError(`Security sector "${definition.id}" references unknown door id "${doorId}".`);
      this.normalDoorStates.set(doorId, door.state);
    }
    this.definitions.set(definition.id, definition);
    this.controlStates.set(definition.id, 'normal');
  }

  public getDefinition(id: string): SecuritySectorDefinition | undefined {
    return this.definitions.get(id);
  }

  public requireDefinition(id: string): SecuritySectorDefinition {
    const definition = this.definitions.get(id);
    if (definition === undefined) throw new RangeError(`Unknown security sector id "${id}".`);
    return definition;
  }

  public getControlState(id: string): SectorControlState {
    const state = this.controlStates.get(id);
    if (state === undefined) throw new RangeError(`Unknown security sector id "${id}".`);
    return state;
  }

  /** Deterministic: sorted by id. */
  public all(): readonly SecuritySectorDefinition[] {
    return [...this.definitions.keys()].sort().map((id) => this.definitions.get(id)!);
  }

  /**
   * Explicit command, not a per-tick scan (architecture notes: "emergency
   * overrides are explicit commands/state transitions, not scattered
   * booleans"). Cascades to every door the sector governs via #21's
   * `DoorRegistry.setState` -- the only door mutation entry point that
   * exists, so this never bypasses #21's own access-revision/cache
   * invalidation. `'normal'` restores each door to its state at sector
   * registration time; `'restricted'` closes every governed door whose
   * *baseline* state wasn't already `'locked'` (a door that's always
   * locked, e.g. a vault, stays locked; everything else tightens to
   * `'closed'` -- still passable with the right clearance/permission, at a
   * higher traversal cost); `'lockdown'` locks all of them (passable only
   * via `RouteContext.emergencyOverride`). Each transition is computed from
   * the door's baseline, never its just-prior control state, so repeated
   * transitions (e.g. lockdown then restricted) are order-independent.
   */
  public setControlState(id: string, state: SectorControlState): void {
    const definition = this.requireDefinition(id);
    this.controlStates.set(id, state);

    for (const doorId of definition.doorIds) {
      if (state === 'normal') {
        this.doors.setState(doorId, this.normalDoorStates.get(doorId)!);
      } else if (state === 'restricted') {
        const baseline = this.normalDoorStates.get(doorId)!;
        this.doors.setState(doorId, baseline === 'locked' ? 'locked' : 'closed');
      } else {
        this.doors.setState(doorId, 'locked');
      }
    }
  }

  /**
   * Each governed door's baseline state — what `'normal'` restores it to.
   *
   * Exposed read-only for the save payload (issue #70). A door saved while
   * its sector is `'restricted'`/`'lockdown'` is not at its baseline, and the
   * transition is not invertible (`'restricted'` maps both `'open'` and
   * `'closed'` onto `'closed'`), so a save that wrote the live state would
   * make the lockdown permanent: re-registering the sector would adopt
   * `'locked'` as the new baseline. Deterministic: sorted by door id.
   */
  public getBaselineDoorStates(): readonly (readonly [string, DoorState])[] {
    return [...this.normalDoorStates.keys()].sort().map((doorId) => [doorId, this.normalDoorStates.get(doorId)!] as const);
  }

  public getSnapshot(): readonly (readonly [string, SectorControlState])[] {
    return [...this.controlStates.keys()].sort().map((id) => [id, this.controlStates.get(id)!] as const);
  }

  /** Restores only control state -- reapplies `setControlState` per sector so governed doors end up consistent with the restored state, not merely relying on the doors themselves having been separately restored. */
  public loadSnapshot(snapshot: readonly (readonly [string, SectorControlState])[]): void {
    for (const [id, state] of snapshot) {
      if (!this.definitions.has(id)) continue; // scenario setup did not re-register this sector this time; nothing to restore onto
      this.setControlState(id, state);
    }
  }
}
