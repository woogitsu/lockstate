import type { ObjectDefinition } from '../../content/object-catalog';
import { defaultObjectRegistry } from '../../content/object-catalog';
import type { ContentRegistry } from '../../content/registry';
import type { RoomCatalogDefinition, RoomCategory, RoomRequirementDefinition } from '../../content/room-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import type { SecurityGradeDefinition } from '../../content/security-grade-catalog';
import { defaultSecurityGradeRegistry } from '../../content/security-grade-catalog';
import type { EntityId } from '../entity/entity-store';
import type { RoomInstance, RoomInstanceRegistry } from '../prisoners/room-instance-registry';
import type { SecuritySectorDefinition } from '../security/sector';
import {
  compareEntityIds,
  compareStableIds,
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  pageOf,
  toBoundedValue,
  toTileViewModel,
  type BoundedValue,
  type HudViewModelSchemaVersion,
  type PageRequest,
  type TileViewModel,
  type ViewModelPage,
} from './view-model';

/**
 * Read-only slice of `SecuritySectorRegistry` the room projection needs to
 * attach a security grade. Separate from `security-projection.ts`'s own
 * source so a room panel can be projected without a security system.
 */
export interface RoomSectorSource {
  getDefinition(id: string): SecuritySectorDefinition | undefined;
}

export interface RoomProjectionSource {
  readonly roomInstances: RoomInstanceRegistry;
}

export interface RoomProjectionOptions {
  readonly rooms?: ContentRegistry<RoomCatalogDefinition>;
  readonly objects?: ContentRegistry<ObjectDefinition>;
  readonly grades?: ContentRegistry<SecurityGradeDefinition>;
  /**
   * Which security sector each room instance sits in.
   *
   * The simulation has **no** room-instance-to-sector mapping: a
   * `SecuritySectorDefinition` names the doors it governs and a post tile,
   * and a `RoomInstance` names an anchor tile -- neither knows about the
   * other. Rather than invent a spatial containment rule here, this is an
   * explicit caller-supplied map, exactly the way
   * `SimulationRuntime.searchContainerLocations` supplies the container
   * positions `Container` itself does not carry. Without it, a room's
   * security grade is simply absent rather than guessed.
   */
  readonly sectorIdByRoomInstanceId?: ReadonlyMap<string, string>;
  readonly sectors?: RoomSectorSource;
}

/**
 * How far a room catalog requirement can actually be checked against a
 * registered room instance.
 *
 * - `'satisfied-by-capability'` -- an `object` requirement whose object's
 *   catalog capabilities are declared on the instance. This is the same
 *   signal `ActionSystem`/`IntakeSystem` actually gate on
 *   (`requiredObjectCapability`), so it is real, load-bearing state.
 * - `'missing-capability'` -- an `object` requirement whose capabilities
 *   are not declared on the instance.
 * - `'not-evaluated'` -- `enclosed`, `outdoors` and `minimum-size`. Both of
 *   those are evaluated *at zoning time* (`RoomZoningService`: the minimum size
 *   is refused, the enclosure is reported on a notice) and neither answer is
 *   recorded on the instance, so there is still nothing for this projection to
 *   read.
 *
 *   `minQuantity` is likewise still uncheckable, and the reason has changed.
 *   Object placement now exists (ADR 0028 phase 1) and objects *are*
 *   individuated, so counting the beds in a cell is possible for the first
 *   time -- what is missing is that this projection is not handed the placed
 *   objects. Wiring that is phase 4's, which is when a second object type makes
 *   a *quantity* mean something; until then every `object` requirement is
 *   answered from the instance's derived capability list exactly as before.
 *   `docs/HUD_PROJECTIONS.md` gap 13 narrows rather than closes.
 *
 * These three statuses are the **only** answers the codebase gives to "does
 * this room satisfy its catalog requirements" (#123 item 2). There used to be
 * a second answer: `RoomSystem.validateRoom` reported every `object`
 * requirement as missing and treated `minimum-size` as always satisfied, in
 * its own words as a mock. It was constructed in production and called only
 * from tests, so the mock was the version nothing ran and this is the version
 * nothing could reach; it has been deleted rather than left to be inherited.
 * `enclosed` and `minimum-size` are therefore evaluated nowhere at all now,
 * which is what `'not-evaluated'` has always meant here.
 */
