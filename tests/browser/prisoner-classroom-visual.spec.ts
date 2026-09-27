import { expect, test } from './network-changed-fixture';

test('animates classroom study from the worker delta and restores the calm prisoner afterwards', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/actor-motion-harness.html');
  await page.evaluate(async () => window.lockstateActorMotionHarness!.ready);
  await page.evaluate(() => window.lockstateActorMotionHarness!.publishClassroomPair(1, true));
  await page.waitForFunction(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.classroom').length === 1);
  expect(await page.evaluate(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base'))).toHaveLength(1);
  const before = await page.evaluate(() => window.lockstateActorMotionHarness!.framesWithAsset('actor.prisoner.classroom'));
  await page.waitForFunction((frames) => {
    const current = window.lockstateActorMotionHarness!.framesWithAsset('actor.prisoner.classroom');
    return current.length === 1 && current[0] !== frames[0];
  }, before);
  expect(await page.evaluate(() => window.lockstateActorMotionHarness!.unresolvedActorCount())).toBe(0);
  await page.evaluate(() => window.lockstateActorMotionHarness!.publishClassroomPair(2, false));
  await page.waitForFunction(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.base').length === 2);
  expect(await page.evaluate(() => window.lockstateActorMotionHarness!.spritesWithAsset('actor.prisoner.classroom'))).toHaveLength(0);
});

test('shows the open workbook beside a calm prisoner in a furnished Full HD Classroom', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/environment-art-harness.html?classroomFloor=1&prisonerClassroomVisual=1');
  await page.evaluate(async () => {
    await window.lockstateEnvironmentArtHarness!.ready;
    await window.lockstateEnvironmentArtHarness!.artLoaded;
  });
  await page.evaluate(async () => window.lockstateEnvironmentArtHarness!.centreCameraOn(19 * 64, 26 * 64, 1));
  await page.waitForFunction(() => window.lockstateEnvironmentArtHarness!.actorFrames('actor.prisoner.classroom').length === 1);
  expect(await page.evaluate(() => window.lockstateEnvironmentArtHarness!.actorFrames('actor.prisoner.base'))).toHaveLength(1);
  expect(await page.evaluate(() => window.lockstateEnvironmentArtHarness!.errors())).toEqual([]);
  if (process.env['LOCKSTATE_CAPTURE_ART_EVIDENCE'] === '1') {
    await page.waitForFunction(() => window.lockstateEnvironmentArtHarness!.actorFrames('actor.prisoner.classroom')[0] === 'study:south:1');
    await page.screenshot({ path: 'assets/rendered/evidence/prisoner-classroom-default-zoom-1920x1080.png' });
    await page.evaluate(async () => window.lockstateEnvironmentArtHarness!.centreCameraOn(19 * 64, 26 * 64, 3));
    await page.waitForFunction(() => window.lockstateEnvironmentArtHarness!.actorFrames('actor.prisoner.classroom')[0] === 'study:south:1');
    await page.screenshot({ path: 'assets/rendered/evidence/prisoner-classroom-zoom3-1920x1080.png' });
  }
});
