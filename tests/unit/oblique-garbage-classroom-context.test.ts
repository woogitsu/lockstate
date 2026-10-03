import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import type { ObjectOrientation } from '../../src/simulation/objects/placed-object';

const camera = { target: { x: 256, y: 256 }, viewport: { width: 1920, height: 1080 },
  zoom: 2, yawRadians: Math.PI / 4, elevationRadians: Math.PI / 4 };
const room = (roomCatalogId: string, width = 4, height = 4): RenderRoom => ({
  instanceId: `${roomCatalogId}:2:2`, roomCatalogId, anchorTileX: 2, anchorTileY: 2, width, height,
});
function projected(definitionId: string, rooms: readonly RenderRoom[], orientation: ObjectOrientation = 0,
  x = 3, y = 3, phase: 'built' | 'planned' = 'built') {
  const world = new SparseWorld(16); const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk); world.setOwned(chunk, true);
  const frame: RenderFrame = { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()),
    structures: [{ id: 'purchased-fixture', definitionId, tileX: x, tileY: y, phase, orientation }],
    rooms, actors: [], roomConditions: [] };
  return projectObliqueWorldFrame(frame, camera).raised.find(item => item.id === 'purchased-fixture');
}

describe('authored room furniture in the actual projection', () => {
  it.each([0, 1, 2, 3] as const)('uses refuse trolley for completed Garbage Room bin orientation %s', orientation => {
    expect(projected('waste-bin-brick', [room('room.garbage-room')], orientation)?.assetId)
      .toBe('fixture.garbage-room.waste-bin');
  });
  it('preserves Yard and ordinary bin presentation and excludes unfinished bins', () => {
    expect(projected('waste-bin-brick', [room('room.yard')])?.assetId).toBe('fixture.yard.steel-waste-bin');
    expect(projected('waste-bin-brick', [])?.assetId).toBe('fixture.cell.waste_bin');
    expect(projected('waste-bin-brick', [room('room.garbage-room')], 0, 1, 3)?.assetId).toBe('fixture.cell.waste_bin');
    expect(projected('waste-bin-brick', [room('room.garbage-room')], 0, 3, 3, 'planned')?.assetId).toBe('fixture.cell.waste_bin');
  });
  it.each([0, 1, 2, 3] as const)('uses teaching desk only when the entire rotated footprint fits, orientation %s', orientation => {
    expect(projected('desk-wooden', [room('room.classroom')], orientation)?.assetId).toBe('furniture.classroom.teacher-desk');
    const horizontal = orientation % 2 === 0;
    expect(projected('desk-wooden', [room('room.classroom', horizontal ? 2 : 4, horizontal ? 4 : 2)], orientation)?.assetId)
      .toBe('furniture.office.desk.generic');
  });
  it('preserves generic desks and Classroom chairs, including planned desks', () => {
    expect(projected('desk-wooden', [])?.assetId).toBe('furniture.office.desk.generic');
    expect(projected('desk-wooden', [room('room.classroom')], 0, 3, 3, 'planned')?.assetId).toBe('furniture.office.desk.generic');
    expect(projected('chair-wooden', [room('room.classroom')])?.assetId).toBe('furniture.classroom.school-chair');
  });
  it('loads both selected assets from the real runtime registry and matching descriptors', () => {
    const root = new URL('../../public/', import.meta.url);
    const registry = parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json', root), 'utf8')));
    for (const assetId of ['fixture.garbage-room.waste-bin', 'furniture.classroom.teacher-desk']) {
      const entry = registry.entries.find(row => row.assetId === assetId);
      expect(entry, assetId).toBeDefined();
      const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(entry!.manifest.slice(1), root), 'utf8')));
      expect(catalog.assetId).toBe(assetId);
      expect(catalog.frames).toHaveLength(72);
    }
  });
});
