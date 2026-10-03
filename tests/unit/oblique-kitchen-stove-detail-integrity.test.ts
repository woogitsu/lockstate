import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('preserves original Kitchen stove geometry/materials/modifiers and publishes actual actual two-sided grate mounting shoes', () => {
  type Mesh = { name: string; rawVertexBytesSha256: string; rawTopologyBytesSha256: string; polygonMaterialIndicesSha256: string; materials: string[]; modifiers: unknown[] };
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.kitchen.stove.angled-detail.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    actualContactTargets: Record<string,string[]>; actualTriangleInteriorContacts: {shoe:string;retainedTarget:string;actualInteriorWitness:number[];overlappingDepth:number}[];
    sourceEvaluatedBounds: { min: number[]; max: number[] };
    acceptedExportFit: number[]; retainedMeshesCount: number; retainedEvaluatedPointSetMaximumError: number;
    retainedMeshesBefore: Mesh[]; retainedMeshesAfter: Mesh[]; allAuthoredRawMeshes: Mesh[]; retainedMaterialValues: { name: string; canonicalMaterialSha256: string }[];

    evaluatedOutwardNormalAudit: { name: string; evaluatedPolygons: number; minimumOutwardNormalDistance: number; transformDeterminant: number; degenerateFaceIndices: number[]; inwardPolygons: number }[];
    addedMeshNames: string[]; meshes: { name: string; evaluatedVertices: number }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('540c8b22be73848bb1520fae9ffeabfce7711bb0c629161e529b6d6ae33ca5fc');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.sourceSha256).toBe('2a912331e9c20a35ea417c25d371cf89a5f80092c3f066504c7b792cb1a042a2');
  expect(provenance.acceptedExportFit).toEqual([1, 1, 1]);
  expect(provenance.retainedMeshesCount).toBe(80);
  expect(provenance.retainedMeshesBefore).toHaveLength(80);
  expect(provenance.retainedMeshesAfter).toHaveLength(80);
  expect(provenance.retainedEvaluatedPointSetMaximumError).toBeLessThan(1e-6);
  for (const before of provenance.retainedMeshesBefore) {
    const after = provenance.retainedMeshesAfter.find(row => row.name === before.name)!;
    expect(after.rawVertexBytesSha256).toBe(before.rawVertexBytesSha256);
    expect(after.rawTopologyBytesSha256).toBe(before.rawTopologyBytesSha256);
    expect(after.materials).toEqual(before.materials);
    expect(after.polygonMaterialIndicesSha256).toBe(before.polygonMaterialIndicesSha256);
    expect(after.modifiers).toEqual(before.modifiers);
  }
  expect(provenance.retainedMaterialValues).toHaveLength(6);
  expect(provenance.retainedMaterialValues.map(row => row.name).sort()).toEqual(['brushed steel', 'burner glow', 'cast iron', 'enamel', 'oven glass', 'status green']);
  for (const material of provenance.retainedMaterialValues) expect(material.canonicalMaterialSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(provenance.allAuthoredRawMeshes).toHaveLength(96);
  expect(provenance.allAuthoredRawMeshes.filter(mesh => provenance.retainedMeshesAfter.some(retained => retained.name === mesh.name))).toEqual(provenance.retainedMeshesAfter);
  for (const mesh of provenance.allAuthoredRawMeshes) {
    expect(mesh.materials.every(name => provenance.retainedMaterialValues.some(material => material.name === name))).toBe(true);
    expect(mesh.polygonMaterialIndicesSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(provenance.meshes).toHaveLength(96);
  expect(provenance.addedMeshNames).toHaveLength(16);
  expect(provenance.addedMeshNames).toContain('physical-kitchen-stove.east-west grate shoe 0 -1');
  expect(provenance.addedMeshNames).toContain('physical-kitchen-stove.north-south grate shoe 0 -1');
  expect(provenance.evaluatedOutwardNormalAudit).toHaveLength(96);
  expect(provenance.evaluatedOutwardNormalAudit.reduce((sum, row) => sum + row.evaluatedPolygons, 0)).toBe(5876);
  for (const row of provenance.evaluatedOutwardNormalAudit) {
    expect(row.inwardPolygons).toBe(0);
    expect(row.degenerateFaceIndices).toEqual([]);
    expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);
    expect(row.transformDeterminant).toBeGreaterThan(0);
  }
  expect(Object.keys(provenance.actualContactTargets).sort()).toEqual(provenance.addedMeshNames);
  expect(provenance.actualTriangleInteriorContacts).toHaveLength(32);
  for (const witness of provenance.actualTriangleInteriorContacts) {
    expect(provenance.actualContactTargets[witness.shoe]).toContain(witness.retainedTarget);
    expect(witness.actualInteriorWitness).toHaveLength(3);
    expect(witness.overlappingDepth).toBeGreaterThan(.001);
  }
  for (const shoe of provenance.addedMeshNames) expect(provenance.actualTriangleInteriorContacts.filter(row=>row.shoe===shoe)).toHaveLength(2);
  expect(provenance.actualContactTargets['physical-kitchen-stove.east-west grate shoe 0 -1']).toEqual(['angled-stove.burner collar 0','angled-stove.pot support east-west 0']);
  expect(provenance.sourceEvaluatedBounds.min).toEqual([-.9269999265670776, -.45750001072883606, 0]);
  expect(provenance.sourceEvaluatedBounds.max).toEqual([.9269999265670776, .3400000035762787, 2.246000051498413]);
  expect(defaultObjectRegistry.getById('object.stove')!.footprint).toEqual({width:2,height:1});
  expect(obliqueAssetIdForObject('object.stove')).toBe('furniture.kitchen.stove.variants');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-furniture.kitchen-stove.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('furniture.kitchen.stove.variants');
  const soft=JSON.parse(readFileSync(new URL('assets/source/blender/furniture.kitchen.stove.soft-light.provenance.json',root),'utf8')) as {source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string};
  expect(soft.retainedSource).toBe(provenance.source);expect(soft.retainedSourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.source).toBe(soft.source);
  expect(catalog.sourceSha256).toBe(soft.sourceSha256);
  expect(catalog.sourceSha256).toBe('7ac1027aca308b946acf902ebf611547621227535dc70b29db1c06d3db2d03bb');
  expect(hash(readFileSync(new URL(soft.source,root)))).toBe(catalog.sourceSha256);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.cameraTargetTiles).toEqual([1, .5, 1.1230000257492065]);
  expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    const png = readFileSync(new URL(`public${frame.image}`, root));
    expect(hash(png), frame.image).toBe(frame.sha256);
    expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
    expect(png.subarray(0, 8), frame.image).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
    expect(hasTransparentBorder(png), frame.image).toBe(true);
  }
});

function hasTransparentBorder(png: Buffer): boolean {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), stride = width * 4;
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) return false;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  if (raw.length !== (stride + 1) * height) return false;
  let previous = Buffer.alloc(stride), position = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[position++]!;
    if (filter > 4) return false;
    const row = Buffer.from(raw.subarray(position, position + stride)); position += stride;
    for (let i = 0; i < stride; i++) {
      const left = i < 4 ? 0 : row[i - 4]!, above = previous[i]!, corner = i < 4 ? 0 : previous[i - 4]!;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = above;
      if (filter === 3) predictor = (left + above) >> 1;
      if (filter === 4) {
        const p = left + above - corner, a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - corner);
        predictor = a <= b && a <= c ? left : b <= c ? above : corner;
      }
      row[i] = (row[i]! + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      if ((x === 0 || x === width - 1 || y === 0 || y === height - 1) && row[x * 4 + 3] !== 0) return false;
    }
    previous = row;
  }
  return true;
}
