import { expect, test, type Page } from './network-changed-fixture';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import type { CameraScroll, HarnessChunkPosition } from './world-scene-harness-api';

/**
 * **Where issue #793's exact claim lives: `WorldScene.navigateToMinimapPoint`,
 * driven directly against a real camera.**
 *
 * The minimap's click used to be swallowed by a `pointer-events: auto` panel
 * with no handler behind it, and the owner's ruling is that it should navigate.
 * The app-level gate for that ruling is
 * `tests/browser/hud-minimap-navigates.spec.ts`: it presses the real surface in
 * the real HUD and is the only place that can show the click is no longer
 * swallowed. What it *cannot* do is check where the camera ended up precisely,
 * because the only camera readout available on the assembled page is
 * `playtest-harness.ts`'s `calibrate()` -- a bisection over integer canvas
 * pixels, which costs a dozen real clicks and answers in whole pixels. A float
 * identity cannot be expressed in whole pixels, so it was asserted there as
 * `toEqual` over two bisections and could only ever have meant "these agree to
 * within a pixel".
 *
 * Here the scene is constructed directly (`world-scene-harness.ts`, no HUD, no
 * app shell, no worker), so the mapping can be asserted the way it is actually
 * written:
 *
 * 1. **The centre of the surface is the camera's own first-paint centre**, bit
 *    for bit. Both sides of that equality are produced by production code and
 *    neither is computed by this file: the left-hand side is where
 *    `frameCameraOnFirstWorld` put the camera when the world first arrived, and
 *    the right-hand side is where a `navigateToMinimapPoint(0.5, 0.5)` puts it
 *    after the camera has been displaced away. They are two independent
 *    readings of `WorldRenderView.loadedBounds`'s midpoint, written in two
 *    different methods, and the test is that they agree exactly.
 * 2. **Each axis reads its own fraction, by the loaded extent of that axis.**
 *    Asserted on a deliberately non-square, non-origin world, which is what
 *    makes a transposed or a copy-pasted axis fail: a mapping that read `fy`
 *    for X, or the X extent for Y, agrees with the correct one at the centre
 *    and on any square world, and both of those were true of the fixture the
 *    app-level test used (the starter chunk, 32x32 at the origin).
 * 3. **A click with no world loaded moves nothing and says so**, which is the
 *    one input the mapping refuses.
 *
 * **The world is materialised from a real `SparseWorld`** rather than from a
 * rectangle typed here (`world-scene-harness.ts`'s `loadChunks`): the bounds
 * the mapping reads are then computed by the same `WorldRenderView.fromSnapshot`
 * a running session's are, and this file only ever chooses a chunk *layout*.
 */

const HARNESS_URL = '/tests/browser/world-scene-harness.html';

/**
 * The chunk size every session in this repository runs at
 * (`createNewSimulationRuntime` uses 32, ADR 0004), so the tile arithmetic
 * below is the arithmetic a player's world does.
 */
const CHUNK_TILES = 32;

/**
 * One chunk wide, two chunks tall, and **not** at the origin.
 *
 * Every property of that layout is load bearing, and each one is a mutation
 * this file has to be able to see:
 *
 * - *Not square* (32 tiles wide, 64 tall): a mapping that used one axis's
 *   extent for both would still centre correctly, and would still move in the
 *   right direction on both axes. Only unequal extents separate it.
 * - *Not at the origin* (x from 32, y from 64): a mapping that dropped
 *   `minTileX`/`minTileY` and read the fraction across `0..extent` agrees with
 *   the correct one for any world whose bounds start at zero -- which the
 *   starter chunk's do.
 * - *Asymmetric between the axes* (`minTileX` 32, `minTileY` 64): so a
 *   transposed pair of axes cannot coincide.
 */
const LOADED_CHUNKS: readonly HarnessChunkPosition[] = [
  { chunkX: 1, chunkY: 2 },
  { chunkX: 1, chunkY: 3 },
];
/** Tiles across the layout above, per axis -- one chunk, and two. */
const LOADED_TILES_X = CHUNK_TILES;
const LOADED_TILES_Y = 2 * CHUNK_TILES;

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => window.lockstateWorldSceneHarness !== undefined);
  await page.evaluate(() => window.lockstateWorldSceneHarness!.ready);
}

async function scroll(page: Page): Promise<CameraScroll> {
  return page.evaluate(() => window.lockstateWorldSceneHarness!.scroll());
}

async function loadWorld(page: Page): Promise<void> {
  await page.evaluate(
    ([size, chunks]) => window.lockstateWorldSceneHarness!.loadChunks(size, chunks),
    [CHUNK_TILES, LOADED_CHUNKS] as const,
  );
}

async function navigate(page: Page, fx: number, fy: number): Promise<{ readonly moved: boolean; readonly scroll: CameraScroll }> {
  return page.evaluate(
    ([x, y]) => {
      const harness = window.lockstateWorldSceneHarness!;
      const moved = harness.navigateToMinimapPoint(x, y);
      return { moved, scroll: harness.scroll() };
    },
    [fx, fy] as const,
  );
}

