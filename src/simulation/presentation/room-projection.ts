import type { ObjectDefinition } from '../../content/object-catalog';
import { defaultObjectRegistry } from '../../content/object-catalog';
import type { ContentRegistry } from '../../content/registry';
import type { RoomCatalogDefinition, RoomCategory, RoomRequirementDefinition } from '../../content/room-catalog';
import { defaultRoomContentRegistry } from '../../content/room-catalog';
import type { SecurityGradeDefinition } from '../../content/security-grade-catalog';
import { defaultSecurityGradeRegistry } from '../../content/security-grade-catalog';
import type { EntityId } from '../entity/entity-store';
import type { PlacedObject } from '../objects/placed-object';
import { roomBoundsOf, roomContains } from '../objects/room-capacity';
import type { RoomInstance, RoomInstanceRegistry } from '../prisoners/room-instance-registry';
import { roomPerimeterAccess, type RoomDoorReader, type RoomEdgeReader, type RoomPerimeterAccess } from '../rooms/enclosure';
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
  /**
   * The two reads that answer whether anybody can get into a room (#938).
   *
   * **One option holding both, rather than two**, because neither is any use
   * alone: `roomPerimeterAccess` needs the edge layers to know the perimeter
   * is closed *and* the door registry to know whether one of those edges is a
   * doorway, and a half-supplied pair would be a caller that had answered
   * only the question that cannot distinguish the two cases. The type refuses
   * it instead of the projection having to.
   *
   * **Optional, and its absence is silence rather than a guess**, exactly as
   * `placedObjects`' is: without it `RoomListRowViewModel.access` is absent,
   * which is "nobody told this projection about the walls" and not "the room
   * has a way in". The worker supplies it (`worker/projection-catalog.ts`),
   * so no session a player runs takes that path.
   */
  readonly perimeter?: {
    readonly edges: RoomEdgeReader;
    readonly doors: RoomDoorReader;
  };
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
 * count.** An instance with no recorded rectangle (see `RoomInstance`; a V4 row
 * used to be the example and since #559 its rectangle is recovered at restore)
 * contains nothing this projection can attribute to it, and a
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
   * The concurrent-use figure is projected, and it is **not here**: it is
   * `RoomListRowViewModel.concurrentUse`, one entry per capability, which is
   * the shape the paragraph above says the answer has to take. This comment
   * read *"The concurrent-use figure is **not projected at all yet**, and that
   * is a gap rather than a decision: it is the Rooms tab readout ADR 0028
   * phase 5 owes"* until that field landed; the sentence is kept rather than
   * deleted because it is the reason the field is a sibling of this one rather
   * than a reinterpretation of it.
   *
   * **"Over capacity" is a separate half and is still owed a surface, but not
   * a projection field** -- and the sentence here used to say otherwise. It
   * read *"along with 'over capacity' -- which this shape still cannot say,
   * because `free` clamps at zero and `utilization` clamps at 1"*, and the
   * clamping half is true while the conclusion is not: `current` and
   * `capacity` are both published raw, so `current > capacity` is derivable
   * from this view model by any reader. What no reader does is *say* it, which
   * is a gap in the HUD and not in this shape. An over-capacity room still
   * reads as full at 100 % in `free`/`utilization`.
   */
  readonly capacity: number;
  /** Absent for an instance whose resident capacity is zero -- a share of nothing has no meaning. */
  readonly utilization?: BoundedValue;
  readonly free: number;
}

/**
 * How many actors may use one room at once **for one thing it can be used
 * for**, and how many are doing so at the moment this was projected.
 *
 * ## Why this is not a field on `RoomOccupancyViewModel`
 *
 * That type's own comment forbids it twice over: `capacity` there is the
 * *resident* ceiling, and projecting `RoomInstance.concurrentUseCapacity`
 * beside it "would make a canteen read as a dormitory for its furniture". The
 * second half is sharper -- `concurrentUseCapacity` is the summed footprint
 * width of **every** object in the room and no gate reads it (issue #326), so
 * a readout of that scalar is a readout of nothing enforced. The ceiling lives
 * per capability, in `RoomInstance.concurrentUseCapacityByCapability`, and one
 * number for the room cannot carry it: ADR 0028's worked canteen seats 6
 * diners on 8 bench places while its scalar reads 14.
 *
 * So this is a **list**, one entry per capability the room supplies, and the
 * scalar is still projected nowhere.
 *
 * ## Both numbers, and neither derived from the other
 *
 * `capacity` is `RoomInstanceRegistry.concurrentUseCapacityFor`'s answer --
 * the same function `findAvailableForUse` and `claimUse` gate against, read
 * rather than re-summed here, so a readout cannot disagree with the gate.
 * `inUse` is `useOccupancyOf` scoped to the same capability, which is the
 * count that gate compares against.
 *
 * **`inUse` may exceed `capacity`.** `claimUse` refuses above the ceiling, but
 * `reinstateUseClaim` records a restored claim either way, and an object
 * removed under a performing actor drops the ceiling beneath a claim that
 * already stands (ADR 0028 decision 2: nobody is evicted). Neither figure is
 * clamped here, for `RoomOccupancyViewModel.free`'s opposite reason: clamping
 * is what makes an over-capacity room indistinguishable from a full one.
 *
 * ## The one ceiling this does not carry
 *
 * A room whose action names **no** capability -- `room.yard` and
 * `action.yard-recreation` -- is bounded by its own ground rather than by its
 * objects (`concurrentUseCapacityFor` case 1, ADR 0071), and that ceiling is
 * keyed by no capability, so it has no entry here. It is deliberately left to
 * a follow-up rather than approximated: the claims against it cannot be
 * counted from this side, because `useOccupancyOf` with no capability counts
 * *every* claim on the instance rather than only the capability-less ones, and
 * narrowing it is a change in `RoomInstanceRegistry`.
 */
