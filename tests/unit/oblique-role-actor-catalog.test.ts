import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const content = new URL('../../public/game-content/', import.meta.url);
const publicRoot = new URL('../../public/', import.meta.url);
const sourceRoot = new URL('../../assets/source/blender/', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, content), 'utf8').replace(/^\uFEFF/, '')) as unknown;
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('existing Blender staff actors in the angled catalog', () => {
  const registry = parseObliqueModuleRegistry(readJson('oblique-module-registry.v1.json'));
  const guard = parseObliqueModuleCatalog(readJson('oblique-actor-guard.v1.json'));

  it.each(['cook', 'medic', 'staff'] as const)('registers 72 hashed %s poses at the guard foot pivot', (role) => {
    const assetId = `actor.${role}.base`;
    const entry = registry.entries.find((candidate) => candidate.assetId === assetId);
    expect(entry).toBeDefined();
    const catalog = parseObliqueModuleCatalog(readJson(entry!.manifest.slice('/game-content/'.length)));
    expect(catalog.assetId).toBe(assetId);
    expect(catalog.source).toBe(`${assetId}.blend`);
    expect(catalog.sourceSha256).toBe(sha256(readFileSync(new URL(catalog.source, sourceRoot))));
    expect(catalog.resolutionPx).toEqual(guard.resolutionPx);
    expect(catalog.nominalPixelsPerTile).toBe(guard.nominalPixelsPerTile);
    expect(catalog.pivotPx).toEqual(guard.pivotPx);
    expect(catalog.cameraTargetTiles).toEqual(guard.cameraTargetTiles);
    expect(catalog.yawDegrees).toEqual(guard.yawDegrees);
    expect(catalog.elevationDegrees).toEqual(guard.elevationDegrees);
    expect(catalog.frames).toHaveLength(72);
    for (const frame of catalog.frames) {
      expect(sha256(readFileSync(new URL(frame.image.slice(1), publicRoot))), frame.image).toBe(frame.sha256);
    }
  });
});
