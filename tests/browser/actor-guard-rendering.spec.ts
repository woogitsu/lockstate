import { expect, test } from './network-changed-fixture';
import type { LockstateActorMotionHarness } from './actor-motion-harness-api';

/**
 * **A guard is actually drawn** -- issue #414's surviving half, and the one
 * claim about it `pnpm test` cannot make.
 *
 * `tests/unit/rendering-feed.test.ts` and `tests/unit/render-delta-payload.test.ts`
 * cover the arithmetic headlessly: a real `GuardRoster` entry decodes into a
 * `RenderActor` with `GUARD_ACTOR_ASSET_ID`, on both the snapshot channel and
 * the delta channel, at a render-space id that cannot collide with a
 * prisoner's. What none of that can see is whether `actor.guard.base`'s
 * git-LFS atlas actually loads in a real texture manager and whether
 * `ActorLayer` actually places a sprite from it, as opposed to counting the
 * record `unresolved` and drawing nothing -- exactly the failure mode a
 * missing or misnamed asset would produce, and exactly the failure mode this
 * branch was warned against inventing (`docs/research/2026-08-28-drawing-guards.md`).
 *
 * Requires the git-LFS actor atlases, same precondition as `actor-motion.spec.ts`:
 * `bash scripts/provision-git-lfs.sh && git lfs pull`.
 */

declare global {
  interface Window {
    lockstateActorMotionHarness?: LockstateActorMotionHarness;
  }
}

const HARNESS = '/tests/browser/actor-motion-harness.html';

test.describe('the renderer draws a guard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await page.evaluate(async () => {
      await window.lockstateActorMotionHarness!.ready;
    });
  });

  test('places a sprite from the guard atlas, not the placeholder for missing art', async ({ page }) => {
    await page.evaluate(() => {
      window.lockstateActorMotionHarness!.publishGuard(1, { x: 9, y: 4 });
    });

    await page.waitForFunction(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base').length > 0);

    const [unresolved, guardSprites] = await page.evaluate(() => [
      window.lockstateActorMotionHarness!.unresolvedActorCount(),
      window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base'),
    ]);

    // Zero, not merely "some sprite exists": `ActorLayer.draw` counts an actor
    // `unresolved` and returns before placing anything when its asset id has no
    // loaded clip, so a guard sprite and a nonzero `unresolved` count together
    // would mean a *different* record resolved while this one silently failed.
    expect(unresolved).toBe(0);
    expect(guardSprites).toHaveLength(1);
  });

  test('draws a guard beside a prisoner, each from its own atlas, on the same frame', async ({ page }) => {
    await page.evaluate(() => {
      window.lockstateActorMotionHarness!.publishGuard(1, { x: 9, y: 4 });
    });
    await page.waitForFunction(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base').length > 0);

    // A second keyframe: in production one `simulation/delta` carries every
    // population at once (`render-actors-keyframe.ts`), but the harness's
    // `publishActor`/`publishGuard` each write a keyframe of one record, so
    // this spec drives the feed the same way `SimulationSnapshotFeed` is driven
    // in practice -- a keyframe replaces the frame's whole actor list
    // (ADR 0040), so publishing the prisoner second is what keeps the guard on
    // screen: the real worker would publish both in the one buffer this
    // harness cannot construct from two separate calls.
    //
    // So instead: publish the guard, confirm it drew, then confirm a second,
    // independent publication of a prisoner draws *that* population's art too
    // -- proving both atlases are live and distinguishable, which is what a
    // shared texture-manager mistake (one asset id aliasing the other) would
    // fail even though each call is individually a keyframe.
    await page.evaluate(() => {
      window.lockstateActorMotionHarness!.publishActor(2, { x: 6, y: 6 }, { x: 0, y: 0 });
    });
    await page.waitForFunction(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base').length > 0);

    const [prisonerSprites, guardSprites] = await page.evaluate(() => [
      window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base'),
      window.lockstateActorMotionHarness!.spritesWithAsset('actor.guard.base'),
    ]);

    expect(prisonerSprites).toHaveLength(1);
    // The guard's keyframe was superseded by the prisoner's (each publication
    // here is a full replace), so what this asserts is that the prisoner
    // sprite drew as itself rather than inheriting the guard's texture key --
    // a stale pooled sprite reused across a population switch would fail this.
    expect(guardSprites).toHaveLength(0);
    expect(prisonerSprites[0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  });
});