export interface RoomConcurrentUseViewModel {
  /** The thing the room can be used for: an object capability (`'hygiene'`, `'dining'`). A stable simulation id, never rendered. */
  readonly capability: string;
  /** How many may use the room for it at once. `concurrentUseCapacityFor`'s answer. */
  readonly capacity: number;
  /** How many are using it for that right now. `useOccupancyOf`, scoped to the same capability. */
  readonly inUse: number;
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
  /**
   * The concurrent-use ceiling and the live count against it, one entry per
   * capability, ascending by capability (ADR 0028 phase 5).
   *
   * **Keyed by the same list `objectCapabilities` above carries, in the same
   * order**, because both come from `RoomInstance` and a second ordering rule
   * here would be a second answer to "what can this room be used for".
   *
   * **Required, not optional, and empty is a real answer**: a room supplying
   * no capability -- a bare rectangle, a yard -- has nothing to be used for
   * through this rule and says so, rather than a producer being allowed to
   * stay silent and a consumer defaulting the silence to "nothing". That is
   * `HudRoomViewModel.objectRequirements`' recorded reason, applied here.
   *
   * **Cost:** per row, one `concurrentUseCapacityFor` and one `useOccupancyOf`
   * per capability. The first walks the instance's own breakdown; the second
   * walks the claims held on that one instance, which that room's own ceiling
   * bounds. The shipped catalogue's deepest room supplies four capabilities.
   */
  readonly concurrentUse: readonly RoomConcurrentUseViewModel[];
  /**
   * Whether anything can cross this room's own boundary (#938).
   *
   * `'no-way-in'` is the state issue #938 measured: a room the game accepts,
   * counts, and reports requirement-complete, that no prisoner can ever enter
   * because every edge on its perimeter is a wall and none of them is a
   * registered door. It is `RoomPerimeterAccess`' own vocabulary, carried
   * whole rather than reduced to a boolean, because `'gap'` and `'doorway'`
   * are different facts about the player's building and a consumer that wants
   * only the warning can test one value.
   *
   * **Absent is a real state and is not `'doorway'`.** Two ways to get it,
   * and both are "this projection was not told" rather than "the room is
   * fine": the caller supplied no `RoomProjectionOptions.perimeter`, or the
   * instance carries no rectangle to walk (`RoomInstance.width`/`height`
   * undefined -- a row no zoning plane supports). Defaulting it either way
   * would turn a question nobody asked into an answer, which is the invention
   * `satisfyingQuantity`'s own comment refuses in the same shape.
   *
   * Not part of `requirementSummary`, and deliberately not a fourth
   * `RoomRequirementDefinition['type']`: that vocabulary is closed at
   * `src/simulation/rooms/definition.ts` and widening it is an architectural
   * decision with an ADR's worth of consequences (issue #938 §6 option 1),
   * beginning with the fact that a doorway cannot be checked where the other
   * requirements are -- `zone` runs before any door order could exist. This
   * is a *fact about the instance*, published beside the requirement verdict
   * rather than inside it.
   */
  readonly access?: RoomPerimeterAccess;
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
 * rectangle gets no entry, for the reason `roomBoundsOf` gives: inventing one
 * would assert a room the player did not zone. (A V4 row was the example here;
 * since #559 the restore recovers its rectangle from the zoning plane, so what
 * is left is a row no plane supports.)
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

/**
 * The room's own boundary, or nothing at all (#938).
 *
 * Two absences, and neither may be softened into an answer: no `perimeter`
 * option means nobody asked, and an instance with no rectangle has no
 * perimeter to walk.
 *
 * The rectangle is `roomBoundsOf`'s, not one assembled here. That function is
 * this repository's single definition of "which tiles this instance occupies"
 * -- `anchorTile` as the north-west corner plus the recorded `width`/`height`,
 * `undefined` for an instance carrying no bounds or degenerate ones -- and it
 * is what `roomContains` attributes objects through two functions below. A
 * second assembly of the same three fields here would be a second definition
 * of a room's extent, and the perimeter walk would be reading a different
 * rectangle from the one the object count is attributed to.
 */
function projectAccess(instance: RoomInstance, options: RoomProjectionOptions): RoomPerimeterAccess | undefined {
  const { perimeter } = options;
  if (perimeter === undefined) return undefined;
  const bounds = roomBoundsOf(instance);
  if (bounds === undefined) return undefined;
  return roomPerimeterAccess(perimeter.edges, perimeter.doors, bounds);
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
  const access = projectAccess(instance, options);
  // One sorted list, read twice: the capabilities the row publishes and the
  // keys of the concurrent-use list are the same set in the same order, and
  // sorting twice would be two chances to disagree.
  const objectCapabilities = [...instance.objectCapabilities].sort(compareStableIds);

  return {
    instanceId: instance.instanceId,
    roomCatalogId: instance.roomCatalogId,
    ...(definition !== undefined ? { roomNameKey: definition.nameKey, category: definition.category } : {}),
    anchorTile: toTileViewModel(instance.anchorTile),
    occupancy: projectOccupancy(source, instance),
    objectCapabilities,
    concurrentUse: objectCapabilities.map((capability) => ({
      capability,
      capacity: source.roomInstances.concurrentUseCapacityFor(instance, capability),
      inUse: source.roomInstances.useOccupancyOf(instance.instanceId, capability),
    })),
    ...(access !== undefined ? { access } : {}),
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
