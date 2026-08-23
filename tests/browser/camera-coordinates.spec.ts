import { expect, test } from '@playwright/test';
import './camera-harness-api'; // pulls in the `Window.lockstateCameraHarness` global augmentation

/**
 * The external check on `src/rendering/camera/coordinates.ts` (issue #115).
 *
 * `tests/unit/camera-coordinates.test.ts` pins the transforms to absolute
 * coordinates worked out from Phaser's documented model. It cannot check that
 * the model is the one the installed Phaser actually implements, because
 * `docs/TESTING.md` keeps Phaser out of the default environment and a headless
 * test has no camera to ask. That gap is exactly how #115 shipped: the two
 * pure functions were each other's inverse, the round-trip test passed, and
 * the build cursor was displaced by `origin x (1 / zoom - 1)` at every zoom
 * except 1.
 *
 * So this spec asks the real thing. It drives a real `Phaser.Game` configured
 * like `src/main.ts`, and at each zoom compares:
 *
 * - `screenToWorld` against `camera.getWorldPoint`, which inverts the full
 *   camera matrix;
 * - `visibleWorldBounds` against `camera.worldView`, which Phaser computes
 *   independently in `Camera#preRender`;
 * - a real mouse move against both, so the claim that a pointer's `x`/`y` are
 *   CSS pixels in canvas space is measured rather than assumed.
 *
 * It also asserts that the *old* formula disagrees with the real camera
 * wherever zoom is not 1. A test that only checks the new code passes cannot
 * tell a correct implementation from a differently-wrong one; this one fails
 * if the transform ever goes back.
 */

const HARNESS_URL = '/tests/browser/camera-harness.html';

/** Both sides of 1, the bounds from `ZOOM_BOUNDS`, and 1 itself. */
const ZOOM_LEVELS = [0.2, 0.5, 1, 2, 3] as const;

const VIEWPORT = { width: 1280, height: 720 } as const;

/**
 * Decimal places the two answers must agree to, in world units.
 *
 * Not exact equality, and it cannot be: `getWorldPoint` inverts the camera
 * matrix by computing a determinant and dividing, while `screenToWorld` does
 * the arithmetic directly, so the two accumulate different rounding. Measured
 * worst case across this spec is 4.8e-6 world units, at zoom 0.2 where the
 * visible world is 6400 units wide -- about one part in a billion.
 *
 * Three decimal places is 1/64000 of a 64-unit tile, so it cannot hide an
 * error a player could see, and it is still six orders of magnitude tighter
 * than the 640-unit displacement #115 shipped with.
 */
const WORLD_PRECISION = 3;

/** Corners, centre and a few off-axis points -- an error that vanishes at the
 * origin has to be caught away from it. */
const SCREEN_POINTS = [
  { x: 0, y: 0 },
  { x: 640, y: 360 },
  { x: 1280, y: 720 },
  { x: 37, y: 611 },
  { x: 1199, y: 42 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateCameraHarness' in window);
  await page.evaluate(() => window.lockstateCameraHarness.ready());
});

test('the real camera has the origin and viewport the pure transforms assume', async ({ page }) => {
  const probe = await page.evaluate(
    (points) => window.lockstateCameraHarness.probe({ zoom: 1, scrollX: 0, scrollY: 0 }, points),
    [...SCREEN_POINTS],
  );

  // `CAMERA_ORIGIN_RATIO` in `src/rendering/camera/coordinates.ts` hardcodes
  // 0.5 rather than taking the origin as a parameter. This is the assertion
  // that makes that safe: change the camera's origin and this fails, instead
  // of every build cursor silently moving.
  expect(probe.facts.originX).toBe(0.5);
  expect(probe.facts.originY).toBe(0.5);
  // The pure functions take screen coordinates relative to the *viewport*,
  // and `worldPointOf` hands them a pointer relative to the *canvas*. The two
  // coincide only while the camera's viewport starts at the canvas corner.
  expect(probe.facts.x).toBe(0);
  expect(probe.facts.y).toBe(0);
  // Camera rotation is not modelled by the pure transforms and gets no
  // assertion of its own: it needs none, because the comparisons below would
  // fail against a rotated camera. Phaser applies rotation inside the same
  // matrix `getWorldPoint` inverts, so a non-zero rotation shows up as a
  // disagreement at every off-centre screen point.
  expect(probe.facts.width).toBe(VIEWPORT.width);
  expect(probe.facts.height).toBe(VIEWPORT.height);
});

