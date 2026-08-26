import { defaultItemRegistry } from '../../content/item-catalog';
import { defaultObjectRegistry } from '../../content/object-catalog';
import { defaultSecurityGradeRegistry } from '../../content/security-grade-catalog';
import type { DoorState } from '../navigation/door';

export type BuildableCategory = 'wall' | 'object' | 'utility';

export interface MaterialRequirement {
  readonly itemId: string;
  readonly quantity: number;
}

export interface BuildableDefinition {
  readonly id: string;
  readonly category: BuildableCategory;
  readonly name: string;
  readonly workRequired: number; // Simulated ticks or work units
  readonly materialsRequired: readonly MaterialRequirement[];
  /**
   * The `src/content/object-catalog.ts` id a completed order for this
   * buildable puts in the world, for a buildable that places a discrete
   * object ([ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
   * decision 4).
   *
   * Absent means "this buildable places no object", which is what every
   * buildable before phase 1 meant. `door-wooden` is still absent from here and
   * always will be: it places a **door**, which is a fact about a tile edge and
   * not a row addressed by an anchor tile -- see `placesDoor` below.
   *
   * A **content id**, not a numeric id and not a message key: the footprint,
   * the capabilities and the label all come from the catalogue entry, so
   * nothing about an object is authored twice.
   * `validateBuildableObjectReferences` checks the reference at import time,
   * exactly as `validateBuildableItemReferences` checks the material one.
   */
  readonly placesObjectId?: string;
  /**
   * What a completed order for this buildable registers in `DoorRegistry`, for
   * a buildable that puts a **door** on a tile edge.
   *
   * Absent means "this buildable is not a door", which is what every buildable
   * except `door-wooden` means.
   *
   * **Mutually exclusive with `placesObjectId`, and that is the shape of the
   * decision rather than a lint.** A placed object is a row addressed by an
   * *anchor tile* with a footprint of tiles ([ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
   * decision 1); a door is a fact about a tile *edge*, which is the one thing
   * a tile-addressed footprint cannot express -- the edge between (4,6) and
   * (3,6) belongs to neither tile more than the other. Writing a door as an
   * object would also make it count toward
   * `RoomCapacityResolver`'s `concurrentUseCapacity`, which sums
   * `footprint.width` over everything standing in the room regardless of
   * capability (the open defect #326): a door would silently hand its room
   * another unit of occupancy. `validateBuildableDoorReferences` refuses the
   * combination at import time.
   */
  readonly placesDoor?: DoorPlacement;
}

/**
 * What a completed door order needs to know to become a `DoorDefinition`.
 *
 * Deliberately **not** a `requiredSecurityClearance`/`requiredPermission`
 * pair. `createGradedDoor` (`../security/sector.ts`) states the rule this
 * follows: "a door gating entry into a sector should be authored through this,
 * not with hand-picked `requiredSecurityClearance`/`requiredPermission` values
 * that could silently drift from the sector's own stated grade." So the
 * buildable names a **grade** and the two access fields are read off it, which
 * is `docs/NAVIGATION.md`'s fourth undecided item answered the way that file
 * said it had to be.
 */
export interface DoorPlacement {
  /** An id from `src/content/security-grade-catalog.ts`; supplies clearance and permission. */
  readonly securityGradeId: string;
  /** The door's state the moment it is built. `DoorRegistry` is the only thing that changes it afterwards. */
  readonly initialState: DoorState;
  /** Relative traversal cost multiplier, >= 1; see `doorTraversalCost`. */
  readonly costMultiplier: number;
}

