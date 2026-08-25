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
 * Absent bounds are a real state rather than a defect: a V4 save carries no
 * rectangle and inventing one would assert a room the player did not zone (see
 * `RoomInstance`). Every caller treats "no rectangle" as "contains nothing",
 * which is precisely the pre-object-placement behaviour.
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
 * The two capacities and the capability list a set of objects produces.
 *
 * ADR 0028 decision 2, verbatim and with nothing authored anywhere:
 *
 * ```
 * capabilities     = union over the objects of catalogue(objectId).capabilities,
 *                    deduplicated, ascending by code unit
 * residentCapacity = sum of footprint.width over the objects whose capabilities
 *                    include 'sleep-surface'
 * concurrentUse    = sum of footprint.width over every object
 * ```
 *
 * So `object.bed` is `{ width: 1, height: 2 }` and a cell with one bed holds 1;
 * a canteen with 2 dining tables and 4 benches seats `2*3 + 4*2 = 14`. Neither
 * figure was invented and neither is in a content file -- both are read off
 * footprints this tree already ships.
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
 * An object naming a catalogue id this build does not declare contributes
 * nothing, rather than throwing: the row can only come from a save, and one
 * unreadable row must not make a prison unloadable.
 */
export function deriveRoomCapacity(
  objects: readonly PlacedObject[],
  catalogue: ContentRegistry<ObjectDefinition> = defaultObjectRegistry,
): RoomDerivedCapacity {
  let residentCapacity = 0;
  let concurrentUseCapacity = 0;
  const capabilities = new Set<string>();

  for (const object of objects) {
    const definition = catalogue.getById(object.objectId);
    if (definition === undefined) continue;
    concurrentUseCapacity += definition.footprint.width;
    if (definition.capabilities.includes(SLEEP_SURFACE_CAPABILITY)) {
      residentCapacity += definition.footprint.width;
    }
    for (const capability of definition.capabilities) capabilities.add(capability);
  }

  return {
    residentCapacity,
    concurrentUseCapacity,
    objectCapabilities: [...capabilities].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
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
    if (bounds === undefined) return { residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: [] };
    return deriveRoomCapacity(this.placedObjects.inRect(bounds), this.objects);
  }
}
