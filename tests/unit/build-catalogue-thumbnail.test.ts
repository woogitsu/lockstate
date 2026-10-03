import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildCatalogueThumbnail } from '../../src/rendering/assets/build-catalogue-thumbnail';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const station = parseObliqueModuleCatalog(JSON.parse(readFileSync('public/game-content/oblique-furniture.yard-exercise-station.v1.json', 'utf8')));
it('publishes a real authored angled exercise-station frame rather than a fabricated path', () => {
  const url = buildCatalogueThumbnail('object.exercise-station', new Map([[station.assetId, station]]));
  expect(url).toBeDefined();
  expect(station.frames.map(frame => frame.image)).toContain(url);
  const frame = station.frames.find(frame => frame.image === url)!;
  expect(frame.yawDegrees).toBe(30);
  expect(frame.elevationDegrees).toBe(40);
});
it('leaves structural, unsupported and unloaded objects on the existing explicit icon fallback', () => {
  for (const id of [undefined, 'object.unknown', 'object.bench']) {
    expect(buildCatalogueThumbnail(id, new Map([[station.assetId, station]]))).toBeUndefined();
  }
});
