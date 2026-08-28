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

  test('moves the sprite between two frames of a single publication (#414)', async ({ page }) => {
    // One publication: an actor on tile (6, 6), walking east at five tiles a
    // second. Nothing else is published for the rest of this test, so anything
    // the sprite does afterwards is the renderer advancing a published position
    // rather than a new message arriving.
    await page.evaluate(() => {
      window.lockstateActorMotionHarness!.resetSamples();
      window.lockstateActorMotionHarness!.publishActor(10, { x: 6, y: 6 }, { x: 5, y: 0 });
    });
    await waitForFrames(page, 8);

    const samples = settled(await page.evaluate(() => window.lockstateActorMotionHarness!.motionSamples()));
    expect(samples.length, 'no actor sprite was drawn at all -- are the git-LFS atlases pulled?').toBeGreaterThan(3);

    /*
     * **The assertion the defect fails.** Before ADR 0059 an actor's position
     * changed only when a publication carried a new one, so every frame of one
     * publication drew the same pixel and this list would hold one value
     * repeated.
     *
     * Sampled in the page rather than by two `page.evaluate` reads, and that is
     * not a convenience: a round trip costs longer than
     * `MAX_ACTOR_EXTRAPOLATION_SECONDS`, so both reads land after the advance
     * has stopped and report the same pixel. The first draft of this file did
     * exactly that and reported `496` twice against a sprite that had in fact
     * moved 80 pixels.
     */
    const distinct = new Set(samples.map((sample) => sample.x));
    expect(distinct.size, 'every frame of one publication drew the sprite at the same x').toBeGreaterThan(2);
    expect(samples.at(-1)!.x, 'the sprite ended no further east than it started').toBeGreaterThan(samples[0]!.x);

    // Never backwards, and never off the other axis: the published velocity is
    // east-only, and a sprite that wandered would be the renderer inventing
    // motion rather than reading it.
    for (const [index, sample] of samples.entries()) {
      if (index === 0) continue;
      expect(sample.x).toBeGreaterThanOrEqual(samples[index - 1]!.x);
      expect(sample.y).toBeCloseTo(samples[0]!.y, 5);
    }
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
