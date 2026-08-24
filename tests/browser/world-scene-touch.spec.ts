import { expect, test, type CDPSession, type Page } from '@playwright/test';

/**
 * Real-browser verification for the **two-finger** camera gestures: the pan,
 * the pinch, and the `ZOOM_BOUNDS` clamp at both ends.
 *
 * This is the last unexecuted claim in the #209 audit's touch section. That
 * audit drove every keyboard and mouse claim through real events and dispatched
 * no touch sequence at all, so two things a player does on a phone were held up
 * by reading alone: `docs/INPUT.md`'s "Two fingers ... still move the camera"
 * (the same sentence `hud.build.arm-hint` paints on screen, whose *other*
 * clause #200 caught lying), and `world-scene.ts`'s `this.input.addPointer(2)`,
 * without which Phaser tracks exactly one touch pointer and a pinch cannot be
 * seen at all.
 *
 * A follow-up settled the pan half by execution and could not settle the pinch
 * half, because the harness exposed `scroll()` and nothing else: a camera that
 * has zoomed about a point which is not the viewport centre *also* moves its
 * scroll, so scroll alone cannot tell a zoom from a pan. `zoom()` arrived with
 * PR #233 for the keyboard zoom keys and `worldPointAt` arrives with this spec,
 * and between them the pinch is now measured rather than reasoned about.
 *
 * **What the unsettled measurement turned out to be.** The audit follow-up
 * reported a symmetric separation that left `scrollX` untouched and moved
 * `scrollY` by about 32, declined to call it a pass or a defect, and named two
 * candidates: a real bug, or `TouchGestureTracker` carrying state across a
 * synthetic `touchEnd`/`touchStart` boundary. It is **neither**. It is the
 * scroll correction an anchored zoom is required to make, and its size is
 * forced:
 *
 *     scroll_after - scroll_before = (midpoint - viewport centre) * (1 - 1 / zoom)
 *
 * per axis. `scroll + viewport / 2` is the world point at the viewport *centre*
 * (`docs/CAMERA.md`), so holding a world point under a midpoint that is **not**
 * the centre must move the world point at the centre, and therefore must move
 * scroll. The reported reading had `x` untouched because that midpoint sat on
 * the viewport's vertical centre line, where the x term of that product is
 * exactly zero, while its y term was not. `pinching out about a midpoint on the
 * viewport's vertical centre line` below reproduces that exact shape -- dx = 0,
 * dy = -32.727 -- and asserts the world point under the midpoint is held to
 * three decimal places across it. Nothing drifted: the anchor held while the
 * scroll moved, which is what an anchored zoom *is*.
 *
 * The boundary hypothesis was tested rather than dismissed, and it is the last
 * two specs here: a lifted finger is forgotten, and the same separation
 * measures identically whether or not a completed gesture preceded it.
 *
 * Touch needs a Chromium context with `hasTouch` and CDP
 * `Input.dispatchTouchEvent`; `page.touchscreen` taps one finger and cannot
 * express a second. Measured, so the comments below can rely on it: one
 * two-point `touchMove` reaches the page as **two** `pointermove` events, one
 * per finger, so `TouchGestureTracker` sees one finger move at a time -- which
 * is the delivery its `move(point)` signature is built for, and the reason the
 * midpoint travels *within* a symmetric separation before returning.
 */

test.use({ hasTouch: true });

const HARNESS_URL = '/tests/browser/world-scene-harness.html';

/**
 * Fixed rather than inherited, because every literal below is derived from the
 * viewport centre. Phaser's camera scales zoom about `origin`, which is
 * `viewport * 0.5` (`src/rendering/camera/coordinates.ts`), so a runner with a
 * different default window size would move every expected number.
 */
const VIEWPORT = { width: 1280, height: 720 } as const;

/** The point Phaser scales zoom about: the middle of the viewport. */
const VIEWPORT_CENTRE = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 } as const;

/**
 * `ZOOM_BOUNDS` from `src/rendering/scene/world-scene.ts`, copied deliberately.
 *
 * The same choice `world-scene-input.spec.ts` makes for the keyboard clamp: the
 * constant is private to the scene, and importing it would let a spec that
 * "asserts the bounds" pass against any bounds at all. A literal fails when the
 * range changes, which is the point -- 0.2 to 3 is a player-facing decision
 * (a 64px tile drawn between 13 and 192 pixels) and changing it should require
 * saying so here.
 */
