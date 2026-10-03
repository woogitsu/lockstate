import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { obliqueAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
it('publishes the retained cabinet assembly with outward physical hinges and canonical decoded pose bytes', () => {
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/fixture.medicine-cabinet.angled-detail.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    footprintTiles: number[]; cameraTargetTiles: number[]; originalSceneMeshCount: number;
    retainedMeshesCount: number; retainedSelectedNames: string[]; foreignBedMeshNames: string[];
    retainedMeshes: { name: string; rawVertexBytesSha256: string; rawTopologyBytesSha256: string; polygonMaterialIndicesSha256: string }[];
    retainedMaterialGraphs: { name: string; canonicalMaterialSha256: string }[];
    retainedEvaluatedRigidTranslationMaximumError: number; addedMeshNames: string[];
    meshes: { name: string; evaluatedVertices: number }[];
    evaluatedOutwardNormalAudit: { minimumOutwardNormalDistance: number; evaluatedPolygons: number; transformDeterminant: number }[];
  };
  expect(provenance.originalSourceSha256).toBe('17670457233caef94855cdaf64b2cf1bd3c8623318941cbd3ce2e5c50224ac75');
  expect(provenance.sourceSha256).toBe('f03b6fc2d33d83c069b181073616ae95031839e130d890b9f5374cfd947be5ea');
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.originalSceneMeshCount).toBe(20);
  expect(provenance.retainedMeshesCount).toBe(9);
  expect(provenance.retainedSelectedNames).toEqual(['cabinet_body','door','door.001','handle','handle.001','inner','shelf','shelf.001','shelf.002']);
  expect(provenance.foreignBedMeshNames).toHaveLength(11);
  expect(provenance.meshes).toHaveLength(66);
  expect(new Set(provenance.meshes.map(row => row.name)).size).toBe(66);
  for (const name of provenance.foreignBedMeshNames) expect(provenance.meshes.map(row => row.name)).not.toContain(name);
  expect(provenance.addedMeshNames).toHaveLength(57);
  expect(provenance.addedMeshNames).toContain('angled-medicine-cabinet.left lower hinge moving knuckle');
  expect(provenance.addedMeshNames).toContain('angled-medicine-cabinet.left handle lower mount plate');
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-medicine-cabinet.rear service louver'))).toHaveLength(6);
  expect(provenance.retainedEvaluatedRigidTranslationMaximumError).toBeLessThan(1e-6);
  expect(provenance.retainedMeshes).toHaveLength(9);
  for (const mesh of provenance.retainedMeshes) {
    expect(mesh.rawVertexBytesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mesh.rawTopologyBytesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mesh.polygonMaterialIndicesSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(provenance.retainedMaterialGraphs.map(row => row.name)).toEqual(['brass handle','cabinet inset','cabinet warm white']);
  expect(provenance.evaluatedOutwardNormalAudit).toHaveLength(66);
  expect(provenance.evaluatedOutwardNormalAudit.reduce((sum,row) => sum + row.evaluatedPolygons,0)).toBe(6804);
  for (const row of provenance.evaluatedOutwardNormalAudit) {
    expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);
    expect(row.transformDeterminant).toBeGreaterThan(0);
  }
  expect(provenance.footprintTiles).toEqual([1,1]);
  expect(defaultObjectRegistry.getById('object.medicine-cabinet')!.footprint).toEqual({width:1,height:1});
  expect(obliqueAssetIdForObject('object.medicine-cabinet')).toBe('fixture.medicine-cabinet.variants');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-fixture.medicine-cabinet.v1.json',root),'utf8')));
  expect(catalog.assetId).toBe('fixture.medicine-cabinet.variants');
  expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.cameraTargetTiles).toEqual(provenance.cameraTargetTiles);
  expect(catalog.cameraTargetTiles).toEqual([.5,.5,.5899999737739563]);
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
