import type { EntityId } from '../entity/entity-store';
import type { TilePosition } from '../world/coordinates';

/**
 * A concrete, placed instance of a #23 room-catalog definition: its rectangle,
 * and the two capacities and capability list **derived from the objects
 * standing inside it**.
 *
 * ## What changed, and what the previous version of this comment claimed
 *
 * It said that instances are registered "with `objectCapabilities` stated up
 * front rather than derived from a placement system that doesn't exist", and
 * that building the real placement system "belongs to construction/rooms
 * work". That work is
 * [ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md),
 * and phase 1 of it falsifies the sentence: nothing states a capacity or a
 * capability any more. `RoomZoningService.zone` registers an instance with
 * zeroes and an empty list, and `RoomCapacityResolver` writes the real figures
 * through `updateDerived` whenever the set of objects inside the rectangle can
 * have changed. So an instance is still **registered once** -- `register` still
 * throws on a duplicate id -- and its derived fields are now updated on object
 * events.
 *
 * ## Why two capacities and not one
 *
 * `capacity` was asked to be two different quantities (ADR 0028 decision 3): a
 * *residency* ceiling, which is what `IntakeSystem` asks before a prisoner
 * lives here, and a *concurrent use* ceiling, which is what `ActionSystem`
 * asks before a prisoner uses the room now. A canteen that seats fourteen
 * houses nobody, and a cell that holds one prisoner is not a statement about
 * how many can stand in it. They are two fields and two `findAvailable*`
 * methods rather than one field and a mode flag, because the call sites are
 * already distinct.
 *
 * **The occupant set is deliberately not split.** "Who is inside this room
 * right now" is a fact rather than a role, and the two capacities are two
 * ceilings on the same count. Note what follows from that and is measured
 * rather than assumed: nothing in `src/` adds an actor to a non-accommodation
 * room's occupant set -- `ActionSystem` calls neither `assign` nor `release`
 * -- so `concurrentUseCapacity` is today a correct ceiling on a number that is
 * always zero. Making it bite is ADR 0028 phase 6, and saying so is better
 * than shipping a gate that looks enforced and is not.
 *
 * ## The bounds, and why they are optional
 *
 * `width`/`height` are the rectangle `zone` receives and used to discard.
 * Without them "is this tile in this room" is unanswerable and every rule in
 * ADR 0028 decision 2 has no domain. They are **optional** because a V4 save
 * genuinely does not record them and there is no honest default: `1x1` asserts
 * a room the player did not zone and `64x64` asserts one that overlaps its
 * neighbours. An instance with no bounds contains no objects, so its capacity
 * stays 0 -- exactly the pre-object-placement behaviour, and therefore not a
 * regression.
 */
export interface RoomInstance {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  readonly anchorTile: TilePosition;
  /** Width of the zoned rectangle in tiles, with `anchorTile` as its left edge. Absent for an instance restored from a save written before bounds were recorded. */
  readonly width?: number;
  /** Height of the zoned rectangle in tiles, with `anchorTile` as its top edge. Absent for the same reason `width` is. */
  readonly height?: number;
  /** How many prisoners may *live* here. Derived: the summed footprint width of the sleep surfaces standing inside the rectangle. */
  readonly residentCapacity: number;
  /** How many actors may *use* the room at once. Derived: the summed footprint width of every object standing inside the rectangle. */
  readonly concurrentUseCapacity: number;
  /** The union of the capabilities of the objects inside the rectangle, deduplicated, ascending by code unit. Derived. */
  readonly objectCapabilities: readonly string[];
}

/** The three fields `RoomCapacityResolver` computes and `updateDerived` writes. */
export interface RoomDerivedCapacity {
  readonly residentCapacity: number;
  readonly concurrentUseCapacity: number;
  readonly objectCapabilities: readonly string[];
}

