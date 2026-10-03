import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import type { RenderStructure } from '../../src/rendering/world/structures';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { obliqueAssetIdForPlacedObject, obliqueCatalogForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';

const publicRoot = new URL('../../public/', import.meta.url);
const assetId = 'furniture.corridor.bench.variants';
const room: RenderRoom = { instanceId: 'room.holding-cell:21:6', roomCatalogId: 'room.holding-cell', anchorTileX: 21, anchorTileY: 6, width: 4, height: 4 };
const json = (path: string): unknown => JSON.parse(readFileSync(new URL(path, publicRoot), 'utf8')) as unknown;
function registeredCatalog() {
  const registry = parseObliqueModuleRegistry(json('game-content/oblique-module-registry.v1.json'));
  const entries = registry.entries.filter(entry => entry.assetId === assetId);
  expect(entries).toEqual([{ assetId, manifest: '/game-content/oblique-canteen-bench.v1.json' }]);
  const entry = entries[0]!;
  const catalog = parseObliqueModuleCatalog(json(entry.manifest.slice(1)));
  expect(catalog.source).toBe('assets/source/blender/furniture.corridor.bench.grounded-detail.blend');
  expect(catalog.sourceSha256).toBe('8518e5d755352f6511bcb4f2165674e1bca44f918f945e7c5cfa09b60ba05986');
  expect(obliqueCatalogForObject('object.bench', new Map([[catalog.assetId, catalog]]))).toBe(catalog);
  return catalog;
}
function renderFrame(structures: readonly RenderStructure[]): RenderFrame {
  const world = new SparseWorld(16), coordinate = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(coordinate); world.setOwned(coordinate, true);
  return { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()), structures, rooms: [room], actors: [], roomConditions: [] };
}

describe('existing completed bench consumers select the genuinely grounded retained assembly', () => {
  it.each([0, 1] as const)('selects both literal Holding Cell benches q%s at world60/-30 and elevation40', turns => {
    const result = createRoomTemplateBuildPlan('holding-cell-basic', { x: 20, y: 5 }, false, 2, turns);
    expect(result.plan.zone).toEqual({ roomId: 'room.holding-cell', x: 21, y: 6, width: 4, height: 4 });
    const orders = result.orders.filter(order => order.definitionId === 'bench-wooden');
    expect(orders.map(order => [order.location.x, order.location.y])).toEqual(turns === 0 ? [[21, 6], [23, 8]] : [[24, 6], [22, 8]]);
    expect(orders.map(order => order.id)).toEqual(['room-template-000000000002-2-object-000', 'room-template-000000000002-2-object-001']);
    expect(orders.map(order => order.objectOrientation ?? 0)).toEqual([turns, turns]);
    const structures = orders.map((order): RenderStructure => ({ id: order.id, definitionId: order.definitionId, tileX: order.location.x,
      tileY: order.location.y, orientation: order.objectOrientation ?? 0, phase: 'built' }));
    const frame = renderFrame(structures), original = JSON.stringify({ structures, rooms: frame.rooms });
    const camera = { target: { x: 23 * 64, y: 8 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 2,
      yawRadians: (turns === 0 ? 60 : -30) * Math.PI / 180, elevationRadians: 40 * Math.PI / 180 };
    const projected = projectObliqueWorldFrame(frame, camera), catalog = registeredCatalog();
    for (const structure of structures) {
      const solid = projected.raised.find(item => item.id === structure.id);
      expect(solid?.assetId).toBe(assetId);
      if (solid === undefined) throw new Error('Real planned bench consumer absent');
      const selected = selectObliqueModuleFrame(catalog, { yawRadians: solid.assetYawRadians ?? camera.yawRadians, elevationRadians: camera.elevationRadians });
      expect(selected).toEqual({ yawDegrees: 60, elevationDegrees: 40,
        image: '/assets/environment/oblique/furniture.corridor.bench.variants-yaw+60-elev40.b2399fd4b40d.png',
        sha256: 'b2399fd4b40d565ea877fc4af39be18468d191cd5faf5f95bb00c6519c00096a' });
      expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1), publicRoot))).digest('hex')).toBe(selected.sha256);
    }
    expect(JSON.stringify({ structures, rooms: frame.rooms })).toBe(original);
  });

  it('preserves existing Yard and Common Room skins, full footprint eligibility and ordinary default fallback', () => {
    const common = { ...room, instanceId: 'common', roomCatalogId: 'room.common-room' };
    const yard = { ...room, instanceId: 'yard', roomCatalogId: 'room.yard' };
    expect(obliqueAssetIdForPlacedObject('object.bench', 21, 6, { width: 2, height: 1 }, [common])).toBe('furniture.common-room.upholstered-bench');
    expect(obliqueAssetIdForPlacedObject('object.bench', 24, 6, { width: 1, height: 2 }, [yard])).toBe('furniture.yard.steel-bench');
    expect(obliqueAssetIdForPlacedObject('object.bench', 24, 6, { width: 2, height: 1 }, [common])).toBe(assetId);
    expect(obliqueAssetIdForPlacedObject('object.bench', 21, 9, { width: 1, height: 2 }, [yard])).toBe(assetId);
    expect(obliqueAssetIdForPlacedObject('object.bench', 24, 6, { width: 2, height: 1 }, [common, { ...common, instanceId: 'adjacent', anchorTileX: 25 }])).toBe(assetId);
    expect(obliqueAssetIdForPlacedObject('object.bench', 21, 6, { width: 2, height: 1 }, [{ ...room, roomCatalogId: 'room.canteen' }])).toBe(assetId);
    expect(obliqueAssetIdForPlacedObject('object.bench', 1, 1, { width: 2, height: 1 }, [])).toBe(assetId);
  });
});
