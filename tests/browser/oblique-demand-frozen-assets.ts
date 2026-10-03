import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { parseObliqueModuleCatalog, type ObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { renderedArtCatalogSchema } from '../../src/rendering/assets/rendered-art-catalog';

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export function frozenPath(root: string, pathname: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, `.${decodeURIComponent(pathname)}`);
  if (!target.startsWith(absoluteRoot + sep)) throw new Error(`Served path escapes frozen client: ${pathname}`);
  return target;
}
/** Same byte equality as the existing native profile; never accept dev source. */
export function requireFrozenBytes(root: string, url: string, bytes: Uint8Array) {
  const pathname = new URL(url).pathname;
  if (pathname.startsWith('/src/')) throw new Error(`Source route is not a compiled subject: ${url}`);
  const target = frozenPath(root, pathname);
  if (!existsSync(target)) throw new Error(`Frozen delivered file absent: ${target}`);
  const actual = sha256(bytes), expected = sha256(readFileSync(target));
  if (actual !== expected) throw new Error(`Delivered bytes differ from frozen client: ${url}`);
  return { url, path: target, sha256: actual, bytes: bytes.byteLength };
}

export function readFrozenImageInventory(root: string) {
  const registry = parseObliqueModuleRegistry(JSON.parse(readFileSync(frozenPath(root, '/game-content/oblique-module-registry.v1.json'), 'utf8')));
  const catalogs = new Map<string, ObliqueModuleCatalog>();
  for (const entry of registry.entries) {
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(frozenPath(root, entry.manifest), 'utf8')));
    if (catalog.assetId !== entry.assetId) throw new Error(`Frozen registry/catalog id differs: ${entry.assetId}`);
    catalogs.set(entry.assetId, catalog);
  }
  const rendered = renderedArtCatalogSchema.parse(JSON.parse(readFileSync(frozenPath(root, '/game-content/rendered-art.v1.json'), 'utf8')));
  const floors = rendered.entries.filter(entry => entry.assetId.startsWith('floor.') || entry.assetId.startsWith('terrain.'));
  return { registry, catalogs, floors };
}

/** Independent explicit player-camera poses; no scene state/texture is inferred. */
export function cotFrameAtPublicPose(catalog: ObliqueModuleCatalog, yaw: 300 | 330, elevation: 40) {
  const frame = catalog.frames.find(row => row.yawDegrees === yaw && row.elevationDegrees === elevation);
  if (!frame) throw new Error(`Required authored cot pose absent: ${yaw}/${elevation}`);
  return frame;
}