const ZOOM_BOUNDS = { min: 0.2, max: 3 } as const;

/**
 * Decimal places the anchored world point must hold to, in world units.
 *
 * Not exact equality, and it cannot be: the gesture applies one scale and one
 * translation per finger event -- twelve of each in a six-step separation --
 * and `getWorldPoint` then inverts the camera matrix by determinant. Measured
 * worst case across this spec is 3.0e-5 world units, at the zoom-out end where
 * one screen pixel is five world units. Three places is 1/64000 of a 64-unit
 * tile: far below anything a player could see, and four orders of magnitude
 * below the smallest drift that would matter.
 */
const WORLD_PRECISION = 3;

/** Places the scroll literals must hold to. Measured worst deviation: 4.1e-13. */
const SCROLL_PRECISION = 6;

interface Finger {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface CameraReading {
  readonly scroll: Point;
  readonly zoom: number;
  /** The world point the real camera puts under the probe point. */
  readonly world: Point;
}

async function openHarness(page: Page): Promise<void> {
  await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => window.lockstateWorldSceneHarness !== undefined);
  await page.evaluate(() => window.lockstateWorldSceneHarness!.ready);
}

/** Two animation frames: the shortest honest "the camera drew a frame with this". */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * The camera, read after a rendered frame.
 *
 * `worldPointAt` answers from Phaser's own `Camera#getWorldPoint`, which reads
 * the matrix `preRender` built for the frame just drawn -- so this must not be
 * called between a `setZoom` and the next frame, and every caller here goes
 * through `settle` first.
 */
async function read(page: Page, probe: Point): Promise<CameraReading> {
  await settle(page);
  return page.evaluate((at) => {
    const harness = window.lockstateWorldSceneHarness!;
    return { scroll: harness.scroll(), zoom: harness.zoom(), world: harness.worldPointAt(at) };
  }, probe);
}

async function dispatch(
  client: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  fingers: readonly Finger[],
): Promise<void> {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: fingers.map((finger) => ({ x: finger.x, y: finger.y, id: finger.id })),
  });
}

const STEPS = 6;

/**
 * Two fingers placed `fromGap` apart on a horizontal line through `mid`, moved
 * symmetrically to `toGap` apart, then lifted.
 *
 * Symmetric about a **fixed** midpoint on purpose: the pinch carries a
 * translation as well as a scale (`src/input/gestures.ts`), and a separation
 * whose midpoint wandered would mix the two, so a spec asserting the anchor
 * could not say which half held it. With the midpoint fixed, the requested
 * zoom multiplier is exactly `toGap / fromGap` and every scroll number below
 * is the anchor correction alone.
 */
async function pinch(client: CDPSession, mid: Point, fromGap: number, toGap: number): Promise<void> {
  const place = async (type: 'touchStart' | 'touchMove', gap: number): Promise<void> => {
    await dispatch(client, type, [
      { id: 0, x: mid.x - gap / 2, y: mid.y },
      { id: 1, x: mid.x + gap / 2, y: mid.y },
    ]);
  };
  await place('touchStart', fromGap);
  for (let step = 1; step <= STEPS; step += 1) {
    await place('touchMove', fromGap + ((toGap - fromGap) * step) / STEPS);
  }
  await dispatch(client, 'touchEnd', []);
}

/**
 * What an anchored zoom must do to the scroll, per axis.
 *
 * Derived rather than copied from the implementation, and it is short enough to
 * derive here. `screenToWorld` is
 * `scroll + origin + (screen - origin) / zoom`, so holding the world point
 * under `screen` while zoom goes from `z0` to `z1` requires
 * `scroll1 - scroll0 = (screen - origin) * (1 / z0 - 1 / z1)`. Every gesture
 * here starts from the resting zoom of 1, which is the `z0 = 1` case.
 */
function anchorScrollDelta(midpoint: Point, zoom: number): Point {
  return {
    x: (midpoint.x - VIEWPORT_CENTRE.x) * (1 - 1 / zoom),
    y: (midpoint.y - VIEWPORT_CENTRE.y) * (1 - 1 / zoom),
  };
}

