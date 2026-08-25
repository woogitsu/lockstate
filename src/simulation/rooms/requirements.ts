import type { RoomCatalogDefinition } from '../../content/room-catalog';

/**
 * Reading the two room-catalog requirements that describe an *area* rather
 * than its contents.
 *
 * `RoomRequirementDefinition` is a discriminated union with four members and
 * a room carries a list of them (`src/content/room-catalog.ts`). Two of the
 * four are about the rectangle a player drags -- `minimum-size` and the
 * `enclosed`/`outdoors` pair -- and the other two (`object`) are about what
 * stands inside it, which nothing places yet (`docs/HUD_PROJECTIONS.md` gap
 * 13).
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
