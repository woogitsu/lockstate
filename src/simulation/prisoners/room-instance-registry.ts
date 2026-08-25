import type { EntityId } from '../entity/entity-store';
import type { TilePosition } from '../world/coordinates';

/**
 * A concrete, placed instance of a #23 room-catalog definition, with a
 * navigable anchor tile and occupancy capacity.
 *
 * **Explicit scope assumption** (AGENTS.md: "state assumptions when
 * requirements are underspecified"): #23's content catalog does not track
 * individual placed room instances or which objects physically sit in which
 * room, and real object-placement tracking does not exist yet. (#17's
 * `RoomSystem` did not either: it validated an ad-hoc topology/zoning pair
 * with a mocked body, and #123 item 2 deleted it.)
 * `RoomInstanceRegistry` is the minimal, real (not mocked) layer #24
 * needs to make cell/room assignment meaningful: instances are registered
 * explicitly, with `objectCapabilities` stated up front rather than
 * derived from a placement system that doesn't exist. Building the real
 * object-placement/instance-discovery system belongs to construction/rooms
 * work, not this issue.
 */
export interface RoomInstance {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  readonly anchorTile: TilePosition;
  readonly capacity: number;
  readonly objectCapabilities: readonly string[];
}

export class RoomInstanceRegistry {
  private readonly instances = new Map<string, RoomInstance>();
  private readonly occupants = new Map<string, Set<EntityId>>();
  /** Grouped by room-catalog id so `allByRoomCatalogId`/`findAvailable` never scan instances of other room types. */
  private readonly instancesByRoomCatalogId = new Map<string, RoomInstance[]>();
  /** Lazily rebuilt, sorted-by-instanceId cache per room-catalog id; invalidated only for the affected type on `register`, never on assign/release (those don't change which instances exist). */
  private readonly sortedCache = new Map<string, readonly RoomInstance[]>();

  public register(instance: RoomInstance): void {
    if (this.instances.has(instance.instanceId)) {
      throw new RangeError(`Duplicate room instance id "${instance.instanceId}".`);
    }
    this.instances.set(instance.instanceId, instance);
    this.occupants.set(instance.instanceId, new Set());

    const group = this.instancesByRoomCatalogId.get(instance.roomCatalogId);
    if (group === undefined) this.instancesByRoomCatalogId.set(instance.roomCatalogId, [instance]);
    else group.push(instance);
    this.sortedCache.delete(instance.roomCatalogId);
  }

  /**
   * Removes an instance, or answers `false` when there was none to remove.
   *
   * The counterpart to `register`, and it exists because a room designation
   * has to be reversible: `RoomZoningService.unzone` clears the world's zoning
   * plane and this is the half that keeps the registry agreeing with it.
   * Before it, the registry could only grow within a session -- so a room
   * zoned by mistake stayed in every projection, in the status strip's `Rooms`
   * count and in `allByRoomCatalogId` for as long as the session lasted.
   *
   * **It refuses to remove an occupied instance rather than orphaning its
   * occupants.** A prisoner holds an `accommodationInstanceId` in cold state,
   * and dropping the instance underneath them would leave that reference
   * naming a room that does not exist. The caller is expected to have checked
   * `occupancyOf` and to have reported a refusal to the player;
   * `RoomZoningService.unzone` does exactly that, and this `RangeError` is the
   * guard behind it, in the same spirit as `register`'s duplicate-id throw.
   *
   * Every index `register` writes is undone: the id map, the occupancy map,
   * the per-room-type group and that type's sorted cache. Leaving the cache
   * would keep the removed instance visible to `findAvailable` -- the one
   * reader on the intake hot path -- which is the failure this method would
   * have if it were only a `Map.delete`.
   */
  public unregister(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (instance === undefined) return false;
    if ((this.occupants.get(instanceId)?.size ?? 0) > 0) {
      throw new RangeError(`Room instance "${instanceId}" still has occupants.`);
    }

    this.instances.delete(instanceId);
    this.occupants.delete(instanceId);

    const group = this.instancesByRoomCatalogId.get(instance.roomCatalogId);
    if (group !== undefined) {
      const index = group.findIndex((entry) => entry.instanceId === instanceId);
      if (index >= 0) group.splice(index, 1);
      if (group.length === 0) this.instancesByRoomCatalogId.delete(instance.roomCatalogId);
    }
    this.sortedCache.delete(instance.roomCatalogId);
    return true;
  }

