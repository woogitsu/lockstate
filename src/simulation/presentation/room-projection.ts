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
 * - `'not-evaluated'` -- `enclosed`, `outdoors` and `minimum-size`. A
 *   `RoomInstance` carries an anchor tile and nothing else: no bounds, no
 *   tile set, no wall topology. `RoomSystem.validateRoom` says in its own
 *   body that its size/enclosure checks are mocked, so there is nothing
 *   truthful to project. `minQuantity` is likewise uncheckable -- object
 *   *placement* does not exist, only capability tags.
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
  readonly capacity: number;
  /** Absent for an instance registered with zero capacity -- a share of nothing has no meaning. */
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
  /** Ascending entity id. `RoomInstanceRegistry.occupantsOf` returns `Set` order; this projection sorts it. */
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
    capacity: instance.capacity,
    free: Math.max(0, instance.capacity - current),
    ...(instance.capacity > 0 ? { utilization: toBoundedValue(current, instance.capacity) } : {}),
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
        typeCapacity += instance.capacity;
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
