import { expect, test } from '@playwright/test';
import type { LockstateActorMotionHarness } from './actor-motion-harness-api';

/**
 * **A moving actor's rendered position changes between frames, not merely
 * between publications** -- issue #414's own required verification, and the one
 * claim in this branch that `pnpm test` cannot make.
 *
 * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so a Phaser
 * display object does not exist there. The feed's arithmetic is covered
 * headlessly and thoroughly (`tests/unit/actor-extrapolation.test.ts`,
 * `tests/unit/rendering-feed.test.ts`); what those cannot see is whether the
 * number reaches a sprite. This does, by reading the sprite off the scene's own
 * display list.
 *
 * Requires the git-LFS actor atlases: an actor whose art is missing is counted
 * `unresolved` by `ActorLayer` and never drawn, so without them every
 * assertion here would be satisfied by an empty list. `bash
 * scripts/provision-git-lfs.sh && git lfs pull` is the precondition.
 */

declare global {
  interface Window {
    lockstateActorMotionHarness?: LockstateActorMotionHarness;
  }
}

const HARNESS = '/tests/browser/actor-motion-harness.html';

/**
 * Samples taken after the scene has drawn the message that was just published.
 *
 * The harness samples on `requestAnimationFrame` and Phaser draws on its own
 * loop, so the first frame or two after a publication can be read *before* the
 * scene's update has applied it -- which shows up as one stale reading at the
 * head of the buffer and has nothing to do with what is under test. Dropping a
 * fixed two is honest about that; the assertions below all read several frames
 * and would fail if the whole buffer were stale.
 */
const settled = (samples: readonly { readonly x: number; readonly y: number }[]): readonly { readonly x: number; readonly y: number }[] =>
  samples.slice(2);

async function waitForFrames(page: import('@playwright/test').Page, count: number): Promise<void> {
  const from = await page.evaluate(() => window.lockstateActorMotionHarness!.framesDrawn());
  await page.waitForFunction(
    ([start, wanted]) => window.lockstateActorMotionHarness!.framesDrawn() >= start + wanted,
    [from, count] as const,
  );
}

test.describe('the renderer draws a walking actor moving', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await page.evaluate(async () => {
      await window.lockstateActorMotionHarness!.ready;
    });
  });

  test('draws more distinct positions than there were publications (#414)', async ({ page }) => {
    /*
     * **The assertion the defect fails, in the one form that is honest on a
     * loaded machine.**
     *
     * The straightforward version -- publish once, watch several frames, expect
     * the sprite to be somewhere new on each -- is frame-rate dependent twice
     * over: `MAX_ACTOR_EXTRAPOLATION_SECONDS` bounds how long the advance runs,
     * so on a machine slow enough that two frames span a quarter of a second
     * every sample lands on the clamp and reports the same pixel. That version
     * was written first and failed exactly once, inside a full-suite run, after
     * passing alone three times.
     *
     * So the harness publishes on a **frame** cadence instead -- one message
     * every six drawn frames, at a position derived from the wall clock as a
     * worker's would be. The ratio of publications to frames is then fixed
     * whatever the frame rate is, and the claim #414 asks for can be stated as
     * a comparison between two counts the run produces itself: the sprite took
     * more distinct positions than there were messages telling it where to be.
     * Before ADR 0059 those two numbers were equal by construction.
     */
    await page.evaluate(() => {
      window.lockstateActorMotionHarness!.resetSamples();
      window.lockstateActorMotionHarness!.startWalking({ tilesPerSecond: 10, framesPerPublication: 6 });
    });
    await waitForFrames(page, 30);
    const { samples, publications } = await page.evaluate(() => {
      window.lockstateActorMotionHarness!.stopWalking();
      return {
        samples: window.lockstateActorMotionHarness!.motionSamples(),
        publications: window.lockstateActorMotionHarness!.publicationCount(),
      };
    });

    const drawn = settled(samples);
    expect(drawn.length, 'no actor sprite was drawn at all -- are the git-LFS atlases pulled?').toBeGreaterThan(10);
    expect(publications, 'nothing was published, so there is nothing for the renderer to have improved on').toBeGreaterThan(2);

    const distinct = new Set(drawn.map((sample) => sample.x));
    expect(
      distinct.size,
      'the sprite took no more positions than it was sent, which is what a renderer that only moves on a publication does',
    ).toBeGreaterThan(publications);

    /*
     * Never off the other axis, and never *far* backwards on this one.
     *
     * Strict monotonicity would be the wrong assertion and it was tried: a
     * publication is a **correction**, and where the renderer's advance had run
     * a little ahead of where the simulation actually got to, taking the
     * correction moves the sprite back a few pixels. That is the behaviour the
     * third case in this file exists to require. What must not happen is a
     * lurch, so the bound is one tile -- `TILE_SIZE_PX` is 64.
     */
    for (const [index, sample] of drawn.entries()) {
      if (index === 0) continue;
      expect(sample.x, 'the sprite jumped backwards by more than a tile').toBeGreaterThan(drawn[index - 1]!.x - 64);
      expect(sample.y).toBeCloseTo(drawn[0]!.y, 5);
    }
    expect(drawn.at(-1)!.x, 'the sprite ended no further east than it started').toBeGreaterThan(drawn[0]!.x);
  });

  test('stops the sprite where it stands when the clock pauses', async ({ page }) => {
    await page.evaluate(() => {
      window.lockstateActorMotionHarness!.publishActor(10, { x: 6, y: 6 }, { x: 5, y: 0 });
    });
    await waitForFrames(page, 4);

    await page.evaluate(() => {
      window.lockstateActorMotionHarness!.publishClock(10, 'paused');
      window.lockstateActorMotionHarness!.resetSamples();
    });
    await waitForFrames(page, 8);

    // A paused worker publishes nothing, so a velocity from the last running
    // publication would otherwise carry the sprite on for a quarter of a
    // second after the player pressed pause.
    const samples = settled(await page.evaluate(() => window.lockstateActorMotionHarness!.motionSamples()));
    expect(samples.length).toBeGreaterThan(3);
    expect(new Set(samples.map((sample) => sample.x)).size, 'the sprite kept moving after the clock paused').toBe(1);
  });

  test('takes the next publication as the correction rather than accumulating its own idea of where the actor is', async ({ page }) => {
    await page.evaluate(() => {
      window.lockstateActorMotionHarness!.resetSamples();
      window.lockstateActorMotionHarness!.publishActor(10, { x: 6, y: 6 }, { x: 5, y: 0 });
    });
    await waitForFrames(page, 8);
    const drifted = settled(await page.evaluate(() => window.lockstateActorMotionHarness!.motionSamples())).at(-1)!;

    // A publication that puts the actor *behind* where the renderer had drawn
    // it: the renderer must take it, because the simulation is the authority
    // and the advance is only a guess about the gap.
    await page.evaluate(() => {
      window.lockstateActorMotionHarness!.resetSamples();
      window.lockstateActorMotionHarness!.publishActor(12, { x: 5, y: 6 }, { x: 0, y: 0 });
    });
    await waitForFrames(page, 10);
    const corrected = settled(await page.evaluate(() => window.lockstateActorMotionHarness!.motionSamples()));

    expect(corrected[0]!.x).toBeLessThan(drifted.x);
    // And with no velocity published, it stays there rather than carrying on.
    expect(new Set(corrected.map((sample) => sample.x)).size).toBe(1);
  });
});
