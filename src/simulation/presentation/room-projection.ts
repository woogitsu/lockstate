import type { ObjectDefinition } from '../../content/object-catalog';
import { defaultObjectRegistry } from '../../content/object-catalog';
import type { ContentRegistry } from '../../content/registry';
import type { RoomCatalogDefinition, RoomCategory, RoomRequirementDefinition } from '../../content/room-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import type { SecurityGradeDefinition } from '../../content/security-grade-catalog';
import { defaultSecurityGradeRegistry } from '../../content/security-grade-catalog';
import type { EntityId } from '../entity/entity-store';
import type { PlacedObject } from '../objects/placed-object';
import { roomContains } from '../objects/room-capacity';
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

/**
 * Read-only slice of `PlacedObjectRegistry` the room projection needs to
 * *count* the objects standing in a room, rather than only to know which
 * capabilities they supply.
 *
 * `all()` and not `inRect`, which the registry also offers and which expresses
 * the same containment rule: `all()` sorts on every call
 * (`PlacedObjectRegistry.all`, deliberately -- the collection changes only on a
 * build or a revert), so a list projection asking `inRect` once per room would
 * pay that sort once per room. This asks once per projection and attributes the
 * objects itself, through `roomContains` -- ADR 0028 decision 2's anchor-tile
 * rule, read from the one module that states it rather than re-derived here.
 */
export interface RoomObjectSource {
  all(): readonly PlacedObject[];
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
  /**
   * What is standing in the prison, so an `object` requirement can be checked
   * against its authored `minQuantity` instead of only against the room's
   * capability list. See `RoomRequirementStatus`.
   *
   * **Optional, and its absence is a weaker answer rather than a wrong one.**
   * Without it every `object` requirement falls back to the capability-set test
   * this projection made before #528, which ignores `minQuantity` -- the state
   * a hand-built fixture that registers `objectCapabilities` directly is in,
   * and the only state a V4 save's boundless instances can be in. The worker
   * supplies it (`worker/projection-catalog.ts`), so no session a player runs
   * takes that path.
   */
  readonly placedObjects?: RoomObjectSource;
}

/**
 * How far a room catalog requirement can actually be checked against a
 * registered room instance.
 *
 * - `'satisfied-by-capability'` -- an `object` requirement the room holds at
 *   least `minQuantity` satisfying objects for. Which objects those are is the
 *   capability rule below; the count is `satisfyingObjectCount`. The capability
 *   half is the same signal `ActionSystem`/`IntakeSystem` actually gate on
 *   (`requiredObjectCapability`), so it is real, load-bearing state.
 * - `'missing-capability'` -- an `object` requirement the room holds fewer than
 *   `minQuantity` satisfying objects for, including none at all.
 * - `'not-evaluated'` -- `enclosed`, `outdoors` and `minimum-size`. Both of
 *   those are evaluated *at zoning time* (`RoomZoningService`: the minimum size
 *   is refused, the enclosure is reported on a notice) and neither answer is
 *   recorded on the instance, so there is still nothing for this projection to
 *   read.
 *
 * ## `minQuantity` is read, and this comment said for three days that it was not
 *
 * **What it said**, from ADR 0028 phase 1 until this change: *"`minQuantity` is
 * likewise still uncheckable, and the reason has changed. Object placement now
 * exists (ADR 0028 phase 1) and objects *are* individuated, so counting the beds
 * in a cell is possible for the first time -- what is missing is that this
 * projection is not handed the placed objects. Wiring that is phase 4's, which
 * is when a second object type makes a *quantity* mean something; until then
 * every `object` requirement is answered from the instance's derived capability
 * list exactly as before."* `docs/HUD_PROJECTIONS.md` gap 13 carried the same
 * sentence.
 *
 * **What is true.** Phase 4 landed at `b097e70` on 2026-08-26 (#384) and did
 * *not* wire it -- that commit's own ADR section says so in its own words, *"gap
 * 13 stayed half-answerable rather than becoming answered: `requirementStatus`
 * still compares capabilities and never counts objects, so one chair still
 * satisfies a classroom's requirement for four"*, and calls the counting *"a
 * mechanism, not a row"*. So the deferral above named a phase that had already
 * shipped without it, and the sentence was false from `b097e70` onwards rather
 * than merely stale. Issue #528 is what a player then saw: `room.canteen` asks
 * for two dining tables and four benches, and one of each read the room
 * finished.
 *
 * This projection is now handed the placed objects -- `RoomProjectionOptions.
 * placedObjects` -- and `requirementStatus` counts them. The deferral is
 * therefore discharged rather than re-dated.
 *
 * **The capability fallback survives, and only where there is nothing to
 * count.** An instance with no recorded rectangle (a V4 save; see
 * `RoomInstance`) contains nothing this projection can attribute to it, and a
 * caller that supplies no `placedObjects` has handed it nothing to attribute.
 * Both answer from `instance.objectCapabilities` exactly as before, ignoring
 * `minQuantity`, because the alternative is to report a furnished room as empty.
 * That is the same shape, and the same reason, as
 * `RoomInstanceRegistry.concurrentUseCapacityFor`'s third case.
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
  /**
   * How many objects standing in this room satisfy this requirement (#529).
   *
   * `minQuantity` alone says what the room *asks for*; this is what it *has*,
   * and the difference between them is the only number a player can act on. A
   * canteen asking for four benches and holding three is short **one**, and a
   * readout that could name only `minQuantity` would tell that player to build
   * four -- confidently wrong rather than merely unhelpful, which is a worse
   * outcome than the silence #529 measured.
   *
   * **Absent means nothing was counted, and it is not a zero.** It is present
   * exactly when `RoomProjectionOptions.placedObjects` was supplied *and* the
   * instance has a rectangle to attribute objects to. Without both, the status
   * beside it came from the pre-#528 capability test, which ignores
   * `minQuantity` entirely and therefore cannot support a subtraction. A
   * consumer that defaulted this to `0` would turn "this projection was not
   * told what is standing anywhere" into "this room is empty" -- the same
   * invention `RoomOccupancyViewModel.utilization` refuses by being absent
   * rather than zero for a room whose capacity is zero.
   * `src/ui/simulation-room-needs.ts` carries the absence across the HUD
   * boundary for that reason, and the Rooms panel renders an uncounted need
   * with no numeral at all rather than with a guessed one.
   *
   * Only ever present on an `object` requirement: the other three kinds are
   * `'not-evaluated'` and there is nothing to count.
   */
  readonly satisfyingQuantity?: number;
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