export const BUILDABLE_REGISTRY = new Map<string, BuildableDefinition>([
  ['wall-brick', {
    id: 'wall-brick',
    category: 'wall',
    name: 'Brick Wall',
    workRequired: 50,
    materialsRequired: [{ itemId: 'item.brick', quantity: 2 }],
  }],
  /*
   * The one buildable that puts a door on a tile edge, and the row that was a
   * shipped defect until it got `placesDoor`.
   *
   * **What it used to be**: a Build-panel row that consumed a plank, finished,
   * and changed nothing whatever in the simulation -- `edgeNumericIdFor`
   * answered `0` for it, `ConstructionSystem` held no `DoorRegistry`, and a
   * completed order wrote nothing anybody could read. The comment on
   * `edgeNumericIdFor` below used to end by saying so and calling the defect
   * open; it now says what closed it.
   *
   * **Why it is not a `placesObjectId`.** ADR 0028 phase 1 predicted that
   * object placement would fix this row, and it could not: a placed object is
   * addressed by an anchor *tile* and a door is a fact about a tile *edge*, and
   * `src/content/object-catalog.ts` declares no wooden door at all
   * (`object.loading-dock-door` is a three-tile delivery door with a
   * `'delivery-access'` capability, which is a different thing). The prediction
   * was right about the outcome and wrong about the route; see `placesDoor`
   * above for the two consequences that decided it.
   *
   * **`category: 'object'` is unchanged**, and it is still not a mistyped
   * `'wall'`: `'wall'` means *opaque* edge geometry, and promoting the door
   * would build a solid wall where the player asked for a door. What changed is
   * that `'wall'` stopped being the only thing that occupies an edge -- see
   * `occupiesTileEdge` and `DOOR_EDGE_NUMERIC_ID` below.
   *
   * **`grade.general`**, whose `minSecurityClearance` is `0` and which names no
   * permission, because an ordinary wooden door is the one that gates nothing:
   * it is a physical barrier with a lock state, not a checkpoint. A door that
   * gates a wing is a different buildable naming a different grade, and adding
   * one is a content row rather than a code change -- which is the whole reason
   * the grade is named here instead of a clearance number.
   *
   * **`initialState: 'closed'`** rather than `'open'`, because a door that
   * appeared standing open would make a freshly built cell no different from a
   * doorway. `'closed'` is passable to anyone the grade admits, at
   * `doorTraversalCost`'s 1.5x, which is the "opening delay" that file
   * describes. Nothing in `src/` opens or shuts it afterwards except
   * `SecuritySectorRegistry`, and that is the state a door-operation system
   * would take over.
   *
   * **The two numbers are untouched placeholders**, not choices this change
   * made: `workRequired: 30` and one `item.wood-plank` are what the row has
   * carried since #16, and ADR 0017 decision 5 reserves all pricing and balance
   * to #29.
   */
  ['door-wooden', {
    id: 'door-wooden',
    category: 'object',
    name: 'Wooden Door',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
    placesDoor: { securityGradeId: 'grade.general', initialState: 'closed', costMultiplier: 1 },
  }],
  /*
   * The first buildable that puts a discrete object in the world (ADR 0028
   * phase 1), and the reason `placesObjectId` exists.
   *
   * **Every number here is a placeholder and none of them is decided by this
   * change.** ADR 0017 decision 5 reserves all pricing and balance to #29, and
   * a `materialsRequired` quantity is a balance value in exactly the sense a
   * `unitPriceMinorUnits` is -- so this follows the shape
   * `src/content/procurement-catalog.ts` already uses for its two prices and
   * says so at the declaration rather than in a commit message.
   *
   *   - **One material, and that is a constraint rather than a taste.**
   *     `purchasableMaterialFor` in `src/main.ts` offers a stepper for the
   *     *first* priced requirement only, and states that a two-material
   *     buildable would get a control for one of them and no way to buy the
   *     other. So the first object requires one material until a
   *     multi-material buy surface is designed.
   *   - **`item.wood-plank` rather than `item.brick`**, because it is the one
   *     of the two priced materials a bed is plausibly made of, and because
   *     `door-wooden` already proves the plank route works end to end.
   *   - **`workRequired: 30`** is `door-wooden`'s figure, taken rather than
   *     chosen: at `+10` per scheduled tick on a 10-tick schedule that is three
   *     progress ticks plus three state transitions, about 60 ticks or 3s at
   *     1x. Whether furniture should take longer than a door is a balance
   *     question with the same owner as the quantity.
   *
   * `category: 'object'` is what it already was for a door -- the category has
   * had three members since #16 and this is the first row where the third one
   * finishes meaningfully.
   */
  ['bed-wooden', {
    id: 'bed-wooden',
    category: 'object',
    name: 'Bed',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
    placesObjectId: 'object.bed',
  }],
  /*
   * The second object buildable, and the one that finishes a cell (ADR 0028
   * phase 2).
   *
   * **This row is the whole of that phase's mechanism**, which is what the ADR
   * predicted: "ships `object.toilet` as a second buildable, and nothing
   * structural". Every part of the route it travels already existed --
   * `PlaceObject` validates a footprint against the world, the standing objects
   * and the orders in flight without naming an object id; `RoomCapacityResolver`
   * sums `footprint.width` over whatever is standing in the rectangle and
   * unions the capabilities; `buildableLabelKey` in `src/main.ts` reads the
   * label off `object.toilet`'s own `nameKey`; and `structureAppearance` reads
   * the footprint through `placesObjectId`. So a toilet needs no code and no
   * content id: `object.toilet` has been declared since the object catalogue
   * shipped, and `'object.toilet.name'` has been in the default locale just as
   * long.
   *
   * What it changes is the one thing phase 1 could not: a zoned `room.cell`
   * requires `object.bed` **and** `object.toilet`
   * (`src/content/room-catalog.ts`), so a cell with only a bed reads
   * `'missing-capability'` on a requirement the catalogue itself declares.
   * With this row the cell's derived capabilities become
   * `['sanitation', 'sleep-surface']` and both requirements read
   * `'satisfied-by-capability'`.
   *
   * **Every number here is a placeholder, exactly as the bed's are**, and none
   * of them is decided by this change: ADR 0017 decision 5 reserves all pricing
   * and balance to #29, and a `materialsRequired` quantity is a balance value in
   * the same sense a `unitPriceMinorUnits` is.
   *
   *   - **One material**, for the constraint the bed's comment states rather
   *     than for taste: `purchasableMaterialFor` in `src/main.ts` offers a
   *     stepper for the *first* priced requirement only, so a two-material
   *     buildable would get a control for one of them and no way to buy the
   *     other.
   *   - **`item.brick` rather than `item.wood-plank`**, by the bed's own
   *     reasoning applied to a sanitary fixture: it is the fired-clay one of the
   *     two materials `src/content/procurement-catalog.ts` prices, and it is the
   *     one of the two a toilet is plausibly made of. It also means the two
   *     object rows consume *different* materials, so the object route is
   *     measurably not wired to one item.
   *   - **The id's second token names the material this row consumes**, as
   *     `wall-brick`, `door-wooden` and `bed-wooden` all do. It is not a claim
   *     about porcelain: the catalogue prices two materials and neither is
   *     ceramic, and authoring a third with a price is the decision reserved to
   *     #29. The id is never shown to a player -- the Build panel's label is
   *     `object.toilet.name`, "Toilet".
   *   - **`workRequired: 30`**, `bed-wooden`'s and `door-wooden`'s figure, taken
   *     rather than chosen, so nothing here says a toilet takes longer or less
   *     time to install than a bed. Whether furniture should differ is a balance
   *     question with the same owner as the quantity.
   */
  ['toilet-brick', {
    id: 'toilet-brick',
    category: 'object',
    name: 'Toilet',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.brick', quantity: 1 }],
    placesObjectId: 'object.toilet',
  }],
]);

