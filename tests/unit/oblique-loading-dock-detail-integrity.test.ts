import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('retains authored loading-dock vertices/materials/modifiers, explicitly corrects topology and publishes physical angled detail', () => {
  type Mesh = { name: string; rawVertexBytesSha256: string; rawTopologyBytesSha256: string; polygonMaterialIndicesSha256: string; materials: string[]; modifiers: unknown[] };
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/utility.loading-dock-door.angled-detail.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    acceptedExportFit: number[]; retainedMeshesCount: number; retainedEvaluatedPointSetMaximumError: number;
    retainedMeshesBefore: Mesh[]; retainedMeshesCorrected: Mesh[]; allAuthoredRawMeshes: Mesh[]; retainedMaterialValues: { name: string; canonicalMaterialSha256: string }[];
    originalRawNormalAudit: { name: string; rawInwardPolygons: number }[];
    evaluatedOutwardNormalAudit: { name: string; evaluatedPolygons: number; minimumOutwardNormalDistance: number; transformDeterminant: number }[];
    addedMeshNames: string[]; meshes: { name: string; evaluatedVertices: number }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('9a8b5cd29ed5809ec1c3f2c6f36f3d97d3a9a7f69551c0743e096591c26908c4');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.sourceSha256).toBe('7eeca158b9e5f92abb139ab8164f5dd7a2aa2f2ca47936e4b08e4ea6c79a3aac');
  expect(provenance.acceptedExportFit).toEqual([1.5, 1, 1]);
  expect(provenance.retainedMeshesCount).toBe(7);
  expect(provenance.retainedMeshesBefore).toHaveLength(7);
  expect(provenance.retainedMeshesCorrected).toHaveLength(7);
  expect(provenance.retainedEvaluatedPointSetMaximumError).toBeLessThan(1e-6);
  for (const before of provenance.retainedMeshesBefore) {
    const after = provenance.retainedMeshesCorrected.find(row => row.name === before.name)!;
    expect(after.rawVertexBytesSha256).toBe(before.rawVertexBytesSha256);
    expect(after.rawTopologyBytesSha256).not.toBe(before.rawTopologyBytesSha256);
    expect(after.materials).toEqual(before.materials);
    expect(after.polygonMaterialIndicesSha256).toBe(before.polygonMaterialIndicesSha256);
    expect(after.modifiers).toEqual(before.modifiers);
  }
  expect(provenance.retainedMaterialValues).toHaveLength(4);
  expect(provenance.retainedMaterialValues.map(row => row.name).sort()).toEqual(['amber status', 'control panel', 'monitor glass', 'warm charcoal']);
  for (const material of provenance.retainedMaterialValues) expect(material.canonicalMaterialSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(provenance.originalRawNormalAudit).toHaveLength(7);
  for (const row of provenance.originalRawNormalAudit) expect(row.rawInwardPolygons).toBe(6);
  expect(provenance.allAuthoredRawMeshes).toHaveLength(64);
  expect(provenance.allAuthoredRawMeshes.filter(mesh => provenance.retainedMeshesCorrected.some(retained => retained.name === mesh.name))).toEqual(provenance.retainedMeshesCorrected);
  for (const mesh of provenance.allAuthoredRawMeshes) {
    expect(mesh.materials.every(name => provenance.retainedMaterialValues.some(material => material.name === name))).toBe(true);
    expect(mesh.polygonMaterialIndicesSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(provenance.meshes).toHaveLength(64);
  expect(provenance.addedMeshNames).toHaveLength(57);
  expect(provenance.addedMeshNames).toContain('angled-loading-dock.latch raised lock barrel');
  expect(provenance.addedMeshNames).toContain('angled-loading-dock.left middle hinge knuckle');
  expect(provenance.evaluatedOutwardNormalAudit).toHaveLength(64);
  expect(provenance.evaluatedOutwardNormalAudit.reduce((sum, row) => sum + row.evaluatedPolygons, 0)).toBe(7128);
  for (const row of provenance.evaluatedOutwardNormalAudit) {
    expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);
    expect(row.transformDeterminant).toBeGreaterThan(0);
  }
  expect(defaultObjectRegistry.getById('object.loading-dock-door')!.footprint).toEqual({width:3,height:1});
  expect(obliqueAssetIdForObject('object.loading-dock-door')).toBe('utility.loading-dock-door.variants');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-utility.loading-dock-door.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('utility.loading-dock-door.variants');
  expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.cameraTargetTiles).toEqual([1.5, .5, .89]);
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
