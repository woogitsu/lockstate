import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import type { RenderStructure } from '../../src/rendering/world/structures';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { obliqueAssetIdForPlacedObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';

const assetId = 'furniture.staff-room.padded-chair';
const publicRoot = new URL('../../public/', import.meta.url);
const staffRoom: RenderRoom = { instanceId: 'room.staff-room:5:5', roomCatalogId: 'room.staff-room',
  anchorTileX: 5, anchorTileY: 5, width: 4, height: 4 };
const literalChairs = { 0: [[5, 6], [7, 7]], 1: [[7, 5], [6, 7]] } as const;

function camera(turns: 0 | 1 = 0): ObliqueCameraState {
  return { target: { x: 7 * 64, y: 7 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 2,
    yawRadians: (turns === 0 ? 60 : -30) * Math.PI / 180, elevationRadians: 40 * Math.PI / 180 };
}

function frame(structures: readonly RenderStructure[], rooms: readonly RenderRoom[] = [staffRoom]): RenderFrame {
  const world = new SparseWorld(16);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk); world.setOwned(chunk, true);
  return { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()), structures, rooms, actors: [], roomConditions: [] };
}

function chair(tileX = 5, tileY = 6, phase: RenderStructure['phase'] = 'built'): RenderStructure {
  return { id: 'ordinary-chair', definitionId: 'chair-wooden', tileX, tileY, phase };
}