export type BuildableItemReferenceError = {
  readonly kind: 'missing-item-reference';
  readonly buildableId: string;
  readonly itemId: string;
};

/**
 * Every material a buildable requires must be a real item definition.
 *
 * `BUILDABLE_REGISTRY` and `src/content/item-catalog.ts` were two
 * unrelated vocabularies -- the former said `'brick'`, the latter
 * `'item.brick'`, and nothing ever put one into the other's hands. That
 * was silent rather than harmless: while nothing supplied construction
 * materials at all (#89) a mismatch cost nothing, and
 * `tests/unit/operations-construction-integration.test.ts` recorded the
 * split in a comment as though it were a design decision.
 *
 * **The supply side exists now**, and this check is why its arrival was
 * uneventful. `ProcurementSystem` deposits stock using item-catalog ids
 * (#96), which is exactly the case this was written ahead of: a mismatch
 * would produce no error anywhere, only a build order waiting in
 * `'materials-pending'` forever -- indistinguishable from #89 itself, the
 * defect the supply side was built to fix. The demand side had to speak the
 * same vocabulary as the supply side *before* there was one, so the two are
 * checked against each other here, at import time, and a failure is loud.
 *
 * This is the buildables-to-items direction. The reverse check -- a
 * supplier naming an item nothing declares -- belongs with whatever
 * introduces supply, and does not exist yet.
 */
