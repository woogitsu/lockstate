import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('retains nineteen authored toilet meshes/eight material graphs and adds physical valve, hinges and joint rails', () => {
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/fixture.cell.toilet_sink.angled.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    acceptedFitBaked: number[]; maximumRetainedVertexFitError: number;
    retainedMeshes: { name: string; rawVertexBytesSha256: string; rawTopologyBytesSha256: string }[];
    retainedMaterialGraphs: { name: string; canonicalMaterialSha256: string }[];
    meshes: { name: string; evaluatedVertices: number }[]; addedMeshNames: string[];
    retainedMeshesCount: number; addedMeshesCount: number; totalMeshesCount: number;
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(provenance.originalSourceSha256).toBe('57db9afb7e48996cef9aaedda72b8e874e865eb56862ee4add8b177a9713887d');
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.sourceSha256).toBe('4ced3356c2f2d17d08e4ce3f9b58e4d63d8500be7927da66a982d7752e513d6d');
  expect(provenance.retainedMeshesCount).toBe(19);
  expect(provenance.retainedMeshes).toHaveLength(19);
  expect(new Set(provenance.retainedMeshes.map(row => row.name)).size).toBe(19);
  for (const mesh of provenance.retainedMeshes) {
    expect(mesh.rawVertexBytesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mesh.rawTopologyBytesSha256).toMatch(/^[0-9a-f]{64}$/);
  }
  expect(provenance.retainedMaterialGraphs).toHaveLength(8);
  expect(provenance.retainedMaterialGraphs.find(row => row.name === 'medical_teal')?.canonicalMaterialSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(provenance.acceptedFitBaked).toEqual([.8, .8, 1]);
  expect(provenance.maximumRetainedVertexFitError).toBeLessThan(1e-6);
  expect(provenance.addedMeshesCount).toBe(25);
  expect(provenance.totalMeshesCount).toBe(44);
  expect(provenance.meshes).toHaveLength(44);
  expect(provenance.addedMeshNames).toContain('angled-toilet.cistern side coupling');
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-toilet.seat hinge barrel'))).toHaveLength(2);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-toilet.seat hinge fixing bolt'))).toHaveLength(4);
  expect(provenance.addedMeshNames.filter(name => name.startsWith('angled-toilet.cistern lid'))).toHaveLength(4);
  expect(provenance.meshes.find(row => row.name === 'angled-toilet.shutoff valve wheel')?.evaluatedVertices).toBe(480);
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-cell-toilet.v1.json', root), 'utf8')));
  expect(catalog.assetId).toBe('fixture.cell.toilet_sink');
  expect(catalog.source).toBe(provenance.source);
  expect(catalog.sourceSha256).toBe(provenance.sourceSha256);
  expect(catalog.cameraTargetTiles).toEqual([.5, .5, .5537500381469727]);
  expect(catalog.resolutionPx).toEqual([512, 512]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    const png = readFileSync(new URL(`public${frame.image}`, root));
    expect(hash(png), frame.image).toBe(frame.sha256);
    expect(png.subarray(0, 8), frame.image).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([512, 512]);
    expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
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
