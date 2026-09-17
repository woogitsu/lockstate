import { defaultObjectRegistry, type ObjectDefinition } from '../../content/object-catalog';
import type { ContentRegistry } from '../../content/registry';
import { defaultRoomContentRegistry, type RoomCatalogDefinition } from '../../content/room-catalog';
import type {
  RoomDerivedCapacity,
  RoomInstance,
  RoomInstanceRegistry,
} from '../prisoners/room-instance-registry';
import type { TilePosition } from '../world/coordinates';
import type { SparseWorld } from '../world/sparse-world';
import type { PlacedObjectRegistry } from './placed-object-registry';
import type { PlacedObject } from './placed-object';

/**
 * The capability an object must declare for its footprint to count toward a
 * room's **resident** capacity.
 *
 * The same tag `DEFAULT_ACCOMMODATION_POLICY` asks `findAvailableResidence`
 * for, and the same one `action.sleep` declares -- so "a room a prisoner can
 * live in" and "a room with something to sleep on" are one fact read from one
 * place rather than two lists that could disagree. It is `object.bed`'s and
 * `object.medical-bed`'s capability in `src/content/object-catalog.ts`; no
 * number and no room type is named here.
 */
export const SLEEP_SURFACE_CAPABILITY = 'sleep-surface';

/**
 * A room instance's rectangle, or `undefined` when the instance does not
 * record one.
 *
 * Absent bounds are a real state rather than a defect: inventing a rectangle
 * would assert a room the player did not zone (see `RoomInstance`). Every
 * caller treats "no rectangle" as "contains nothing", which is precisely the
 * pre-object-placement behaviour.
 *
 * **A V4 save was the example, and is no longer** (issue #559, ADR 0074). A V4
 * *row* carries no rectangle, but the same payload's world section carries the
 * zoning plane the room was painted into, so `restoreSessionSystems` recovers
 * it (`../rooms/bounds-recovery.ts`) and a restored V4 room arrives here with
 * bounds like any other. What genuinely records none is a row the plane cannot
 * support -- a hand-edited save, or paint cleared from under a row.
 */
