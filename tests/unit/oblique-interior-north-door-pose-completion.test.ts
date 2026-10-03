import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import { groundToScreen, type ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';

const root = new URL('../../', import.meta.url);
const json = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const registry = parseObliqueModuleRegistry(json('public/game-content/oblique-module-registry.v1.json'));
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const poses = [{ camera: 45, source: 45 }, { camera: 135, source: 135 },
  { camera: 225, source: -135 }, { camera: 315, source: -45 }];

describe('retained interior door descriptor reaches actual back-facing edge consumers', () => {
  it.each(['north', 'west'] as const)('%s preserves source, complete signed pose grid and all delivered PNG hashes', edge => {
    const assetId = edge === 'north' ? 'door.interior.open.full' : 'door.interior.open.west.full';
    const entry = registry.entries.find(value => value.assetId === assetId);
    if (!entry) throw new Error('Accepted door alias absent from actual registry');
    const catalog = parseObliqueModuleCatalog(json(`public${entry.manifest}`));
    expect(catalog.assetId).toBe(assetId);
    expect(catalog.source).toBe('door.interior.leaf.open.blend');
    expect(catalog.sourceSha256).toBe('48a27d1b212e88121e6b55661452f70df1129e78f8825eebc3913db1d5aeaf5f');
    expect(catalog.sourceDependencies).toEqual([{ source: 'wall.interior.cutaway.blend',
      sha256: '98b264c5b3ea15658d7d8996f403024928c660135a66025adccba1d385927e6c' }]);
    expect(catalog.yawDegrees).toEqual(Array.from({ length: 24 }, (_, index) => -180 + index * 15));
    expect(catalog.elevationDegrees).toEqual([25, 45, 65]);
    expect(catalog.frames).toHaveLength(72);
    expect(catalog.resolutionPx).toEqual([512, 512]);
    expect(catalog.pivotPx).toEqual([256, 256]);
    expect(catalog.cameraTargetTiles).toEqual([0, 0, 0]);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    for (const source of [{ source: catalog.source, sha256: catalog.sourceSha256 }, ...catalog.sourceDependencies!]) {
      const body = readFileSync(new URL(`assets/source/blender/${source.source}`, root));
      expect(createHash('sha256').update(body).digest('hex')).toBe(source.sha256);
    }
    for (const frame of catalog.frames) {
      const body = readFileSync(new URL(`public${frame.image}`, root));
      expect(createHash('sha256').update(body).digest('hex'), frame.image).toBe(frame.sha256);
      expect(body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([512, 512]);
    }
  });

  it.each(poses)('camera $camera selects authored $source for BOTH actual north/west doors without altering picking', ({ camera, source }) => {
    const world = new SparseWorld(8);
    const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
    world.load(chunk); world.setOwned(chunk, true);
    world.setTopEdge(tile(3, 4), 2); world.setLeftEdge(tile(4, 3), 2);
    const frame: RenderFrame = { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()),
      structures: [], actors: [], roomConditions: [], rooms: [{ instanceId: 'completed-cell',
        roomCatalogId: 'room.cell', anchorTileX: 3, anchorTileY: 3, width: 2, height: 2 }] };
    const before = JSON.stringify(world.snapshot());
    const pose: ObliqueCameraState = { target: { x: 256, y: 256 }, viewport: { width: 1920, height: 1080 },
      zoom: 0.5, yawRadians: camera * Math.PI / 180, elevationRadians: Math.PI / 4 };
    const projected = projectObliqueWorldFrame(frame, pose);
    for (const edge of ['north', 'west'] as const) {
      const id = edge === 'north' ? 'north-edge:3:4' : 'west-edge:4:3';
      const item = projected.raised.find(value => value.id === id);
      if (!item || (item.kind !== 'north-edge' && item.kind !== 'west-edge')) throw new Error('Actual door edge missing');
      const assetId = edge === 'north' ? 'door.interior.open.full' : 'door.interior.open.west.full';
      expect(item.assetId).toBe(assetId);
      const entry = registry.entries.find(value => value.assetId === item.assetId);
      if (!entry) throw new Error('Actual selected door has no registry entry');
      const catalog = parseObliqueModuleCatalog(json(`public${entry.manifest}`));
      const selected = selectObliqueModuleFrame(catalog, pose);
      expect(selected.yawDegrees, `${edge} back-facing camera ${camera}`).toBe(source);
      expect(selected.elevationDegrees).toBe(45);
      const [x, y, width, depth] = edge === 'north' ? [3, 4, 1, 0.22] : [4, 3, 0.22, 1];
      expect(item.footprint).toEqual([[x!, y!], [x! + width!, y!], [x! + width!, y! + depth!], [x!, y! + depth!]]
        .map(([a, b]) => groundToScreen({ x: a! * 64, y: b! * 64 }, pose)));
    }
    expect(JSON.stringify(world.snapshot())).toBe(before);
  });
});
