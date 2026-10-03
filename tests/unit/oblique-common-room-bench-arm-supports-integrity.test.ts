import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
type Mesh = { name: string; materials: string[] };
type Normal = { name: string; polygons: number; minimumOutwardDistance: number; degenerateIndices: number[]; inwardPolygons: number; transformDeterminant: number };
const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.common-room.upholstered-bench.angled-detail.provenance.json', root), 'utf8')) as {
  originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
  retainedMeshesBefore: Mesh[]; retainedMeshesAfter: Mesh[]; allAuthoredRawMeshes: Mesh[];
  retainedMaterialValues: { name: string; canonicalMaterialSha256: string }[];
  retainedEvaluatedHashes: Record<string, string>; allAuthoredEvaluatedHashes: Record<string, string>;
  retainedObjectMatrices: Record<string, number[][]>;
  sourceEvaluatedBounds: { min: number[]; max: number[] };
  originalEvaluatedNormals: Normal[]; authoredEvaluatedNormals: Normal[]; addedMeshNames: string[];
  actualTriangleInteriorContacts: { shoe: string; retainedTarget: string; actualInteriorWitness: number[]; overlappingDepth: number }[];
  acceptedCamera: { resolution: number[]; orthoScale: number; nominalPixelsPerTile: number; target: number[]; sourceFit: number[]; footprint: number[] };
};

it('retains every original bench part and stored shader graph with exactly two actual bearer-to-arm risers', () => {
  expect(provenance.originalSourceSha256).toBe('cfb1af97817ff0f5944626c2888a498bf96d60c3880544cc5f6d6544b9613b92');
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.sourceSha256).toBe('825f228a6bb81dd03ab06d80c52af02646b92a16880e929c112c461b68992772');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.retainedMeshesBefore).toHaveLength(33);
  expect(provenance.retainedMeshesAfter).toEqual(provenance.retainedMeshesBefore);
  expect(provenance.allAuthoredRawMeshes).toHaveLength(35);
  expect(provenance.allAuthoredRawMeshes.filter(row => provenance.retainedMeshesBefore.some(old => old.name === row.name))).toEqual(provenance.retainedMeshesBefore);
  expect(provenance.retainedMaterialValues).toHaveLength(8);
  for (const row of provenance.retainedMaterialValues) expect(row.canonicalMaterialSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.keys(provenance.retainedObjectMatrices)).toHaveLength(33);
  expect(Object.keys(provenance.retainedEvaluatedHashes)).toHaveLength(33);
  for (const [name, digest] of Object.entries(provenance.retainedEvaluatedHashes)) expect(provenance.allAuthoredEvaluatedHashes[name]).toBe(digest);
  expect(provenance.addedMeshNames).toEqual(['physical-common-room-bench.front arm riser 0', 'physical-common-room-bench.front arm riser 1']);
  expect(provenance.actualTriangleInteriorContacts).toHaveLength(4);
  for (const rail of provenance.addedMeshNames) {
    const contacts = provenance.actualTriangleInteriorContacts.filter(row => row.shoe === rail);
    expect(contacts).toHaveLength(2);
    expect(contacts.map(row => row.retainedTarget).filter(name => name.startsWith('side seat bearer'))).toHaveLength(1);
    expect(contacts.map(row => row.retainedTarget).filter(name => name.startsWith('sealed timber arm'))).toHaveLength(1);
    for (const row of contacts) { expect(row.actualInteriorWitness).toHaveLength(3); expect(row.overlappingDepth).toBeGreaterThan(.02); }
  }
  expect(provenance.authoredEvaluatedNormals.filter(row => provenance.retainedMeshesBefore.some(old => old.name === row.name))).toEqual(provenance.originalEvaluatedNormals);
  expect(provenance.authoredEvaluatedNormals.reduce((sum, row) => sum + row.polygons, 0)).toBe(3278);
  for (const row of provenance.authoredEvaluatedNormals) {
    expect(row.inwardPolygons).toBe(0); expect(row.degenerateIndices).toEqual([]);
    expect(row.minimumOutwardDistance).toBeGreaterThan(0); expect(row.transformDeterminant).toBeGreaterThan(0);
  }
  expect(provenance.acceptedCamera).toEqual({ resolution:[256,256], orthoScale:4, nominalPixelsPerTile:64, target:[1,.5,.52], sourceFit:[1,1,1], footprint:[2,1] });
  const original = JSON.parse(readFileSync(new URL('docs/research/2026-10-03-common-room-bench-front-arm-supports/original-bench-inventory-and72-camera-replay.json', root), 'utf8')) as { allRawMeshes: Mesh[]; allStoredGraphs: unknown[] };
  expect(provenance.retainedMeshesBefore).toEqual(original.allRawMeshes);
  expect(provenance.retainedMaterialValues).toEqual(original.allStoredGraphs);
});

it('consumes the detailed default through the existing descriptor and decodes every canonical frame without clipping', () => {
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-furniture.common-room-bench.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('furniture.common-room.upholstered-bench');
  expect(catalog.source).toBe(provenance.source); expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.resolutionPx).toEqual([256,256]); expect(catalog.pivotPx).toEqual([128,128]);
  expect(catalog.nominalPixelsPerTile).toBe(64); expect(catalog.cameraTargetTiles).toEqual([1,.5,.52]);
  expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    const png=readFileSync(new URL(`public${frame.image}`,root));
    expect(hash(png),frame.image).toBe(frame.sha256);
    expect(frame.image).toContain(`.${frame.sha256.slice(0,12)}.png`);
    expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([256,256]);
    expect(hasTransparentBorder(png),frame.image).toBe(true);
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
