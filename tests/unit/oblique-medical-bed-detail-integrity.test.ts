import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
it('preserves the original medical bed assembly with outward wheels and rails and archived canonical decoded pose bytes', () => {
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.medical-bed.angled-detail.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    footprintTiles: number[]; cameraTargetTiles: number[]; originalSceneMeshCount: number;
    retainedMeshesCount: number; retainedSelectedNames: string[]; allAuthoredRawMeshes: { name: string; materials: string[]; rawTopologyBytesSha256: string; polygonMaterialIndicesSha256: string }[];
    retainedMeshes: { name: string; rawVertexBytesSha256: string; rawTopologyBytesSha256: string; polygonMaterialIndicesSha256: string }[];
    retainedMaterialGraphs: { name: string; canonicalMaterialSha256: string }[];
    retainedEvaluatedRigidTranslationMaximumError: number; addedMeshNames: string[];
    meshes: { name: string; evaluatedVertices: number }[];
    evaluatedOutwardNormalAudit: { minimumOutwardNormalDistance: number; evaluatedPolygons: number; transformDeterminant: number }[];
  };
  expect(provenance.originalSourceSha256).toBe('1737b03a3ee1342e813e7096e0aef189f05d714d5a69437a8fe490c026d232be');
  expect(provenance.sourceSha256).toBe('d18a702e585d6e69f15602d9e9f294bc0c539da3f78bf4f48fe1330da286c4fe');
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.originalSceneMeshCount).toBe(11);
  expect(provenance.retainedMeshesCount).toBe(11);
  expect(provenance.retainedSelectedNames).toEqual(['bed_base','control','headboard','leg','leg.001','leg.002','leg.003','mattress','pillow','rail','rail.001']);
  expect(provenance.meshes).toHaveLength(76);
  expect(new Set(provenance.meshes.map(row => row.name)).size).toBe(76);
  expect(provenance.addedMeshNames).toHaveLength(65);
  expect(provenance.addedMeshNames).toContain('angled-medical-bed.left foot caster wheel');
  expect(provenance.addedMeshNames).toContain('angled-medical-bed.left side safety rail');
  expect(provenance.addedMeshNames.filter(name => name.includes('adjustment link'))).toHaveLength(4);
  expect(provenance.allAuthoredRawMeshes).toHaveLength(76);
  const materialNames = ['mattress edge','medical linen','rail accent','warm painted steel'];
  for (const mesh of provenance.allAuthoredRawMeshes) {
    expect(mesh.materials.every(name => materialNames.includes(name))).toBe(true);
    expect(mesh.rawTopologyBytesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mesh.polygonMaterialIndicesSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(provenance.retainedEvaluatedRigidTranslationMaximumError).toBeLessThan(1e-6);
  expect(provenance.retainedMeshes).toHaveLength(11);
  for (const mesh of provenance.retainedMeshes) {
    expect(mesh.rawVertexBytesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mesh.rawTopologyBytesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mesh.polygonMaterialIndicesSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(provenance.retainedMaterialGraphs.map(row => row.name)).toEqual(['mattress edge','medical linen','rail accent','warm painted steel']);
  expect(provenance.evaluatedOutwardNormalAudit).toHaveLength(76);
  expect(provenance.evaluatedOutwardNormalAudit.reduce((sum,row) => sum + row.evaluatedPolygons,0)).toBe(7776);
  for (const row of provenance.evaluatedOutwardNormalAudit) {
    expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);
    expect(row.transformDeterminant).toBeGreaterThan(0);
  }
  expect(provenance.footprintTiles).toEqual([1,2]);
  expect(defaultObjectRegistry.getById('object.medical-bed')!.footprint).toEqual({width:1,height:2});
  expect(obliqueAssetIdForObject('object.medical-bed')).toBe('furniture.medical-bed.variants');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('assets/source/blender/furniture.medical-bed.workbench-descriptor.v1.json',root),'utf8')));
  expect(catalog.assetId).toBe('furniture.medical-bed.variants');
  expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.cameraTargetTiles).toEqual(provenance.cameraTargetTiles);
  expect(catalog.cameraTargetTiles).toEqual([.5,1,.675000011920929]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.resolutionPx).toEqual([256,256]);
  expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    const png=readFileSync(new URL(`public${frame.image}`,root));
    expect(hash(png),frame.image).toBe(frame.sha256);
    expect(frame.image).toContain(`.${frame.sha256.slice(0,12)}.png`);
    expect(png.subarray(0,8),frame.image).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([256,256]);
    expect(hasTransparentBorder(png),frame.image).toBe(true);
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