export function validateBuildableItemReferences(): readonly BuildableItemReferenceError[] {
  const errors: BuildableItemReferenceError[] = [];

  for (const id of [...BUILDABLE_REGISTRY.keys()].sort()) {
    for (const requirement of BUILDABLE_REGISTRY.get(id)!.materialsRequired) {
      if (!defaultItemRegistry.has(requirement.itemId)) {
        errors.push({ kind: 'missing-item-reference', buildableId: id, itemId: requirement.itemId });
      }
    }
  }

  return errors;
}

const buildableItemReferenceErrors = validateBuildableItemReferences();

if (buildableItemReferenceErrors.length > 0) {
  throw new Error(`Buildable definitions reference unknown items: ${JSON.stringify(buildableItemReferenceErrors)}`);
}

export type BuildableObjectReferenceError = {
  readonly kind: 'missing-object-reference';
  readonly buildableId: string;
  readonly objectId: string;
};

/**
 * Every object a buildable claims to place must be a real object definition.
 *
 * The sibling of `validateBuildableItemReferences`, added for the same reason
 * and against the same measured failure. A `placesObjectId` naming an id the
 * catalogue does not declare produces no error anywhere: the placement service
 * refuses the command with `unknown-object`, and the row sits in the Build
 * panel refusing every press -- indistinguishable from the object tool not
 * working. Checking at import time makes the failure loud and puts it next to
 * its cause.
 *
 * Ids are walked in sorted order so a build with two broken rows reports them
 * in a stable order rather than in `Map` insertion order.
 */
export function validateBuildableObjectReferences(): readonly BuildableObjectReferenceError[] {
  const errors: BuildableObjectReferenceError[] = [];

  for (const id of [...BUILDABLE_REGISTRY.keys()].sort()) {
    const objectId = BUILDABLE_REGISTRY.get(id)!.placesObjectId;
    if (objectId === undefined) continue;
    if (!defaultObjectRegistry.has(objectId)) {
      errors.push({ kind: 'missing-object-reference', buildableId: id, objectId });
    }
  }

  return errors;
}

const buildableObjectReferenceErrors = validateBuildableObjectReferences();

if (buildableObjectReferenceErrors.length > 0) {
  throw new Error(`Buildable definitions reference unknown objects: ${JSON.stringify(buildableObjectReferenceErrors)}`);
}

export type BuildableDoorReferenceError =
  | { readonly kind: 'missing-grade-reference'; readonly buildableId: string; readonly securityGradeId: string }
  | { readonly kind: 'door-and-object'; readonly buildableId: string };

