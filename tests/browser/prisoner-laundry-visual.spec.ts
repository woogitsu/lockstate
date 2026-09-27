import { expect, test } from './network-changed-fixture';

test('animates laundry study from the worker delta and restores the calm prisoner afterwards', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/actor-motion-harness.html');
  await page.evaluate(async () => window.lockstateActorMotionHarness!.ready);
  await page.evaluate(() => window.lockstateActorMotionHarness!.publishLaundryPair(1, true));
  await page.waitForFunction(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.laundry').length === 1);
  expect(await page.evaluate(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base'))).toHaveLength(1);
  const before = await page.evaluate(() => window.lockstateActorMotionHarness!.framesWithAsset('actor.prisoner.laundry'));
  await page.waitForFunction((frames) => {
    const current = window.lockstateActorMotionHarness!.framesWithAsset('actor.prisoner.laundry');
    return current.length === 1 && current[0] !== frames[0];
  }, before);
  expect(await page.evaluate(() => window.lockstateActorMotionHarness!.unresolvedActorCount())).toBe(0);
  await page.evaluate(() => window.lockstateActorMotionHarness!.publishLaundryPair(2, false));
  await page.waitForFunction(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base').length === 2);
  expect(await page.evaluate(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.laundry'))).toHaveLength(0);
});

test('shows the open workbook beside a calm prisoner in a furnished Full HD Laundry', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/environment-art-harness.html?laundryFloor=1&prisonerLaundryVisual=1');
  await page.evaluate(async () => {
    await window.lockstateEnvironmentArtHarness!.ready;
    await window.lockstateEnvironmentArtHarness!.artLoaded;
  });
  await page.evaluate(async () => window.lockstateEnvironmentArtHarness!.centreCameraOn(19 * 64, 13 * 64, 1));
  await page.waitForFunction(() => window.lockstateEnvironmentArtHarness!.actorFrames('actor.prisoner.laundry').length === 1);
  expect(await page.evaluate(() => window.lockstateEnvironmentArtHarness!.actorFrames('actor.prisoner.base'))).toHaveLength(1);
  expect(await page.evaluate(() => window.lockstateEnvironmentArtHarness!.errors())).toEqual([]);
  if (process.env['LOCKSTATE_CAPTURE_ART_EVIDENCE'] === '1') {
    await page.waitForFunction(() => window.lockstateEnvironmentArtHarness!.actorFrames('actor.prisoner.laundry')[0] === 'fold:south:1');
    await page.screenshot({ path: 'assets/rendered/evidence/prisoner-laundry-default-zoom-1920x1080.png' });
    await page.evaluate(async () => window.lockstateEnvironmentArtHarness!.centreCameraOn(19 * 64, 13 * 64, 3));
    await page.waitForFunction(() => window.lockstateEnvironmentArtHarness!.actorFrames('actor.prisoner.laundry')[0] === 'fold:south:1');
    await page.screenshot({ path: 'assets/rendered/evidence/prisoner-laundry-zoom3-1920x1080.png' });
  }
});

