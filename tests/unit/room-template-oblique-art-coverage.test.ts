import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { catalogueObjectId } from '../../src/rendering/world/structures';
import { obliqueCanonicalAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const content = new URL('../../public/game-content/', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, content), 'utf8').replace(/^\uFEFF/, ''));
const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));
const fixtures = [...new Set(ROOM_TEMPLATE_IDS.flatMap(id =>
  instantiateRoomTemplate(id, { x: 0, y: 0 }).objects.map(object => object.buildableId)))];

describe('every authored room fixture reaches an oblique Blender catalog', () => {
  it('derives the complete fixture set from all twenty authored plans', () => {
    expect(ROOM_TEMPLATE_IDS).toHaveLength(20);
    expect(fixtures).toHaveLength(19);
  });

  it.each(fixtures)('%s has a mapped, registered, complete pose catalog', buildableId => {
    const objectId = catalogueObjectId(buildableId);
    expect(objectId, buildableId).toBeDefined();
    const assetId = obliqueCanonicalAssetIdForObject(objectId!);
    expect(assetId, `${buildableId} would paint a fallback instead of Blender art`).toBeDefined();
    const entry = registry.entries.find(candidate => candidate.assetId === assetId);
    expect(entry, `${buildableId}: ${assetId} must be in the runtime registry`).toBeDefined();
    const catalog = parseObliqueModuleCatalog(readJson(entry!.manifest.replace('/game-content/', '')));
    expect(catalog.assetId).toBe(assetId);
    expect(catalog.frames).toHaveLength(catalog.yawDegrees.length * catalog.elevationDegrees.length);
    expect(catalog.source).toMatch(/\.blend$/);
  });
});
