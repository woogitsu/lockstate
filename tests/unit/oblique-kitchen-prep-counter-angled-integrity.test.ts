import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('retains the original prep-counter assembly/materials and registers dedicated physical details under the existing identity', () => {
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.kitchen.prep-counter.angled.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    originalMeshCount: number; originalMeshNames: string[]; addedMeshNames: string[];
    retainedAssemblyFit: number[]; retainedMaximumCoordinateError: number;
    footprintTiles: number[]; cameraTargetTiles: number[];
    meshes: { name: string; evaluatedVertices: number; materials: [string, number[]][] }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('a82cc835b2225a9a4ef6c113d2d887365e5f6b6d92933f0f0b234e5f28e47d00');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.originalMeshCount).toBe(24);
  expect(provenance.originalMeshNames).toHaveLength(24);
  expect(provenance.addedMeshNames).toHaveLength(54);
  expect(provenance.meshes).toHaveLength(78);
  expect(new Set(provenance.meshes.map(mesh => mesh.name)).size).toBe(78);
  expect(provenance.retainedAssemblyFit).toEqual([0.9, 0.9, 1]);
  expect(provenance.retainedMaximumCoordinateError).toBeLessThan(1e-6);
  const faucet = provenance.meshes.find(mesh => mesh.name === 'angled-prep.curved faucet');
  expect(faucet?.evaluatedVertices).toBe(336);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-prep.pan rim'))).toHaveLength(12);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-prep.drawer edge'))).toHaveLength(16);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-prep.handle standoff'))).toHaveLength(8);
  expect(provenance.addedMeshNames).toContain('angled-prep.service shelf');
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-prep.shelf bracket'))).toHaveLength(4);
  const originalMaterials = new Set(provenance.meshes.filter(mesh => provenance.originalMeshNames.includes(mesh.name))
    .flatMap(mesh => mesh.materials.map(material => JSON.stringify(material))));
  expect(originalMaterials.size).toBe(6);
  for (const mesh of provenance.meshes.filter(mesh => provenance.addedMeshNames.includes(mesh.name))) {
    expect(mesh.materials.every(material => originalMaterials.has(JSON.stringify(material)))).toBe(true);
  }
  expect(defaultObjectRegistry.getById('object.prep-counter')!.footprint).toEqual({ width: 2, height: 1 });
  expect(provenance.footprintTiles).toEqual([2, 1]);
  expect(obliqueAssetIdForObject('object.prep-counter')).toBe('furniture.kitchen.prep-counter.variants');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-furniture.kitchen-prep-counter.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('furniture.kitchen.prep-counter.variants');
  expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.cameraTargetTiles).toEqual(provenance.cameraTargetTiles);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.pivotPx).toEqual([128, 128]);
  expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    const png = readFileSync(new URL(`public${frame.image}`, root));
    expect(hash(png), frame.image).toBe(frame.sha256);
    expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
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
