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
 * **A claim now records which of the two it is, and the previous version of
 * this comment said it would not.** It said the occupant set is "deliberately
 * not split" because "who is inside this room right now" is a fact rather than
 * a role, and that `concurrentUseCapacity` was "a correct ceiling on a number
 * that is always zero" until `ActionSystem` started calling `assign`/`release`.
 * The second half was true and is what ADR 0028 phase 6 fixed; the first half
 * did not survive contact with it, and
 * [ADR 0029](../../../docs/adr/0029-concurrent-room-use-claims.md) is the
 * correction. Two measured reasons, neither of which is tidiness:
 *
 * 1. **`totalOccupancy` is an economy input.** `StateIncomeSystem` pays per
 *    occupied place, and `src/simulation/economy/income.ts` states the
 *    precondition in its own words -- if occupancy is ever registered
 *    "somewhere a prisoner is *not* housed -- a canteen tracking diners", the
 *    definition "would pay twice for one prisoner-day and has to be narrowed to
 *    accommodation before that lands". One undifferentiated set cannot narrow
 *    it: a prisoner eating lunch would earn a second prisoner-day.
 * 2. **One `Set` cannot hold two claims by the same entity.** `Set.add` is
 *    idempotent, so a resident who also claimed use of the same instance would
 *    have one membership and two releases, and the first release would evict
 *    their residency.
 *
 * So there are two claim collections and two counts, and each capacity bounds
 * the count of its own kind. `occupancyOf` and `totalOccupancy` keep exactly
 * the meaning they have always had -- residency -- which is why no projection
 * and no income figure moves. `useOccupancyOf` is the new count, and
 * `claimCountOf` is the union, for the one question that genuinely means
 * "is anybody holding this instance at all": whether it can be unregistered.
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
  /**
   * Concurrent-use claims: who is *using* this instance for an action right
   * now, as opposed to who lives in it. A second collection rather than a tag
   * inside `occupants`, per ADR 0029 -- see the type comment above for the two
   * measurements that forced it apart.
   *
   * Not persisted. A use claim is a pure function of state the save already
   * carries (a prisoner's action phase and its target instance), so it is
   * rebuilt at restore rather than written down; `getSnapshot` therefore still
   * emits residency only and the save format does not move.
   */
  private readonly useClaims = new Map<string, Set<EntityId>>();
  /** Grouped by room-catalog id so `allByRoomCatalogId`/`findAvailable*` never scan instances of other room types. */
  private readonly instancesByRoomCatalogId = new Map<string, RoomInstance[]>();
  /** Lazily rebuilt, sorted-by-instanceId cache per room-catalog id; invalidated only for the affected type on `register`, never on assign/release (those don't change which instances exist). */
  private readonly sortedCache = new Map<string, readonly RoomInstance[]>();
  /** Backing field for `totalOccupancy`; every mutation of `occupants` maintains it. */
  private occupiedPlaceCount = 0;
  /** Backing field for `totalUseClaims`; every mutation of `useClaims` maintains it, for the same reason `occupiedPlaceCount` exists. */
  private useClaimCount = 0;

  public register(instance: RoomInstance): void {
    if (this.instances.has(instance.instanceId)) {
      throw new RangeError(`Duplicate room instance id "${instance.instanceId}".`);
    }
    this.instances.set(instance.instanceId, instance);
    this.occupants.set(instance.instanceId, new Set());
    this.useClaims.set(instance.instanceId, new Set());

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
   * **It refuses to remove a claimed instance rather than orphaning the claim.**
   * A prisoner holds an `accommodationInstanceId` in cold state, and dropping
   * the instance underneath them would leave that reference naming a room that
   * does not exist. The caller is expected to have checked `claimCountOf` and
   * to have reported a refusal to the player; `RoomZoningService.unzone` does
   * exactly that, and this `RangeError` is the guard behind it, in the same
   * spirit as `register`'s duplicate-id throw.
   *
   * **`claimCountOf` and not `occupancyOf`, since ADR 0029.** A prisoner
   * performing an action here holds a use claim and a
   * `currentActionTargetInstanceId` naming this instance, which is the same
   * dangling reference for the same reason -- so a canteen cannot be unzoned
   * out from under a diner either. That refusal is transient by construction: a
   * use claim lasts one action, so the next attempt succeeds.
   *
   * Every index `register` writes is undone: the id map, both claim maps, the
   * per-room-type group and that type's sorted cache. Leaving the cache
   * would keep the removed instance visible to `findAvailable*` -- the one
   * reader on the intake hot path -- which is the failure this method would
   * have if it were only a `Map.delete`.
   */
  public unregister(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (instance === undefined) return false;
    if (this.claimCountOf(instanceId) > 0) {
      throw new RangeError(`Room instance "${instanceId}" still has occupants.`);
    }

    this.instances.delete(instanceId);
    this.occupants.delete(instanceId);
    this.useClaims.delete(instanceId);

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

  /**
   * How many prisoners *live* here -- residency claims only, which is exactly
   * what this has always counted and why nothing that reads it moved when
   * concurrent use started being counted (ADR 0029). Its readers are the room
   * and status-strip projections, which pair it with `residentCapacity`, and
   * `findAvailableResidence`/`findBestAvailable`.
   */
  public occupancyOf(instanceId: string): number {
    return this.occupants.get(instanceId)?.size ?? 0;
  }

  /** How many actors are *using* this instance for an action right now. The count `findAvailableForUse` gates against `concurrentUseCapacity`. */
  public useOccupancyOf(instanceId: string): number {
    return this.useClaims.get(instanceId)?.size ?? 0;
  }

  /**
   * Claims of either kind on this instance -- "is anybody holding a reference
   * to this room at all".
   *
   * One question, one caller each side of the same guard: `unregister` refuses
   * above zero, and `RoomZoningService.unzone` checks it first so the player
   * gets a `room-occupied` refusal instead of a throw out of the tick. It is
   * deliberately a sum and not a set union: an entity that somehow held both
   * kinds on one instance is two reasons not to remove it, not one, and this
   * number is never compared against a capacity.
   */
  public claimCountOf(instanceId: string): number {
    return this.occupancyOf(instanceId) + this.useOccupancyOf(instanceId);
  }

  /**
   * Every **residency** slot currently held, across every registered instance.
   *
   * Maintained on `assign`/`release`/`loadSnapshot` rather than summed on
   * demand, because its reader is a per-day economy system and a twice-a-second
   * projection, and neither should walk the registry to learn one integer.
   *
   * **Residency and not every claim, which is what discharges `income.ts`'s
   * stated precondition** (ADR 0029). That file names the condition in its own
   * words: if occupancy is ever registered somewhere a prisoner is not housed,
   * "a canteen tracking diners", the definition "would pay twice for one
   * prisoner-day and has to be narrowed to accommodation before that lands".
   * `ActionSystem` now registers exactly that, and the narrowing is that use
   * claims live in their own collection and are counted by `totalUseClaims`
   * below, which no economy system reads. So a prisoner at lunch earns one
   * prisoner-day, not two.
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
   * Every concurrent-use claim currently held, across every registered
   * instance -- the mirror of `totalOccupancy` for the other kind of claim.
   *
   * **Deliberately not an economy or projection input.** It exists so the
   * registry-wide invariant "no claim outlives the action that took it" is one
   * integer to assert rather than a walk over every instance, which is what
   * makes a leaked claim a test failure instead of a slow drift in a capacity
   * nobody is watching (ADR 0029). A leaked claim is worse than no counting at
   * all: it silently reduces a room's capacity for the rest of the session.
   */
  public get totalUseClaims(): number {
    return this.useClaimCount;
  }

  /**
   * Every entity that **lives** in this instance, **ascending by entity id**.
   *
   * ## What this used to be, and what deleting the sort would cost
   *
   * Until now this returned the `Set` in insertion order, and said so: the
   * previous version of this comment declared "insertion order, deliberately
   * -- every consumer must sort", and closed by admitting that the sort "is
   * the consumer's responsibility and **nothing will remind it**". That was an
   * accurate description of a hazard, not a design. The order it handed out is
   * not a property of the prison at all -- it is a property of *this session's
   * history*, and specifically one that changes across a save: live insertion
   * order is `assign` order, while `loadSnapshot` refills from `getSnapshot`,
   * which sorts ascending entity id. So a consumer that folds occupant data in
   * the order it is given produces one answer in a continued session and
   * another in a restored one, from identical state. Under ADR 0009 that is
   * not cosmetic: replay verification compares state hashes, so the two
   * sessions disagree and the replay is refused.
   *
   * Deleting the sort below therefore costs the guarantee that this accessor
   * is a function of state. It does not cost anything measurable in time: the
   * collection is bounded by `residentCapacity`, which ADR 0028 derives from
   * the summed footprint width of the sleep surfaces standing in one room's
   * rectangle -- single digits for a cell, tens for the largest dormitory this
   * content tree can express -- and the sole caller in `src/` is
   * `projectRoomDetail`, which runs on a HUD projection request and not in a
   * tick. `findBestAvailable`, which *is* on the per-tick intake path, does not
   * route through here at all; it reads `this.occupants` directly and applies
   * the same sort, and that duplication is deliberate (see its comment) so this
   * accessor's cost can never be argued onto the hot path.
   *
   * ## Why the sort is here and not a second, plainly-unsafe accessor
   *
   * The alternative considered was splitting this in two -- an internal
   * insertion-order accessor plus a sorted public one -- so that a new caller
   * had to opt into the hazard. It was rejected because **no caller wanted the
   * hazard**: `projectRoomDetail` sorted what it got, `findBestAvailable`
   * never asked, and the one test that pinned the unsorted shape pinned it as
   * this accessor's stated behaviour rather than because anything needed it. A
   * split would have added an accessor with zero callers whose only purpose
   * was to be dangerous, and left the sorted name free for a future caller to
   * reach for the other one by mistake.
   *
   * It also puts this registry back in line with every structurally identical
   * accessor in the tree, which is the argument that decided it.
   * `GangRegistry.membersOf` -- the same "members of one keyed collection"
   * lookup over a `Map<string, Set<EntityId>>` -- already sorts ascending
   * entity id inside the accessor. `DoorRegistry.all` was changed to sort in
   * #132 *even though its only caller already sorted*, and its comment states
   * the general rule this one was the last exception to: "an accessor that
   * hands out registration history is a trap for the next caller rather than a
   * safe default."
   *
   * ## Why the type scan cannot replace this
   *
   * `tests/determinism/canonical-iteration-contract.test.ts` does not see this
   * line and never will. Its scanner is textual, and
   * `tests/helpers/canonical-iteration.ts` names this exact expression as the
   * one shape it cannot judge: whether `this.occupants.get(id)` yields a `Set`
   * or an array is known to `tsc` and not to a regex. So there is no static
   * gate here, and the behavioural guard is
   * `tests/determinism/room-occupant-ordering.test.ts`, which builds the same
   * occupant set through four different histories -- two assignment orders, a
   * snapshot round trip, and a release-then-reassign that leaves the backing
   * `Set` in an order no single assignment sequence could produce -- and
   * requires one identical answer from all four.
   */
  public occupantsOf(instanceId: string): readonly EntityId[] {
    return [...(this.occupants.get(instanceId) ?? [])].sort((a, b) => a - b);
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
   * **`useOccupancyOf` and not `occupancyOf`, and that swap is the whole of
   * ADR 0028 phase 6's gate half.** The previous version of this comment
   * recorded the defect it left behind: with nothing calling `assign` for a
   * non-accommodation room, `occupancyOf` counted only the prisoners
   * `IntakeSystem` had *housed* there, so for a canteen this compared the
   * canteen's resident count -- permanently zero -- against its concurrent-use
   * capacity, making the gate a pure zero-check. Measured on that code: five
   * prisoners and 40 prisoners both entered a canteen whose
   * `concurrentUseCapacity` was 2 and 1 respectively, in one reconsideration
   * tick, while `occupancyOf` stayed 0.
   *
   * **This is an answer, not a reservation.** Nothing is held by asking; the
   * claim is taken by `claimUse` when the actor actually arrives (ADR 0029), so
   * two actors selecting in the same tick can both be answered this instance
   * and only the first `concurrentUseCapacity` of them will get in.
   */
  public findAvailableForUse(roomCatalogId: string, requiredObjectCapability?: string): RoomInstance | undefined {
    return this.allByRoomCatalogId(roomCatalogId).find((instance) => {
      if (this.useOccupancyOf(instance.instanceId) >= instance.concurrentUseCapacity) return false;
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
   * Occupants are handed over **sorted ascending by entity id**, so a rating
   * that is sensitive to order cannot diverge between a live session and a
   * restored one -- live `assign` order and a restored session's
   * ascending-id refill are the same list only after the sort (see
   * `occupantsOf`). Candidates are visited in `allByRoomCatalogId`'s sorted
   * order, and the tie-break is total.
   *
   * **The sort is repeated here rather than delegated to `occupantsOf`, and
   * that is on purpose.** `occupantsOf` now sorts too, so the call would be
   * correct; what it would also do is put this per-tick,
   * potentially-thousands-of-instances scan
   * (`docs/PRISONER_OPERATIONS.md`'s performance note) downstream of an
   * accessor whose only other caller is a HUD projection. The next person
   * asked to make that accessor cheaper would then be trading against a hot
   * path they cannot see from its call site. Reading `this.occupants`
   * directly keeps the two costs independent, and the duplicated comparator
   * is four tokens.
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

  /** Houses `entityId` in this instance, bounded by `residentCapacity`. One caller: `IntakeSystem`. Its counterpart for the other kind of claim is `claimUse`. */
  public assign(instanceId: string, entityId: EntityId): boolean {
    const instance = this.instances.get(instanceId);
    const occupants = this.occupants.get(instanceId);
    if (instance === undefined || occupants === undefined) throw new RangeError(`Unknown room instance id "${instanceId}".`);
    // `residentCapacity`, because the only caller is `IntakeSystem` housing a
    // prisoner. `claimUse` is where the other ceiling is applied, to its own
    // collection -- see the type comment for why the two are not one set.
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

  /**
   * Claims a concurrent-use place for `entityId`, or answers `false` when the
   * instance is already at `concurrentUseCapacity`.
   *
   * The mirror of `assign` for the other kind of claim (ADR 0029): same throw
   * on an unknown id, same idempotent add, same "answers `false` rather than
   * evicting anyone" contract. One caller, `ActionSystem`, at the moment an
   * actor actually starts performing in the room -- **not** when it selects the
   * room, because a use claim means "is inside this room right now" and a
   * traveller is not. The consequence of that choice is that a refusal here is
   * reachable and must leave the actor outside the room; ADR 0029 records why
   * it was preferred to a selection-time reservation.
   *
   * `false` is not an error: it is the answer "somebody else took the last
   * seat", and the fairness rule that decides who did is the caller's ascending
   * entity-index scan.
   */
  public claimUse(instanceId: string, entityId: EntityId): boolean {
    const instance = this.instances.get(instanceId);
    const claims = this.useClaims.get(instanceId);
    if (instance === undefined || claims === undefined) throw new RangeError(`Unknown room instance id "${instanceId}".`);
    if (claims.size >= instance.concurrentUseCapacity) return false;
    const before = claims.size;
    claims.add(entityId);
    this.useClaimCount += claims.size - before;
    return true;
  }

  /**
   * Releases `entityId`'s concurrent-use claim on this instance, if it holds
   * one.
   *
   * Total, on purpose, in all three directions a release can be wrong:
   * releasing a claim that was never taken, releasing twice, and releasing on
   * an instance that has since been unregistered are all no-ops rather than
   * throws. Every one of those is reachable from a caller that is trying to
   * *avoid* leaking a claim, and a throw would turn the safe half of a leak
   * fix into an exception out of `Kernel.step()`.
   */
  public releaseUse(instanceId: string, entityId: EntityId): void {
    if (this.useClaims.get(instanceId)?.delete(entityId) === true) this.useClaimCount -= 1;
  }

  /**
   * Reinstates a use claim that already existed, ignoring
   * `concurrentUseCapacity`. Answers `false` when there is no such instance.
   *
   * The restore path's method, and the one place the ceiling is deliberately
   * not applied. A claim being rebuilt was granted once already, under whatever
   * capacity stood then, so this is not a grant and has no ceiling to check. If
   * it went through `claimUse` instead, a saved state holding more performers
   * than the room's current capacity -- legal, since ADR 0028 decision 2 makes
   * over-capacity a named state and evicts nobody -- would silently drop the
   * excess claims while those prisoners kept performing, and the room would
   * then over-admit for the rest of the session. Under-counting a claim is the
   * failure mode this whole change exists to remove, so the restore path
   * reproduces the count exactly and lets it be above the ceiling.
   */
  public reinstateUseClaim(instanceId: string, entityId: EntityId): boolean {
    const claims = this.useClaims.get(instanceId);
    if (claims === undefined) return false;
    const before = claims.size;
    claims.add(entityId);
    this.useClaimCount += claims.size - before;
    return true;
  }

  /**
   * Every instance this entity **lives** in -- normally at most one for
   * accommodation, but the registry does not assume that.
   *
   * Residency only, matching `occupancyOf` rather than `claimCountOf`, and
   * deliberately: the question it is asked is "where does this prisoner live",
   * and a room they are eating lunch in is not an answer to it. A caller that
   * wants the transient one asks the instance it already has in hand, since a
   * use claim is only ever taken on the instance the actor's own
   * `currentActionTargetInstanceId` already names.
   */
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
   *
   * **Residency only, and concurrent-use claims are deliberately absent**
   * (ADR 0029). A use claim is a pure function of two things the save already
   * carries -- a prisoner's action phase and its
   * `currentActionTargetInstanceId` -- so writing it down would persist a
   * derived value that can disagree with the state that produced it, which is
   * the argument ADR 0028 decision 6 already made for the two derived
   * capacities. `PrisonerOperationsRuntime.loadSnapshot` rebuilds them from
   * that state instead, so the save format does not move and a restore cannot
   * carry a stale claim forward.
   */
  public getSnapshot(): readonly (readonly [string, readonly EntityId[]])[] {
    return [...this.occupants.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([instanceId, occupants]) => [instanceId, [...occupants].sort((a, b) => a - b)] as const);
  }

  public loadSnapshot(snapshot: readonly (readonly [string, readonly EntityId[]])[]): void {
    for (const occupants of this.occupants.values()) occupants.clear();
    this.occupiedPlaceCount = 0;
    // Use claims are cleared and never refilled from here: they are not in the
    // payload (see `getSnapshot`), and clearing them is what makes the rebuild
    // in `PrisonerOperationsRuntime.loadSnapshot` idempotent -- restoring the
    // same snapshot twice into the same registry cannot double a claim.
    for (const claims of this.useClaims.values()) claims.clear();
    this.useClaimCount = 0;
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
