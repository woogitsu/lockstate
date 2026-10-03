import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const sourceHash = (bytes: Buffer): string => /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(bytes.toString('utf8'))?.[1] ?? hash(bytes);
const json = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as unknown;
type Mesh = { name: string; materials: string[] };
const provenance = json('assets/source/blender/furniture.laundry.linen-rack.provenance.json') as {
  assetId: string; originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
  footprintTiles: number[]; retainedOriginalMeshNames: string[]; retainedRigidAssemblyTranslation: number[];
  maximumRigidVertexError: number; retainedOriginalRawMeshes: Mesh[]; allAuthoredRawMeshes: Mesh[];
  retainedStoredMaterialGraphs: { name: string; canonicalMaterialSha256: string }[];
  allAuthoredEvaluatedHashes: Record<string, string>; cameraTargetTiles: number[];
  sourceEvaluatedBounds: { min: number[]; max: number[] };
  authoredEvaluatedNormals: { name: string; inwardPolygons: number; degenerateFaceIndices: number[]; minimumOutwardNormalDistance: number }[];
  actualContactPairs: [string, string][];
  actualTriangleInteriorContacts: { partA: string; partB: string; actualTriangleInteriorWitness: number[] }[];
};

it('retains every104-part generic rack mesh and twelve full shader graphs with seven connected linen assembly parts', () => {
  const old = json('assets/source/blender/furniture.storage.rack.wooden.angled-detail.provenance.json') as {allAuthoredRawMeshes: Mesh[];retainedMaterialValues:unknown[];sourceEvaluatedBounds:unknown};
  expect(defaultObjectRegistry.getById('object.storage-rack')!.footprint).toEqual({width:1,height:1});
  expect(provenance.originalSourceSha256).toBe('600d62b3b5708081445b6ba84b5f38fc8534922f6a128b448e1585c97e95c212');
  expect(sourceHash(readFileSync(new URL(provenance.originalSource,root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.sourceSha256).toBe('779d11f79c28b8049ccd3371d840c75b52cd153439f3882e28c593d05dd964ec');
  expect(sourceHash(readFileSync(new URL(provenance.source,root)))).toBe(provenance.sourceSha256);
  expect(provenance.retainedOriginalMeshNames).toHaveLength(104);expect(provenance.allAuthoredRawMeshes).toHaveLength(111);
  expect(provenance.retainedOriginalRawMeshes).toEqual(old.allAuthoredRawMeshes);
  expect(provenance.allAuthoredRawMeshes.filter(row=>provenance.retainedOriginalMeshNames.includes(row.name))).toEqual(old.allAuthoredRawMeshes);
  expect(provenance.retainedStoredMaterialGraphs).toEqual(old.retainedMaterialValues);expect(provenance.retainedStoredMaterialGraphs).toHaveLength(12);
  expect(provenance.sourceEvaluatedBounds).toEqual(old.sourceEvaluatedBounds);
  expect(provenance.retainedRigidAssemblyTranslation).toEqual([0,0,0]);expect(provenance.maximumRigidVertexError).toBeLessThan(1e-7);
  expect(provenance.cameraTargetTiles).toEqual([.5,.5,.7039999961853027]);expect(provenance.footprintTiles).toEqual([1,1]);
  expect(provenance.actualContactPairs).toHaveLength(8);
  expect(provenance.actualTriangleInteriorContacts.map(row=>[row.partA,row.partB])).toEqual(provenance.actualContactPairs);
  expect(provenance.allAuthoredRawMeshes.filter(row=>row.name.startsWith('Laundry linen rack.'))).toHaveLength(7);
  const materialNames=new Set(provenance.retainedStoredMaterialGraphs.map(row=>row.name));
  for(const row of provenance.allAuthoredRawMeshes)for(const material of row.materials)expect(materialNames.has(material)).toBe(true);
  for(const row of provenance.authoredEvaluatedNormals){expect(row.inwardPolygons).toBe(0);expect(row.degenerateFaceIndices).toEqual([]);expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);}
});

it('loads the dedicated descriptor and decodes 72 complete unclipped canonical PNG poses', () => {
  const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-furniture-laundry-linen-rack.v1.json'));
  expect(catalog.assetId).toBe(provenance.assetId); expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.resolutionPx).toEqual([256, 256]); expect(catalog.pivotPx).toEqual([128, 128]);
  expect(catalog.nominalPixelsPerTile).toBe(64); expect(catalog.cameraTargetTiles).toEqual(provenance.cameraTargetTiles);
  expect(catalog.yawDegrees).toEqual(Array.from({ length: 12 }, (_, i) => i * 30));
  expect(catalog.elevationDegrees).toEqual([20, 30, 40, 50, 60, 70]); expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    const png = readFileSync(new URL(`public${frame.image}`, root));
    expect(hash(png), frame.image).toBe(frame.sha256);
    expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
    const compressed: Buffer[] = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    expect([png[24], png[25], png[28]]).toEqual([8, 6, 0]);
    const rows = inflateSync(Buffer.concat(compressed)), stride = 256 * 4 + 1;
    expect(rows.length).toBe(stride * 256);
    let occupied = 0;
    for (let y = 0; y < 256; y++) {
      expect(rows[y * stride]).toBe(0);
      for (let x = 0; x < 256; x++) {
        const alpha = rows[y * stride + 1 + x * 4 + 3]!;
        if (alpha > 0) occupied++;
        if (x === 0 || x === 255 || y === 0 || y === 255) expect(alpha, `Laundry linen rack PNG transparent border: ${frame.image}`).toBe(0);
      }
    }
    expect(occupied, frame.image).toBeGreaterThan(500);
  }
});
