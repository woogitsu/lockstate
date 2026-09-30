import { expect, test } from './network-changed-fixture';

test('draws two buildable waste bins in the real Staff Room at Full HD game zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/environment-art-harness.html?staffFloor=1');
  await page.evaluate(async () => {
    await window.lockstateEnvironmentArtHarness!.ready;
    await window.lockstateEnvironmentArtHarness!.artLoaded;
  });
  await page.evaluate(async () =>
    window.lockstateEnvironmentArtHarness!.centreCameraOn(29 * 64, 25 * 64, 1));
  const sprites = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites());
  expect(sprites.filter((sprite) => sprite.frameName === 'env.object.waste-bin')).toHaveLength(2);
  if (process.env['LOCKSTATE_CAPTURE_ART_EVIDENCE'] === '1') {
    const phase = process.env['LOCKSTATE_ART_EVIDENCE_PHASE'] === 'before' ? 'before' : 'after';
    await page.screenshot({ path: `assets/rendered/evidence/waste-bin-room-${phase}-1920x1080.png` });
    await page.evaluate(async () =>
      window.lockstateEnvironmentArtHarness!.centreCameraOn(29 * 64, 25 * 64, 3));
    await page.screenshot({ path: `assets/rendered/evidence/waste-bin-room-${phase}-zoom3-1920x1080.png` });
  }
});
