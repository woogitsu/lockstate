import { readFileSync } from 'node:fs';
import { expect, test } from './network-changed-fixture';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope } from '../../src/persistence/save-schema';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';

function savedActorsFacingNorthAndEast() {
  const runtime = createNewSimulationRuntime(73);
  runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 900, priorIncidents: 0 },
    { x: tileCoordinate(12), y: tileCoordinate(16) });
  expect(runtime.prisoners.locomotion.beginWalk(0, [
    { x: tileCoordinate(12), y: tileCoordinate(16) },
    { x: tileCoordinate(12), y: tileCoordinate(15) },
  ])).toBe(false);
  const guard = runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(20), y: tileCoordinate(16) });
  expect(runtime.securityGuards.locomotion.beginWalk(guard, [
    { x: tileCoordinate(20), y: tileCoordinate(16) },
    { x: tileCoordinate(21), y: tileCoordinate(16) },
  ])).toBe(false);
  runtime.securityGuards.locomotion.cancelWalk(guard); // saved standing direction still faces east

  const restored = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  const bundle = captureSessionSnapshot(restored);
  expect(bundle.simulation?.inFlight?.prisoners.locomotion.headings).toContainEqual([0, 0, -1]);
  expect(bundle.simulation?.inFlight?.guards.locomotion.headings).toContainEqual([guard, 1, 0]);
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'paused-authored-facing', revision: 1,
    createdAt: 1700000000000, updatedAt: 1700000000001,
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
}

function expectedFrame(catalogName: 'prisoner' | 'guard', worldHeadingDegrees: number): string {
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(
    new URL(`../../public/game-content/oblique-actor-${catalogName}.v1.json`, import.meta.url), 'utf8')));
  return selectObliqueModuleFrame(catalog, {
    yawRadians: (-45 - worldHeadingDegrees) * Math.PI / 180,
    elevationRadians: Math.PI / 4,
  }).image;
}

test('paused production Save/Load paints saved prisoner and guard headings with authored PNGs', async ({ page }, testInfo) => {
  const save = savedActorsFacingNorthAndEast();
  const prisonerFrame = expectedFrame('prisoner', 180);
  const guardFrame = expectedFrame('guard', 90);
  expect(prisonerFrame).not.toContain('yaw-45-elev45');
  expect(guardFrame).not.toContain('yaw-45-elev45');
  const loadedFrames = new Set<string>();
  page.on('response', response => {
    if (response.ok() && (response.url().includes(prisonerFrame) || response.url().includes(guardFrame))) {
      loadedFrames.add(new URL(response.url()).pathname);
    }
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const before = await page.locator('#game-root canvas').screenshot();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles({ name: 'paused-authored-facing.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
  await expect(page.locator('.save-panel__item')).toHaveCount(1);
  await page.locator('.save-panel__item').getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect.poll(() => loadedFrames.has(prisonerFrame) && loadedFrames.has(guardFrame)).toBe(true);
  const after = await page.locator('#game-root canvas').screenshot();
  expect(after.equals(before), 'saved actors must paint on the actual production canvas').toBe(false);
  await page.screenshot({ path: testInfo.outputPath('paused-saved-headings-fullhd.png') });
});
