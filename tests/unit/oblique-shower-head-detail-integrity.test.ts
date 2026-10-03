import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('preserves original shower head geometry/materials/modifiers and publishes actual actual shower arm/head and service fittings', () => {
  type Mesh = { name: string; rawVertexBytesSha256: string; rawTopologyBytesSha256: string; polygonMaterialIndicesSha256: string; materials: string[]; modifiers: unknown[] };
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/fixture.shower.head.angled-detail.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    physicalConnection: { originalArmUndersideZ: number; originalCouplingTopZ: number; originalVerticalGap: number; actualOutletMinZ: number; actualOutletMaxZ: number };
    sourceEvaluatedBounds: { min: number[]; max: number[] };
    acceptedExportFit: number[]; retainedMeshesCount: number; retainedEvaluatedPointSetMaximumError: number;
    retainedMeshesBefore: Mesh[]; retainedMeshesAfter: Mesh[]; allAuthoredRawMeshes: Mesh[]; retainedMaterialValues: { name: string; canonicalMaterialSha256: string }[];

    evaluatedOutwardNormalAudit: { name: string; evaluatedPolygons: number; minimumOutwardNormalDistance: number; transformDeterminant: number; degenerateFaceIndices: number[]; inwardPolygons: number }[];
    addedMeshNames: string[]; meshes: { name: string; evaluatedVertices: number }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('ac0cbe6a3673dd8db19c76375ddeb3d6f23d0cab6aa2e56b298ad8a8e70806fe');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.sourceSha256).toBe('0a375563958f382d6b1d8dde1a6252ace7ed3883f4994a78d040361a65397ea1');
  expect(provenance.acceptedExportFit).toEqual([1, 1, 1]);
  expect(provenance.retainedMeshesCount).toBe(43);
  expect(provenance.retainedMeshesBefore).toHaveLength(43);
  expect(provenance.retainedMeshesAfter).toHaveLength(43);
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
  expect(provenance.retainedMaterialValues.map(row => row.name).sort()).toEqual(['Shower blue-grey enamel', 'Shower cold service mark', 'Shower hot service mark', 'Shower pale nozzle jets', 'Shower trim muted teal', 'Worn galvanized fixture metal', 'galvanized_edge', 'metal_recess', 'shade', 'steel']);
  for (const material of provenance.retainedMaterialValues) expect(material.canonicalMaterialSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(provenance.allAuthoredRawMeshes).toHaveLength(64);
  expect(provenance.allAuthoredRawMeshes.filter(mesh => provenance.retainedMeshesAfter.some(retained => retained.name === mesh.name))).toEqual(provenance.retainedMeshesAfter);
  for (const mesh of provenance.allAuthoredRawMeshes) {
    expect(mesh.materials.every(name => provenance.retainedMaterialValues.some(material => material.name === name))).toBe(true);
    expect(mesh.polygonMaterialIndicesSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(provenance.meshes).toHaveLength(64);
  expect(provenance.addedMeshNames).toHaveLength(21);
  expect(provenance.addedMeshNames).toContain('angled-shower-head.head outlet connecting stem');
  expect(provenance.addedMeshNames).toContain('angled-shower-head.service valve physical grip -0.255');
  expect(provenance.evaluatedOutwardNormalAudit).toHaveLength(64);
  expect(provenance.evaluatedOutwardNormalAudit.reduce((sum, row) => sum + row.evaluatedPolygons, 0)).toBe(4210);
  for (const row of provenance.evaluatedOutwardNormalAudit) {
    expect(row.inwardPolygons).toBe(0);
    expect(row.degenerateFaceIndices).toEqual(['Inset blue-grey face', 'Worn raised plate rim'].includes(row.name) ? [26,27,30,31,36,37,42,43,49,50,52,53] : []);
    expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);
    expect(row.transformDeterminant).toBeGreaterThan(0);
  }
  expect(provenance.physicalConnection.originalVerticalGap).toBeCloseTo(.08399999141693115, 10);
  expect(provenance.physicalConnection.actualOutletMinZ).toBeLessThanOrEqual(provenance.physicalConnection.originalCouplingTopZ);
  expect(provenance.physicalConnection.actualOutletMaxZ).toBeGreaterThanOrEqual(provenance.physicalConnection.originalArmUndersideZ);
  expect(provenance.sourceEvaluatedBounds.min).toEqual([-.35499998927116394, -.49999961256980896, .7099999785423279]);
  expect(provenance.sourceEvaluatedBounds.max).toEqual([.35499998927116394, .47500067949295044, 1.1399999856948853]);
  expect(defaultObjectRegistry.getById('object.shower-head')!.footprint).toEqual({width:1,height:1});
  expect(obliqueAssetIdForObject('object.shower-head')).toBe('fixture.shower.head');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-shower-head.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('fixture.shower.head');
  expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.cameraTargetTiles).toEqual([.5, .5, .925]);
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