/**
 * Every door a buildable claims to place must name a real security grade, and
 * no buildable may claim to place a door *and* an object.
 *
 * The third sibling of `validateBuildableItemReferences` and
 * `validateBuildableObjectReferences`, added for the same reason and against
 * the same measured shape of failure -- a reference that is wrong produces no
 * error anywhere, only a row that misbehaves at the far end of a
 * sixty-tick build.
 *
 *   - **A grade id no catalogue declares** would reach `createGradedDoor`
 *     inside `ConstructionSystem.update`, where it throws a `RangeError` --
 *     out of a scheduled system update, which faults the worker. Checking at
 *     import time turns a session-killing fault into a build that will not
 *     start.
 *   - **A buildable naming both a door and an object** is not merely odd, it
 *     is unimplementable: `finalizeConstruction` writes an edge value for one
 *     and hands the anchor tile to `ObjectPlacementSink` for the other, and
 *     the two branches are exclusive. Rather than let the order of two `if`s
 *     silently decide which half a content author gets, the combination is
 *     refused where it is authored.
 *
 * Ids are walked in sorted order so a build with two broken rows reports them
 * in a stable order rather than in `Map` insertion order.
 */
export function validateBuildableDoorReferences(): readonly BuildableDoorReferenceError[] {
  const errors: BuildableDoorReferenceError[] = [];

  for (const id of [...BUILDABLE_REGISTRY.keys()].sort()) {
    const definition = BUILDABLE_REGISTRY.get(id)!;
    if (definition.placesDoor === undefined) continue;
    if (definition.placesObjectId !== undefined) {
      errors.push({ kind: 'door-and-object', buildableId: id });
    }
    if (!defaultSecurityGradeRegistry.has(definition.placesDoor.securityGradeId)) {
      errors.push({
        kind: 'missing-grade-reference',
        buildableId: id,
        securityGradeId: definition.placesDoor.securityGradeId,
      });
    }
  }

  return errors;
}

const buildableDoorReferenceErrors = validateBuildableDoorReferences();

if (buildableDoorReferenceErrors.length > 0) {
  throw new Error(`Buildable door definitions are invalid: ${JSON.stringify(buildableDoorReferenceErrors)}`);
}

/**
 * What a completed wall writes into the world's `topEdge` / `leftEdge` layer.
 *
 * The layers are `Uint8Array`s whose only published meaning today is
 * "zero means nothing is here": `TopologyManager` flood-fills across any
 * zero edge and stops at any non-zero one, and the renderer draws an edge
 * wall wherever the value is non-zero. `1` is therefore "a wall segment", not
 * a material id -- when different wall materials need to look different, the
 * value becomes a per-definition id and this constant becomes its default.
 */
export const WALL_EDGE_NUMERIC_ID = 1;