export type RoomRequirementStatus = 'satisfied-by-capability' | 'missing-capability' | 'not-evaluated';

export interface RoomRequirementViewModel {
  readonly type: RoomRequirementDefinition['type'];
  readonly status: RoomRequirementStatus;
  readonly objectId?: string;
  readonly objectNameKey?: string;
  readonly minQuantity?: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly minTiles?: number;
}

export interface RoomOccupancyViewModel {
  readonly current: number;
  /**
   * The **resident** capacity: how many prisoners may live here.
   *
   * `RoomInstance` carries two capacities since ADR 0028 decision 3, and this
   * is the one occupancy is a share of -- `current` counts the prisoners
   * `IntakeSystem` housed, and `free`/`utilization` are statements about
   * housing. Projecting `concurrentUseCapacity` here instead would make a
   * canteen read as a dormitory for its furniture.
   *
   * **And that field is the wrong one to project anywhere**, not merely here
   * (issue #326). It is the summed footprint width of *every* object in the
   * room and no gate reads it: ADR 0028's worked canteen reports 14 there and
   * seats 6 diners, and the same canteen holding four toilets reports 19. The
   * ceiling is per capability, in `concurrentUseCapacityByCapability`, so a
   * concurrent-use readout is a readout of that -- one number per thing the
   * room can be used for, not one number for the room.
   *
   * The concurrent-use figure is **not projected at all yet**, and that is a
   * gap rather than a decision: it is the Rooms tab readout ADR 0028 phase 5
   * owes, along with "over capacity" -- which this shape still cannot say,
   * because `free` clamps at zero and `utilization` clamps at 1. An
   * over-capacity room therefore reads as full at 100 %, which is tolerable
   * and is exactly what that phase is for.
   */
  readonly capacity: number;
  /** Absent for an instance whose resident capacity is zero -- a share of nothing has no meaning. */
  readonly utilization?: BoundedValue;
  readonly free: number;
}

export interface RoomSecurityViewModel {
  readonly sectorId: string;
  readonly gradeId: string;
  readonly gradeNameKey?: string;
  readonly minSecurityClearance?: number;
  readonly requiredPermission?: string;
}

export interface RoomListRowViewModel {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  /** Absent when the instance names a room-catalog id the catalog does not define. */
  readonly roomNameKey?: string;
  readonly category?: RoomCategory;
  readonly anchorTile: TileViewModel;
  readonly occupancy: RoomOccupancyViewModel;
  readonly objectCapabilities: readonly string[];
  /** Counts over the catalog's `object` requirements only; the rest are `'not-evaluated'`. */
  readonly requirementSummary: {
    readonly total: number;
    readonly objectRequirements: number;
    readonly satisfiedByCapability: number;
    readonly missingCapability: number;
    readonly notEvaluated: number;
  };
  readonly security?: RoomSecurityViewModel;
}

export interface RoomDetailViewModel extends RoomListRowViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  /** Ascending entity id. `RoomInstanceRegistry.occupantsOf` is canonical too since it stopped handing out `Set` order, but this projection sorts what it gets regardless: the order of this field is this layer's contract, pinned by `tests/determinism/projection-ordering.test.ts`, and it should not become a consequence of a decision taken in the registry. */
  readonly occupantEntityIds: readonly EntityId[];
  readonly requirements: readonly RoomRequirementViewModel[];
}

export interface RoomListViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  readonly rooms: ViewModelPage<RoomListRowViewModel>;
  /** Declared-catalog order, every known room type, including types with no instance placed. */
  readonly countsByRoomCatalogId: readonly {
    readonly roomCatalogId: string;
    readonly roomNameKey: string;
    readonly category: RoomCategory;
    readonly instanceCount: number;
    readonly occupants: number;
    readonly capacity: number;
  }[];
  readonly totals: {
    readonly instances: number;
    readonly occupants: number;
    readonly capacity: number;
  };
}

