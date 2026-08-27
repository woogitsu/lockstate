import { describe, expect, it } from 'vitest';
import { MAX_ZONE_SIDE_TILES } from '../../src/rendering/build/area-picking';
import { MAX_ZONE_DIMENSION_TILES } from '../../src/simulation/rooms/zoning';
import { MAX_ROOM_SIDE_TILES } from '../../src/ui/hud/rooms-panel';

/**
 * One number, declared in three trees, held together here (#411).
 *
 * `AGENTS.md` boundary 1 forbids `src/ui/hud/**` importing `src/simulation/**`
 * at all -- `tests/unit/ui-hud-messages.test.ts` enforces it -- and the
 * renderer is a third tree again. So the largest side a room may cover is
 * written out once per tree, and three declarations of one number drift. A
 * *test* is allowed to import all three, which is what makes this the place
 * they are pinned, exactly as `HUD_BUILD_EDGES` and `BUILD_EDGES` are pinned in
 * `tests/unit/ui-hud-build-panel.test.ts`.
 *
 * What each one is for:
 *
 *   - `MAX_ZONE_DIMENSION_TILES` is the rule. `RoomZoningService.zone` refuses
 *     `invalid-area` above it, and the command schema bounds the wire on it.
 *   - `MAX_ZONE_SIDE_TILES` caps a *drag*, so a pointer cannot express a
 *     rectangle the simulation will refuse.
 *   - `MAX_ROOM_SIDE_TILES` caps the Rooms panel's *typed* width and height,
 *     for the same reason and so that the two producers of a rectangle reach
 *     exactly the same set of rectangles. A keyboard route that could name
 *     something a drag could not would be a second route rather than a second
 *     way to walk the first.
 *
 * If any one of the three moves, this fails and names the two that did not
 * follow -- rather than a player discovering it as a refusal that only the
 * keyboard can earn.
 */
describe('the largest room a single command may zone', () => {
  it('is the same number in the simulation, the renderer and the HUD', () => {
    expect(MAX_ROOM_SIDE_TILES, 'the HUD may not import the simulation, so its copy has drifted').toBe(
      MAX_ZONE_DIMENSION_TILES,
    );
    expect(MAX_ZONE_SIDE_TILES, "the renderer's drag cap has drifted from the rule it exists to respect").toBe(
      MAX_ZONE_DIMENSION_TILES,
    );
  });

  /**
   * The vacuity guard, and it is not decoration: three constants that had all
   * become `0`, or `NaN`, would satisfy the equalities above and describe a
   * panel whose width field could express nothing at all.
   */
  it('is a side long enough to hold the largest authored room', () => {
    expect(Number.isSafeInteger(MAX_ROOM_SIDE_TILES)).toBe(true);
    // The room catalogue's own ceiling on an authored `minWidth`/`minHeight` is
    // 64, so a bound below that would make a room type undesignatable.
    expect(MAX_ROOM_SIDE_TILES).toBeGreaterThanOrEqual(64);
  });
});