/**
 * What a completed **door** writes into the same layer.
 *
 * A second value in a layer whose only published meaning used to be "zero
 * means nothing is here", and the constant above already anticipated it: "when
 * different wall materials need to look different, the value becomes a
 * per-definition id and this constant becomes its default."
 *
 * ## Why a door writes an edge value at all
 *
 * Because it is the barrier. A wall line with a door in it is a wall line: the
 * room on the inside is *enclosed*, and a prisoner crosses at the door rather
 * than anywhere along it. Every consumer of the edge layers reads that
 * correctly from a non-zero value and would read it wrongly from a zero:
 *
 *   - `TopologyManager` flood-fills across zero edges, so a door written as
 *     `0` would put a cell and the corridor outside it in **one region**, and
 *     `roomPerimeterEnclosure` would report the cell `'open'`. A cell whose
 *     door made it stop being a cell is not a door.
 *   - The renderer draws an edge wherever the value is non-zero, so a door
 *     written as `0` is invisible -- which is the defect this row already was,
 *     preserved in a new place.
 *
 * ## Why that does not seal the room, which is the objection this file used to
 * raise against exactly this
 *
 * **Because navigation reads the door before it reads the edge.**
 * `buildNavigationGraph` and `boundedLocalSearch` both ask
 * `DoorRegistry.getByEdge` *first* and only fall through to the wall value when
 * there is no door (`../navigation/region-graph.ts`,
 * `../navigation/local-search.ts`), and `docs/NAVIGATION.md` states the rule
 * they implement: "a door registered at an edge is authoritative for gating
 * that edge, **whatever the world's own edge value is**; a plain nonzero edge
 * value with no registered door is an ordinary, permanently impassable wall."
 * The navigation fixtures have been built this way since #21 --
 * `buildTwoRoomFixture` walls a whole column and registers two doors on it.
 *
 * So the two answers a door produces are different answers to different
 * questions, and both are right:
 *
 *   - **Topology / enclosure**: two regions. A door delimits a room; that is
 *     what makes a cell a cell.
 *   - **Navigation**: two regions joined by a `Portal`, permission-checked at
 *     traversal time. That is what makes the cell reachable.
 *
 * The old sentence here -- "recording a door as one would seal the room it is
 * supposed to open" -- was true of an edge value written **without** a
 * `DoorRegistry` row, which is all this file could offer at the time. It is the
 * missing half that sealed the room, not the edge value.
 *
 * ## Why not simply reuse `WALL_EDGE_NUMERIC_ID`
 *
 * Nothing in `src/` discriminates on the value yet -- every consumer tests
 * `!== 0` -- so a door written as `1` would behave identically today. It is a
 * separate value because the *save* carries it: the edge layers are RLE'd into
 * the world snapshot, so a prison built now records where its doors are, and a
 * renderer that draws a door differently becomes a change to the renderer alone
 * rather than a change that cannot tell the two apart in any existing save.
 * **The renderer does not draw it differently today**, and that is owed work
 * rather than a claim: `tile-layer.ts` paints every non-zero edge with
 * `EDGE_WALL_APPEARANCE`, so a finished door currently looks like a wall.
 */
export const DOOR_EDGE_NUMERIC_ID = 2;

/**
 * Whether a completed order for this buildable occupies a tile **edge** rather
 * than a tile.
 *
 * Two members of `BuildableCategory` are edge geometry now, which is why this
 * is a predicate and not `category === 'wall'` written out at each call site:
 * a `'wall'`, and any buildable that names a `placesDoor`. It is exported
 * because the composition root needs the same answer to decide whether the
 * Build panel shows its edge chooser (`src/main.ts`), and a second copy of the
 * rule there is how the two would come to disagree.
 */
export function occupiesTileEdge(definition: BuildableDefinition): boolean {
  return definition.category === 'wall' || definition.placesDoor !== undefined;
}

/**
 * The edge-layer value a completed order for this buildable writes, or `0`
 * for a buildable that is not edge geometry at all.
 *
 * Three answers, and the third is the one that closed a shipped defect.
 * A `'wall'` writes `WALL_EDGE_NUMERIC_ID`. A buildable naming a `placesDoor`
 * writes `DOOR_EDGE_NUMERIC_ID`, and `ConstructionSystem.finalizeConstruction`
 * registers the matching `DoorDefinition` in the same call -- the two halves
 * are what make it a door rather than a wall, and neither is a door on its own.
 * Everything else writes nothing: a buildable that places an *object* is
 * addressed by a tile, and a `'utility'` row still has nothing to write.
 *
 * `door-wooden` used to fall in the third bucket with no `placesDoor`, so a
 * completed order for it consumed a plank and changed nothing whatever in the
 * simulation -- the one buildable the registry offered that could not finish
 * meaningfully. `DOOR_EDGE_NUMERIC_ID`'s comment above is where the reasoning
 * that kept it that way is answered, point by point.
 */
export function edgeNumericIdFor(definition: BuildableDefinition): number {
  if (definition.placesDoor !== undefined) return DOOR_EDGE_NUMERIC_ID;
  return definition.category === 'wall' ? WALL_EDGE_NUMERIC_ID : 0;
}

export function getBuildableDefinition(id: string): BuildableDefinition {
  const def = BUILDABLE_REGISTRY.get(id);
  if (!def) throw new Error(`Unknown buildable definition: ${id}`);
  return def;
}