test.describe('the world scene two-finger gestures', () => {
  /**
   * Off the viewport centre on **both** axes, so every zoom below has to move
   * both scroll components. A midpoint at the centre would leave the scroll
   * untouched at every zoom, and a spec that pinched there would pass against
   * an implementation that never corrected the scroll at all.
   */
  const OFF_CENTRE = { x: 480, y: 300 } as const;

  test('moves the camera one-to-one when two fingers travel together, and does not zoom (#209)', async ({ page }) => {
    // The number: at zoom 1 the camera travels exactly as far as the fingers
    // did, the other way, and the gap between them never changed so the zoom
    // is untouched. What this spec deliberately does **not** claim is that two
    // fingers were required -- one finger dragged the same way pans the same
    // distance, and measured, this passes with `addPointer(0)`. The spec below
    // is the one that discriminates.
    await openHarness(page);
    const client = await page.context().newCDPSession(page);
    const before = await read(page, OFF_CENTRE);

    await dispatch(client, 'touchStart', [
      { id: 0, x: 400, y: 300 },
      { id: 1, x: 500, y: 300 },
    ]);
    for (let step = 1; step <= STEPS; step += 1) {
      await dispatch(client, 'touchMove', [
        { id: 0, x: 400 + (120 * step) / STEPS, y: 300 + (78 * step) / STEPS },
        { id: 1, x: 500 + (120 * step) / STEPS, y: 300 + (78 * step) / STEPS },
      ]);
    }
    const after = await read(page, OFF_CENTRE);
    await dispatch(client, 'touchEnd', []);

    // Drag-the-world, one world unit per screen pixel at zoom 1: the fingers
    // went +120/+78 and the camera went the other way by the same amount.
    expect(after.scroll.x - before.scroll.x).toBeCloseTo(-120, SCROLL_PRECISION);
    expect(after.scroll.y - before.scroll.y).toBeCloseTo(-78, SCROLL_PRECISION);
    // And it is a pan, not a pinch that happens to translate. The gap between
    // the fingers is unchanged, so the scale multiplies out to exactly 1 --
    // asserted because the two fingers arrive one at a time, which means the
    // gap really does change between the two halves of every step.
    expect(after.zoom).toBeCloseTo(before.zoom, 10);
  });

  test('pans on two fingers while a build tool is armed, and abandons the run (#209)', async ({ page }) => {
    /*
     * The spec above cannot tell a two-finger pan from a one-finger one -- both
     * move the camera by the travel of the finger, and neither zooms. Measured:
     * with `addPointer(2)` cut back to `addPointer(0)`, so the second finger is
     * never delivered, it still passed. This is the discriminator.
     *
     * It is also the exact claim `hud.build.arm-hint` makes, in the place it
     * makes it. That string is painted in the **Build panel**, so "two fingers
     * still move the camera" is a promise about a session with a tool armed --
     * and while one is armed the one-finger drag builds (#74), which is what
     * makes the second finger load-bearing rather than incidental. With one
     * finger the same gesture places a wall and the camera does not move at all.
     */
    await openHarness(page);
    await page.evaluate(() => window.lockstateWorldSceneHarness!.armBuildTool(true));
    const client = await page.context().newCDPSession(page);
    const before = await read(page, OFF_CENTRE);

    await dispatch(client, 'touchStart', [
      { id: 0, x: 400, y: 300 },
      { id: 1, x: 500, y: 300 },
    ]);
    for (let step = 1; step <= STEPS; step += 1) {
      await dispatch(client, 'touchMove', [
        { id: 0, x: 400 + (120 * step) / STEPS, y: 300 + (78 * step) / STEPS },
        { id: 1, x: 500 + (120 * step) / STEPS, y: 300 + (78 * step) / STEPS },
      ]);
    }
    await dispatch(client, 'touchEnd', []);
    const after = await read(page, OFF_CENTRE);

    expect(after.scroll.x - before.scroll.x, 'the armed tool swallowed the pan').toBeCloseTo(-120, SCROLL_PRECISION);
    expect(after.scroll.y - before.scroll.y, 'the armed tool swallowed the pan').toBeCloseTo(-78, SCROLL_PRECISION);
    // The first finger down does arm a run -- `activeTouchCount()` is 1 at that
    // instant -- and the second one has to abandon it rather than commit a wall
    // the player was trying to scroll past.
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.placedRuns())).toEqual([]);
    expect(await page.evaluate(() => window.lockstateWorldSceneHarness!.targetedRun())).toBeUndefined();
  });

  test('zooms in when the fingers separate, holding the world point under the midpoint (#209)', async ({ page }) => {
    await openHarness(page);
    const client = await page.context().newCDPSession(page);
    const before = await read(page, OFF_CENTRE);

    // 100px apart to 220px apart: a requested multiplier of exactly 2.2.
    await pinch(client, OFF_CENTRE, 100, 220);
    const after = await read(page, OFF_CENTRE);

    expect(after.zoom, 'the fingers separated and the camera did not zoom in').toBeGreaterThan(before.zoom);
    expect(after.zoom).toBeCloseTo(2.2, 10);
    // The property `tests/unit/camera-coordinates.test.ts` asserts for
    // `zoomAtScreenPoint` in isolation, here through the real gesture: the
    // world stayed put under the fingers.
    expect(after.world.x, 'the world slid under the midpoint').toBeCloseTo(before.world.x, WORLD_PRECISION);
    expect(after.world.y, 'the world slid under the midpoint').toBeCloseTo(before.world.y, WORLD_PRECISION);
    // Vacuity guard: holding the anchor is only an achievement if the camera
    // had to move to do it. (480, 300) is 160 left and 60 above the viewport
    // centre, so at zoom 2.2 the scroll owes -160 * (1 - 1/2.2) = -87.2727 and
    // -60 * (1 - 1/2.2) = -32.7272.
    const owed = anchorScrollDelta(OFF_CENTRE, after.zoom);
    expect(owed.x).toBeCloseTo(-87.272727, 5);
    expect(owed.y).toBeCloseTo(-32.727272, 5);
    expect(after.scroll.x - before.scroll.x).toBeCloseTo(owed.x, SCROLL_PRECISION);
    expect(after.scroll.y - before.scroll.y).toBeCloseTo(owed.y, SCROLL_PRECISION);
  });

  test('zooms out when the fingers converge, holding the same world point (#209)', async ({ page }) => {
    // The other direction, from a camera that is already zoomed in -- so this
    // is not the resting state answering by accident, and it crosses zoom 1 on
    // the way down rather than starting there.
    await openHarness(page);
    const client = await page.context().newCDPSession(page);
    const resting = await read(page, OFF_CENTRE);

    await pinch(client, OFF_CENTRE, 100, 220);
    const zoomedIn = await read(page, OFF_CENTRE);
    expect(zoomedIn.zoom, 'nothing zoomed in, so zooming back out proves nothing').toBeGreaterThan(resting.zoom);

    // 500px apart to 100px apart: a requested multiplier of exactly 0.2.
    await pinch(client, OFF_CENTRE, 500, 100);
    const zoomedOut = await read(page, OFF_CENTRE);

    expect(zoomedOut.zoom, 'the fingers converged and the camera did not zoom out').toBeLessThan(zoomedIn.zoom);
    expect(zoomedOut.zoom, 'zooming out did not pass the zoom it started from').toBeLessThan(resting.zoom);
    expect(zoomedOut.zoom).toBeCloseTo(2.2 * 0.2, 10);
    // Held across both gestures, against the reading taken before either.
    expect(zoomedOut.world.x).toBeCloseTo(resting.world.x, WORLD_PRECISION);
    expect(zoomedOut.world.y).toBeCloseTo(resting.world.y, WORLD_PRECISION);
  });

  test('clamps a pinch out at ZOOM_BOUNDS.max with the anchor still held (#209)', async ({ page }) => {
    /*
     * The ordering assertion. `zoomAtScreenPoint` clamps **before** it computes
     * the scroll (`coordinates.ts:157-167`), so the scroll correction is the
     * one the clamped zoom needs. Compute the scroll from the *requested* zoom
     * instead and the camera still stops at 3 -- `setZoom` gets the clamped
     * value either way -- while the world lurches out from under the fingers by
     * the difference, which is why a zoom-only assertion cannot see it.
     *
     * Three separations of x3 request x27, so most of the travel here is past
     * the ceiling rather than merely at it.
     */
    await openHarness(page);
    const client = await page.context().newCDPSession(page);
    const before = await read(page, OFF_CENTRE);

    for (let round = 0; round < 3; round += 1) await pinch(client, OFF_CENTRE, 100, 300);
    const after = await read(page, OFF_CENTRE);

    expect(after.zoom).toBe(ZOOM_BOUNDS.max);
    expect(after.world.x, 'the world slid out from under the fingers at the ceiling').toBeCloseTo(before.world.x, WORLD_PRECISION);
    expect(after.world.y, 'the world slid out from under the fingers at the ceiling').toBeCloseTo(before.world.y, WORLD_PRECISION);
    // -160 * (1 - 1/3) = -106.6667 and -60 * (1 - 1/3) = -40: the correction
    // owed for zoom 3, not for the 27 that was asked for.
    expect(after.scroll.x - before.scroll.x).toBeCloseTo(-106.666667, 5);
    expect(after.scroll.y - before.scroll.y).toBeCloseTo(-40, SCROLL_PRECISION);
  });

  test('clamps a pinch in at ZOOM_BOUNDS.min with the anchor still held (#209)', async ({ page }) => {
    // The same at the other end, where the arithmetic is far less forgiving:
    // one screen pixel is five world units at zoom 0.2, so a scroll computed
    // from the requested 0.008 rather than the clamped 0.2 misses by hundreds
    // of world units.
    await openHarness(page);
    const client = await page.context().newCDPSession(page);
    const before = await read(page, OFF_CENTRE);

    for (let round = 0; round < 3; round += 1) await pinch(client, OFF_CENTRE, 500, 100);
    const after = await read(page, OFF_CENTRE);

    expect(after.zoom).toBe(ZOOM_BOUNDS.min);
    expect(after.world.x, 'the world slid out from under the fingers at the floor').toBeCloseTo(before.world.x, WORLD_PRECISION);
    expect(after.world.y, 'the world slid out from under the fingers at the floor').toBeCloseTo(before.world.y, WORLD_PRECISION);
    // -160 * (1 - 1/0.2) = 640 and -60 * (1 - 1/0.2) = 240. Zooming out about
    // a point left of centre moves the scroll *right*, which is correct: the
    // viewport centre now looks at a world point further along.
    expect(after.scroll.x - before.scroll.x).toBeCloseTo(640, SCROLL_PRECISION);
    expect(after.scroll.y - before.scroll.y).toBeCloseTo(240, SCROLL_PRECISION);
  });

  test('moves the scroll on one axis only when the midpoint is on the viewport centre line (#209)', async ({ page }) => {
    /*
     * The reading #209's follow-up could not classify, reproduced with a zoom
     * readout beside it.
     *
     * It recorded a symmetric separation that left scrollX exactly where it was
     * and moved scrollY by about 32, and named two candidates it could not
     * choose between: a real defect, or `TouchGestureTracker` carrying state
     * across a synthetic touch boundary. It is neither, and this is why. The
     * midpoint here is on the viewport's vertical centre line, so the x term of
     * `(midpoint - centre) * (1 - 1 / zoom)` is exactly zero and the y term is
     * not -- an anchored zoom is *required* to leave one alone and move the
     * other. Measured here: dx = 0, dy = -32.727, and the world point under the
     * midpoint held to three decimal places across it. The scroll moved
     * because the anchor held, not despite it.
     */
    await openHarness(page);
    const client = await page.context().newCDPSession(page);
    const onCentreLine = { x: VIEWPORT_CENTRE.x, y: 300 };
    const before = await read(page, onCentreLine);

    await pinch(client, onCentreLine, 100, 220);
    const after = await read(page, onCentreLine);

    expect(after.zoom).toBeCloseTo(2.2, 10);
    expect(after.scroll.x - before.scroll.x, 'the x axis moved, so the midpoint was not on the centre line').toBeCloseTo(0, SCROLL_PRECISION);
    expect(after.scroll.y - before.scroll.y).toBeCloseTo(-32.727272, 5);
    expect(after.world.x).toBeCloseTo(before.world.x, WORLD_PRECISION);
    expect(after.world.y).toBeCloseTo(before.world.y, WORLD_PRECISION);
  });

  test('forgets a lifted finger, so the next one-finger drag pans rather than pinching (#209)', async ({ page }) => {
    /*
     * The first half of the boundary hypothesis, tested rather than assumed.
     *
     * `TouchGestureTracker` keys its points by pointer id and drops one on
     * `end` (`src/input/gestures.ts:37-39`), which `WorldScene` calls from
     * `pointerup`. If a synthetic `touchEnd` did not reach that -- the failure
     * the follow-up suspected -- a stale peer would survive into the next
     * gesture, and the single finger dragged below would be read as a pinch
     * against a finger that is not on the glass: the zoom would move.
     */
    await openHarness(page);
    const client = await page.context().newCDPSession(page);

    await pinch(client, { x: 480, y: 300 }, 100, 220);
    const afterPinch = await read(page, { x: 480, y: 300 });
    expect(afterPinch.zoom, 'the pinch did nothing, so there is no state to carry').toBeGreaterThan(1);

    await dispatch(client, 'touchStart', [{ id: 0, x: 300, y: 300 }]);
    for (let step = 1; step <= 5; step += 1) {
      await dispatch(client, 'touchMove', [{ id: 0, x: 300 + 10 * step, y: 300 }]);
    }
    const afterDrag = await read(page, { x: 480, y: 300 });
    await dispatch(client, 'touchEnd', []);

    expect(afterDrag.zoom, 'one finger changed the zoom, so a lifted finger was still being tracked').toBe(afterPinch.zoom);
    // And it panned: 50 screen pixels of drag at this zoom, the other way.
    expect(afterDrag.scroll.x - afterPinch.scroll.x).toBeCloseTo(-50 / afterPinch.zoom, SCROLL_PRECISION);
  });

  test('measures a separation identically whether or not a gesture preceded it (#209)', async ({ page }) => {
    /*
     * The second half of the boundary hypothesis, and the direct answer to it.
     *
     * The unclassified reading was taken from the *second* sequence of a run
     * whose first sequence was a two-finger pan, so anything the boundary
     * carried would be in it. The same separation is run here twice on
     * identical fresh pages -- once alone, once after a completed pan and a
     * touchEnd/touchStart boundary -- and the camera deltas are compared. They
     * agree, so the boundary carried nothing and the reading was a measurement
     * of the gesture itself.
     */
    const mid = { x: VIEWPORT_CENTRE.x, y: 300 };

    await openHarness(page);
    const alone = await page.context().newCDPSession(page);
    const beforeAlone = await read(page, mid);
    await pinch(alone, mid, 100, 220);
    const afterAlone = await read(page, mid);

    await openHarness(page);
    const preceded = await page.context().newCDPSession(page);
    await dispatch(preceded, 'touchStart', [
      { id: 0, x: 400, y: 300 },
      { id: 1, x: 500, y: 300 },
    ]);
    for (let step = 1; step <= STEPS; step += 1) {
      await dispatch(preceded, 'touchMove', [
        { id: 0, x: 400 + (120 * step) / STEPS, y: 300 + (78 * step) / STEPS },
        { id: 1, x: 500 + (120 * step) / STEPS, y: 300 + (78 * step) / STEPS },
      ]);
    }
    await dispatch(preceded, 'touchEnd', []);
    const beforePreceded = await read(page, mid);
    expect(beforePreceded.scroll.x, 'the preceding pan did not happen, so there was no boundary to cross').toBeCloseTo(-120, SCROLL_PRECISION);

    await pinch(preceded, mid, 100, 220);
    const afterPreceded = await read(page, mid);

    expect(afterPreceded.zoom).toBeCloseTo(afterAlone.zoom, 10);
    expect(afterPreceded.scroll.x - beforePreceded.scroll.x).toBeCloseTo(afterAlone.scroll.x - beforeAlone.scroll.x, SCROLL_PRECISION);
    expect(afterPreceded.scroll.y - beforePreceded.scroll.y).toBeCloseTo(afterAlone.scroll.y - beforeAlone.scroll.y, SCROLL_PRECISION);
  });
});
