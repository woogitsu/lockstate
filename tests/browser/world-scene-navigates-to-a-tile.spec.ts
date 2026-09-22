import { expect, test, type Page } from './network-changed-fixture';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import type { CameraScroll, HarnessChunkPosition } from './world-scene-harness-api';

/**
 * **Where ADR 0122 option D step 4's claim lives: `WorldScene.navigateToTile`,
 * driven directly against a real camera.**
 *
 * The owner ruled on 2026-09-22 that a message row is itself the press and
 * leads to the place it is about (the option labelled *"Naciskany wiersz, bez
 * czasownika"*). `src/ui/hud/hud.ts` makes the row a `<button>`, `src/main.ts`
 * routes the `show-alert-place` intent, and this file is the gate over the one
 * thing at the end of that chain that is arithmetic rather than plumbing:
 * **which world position a tile coordinate centres the camera on.**
 *
 * ## Why this is a separate file from `world-scene-minimap.spec.ts`
 *
 * Its subject is a different mapping with a different argument space, and the
 * two disagree by half a tile in a way no app-level readout can see. ADR 0122
 * option D step 4 describes the call it expects as *"the same
 * `centerOn(tileToWorld(x), tileToWorld(y))` call `frameCameraOnFirstWorld`
 * already makes"*, and that is wrong twice: `frameCameraOnFirstWorld` does not
 * call `tileToWorld` at all (it multiplies `(minTile + maxTile + 1) / 2` by
 * `TILE_SIZE_PX`, whose `+ 1` is what makes the product a rectangle *centre*),
 * and `tileToWorld` is *"World coordinate of a tile's top-left corner"* by its
 * own docstring -- so the literal call would centre the screen on a corner and
 * leave the tile a quarter-tile down and to the right. The scene uses
 * `tileCentreToWorld`. **32 world units at `TILE_SIZE_PX` 64 is the whole
 * difference**, and the third test below is the one that can see it: the
 * `calibrate()` bisection the assembled page offers answers in whole canvas
 * pixels, and a spec that pressed the row in the HUD could not express it.
 *
 * ## The four claims, and what each one is a mutation of
 *
 * 1. **A whole tile centres on the tile, not on its corner.** Asserted
 *    against `navigateToMinimapPoint` aimed at the *same* tile through the
 *    fraction that maps to it exactly, so both sides are production code and
 *    the assertion is the 32-unit offset between them rather than an absolute
 *    this file computed. Replacing `tileCentreToWorld` with `tileToWorld` --
 *    the ADR's literal shape -- fails here and nowhere else.
 * 2. **One tile of argument is one tile of camera, per axis, unmixed.** Two
 *    navigations differing by `+1` tile in X and `+2` in Y, so a transposed or
 *    copied axis cannot coincide and a scale error shows as a multiple.
 * 3. **A tile outside the loaded rectangle is not clamped into it.**
 *    `build.out-of-bounds` is a refusal *about* a tile being off the map and
 *    is one of the six domains that publish a tile, so clamping would take
 *    the player somewhere the message is not about. Ten tiles left of
 *    `minTileX` must be ten tiles of camera left of `minTileX`.
 * 4. **With no world ever published it moves nothing and says so**, which is
 *    the one input the method refuses, and it refuses it for a mechanical
 *    reason as well as an honest one: `frameCameraOnFirstWorld` fires inside
 *    the `update()` that first sees a world and would overwrite anything
 *    written before it.
 *
 * The world is materialised from a real `SparseWorld` through the harness's
 * `loadChunks`, exactly as `world-scene-minimap.spec.ts` does and for the same
 * reason: the bounds are then computed by the production
 * `WorldRenderView.fromSnapshot`, and this file only ever chooses a chunk
 * layout.
 */

const HARNESS_URL = '/tests/browser/world-scene-harness.html';

/** The chunk size every session in this repository runs at (ADR 0004). */
const CHUNK_TILES = 32;

/**
 * One chunk wide, two tall, not at the origin and asymmetric between the axes
 * -- `world-scene-minimap.spec.ts`'s fixture and its reasons, unchanged: a
 * square world at the origin lets a transposed or origin-blind mapping agree
 * with the correct one.
 */
const LOADED_CHUNKS: readonly HarnessChunkPosition[] = [
  { chunkX: 1, chunkY: 2 },
  { chunkX: 1, chunkY: 3 },
];

/** The rectangle the layout above materialises, in tiles. */
const MIN_TILE_X = 1 * CHUNK_TILES;
const MIN_TILE_Y = 2 * CHUNK_TILES;
const EXTENT_TILES_X = CHUNK_TILES;
const EXTENT_TILES_Y = 2 * CHUNK_TILES;

/** A tile well inside the rectangle, on neither edge and on no diagonal. */
const INSIDE_X = MIN_TILE_X + 8;
const INSIDE_Y = MIN_TILE_Y + 16;

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => window.lockstateWorldSceneHarness !== undefined);
  await page.evaluate(() => window.lockstateWorldSceneHarness!.ready);
}

