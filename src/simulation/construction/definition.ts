import { defaultItemRegistry } from '../../content/item-catalog';
import { defaultObjectRegistry } from '../../content/object-catalog';

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
   * buildable before phase 1 meant and what `door-wooden` still means -- see
   * `edgeNumericIdFor` below for why that one is unchanged.
   *
   * A **content id**, not a numeric id and not a message key: the footprint,
   * the capabilities and the label all come from the catalogue entry, so
   * nothing about an object is authored twice.
   * `validateBuildableObjectReferences` checks the reference at import time,
   * exactly as `validateBuildableItemReferences` checks the material one.
   */
  readonly placesObjectId?: string;
}

export const BUILDABLE_REGISTRY = new Map<string, BuildableDefinition>([
  ['wall-brick', {
    id: 'wall-brick',
    category: 'wall',
    name: 'Brick Wall',
    workRequired: 50,
    materialsRequired: [{ itemId: 'item.brick', quantity: 2 }],
  }],
  ['door-wooden', {
    id: 'door-wooden',
    category: 'object',
    name: 'Wooden Door',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
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
 * The edge-layer value a completed order for this buildable writes, or `0`
 * for a buildable that is not edge geometry at all.
 *
 * Only `'wall'` occupies a tile edge. A door is `'object'` here and is
 * deliberately *not* written as an edge: an edge is opaque to
 * `TopologyManager`, so recording a door as one would seal the room it is
 * supposed to open. Doors are modelled by `navigation/door.ts`'s
 * `DoorRegistry`, and connecting a completed door order to it is a separate
 * piece of work (see `docs/NAVIGATION.md`).
 *
 * `'object'` is therefore not a mistyped `'wall'`, and #261 asked directly
 * whether it was. `BuildableCategory` has three members and none of them
 * means "edge gate": `'wall'` means *opaque* edge geometry, so promoting the
 * door would build a solid wall where the player asked for a door -- worse
 * than today, not a fix. What is actually missing is a placement model for a
 * door, not a different category for one, and until that exists a completed
 * `door-wooden` order changes nothing in the simulation.
 *
 * **The placement model now exists and `door-wooden` still does nothing, which
 * is a correction to what ADR 0028 phase 1 predicted.** That phase claims it
 * "also fixes a shipped defect: `door-wooden` stops being a catalogue row that
 * consumes a plank and does nothing". It does not, and cannot: a placed object
 * is a row naming an id in `src/content/object-catalog.ts`, and that catalogue
 * declares no wooden door -- `object.loading-dock-door` is a three-tile
 * delivery door with a `'delivery-access'` capability, not this. A door's own
 * state lives in `DoorRegistry` (`src/simulation/navigation/door.ts`) and
 * connecting a completed order to it is navigation work with its own
 * consequences for `TopologyManager`. So `door-wooden` is left exactly as it
 * was found, with no `placesObjectId`, and the defect is still open.
 */
export function edgeNumericIdFor(definition: BuildableDefinition): number {
  return definition.category === 'wall' ? WALL_EDGE_NUMERIC_ID : 0;
}

export function getBuildableDefinition(id: string): BuildableDefinition {
  const def = BUILDABLE_REGISTRY.get(id);
  if (!def) throw new Error(`Unknown buildable definition: ${id}`);
  return def;
}