for (const zoom of ZOOM_LEVELS) {
  test(`screenToWorld matches camera.getWorldPoint at zoom ${zoom}`, async ({ page }) => {
    const probe = await page.evaluate(
      ({ points, cameraZoom }) =>
        window.lockstateCameraHarness.probe({ zoom: cameraZoom, scrollX: 512, scrollY: -288 }, points),
      { points: [...SCREEN_POINTS], cameraZoom: zoom },
    );

    expect(probe.facts.zoom).toBeCloseTo(zoom, 10);

    for (const sample of probe.samples) {
      const where = `screen (${sample.screen.x}, ${sample.screen.y}) at zoom ${zoom}`;
      expect(sample.pureWorld.x, `${where}: world x`).toBeCloseTo(sample.phaserWorld.x, WORLD_PRECISION);
      expect(sample.pureWorld.y, `${where}: world y`).toBeCloseTo(sample.phaserWorld.y, WORLD_PRECISION);
      // The inverse has to land back on the pixel it came from, measured
      // against Phaser's world point rather than against `screenToWorld`.
      expect(sample.pureScreen.x, `${where}: screen x`).toBeCloseTo(sample.screen.x, WORLD_PRECISION);
      expect(sample.pureScreen.y, `${where}: screen y`).toBeCloseTo(sample.screen.y, WORLD_PRECISION);
    }
  });

  test(`visibleWorldBounds matches camera.worldView at zoom ${zoom}`, async ({ page }) => {
    const probe = await page.evaluate(
      ({ points, cameraZoom }) =>
        window.lockstateCameraHarness.probe({ zoom: cameraZoom, scrollX: 512, scrollY: -288 }, points),
      { points: [...SCREEN_POINTS], cameraZoom: zoom },
    );

    // Chunk culling reads these bounds. Before #115 they were wrong at every
    // zoom but 1, so the renderer asked for the wrong tiles.
    expect(probe.pureBounds.left).toBeCloseTo(probe.phaserWorldView.x, WORLD_PRECISION);
    expect(probe.pureBounds.top).toBeCloseTo(probe.phaserWorldView.y, WORLD_PRECISION);
    expect(probe.pureBounds.right).toBeCloseTo(probe.phaserWorldView.x + probe.phaserWorldView.width, WORLD_PRECISION);
    expect(probe.pureBounds.bottom).toBeCloseTo(probe.phaserWorldView.y + probe.phaserWorldView.height, WORLD_PRECISION);
  });
}

test('the pre-#115 formula agrees with the real camera at zoom 1 and nowhere else', async ({ page }) => {
  for (const zoom of ZOOM_LEVELS) {
    const probe = await page.evaluate(
      ({ points, cameraZoom }) =>
        window.lockstateCameraHarness.probe({ zoom: cameraZoom, scrollX: 512, scrollY: -288 }, points),
      { points: [...SCREEN_POINTS], cameraZoom: zoom },
    );

    // `origin x (1 / zoom - 1)`, the closed form of the displacement, checked
    // against a real camera rather than against the arithmetic that produced
    // it. At zoom 1 it is zero -- which is why the app looked fine on load
    // and broke the moment a player used the scroll wheel.
    const expectedErrorX = (VIEWPORT.width / 2) * (1 / zoom - 1);
    const expectedErrorY = (VIEWPORT.height / 2) * (1 / zoom - 1);

    for (const sample of probe.samples) {
      const where = `screen (${sample.screen.x}, ${sample.screen.y}) at zoom ${zoom}`;
      expect(sample.topLeftModelWorld.x - sample.phaserWorld.x, `${where}: x error`).toBeCloseTo(expectedErrorX, WORLD_PRECISION);
      expect(sample.topLeftModelWorld.y - sample.phaserWorld.y, `${where}: y error`).toBeCloseTo(expectedErrorY, WORLD_PRECISION);
    }

    if (zoom === 1) {
      for (const sample of probe.samples) {
        expect(sample.topLeftModelWorld.x).toBeCloseTo(sample.phaserWorld.x, WORLD_PRECISION);
      }
    }
  }
});

test('a real mouse move lands on the tile the real camera says it does', async ({ page }) => {
  // Zoomed out: the case the owner reported, and the one where the old model
  // was off by 640 x 360 world units -- ten tiles by five and a bit.
  await page.evaluate(
    (points) => window.lockstateCameraHarness.probe({ zoom: 0.5, scrollX: 512, scrollY: -288 }, points),
    [...SCREEN_POINTS],
  );
  await page.evaluate(() => window.lockstateCameraHarness.resetPointer());

  const offset = await page.evaluate(() => window.lockstateCameraHarness.canvasOffset());
  // `Scale.RESIZE` fills the parent, so the canvas starts at the page corner.
  // If it ever does not, the arithmetic below is what tells us.
  expect(offset).toEqual({ x: 0, y: 0 });

  const target = { x: 340, y: 205 };
  await page.mouse.move(target.x, target.y);
  await page.waitForFunction(() => window.lockstateCameraHarness.takePointer().seen);

  const probe = await page.evaluate(() => window.lockstateCameraHarness.takePointer());

  // A pointer's coordinates are CSS pixels measured from the canvas corner --
  // no device-pixel-ratio term, no scale-manager scaling. Asserted because
  // `worldPointOf` passes them straight through.
  expect(probe.pointer).toEqual({ x: target.x - offset.x, y: target.y - offset.y });
  expect(probe.pureWorld.x).toBeCloseTo(probe.phaserWorld.x, WORLD_PRECISION);
  expect(probe.pureWorld.y).toBeCloseTo(probe.phaserWorld.y, WORLD_PRECISION);
  // The whole point of the fix, stated in the terms the player sees: the edge
  // the build tool would place a wall on is the edge under the cursor.
  expect(probe.edge).toEqual(probe.phaserEdge);
});
