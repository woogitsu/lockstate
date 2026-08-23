import { EntityStore, type EntityId, type EntityStoreSnapshot } from '../entity/entity-store';
import { tileCoordinate, type TilePosition } from '../world/coordinates';

/**
 * `'on-search'` (issue #27) is a guard temporarily pulled onto search duty
 * -- entirely `contraband/search-system.ts`'s own bookkeeping via the
 * existing `setDeploymentPhase`/`unassign`. Neither `DeploymentSystem` nor
 * `PatrolSystem` ever assigns, reads meaning into, or transitions a guard
 * out of this phase: `DeploymentSystem.assignUnassignedGuards` only pulls
 * from `unassignedGuardIds()` (`'unassigned'` only) and its travel-
 * continuation loop only touches guards whose phase is exactly
 * `'travelling'`, so an `'on-search'` guard is invisible to both --
 * exactly like `'on-post'` already is. This is why search duty needed no
 * changes to `sector.ts`/`deployment-system.ts`/`patrol-system.ts`.
 */
export type DeploymentPhase = 'unassigned' | 'travelling' | 'on-post' | 'on-search';

interface GuardRecord {
  staffRoleId: string;
  tileX: number;
  tileY: number;
  sectorId: string | undefined;
  deploymentPhase: DeploymentPhase;
  pathRequestId: string | undefined;
  /** Index of the patrol waypoint currently being travelled to (0-based); `-1` means "returning to post" after the last waypoint. `undefined` while not patrolling. */
  patrolWaypointIndex: number | undefined;
  patrolLoopStartedAtTick: number | undefined;
}

/**
 * The minimal, real (not mocked) staff/guard entity representation issue
 * #26 needs -- the first production wiring of `EntityStore` for a *staff*
 * entity, matching #24's precedent of "first production wiring... for
 * prisoners." Deliberately not a full hot-SoA-component treatment like
 * `PrisonerRecordComponent`/`NeedsComponent`: realistic guard headcounts
 * (tens, not thousands) don't need per-tick-array-scan performance, so
 * every field lives in a small `Map`, exactly like `PrisonerColdState`'s
 * "cold, rarely-mutated metadata" half of ADR 0005's split -- there is no
 * hot half here because nothing about a guard roster is a per-tick hot
 * path at this scale.
 */
export class GuardRoster {
  public readonly entityStore: EntityStore;
  private readonly records = new Map<EntityId, GuardRecord>();

  public constructor(capacity: number) {
    this.entityStore = new EntityStore(capacity);
  }

  public hire(staffRoleId: string, originTile: TilePosition): EntityId {
    const entityId = this.entityStore.spawn();
    this.records.set(entityId, {
      staffRoleId,
      tileX: originTile.x,
      tileY: originTile.y,
      sectorId: undefined,
      deploymentPhase: 'unassigned',
      pathRequestId: undefined,
      patrolWaypointIndex: undefined,
      patrolLoopStartedAtTick: undefined,
    });
    return entityId;
  }

  private require(entityId: EntityId): GuardRecord {
    const record = this.records.get(entityId);
    if (record === undefined) throw new RangeError(`Unknown guard entity id ${entityId}.`);
    return record;
  }

  public getStaffRoleId(entityId: EntityId): string {
    return this.require(entityId).staffRoleId;
  }

  public getTile(entityId: EntityId): TilePosition {
    const record = this.require(entityId);
    return { x: tileCoordinate(record.tileX), y: tileCoordinate(record.tileY) };
  }

  public setTile(entityId: EntityId, tile: TilePosition): void {
    const record = this.require(entityId);
    record.tileX = tile.x;
    record.tileY = tile.y;
  }

  public getSectorId(entityId: EntityId): string | undefined {
    return this.require(entityId).sectorId;
  }

  public getDeploymentPhase(entityId: EntityId): DeploymentPhase {
    return this.require(entityId).deploymentPhase;
  }

  public assignToSector(entityId: EntityId, sectorId: string): void {
    const record = this.require(entityId);
    record.sectorId = sectorId;
    record.deploymentPhase = 'travelling';
  }

  public setDeploymentPhase(entityId: EntityId, phase: DeploymentPhase): void {
    this.require(entityId).deploymentPhase = phase;
  }

  public unassign(entityId: EntityId): void {
    const record = this.require(entityId);
    record.sectorId = undefined;
    record.deploymentPhase = 'unassigned';
    record.pathRequestId = undefined;
    record.patrolWaypointIndex = undefined;
    record.patrolLoopStartedAtTick = undefined;
  }

  public getPathRequestId(entityId: EntityId): string | undefined {
    return this.require(entityId).pathRequestId;
  }

  public setPathRequestId(entityId: EntityId, requestId: string | undefined): void {
    this.require(entityId).pathRequestId = requestId;
  }

  public getPatrolWaypointIndex(entityId: EntityId): number | undefined {
    return this.require(entityId).patrolWaypointIndex;
  }

  public setPatrolWaypointIndex(entityId: EntityId, index: number | undefined): void {
    this.require(entityId).patrolWaypointIndex = index;
  }

  public getPatrolLoopStartedAtTick(entityId: EntityId): number | undefined {
    return this.require(entityId).patrolLoopStartedAtTick;
  }

  public setPatrolLoopStartedAtTick(entityId: EntityId, tick: number | undefined): void {
    this.require(entityId).patrolLoopStartedAtTick = tick;
  }

  /** Deterministic: ascending entity id. */
  public allGuardIds(): readonly EntityId[] {
    return [...this.records.keys()].sort((a, b) => a - b);
  }

  /** Deterministic: ascending entity id. */
  public unassignedGuardIds(): readonly EntityId[] {
    return this.allGuardIds().filter((id) => this.require(id).deploymentPhase === 'unassigned');
  }

  public getSnapshot(): { readonly entityStore: EntityStoreSnapshot; readonly records: readonly (readonly [EntityId, GuardRecord])[] } {
    return { entityStore: this.entityStore.getSnapshot(), records: this.allGuardIds().map((id) => [id, { ...this.require(id) }] as const) };
  }

  /**
   * A guard mid-`'travelling'` (deployment *or* patrol leg) referenced a
   * path request against the *previous* `NavigationSystem` instance's
   * queue -- a fresh one never received it and would never resolve it. On
   * restore, such a guard drops back to `'on-post'` with no patrol waypoint
   * if it has a sector (deployment already happened once; `PatrolSystem`
   * restarts the loop from wherever the guard's tile actually is) or
   * `'unassigned'` otherwise, exactly like `PrisonerOperationsRuntime` and
   * `JobBoard` reset stale in-flight travel on restore.
   */
  public loadSnapshot(snapshot: ReturnType<GuardRoster['getSnapshot']>): void {
    this.entityStore.loadSnapshot(snapshot.entityStore);
    this.records.clear();
    for (const [entityId, record] of snapshot.records) {
      const restored: GuardRecord = { ...record };
      if (restored.deploymentPhase === 'travelling') {
        restored.pathRequestId = undefined;
        restored.deploymentPhase = restored.sectorId === undefined ? 'unassigned' : 'on-post';
        // `undefined`, not `0`: PatrolSystem only treats an `'on-post'` guard
        // as "idle, start/resume a loop" when this is `undefined` --
        // `beginLoop` always starts a fresh loop at waypoint 0 regardless,
        // so this is exactly the state a guard that never started patrolling
        // would be in, and resumes correctly on the next scheduled tick.
        restored.patrolWaypointIndex = undefined;
      }
      this.records.set(entityId, restored);
    }
  }
}
