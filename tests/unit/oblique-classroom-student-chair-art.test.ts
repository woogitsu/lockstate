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
const provenance = json('assets/source/blender/furniture.classroom.student-chair.provenance.json') as {
  assetId: string; originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
  footprintTiles: number[]; retainedOriginalMeshNames: string[]; retainedRigidAssemblyTranslation: number[];
  maximumRigidVertexError: number; retainedOriginalRawMeshes: Mesh[]; allAuthoredRawMeshes: Mesh[];
  retainedStoredMaterialGraphs: { name: string; canonicalMaterialSha256: string }[];
  allAuthoredEvaluatedHashes: Record<string, string>; cameraTargetTiles: number[];
  sourceEvaluatedBounds: { min: number[]; max: number[] };
  authoredEvaluatedNormals: { name: string; inwardPolygons: number; degenerateIndices: number[]; minimumOutwardDistance: number }[];
  actualContactPairs: [string, string][];
  actualTriangleInteriorContacts: { partA: string; partB: string; actualTriangleInteriorWitness: number[] }[];
};

it('retains all25 authored school-chair parts and eight stored graphs in the1x1 writing chair', () => {
  expect(defaultObjectRegistry.getById('object.chair')!.footprint).toEqual({ width: 1, height: 1 });
  expect(provenance.assetId).toBe('furniture.classroom.student-chair');
  expect(provenance.originalSourceSha256).toBe('d28bc849cc54701a8efa26504905dcfb8887847b540a6e1253e216c2b6bd16d1');
  expect(sourceHash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.sourceSha256).toBe('0c3d7dc54a594659c810f8e1d76bd4980bf1293f7a5b22c367805760de1a9b1b');
  expect(sourceHash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.retainedOriginalMeshNames).toHaveLength(25);
  expect(provenance.allAuthoredRawMeshes).toHaveLength(33);
  expect(provenance.allAuthoredRawMeshes.filter(row => provenance.retainedOriginalMeshNames.includes(row.name))).toEqual(provenance.retainedOriginalRawMeshes);
  expect(provenance.retainedRigidAssemblyTranslation).toEqual([0, 0, 0]);
  expect(provenance.maximumRigidVertexError).toBeLessThan(1e-6);
  expect(provenance.retainedStoredMaterialGraphs.map(row => row.name)).toEqual(['Material', 'captive steel fasteners', 'muted blue-grey moulded seat', 'non-marking charcoal rubber', 'powder-coated petrol frame', 'recessed seat rim', 'sealed timber writing-room accent', 'seat light-catching surface']);
  const originalInventory = json('docs/research/2026-10-03-classroom-student-writing-chair/actual-original-inventory.json') as { materials: unknown[] };
  expect(provenance.retainedStoredMaterialGraphs).toEqual(originalInventory.materials);
  const materialNames = new Set(provenance.retainedStoredMaterialGraphs.map(row => row.name));
  for (const mesh of provenance.allAuthoredRawMeshes) for (const material of mesh.materials) expect(materialNames.has(material)).toBe(true);
  expect(provenance.footprintTiles).toEqual([1, 1]);
  expect(provenance.sourceEvaluatedBounds.min[0]).toBeGreaterThanOrEqual(0);
  expect(provenance.sourceEvaluatedBounds.min[1]).toBeGreaterThanOrEqual(0);
  expect(provenance.sourceEvaluatedBounds.max[0]).toBeLessThanOrEqual(1);
  expect(provenance.sourceEvaluatedBounds.max[1]).toBeLessThanOrEqual(1);
  expect(provenance.sourceEvaluatedBounds.min[2]).toBeCloseTo(0, 6);
  expect(provenance.allAuthoredRawMeshes.filter(row => row.name.startsWith('Classroom student chair.'))).toHaveLength(8);
  expect(provenance.cameraTargetTiles).toEqual([.5, .5, .58]);
  expect(provenance.sourceEvaluatedBounds).toEqual({ min: [.15000000596046448, .14399999380111694, 0], max: [.8500000238418579, .8459999561309814, 1.0440210103988647] });
  expect(provenance.actualContactPairs).toHaveLength(13);
  expect(provenance.actualTriangleInteriorContacts.map(row => [row.partA, row.partB])).toEqual(provenance.actualContactPairs);
  expect(provenance.actualContactPairs).toContainEqual(['Classroom student chair.continuous petrol tablet bearer', 'rear upright.001']);
  expect(provenance.actualContactPairs).toContainEqual(['Classroom student chair.front frame tablet upright', 'tubular chair leg.002']);
  for (const row of provenance.actualTriangleInteriorContacts) expect(row.actualTriangleInteriorWitness.every(Number.isFinite)).toBe(true);
  for (const row of provenance.authoredEvaluatedNormals.filter(row => row.name.startsWith('Classroom student chair.'))) {
    expect(row.inwardPolygons).toBe(0); expect(row.degenerateIndices).toEqual([]); expect(row.minimumOutwardDistance).toBeGreaterThan(0);
  }
});

it('loads the dedicated descriptor and decodes 72 complete unclipped canonical PNG poses', () => {
  const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-furniture-classroom-student-chair.v1.json'));
  const soft=json('assets/source/blender/furniture.classroom.student-chair.soft-light.provenance.json') as {source:string;sourceSha256:string;physicalAssembly:{rawMeshes:unknown[];completeStoredMaterialGraphs:unknown[]}};
  expect(catalog.assetId).toBe(provenance.assetId); expect(catalog.source).toBe(soft.source);
  expect(catalog.sourceSha256).toBe(soft.sourceSha256);
  expect(soft.physicalAssembly.rawMeshes).toEqual(provenance.allAuthoredRawMeshes);
  expect(soft.physicalAssembly.completeStoredMaterialGraphs).toEqual(provenance.retainedStoredMaterialGraphs);
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
        if (x === 0 || x === 255 || y === 0 || y === 255) expect(alpha, `Classroom student chair PNG transparent border: ${frame.image}`).toBe(0);
      }
    }
    expect(occupied, frame.image).toBeGreaterThan(500);
  }
});
