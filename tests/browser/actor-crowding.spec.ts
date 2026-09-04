import { expect, test } from './network-changed-fixture';
import type { LockstateActorMotionHarness } from './actor-motion-harness-api';

/**
 * **Two actors standing on one tile are two figures** -- issue #944, the gate
 * that section 6 of it asks for in its own words: *"place a prisoner and a
 * guard on the same tile and assert two distinct figures are drawn."*
 *
 * ### Why this cannot be a `vitest` test
 *
 * `vitest.config.ts` runs in `environment: 'node'` with no jsdom, so a
 * `Phaser.GameObjects.Image` -- which is what a "figure" is -- does not exist
 * there. `tests/unit/rendering-crowd-spread.test.ts` pins the arithmetic
 * headlessly; what only a browser can say is that `ActorLayer` actually places
 * two sprites, from two atlases, at two positions on one display list.
 *
 * ### What was wrong, and what this asserts instead
 *
 * `depthForAnchor` is a function of the anchor row, so two actors on one tile
 * got the identical depth; Phaser's sort is stable, so the tie fell to the
 * feed's array order; and that order is prisoners first, guards second. On a
 * shared tile the guard therefore always won and the prisoners were always the
 * hidden ones -- measured in a real session at 22 prisoners and 6 guards, which
 * drew **two figures** on two tiles. Since `crowd-spread.ts` the co-located
 * actors are drawn at distinct points inside their own tile and take their
 * depth from the drawn foot, so nobody is structurally hidden.
 *
 * ### What this spec does NOT claim, so nobody reads more into a green
 *
 * - **It reads the display list, not pixels.** Two figures 28px apart at a
 *   64px tile still overlap: the front one covers about 56% of the rear one's
 *   width, and what is uncovered is the rear figure's upper left, including its
 *   head (a character frame is 96px tall drawn, and the rear foot sits 19px
 *   north). That is the improvement being claimed -- part of a second figure
 *   where before there was none of it -- and it is reasoned from the numbers
 *   here rather than sampled from a canvas.
 * - **It says nothing about a stack of twenty-two.** The spread stays inside
 *   one tile on purpose, so a large stack reads as a crowd on one tile and not
 *   as a countable population. The simulation is what stacks them
 *   (#944 section 3's measurement record) and nothing in the renderer changes
 *   that.
 *
 * Requires the git-LFS actor atlases, same precondition as
 * `actor-guard-rendering.spec.ts` and `actor-motion.spec.ts`:
 * `bash scripts/provision-git-lfs.sh && git lfs pull`. Without them every
 * record is counted `unresolved` and nothing is drawn, so the `unresolved`
 * assertions below are what stop this file passing vacuously.
 */

declare global {
  interface Window {
    lockstateActorMotionHarness?: LockstateActorMotionHarness;
  }
}

const HARNESS = '/tests/browser/actor-motion-harness.html';

/** The tile every act crowds. Well inside the harness camera's view, like `actor-guard-rendering.spec.ts`'s. */
const SHARED_TILE = { x: 9, y: 4 } as const;
/**
 * World pixels of the shared tile's centre: `tileCentreToWorld` is
 * `(tile + 0.5) * TILE_SIZE_PX` at a 64px tile, so (9.5, 4.5) x 64.
 *
 * Written out rather than imported, so this file states the position it
 * expects instead of computing it from the code it is checking.
 */
const SHARED_TILE_CENTRE = { x: 608, y: 288 } as const;

/**
 * How far apart two co-located figures must be drawn, in world pixels.
 *
 * The floor is legibility: a character is drawn one tile wide, so a separation
 * under about a quarter of a tile leaves nothing of the rear figure showing.
 * The ceiling is honesty: the foot must stay inside the tile the simulation
 * named, which is half a tile from its centre.
 */
const MIN_SEPARATION_PX = 16;
const MAX_OFFSET_PX = 32;