  public getById(instanceId: string): RoomInstance | undefined {
    return this.instances.get(instanceId);
  }

  public occupancyOf(instanceId: string): number {
    return this.occupants.get(instanceId)?.size ?? 0;
  }

  /**
   * **Insertion order, deliberately -- every consumer must sort.**
   *
   * `docs/DETERMINISM.md` already claims this contract "is stated at the
   * accessor"; until now it was stated in `docs/HUD_PROJECTIONS.md` and
   * `tests/helpers/canonical-iteration.ts` instead, so the doc was true of
   * the arrangement and false about where it lived. It is stated here now.
   *
   * The order is not stable across a save: live insertion order is
   * *assignment* order, while `loadSnapshot` refills from `getSnapshot`,
   * which sorts ascending entity id. A consumer that folds occupant data in
   * this order therefore diverges between a continued session and a
   * restored one. `tests/determinism/canonical-iteration-contract.test.ts`
   * structurally cannot catch that -- its own header names this expression
   * as the shape a text scan cannot see -- so the sort is the consumer's
   * responsibility and nothing will remind it.
   *
   * Simulation consumers should prefer {@link findBestAvailable}, which
   * sorts before it hands occupants to a rating function.
   */
  public occupantsOf(instanceId: string): readonly EntityId[] {
    return [...(this.occupants.get(instanceId) ?? [])];
  }

  /**
   * Deterministic: sorted by `instanceId`, never Map iteration order.
   * Scoped to just this room type and cached until the next `register` of
   * that same type -- a per-tick, potentially-thousands-of-instances query
   * hot path (see docs/PRISONER_OPERATIONS.md's actor-tier note) must never
   * re-filter/re-sort every registered instance of every room type on
   * every call.
   */
  public allByRoomCatalogId(roomCatalogId: string): readonly RoomInstance[] {
    const cached = this.sortedCache.get(roomCatalogId);
    if (cached !== undefined) return cached;

    const group = this.instancesByRoomCatalogId.get(roomCatalogId) ?? [];
    const sorted = [...group].sort((a, b) => (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0));
    this.sortedCache.set(roomCatalogId, sorted);
    return sorted;
  }

  /** First (by sorted instance id) instance of `roomCatalogId` with free capacity and, if given, the required object capability. Deterministic given identical registry state. */
  public findAvailable(roomCatalogId: string, requiredObjectCapability?: string): RoomInstance | undefined {
    return this.allByRoomCatalogId(roomCatalogId).find((instance) => {
      if (this.occupancyOf(instance.instanceId) >= instance.capacity) return false;
      if (requiredObjectCapability !== undefined && !instance.objectCapabilities.includes(requiredObjectCapability)) return false;
      return true;
    });
  }