test.describe('the minimap mapping, against a real camera (#793)', () => {
  test("a point at the centre of the surface lands exactly where frameCameraOnFirstWorld framed the world", async ({ page }) => {
    await openHarness(page);
    await loadWorld(page);

    // Where the scene itself pointed the camera the first time a world
    // existed. `loadChunks` resolves only once `update()` has read the frame,
    // and `frameCameraOnFirstWorld` runs inside that same `update()`, so this
    // read cannot be taken before the framing.
    const framedOnArrival = await scroll(page);

    // Displaced with Phaser's own `setScroll`, deliberately not with a minimap
    // click: displacing with the mechanism under test would let a broken
    // mapping cancel its own error out. The offset is fractional so a camera
    // that quietly rounded its scroll would show up here rather than hide
    // inside the equality below.
    const displaced = { x: framedOnArrival.x + 777.5, y: framedOnArrival.y - 321.25 };
    await page.evaluate(
      ([x, y]) => {
        window.lockstateWorldSceneHarness!.displaceCamera(x, y);
      },
      [displaced.x, displaced.y] as const,
    );
    expect(await scroll(page), 'the camera did not actually move away from its arrival framing').toEqual(displaced);

    const centre = await navigate(page, 0.5, 0.5);

    expect(centre.moved, 'navigateToMinimapPoint reported no world loaded, with a world loaded').toBe(true);
    expect(
      centre.scroll,
      'a centre point must land on the same world position frameCameraOnFirstWorld centred on -- both are `WorldRenderView.loadedBounds`\'s own midpoint, computed in two different methods',
    ).toEqual(framedOnArrival);
  });

  test('each axis reads its own fraction across its own loaded extent, so a transposed or copied axis fails', async ({ page }) => {
    await openHarness(page);
    await loadWorld(page);

    const centre = (await navigate(page, 0.5, 0.5)).scroll;
    const alongX = (await navigate(page, 0.9, 0.5)).scroll;
    const alongY = (await navigate(page, 0.5, 0.9)).scroll;

    // Moving `fx` alone must move the camera on X alone, and moving `fy` alone
    // on Y alone. This pair is what a transposition fails: a mapping that read
    // `fy` for the X tile would answer these two the other way round while
    // still agreeing at the centre.
    expect(alongX.y, 'changing fx alone moved the camera on Y -- the axes are crossed').toBe(centre.y);
    expect(alongY.x, 'changing fy alone moved the camera on X -- the axes are crossed').toBe(centre.x);

    /*
     * How far. `0.4` of the loaded extent in tiles, at this scene's tile size
     * -- the extent coming from the chunk layout this file chose above (one
     * chunk wide, two tall) and not from anything the mapping computed.
     *
     * The two axes' expectations differ by exactly the factor the layout does,
     * which is what a mapping using one extent for both axes fails, and both
     * are the *inclusive* extent: dropping the `+ 1` in
     * `maxTileX - minTileX + 1` gives 31 and 63 tiles instead of 32 and 64,
     * which misses these by 20.48 and 40.96 world units.
     */
    const expectedX = 0.4 * LOADED_TILES_X * TILE_SIZE_PX;
    const expectedY = 0.4 * LOADED_TILES_Y * TILE_SIZE_PX;
    expect(alongX.x - centre.x, 'fx 0.5 -> 0.9 did not move the camera 0.4 of the loaded width east').toBeCloseTo(expectedX, 6);
    expect(alongY.y - centre.y, 'fy 0.5 -> 0.9 did not move the camera 0.4 of the loaded height south').toBeCloseTo(expectedY, 6);

    // Signs, stated separately, because a `toBeCloseTo` on a difference is easy
    // to read as symmetric and this is the half a flipped axis breaks: a larger
    // fraction is further along the axis, never back up it.
    expect(alongX.x, 'a larger fx moved the camera west').toBeGreaterThan(centre.x);
    expect(alongY.y, 'a larger fy moved the camera north').toBeGreaterThan(centre.y);
  });

  test('a point outside the surface is clamped to its edge rather than mapped past the world', async ({ page }) => {
    await openHarness(page);
    await loadWorld(page);

    const corner = (await navigate(page, 0, 1)).scroll;
    const beyond = (await navigate(page, -2.5, 4)).scroll;

    expect(beyond, 'a point off the surface was mapped past the loaded world instead of clamped to its edge').toEqual(corner);
  });

  test('a point clicked before any world exists reports so and leaves the camera alone', async ({ page }) => {
    await openHarness(page);
    // No `loadChunks`: the feed is `EMPTY_RENDER_FRAME`, whose `loadedBounds`
    // is `undefined`. That is the assembled page before a prison exists, and
    // the one input this mapping cannot answer.
    const before = await scroll(page);

    const attempt = await navigate(page, 0.5, 0.5);

    expect(attempt.moved, 'navigateToMinimapPoint claimed to have navigated with no world loaded').toBe(false);
    expect(attempt.scroll, 'the camera moved on a click that had nowhere to go').toEqual(before);
  });
});
