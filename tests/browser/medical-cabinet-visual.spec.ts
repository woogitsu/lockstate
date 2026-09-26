import { expect, test } from './network-changed-fixture';

test('draws the buildable medicine cabinet in the real WorldScene at Full HD game zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/environment-art-harness.html?infirmaryFloor=1');
  await page.evaluate(async () => {
    await window.lockstateEnvironmentArtHarness!.ready;
    await window.lockstateEnvironmentArtHarness!.artLoaded;
  });
  await page.evaluate(async () =>
    window.lockstateEnvironmentArtHarness!.centreCameraOn(19 * 64, 19 * 64, 1));
  const sprites = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites());
  expect(sprites.some((sprite) => sprite.frameName === 'env.object.medicine-cabinet'))
    .toBe(true);
  if (process.env['LOCKSTATE_CAPTURE_ART_EVIDENCE'] === '1') {
    await page.screenshot({ path: 'assets/rendered/evidence/medicine-cabinet-after-1920x1080.png' });
  }
});
