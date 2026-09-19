import { describe, expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { BUILDABLE_REGISTRY, type BuildableDefinition } from '../../src/simulation/construction/definition';

/**
 * What an object costs to build is **derived from its footprint**, and this is
 * the gate that keeps it derived.
 *
 * [ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * phase 4 gives seventeen objects a buildable row at once, and ADR 0017
 * decision 5 reserves every price and balance value to #29 -- so the rows
 * cannot each carry a chosen number, and they cannot each carry
 * `door-wooden`'s 30 either, or a three-tile dining table would cost exactly
 * what a chair costs. The rule `BUILDABLE_REGISTRY` states at its phase 4
 * block is therefore:
 *
 *     materialsRequired[0].quantity = footprint.width
 *     workRequired                  = 30 * footprint.width
 *
 * One unit of material and 30 work **per place the object provides**, where
 * "places" is `footprint.width` -- the same field ADR 0028 decision 2 already
 * derives `residentCapacity` and the per-capability concurrent-use ceiling
 * from. So the number a player pays and the number a room gets back come off
 * one authored quantity, and neither is authored per row.
 *
 * ## Why this is a gate and not a comment
 *
 * Because a rule stated only in prose is a rule the eighteenth row breaks.
 * Every figure in the block above is arithmetic a reviewer can check by hand
 * and a future author can silently diverge from; this recomputes it. It is
 * also the check that would have caught the rule being *retrofitted*: the two
 * rows that shipped before this phase, `bed-wooden` and `toilet-brick`, are
 * asserted by the same loop as the seventeen new ones and are not exempted.
 *
 * Stated honestly, because the assertion cannot say it: both shipped rows are
 * width 1, so they pin the rule's **constant** and say nothing about its
 * **slope**. The slope is chosen from decision 2's use of the same field, and
 * it is the weaker half of the derivation. What this file proves is that one
 * rule covers every row, not that the rule is the only defensible one.
 */

/** Work units per place, taken from `door-wooden`/`bed-wooden`/`toilet-brick`'s shipped 30 at width 1. */
const WORK_PER_PLACE = 30;

const objectBuildables: readonly BuildableDefinition[] = [...BUILDABLE_REGISTRY.keys()]
  // Sorted rather than taken in `Map` insertion order, so a failure names rows
  // in a stable order rather than in module-evaluation order
  // (`docs/DETERMINISM.md`).
  .sort()
  .map((id) => BUILDABLE_REGISTRY.get(id)!)
  .filter((definition) => definition.placesObjectId !== undefined);

describe('an object buildable costs what its footprint says it costs', () => {
  it('scans every object buildable there is, so this cannot pass vacuously', () => {
    // The failure this guards is the filter above going empty -- a rename of
    // `placesObjectId` would make every assertion below iterate nothing and
    // report success. Both halves of the registry are checked, so a row losing
    // its `placesObjectId` shows up as a count rather than as silence.
    // Exact rather than `toBeGreaterThan`, and it moves once per phase 4
    // group -- which is the point: a group of rows landing without this number
    // moving would mean the rows are not in the registry. Phase 4 adds
    // seventeen rows in four groups, so this ends at 19 object buildables of
    // 21 rows; `door-wooden` and `wall-brick` are the two that place no object.
    expect(objectBuildables.length).toBe(19);
    expect(BUILDABLE_REGISTRY.size).toBe(21);
    // Every id the filter kept really does name a declared object.
    // `validateBuildableObjectReferences` throws at import for a broken
    // reference, so this is the assertion that the throw is doing its job
    // rather than a second copy of it.
    for (const definition of objectBuildables) {
      expect(defaultObjectRegistry.getById(definition.placesObjectId!), definition.id).toBeDefined();
    }
  });

  it('charges one unit of material and 30 work per place the object provides', () => {
    const table = objectBuildables.map((definition) => {
      const object = defaultObjectRegistry.getById(definition.placesObjectId!)!;
      return {
        id: definition.id,
        width: object.footprint.width,
        quantity: definition.materialsRequired[0]?.quantity,
        workRequired: definition.workRequired,
      };
    });

    // Compared as one object rather than in a loop of expectations, so a
    // failure prints every row that is wrong instead of stopping at the first.
    expect(
      table.filter((row) => row.quantity !== row.width || row.workRequired !== WORK_PER_PLACE * row.width),
      'these rows are off the rule `BUILDABLE_REGISTRY`s phase 4 block states',
    ).toEqual([]);
  });

  it('requires exactly one material, and one the prison can actually buy', () => {
    /*
     * Two separate limits, both real, and neither of them a taste.
     *
     * **One requirement**: `purchasableMaterialFor` in `src/main.ts` offers a
     * stepper for the *first* priced requirement only and states that a
     * two-material buildable would get a control for one of them and no way to
     * buy the other. So a second requirement is a row a player cannot finish.
     *
     * **Priced**: `validateBuildableItemReferences` checks only that a
     * requirement names a *declared* item, never that anyone sells it, and
     * `src/content/procurement-catalog.ts` says so at its own declaration. An
     * unpriced material yields no buy control at all and the order waits in
     * `materials-pending` for ever -- indistinguishable from #89, the defect
     * the supply side was built to fix.
     */
    for (const definition of objectBuildables) {
      expect(definition.materialsRequired.length, `${definition.id} must name exactly one material`).toBe(1);
      const requirement = definition.materialsRequired[0]!;
      expect(procurableMaterial(requirement.itemId), `${definition.id} requires ${requirement.itemId}, which nothing sells`).toBeDefined();
    }
  });

  it('leaves every object requirement in the room catalogue satisfiable', () => {
    /*
     * **This is ADR 0028 phase 4's acceptance criterion, computed.**
     *
     * That phase ships "buildables for the remaining object ids the room
     * catalogue already requires", and its whole value is that a player can
     * finish a room. So the assertion is stated as the property and not as a
     * count: for every `object` requirement of every room definition, some
     * buildable names that object id through `placesObjectId`. Derived from the
     * two catalogues, so a room type that gains an object requirement fails
     * here until something can place it -- which is the gate a nineteenth
     * object would want.
     *
     * `object.sink` is deliberately not covered, and cannot be: no room
     * requires it, so it is not in the set this iterates. That is the ADR's own
     * scoping ("the remaining object ids the room catalogue already requires")
     * and the reason its `AWAITING_CONSUMER` entry survives phase 4.
     */
    const placeable = new Set(objectBuildables.map((definition) => definition.placesObjectId!));
    const required = new Set(
      defaultRoomContentRegistry
        .all()
        .flatMap((room) => room.requirements)
        .flatMap((requirement) => (requirement.type === 'object' ? [requirement.objectId] : [])),
    );

    // Sorted so a failure lists the gaps in a stable order rather than in
    // catalogue-walk order.
    expect(
      [...required].filter((objectId) => !placeable.has(objectId)).sort(),
      'a room requires an object no buildable places, so that room type cannot be finished',
    ).toEqual([]);

    // Not vacuous: nineteen distinct object ids are required across the
    // catalogue, and `object.sink` is the twentieth and only one that is not.
    expect(required.size).toBe(19);
    expect([...placeable].filter((objectId) => !required.has(objectId))).toEqual([]);

    // And the room-level statement the pull request reports: 17 of the 18 room
    // definitions carry `object` requirements, and all 17 are now satisfiable.
    // `room.yard` is the one that carries none, which is what makes it the only
    // genuinely unbounded room (#326).
    const withObjects = defaultRoomContentRegistry
      .all()
      .filter((room) => room.requirements.some((requirement) => requirement.type === 'object'));
    expect(withObjects.length).toBe(17);
    expect(defaultRoomContentRegistry.all().length).toBe(18);
    for (const room of withObjects) {
      for (const requirement of room.requirements) {
        if (requirement.type !== 'object') continue;
        expect(placeable.has(requirement.objectId), `${room.id} requires ${requirement.objectId}`).toBe(true);
      }
    }
  });

  it('places no object that cannot stand in the smallest room that requires it', () => {
    /*
     * The check that makes the footprints safe to leave alone.
     *
     * `DEFAULT_PLACEMENT_ORIENTATION` in
     * `src/simulation/objects/object-placement-service.ts` is `0` for every
     * placement, and the rotate control ADR 0028 decision 5 describes does not
     * exist -- so an object that only fitted its room *rotated* would be a room
     * type no player could finish, and the failure would look like the object
     * tool not working rather than like a content error.
     *
     * Two questions, both answered from the room's own authored minimum:
     *
     *   1. the unrotated footprint fits inside `minWidth` x `minHeight`;
     *   2. `minQuantity` copies of every required object fit inside `minTiles`.
     *
     * The second is deliberately an area bound and not a packing proof -- it
     * cannot show a layout exists, only that one is not ruled out by area. A
     * real packing check would need a fill rule, which is the thing decision 5
     * declines to invent. It is still worth asserting: it is what would fail if
     * a room's minimum were shrunk or an object's footprint grown.
     */
    for (const room of defaultRoomContentRegistry.all()) {
      const minimum = room.requirements.find((requirement) => requirement.type === 'minimum-size');
      if (minimum === undefined || minimum.type !== 'minimum-size') continue;
      let occupied = 0;
      for (const requirement of room.requirements) {
        if (requirement.type !== 'object') continue;
        const object = defaultObjectRegistry.getById(requirement.objectId);
        if (object === undefined) continue;
        expect(
          { room: room.id, object: object.id, width: object.footprint.width, height: object.footprint.height },
          `${object.id} does not fit ${room.id}'s authored minimum unrotated, and nothing can rotate it`,
        ).toEqual({
          room: room.id,
          object: object.id,
          width: Math.min(object.footprint.width, minimum.minWidth),
          height: Math.min(object.footprint.height, minimum.minHeight),
        });
        occupied += requirement.minQuantity * object.footprint.width * object.footprint.height;
      }
      expect(occupied, `${room.id}'s required objects need more tiles than its authored minimum has`).toBeLessThanOrEqual(minimum.minTiles);
    }
  });
});
