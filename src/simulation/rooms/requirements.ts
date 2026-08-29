import type { RoomCatalogDefinition } from '../../content/room-catalog';

/**
 * Reading the two room-catalog requirements that describe an *area* rather
 * than its contents.
 *
 * `RoomRequirementDefinition` is a discriminated union with four members and
 * a room carries a list of them (`src/content/room-catalog.ts`). Three of the
 * four are about the rectangle a player drags -- `minimum-size` and the
 * `enclosed`/`outdoors` pair -- and the fourth, `object`, is about what stands
 * inside it.
 *
 * **That last clause used to read "which nothing places yet
 * (`docs/HUD_PROJECTIONS.md` gap 13)", and both halves of it have since
 * expired.** ADR 0028 phase 1 shipped placement: `ObjectPlacementService`
 * mints an order, `PlacedObjectRegistry` holds a row per standing object, and
 * `bed-wooden` and `toilet-brick` are buildables a player can order. The
 * citation went stale in the same movement -- gap 13's heading now reads
 * *"Object placement exists, and `minQuantity` is still unchecked"*, so a
 * reader who followed it landed on a document saying the opposite of the
 * sentence that sent them there. (The count was wrong too: the union's
 * `object` arm is one member, not two.)
 *
 * What survives, and is the only part this module ever depended on, is that
 * **`object` requirements are none of its business.** It reads the two
 * area-shaped kinds and nothing else; who checks the contents, and whether
 * `minQuantity` is checkable yet, are questions for
 * `RoomCapacityResolver` and `room-projection.ts`.
 *
 * **That paragraph is now half true, and issue #529 is what changed it.** The
 * clause about *checking* still holds exactly as written: nothing here counts
 * anything, and whether a room is short a bench remains `room-projection.ts`'s
 * answer and no other module's. What has gone is the claim that this module
 * never *reads* the `object` arm at all -- `objectRequirements` below reads it
 * and returns what the catalogue authored, evaluating none of it. Both halves
 * are marked rather than the sentence overwritten, because the reason it was
 * written is still the reason `objectRequirements` returns definitions and not
 * verdicts.
 *
 * The reading was added because the composition root needed the same list the
 * projection loops over, and the alternative was a third `requirements.find`
 * in `src/main.ts` -- the exact duplication the paragraph below says this
 * module exists to prevent. #529 measured what its absence cost a player: the
 * Rooms catalogue could state a room's minimum size and its enclosure rule
 * before the drag and could not state a single object the room would need, so
 * a player choosing between a canteen and a kitchen could not learn what
 * either would cost them.
 *
 * These live in their own module, and outside `RoomZoningService`, because
 * three layers ask the same question and none of them may re-derive the
 * answer: the zoning service refuses a rectangle below the authored minimum,
 * the enclosure evaluation reports against the authored `enclosed`/`outdoors`
 * requirement, and the composition root projects both figures into the Rooms
 * panel's catalogue so the player can read the rule before dragging. A copy
 * of `requirements.find(...)` in each would be three places to forget a fifth
 * requirement kind.
 *
 * **The list is authored data and this module never invents a default.** A
 * room with no `minimum-size` requirement has no minimum -- not `1x1`, which
 * would read as a decision -- and a room with neither `enclosed` nor
 * `outdoors` has no enclosure rule. Both are expressed as `undefined`/`'none'`
 * so a caller has to handle "the content does not say" explicitly.
 */

/** The authored floor on a room's area, or `undefined` when the definition states none. */
export interface RoomMinimumSize {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly minTiles: number;
}

/**
 * What a room definition says about being indoors.
 *
 * `'none'` is a real answer and not a fallback: it means the catalogue entry
 * carries neither requirement, which is a state no shipped room is in today
 * (17 of the 18 are `'enclosed'` and `room.yard` is `'outdoors'`) and which
 * a future room may be.
 */
export type RoomEnclosureRequirement = 'enclosed' | 'outdoors' | 'none';

export function minimumSizeRequirement(definition: RoomCatalogDefinition): RoomMinimumSize | undefined {
  for (const requirement of definition.requirements) {
    if (requirement.type !== 'minimum-size') continue;
    return {
      minWidth: requirement.minWidth,
      minHeight: requirement.minHeight,
      minTiles: requirement.minTiles,
    };
  }
  return undefined;
}

/**
 * The first of `enclosed`/`outdoors` the definition carries, in the list's own
 * order.
 *
 * A definition carrying both would be contradictory content rather than a
 * case to resolve here, and none does: `tests/unit/content-catalogs.test.ts`
 * reads the shipped catalogue and this function is a pure read of it. Taking
 * the first keeps the answer a function of the authored order instead of of
 * this loop's, which is the same rule `RoomZoningService.zone` follows when it
 * names the tile that refused it.
 */
export function enclosureRequirement(definition: RoomCatalogDefinition): RoomEnclosureRequirement {
  for (const requirement of definition.requirements) {
    if (requirement.type === 'enclosed') return 'enclosed';
    if (requirement.type === 'outdoors') return 'outdoors';
  }
  return 'none';
}

/** One authored `object` requirement: which object, and how many of it. */
export interface RoomObjectRequirement {
  readonly objectId: string;
  readonly minQuantity: number;
}

/**
 * Every `object` requirement the definition authors, in the authored order.
 *
 * **Authored order, not sorted**, for `enclosureRequirement`'s reason one
 * function up: the answer stays a function of the order content was written in
 * rather than of a comparison chosen here, and content that wants the bed named
 * before the toilet says so by writing it first. `docs/DETERMINISM.md`'s
 * objection is to an order nobody chose; this is one somebody did.
 *
 * **A list and not a map**, because the same object id may legitimately appear
 * twice -- nothing in `roomRequirementSchema` forbids it -- and a map keyed by
 * `objectId` would silently drop the second entry. No shipped room does that
 * (all 18 name distinct ids), which is exactly why a shape that could not
 * express it would go unnoticed.
 *
 * Returns the authored `minQuantity` untouched. This is the *requirement*, and
 * a caller wanting the shortfall against a real room has to ask the projection
 * (`RoomRequirementViewModel.satisfyingQuantity`) -- the two are different
 * statements about different things, and the empty array below is a room type
 * that needs no objects rather than a room that has them all.
 */
export function objectRequirements(definition: RoomCatalogDefinition): readonly RoomObjectRequirement[] {
  const requirements: RoomObjectRequirement[] = [];
  for (const requirement of definition.requirements) {
    if (requirement.type !== 'object') continue;
    requirements.push({ objectId: requirement.objectId, minQuantity: requirement.minQuantity });
  }
  return requirements;
}
