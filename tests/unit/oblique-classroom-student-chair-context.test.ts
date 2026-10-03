import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import { CLASSROOM_CASES, CLASSROOM_PLAN, classroomOwner } from '../fixtures/native-classroom-desk-plan';
import { obliqueAssetIdForPlacedObject } from '../../src/rendering/assets/oblique-object-mapping';
import type { RenderStructure } from '../../src/rendering/world/structures';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';

const assetId = 'furniture.classroom.student-chair';
const publicRoot = new URL('../../public/', import.meta.url);
const classroom: RenderRoom = { instanceId: 'room.classroom:5:5', roomCatalogId: 'room.classroom',
  anchorTileX: CLASSROOM_PLAN.roomAnchor.x, anchorTileY: CLASSROOM_PLAN.roomAnchor.y,
  width: CLASSROOM_PLAN.roomWidth, height: CLASSROOM_PLAN.roomHeight };

function camera(turns: 0 | 1 = 0): ObliqueCameraState {
  return { target: { x: 7 * 64, y: 7 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 2,
    yawRadians: (turns === 0 ? 60 : -30) * Math.PI / 180, elevationRadians: 40 * Math.PI / 180 };
}

function frame(structures: readonly RenderStructure[], rooms: readonly RenderRoom[] = [classroom]): RenderFrame {
  const world = new SparseWorld(16);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk); world.setOwned(chunk, true);
  return { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()), structures, rooms, actors: [], roomConditions: [] };
}

function chair(tileX = 5, tileY = 6, phase: RenderStructure['phase'] = 'built'): RenderStructure {
  return { id: 'ordinary-chair', definitionId: 'chair-wooden', tileX, tileY, phase };
}

