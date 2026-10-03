import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('retains the original stove assembly/materials and registers dedicated physical details under the existing identity', () => {
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.kitchen.stove.angled.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    originalMeshCount: number; originalMeshNames: string[]; addedMeshNames: string[];
    retainedAssemblyFit: number[]; retainedMaximumCoordinateError: number;
    footprintTiles: number[]; cameraTargetTiles: number[];
    meshes: { name: string; evaluatedVertices: number; materials: [string, number[]][] }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('cbf3ed97f84e126ddb309ea55559810ac156d430371dcb9c074e7b7e1c3523d9');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.originalMeshCount).toBe(29);
  expect(provenance.originalMeshNames).toHaveLength(29);
  expect(provenance.addedMeshNames).toHaveLength(51);
  expect(provenance.meshes).toHaveLength(80);
  expect(new Set(provenance.meshes.map(mesh => mesh.name)).size).toBe(80);
  expect(provenance.retainedAssemblyFit).toEqual([0.9, 0.75, 1]);
  expect(provenance.retainedMaximumCoordinateError).toBeLessThan(1e-6);
  for (const prefix of ['angled-stove.burner collar ', 'angled-stove.pot support east-west ', 'angled-stove.pot support north-south ']) {
    expect(provenance.addedMeshNames.filter(name => name.startsWith(prefix))).toHaveLength(4);
  }
  for (const mesh of provenance.meshes.filter(mesh => mesh.name.startsWith('angled-stove.burner collar '))) {
    expect(mesh.evaluatedVertices).toBe(128);
  }
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-stove.side vent louvre '))).toHaveLength(10);
  const originalMaterials = new Set(provenance.meshes.filter(mesh => provenance.originalMeshNames.includes(mesh.name))
    .flatMap(mesh => mesh.materials.map(material => JSON.stringify(material))));
  expect(originalMaterials.size).toBe(6);
  for (const mesh of provenance.meshes.filter(mesh => provenance.addedMeshNames.includes(mesh.name))) {
    expect(mesh.materials.every(material => originalMaterials.has(JSON.stringify(material)))).toBe(true);
  }
  expect(defaultObjectRegistry.getById('object.stove')!.footprint).toEqual({ width: 2, height: 1 });
  expect(provenance.footprintTiles).toEqual([2, 1]);
  expect(obliqueAssetIdForObject('object.stove')).toBe('furniture.kitchen.stove.variants');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-furniture.kitchen-stove.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('furniture.kitchen.stove.variants');
  const physical = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.kitchen.stove.angled-detail.provenance.json', root), 'utf8')) as {
    source: string; sourceSha256: string; originalSource: string; originalSourceSha256: string;
  };
  expect(physical.originalSource).toBe(provenance.source);
  expect(physical.originalSourceSha256).toBe(provenance.sourceSha256);
  expect(hash(readFileSync(new URL(physical.source, root)))).toBe(physical.sourceSha256);
  const soft=JSON.parse(readFileSync(new URL('assets/source/blender/furniture.kitchen.stove.soft-light.provenance.json',root),'utf8')) as {source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string};
  expect(soft.retainedSource).toBe(physical.source);expect(soft.retainedSourceSha256).toBe(physical.sourceSha256);
  expect(catalog.source).toBe(soft.source);
  expect(catalog.sourceSha256).toBe(soft.sourceSha256);
  expect(catalog.sourceSha256).toBe('7ac1027aca308b946acf902ebf611547621227535dc70b29db1c06d3db2d03bb');
  expect(hash(readFileSync(new URL(soft.source,root)))).toBe(catalog.sourceSha256);
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
