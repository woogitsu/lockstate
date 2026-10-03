import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const sourceHash = (bytes: Buffer): string => /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\n/m.exec(bytes.toString('utf8'))?.[1] ?? hash(bytes);
type Mesh = { name: string; materials: string[] };
type Normal = { name: string; inwardPolygons: number; degenerateFaceIndices: number[]; minimumOutwardNormalDistance: number };
const p = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.corridor.bench.grounded-detail.provenance.json', root), 'utf8')) as {
  assetId: string; originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
  retainedOriginalMeshNames: string[]; retainedOriginalRawMeshes: Mesh[]; allAuthoredRawMeshes: Mesh[];
  retainedStoredMaterialGraphs: unknown[]; retainedObjectMatrices: Record<string, number[][]>;
  retainedEvaluatedHashes: Record<string, string>; allAuthoredEvaluatedHashes: Record<string, string>;
  sourceEvaluatedBounds: { min: number[]; max: number[] }; addedMeshNames: string[];
  originalEvaluatedNormals: Normal[]; authoredEvaluatedNormals: Normal[];
  actualContactPairs: [string, string][];
  actualTriangleInteriorContacts: { partA: string; partB: string; actualTriangleInteriorWitness: number[] }[];
  retainedLowerTieTriangleContacts: unknown[];
  originalGroundGaps: { leg: string; plate: string; minimumSurfaceSeparationTiles: number; nominalPixelsAt64: number }[];
  acceptedCamera: { footprint: number[]; target: number[]; sourceFit: number[]; nominalPixelsPerTile: number };
};

it('retains all 42 authored bench parts and nine full graphs with four real leg-to-floor mounting shoes', () => {
  expect(defaultObjectRegistry.getById('object.bench')!.footprint).toEqual({ width: 2, height: 1 });
  expect(p.originalSourceSha256).toBe('4b174ad498260ac3c736d2b4d78fb1f566cface5bab81d513fb2e00a4568ab81');
  expect(sourceHash(readFileSync(new URL(p.originalSource, root)))).toBe(p.originalSourceSha256);
  expect(p.sourceSha256).toBe('8518e5d755352f6511bcb4f2165674e1bca44f918f945e7c5cfa09b60ba05986');
  expect(sourceHash(readFileSync(new URL(p.source, root)))).toBe(p.sourceSha256);
  const old = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.corridor.bench.angled-detail.provenance.json', root), 'utf8')) as {
    allAuthoredRawMeshes: Mesh[]; retainedMaterialValues: unknown[]; allAuthoredEvaluatedHashes: Record<string, string>;
    sourceEvaluatedBounds: unknown; authoredEvaluatedNormals: Normal[]; actualTriangleInteriorContacts: unknown[];
  };
  expect(p.retainedOriginalMeshNames).toHaveLength(42); expect(p.allAuthoredRawMeshes).toHaveLength(46);
  expect(p.retainedOriginalRawMeshes).toEqual(old.allAuthoredRawMeshes);
  expect(p.allAuthoredRawMeshes.filter(row => p.retainedOriginalMeshNames.includes(row.name))).toEqual(old.allAuthoredRawMeshes);
  expect(p.retainedStoredMaterialGraphs).toHaveLength(9); expect(p.retainedStoredMaterialGraphs).toEqual(old.retainedMaterialValues);
  expect(p.retainedEvaluatedHashes).toEqual(old.allAuthoredEvaluatedHashes);
  for (const [name, digest] of Object.entries(p.retainedEvaluatedHashes)) expect(p.allAuthoredEvaluatedHashes[name]).toBe(digest);
  expect(Object.keys(p.retainedObjectMatrices)).toHaveLength(42);
  expect(p.sourceEvaluatedBounds).toEqual(old.sourceEvaluatedBounds);
  expect(p.originalEvaluatedNormals).toEqual(old.authoredEvaluatedNormals);
  expect(p.authoredEvaluatedNormals.filter(row => p.retainedOriginalMeshNames.includes(row.name))).toEqual(old.authoredEvaluatedNormals);
  for (const row of p.authoredEvaluatedNormals) {
    expect(row.inwardPolygons).toBe(0); expect(row.degenerateFaceIndices).toEqual([]); expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);
  }
  expect(p.addedMeshNames).toEqual(Array.from({ length: 4 }, (_, index) => `physical-bench.ground mounting shoe ${index}`));
  expect(p.actualContactPairs).toHaveLength(8);
  expect(p.actualTriangleInteriorContacts.map(row => [row.partA, row.partB])).toEqual(p.actualContactPairs);
  for (const shoe of p.addedMeshNames) {
    expect(p.allAuthoredRawMeshes.find(row => row.name === shoe)!.materials).toEqual(['Canteen worn steel']);
    const targets = p.actualContactPairs.filter(pair => pair[0] === shoe).map(pair => pair[1]);
    expect(targets).toHaveLength(2);
    expect(targets.filter(name => name.startsWith('Angled support.'))).toHaveLength(1);
    expect(targets.filter(name => name.startsWith('Anchor plate.'))).toHaveLength(1);
  }
  for (const row of p.actualTriangleInteriorContacts) expect(row.actualTriangleInteriorWitness.every(Number.isFinite)).toBe(true);
  expect(p.retainedLowerTieTriangleContacts).toEqual(old.actualTriangleInteriorContacts);
  expect(p.originalGroundGaps).toHaveLength(4);
  for (const row of p.originalGroundGaps) {
    expect(row.minimumSurfaceSeparationTiles).toBeCloseTo(.0795, 5);
    expect(row.nominalPixelsAt64).toBeCloseTo(5.088, 3);
  }
  expect(p.acceptedCamera.footprint).toEqual([2, 1]); expect(p.acceptedCamera.sourceFit).toEqual([1, 1, 1]);
  expect(p.acceptedCamera.target).toEqual([1, .5, .44325]); expect(p.acceptedCamera.nominalPixelsPerTile).toBe(64);
});

