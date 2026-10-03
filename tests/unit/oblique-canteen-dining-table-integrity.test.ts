import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { obliqueAssetIdForObject, obliqueCatalogForObject } from '../../src/rendering/assets/oblique-object-mapping';

const root = new URL('../../', import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

it('routes the existing dining object descriptor through the registered aligned source', () => {
  const assetId = obliqueAssetIdForObject('object.dining-table');
  expect(assetId).toBe('furniture.dining.table.wooden');
  const registry = parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('public/game-content/oblique-module-registry.v1.json', root), 'utf8')) as unknown);
  const descriptor = registry.entries.find(entry => entry.assetId === assetId)!;
  expect(descriptor.manifest).toBe('/game-content/oblique-furniture.canteen-dining-table.v1.json');
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(`public${descriptor.manifest}`, root), 'utf8')) as unknown);
  expect(obliqueCatalogForObject('object.dining-table', new Map([[catalog.assetId, catalog]]))).toBe(catalog);
  expect(defaultObjectRegistry.getById('object.dining-table')!.footprint).toEqual({ width: 3, height: 2 });
});

it('retains the original authored dining mesh set and exports the authoritative3x2 footprint', () => {
  const provenance = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.canteen.dining-table.provenance.json', root), 'utf8')) as {
    originalSource: string; originalSourceSha256: string; source: string; sourceSha256: string;
    footprintTiles: number[]; meshes: { name: string; evaluatedVertices: number }[];
  };
  expect(hash(readFileSync(new URL(provenance.originalSource, root)))).toBe(provenance.originalSourceSha256);
  expect(hash(readFileSync(new URL(provenance.source, root)))).toBe(provenance.sourceSha256);
  expect(provenance.meshes).toHaveLength(62);
  expect(new Set(provenance.meshes.map(mesh => mesh.name)).size).toBe(62);
  expect(provenance.meshes.filter(mesh => mesh.name.startsWith('Individual walnut tabletop plank.'))).toHaveLength(4);
  expect(provenance.meshes.filter(mesh => mesh.name.startsWith('Worn wooden stool seat.'))).toHaveLength(3);
  expect(provenance.meshes.filter(mesh => mesh.name.startsWith('Enamel plate rim.'))).toHaveLength(3);
  const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('public/game-content/oblique-furniture.canteen-dining-table.v1.json', root), 'utf8')) as unknown);
  const footprint = defaultObjectRegistry.getById('object.dining-table')!.footprint;
  expect(provenance.footprintTiles).toEqual([footprint.width, footprint.height]);
  expect(catalog.assetId).toBe('furniture.dining.table.wooden');
  const physical = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.canteen.dining-table.angled-detail.provenance.json', root), 'utf8')) as {originalSource:string;originalSourceSha256:string;source:string;sourceSha256:string};
  expect(physical.originalSource).toBe(provenance.source);
  expect(physical.originalSourceSha256).toBe(provenance.sourceSha256);
  const soft = JSON.parse(readFileSync(new URL('assets/source/blender/furniture.canteen.dining-table.soft-light.provenance.json', root), 'utf8')) as {source:string;sourceSha256:string;retainedSource:string;retainedSourceSha256:string};
  expect(soft.retainedSource).toBe(physical.source);
  expect(soft.retainedSourceSha256).toBe(physical.sourceSha256);
  expect(catalog.source).toBe(soft.source);
  expect(catalog.sourceSha256).toBe('4f92eb8cebdb7f5d343f5ca49869c317535867932f05ab805bbd33b60144728f');
  expect(hash(readFileSync(new URL(soft.source, root)))).toBe(catalog.sourceSha256);
  expect(soft.sourceSha256).toBe(catalog.sourceSha256);
  expect(catalog.cameraTargetTiles).toEqual([footprint.width / 2, footprint.height / 2, 0.4725]);
  expect(catalog.nominalPixelsPerTile).toBe(64);
  expect(catalog.resolutionPx).toEqual([256, 256]);
  expect(catalog.pivotPx).toEqual([128, 128]);
  expect(catalog.frames).toHaveLength(72);
  for (const frame of catalog.frames) {
    const png = readFileSync(new URL(`public${frame.image}`, root));
    expect(hash(png), frame.image).toBe(frame.sha256);
    expect(png.subarray(0, 8), frame.image).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
    expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
    expect(hasTransparentBorder(png), frame.image).toBe(true);
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