test.describe('two actors on one tile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await page.evaluate(async () => {
      await window.lockstateActorMotionHarness!.ready;
    });
  });

  test('a prisoner and a guard sharing a tile are drawn as two figures, not one (#944)', async ({ page }) => {
    await page.evaluate(async (tile) => {
      // One keyframe carrying both, in the production order: prisoners by
      // ascending entity index, then guards. Two separate publications would
      // not do -- a keyframe replaces the whole actor list (ADR 0040).
      window.lockstateActorMotionHarness!.publishCrowd(1, [
        { population: 'prisoner', entityId: 4, tile },
        { population: 'guard', entityId: 70, tile },
      ]);
    }, SHARED_TILE);

    await page.waitForFunction(
      () =>
        window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base').length > 0 &&
        window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base').length > 0,
    );

    const [unresolved, prisoners, guards] = await page.evaluate(() => [
      window.lockstateActorMotionHarness!.unresolvedActorCount(),
      window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base'),
      window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base'),
    ]);

    // Zero, not "some sprite exists": a record whose asset has no loaded clip
    // is counted `unresolved` and drawn nowhere, so one sprite plus a nonzero
    // count would mean the other population silently failed to draw.
    expect(unresolved).toBe(0);
    expect(prisoners).toHaveLength(1);
    expect(guards).toHaveLength(1);

    const prisoner = prisoners[0]!;
    const guard = guards[0]!;

    // The point of the whole issue: two figures, at two places.
    expect(Math.abs(guard.x - prisoner.x)).toBeGreaterThanOrEqual(MIN_SEPARATION_PX);
    expect(Math.abs(guard.y - prisoner.y)).toBeGreaterThan(0);

    // Distinct depths, so which of the two overlaps the other is decided by
    // where they are drawn and not by which block of the feed's array they
    // came from. Equal depths are what #944 section 2 diagnosed.
    expect(guard.depth).not.toBe(prisoner.depth);

    // Neither foot leaves the tile the simulation named.
    expect(Math.abs(prisoner.x - SHARED_TILE_CENTRE.x)).toBeLessThanOrEqual(MAX_OFFSET_PX);
    expect(Math.abs(prisoner.y - SHARED_TILE_CENTRE.y)).toBeLessThanOrEqual(MAX_OFFSET_PX);
    expect(Math.abs(guard.x - SHARED_TILE_CENTRE.x)).toBeLessThanOrEqual(MAX_OFFSET_PX);
    expect(Math.abs(guard.y - SHARED_TILE_CENTRE.y)).toBeLessThanOrEqual(MAX_OFFSET_PX);

    // And the prisoner is the one that keeps the tile's own centre, because it
    // is first in the feed's order. Not a tie-break dressed up: the guard is
    // still drawn, in front, and the player can see both.
    expect(prisoner.x).toBeCloseTo(SHARED_TILE_CENTRE.x, 6);
    expect(prisoner.y).toBeCloseTo(SHARED_TILE_CENTRE.y, 6);
    expect(guard.depth).toBeGreaterThan(prisoner.depth);
  });

  test('an actor standing alone is still drawn exactly on its tile (#944)', async ({ page }) => {
    await page.evaluate(async (tile) => {
      window.lockstateActorMotionHarness!.publishCrowd(1, [{ population: 'prisoner', entityId: 4, tile }]);
    }, SHARED_TILE);

    await page.waitForFunction(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base').length > 0);

    const drawn = await page.evaluate(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base'));

    // The blast radius of the crowd spread is exactly the defect: a prison
    // that is not stacking anybody looks pixel for pixel as it did before.
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.x).toBeCloseTo(SHARED_TILE_CENTRE.x, 6);
    expect(drawn[0]!.y).toBeCloseTo(SHARED_TILE_CENTRE.y, 6);
  });

  test('six actors on one tile are six figures at six depths (#944)', async ({ page }) => {
    await page.evaluate(async (tile) => {
      window.lockstateActorMotionHarness!.publishCrowd(1, [
        { population: 'prisoner', entityId: 1, tile },
        { population: 'prisoner', entityId: 2, tile },
        { population: 'prisoner', entityId: 3, tile },
        { population: 'prisoner', entityId: 4, tile },
        { population: 'guard', entityId: 70, tile },
        { population: 'guard', entityId: 71, tile },
      ]);
    }, SHARED_TILE);

    await page.waitForFunction(
      () =>
        window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base').length === 4 &&
        window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base').length === 2,
    );

    const [unresolved, prisoners, guards] = await page.evaluate(() => [
      window.lockstateActorMotionHarness!.unresolvedActorCount(),
      window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base'),
      window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base'),
    ]);

    expect(unresolved).toBe(0);
    const drawn = [...prisoners, ...guards];
    expect(drawn).toHaveLength(6);

    // Six positions and six depths from six records. Before #944's fix this
    // was one position and one depth six times over.
    expect(new Set(drawn.map((sprite) => sprite.x)).size).toBe(6);
    expect(new Set(drawn.map((sprite) => sprite.y)).size).toBe(6);
    expect(new Set(drawn.map((sprite) => sprite.depth)).size).toBe(6);

    // Still inside one tile. This is the limit, asserted rather than left to
    // be assumed: six figures in a tile is a crowd, not six countable people,
    // and a stack of twenty-two is a crowd too.
    for (const sprite of drawn) {
      expect(Math.abs(sprite.x - SHARED_TILE_CENTRE.x)).toBeLessThanOrEqual(MAX_OFFSET_PX);
      expect(Math.abs(sprite.y - SHARED_TILE_CENTRE.y)).toBeLessThanOrEqual(MAX_OFFSET_PX);
    }
  });

  test('the guard is drawn whichever population the feed builds first (#944)', async ({ page }) => {
    // The refutation of the cheaper fix, as a test rather than as an argument.
    // A distinct depth bias per population would make one population win every
    // tie -- swapping which one disappears. Separation by placement does not
    // depend on the order at all, so the same two figures are drawn with the
    // guard written first.
    await page.evaluate(async (tile) => {
      window.lockstateActorMotionHarness!.publishCrowd(1, [
        { population: 'guard', entityId: 70, tile },
        { population: 'prisoner', entityId: 4, tile },
      ]);
    }, SHARED_TILE);

    await page.waitForFunction(
      () =>
        window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base').length > 0 &&
        window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base').length > 0,
    );

    const [prisoners, guards] = await page.evaluate(() => [
      window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base'),
      window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base'),
    ]);

    expect(prisoners).toHaveLength(1);
    expect(guards).toHaveLength(1);
    expect(Math.abs(guards[0]!.x - prisoners[0]!.x)).toBeGreaterThanOrEqual(MIN_SEPARATION_PX);
    expect(guards[0]!.depth).not.toBe(prisoners[0]!.depth);
    // Reversed, the guard is the one holding the tile centre -- so the order
    // decides which point each stands on, and not which of them exists.
    expect(guards[0]!.x).toBeCloseTo(SHARED_TILE_CENTRE.x, 6);
  });
});
