import { expect, test, type Page } from './network-changed-fixture';
import type { HarnessChunkPosition, HarnessHomeIndicator } from './world-scene-harness-api';

/**
 * **The home marker, against a real Phaser camera (issue #794).**
 *
 * `tests/unit/camera-home-indicator.test.ts` pins `offscreenHomeIndicator`'s
 * arithmetic headlessly, against absolute numbers worked out by hand. What it
 * cannot reach is the half that lives in `WorldScene`: that the rectangle
 * handed to that function is the loaded world in world units, and that the
 * marker is recomputed every frame against the camera the frame was drawn
 * with. Both of those are only true of a running scene, and `docs/CAMERA.md`
 * says why that distinction matters here -- the pure camera module has already
 * been internally consistent and wrong about the engine once (#115).
 *
 * The world is materialised from a real `SparseWorld` through the harness's
 * `loadChunks`, so the bounds are computed by the same
 * `WorldRenderView.fromSnapshot` a session's are; this file chooses only a
 * chunk layout. The camera is displaced with Phaser's own `setScroll`, never
 * with anything under test.
 *
 * **Directions are asserted by sign and by exact bearing, not by re-deriving
 * the position.** Recomputing where the marker should be would mean writing
 * `offscreenHomeIndicator` a second time in this file, which would agree with
 * a scene that fed it the wrong rectangle. A camera displaced due east of the
 * prison must see a marker pointing due west, on the left-hand edge, at the
 * vertical middle: three facts a wrong rectangle cannot produce, and none of
 * them computed from the rectangle.
 */

const HARNESS_URL = '/tests/browser/world-scene-harness.html';

/** The chunk size every session in this repository runs at (ADR 0004). */
const CHUNK_TILES = 32;

/**
 * Non-square and away from the origin, for the same reason
 * `world-scene-minimap.spec.ts` chooses one: a rectangle taken as `0..extent`,
 * or with its axes transposed, agrees with the correct one on the starter
 * chunk and disagrees here.
 */
const LOADED_CHUNKS: readonly HarnessChunkPosition[] = [
  { chunkX: 1, chunkY: 2 },
  { chunkX: 1, chunkY: 3 },
];

/** Far enough that no zoom in `ZOOM_BOUNDS` could still show the world. */
const FAR_WORLD_UNITS = 200_000;

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

/**
 * Moves the camera and waits until the scene has drawn a frame with it.
 *
 * The wait is on `update()` having run, not on a fixed number of animation
 * frames: the mark is recomputed inside `update()`, and a read taken between
 * the `setScroll` and the next tick answers for the previous frame. The
 * harness's `framesRead()` counter is that precondition, read **inside the
 * same `evaluate` that writes the scroll** so that no frame can slip between
 * the write and the reading of the baseline.
 *
 * **It used to poll the mark's presence instead, and that is issue #1285.**
 * Presence is the wrong signal for exactly the assertion this file exists to
 * make: a camera moving from one off-screen bearing to another leaves the
 * marker present the whole way, so the poll was satisfied by the frame drawn
 * *before* the move and the read that followed returned the previous bearing.
 * It passed whenever a frame happened to land inside two CDP round trips and
 * failed when one did not -- measured at 18 stale reads in 40 attempts on an
 * idle machine, and once on CI, where the mark read after a displacement due
 * west was exactly the `PI/2` the previous displacement due north had left
 * behind.
 *
 * `expectMark` is now asserted rather than waited on, which is strictly the
 * stronger of the two: a marker that never appears used to end the test in a
 * poll timeout with nothing to read, and now names what was expected.
 */
async function displaceAndSettle(page: Page, x: number, y: number, expectMark: boolean): Promise<HarnessHomeIndicator | undefined> {
  const framesBefore = await page.evaluate(
    ([sx, sy]) => {
      window.lockstateWorldSceneHarness!.displaceCamera(sx, sy);
      return window.lockstateWorldSceneHarness!.framesRead();
    },
    [x, y] as const,
  );
  await page.waitForFunction(
    (before) => window.lockstateWorldSceneHarness!.framesRead() > before,
    framesBefore,
  );
  const mark = await page.evaluate(() => window.lockstateWorldSceneHarness!.homeIndicator());
  expect(
    mark !== undefined,
    expectMark
      ? 'no marker was drawn on the frame that followed the camera move'
      : 'a marker was drawn on the frame that followed the camera move',
  ).toBe(expectMark);
  return mark;
}