export class RoomInstanceRegistry {
  private readonly instances = new Map<string, RoomInstance>();
  private readonly occupants = new Map<string, Set<EntityId>>();
  /** Grouped by room-catalog id so `allByRoomCatalogId`/`findAvailable*` never scan instances of other room types. */
  private readonly instancesByRoomCatalogId = new Map<string, RoomInstance[]>();
  /** Lazily rebuilt, sorted-by-instanceId cache per room-catalog id; invalidated only for the affected type on `register`, never on assign/release (those don't change which instances exist). */
  private readonly sortedCache = new Map<string, readonly RoomInstance[]>();
  /** Backing field for `totalOccupancy`; every mutation of `occupants` maintains it. */
  private occupiedPlaceCount = 0;

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
   * Writes the three derived fields for one instance, or answers `false` when
   * there is no such instance.
   *
   * The one mutation an instance admits, and the reason `register` keeps
   * throwing on a duplicate id (ADR 0028 decision 2): re-registering to change
   * a capacity would make "registered once" false and would silently accept a
   * second instance for the same room. This changes three fields and nothing
   * else -- not the id, not the catalogue id, not the anchor, not the bounds --
   * so no index that is keyed on any of those can go stale.
   *
   * Its only caller is `RoomCapacityResolver`, which runs at the three moments
   * the set of objects inside a rectangle can have changed: an object build
   * order completing, that order being reverted, and `zone` registering a new
   * instance. **It is never called from a scheduled `update`.** A resolver on a
   * tick would make capacity a value that changes between a `findAvailable*`
   * and its `assign`, which is the failure mode ADR 0023 named.
   *
   * The row is replaced rather than mutated, because `RoomInstance` is
   * readonly and every reader holds the object rather than an id. All three
   * places `register` wrote are rewritten -- the id map, the per-room-type
   * group, and that type's sorted cache, which is dropped so `findAvailable*`
   * cannot keep answering from a row whose capacity has moved. That last one is
   * the failure this method would have if it were only a `Map.set`, and it is
   * the same one `unregister` documents.
   */
  public updateDerived(instanceId: string, derived: RoomDerivedCapacity): boolean {
    const instance = this.instances.get(instanceId);
    if (instance === undefined) return false;

    const next: RoomInstance = {
      ...instance,
      residentCapacity: derived.residentCapacity,
      concurrentUseCapacity: derived.concurrentUseCapacity,
      objectCapabilities: [...derived.objectCapabilities],
    };
    this.instances.set(instanceId, next);

    const group = this.instancesByRoomCatalogId.get(instance.roomCatalogId);
    if (group !== undefined) {
      const index = group.findIndex((entry) => entry.instanceId === instanceId);
      if (index >= 0) group[index] = next;
    }
    this.sortedCache.delete(instance.roomCatalogId);
    return true;
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
   * would keep the removed instance visible to `findAvailable*` -- the one
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
   * Every occupancy slot currently held, across every registered instance.
   *
   * Maintained on `assign`/`release`/`loadSnapshot` rather than summed on
   * demand, because its reader is a per-day economy system and a twice-a-second
   * projection, and neither should walk the registry to learn one integer.
   *
   * **Registry-wide, which is the point.** The status strip's `roomOccupants`
   * is built by fanning out over catalog room ids
   * (`presentation/room-projection.ts`), so an instance registered under an id
   * the catalog does not define is invisible to it -- `docs/HUD_PROJECTIONS.md`
   * gap 15, stated there as a deliberate limitation of that projection. This
   * accessor has no such blind spot, which is what makes it the right count for
   * `StateIncomeSystem`: the state pays for a place a prisoner occupies, not
   * for a place a projection can see. The two can only disagree for an instance
   * no `ZoneRoom` command could have produced, since `RoomZoningService` only
   * ever registers a catalog-defined id.
   */
  public get totalOccupancy(): number {
    return this.occupiedPlaceCount;
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
   * Scoped to just this room type and cached until the next `register`,
   * `unregister` or `updateDerived` of that same type -- a per-tick, potentially-thousands-of-instances query
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

  /**
   * First (by sorted instance id) instance of `roomCatalogId` a prisoner could
   * **live** in: free residency and, if given, the required object capability.
   *
   * One caller: `IntakeSystem`, through `findBestAvailable` below. It gates on
   * `residentCapacity`, which is derived from the sleep surfaces standing in
   * the room -- so a zoned cell with no bed answers `undefined` here and the
   * arrival waits at `accommodation-assignment`, which is retryable, rather
   * than reaching the terminal `'failed'` (ADR 0028 decision 8).
   *
   * Two methods rather than one with a mode flag (ADR 0028 decision 3), and
   * `EditHistoryPort`'s own comment makes the same argument one layer out: the
   * two answer different questions.
   */
  public findAvailableResidence(roomCatalogId: string, requiredObjectCapability?: string): RoomInstance | undefined {
    return this.allByRoomCatalogId(roomCatalogId).find((instance) => {
      if (this.occupancyOf(instance.instanceId) >= instance.residentCapacity) return false;
      if (requiredObjectCapability !== undefined && !instance.objectCapabilities.includes(requiredObjectCapability)) return false;
      return true;
    });
  }

  /**
   * First (by sorted instance id) instance of `roomCatalogId` an actor could
   * **use right now**: free concurrent-use capacity and, if given, the required
   * object capability.
   *
   * One caller: `ActionSystem.resolveTargetInstance`'s `room-catalog-id`
   * branch.
   *
   * **The capacity half of this gate is a ceiling on a number that is always
   * zero**, and that is measured rather than assumed: nothing in `src/` calls
   * `assign` or `release` for a non-accommodation room, so `occupancyOf` counts
   * only the prisoners `IntakeSystem` housed there. So for a canteen this
   * compares the canteen's *resident* count against its concurrent-use
   * capacity, and any capacity of 1 or more admits unlimited simultaneous
   * users. That was equally true of the single `capacity` field this replaced;
   * what changes is that the number being compared is now the right one, before
   * anything counts against it (ADR 0028 phase 6).
   */
  public findAvailableForUse(roomCatalogId: string, requiredObjectCapability?: string): RoomInstance | undefined {
    return this.allByRoomCatalogId(roomCatalogId).find((instance) => {
      if (this.occupancyOf(instance.instanceId) >= instance.concurrentUseCapacity) return false;
      if (requiredObjectCapability !== undefined && !instance.objectCapabilities.includes(requiredObjectCapability)) return false;
      return true;
    });
  }

  /**
   * The free instance of `roomCatalogId` whose **current occupants** rate
   * best for `rate`, rather than merely the first one with a free bed.
   *
   * `findAvailableResidence` above asks three questions -- room type, an occupancy
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
   *   this therefore returns exactly what `findAvailableResidence` returns.
   * - **The scan stops at the first candidate rated `0`.** That is what
   *   keeps this the same *cost* as `findAvailableResidence` and not merely the same
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
      if (this.occupancyOf(instance.instanceId) >= instance.residentCapacity) continue;
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
    // `residentCapacity`, because the only caller is `IntakeSystem` housing a
    // prisoner. When `ActionSystem` starts claiming a place for the duration of
    // an action (ADR 0028 phase 6) it needs the other ceiling, and this line is
    // where that decision lands.
    if (occupants.size >= instance.residentCapacity) return false;
    // `Set.add` is idempotent, so the counter follows the size change rather
    // than the call: re-assigning an entity already in this instance must not
    // invent a second occupied place for it.
    const before = occupants.size;
    occupants.add(entityId);
    this.occupiedPlaceCount += occupants.size - before;
    return true;
  }

  public release(instanceId: string, entityId: EntityId): void {
    // `Set.delete` reports whether it removed anything, so releasing an entity
    // that was never here -- or releasing twice -- cannot drive the counter
    // negative.
    if (this.occupants.get(instanceId)?.delete(entityId) === true) this.occupiedPlaceCount -= 1;
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
    this.occupiedPlaceCount = 0;
    for (const [instanceId, occupants] of snapshot) {
      const target = this.occupants.get(instanceId);
      if (target === undefined) throw new RangeError(`Snapshot references unknown room instance id "${instanceId}".`);
      for (const entityId of occupants) target.add(entityId);
      // Recounted from the restored sets rather than trusted from the payload:
      // a save is a file the player's browser produced, and a duplicate entity
      // id inside one instance's list must not become an extra occupied place
      // the state pays for.
      this.occupiedPlaceCount += target.size;
    }
  }
}
