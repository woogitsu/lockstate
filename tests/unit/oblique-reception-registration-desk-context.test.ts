import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import type { RenderStructure } from '../../src/rendering/world/structures';
import { RECEPTION_CASES, receptionOwner } from '../fixtures/native-reception-room-plan';
import { groundToScreen } from '../../src/rendering/camera/oblique-projection';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';

const assetId = 'furniture.reception.registration-desk';
const publicRoot = new URL('../../public/', import.meta.url);
const reception: RenderRoom = { instanceId: 'room.reception:5:5', roomCatalogId: 'room.reception',
  anchorTileX: 5, anchorTileY: 5, width: 4, height: 4 };

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

function desk(tileX = 5, tileY = 5, phase: RenderStructure['phase'] = 'built'): RenderStructure {
  return { id: 'ordinary-desk', definitionId: 'desk-wooden', tileX, tileY, phase };
}

describe('Reception registration ObjectDesk context in the actual world projection', () => {
  it.each([0, 1] as const)('selects literal completed Reception desk with both retained waiting chairs q%s with their canonical source60/e40 frame', turns => {
    const [tileX, tileY, width, height] = RECEPTION_CASES[turns].desk;
    const structure: RenderStructure = { id: receptionOwner('object', 0), definitionId: 'desk-wooden',
      tileX, tileY, phase: 'built', orientation: turns };
    const structures: RenderStructure[] = [structure, ...RECEPTION_CASES[turns].chairs.map(([x, y], index): RenderStructure => ({
      id: receptionOwner('object', index + 1), definitionId: 'chair-wooden', tileX: x, tileY: y, phase: 'built', orientation: turns,
    }))];
    const actualFrame = frame(structures);
    const before = JSON.stringify({ structures: actualFrame.structures, rooms: actualFrame.rooms });
    const projected = projectObliqueWorldFrame(actualFrame, camera(turns));
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL('game-content/oblique-furniture-reception-registration-desk.v1.json', publicRoot), 'utf8')));
    {
      const solid = projected.raised.find(item => item.id === structure.id);
      expect(solid?.assetId, 'actual Reception registration desk context selector').toBe(assetId);
      if (solid === undefined) throw new Error('Literal purchased Reception desk absent from projection');
      if (solid.kind === 'actor') throw new Error('Desk projected as actor');
      const corners = [[tileX, tileY], [tileX + width, tileY], [tileX + width, tileY + height], [tileX, tileY + height]] as const;
      expect(solid.footprint).toEqual(corners.map(([x, y]) => groundToScreen({ x: x * 64, y: y * 64 }, camera(turns))));
      expect(tileX + width).toBeLessThanOrEqual(9);
      expect(tileY + height).toBeLessThanOrEqual(9);
      const selected = selectObliqueModuleFrame(catalog, { yawRadians: solid.assetYawRadians ?? camera(turns).yawRadians,
        elevationRadians: camera(turns).elevationRadians });
      expect(selected).toEqual({ yawDegrees: 60, elevationDegrees: 40,
        image: '/assets/environment/oblique/furniture.reception.registration-desk-yaw+60-elev40.bac55a0b3bac.png',
        sha256: 'bac55a0b3bacc977eeca707eaf444e58f8661171391a8d1c1d430e521204febe' });
      expect(createHash('sha256').update(readFileSync(new URL(selected.image.slice(1), publicRoot))).digest('hex')).toBe(selected.sha256);
    }
    for (const chair of structures.slice(1)) {
      expect(projected.raised.find(item => item.id === chair.id)?.assetId).toBe('furniture.reception.waiting-armchair');
    }
    expect(JSON.stringify({ structures: actualFrame.structures, rooms: actualFrame.rooms }),
      'presentation selection preserves published owners and room rectangles').toBe(before);
  });

  it.each(['planned', 'building'] as const)('preserves ordinary desk art for %s Reception objects', phase => {
    const projected = projectObliqueWorldFrame(frame([desk(5, 5, phase)]), camera());
    expect(projected.raised.find(item => item.id === 'ordinary-desk')?.assetId).toBe('furniture.office.desk.generic');
  });

  it('preserves default/Classroom/Staff desk contexts and refuses any partial occupied footprint', () => {
    for (const [rooms, structure, expected] of [
      [[], desk(), 'furniture.office.desk.generic'],
      [[{ ...reception, instanceId: 'room.classroom:5:5', roomCatalogId: 'room.classroom' }], desk(), 'furniture.classroom.teacher-desk'],
      [[{ ...reception, instanceId: 'room.staff-room:5:5', roomCatalogId: 'room.staff-room' }], desk(), 'furniture.office.desk.employee.variants'],
      [[reception], desk(4, 5), 'furniture.office.desk.generic'],
      [[reception], desk(8, 5), 'furniture.office.desk.generic'],
      [[reception], desk(5, 4), 'furniture.office.desk.generic'],
      [[reception], desk(5, 9), 'furniture.office.desk.generic'],
      [[reception], desk(7, 8), assetId],
      [[reception], { ...desk(8, 8), orientation: 1 }, 'furniture.office.desk.generic'],
      [[{ ...reception, width: 3 }, { ...reception, instanceId: 'room.infirmary:8:5', roomCatalogId: 'room.infirmary', anchorTileX: 8 }], desk(7, 5), 'furniture.office.desk.generic'],
    ] satisfies [readonly RenderRoom[], RenderStructure, string][]) {
      expect(projectObliqueWorldFrame(frame([structure], rooms), camera()).raised.find(item => item.id === structure.id)?.assetId).toBe(expected);
    }
  });

  it('keeps Reception waiting chairs and other furniture unchanged', () => {
    const structures: RenderStructure[] = [
      { id: 'chair', definitionId: 'chair-wooden', tileX: 5, tileY: 6, phase: 'built' },
      { id: 'bin', definitionId: 'waste-bin-brick', tileX: 7, tileY: 7, phase: 'built' },
    ];
    const projected = projectObliqueWorldFrame(frame(structures), camera());
    expect(projected.raised.find(item => item.id === 'chair')?.assetId).toBe('furniture.reception.waiting-armchair');
    expect(projected.raised.find(item => item.id === 'bin')?.assetId).toBe('fixture.cell.waste_bin');
  });

  it('registers the selected asset once with its real source and complete descriptor', () => {
    const registry = parseObliqueModuleRegistry(JSON.parse(readFileSync(new URL('game-content/oblique-module-registry.v1.json', publicRoot), 'utf8')));
    const entries = registry.entries.filter(entry => entry.assetId === assetId);
    expect(entries, 'actual runtime Reception registration desk registry entry').toEqual([{ assetId,
      manifest: '/game-content/oblique-furniture-reception-registration-desk.v1.json' }]);
    const entry = entries[0];
    if (entry === undefined) throw new Error('Reception asset absent from runtime registry');
    const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(entry.manifest.slice(1), publicRoot), 'utf8')));
    expect(catalog.assetId).toBe(assetId);
    expect(catalog.source).toBe('assets/source/blender/furniture.reception.registration-desk.blend');
    expect(catalog.sourceSha256).toBe('be670aa62316c8f8557a1edbed75f3ac87df3ebe4bc78a3958c1e106347bb0dc');
    expect(catalog.frames).toHaveLength(72);
  });
});
