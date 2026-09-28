import { expect, test } from './network-changed-fixture';

test('draws four buildable wooden chairs in the real Classroom at Full HD game zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/environment-art-harness.html?classroomFloor=1');
  await page.evaluate(async () => {
    await window.lockstateEnvironmentArtHarness!.ready;
    await window.lockstateEnvironmentArtHarness!.artLoaded;
  });
  const centre = async (zoom: number) => page.evaluate(async (level) =>
    window.lockstateEnvironmentArtHarness!.centreCameraOn(19.5 * 64, 26.5 * 64, level), zoom);
  await centre(1);
  const sprites = await page.evaluate(() => window.lockstateEnvironmentArtHarness!.tileSprites());
  expect(sprites.filter((sprite) => sprite.frameName === 'env.object.chair')).toHaveLength(4);
  if (process.env['LOCKSTATE_CAPTURE_ART_EVIDENCE'] === '1') {
    const phase = process.env['LOCKSTATE_ART_EVIDENCE_PHASE'] === 'before' ? 'before' : 'after';
    await page.screenshot({ path: `assets/rendered/evidence/chair-classroom-${phase}-1920x1080.png` });
    await centre(3);
    await page.screenshot({ path: `assets/rendered/evidence/chair-classroom-${phase}-zoom3-1920x1080.png` });
  }
});