/**
 * Every registered instance, in ascending instance id.
 *
 * `RoomInstanceRegistry` exposes no "all instances" accessor -- only
 * `allByRoomCatalogId`, which returns a cached, id-sorted array per room
 * type. So enumeration is a fan-out over the room-catalog ids, which also
 * means an instance registered under an id the catalog does not define is
 * invisible to this projection. That is a deliberate, reported limitation,
 * not an oversight: fixing it belongs in the registry, not here.
 */
export function collectRoomInstances(
  source: RoomProjectionSource,
  rooms: ContentRegistry<RoomCatalogDefinition> = defaultRoomContentRegistry,
): readonly RoomInstance[] {
  const collected: RoomInstance[] = [];
  for (const definition of rooms.all()) {
    collected.push(...source.roomInstances.allByRoomCatalogId(definition.id));
  }
  return collected.sort((left, right) => compareStableIds(left.instanceId, right.instanceId));
}

function requirementStatus(
  requirement: RoomRequirementDefinition,
  instance: RoomInstance,
  objects: ContentRegistry<ObjectDefinition>,
): RoomRequirementStatus {
  if (requirement.type !== 'object') return 'not-evaluated';
  const definition = objects.getById(requirement.objectId);
  if (definition === undefined || definition.capabilities.length === 0) return 'missing-capability';
  const satisfied = definition.capabilities.every((capability) => instance.objectCapabilities.includes(capability));
  return satisfied ? 'satisfied-by-capability' : 'missing-capability';
}

function projectRequirement(
  requirement: RoomRequirementDefinition,
  instance: RoomInstance,
  objects: ContentRegistry<ObjectDefinition>,
): RoomRequirementViewModel {
  const status = requirementStatus(requirement, instance, objects);
  if (requirement.type === 'object') {
    const nameKey = objects.getById(requirement.objectId)?.nameKey;
    return {
      type: requirement.type,
      status,
      objectId: requirement.objectId,
      minQuantity: requirement.minQuantity,
      ...(nameKey !== undefined ? { objectNameKey: nameKey } : {}),
    };
  }
  if (requirement.type === 'minimum-size') {
    return {
      type: requirement.type,
      status,
      minWidth: requirement.minWidth,
      minHeight: requirement.minHeight,
      minTiles: requirement.minTiles,
    };
  }
  return { type: requirement.type, status };
}

function projectOccupancy(source: RoomProjectionSource, instance: RoomInstance): RoomOccupancyViewModel {
  const current = source.roomInstances.occupancyOf(instance.instanceId);
  return {
    current,
    capacity: instance.residentCapacity,
    free: Math.max(0, instance.residentCapacity - current),
    ...(instance.residentCapacity > 0 ? { utilization: toBoundedValue(current, instance.residentCapacity) } : {}),
  };
}

function projectSecurity(
  instanceId: string,
  options: RoomProjectionOptions,
  grades: ContentRegistry<SecurityGradeDefinition>,
): RoomSecurityViewModel | undefined {
  const sectorId = options.sectorIdByRoomInstanceId?.get(instanceId);
  if (sectorId === undefined || options.sectors === undefined) return undefined;
  const sector = options.sectors.getDefinition(sectorId);
  if (sector === undefined) return undefined;
  const grade = grades.getById(sector.gradeId);
  return {
    sectorId,
    gradeId: sector.gradeId,
    ...(grade !== undefined
      ? {
          gradeNameKey: grade.nameKey,
          minSecurityClearance: grade.minSecurityClearance,
          ...(grade.requiredPermission !== undefined ? { requiredPermission: grade.requiredPermission } : {}),
        }
      : {}),
  };
}