it('selects the complete grounded source and decodes every genuine canonical body, retaining all previous 72 images', () => {
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-canteen-bench.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('furniture.corridor.bench.variants'); const soft = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.corridor.bench.soft-light.provenance.json', root), 'utf8')) as {source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string};
  expect(soft.retainedSource).toBe(p.source); expect(soft.retainedSourceSha256).toBe(p.sourceSha256);
  expect(catalog.source).toBe(soft.source); expect(catalog.sourceSha256).toBe('b4e5ca9317c74e0f8182937658c0a3f7026f114fcb7e1661101628cbd75c4e94');
  expect(hash(readFileSync(new URL(soft.source, root)))).toBe(catalog.sourceSha256); expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(catalog.resolutionPx).toEqual([256, 256]); expect(catalog.pivotPx).toEqual([128, 128]);
  expect(catalog.nominalPixelsPerTile).toBe(64); expect(catalog.cameraTargetTiles).toEqual([1, .5, .44325]);
  expect(catalog.yawDegrees).toEqual(Array.from({ length: 12 }, (_, index) => index * 30));
  expect(catalog.elevationDegrees).toEqual([20, 30, 40, 50, 60, 70]); expect(catalog.frames).toHaveLength(72);
  const previous = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('docs/research/2026-10-03-wooden-bench-ground-mounts/previous-42part-runtime-descriptor.json', root), 'utf8')));
  expect(previous.sourceSha256).toBe(p.originalSourceSha256); expect(previous.frames).toHaveLength(72);
  for (const frame of previous.frames) expect(hash(readFileSync(new URL(`public${frame.image}`, root))), 'retained earlier genuine frame').toBe(frame.sha256);
  for (const frame of catalog.frames) {
    const body = readFileSync(new URL(`public${frame.image}`, root));
    expect(hash(body), frame.image).toBe(frame.sha256); expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
    expect(body.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([body.readUInt32BE(16), body.readUInt32BE(20), body[24], body[25], body[28]]).toEqual([256, 256, 8, 6, 0]);
    const chunks: Buffer[] = [];
    for (let offset = 8; offset < body.length;) {
      const length = body.readUInt32BE(offset);
      if (body.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(body.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const pixels = inflateSync(Buffer.concat(chunks)), stride = 1025;
    expect(pixels.length).toBe(stride * 256);
    let occupied = 0;
    for (let y = 0; y < 256; y++) {
      expect(pixels[y * stride]).toBe(0);
      for (let x = 0; x < 256; x++) {
        const alpha = pixels[y * stride + 1 + x * 4 + 3]!;
        if (alpha > 0) occupied++;
        if (x === 0 || x === 255 || y === 0 || y === 255) expect(alpha, frame.image).toBe(0);
      }
    }
    expect(occupied).toBeGreaterThan(500);
  }
});
