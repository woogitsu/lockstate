import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('preserves original Cell cot geometry/materials/modifiers and publishes connected north-leg/headbar/infill uprights', () => {
  type Mesh = { name: string; rawVertexBytesSha256: string; rawTopologyBytesSha256: string; polygonMaterialIndicesSha256: string; materials: string[]; modifiers: unknown[] };
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.cell.cot.single.angled-detail.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    actualContactTargets: Record<string,string[]>; actualTriangleInteriorContacts: {shoe:string;retainedTarget:string;actualInteriorWitness:number[];overlappingDepth:number}[];
    sourceEvaluatedBounds: { min: number[]; max: number[] };
    acceptedExportFit: number[]; retainedMeshesCount: number; retainedEvaluatedPointSetMaximumError: number;
    retainedMeshesBefore: Mesh[]; retainedMeshesAfter: Mesh[]; allAuthoredRawMeshes: Mesh[]; retainedMaterialValues: { name: string; canonicalMaterialSha256: string }[];

    evaluatedOutwardNormalAudit: { name: string; evaluatedPolygons: number; minimumOutwardNormalDistance: number; transformDeterminant: number; degenerateFaceIndices: number[]; inwardPolygons: number }[];
    addedMeshNames: string[]; meshes: { name: string; evaluatedVertices: number }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('9c4b72d8631c2d14c638df4d03a73b14d5a738aac55b642c7836ce2c398f76c7');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.sourceSha256).toBe('ca8ed38a7250dd941b542a93b6e371ccdd692f6a0829d3646401d53d43a561ef');
  expect(provenance.acceptedExportFit).toEqual([1, 1, 1]);
  expect(provenance.retainedMeshesCount).toBe(23);
  expect(provenance.retainedMeshesBefore).toHaveLength(23);
  expect(provenance.retainedMeshesAfter).toHaveLength(23);
  expect(provenance.retainedEvaluatedPointSetMaximumError).toBeLessThan(1e-6);
  for (const before of provenance.retainedMeshesBefore) {
    const after = provenance.retainedMeshesAfter.find(row => row.name === before.name)!;
    expect(after.rawVertexBytesSha256).toBe(before.rawVertexBytesSha256);
    expect(after.rawTopologyBytesSha256).toBe(before.rawTopologyBytesSha256);
    expect(after.materials).toEqual(before.materials);
    expect(after.polygonMaterialIndicesSha256).toBe(before.polygonMaterialIndicesSha256);
    expect(after.modifiers).toEqual(before.modifiers);
  }
  expect(provenance.retainedMaterialValues).toHaveLength(9);
  expect(provenance.retainedMaterialValues.map(row => row.name).sort()).toEqual(["Material", "blanket narrow fold", "dark mattress piped seam", "folded muted ochre blanket", "mattress upper surface", "non marking rubber feet", "pale laundered pillow", "powder coated graphite steel", "washable blue grey mattress"]);
  for (const material of provenance.retainedMaterialValues) expect(material.canonicalMaterialSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(provenance.allAuthoredRawMeshes).toHaveLength(25);
  expect(provenance.allAuthoredRawMeshes.filter(mesh => provenance.retainedMeshesAfter.some(retained => retained.name === mesh.name))).toEqual(provenance.retainedMeshesAfter);
  for (const mesh of provenance.allAuthoredRawMeshes) {
    expect(mesh.materials.every(name => provenance.retainedMaterialValues.some(material => material.name === name))).toBe(true);
    expect(mesh.polygonMaterialIndicesSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(provenance.meshes).toHaveLength(25);
  expect(provenance.addedMeshNames).toHaveLength(2);
  expect(provenance.addedMeshNames).toContain('physical-cell-cot.north headboard upright 0');
  expect(provenance.addedMeshNames).toContain('physical-cell-cot.north headboard upright 1');
  expect(provenance.evaluatedOutwardNormalAudit).toHaveLength(25);
  expect(provenance.evaluatedOutwardNormalAudit.reduce((sum, row) => sum + row.evaluatedPolygons, 0)).toBe(1350);
  for (const row of provenance.evaluatedOutwardNormalAudit) {
    expect(row.inwardPolygons).toBe(0);
    expect(row.degenerateFaceIndices).toEqual([]);
    expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);
    expect(row.transformDeterminant).toBeGreaterThan(0);
  }
  expect(Object.keys(provenance.actualContactTargets).sort()).toEqual(provenance.addedMeshNames);
  expect(provenance.actualTriangleInteriorContacts).toHaveLength(6);
  for (const witness of provenance.actualTriangleInteriorContacts) {
    expect(provenance.actualContactTargets[witness.shoe]).toContain(witness.retainedTarget);
    expect(witness.actualInteriorWitness).toHaveLength(3);
    expect(witness.overlappingDepth).toBeGreaterThan(.001);
  }
  for (const shoe of provenance.addedMeshNames) expect(provenance.actualTriangleInteriorContacts.filter(row=>row.shoe===shoe)).toHaveLength(3);
  expect(provenance.actualContactTargets['physical-cell-cot.north headboard upright 0']).toEqual(['square steel leg','north headboard upper bar','north headboard infill']);
  expect(provenance.sourceEvaluatedBounds.min).toEqual([0.125, 0.13500000536441803, 0.0]);
  expect(provenance.sourceEvaluatedBounds.max).toEqual([0.875, 1.8650000095367432, 0.6350000500679016]);
  expect(defaultObjectRegistry.getById('object.bed')!.footprint).toEqual({width:1,height:2});
  expect(obliqueAssetIdForObject('object.bed')).toBe('furniture.cell.cot.single');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-furniture.cell-cot.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('furniture.cell.cot.single');
  const soft = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.cell.cot.single.soft-light.provenance.json', root), 'utf8')) as { source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string;physicalAssembly:{rawMeshes:unknown[];completeStoredMaterialGraphs:unknown[];actualInteriorContacts:unknown[]} };
  expect(soft.retainedSource).toBe(provenance.source);
  expect(soft.retainedSourceSha256).toBe(provenance.sourceSha256);
  expect(soft.physicalAssembly.rawMeshes).toEqual(provenance.allAuthoredRawMeshes);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toEqual(provenance.retainedMaterialValues);
  expect(soft.physicalAssembly.actualInteriorContacts).toEqual(provenance.actualTriangleInteriorContacts);
  expect(catalog.source).toBe(soft.source);
  expect(catalog.sourceSha256).toBe(soft.sourceSha256);
  expect(catalog.sourceSha256).toBe('1e3710b77601d6864f1de30d7b37a6220357320ae832354d3920b9fa95b17eba');
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.cameraTargetTiles).toEqual([.5, 1, .35]);
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
