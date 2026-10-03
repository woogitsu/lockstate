import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import type { RenderStructure } from '../../src/rendering/world/structures';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';

const assetId = 'furniture.reception.waiting-armchair';
const publicRoot = new URL('../../public/', import.meta.url);
const reception: RenderRoom = { instanceId: 'room.reception:5:5', roomCatalogId: 'room.reception',
  anchorTileX: 5, anchorTileY: 5, width: 4, height: 4 };
const literalChairs = { 0: [[5, 6], [7, 7]], 1: [[7, 5], [6, 7]] } as const;

function camera(turns: 0 | 1 = 0): ObliqueCameraState {
  return { target: { x: 7 * 64, y: 7 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 2,
    yawRadians: (turns === 0 ? 60 : -30) * Math.PI / 180, elevationRadians: 40 * Math.PI / 180 };
}

function frame(structures: readonly RenderStructure[], rooms: readonly RenderRoom[] = [reception]): RenderFrame {
  const world = new SparseWorld(16);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk); world.setOwned(chunk, true);
  return { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()), structures, rooms, actors: [], roomConditions: [] };
}

function chair(tileX = 5, tileY = 6, phase: RenderStructure['phase'] = 'built'): RenderStructure {
  return { id: 'ordinary-chair', definitionId: 'chair-wooden', tileX, tileY, phase };
}

describe('Reception ObjectChair context in the actual world projection', () => {
  it.each([0, 1] as const)('selects BOTH literal completed Reception chairs q%s with their canonical source60/e40 frame', turns => {
    const structures = literalChairs[turns].map(([tileX, tileY], index): RenderStructure => ({
      id: `room-template-000000000002-2-object-${String(index + 1).padStart(3, '0')}`,
      definitionId: 'chair-wooden', tileX, tileY, phase: 'built', orientation: turns,
    }));
    const actualFrame = frame(structures);
    const before = JSON.stringify({ structures: actualFrame.structures, rooms: actualFrame.rooms });
    const projected = projectObliqueWorldFrame(actualFrame, camera(turns));
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('game-content/oblique-furniture-reception-waiting-armchair.v1.json', publicRoot), 'utf8')));
    for (const structure of structures) {
      const solid = projected.raised.find(item => item.id === structure.id);
      expect(solid?.assetId, 'actual Reception chair context selector').toBe(assetId);
      if (solid === undefined) throw new Error('Literal purchased Reception chair absent from projection');
      const selected = selectObliqueModuleFrame(catalog, { yawRadians: solid.assetYawRadians ?? camera(turns).yawRadians,
        elevationRadians: camera(turns).elevationRadians });
      expect(selected).toEqual({ yawDegrees: 60, elevationDegrees: 40,
        image: '/assets/environment/oblique/furniture.reception.waiting-armchair-yaw+60-elev40.4e6ee8fdb156.png',
        sha256: '4e6ee8fdb156be06a9d023f8806d90aede0b12552d048dcdba383c5f68b4cb0d' });
      expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1), publicRoot))).digest('hex')).toBe(selected.sha256);
    }
    expect(JSON.stringify({ structures: actualFrame.structures, rooms: actualFrame.rooms }),
      'presentation selection preserves published owners and room rectangles').toBe(before);
  });

  it.each(['planned', 'building'] as const)('preserves ordinary chair art for %s Reception objects', phase => {
    const projected = projectObliqueWorldFrame(frame([chair(5, 6, phase)]), camera());
    expect(projected.raised.find(item => item.id === 'ordinary-chair')?.assetId).toBe('furniture.chair.wooden');
  });

  it('preserves Classroom/default/other-room chairs and refuses a footprint outside Reception', () => {
    for (const [rooms, structure, expected] of [
      [[], chair(), 'furniture.chair.wooden'],
      [[{ ...reception, instanceId: 'room.classroom:5:5', roomCatalogId: 'room.classroom' }], chair(), 'furniture.classroom.student-chair'],
      [[{ ...reception, instanceId: 'room.staff-room:5:5', roomCatalogId: 'room.staff-room' }], chair(), 'furniture.chair.wooden'],
      [[reception], chair(4, 6), 'furniture.chair.wooden'],
      [[reception], chair(9, 6), 'furniture.chair.wooden'],
      [[reception], chair(5, 4), 'furniture.chair.wooden'],
      [[reception], chair(5, 9), 'furniture.chair.wooden'],
    ] satisfies [readonly RenderRoom[], RenderStructure, string][]) {
      expect(projectObliqueWorldFrame(frame([structure], rooms), camera()).raised.find(item => item.id === structure.id)?.assetId).toBe(expected);
    }
  });

  it('selects the Reception registration desk while preserving unrelated furniture', () => {
    const structures: RenderStructure[] = [
      { id: 'desk', definitionId: 'desk-wooden', tileX: 5, tileY: 5, phase: 'built' },
      { id: 'bin', definitionId: 'waste-bin-brick', tileX: 7, tileY: 7, phase: 'built' },
    ];
    const projected = projectObliqueWorldFrame(frame(structures), camera());
    expect(projected.raised.find(item => item.id === 'desk')?.assetId).toBe('furniture.reception.registration-desk');
    expect(projected.raised.find(item => item.id === 'bin')?.assetId).toBe('fixture.cell.waste_bin');
  });

  it('registers the selected asset once with its real source and complete descriptor', () => {
    const registry = parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json', publicRoot), 'utf8')));
    const entries = registry.entries.filter(entry => entry.assetId === assetId);
    expect(entries, 'actual runtime Reception registry entry').toEqual([{ assetId,
      manifest: '/game-content/oblique-furniture-reception-waiting-armchair.v1.json' }]);
    const entry = entries[0];
    if (entry === undefined) throw new Error('Reception asset absent from runtime registry');
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(entry.manifest.slice(1), publicRoot), 'utf8')));
    expect(catalog.assetId).toBe(assetId);
    expect(catalog.source).toBe('assets/source/blender/furniture.reception.waiting-armchair.blend');
    expect(catalog.sourceSha256).toBe('12cd91c54feb1d35603752eb7efe5c6245be190d77aa31d6e6b81121ea18457d');
    expect(catalog.frames).toHaveLength(72);
  });
});