async function loadWorld(page: Page): Promise<void> {
  await page.evaluate(
    ([size, chunks]) => window.lockstateWorldSceneHarness!.loadChunks(size, chunks),
    [CHUNK_TILES, LOADED_CHUNKS] as const,
  );
}

async function scroll(page: Page): Promise<CameraScroll> {
  return page.evaluate(() => window.lockstateWorldSceneHarness!.scroll());
}

async function navigateToTile(
  page: Page,
  tileX: number,
  tileY: number,
): Promise<{ readonly moved: boolean; readonly scroll: CameraScroll }> {
  return page.evaluate(
    ([x, y]) => {
      const harness = window.lockstateWorldSceneHarness!;
      const moved = harness.navigateToTile(x, y);
      return { moved, scroll: harness.scroll() };
    },
    [tileX, tileY] as const,
  );
}

async function navigateToMinimapPoint(
  page: Page,
  fx: number,
  fy: number,
): Promise<{ readonly moved: boolean; readonly scroll: CameraScroll }> {
  return page.evaluate(
    ([x, y]) => {
      const harness = window.lockstateWorldSceneHarness!;
      const moved = harness.navigateToMinimapPoint(x, y);
      return { moved, scroll: harness.scroll() };
    },
    [fx, fy] as const,
  );
}

test.describe('a tile-targeted camera move (ADR 0122 option D step 4)', () => {
  test('a whole tile centres on the tile and not on its top-left corner, which is the half-tile ADR 0122 step 4 names wrong', async ({
    page,
  }) => {
    await openHarness(page);
    await loadWorld(page);

    // The same tile, reached through the *other* entry point. The minimap's
    // mapping is a linear reparameterisation of `[0,1]` onto the loaded
    // rectangle in tile space, so this fraction resolves to exactly
    // `INSIDE_X` / `INSIDE_Y` -- and then centres on `tileToWorld` of it,
    // which is that tile's corner.
    const corner = await navigateToMinimapPoint(
      page,
      (INSIDE_X - MIN_TILE_X) / EXTENT_TILES_X,
      (INSIDE_Y - MIN_TILE_Y) / EXTENT_TILES_Y,
    );
    expect(corner.moved, 'navigateToMinimapPoint reported no world loaded, with a world loaded').toBe(true);

    const centre = await navigateToTile(page, INSIDE_X, INSIDE_Y);
    expect(centre.moved, 'navigateToTile reported no world loaded, with a world loaded').toBe(true);

    // Neither side is computed here: both are production conversions of the
    // same tile, and the claim is the offset between them.
    expect(
      { x: centre.scroll.x - corner.scroll.x, y: centre.scroll.y - corner.scroll.y },
      'navigateToTile must centre on the tile, which is half a tile past the corner navigateToMinimapPoint centres on -- ' +
        'an exact 0 here is the `centerOn(tileToWorld(x), tileToWorld(y))` shape ADR 0122 option D step 4 asks for, and it is off by half a tile',
    ).toEqual({ x: TILE_SIZE_PX / 2, y: TILE_SIZE_PX / 2 });
  });

  test('one tile of argument is one tile of camera, per axis, with the axes unmixed', async ({ page }) => {
    await openHarness(page);
    await loadWorld(page);

    const first = await navigateToTile(page, INSIDE_X, INSIDE_Y);
    // `+1` and `+2`, deliberately different: equal offsets agree under a
    // transposed pair of axes and under a single axis copied to both.
    const second = await navigateToTile(page, INSIDE_X + 1, INSIDE_Y + 2);

    expect(first.moved && second.moved, 'a navigation reported no world loaded, with a world loaded').toBe(true);
    expect(
      { x: second.scroll.x - first.scroll.x, y: second.scroll.y - first.scroll.y },
      'a tile of argument is a tile of camera on its own axis',
    ).toEqual({ x: TILE_SIZE_PX, y: 2 * TILE_SIZE_PX });
  });

  test('a tile outside the loaded rectangle is not clamped into it', async ({ page }) => {
    await openHarness(page);
    await loadWorld(page);

    const edge = await navigateToTile(page, MIN_TILE_X, MIN_TILE_Y);
    // Ten tiles off the map in both axes -- the shape of a `build.out-of-bounds`
    // refusal, which is one of the six domains that publish a tile.
    const offMap = await navigateToTile(page, MIN_TILE_X - 10, MIN_TILE_Y - 10);

    expect(offMap.moved, 'navigateToTile refused a tile off the map, which is the case it exists for').toBe(true);
    expect(
      { x: edge.scroll.x - offMap.scroll.x, y: edge.scroll.y - offMap.scroll.y },
      'a tile off the map was clamped to the loaded rectangle, which would take the player somewhere the message is not about',
    ).toEqual({ x: 10 * TILE_SIZE_PX, y: 10 * TILE_SIZE_PX });
  });

  test('with no world ever published it moves nothing and reports false', async ({ page }) => {
    await openHarness(page);

    const before = await scroll(page);
    const attempt = await navigateToTile(page, INSIDE_X, INSIDE_Y);

    expect(attempt.moved, 'navigateToTile claimed to have navigated with no world loaded').toBe(false);
    expect(attempt.scroll, 'the camera moved on a navigation that reported it had not').toEqual(before);
  });
});