/**
 * What each room instance contains, keyed by instance id -- or `undefined` when
 * nothing was handed to this projection to attribute.
 *
 * An instance **with** a rectangle always gets an entry, empty list included:
 * "this room has a rectangle and nothing is standing in it" is a different
 * answer from "nobody told this projection what is standing anywhere", and only
 * the first may be counted against a `minQuantity`. An instance with no
 * rectangle gets no entry, for the reason `roomBoundsOf` gives: a V4 save
 * records none and inventing one would assert a room the player did not zone.
 *
 * **Cost.** One `all()` -- a single `O(objects log objects)` sort -- and then
 * one `roomContains` test per (instance, object) pair. Rectangles never
 * overlap (`RoomZoningService.zone` refuses `overlaps-existing-room`), so the
 * inner loop stops at the first instance that claims an object.
 */
function contentsByInstanceId(
  instances: readonly RoomInstance[],
  placedObjects: RoomObjectSource | undefined,
): ReadonlyMap<string, readonly PlacedObject[]> | undefined {
  if (placedObjects === undefined) return undefined;
  const contents = new Map<string, PlacedObject[]>();
  const bounded: RoomInstance[] = [];
  for (const instance of instances) {
    if (instance.width === undefined || instance.height === undefined) continue;
    contents.set(instance.instanceId, []);
    bounded.push(instance);
  }
  for (const object of placedObjects.all()) {
    for (const instance of bounded) {
      if (!roomContains(instance, object.anchorTile)) continue;
      contents.get(instance.instanceId)!.push(object);
      break;
    }
  }
  return contents;
}

/**
 * How many of the objects standing in a room satisfy one `object` requirement.
 *
 * **Capability containment, per object, and that is the rule this repository
 * already chose rather than a new one.** An object satisfies a requirement when
 * *its own* catalog capabilities are a superset of the required object's, which
 * is what `src/simulation/construction/definition.ts` states in the buildable
 * registry and calls "the containment rule doing its job, not an accident of
 * these rows": a security console standing in a reception satisfies its **desk**
 * requirement, because a console declares `'workstation'` and everything else a
 * desk declares, while a desk in a security office does not satisfy the console
 * requirement, because it declares no `'surveillance'`. The same asymmetry makes
 * a medical bed a bed and a bed not a medical bed.
 *
 * **Per object, where the pre-#528 test was against the room's capability
 * *union*.** That union permitted two objects to jointly satisfy one
 * requirement -- a desk plus some other `'surveillance'` thing reading as a
 * security console -- which nothing ever stated and which counting cannot
 * express anyway, since a count has to attribute each object to at most one
 * requirement it satisfies. It is unobservable in the shipped catalogues: each
 * of the four required objects declaring more than one capability
 * (`object.shower-head`, `object.bench`, `object.security-console`,
 * `object.medical-bed`) owns one of its capabilities outright -- `'shower'`,
 * `'recreation'`, `'surveillance'`, `'medical-treatment'` -- so a room whose
 * union covers the set already contains the object itself.
 *
 * An object naming a catalogue id this build does not declare counts for
 * nothing rather than throwing, for `deriveRoomCapacity`'s reason: the row can
 * only have come from a save, and one unreadable row must not make a prison
 * read as unfinished.
 */
function satisfyingObjectCount(
  required: ObjectDefinition,
  contents: readonly PlacedObject[],
  objects: ContentRegistry<ObjectDefinition>,
): number {
  let count = 0;
  for (const placed of contents) {
    const definition = objects.getById(placed.objectId);
    if (definition === undefined) continue;
    if (required.capabilities.every((capability) => definition.capabilities.includes(capability))) count += 1;
  }
  return count;
}