  /**
   * The free instance of `roomCatalogId` whose **current occupants** rate
   * best for `rate`, rather than merely the first one with a free bed.
   *
   * `findAvailable` above asks three questions -- room type, an occupancy
   * *count*, an object capability -- and never asks who is already in
   * there, so a maximum-security prisoner and a minimal-risk one land in
   * the same cell whenever that cell happens to sort first (#79). This is
   * the same query with the occupants handed to the caller.
   *
   * ## Contract on `rate`
   *
   * - **Lower is better, and `0` is the best a rating may be.** Ties go to
   *   the lowest instance id, because the scan runs over
   *   `allByRoomCatalogId`'s sorted order and the comparison is a strict
   *   `<`. With a rating that is constant -- an empty prison, or
   *   single-occupancy cells, where every free instance holds nobody --
   *   this therefore returns exactly what `findAvailable` returns.
   * - **The scan stops at the first candidate rated `0`.** That is what
   *   keeps this the same *cost* as `findAvailable` and not merely the same
   *   answer: `docs/PRISONER_OPERATIONS.md`'s performance note records that
   *   this is a per-tick, potentially-thousands-of-instances hot path which
   *   has already caused a severe super-linear slowdown once, and turning
   *   an early-exit `.find` into an unconditional full scan is exactly the
   *   shape that did it. An empty room rates 0 under any sane policy, so in
   *   a prison with a free empty room of the right type the scan exits at
   *   the same candidate `.find` would have. It is the reason the floor is
   *   part of the contract rather than a rating being any number at all.
   * - **A non-finite rating means "not a permissible placement"** and the
   *   instance is skipped. That is the mechanism a policy which forbids
   *   some pairing outright would use; no policy in `src/` returns one
   *   today, and whether any should is ADR 0027's question, not this
   *   method's.
   * - **It must be pure.** No RNG, no clock, no `Map`/`Set` iteration --
   *   this runs inside a simulation tick.
   *
   * ## Determinism
   *
   * Occupants are handed over **sorted ascending by entity id**, not in
   * `occupantsOf`'s insertion order, so a rating that is sensitive to order
   * cannot diverge between a live session and a restored one (see
   * `occupantsOf`). Candidates are visited in `allByRoomCatalogId`'s sorted
   * order, and the tie-break is total.
   */
  public findBestAvailable(
    roomCatalogId: string,
    rate: (occupants: readonly EntityId[], instance: RoomInstance) => number,
    requiredObjectCapability?: string,
  ): RoomInstance | undefined {
    let best: RoomInstance | undefined;
    let bestRating = Number.POSITIVE_INFINITY;

    for (const instance of this.allByRoomCatalogId(roomCatalogId)) {
      if (this.occupancyOf(instance.instanceId) >= instance.capacity) continue;
      if (requiredObjectCapability !== undefined && !instance.objectCapabilities.includes(requiredObjectCapability)) continue;

      const occupants = [...(this.occupants.get(instance.instanceId) ?? [])].sort((a, b) => a - b);
      const rating = rate(occupants, instance);
      if (!Number.isFinite(rating)) continue;
      if (rating < bestRating) {
        bestRating = rating;
        best = instance;
        if (rating <= 0) break; // Nothing later can beat the floor, and a tie would lose to this one anyway.
      }
    }

    return best;
  }

  public assign(instanceId: string, entityId: EntityId): boolean {
    const instance = this.instances.get(instanceId);
    const occupants = this.occupants.get(instanceId);
    if (instance === undefined || occupants === undefined) throw new RangeError(`Unknown room instance id "${instanceId}".`);
    if (occupants.size >= instance.capacity) return false;
    occupants.add(entityId);
    return true;
  }

  public release(instanceId: string, entityId: EntityId): void {
    this.occupants.get(instanceId)?.delete(entityId);
  }

  /** Every instance currently holding this entity -- normally at most one for accommodation, but the registry does not assume that for every use. */
  public instancesOccupiedBy(entityId: EntityId): readonly string[] {
    const result: string[] = [];
    for (const [instanceId, occupants] of this.occupants) {
      if (occupants.has(entityId)) result.push(instanceId);
    }
    return result.sort();
  }

  /**
   * Snapshots only *occupancy* (which entities currently hold which
   * instance) -- dynamic simulation state. Instance definitions
   * (`register`ed id/roomCatalogId/anchorTile/capacity/capabilities) are
   * session setup, established by the caller before `loadSnapshot`. Since
   * #70 that caller is the restore path itself: `session-systems.ts` writes
   * the definitions into the save as `prisoners.roomInstanceDefinitions`
   * (and `DoorRegistry`'s the same way) and re-`register`s them before
   * handing the occupancy back here. So the split is still definitions
   * first, occupancy second -- it is no longer a split between what is and
   * is not saved. Sorted by instance id then entity id for deterministic
   * output.
   *
   * In a *live* session the caller is `RoomZoningService`
   * (`src/simulation/rooms/zoning.ts`), which registers an instance when a
   * `ZoneRoom` command is accepted (#261). Before that, the restore path was
   * the only registrar anywhere in `src/`.
   */
  public getSnapshot(): readonly (readonly [string, readonly EntityId[]])[] {
    return [...this.occupants.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([instanceId, occupants]) => [instanceId, [...occupants].sort((a, b) => a - b)] as const);
  }

  public loadSnapshot(snapshot: readonly (readonly [string, readonly EntityId[]])[]): void {
    for (const occupants of this.occupants.values()) occupants.clear();
    for (const [instanceId, occupants] of snapshot) {
      const target = this.occupants.get(instanceId);
      if (target === undefined) throw new RangeError(`Snapshot references unknown room instance id "${instanceId}".`);
      for (const entityId of occupants) target.add(entityId);
    }
  }
}
