import { describe, expect, it } from 'vitest';
import { MAX_ZONE_SIDE_TILES } from '../../src/rendering/build/area-picking';
import { MAX_ZONE_DIMENSION_TILES } from '../../src/simulation/rooms/zoning';
import { MAX_ROOM_SIDE_TILES, tintToCssColor } from '../../src/ui/hud/rooms-panel';

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

/**
 * The catalogue swatch's colour conversion (#1021), headless.
 *
 * `vitest.config.ts` runs with no DOM (`environment: 'node'`), so nothing that
 * touches an actual swatch element can be tested here -- that is
 * `tests/browser/ui-shell.spec.ts`'s job. What *can* be tested without a
 * browser is the one piece of arithmetic the swatch depends on: turning the
 * `0xRRGGBB` number `HudRoomViewModel.tint` carries into the `#rrggbb` string
 * CSS wants. Exported from `rooms-panel.ts` for exactly this reason, per
 * `docs/AGENT_WORKFLOW.md` §3's "use the lowest layer that proves the
 * behavior".
 */
describe('tintToCssColor', () => {
  it('renders the three real catalogue tints ui-harness.ts fixes for the browser suite', () => {
    // The same three numbers `ROOMS_MODEL` in `tests/browser/ui-harness.ts`
    // carries, so a change to either place that broke the pairing would fail
    // one of the two tests rather than neither.
    expect(tintToCssColor(0x4f7fd0)).toBe('#4f7fd0');
    expect(tintToCssColor(0xd0854f)).toBe('#d0854f');
    expect(tintToCssColor(0x76d04f)).toBe('#76d04f');
  });

  it('pads a channel that drops its leading zero rather than shortening the string', () => {
    // `(5).toString(16)` is `'5'`, not `'05'` -- a room whose tint carries a
    // channel below 0x10 would produce a 5-character string and every other
    // channel would read one place to the left of where it belongs. All three
    // channels below 0x10 here, so a fault in any position shows.
    expect(tintToCssColor(0x010203)).toBe('#010203');
    expect(tintToCssColor(0)).toBe('#000000');
  });

  it("masks a tint's own alpha byte instead of overflowing into a 7th hex digit", () => {
    // `zoningTint` never returns anything above 24 bits, but a bare
    // `toString(16)` on the same 32-bit input `0xffRRGGBB` some Phaser call
    // sites use would print 8 hex digits and CSS would read the first two as
    // the red channel instead. The one shipped fallback, `main.ts`'s
    // `zoningTint(...) ?? 0`, and this both stay inside 24 bits, so this pins
    // the mask rather than a behaviour any shipped input exercises today.
    expect(tintToCssColor(0xff123456)).toBe('#123456');
    expect(tintToCssColor(0xffffff)).toBe('#ffffff');
  });
});