/**
 * The verdict on one requirement, and -- when there was anything to count --
 * how many standing objects satisfied it.
 *
 * The count is carried beside the status rather than recomputed by the caller
 * that wants it, because the two must not be able to disagree: a status of
 * `'missing-capability'` sitting next to a count that meets `minQuantity` would
 * be a contradiction rendered straight onto the screen. One function decides
 * both, which is the same rule `unfinishedRoomIds` follows on the HUD side by
 * reading `missingCapability` rather than re-deriving "unfinished".
 */
interface RequirementEvaluation {
  readonly status: RoomRequirementStatus;
  /** Absent when nothing was counted. See `RoomRequirementViewModel.satisfyingQuantity`. */
  readonly satisfying?: number;
}

/**
 * Evaluate one requirement, counting where a count is possible.
 *
 * **The order of the two guards below is deliberate and is not the order the
 * status-only version used.** That one tested `definition === undefined` first
 * and answered `'missing-capability'` for it whatever `contents` held; this one
 * tests `contents === undefined` first, so that the "nothing was counted" state
 * reports *no* count on every branch it owns -- including the unknown-object
 * branch. The statuses are identical either way (both paths answered, and still
 * answer, `'missing-capability'` for an object id the catalogue does not
 * define); what changes is only whether a number is attached to them, and
 * attaching `0` to a verdict reached without counting is exactly the invention
 * `satisfyingQuantity` is documented not to make.
 */
function evaluateRequirement(
  requirement: RoomRequirementDefinition,
  instance: RoomInstance,
  objects: ContentRegistry<ObjectDefinition>,
  contents: readonly PlacedObject[] | undefined,
): RequirementEvaluation {
  if (requirement.type !== 'object') return { status: 'not-evaluated' };
  const definition = objects.getById(requirement.objectId);
  if (contents === undefined) {
    // Nothing to count: answer from the instance's derived capability list, the
    // pre-#528 test, which ignores `minQuantity`. See `RoomProjectionOptions.placedObjects`.
    if (definition === undefined || definition.capabilities.length === 0) return { status: 'missing-capability' };
    const present = definition.capabilities.every((capability) => instance.objectCapabilities.includes(capability));
    return { status: present ? 'satisfied-by-capability' : 'missing-capability' };
  }
  // A requirement naming an object this build does not declare, or one that
  // declares no capability, is satisfiable by nothing at all -- so zero is a
  // counted answer here rather than an absent one.
  if (definition === undefined || definition.capabilities.length === 0) {
    return { status: 'missing-capability', satisfying: 0 };
  }
  const satisfying = satisfyingObjectCount(definition, contents, objects);
  return {
    status: satisfying >= requirement.minQuantity ? 'satisfied-by-capability' : 'missing-capability',
    satisfying,
  };
}

function requirementStatus(
  requirement: RoomRequirementDefinition,
  instance: RoomInstance,
  objects: ContentRegistry<ObjectDefinition>,
  contents: readonly PlacedObject[] | undefined,
): RoomRequirementStatus {
  return evaluateRequirement(requirement, instance, objects, contents).status;
}

function projectRequirement(
  requirement: RoomRequirementDefinition,
  instance: RoomInstance,
  objects: ContentRegistry<ObjectDefinition>,
  contents: readonly PlacedObject[] | undefined,
): RoomRequirementViewModel {
  const { status, satisfying } = evaluateRequirement(requirement, instance, objects, contents);
  if (requirement.type === 'object') {
    const nameKey = objects.getById(requirement.objectId)?.nameKey;
    return {
      type: requirement.type,
      status,
      objectId: requirement.objectId,
      minQuantity: requirement.minQuantity,
      // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
      // is on, so "nothing was counted" has to be an absent property and not a
      // present one holding nothing.
      ...(satisfying === undefined ? {} : { satisfyingQuantity: satisfying }),
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
  contents: readonly PlacedObject[] | undefined,
): RoomListRowViewModel {
  const definition = rooms.getById(instance.roomCatalogId);
  const requirements = definition?.requirements ?? [];

  let objectRequirements = 0;
  let satisfiedByCapability = 0;
  let missingCapability = 0;
  let notEvaluated = 0;
  for (const requirement of requirements) {
    const status = requirementStatus(requirement, instance, objects, contents);
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
  const contents = contentsByInstanceId(instances, options.placedObjects);
  const allRows = instances.map((instance) =>
    projectRow(source, instance, rooms, objects, grades, options, contents?.get(instance.instanceId)),
  );

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
  const contents = contentsByInstanceId([instance], options.placedObjects)?.get(instanceId);

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    ...projectRow(source, instance, rooms, objects, grades, options, contents),
    occupantEntityIds: [...source.roomInstances.occupantsOf(instanceId)].sort(compareEntityIds),
    requirements: (definition?.requirements ?? []).map((requirement) =>
      projectRequirement(requirement, instance, objects, contents),
    ),
  };
}
