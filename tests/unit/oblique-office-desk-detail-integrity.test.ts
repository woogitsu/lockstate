import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
it('retains the actual Reception workstation and publishes separate physical input hardware', () => {
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.office.desk.generic.angled-detail.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    footprintTiles: number[]; retainedMeshesCount: number; retainedMeshes: unknown[];
    retainedMaterialGraphs: { name: string; canonicalMaterialSha256: string }[];
    originalEvaluatedOutwardNormalAudit: { name: string; minimumOutwardNormalDistance: number }[];
    evaluatedOutwardNormalAudit: { name: string; evaluatedPolygons: number; minimumOutwardNormalDistance: number; transformDeterminant: number }[];
    addedMeshNames: string[]; meshes: { name: string; evaluatedVertices: number }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('87ecf22ec7f4d82e5c2c47bb18870b8ef060a84759cb55d38b131fc34e72e11b');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.sourceSha256).toBe('486b83b5079698faeb1cd58e989d1a1dfe524996813474b04550dd4c82a2fd46');
  expect(provenance.footprintTiles).toEqual([2, 1]);
  expect(provenance.retainedMeshesCount).toBe(21);
  expect(provenance.retainedMeshes).toHaveLength(21);
  expect(provenance.retainedMaterialGraphs).toHaveLength(6);
  expect(provenance.retainedMaterialGraphs.map(row => row.name).sort()).toEqual(['monitor display', 'paper', 'powder coated steel', 'teal drawer label', 'warm oak laminate', 'worktop edging']);
  for (const material of provenance.retainedMaterialGraphs) expect(material.canonicalMaterialSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(provenance.originalEvaluatedOutwardNormalAudit).toHaveLength(21);
  expect(provenance.meshes).toHaveLength(94);
  expect(provenance.addedMeshNames).toHaveLength(73);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-desk.keycap'))).toHaveLength(42);
  expect(provenance.addedMeshNames).toContain('angled-desk.keyboard spacebar');
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-desk.drawer pull standoff'))).toHaveLength(6);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-desk.raised drawer pull bridge'))).toHaveLength(3);
  expect(provenance.evaluatedOutwardNormalAudit).toHaveLength(94);
  expect(provenance.evaluatedOutwardNormalAudit.reduce((sum, row) => sum + row.evaluatedPolygons, 0)).toBe(5940);
  for (const row of provenance.evaluatedOutwardNormalAudit) {
    expect(row.minimumOutwardNormalDistance).toBeGreaterThan(0);
    expect(row.transformDeterminant).toBeGreaterThan(0);
  }
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-furniture-office-desk-generic.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('furniture.office.desk.generic');
  expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.cameraTargetTiles).toEqual([1, .5, .6349999904632568]);
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