export function roomBoundsOf(
  instance: RoomInstance,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined {
  if (instance.width === undefined || instance.height === undefined) return undefined;
  if (instance.width < 1 || instance.height < 1) return undefined;
  return { x: instance.anchorTile.x, y: instance.anchorTile.y, width: instance.width, height: instance.height };
}

/** Whether the rectangle `instance` occupies contains `tile`. False for an instance with no recorded rectangle. */
export function roomContains(instance: RoomInstance, tile: TilePosition): boolean {
  const bounds = roomBoundsOf(instance);
  if (bounds === undefined) return false;
  return (
    tile.x >= bounds.x &&
    tile.x < bounds.x + bounds.width &&
    tile.y >= bounds.y &&
    tile.y < bounds.y + bounds.height
  );
}

/**
 * Which room instance contains `tile`, or `undefined` for a tile in no room.
 *
 * ## Why it goes through the zoning plane first
 *
 * `RoomInstanceRegistry` has no `all()` -- enumeration fans out over catalogue
 * ids, which `docs/HUD_PROJECTIONS.md` gap 15 records as a deliberate
 * limitation. Rather than widen the registry (and pay for a full scan on a
 * query the command boundary makes on every placement), this reads the world's
 * zoning plane, which already answers "which room *type* is painted here", and
 * then scans only that type's instances. Two lookups and a short list, and gap
 * 15 is left exactly where it was.
 *
 * The plane cannot answer "which instance", which is the gap `zoning.ts`'s own
 * header states, so the containment test is still what decides. That test is
 * total because `zone` writes only axis-aligned rectangles and refuses
 * `overlaps-existing-room`: rectangles never overlap, so **a tile is in
 * exactly zero or one room**. That closes, for free, the failure mode ADR 0023
 * named as needing a decision before placement exists -- RimWorld counts a bed
 * in a doorway for the rooms on both sides, and Lockstate cannot reach that
 * state.
 *
 * A tile whose plane value names a room the catalogue does not declare, or a
 * type whose instances all record no bounds, answers `undefined`. Both are
 * honest: nothing can attribute an object to a room whose rectangle is
 * unknown.
 */
export function roomInstanceContaining(
  world: SparseWorld,
  roomInstances: RoomInstanceRegistry,
  tile: TilePosition,
  rooms: ContentRegistry<RoomCatalogDefinition> = defaultRoomContentRegistry,
): RoomInstance | undefined {
  const zoning = world.getZoning(tile);
  if (zoning === 0) return undefined;
  const definition = rooms.getByNumericId(zoning);
  if (definition === undefined) return undefined;
  // `allByRoomCatalogId` is sorted by instance id, so a tile that somehow lay
  // in two rectangles of the same type would resolve to the lower id rather
  // than to whichever was registered first. `zone` makes that unreachable.
  return roomInstances.allByRoomCatalogId(definition.id).find((instance) => roomContains(instance, tile));
}

/**
 * The capacities and the capability list a set of objects produces.
 *
 * ADR 0028 decision 2, **as amended 2026-08-26 by the capability-scoped
 * concurrent-use ceiling** (issue #326):
 *
 * ```
 * capabilities     = union over the objects of catalogue(objectId).capabilities,
 *                    deduplicated, ascending by code unit
 * residentCapacity = sum of footprint.width over the objects whose capabilities
 *                    include 'sleep-surface', capped at `maxResidents` when the
 *                    room type authors one (issue #961; see below)
 * concurrentUse(c) = sum of footprint.width over the objects whose capabilities
 *                    include `c`, for each capability `c` in the union
 * concurrentUse    = sum of footprint.width over every object -- a total that
 *                    **no admission gate reads**; see below
 * ```
 *
 * Still nothing authored anywhere: `object.bed` is `{ width: 1, height: 2 }`
 * and its capabilities include `'sleep-surface'`, so a cell with one bed houses
 * 1; `object.dining-table` is `{ width: 3, height: 2 }` with `['dining']`, so a
 * canteen with two of them seats `2*3 = 6` diners. Every figure is read off a
 * footprint this tree already ships.
 *
 * ## Why the per-capability breakdown exists, and what it replaced
 *
 * The rule this amends summed `footprint.width` over **every** object for the
 * one concurrent-use number, while `findAvailableForUse(roomCatalogId,
 * capability)` asked a capability-*specific* question and compared its
 * headcount against that capability-*blind* total. Measured on the real
 * `zone -> resolveInstance -> findAvailableForUse/claimUse` path at v0.0.73:
 * ADR 0028's own worked canteen with four toilets and a storage rack added
 * admitted **19 diners**, and an empty 8x8 yard -- the smallest the zoning gate
 * permits -- admitted **nobody**, while the same yard holding one
 * `object.loading-dock-door` admitted three. One scalar cannot bound two
 * actions that consume different objects.
 *
 * So each capability carries its own sum, and an object contributes to exactly
 * the capabilities it declares. A toilet is `['sanitation']`, so it adds
 * nothing to `'dining'` and a canteen full of toilets still seats only its
 * tables.
 *
 * ## `concurrentUseCapacity` survives as a total, and is not a ceiling
 *
 * The arithmetic of the scalar is unchanged, and so is every number any test
 * asserts about it -- what changed is that **nothing gates on it any more**.
 * It is the summed footprint width of everything standing in the room, which
 * is a true statement about objects and a false statement about people: for
 * ADR 0028's worked canteen it reads 14 while the room seats 6 diners, and for
 * that canteen plus four toilets it reads 19. Projecting it as "how many can
 * use this room at once" would put the defect this amendment removes back on
 * screen. `objects-room-capacity.test.ts` pins that no gate reads it.
 *
 * **Orientation is ignored.** This reads the definition's `footprint.width`,
 * not the rotated extent, because capacity is a property of the object type
 * and not of how the player turned it. A bed rotated flat still sleeps one.
 *
 * The capability array is sorted with a plain comparison and **never
 * `localeCompare`** (`docs/DETERMINISM.md`). `findAvailable*`'s `includes` is
 * order-insensitive, so the order matters only to
 * `RoomListRowViewModel.objectCapabilities`, which is projected to the HUD --
 * and since capabilities are no longer persisted, no checksum depends on it.
 *
 *
 * ## The per-room-type resident ceiling, **as amended 2026-09-17** (issue #961)
 *
 * `maxResidents` is the fourth parameter of this arithmetic and the only one
 * that is *authored*: `src/content/room-catalog.ts` declares it per room type,
 * that file carries the derivation of each number, and `deriveFor` below is
 * the one production caller that supplies it. Absent -- which is every room
 * type but `room.cell` (2) and `room.solitary-cell` (1) -- and the sum stands
 * unchanged, so this is `min(sum, ceiling)` and never a second rule.
 *
 * **It caps residency and nothing else.** `concurrentUseCapacity` and the
 * per-capability breakdown are untouched, including `'sleep-surface'`'s: those
 * bound *use* of an object, and the ceiling is a statement about who may live
 * in the room. A bed above the ceiling therefore still stands, still cost
 * money and still counts as an object; what it no longer does is house
 * anybody, which is what #961 measured as missing.
 *
 * **What it does to a room already over it** is the state ADR 0028 decision 2
 * already made legal and
 * [ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * already priced: the excess residents are exactly
 * `residentsWithoutExistingPlace`, the state stops paying for them, and
 * `PrisonerOperationsRuntime.relocateExcessResidentsOf` moves them if it can.
 * A twelve-bed cell restored under this build is indistinguishable, to every
 * one of those paths, from a twelve-bed cell with ten beds removed -- which is
 * why no save format moves.
 *
 * An object naming a catalogue id this build does not declare contributes
 * nothing, rather than throwing: the row can only come from a save, and one
 * unreadable row must not make a prison unloadable.
 */
export function deriveRoomCapacity(
  objects: readonly PlacedObject[],
  catalogue: ContentRegistry<ObjectDefinition> = defaultObjectRegistry,
  maxResidents?: number,
): RoomDerivedCapacity {
  let residentCapacity = 0;
  let concurrentUseCapacity = 0;
  const byCapability = new Map<string, number>();

  for (const object of objects) {
    const definition = catalogue.getById(object.objectId);
    if (definition === undefined) continue;
    concurrentUseCapacity += definition.footprint.width;
    if (definition.capabilities.includes(SLEEP_SURFACE_CAPABILITY)) {
      residentCapacity += definition.footprint.width;
    }
    for (const capability of definition.capabilities) {
      byCapability.set(capability, (byCapability.get(capability) ?? 0) + definition.footprint.width);
    }
  }

  // One sorted walk produces both, so the capability list and the breakdown
  // cannot disagree about which capabilities a room has: `objectCapabilities`
  // *is* the breakdown's key list. A capability present in a room always has a
  // capacity of at least 1, because `objectFootprintSchema` bounds `width`
  // below at 1 -- which is why `findAvailableForUse` no longer needs a separate
  // "is this capability present" test.
  const sorted = [...byCapability.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return {
    residentCapacity: maxResidents === undefined ? residentCapacity : Math.min(residentCapacity, maxResidents),
    concurrentUseCapacity,
    concurrentUseCapacityByCapability: sorted.map((capability) => [capability, byCapability.get(capability)!] as const),
    objectCapabilities: sorted,
  };
}

/**
 * Writes a room instance's derived capacity from the objects standing in it.
 *
 * **Event-driven, never per-tick** (ADR 0028 decision 2). It is not a
 * `SystemRegistration` and has no `update`, deliberately: a resolver on a
 * schedule would make capacity a value that changes between a
 * `findAvailable*` and its `assign`. It runs at exactly three moments, and
 * each has one caller:
 *
 * 1. **A completed object build order** -- `ConstructionSystem.finalizeConstruction`,
 *    through `ObjectPlacementService`.
 * 2. **An object removal** -- `ConstructionSystem.revertConstruction` (undo or
 *    cancel of a completed order), through the same service.
 * 3. **`zone` registering a new instance** -- `RoomZoningService.zone`. A newly
 *    zoned room counts objects that were already standing there; refusing to
 *    would make the order of two player gestures change the outcome, which is
 *    the same class of defect as iterating a `Map`.
 *
 * A restore is the fourth, and it is the same call over every instance:
 * `resolveAll`. Recomputing at restore is what makes
 * `snapshot() -> restore() -> run N ticks` land on the same state **by
 * construction** rather than by agreement, which is why neither capacity nor
 * the capability list is persisted any more.
 *
 * ## Moment one is *completion*, and that is now a ruling rather than a default
 *
 * **The owner ruled it on 2026-09-06, on issue #1031, in these words:**
 *
 * > Świat ma rację -- licz po ukończeniu
 *
 * ("The world is right -- count on completion.") An ordered-but-unbuilt object
 * must not raise a capacity, so the moment above is `finalizeConstruction` and
 * never `ObjectPlacementService.place`. The list happens to have said that
 * since ADR 0028 phase 1 -- the ruling changed no line of this file -- but it
 * was an implementation detail until that date and is a decision now, which is
 * why it is recorded here beside the code rather than only in the issue.
 *
 * **It is also the only thing standing between a plausible edit and a defect.**
 * Registering the object at order time is a two-line change in `place`, it
 * reads like an improvement (the money is spent, the tile is claimed), and
 * before #1031 nothing in this repository would have gone red for it.
 * `tests/integration/capacity-counts-on-completion.test.ts` is what does now:
 * it samples `roomCapacity`, `accommodationCapacity`, `residentCapacity`, the
 * `concurrentUseCapacityFor` ceiling and `objectCapabilities` at every tick of
 * a four-bed session and requires each to equal the number of bed orders that
 * have reached `completed` at that tick.
 *
 * Idempotent and RNG-free: recomputation from the same objects gives the same
 * numbers, so running it twice is harmless and no named stream moves.
 */
export class RoomCapacityResolver {
  public constructor(
    private readonly world: SparseWorld,
    private readonly roomInstances: RoomInstanceRegistry,
    private readonly placedObjects: PlacedObjectRegistry,
    private readonly rooms: ContentRegistry<RoomCatalogDefinition> = defaultRoomContentRegistry,
    private readonly objects: ContentRegistry<ObjectDefinition> = defaultObjectRegistry,
  ) {}

  /**
   * Recomputes one instance, and answers what was written.
   *
   * An instance with no recorded rectangle resolves to zeroes and no
   * capabilities -- there is no domain for the rule, and asserting one would
   * be the invented-consequence defect.
   */
  public resolveInstance(instanceId: string): RoomDerivedCapacity | undefined {
    const instance = this.roomInstances.getById(instanceId);
    if (instance === undefined) return undefined;
    const derived = this.deriveFor(instance);
    this.roomInstances.updateDerived(instanceId, derived);
    return derived;
  }

  /**
   * Recomputes the room containing `tile`, if any, and answers its id.
   *
   * The shape the object events need: a placement knows a tile and not a room,
   * and an object outside every room changes no capacity at all -- which is
   * the state ADR 0028 permits structurally and nothing consumes.
   */
  public resolveContaining(tile: TilePosition): string | undefined {
    const instance = roomInstanceContaining(this.world, this.roomInstances, tile, this.rooms);
    if (instance === undefined) return undefined;
    this.resolveInstance(instance.instanceId);
    return instance.instanceId;
  }

  /**
   * Recomputes every registered instance. The restore path's one call.
   *
   * Enumerated through `RoomInstanceRegistry.getSnapshot()`, whose keys are the
   * complete already-sorted instance-id list -- the same route
   * `session-systems.ts` takes for exactly this reason, and the reason no
   * `all()` is added to the registry (`docs/HUD_PROJECTIONS.md` gap 15 stays
   * where it is).
   */
  public resolveAll(): number {
    let resolved = 0;
    for (const [instanceId] of this.roomInstances.getSnapshot()) {
      if (this.resolveInstance(instanceId) !== undefined) resolved += 1;
    }
    return resolved;
  }

  /** What `resolveInstance` would write, without writing it. The half a projection or a test wants. */
  public deriveFor(instance: RoomInstance): RoomDerivedCapacity {
    const bounds = roomBoundsOf(instance);
    if (bounds === undefined) {
      return { residentCapacity: 0, concurrentUseCapacity: 0, concurrentUseCapacityByCapability: [], objectCapabilities: [] };
    }
    return deriveRoomCapacity(
      this.placedObjects.inRect(bounds),
      this.objects,
      this.rooms.getById(instance.roomCatalogId)?.maxResidents,
    );
  }
}
