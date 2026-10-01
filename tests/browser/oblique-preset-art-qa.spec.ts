import { expect, test } from './network-changed-fixture';
import type {} from './oblique-preset-art-qa';
import { instantiateRoomTemplate, ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { catalogueObjectId } from '../../src/rendering/world/structures';
import { obliqueCanonicalAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';

const templateObjects = new Set(ROOM_TEMPLATE_IDS.flatMap((id) =>
  instantiateRoomTemplate(id, { x: 4, y: 4 }).objects.map((object) => object.buildableId)));
test('all 19 fixture types in the room catalog have canonical Blender mappings', () => {
  expect(templateObjects.size).toBe(19);
  for (const id of templateObjects) {
    const logicalId = catalogueObjectId(id);
    expect(logicalId, id).toBeDefined();
    expect(obliqueCanonicalAssetIdForObject(logicalId!), id).toBeDefined();
  }
});

for (const preset of ROOM_TEMPLATE_IDS) {
  test(`${preset} paints every built fixture and square wall with Blender frames at Full HD`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/tests/browser/oblique-preset-art-qa.html?preset=${preset}`);
    await page.evaluate(() => window.lockstatePresetArtQA.ready());
    for (const [yaw, elevation] of [[45, 45], [135, 65], [-45, 25]] as const) {
      await page.evaluate(([yawDegrees, elevationDegrees]: [number, number]) =>
        window.lockstatePresetArtQA.setPose(yawDegrees, elevationDegrees), [yaw, elevation] as [number, number]);
      await expect.poll(() => page.evaluate(() => {
        const report = window.lockstatePresetArtQA.report();
        return report.imageCount === report.projectedSolidCount
          && report.expectedTextureKeys.every((key) => report.loadedTextureKeys.includes(key));
      })).toBe(true);
      const report = await page.evaluate(() => window.lockstatePresetArtQA.report());
      expect(report.zoningNumericIds).toEqual(instantiateRoomTemplate(preset, { x: 4, y: 4 }).zones.map((zone) =>
        defaultRoomContentRegistry.getById(zone.roomId)!.numericId));
      expect(report.missingAssetIds).toEqual([]);
      expect(report.projectedFixtureCount).toBe(report.builtFixtureCount);
      expect(report.imageCount).toBe(report.projectedSolidCount);
      expect(report.fallbackCommands).toBe(0);
      for (const key of report.expectedTextureKeys) expect(report.loadedTextureKeys).toContain(key);
      if ((yaw === 45 && ['classroom-basic', 'kitchen-basic', 'infirmary-basic', 'laundry-basic'].includes(preset))
        || preset === 'kitchen-basic' && yaw === 135) {
        await page.screenshot({ path: testInfo.outputPath(`${preset}-fullhd-yaw${yaw}-elev${elevation}.png`) });
      }
    }
  });
}
