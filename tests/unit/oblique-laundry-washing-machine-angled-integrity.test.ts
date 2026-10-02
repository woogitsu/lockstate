import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('retains the original washing-machine assembly/materials and registers dedicated physical details under the existing identity', () => {
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/utility.washing-machine.angled.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    originalMeshCount: number; originalMeshNames: string[]; addedMeshNames: string[];
    retainedAssemblyFit: number[]; retainedMaximumCoordinateError: number;
    footprintTiles: number[]; cameraTargetTiles: number[];
    meshes: { name: string; evaluatedVertices: number; materials: [string, number[]][] }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('fb4eccefc3809342b57e4b15822e68ee1a1d0060bc8d75acda288d07284f7e0b');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.originalMeshCount).toBe(14);
  expect(provenance.originalMeshNames).toHaveLength(14);
  expect(provenance.addedMeshNames).toHaveLength(66);
  expect(provenance.meshes).toHaveLength(80);
  expect(new Set(provenance.meshes.map(mesh => mesh.name)).size).toBe(80);
  expect(provenance.retainedAssemblyFit).toEqual([1, 0.8, 1]);
  expect(provenance.retainedMaximumCoordinateError).toBeLessThan(1e-6);
  const rim = provenance.meshes.find(mesh => mesh.name === 'angled-washer.door machined rim');
  expect(rim?.evaluatedVertices).toBe(768);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-washer.door fastener'))).toHaveLength(8);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-washer.side vent louvre'))).toHaveLength(14);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-washer.side vent recess'))).toHaveLength(14);
  expect(provenance.addedMeshNames).toContain('angled-washer.detergent drawer grip');
  expect(provenance.addedMeshNames).toContain('angled-washer.service grip');
  const originalMaterials = new Set(provenance.meshes.filter(mesh => provenance.originalMeshNames.includes(mesh.name))
    .flatMap(mesh => mesh.materials.map(material => JSON.stringify(material))));
  expect(originalMaterials.size).toBe(5);
  for (const mesh of provenance.meshes.filter(mesh => provenance.addedMeshNames.includes(mesh.name))) {
    expect(mesh.materials.every(material => originalMaterials.has(JSON.stringify(material)))).toBe(true);
  }
  expect(defaultObjectRegistry.getById('object.washing-machine')!.footprint).toEqual({ width: 2, height: 1 });
  expect(provenance.footprintTiles).toEqual([2, 1]);
  expect(obliqueAssetIdForObject('object.washing-machine')).toBe('utility.washing-machine.variants');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-utility.washing-machine.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('utility.washing-machine.variants');
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