async function viewport(page: Page): Promise<{ readonly width: number; readonly height: number }> {
  return page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
}

const degrees = (radians: number): number => (radians * 180) / Math.PI;

test.describe('the home marker, against a real camera (#794)', () => {
  test('draws nothing while the prison is the thing the camera is looking at', async ({ page }) => {
    await openHarness(page);
    await loadWorld(page);

    // `loadChunks` resolves only after the `update()` that read the frame, and
    // `frameCameraOnFirstWorld` ran inside that same `update()` -- so the
    // camera is on the world and the marker must have nothing to say.
    expect(
      await page.evaluate(() => window.lockstateWorldSceneHarness!.homeIndicator()),
      'a marker was drawn while the prison was on screen',
    ).toBeUndefined();
  });

  test('points due west from the left-hand edge when the camera is east of the prison', async ({ page }) => {
    await openHarness(page);
    await loadWorld(page);
    const { width, height } = await viewport(page);

    const framed = await page.evaluate(() => window.lockstateWorldSceneHarness!.scroll());
    const mark = await displaceAndSettle(page, framed.x + FAR_WORLD_UNITS, framed.y, true);

    expect(mark, 'the prison left the viewport and no marker was drawn -- this is issue #794 unfixed').toBeDefined();
    // Due west is the one bearing a rectangle of the wrong size or the wrong
    // origin cannot fake while the displacement is on X alone: any error in
    // the Y extent tilts it.
    expect(Math.abs(degrees(mark?.angleRadians ?? Number.NaN)), 'the marker did not point due west').toBeCloseTo(180, 6);
    expect(mark?.y, 'a due-west marker must sit on the viewport\'s vertical middle').toBeCloseTo(height / 2, 6);
    // On the left-hand edge, inset enough to be drawn whole, and nowhere near
    // the middle of the screen.
    expect(mark?.x ?? Number.NaN, 'the marker was drawn off the left of the canvas').toBeGreaterThan(0);
    expect(mark?.x ?? Number.NaN, 'the marker was not on the left-hand edge').toBeLessThan(width / 4);
  });

  test('points back south when the camera is north of the prison, and follows the camera between frames', async ({ page }) => {
    await openHarness(page);
    await loadWorld(page);
    const { width } = await viewport(page);

    const framed = await page.evaluate(() => window.lockstateWorldSceneHarness!.scroll());
    const north = await displaceAndSettle(page, framed.x, framed.y - FAR_WORLD_UNITS, true);

    // Screen Y grows downwards, so a prison below the viewport is a positive
    // sine. Asserted as a sign rather than a bearing because this is the half
    // an inverted axis breaks.
    expect(Math.sin(north?.angleRadians ?? Number.NaN), 'the marker pointed north, away from a prison to the south').toBeGreaterThan(0.99);
    expect(north?.x, 'a due-south marker must sit on the viewport\'s horizontal middle').toBeCloseTo(width / 2, 6);

    // The same session, moved again: the mark is recomputed per frame rather
    // than latched at the moment the world left the view.
    const west = await displaceAndSettle(page, framed.x - FAR_WORLD_UNITS, framed.y, true);
    expect(Math.cos(west?.angleRadians ?? Number.NaN), 'the marker did not turn round when the camera crossed to the other side').toBeGreaterThan(0.99);

    // And back onto the prison: the marker must stop, not persist.
    const home = await displaceAndSettle(page, framed.x, framed.y, false);
    expect(home, 'the marker kept being drawn after the camera returned to the prison').toBeUndefined();
  });

  test('draws nothing before any world exists', async ({ page }) => {
    await openHarness(page);
    // No `loadChunks`: `loadedBounds` is `undefined`, which is the assembled
    // page before a prison exists. There is nothing to point at, and an empty
    // screen with no arrow on it is the honest answer.
    const mark = await displaceAndSettle(page, 4_000, 4_000, false);
    expect(mark, 'a marker was drawn pointing at a prison that does not exist').toBeUndefined();
  });
});
