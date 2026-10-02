import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const content = new URL('../../public/game-content/', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, content), 'utf8').replace(/^\uFEFF/, '')) as unknown;

describe('square brick wall art for normal and cutaway camera poses', () => {
  const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));

  it.each(['full', 'low'] as const)('registers a complete 72-frame %s Blender catalog', (kind) => {
    const id = `wall.square.brick.${kind}`;
    const entry = registry.entries.find((candidate) => candidate.assetId === id);
    expect(entry).toBeDefined();
    const catalog = parseObliqueModuleCatalog(readJson(entry!.manifest.slice('/game-content/'.length)));
    expect(catalog.assetId).toBe(id);
    expect(catalog.source).toBe(`${id}.blend`);
    expect(catalog.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(catalog.resolutionPx).toEqual([512, 512]);
    expect(catalog.pivotPx).toEqual([256, 256]);
    expect(catalog.yawDegrees).toEqual(Array.from({ length: 24 }, (_, i) => -180 + i * 15));
    expect(catalog.elevationDegrees).toEqual([25, 45, 65]);
    expect(catalog.frames).toHaveLength(72);
  });
});
