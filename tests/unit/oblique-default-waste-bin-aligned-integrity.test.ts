import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { obliqueAssetIdForObject, obliqueAssetIdForPlacedObject, obliqueCatalogForObject } from '../../src/rendering/assets/oblique-object-mapping';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const sourceHash = (bytes: Buffer): string => {
  const pointer = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([0-9a-f]{64})\r?\n/m.exec(bytes.toString('utf8'));
  return pointer?.[1] ?? hash(bytes);
};
const json = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

it('routes the existing default bin through the aligned source without changing the Yard override', () => {
  const assetId = obliqueAssetIdForObject('object.waste-bin');
  expect(assetId).toBe('fixture.cell.waste_bin');
  const registry = parseObliqueModuleRegistry(json('public/game-content/oblique-module-registry.v1.json'));
  const descriptor = registry.entries.find(entry => entry.assetId === assetId)!;
  expect(descriptor.manifest).toBe('/game-content/oblique-fixture-cell-waste-bin.v1.json');
  const catalog = parseObliqueModuleCatalog(json(`public${descriptor.manifest}`));
  expect(obliqueCatalogForObject('object.waste-bin', new Map([[catalog.assetId, catalog]]))).toBe(catalog);
  expect(defaultObjectRegistry.getById('object.waste-bin')!.footprint).toEqual({ width: 1, height: 1 });
  expect(obliqueAssetIdForPlacedObject('object.waste-bin', 1, 1, { width: 1, height: 1 }, [
    { instanceId: 'yard', roomCatalogId: 'room.yard', anchorTileX: 0, anchorTileY: 0, width: 4, height: 4 },
  ])).toBe('fixture.yard.steel-waste-bin');
});

it('retains the twelve meshes and five original materials and decodes all shared-camera frames', () => {
  const provenance = json('assets/source/blender/fixture.cell.waste_bin.angled.provenance.json') as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    footprintTiles: number[]; sourceAlignmentTranslation: number[]; maximumRigidVertexError: number;
    originalMeshes: { name: string; evaluatedVertices: number; modifiers: string[]; materials: string[] }[];
    meshes: { name: string; evaluatedVertices: number; modifiers: string[]; materials: string[] }[];
    materials: { name: string; diffuseRGBA: number[] }[];
  };
  expect(sourceHash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('acac99dd51895f561f0b25b1e7453c0290141ed6c7953f123575b2cb8bb95963');
  expect(sourceHash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.sourceSha256).toBe('ff8f91f62e67ad69293c0560849664524a5e7cd34824137171f5cb3d740376c3');
  expect(provenance.meshes).toHaveLength(12);
  expect(provenance.meshes.map(({ name, evaluatedVertices, modifiers, materials }) => ({ name, evaluatedVertices, modifiers, materials })))
    .toEqual(provenance.originalMeshes.map(({ name, evaluatedVertices, modifiers, materials }) => ({ name, evaluatedVertices, modifiers, materials })));
  expect(provenance.meshes.map(mesh => mesh.name)).toContain('pedal');
  expect(provenance.materials.map(material => material.name)).toEqual(['waste bin cavity', 'waste bin edge', 'waste bin enamel', 'waste bin label', 'waste bin pedal']);
  expect(provenance.sourceAlignmentTranslation).toEqual([0, -.057499974966049194, 0]);
  expect(provenance.maximumRigidVertexError).toBeLessThan(1e-6);
  expect(provenance.footprintTiles).toEqual([1, 1]);
  const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-fixture-cell-waste-bin.v1.json'));
  expect(catalog.assetId).toBe('fixture.cell.waste_bin');
  expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.cameraTargetTiles).toEqual([.5, .5, .46700000762939453]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.pivotPx).toEqual([128, 128]);
  expect(catalog.frames).toHaveLength(72);
  expect(new Set(catalog.frames.map(frame => frame.image)).size).toBe(72);
  for (const frame of catalog.frames) {
    const png = readFileSync(new URL(`public${frame.image}`, root));
    expect(hash(png), frame.image).toBe(frame.sha256);
    expect(png.subarray(0, 8), frame.image).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
    expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
    expect(hasTransparentBorder(png), frame.image).toBe(true);
  }
});

function hasTransparentBorder(png: Buffer): boolean {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(compressed));
  const stride = width * 4 + 1;
  if (pixels.length !== stride * height) return false;
  for (let y = 0; y < height; y++) {
    if (pixels[y * stride] !== 0) return false;
    for (let x = 0; x < width; x++) {
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && pixels[y * stride + 1 + x * 4 + 3] !== 0) return false;
    }
  }
  return true;
}
