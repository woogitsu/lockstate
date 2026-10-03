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
const provenance = json('assets/source/blender/furniture.staff-room.padded-chair.provenance.json') as {
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

it('retains all 52 authored chair parts and four complete material graphs in the 1x1 Staff Room padded chair', () => {
  expect(defaultObjectRegistry.getById('object.chair')!.footprint).toEqual({ width: 1, height: 1 });
  expect(provenance.assetId).toBe('furniture.staff-room.padded-chair');
  expect(provenance.originalSourceSha256).toBe('acd0e9decb3bb451b44e8354e797fb5656825f4748bbed832bab61659f06cd88');
  expect(sourceHash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.sourceSha256).toBe('47004797588d92173e4140bc307ac3db73ed322ac2e1d2472f99c10475956109');
  expect(sourceHash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.retainedOriginalMeshNames).toHaveLength(52);
  expect(provenance.allAuthoredRawMeshes).toHaveLength(54);
  expect(provenance.allAuthoredRawMeshes.filter(row => provenance.retainedOriginalMeshNames.includes(row.name))).toEqual(provenance.retainedOriginalRawMeshes);
  expect(provenance.retainedRigidAssemblyTranslation).toEqual([0, 0, 0]);
  expect(provenance.maximumRigidVertexError).toBeLessThan(1e-6);
  expect(provenance.retainedStoredMaterialGraphs.map(row => row.name)).toEqual(['Canteen worn steel', 'Corridor bench worn wood plank 0', 'Corridor bench worn wood plank 1', 'shade']);
  const materialNames = new Set(provenance.retainedStoredMaterialGraphs.map(row => row.name));
  for (const mesh of provenance.allAuthoredRawMeshes) for (const material of mesh.materials) expect(materialNames.has(material)).toBe(true);
  expect(provenance.cameraTargetTiles).toEqual([.5, .5, .6600000262260437]);
  expect(provenance.footprintTiles).toEqual([1, 1]);
  expect(provenance.sourceEvaluatedBounds.min[0]).toBeGreaterThanOrEqual(-.5);
  expect(provenance.sourceEvaluatedBounds.min[1]).toBeGreaterThanOrEqual(-.5);
  expect(provenance.sourceEvaluatedBounds.max[0]).toBeLessThanOrEqual(.5);
  expect(provenance.sourceEvaluatedBounds.max[1]).toBeLessThanOrEqual(.5);
  expect(provenance.sourceEvaluatedBounds.min[2]).toBeCloseTo(0, 6);
  const pads = provenance.allAuthoredRawMeshes.filter(row => row.name.startsWith('Staff Room padded chair.'));
  expect(pads.map(row => row.name)).toEqual(['Staff Room padded chair.connected lumbar back pad', 'Staff Room padded chair.connected seat pad']);
  for (const pad of pads) expect(pad.materials).toEqual(['shade']);
  expect(provenance.actualContactPairs).toEqual([
    ['Staff Room padded chair.connected seat pad', 'Chair refinement.wooden seat'],
    ['Staff Room padded chair.connected lumbar back pad', 'Chair refinement.walnut back rail'],
    ['Staff Room padded chair.connected lumbar back pad', 'Chair refinement.dark back inset'],
  ]);
  expect(provenance.actualTriangleInteriorContacts.map(row => [row.partA, row.partB])).toEqual(provenance.actualContactPairs);
  for (const row of provenance.actualTriangleInteriorContacts) expect(row.actualTriangleInteriorWitness.every(Number.isFinite)).toBe(true);
  for (const row of provenance.authoredEvaluatedNormals.filter(row => row.name.startsWith('Staff Room padded chair.'))) {
    expect(row.inwardPolygons).toBe(0); expect(row.degenerateIndices).toEqual([]); expect(row.minimumOutwardDistance).toBeGreaterThan(0);
  }
});

it('loads the dedicated descriptor and decodes 72 complete unclipped canonical PNG poses', () => {
  const catalog = parseObliqueModuleCatalog(json('public/game-content/oblique-furniture-staff-room-padded-chair.v1.json'));
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
        if (x === 0 || x === 255 || y === 0 || y === 255) expect(alpha, `Staff Room padded chair PNG transparent border: ${frame.image}`).toBe(0);
      }
    }
    expect(occupied, frame.image).toBeGreaterThan(500);
  }
});
