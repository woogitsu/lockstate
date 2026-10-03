import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('preserves original Canteen dining table geometry/materials/modifiers and publishes actual actual two-sided rail-to-post connections', () => {
  type Mesh = { name: string; rawVertexBytesSha256: string; rawTopologyBytesSha256: string; polygonMaterialIndicesSha256: string; materials: string[]; modifiers: unknown[] };
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.canteen.dining-table.angled-detail.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    actualContactTargets: Record<string,string[]>; actualTriangleInteriorContacts: {shoe:string;retainedTarget:string;actualInteriorWitness:number[];overlappingDepth:number}[];
    sourceEvaluatedBounds: { min: number[]; max: number[] };
    acceptedExportFit: number[]; retainedMeshesCount: number; retainedEvaluatedPointSetMaximumError: number;
    retainedMeshesBefore: Mesh[]; retainedMeshesAfter: Mesh[]; allAuthoredRawMeshes: Mesh[]; retainedMaterialValues: { name: string; canonicalMaterialSha256: string }[];

    evaluatedOutwardNormalAudit: { name: string; evaluatedPolygons: number; minimumOutwardNormalDistance: number; transformDeterminant: number; degenerateFaceIndices: number[]; inwardPolygons: number }[];
    addedMeshNames: string[]; meshes: { name: string; evaluatedVertices: number }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('c1a1e8b0cfd2e47fe420ebbaa3eeb72c426d896d0a42b5a708c9bcbb83230fd1');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.sourceSha256).toBe('5f27967600a64ce4ded10a01fe6217ea849c2be9b57ff92353fd60b97af4ede1');
  expect(provenance.acceptedExportFit).toEqual([1, 1, 1]);
  expect(provenance.retainedMeshesCount).toBe(62);
  expect(provenance.retainedMeshesBefore).toHaveLength(62);
  expect(provenance.retainedMeshesAfter).toHaveLength(62);
  expect(provenance.retainedEvaluatedPointSetMaximumError).toBeLessThan(1e-6);
  for (const before of provenance.retainedMeshesBefore) {
    const after = provenance.retainedMeshesAfter.find(row => row.name === before.name)!;
    expect(after.rawVertexBytesSha256).toBe(before.rawVertexBytesSha256);
    expect(after.rawTopologyBytesSha256).toBe(before.rawTopologyBytesSha256);
    expect(after.materials).toEqual(before.materials);
    expect(after.polygonMaterialIndicesSha256).toBe(before.polygonMaterialIndicesSha256);
    expect(after.modifiers).toEqual(before.modifiers);
  }
  expect(provenance.retainedMaterialValues).toHaveLength(10);
  expect(provenance.retainedMaterialValues.map(row => row.name).sort()).toEqual(["Canteen worn steel", "Corridor bench worn wood plank 0", "Corridor bench worn wood plank 1", "Corridor bench worn wood plank 2", "Corridor bench worn wood plank 3", "Worn galvanized fixture metal", "light", "porcelain", "shade", "steel"]);
  for (const material of provenance.retainedMaterialValues) expect(material.canonicalMaterialSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(provenance.allAuthoredRawMeshes).toHaveLength(65);
  expect(provenance.allAuthoredRawMeshes.filter(mesh => provenance.retainedMeshesAfter.some(retained => retained.name === mesh.name))).toEqual(provenance.retainedMeshesAfter);
  for (const mesh of provenance.allAuthoredRawMeshes) {
    expect(mesh.materials.every(name => provenance.retainedMaterialValues.some(material => material.name === name))).toBe(true);
    expect(mesh.polygonMaterialIndicesSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(provenance.meshes).toHaveLength(65);
  expect(provenance.addedMeshNames).toHaveLength(3);
  expect(provenance.addedMeshNames).toContain('physical-canteen-dining-table.rail-to-post arm 0');
  expect(provenance.addedMeshNames).toContain('physical-canteen-dining-table.rail-to-post arm 2');
  expect(provenance.evaluatedOutwardNormalAudit).toHaveLength(65);
  expect(provenance.evaluatedOutwardNormalAudit.reduce((sum, row) => sum + row.evaluatedPolygons, 0)).toBe(2254);
  for (const row of provenance.evaluatedOutwardNormalAudit) {
    expect(row.inwardPolygons).toBe(0);
    expect(row.degenerateFaceIndices.every(Number.isInteger)).toBe(true);
    if (row.name.startsWith('physical-canteen')) expect(row.degenerateFaceIndices).toEqual([]);
    expect(row.minimumOutwardNormalDistance).toBeGreaterThan(row.name.startsWith('Brushed meal tray.') || row.name.startsWith('Meal tray shadow.') ? -1e-6 : 0);
    expect(row.transformDeterminant).toBeGreaterThan(0);
  }
  expect(provenance.evaluatedOutwardNormalAudit.reduce((sum,row)=>sum+row.degenerateFaceIndices.length,0)).toBe(204);
  expect(Object.keys(provenance.actualContactTargets).sort()).toEqual(provenance.addedMeshNames);
  expect(provenance.actualTriangleInteriorContacts).toHaveLength(6);
  for (const witness of provenance.actualTriangleInteriorContacts) {
    expect(provenance.actualContactTargets[witness.shoe]).toContain(witness.retainedTarget);
    expect(witness.actualInteriorWitness).toHaveLength(3);
    expect(witness.overlappingDepth).toBeGreaterThan(.001);
  }
  for (const shoe of provenance.addedMeshNames) expect(provenance.actualTriangleInteriorContacts.filter(row=>row.shoe===shoe)).toHaveLength(2);
  expect(provenance.actualContactTargets['physical-canteen-dining-table.rail-to-post arm 0']).toEqual(['Stool support rail','Stool post.0']);
  expect(provenance.sourceEvaluatedBounds.min).toEqual([-1.4199999570846558, -0.8600004315376282, 0.0]);
  expect(provenance.sourceEvaluatedBounds.max).toEqual([1.4199999570846558, 0.9600005149841309, 0.9449999928474426]);
  expect(defaultObjectRegistry.getById('object.dining-table')!.footprint).toEqual({width:3,height:2});
  expect(obliqueAssetIdForObject('object.dining-table')).toBe('furniture.dining.table.wooden');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-furniture.canteen-dining-table.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('furniture.dining.table.wooden');
  const soft = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.canteen.dining-table.soft-light.provenance.json', root), 'utf8')) as {source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string};
  expect(soft.retainedSource).toBe(provenance.source);
  expect(soft.retainedSourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.source).toBe(soft.source);
  expect(catalog.sourceSha256).toBe('4f92eb8cebdb7f5d343f5ca49869c317535867932f05ab805bbd33b60144728f');
  expect(hash(readFileSync(new URL(soft.source, root)))).toBe(catalog.sourceSha256);
  expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.cameraTargetTiles).toEqual([1.5, 1, .4725]);
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
