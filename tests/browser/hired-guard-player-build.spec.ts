import { writeFile } from 'node:fs/promises';
import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands, showPanel } from './playtest-harness';
import { centreGuard, guardSnapshot, installGuardWorkerProbe, observeGuardImages,
  requireGenuineGuard, visibleGuardBodyPixels, GUARD_REAR_FRAME, GUARD_SOURCE_SHA, GUARD_INITIAL_FRAME } from './hired-guard-evidence';

// Preparation only: currently collected on the source server. Root may route
// this unchanged public-only fixture through the production artifact config.
test.use({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

test('a publicly hired Guard keeps actual identity and visible authored body through paused Save/Load', async ({ page }, info) => {
  await installTee(page);
  await installGuardWorkerProbe(page);
  const loadedImages = await observeGuardImages(page);
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const empty = await guardSnapshot(page);
  expect(empty.simulation?.security.guards.records).toEqual([]);
  const centredBefore = await centreGuard(page, empty);
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  // The real catalog's initial pose has decoded before the empty-world control.
  await expect.poll(async () => (await loadedImages()).images.some(image =>
    image.sha256 === GUARD_INITIAL_FRAME.sha256 && image.complete && !image.error && image.width === 512 && image.height === 512)).toBe(true);
  const emptyCanvas = await canvas.screenshot({ path: info.outputPath('guard-empty-world-control-canvas.png') });

  await showPanel(page, 'manage', '.hud-staff');
  await page.locator('.hud-staff [data-staff-role="staff-role.guard"]').click();
  await page.locator('.hud-staff__hire').click();
  await expect(page.locator('[data-metric="staff"] .ui-stat__value')).toHaveText('1');
  await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'HireStaff')).toEqual([
    { type: 'HireStaff', staffRoleId: 'staff-role.guard', x: 16, y: 16 },
  ]);
  const pausedBefore = await guardSnapshot(page);
  const genuineBefore = requireGenuineGuard(pausedBefore);
  expect(pausedBefore.world).toEqual(empty.world);
  expect(pausedBefore.construction).toEqual(empty.construction);
  await centreGuard(page, pausedBefore);
  let visibleBefore = 0;
  await expect.poll(async () => {
    visibleBefore = visibleGuardBodyPixels(await canvas.screenshot(), emptyCanvas);
    return visibleBefore;
  }, { message: 'the genuinely hired Guard must draw the original >100 body-pixel control' }).toBeGreaterThan(100);
  await canvas.screenshot({ path: info.outputPath('hired-guard-before-save-canvas.png') });
  await page.screenshot({ path: info.outputPath('hired-guard-before-save-fullhd.png') });
  const pngBeforeSave = await loadedImages();
  expect(pngBeforeSave.responses).toContainEqual(expect.objectContaining({
    status: 200, sha256: GUARD_INITIAL_FRAME.sha256, width: 512, height: 512,
    url: expect.stringContaining(GUARD_INITIAL_FRAME.url),
  }));

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.locator('[data-metric="staff"] .ui-stat__value')).toHaveText('1');
  const pausedAfter = await guardSnapshot(page);
  expect(pausedAfter).toEqual(pausedBefore);
  const genuineAfter = requireGenuineGuard(pausedAfter);
  expect(genuineAfter).toEqual(genuineBefore);
  const centredAfter = await centreGuard(page, pausedAfter); // Load may reframe the renderer.
  let visibleAfter = 0;
  await expect.poll(async () => {
    visibleAfter = visibleGuardBodyPixels(await canvas.screenshot(), emptyCanvas);
    return visibleAfter;
  }).toBeGreaterThan(100);
  await page.screenshot({ path: info.outputPath('hired-guard-loaded-fullhd.png') });

  // The newly allocated guard has never walked: default south heading=0.
  // Real public 15-degree steps: camera -45 -9*15 = -180, elevation stays45.
  // No zoom/scale change. These expected inputs do not expose a private bound pose.
  for (let index = 0; index < 9; index++) {
    await page.getByRole('button', { name: 'Rotate camera left', exact: true }).click();
  }
  await expect.poll(async () => (await loadedImages()).responses.some(response =>
    new URL(response.url).pathname === GUARD_REAR_FRAME.url && response.sha256 === GUARD_REAR_FRAME.sha256)).toBe(true);
  await expect.poll(async () => (await loadedImages()).images.some(image =>
    image.sha256 === GUARD_REAR_FRAME.sha256 && image.sha256 === GUARD_INITIAL_FRAME.sha256 && image.complete && !image.error && image.width === 512 && image.height === 512)).toBe(true);
  const pngLoading = await loadedImages();
  expect(pngLoading.errors).toEqual([]);
  expect(pngLoading.descriptors).toContainEqual(expect.objectContaining({ status: 200,
    data: expect.objectContaining({ assetId: 'actor.guard.base',
      sourceSha256: GUARD_SOURCE_SHA,
      resolutionPx: [512, 512], pivotPx: [256, 256], cameraTargetTiles: [0, 0, 0], nominalPixelsPerTile: 64,
      frames: expect.arrayContaining([expect.objectContaining({ yawDegrees: -180, elevationDegrees: 45,
        image: GUARD_REAR_FRAME.url, sha256: GUARD_REAR_FRAME.sha256 })]),
    }),
  }));
  const actualLoadedFrame = pngLoading.responses.find(response => new URL(response.url).pathname === GUARD_REAR_FRAME.url);
  expect(actualLoadedFrame).toMatchObject({ status: 200, sha256: GUARD_REAR_FRAME.sha256, width: 512, height: 512 });
  const rearPoseWorker = await guardSnapshot(page);
  expect(rearPoseWorker).toEqual(pausedAfter);
  await page.mouse.move(1300, 700);
  await page.screenshot({ path: info.outputPath('hired-guard-rear-band-pending-calibration-fullhd.png') });
  const receipt = info.outputPath('hired-guard-worker-save-and-loader-evidence.json');
  await writeFile(receipt, JSON.stringify({ subject: 'genuine public HireStaff, no injected actor feed',
    empty, pausedBefore, pausedAfter, rearPoseWorker, genuineBefore, genuineAfter,
    centredBefore, centredAfter, visibleBefore, visibleAfter, pngBeforeSave, pngLoading, actualLoadedFrame,
    expectedCameraInputs: { initialYaw: -45, rotateLeftClicks: 9, yawStep: 15, finalYaw: -180, elevation: 45, zoom: 1.25 },
    expectedAuthoredPose: { yaw: -180, elevation: 45 },
    boundTextureKeyObserved: false, nativePoseObserved: false, rearBandPixelCalibrationPending: true,
    loaderLimitation: 'Actual decoded PNG may be preloaded; network/HTMLImage evidence does not identify a private actor-bound texture.',
  }, null, 2));
  await info.attach('actual public Guard worker and loader evidence', { path: receipt, contentType: 'application/json' });
});