import { expect, test } from './network-changed-fixture';

test('draws the buildable utility panel in the real WorldScene at Full HD game zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/environment-art-harness.html?utilityFloor=1');
  await page.evaluate(async () => {
    await window.lockstateEnvironmentArtHarness!.ready;
    await window.lockstateEnvironmentArtHarness!.artLoaded;
  });
  await page.evaluate(async () =>
    window.lockstateEnvironmentArtHarness!.centreCameraOn(23 * 64, 25 * 64, 1));
  const sprites = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites());
  expect(sprites.some((sprite) => sprite.frameName === 'env.object.utility-panel')).toBe(true);
  if (process.env['LOCKSTATE_CAPTURE_ART_EVIDENCE'] === '1') {
    const phase = process.env['LOCKSTATE_ART_EVIDENCE_PHASE'] === 'before' ? 'before' : 'after';
    await page.screenshot({ path: `assets/rendered/evidence/utility-panel-room-${phase}-1920x1080.png` });
    await page.evaluate(async () =>
      window.lockstateEnvironmentArtHarness!.centreCameraOn(23 * 64, 25 * 64, 3));
    await page.screenshot({ path: `assets/rendered/evidence/utility-panel-room-${phase}-zoom3-1920x1080.png` });
  }
});