describe('Classroom student ObjectChair context in the actual world projection', () => {
  it.each([0, 1] as const)('selects ALL FOUR literal completed Classroom chairs q%s with their canonical source60/e40 frame', turns => {
    const structures = CLASSROOM_CASES[turns].objects.map(([, definitionId, tileX, tileY], index): RenderStructure => ({
      id: classroomOwner('object', index), definitionId, tileX, tileY, phase: 'built', orientation: turns,
    }));
    const actualFrame = frame(structures);
    const before = JSON.stringify({ structures: actualFrame.structures, rooms: actualFrame.rooms });
    const projected = projectObliqueWorldFrame(actualFrame, camera(turns));
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('game-content/oblique-furniture-classroom-student-chair.v1.json', publicRoot), 'utf8')));
    const students = structures.filter(structure => structure.definitionId === 'chair-wooden');
    expect(students).toHaveLength(4);
    for (const structure of students) {
      expect(structure.tileX).toBeGreaterThanOrEqual(5);
      expect(structure.tileY).toBeGreaterThanOrEqual(5);
      expect(structure.tileX + 1).toBeLessThanOrEqual(10);
      expect(structure.tileY + 1).toBeLessThanOrEqual(10);
      const solid = projected.raised.find(item => item.id === structure.id);
      expect(solid?.assetId, 'actual Classroom student chair context selector').toBe(assetId);
      if (solid === undefined) throw new Error('Literal template-purchased Classroom chair absent from projection');
      const selected = selectObliqueModuleFrame(catalog, { yawRadians: solid.assetYawRadians ?? camera(turns).yawRadians,
        elevationRadians: camera(turns).elevationRadians });
      expect(selected).toEqual({ yawDegrees: 60, elevationDegrees: 40,
        image: '/assets/environment/oblique/furniture.classroom.student-chair-yaw+60-elev40.eb690a439214.png',
        sha256: 'eb690a4392146a594fa1b692a2dc0b28b881820e541a7125f7f112c474c50260' });
      expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1), publicRoot))).digest('hex')).toBe(selected.sha256);
    }
    expect(projected.raised.find(item => item.id === classroomOwner('object', 0))?.assetId).toBe('furniture.library.bookshelf.variants');
    expect(JSON.stringify({ structures: actualFrame.structures, rooms: actualFrame.rooms }),
      'presentation selection preserves published owners and room rectangles').toBe(before);
  });

  it.each(['planned', 'building'] as const)('preserves ordinary chair art for %s Classroom objects', phase => {
    const projected = projectObliqueWorldFrame(frame([chair(5, 6, phase)]), camera());
    expect(projected.raised.find(item => item.id === 'ordinary-chair')?.assetId).toBe('furniture.chair.wooden');
  });

  it('preserves default/Reception/other-room chairs and the entire Classroom footprint boundary', () => {
    for (const [rooms, structure, expected] of [
      [[], chair(), 'furniture.chair.wooden'],
      [[{ ...classroom, instanceId: 'room.reception:5:5', roomCatalogId: 'room.reception' }], chair(), 'furniture.reception.waiting-armchair'],
      [[{ ...classroom, instanceId: 'room.staff-room:5:5', roomCatalogId: 'room.staff-room' }], chair(), 'furniture.chair.wooden'],
      [[classroom], chair(4, 6), 'furniture.chair.wooden'],
      [[classroom], chair(10, 6), 'furniture.chair.wooden'],
      [[classroom], chair(5, 4), 'furniture.chair.wooden'],
      [[classroom], chair(5, 10), 'furniture.chair.wooden'],
      [[classroom], chair(9, 9), assetId],
      [[{ ...classroom, width: 1, height: 1 }, { ...classroom, roomCatalogId: 'room.staff-room', anchorTileX: 6 }], chair(6, 5), 'furniture.chair.wooden'],
    ] satisfies [readonly RenderRoom[], RenderStructure, string][]) {
      expect(projectObliqueWorldFrame(frame([structure], rooms), camera()).raised.find(item => item.id === structure.id)?.assetId).toBe(expected);
    }
    // An anchor alone is insufficient: check the public selector's full extent contract.
    expect(obliqueAssetIdForPlacedObject('object.chair', 9, 9, { width: 2, height: 1 }, [classroom])).toBe('furniture.chair.wooden');
    expect(obliqueAssetIdForPlacedObject('object.chair', 9, 9, { width: 1, height: 2 }, [classroom])).toBe('furniture.chair.wooden');
  });

  it('keeps the existing teacher desk and other furniture unchanged', () => {
    const structures: RenderStructure[] = [
      { id: 'desk', definitionId: 'desk-wooden', tileX: 5, tileY: 5, phase: 'built' },
      { id: 'bin', definitionId: 'waste-bin-brick', tileX: 7, tileY: 7, phase: 'built' },
    ];
    const projected = projectObliqueWorldFrame(frame(structures), camera());
    expect(projected.raised.find(item => item.id === 'desk')?.assetId).toBe('furniture.classroom.teacher-desk');
    expect(projected.raised.find(item => item.id === 'bin')?.assetId).toBe('fixture.cell.waste_bin');
  });

  it('registers the selected asset once with its real source and complete descriptor', () => {
    const registry = parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json', publicRoot), 'utf8')));
    const entries = registry.entries.filter(entry => entry.assetId === assetId);
    expect(entries, 'actual runtime Classroom student registry entry').toEqual([{ assetId,
      manifest: '/game-content/oblique-furniture-classroom-student-chair.v1.json' }]);
    const entry = entries[0];
    if (entry === undefined) throw new Error('Student chair asset absent from runtime registry');
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(entry.manifest.slice(1), publicRoot), 'utf8')));
    expect(catalog.assetId).toBe(assetId);
    expect(catalog.source).toBe('assets/source/blender/furniture.classroom.student-chair.blend');
    expect(catalog.sourceSha256).toBe('0c3d7dc54a594659c810f8e1d76bd4980bf1293f7a5b22c367805760de1a9b1b');
    expect(catalog.frames).toHaveLength(72);
    expect(registry.entries.filter(entry => entry.assetId === 'furniture.classroom.school-chair')).toEqual([{
      assetId: 'furniture.classroom.school-chair', manifest: '/game-content/oblique-furniture.classroom-chair.v1.json',
    }]);
  });
});