function projectRow(
  source: RoomProjectionSource,
  instance: RoomInstance,
  rooms: ContentRegistry<RoomCatalogDefinition>,
  objects: ContentRegistry<ObjectDefinition>,
  grades: ContentRegistry<SecurityGradeDefinition>,
  options: RoomProjectionOptions,
): RoomListRowViewModel {
  const definition = rooms.getById(instance.roomCatalogId);
  const requirements = definition?.requirements ?? [];

  let objectRequirements = 0;
  let satisfiedByCapability = 0;
  let missingCapability = 0;
  let notEvaluated = 0;
  for (const requirement of requirements) {
    const status = requirementStatus(requirement, instance, objects);
    if (status === 'not-evaluated') notEvaluated += 1;
    else {
      objectRequirements += 1;
      if (status === 'satisfied-by-capability') satisfiedByCapability += 1;
      else missingCapability += 1;
    }
  }

  const security = projectSecurity(instance.instanceId, options, grades);

  return {
    instanceId: instance.instanceId,
    roomCatalogId: instance.roomCatalogId,
    ...(definition !== undefined ? { roomNameKey: definition.nameKey, category: definition.category } : {}),
    anchorTile: toTileViewModel(instance.anchorTile),
    occupancy: projectOccupancy(source, instance),
    objectCapabilities: [...instance.objectCapabilities].sort(compareStableIds),
    requirementSummary: {
      total: requirements.length,
      objectRequirements,
      satisfiedByCapability,
      missingCapability,
      notEvaluated,
    },
    ...(security !== undefined ? { security } : {}),
  };
}

/**
 * The room list panel.
 *
 * **Cost.** `O(instances)` to enumerate (per-room-type arrays are cached
 * and pre-sorted inside the registry) plus `O(instances log instances)` for
 * the global id sort, then one row object per row in the requested window.
 * Rooms are placed by the player and number in the hundreds, so unlike the
 * prisoner roster this is not an actor-tier concern.
 */
export function projectRoomList(
  source: RoomProjectionSource,
  request: PageRequest = {},
  options: RoomProjectionOptions = {},
): RoomListViewModel {
  const rooms = options.rooms ?? defaultRoomContentRegistry;
  const objects = options.objects ?? defaultObjectRegistry;
  const grades = options.grades ?? defaultSecurityGradeRegistry;

  const instances = collectRoomInstances(source, rooms);
  const allRows = instances.map((instance) => projectRow(source, instance, rooms, objects, grades, options));

  let occupants = 0;
  let capacity = 0;
  for (const row of allRows) {
    occupants += row.occupancy.current;
    capacity += row.occupancy.capacity;
  }

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    rooms: pageOf(allRows, request),
    countsByRoomCatalogId: rooms.all().map((definition) => {
      const ofType = source.roomInstances.allByRoomCatalogId(definition.id);
      let typeOccupants = 0;
      let typeCapacity = 0;
      for (const instance of ofType) {
        typeOccupants += source.roomInstances.occupancyOf(instance.instanceId);
        typeCapacity += instance.residentCapacity;
      }
      return {
        roomCatalogId: definition.id,
        roomNameKey: definition.nameKey,
        category: definition.category,
        instanceCount: ofType.length,
        occupants: typeOccupants,
        capacity: typeCapacity,
      };
    }),
    totals: { instances: allRows.length, occupants, capacity },
  };
}

/** `undefined` for an unregistered instance id. */
export function projectRoomDetail(
  source: RoomProjectionSource,
  instanceId: string,
  options: RoomProjectionOptions = {},
): RoomDetailViewModel | undefined {
  const instance = source.roomInstances.getById(instanceId);
  if (instance === undefined) return undefined;

  const rooms = options.rooms ?? defaultRoomContentRegistry;
  const objects = options.objects ?? defaultObjectRegistry;
  const grades = options.grades ?? defaultSecurityGradeRegistry;
  const definition = rooms.getById(instance.roomCatalogId);

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    ...projectRow(source, instance, rooms, objects, grades, options),
    occupantEntityIds: [...source.roomInstances.occupantsOf(instanceId)].sort(compareEntityIds),
    requirements: (definition?.requirements ?? []).map((requirement) => projectRequirement(requirement, instance, objects)),
  };
}