describe('Staff Room ObjectChair context in the actual world projection', () => {
  it.each([0, 1] as const)('selects BOTH literal completed Staff Room chairs q%s with their canonical source60/e40 frame', turns => {
    const { plan, orders } = createRoomTemplateBuildPlan('staff-room-basic', { x: 4, y: 4 }, false, 2, turns);
    expect(plan.zone).toEqual({ roomId: 'room.staff-room', x: 5, y: 5, width: 4, height: 4 });
    expect(plan.objects.filter(object => object.buildableId === 'chair-wooden').map(object => [object.x, object.y])).toEqual(literalChairs[turns]);
    expect(plan.objects).toHaveLength(3);
    const chairOrders = orders.filter(order => order.definitionId === 'chair-wooden');
    expect(chairOrders.map(order => order.id)).toEqual(['room-template-000000000002-2-object-001', 'room-template-000000000002-2-object-002']);
    expect(chairOrders.map(order => [order.location.x, order.location.y])).toEqual(literalChairs[turns]);
    expect(chairOrders.map(order => order.objectOrientation ?? 0)).toEqual([turns, turns]);
    const structures = chairOrders.map((order): RenderStructure => ({
      id: order.id, definitionId: order.definitionId, tileX: order.location.x, tileY: order.location.y,
      phase: 'built', orientation: order.objectOrientation ?? 0,
    }));
    const actualFrame = frame(structures);
    const before = JSON.stringify({ structures: actualFrame.structures, rooms: actualFrame.rooms });
    const projected = projectObliqueWorldFrame(actualFrame, camera(turns));
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('game-content/oblique-furniture-staff-room-padded-chair.v1.json', publicRoot), 'utf8')));
    expect(catalog.source).toBe('assets/source/blender/furniture.staff-room.padded-chair.soft-light.blend');
    expect(catalog.sourceSha256).toBe('2dde0a33689685fd067c124c82b7b88b31c606d6c950a0789903e1b0b4b0e934');
    for (const structure of structures) {
      const solid = projected.raised.find(item => item.id === structure.id);
      expect(solid?.assetId, 'actual Staff Room chair context selector').toBe(assetId);
      if (solid === undefined) throw new Error('Literal purchased Staff Room chair absent from projection');
      const selected = selectObliqueModuleFrame(catalog, { yawRadians: solid.assetYawRadians ?? camera(turns).yawRadians,
        elevationRadians: camera(turns).elevationRadians });
      expect(selected).toEqual({ yawDegrees: 60, elevationDegrees: 40,
        image: '/assets/environment/oblique/furniture.staff-room.padded-chair-yaw+60-elev40.a200ce9518d2.png',
        sha256: 'a200ce9518d232a2ef0f6bdac0343738042804f87fb3e57f67c9f648345682f8' });
      expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1), publicRoot))).digest('hex')).toBe(selected.sha256);
    }
    expect(JSON.stringify({ structures: actualFrame.structures, rooms: actualFrame.rooms }),
      'presentation selection preserves published owners and room rectangles').toBe(before);
  });

  it.each(['planned', 'building'] as const)('preserves ordinary chair art for %s Staff Room objects', phase => {
    const projected = projectObliqueWorldFrame(frame([chair(5, 6, phase)]), camera());
    expect(projected.raised.find(item => item.id === 'ordinary-chair')?.assetId).toBe('furniture.chair.wooden');
  });

  it('preserves Classroom/default/other-room chairs and refuses a footprint outside Staff Room', () => {
    for (const [rooms, structure, expected] of [
      [[], chair(), 'furniture.chair.wooden'],
      [[{ ...staffRoom, instanceId: 'room.classroom:5:5', roomCatalogId: 'room.classroom' }], chair(), 'furniture.classroom.student-chair'],
      [[{ ...staffRoom, instanceId: 'room.reception:5:5', roomCatalogId: 'room.reception' }], chair(), 'furniture.reception.waiting-armchair'],
      [[staffRoom], chair(4, 6), 'furniture.chair.wooden'],
      [[staffRoom], chair(9, 6), 'furniture.chair.wooden'],
      [[staffRoom], chair(5, 4), 'furniture.chair.wooden'],
      [[staffRoom], chair(5, 9), 'furniture.chair.wooden'],
    ] satisfies [readonly RenderRoom[], RenderStructure, string][]) {
      expect(projectObliqueWorldFrame(frame([structure], rooms), camera()).raised.find(item => item.id === structure.id)?.assetId).toBe(expected);
    }
  });

  it('selects the Staff Room employee desk while preserving unrelated furniture', () => {
    const structures: RenderStructure[] = [
      { id: 'desk', definitionId: 'desk-wooden', tileX: 5, tileY: 5, phase: 'built' },
      { id: 'bin', definitionId: 'waste-bin-brick', tileX: 7, tileY: 7, phase: 'built' },
    ];
    const projected = projectObliqueWorldFrame(frame(structures), camera());
    expect(projected.raised.find(item => item.id === 'desk')?.assetId).toBe('furniture.office.desk.employee.variants');
    expect(projected.raised.find(item => item.id === 'bin')?.assetId).toBe('fixture.cell.waste_bin');
  });

  it('uses the entire occupied footprint and never aggregates two adjacent rooms', () => {
    expect(obliqueAssetIdForPlacedObject('object.chair', 8, 8, { width: 1, height: 1 }, [staffRoom])).toBe(assetId);
    expect(obliqueAssetIdForPlacedObject('object.chair', 8, 8, { width: 2, height: 1 }, [staffRoom])).toBe('furniture.chair.wooden');
    expect(obliqueAssetIdForPlacedObject('object.chair', 8, 8, { width: 1, height: 2 }, [staffRoom])).toBe('furniture.chair.wooden');
    expect(obliqueAssetIdForPlacedObject('object.chair', 8, 8, { width: 2, height: 1 },
      [staffRoom, { ...staffRoom, instanceId: 'room.staff-room:9:5', anchorTileX: 9 }])).toBe('furniture.chair.wooden');
  });

  it('registers the selected asset once with its real source and complete descriptor', () => {
    const registry = parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json', publicRoot), 'utf8')));
    const entries = registry.entries.filter(entry => entry.assetId === assetId);
    expect(entries, 'actual runtime Staff Room registry entry').toEqual([{ assetId,
      manifest: '/game-content/oblique-furniture-staff-room-padded-chair.v1.json' }]);
    const entry = entries[0];
    if (entry === undefined) throw new Error('Staff Room asset absent from runtime registry');
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(entry.manifest.slice(1), publicRoot), 'utf8')));
    expect(catalog.assetId).toBe(assetId);
    expect(catalog.source).toBe('assets/source/blender/furniture.staff-room.padded-chair.soft-light.blend');
    expect(catalog.sourceSha256).toBe('2dde0a33689685fd067c124c82b7b88b31c606d6c950a0789903e1b0b4b0e934');
    expect(catalog.frames).toHaveLength(72);
  });
});
