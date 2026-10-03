import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { obliqueAssetIdForPlacedObject } from '../../src/rendering/assets/oblique-object-mapping';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';

const root = new URL('../../', import.meta.url);
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const catalog = parseObliqueModuleCatalog(JSON.parse(readFileSync(
  new URL('public/game-content/oblique-reception-employee-desk.v1.json', root), 'utf8',
)) as unknown);

function room(roomCatalogId: string, x: number, y: number, width: number, height: number): RenderRoom {
  return { instanceId: `${roomCatalogId}:${x}:${y}`, roomCatalogId, anchorTileX: x, anchorTileY: y, width, height };
}

describe('existing employee desk in the Staff Room', () => {
  it('uses all 72 reproducible square-aligned Blender poses at exactly 64 pixels per tile', () => {
    expect(catalog.assetId).toBe('furniture.office.desk.employee.variants');
    expect(catalog.source).toBe('assets/source/blender/furniture.office.desk.employee.blend');
    expect(catalog.sourceSha256).toBe(sha256(readFileSync(new URL(catalog.source, root))));
    expect(catalog.resolutionPx).toEqual([512, 512]);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    expect(catalog.pivotPx).toEqual([256, 256]);
    expect(catalog.cameraTargetTiles).toEqual([1, 0.5, 0.55]);
    const exporter = readFileSync(new URL('tooling/blender/render-staff-room-desk-oblique.py', root), 'utf8');
    const scale = /^ORTHO_SCALE_TILES = ([0-9.]+)$/m.exec(exporter);
    expect(scale).not.toBeNull();
    expect(catalog.resolutionPx[0] / Number(scale![1])).toBe(catalog.nominalPixelsPerTile);
    expect(exporter).toContain('employee desk escapes its 2 x 1 occupied square');
    expect(catalog.yawDegrees).toHaveLength(12);
    expect(catalog.elevationDegrees).toHaveLength(6);
    expect(catalog.frames).toHaveLength(72);
    for (const frame of catalog.frames) {
      expect(sha256(readFileSync(new URL(`public${frame.image}`, root))), frame.image).toBe(frame.sha256);
    }
  });

  it('is loaded by the production registry exactly once', () => {
    const registry = JSON.parse(readFileSync(new URL('public/game-content/oblique-module-registry.v1.json', root), 'utf8')) as {
      entries: { assetId: string; manifest: string }[];
    };
    expect(registry.entries.filter(entry => entry.assetId === catalog.assetId)).toEqual([{
      assetId: catalog.assetId, manifest: '/game-content/oblique-reception-employee-desk.v1.json',
    }]);
  });

  it('selects employee art only when the entire real 2 x 1 desk fits the Staff Room', () => {
    const footprint = { width: 2, height: 1 };
    expect(obliqueAssetIdForPlacedObject('object.desk', 4, 4, footprint, [room('room.staff-room', 3, 3, 6, 6)]))
      .toBe(catalog.assetId);
    expect(obliqueAssetIdForPlacedObject('object.desk', 8, 4, footprint, [room('room.staff-room', 3, 3, 6, 6)]))
      .toBe('furniture.office.desk.generic');
    expect(obliqueAssetIdForPlacedObject('object.desk', 4, 4, footprint, [room('room.reception', 3, 3, 6, 6)]))
      .toBe('furniture.office.desk.generic');
    expect(obliqueAssetIdForPlacedObject('object.desk', 4, 4, footprint, []))
      .toBe('furniture.office.desk.generic');
  });

  it('projects the actual built desk to employee art while a planned desk stays generic', () => {
    const world = new SparseWorld(16);
    const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
    world.load(chunk);
    world.setOwned(chunk, true);
    const rooms = [room('room.staff-room', 3, 3, 6, 6)];
    const camera = {
      target: { x: 5 * 64, y: 5 * 64 }, viewport: { width: 1920, height: 1080 },
      zoom: 2, yawRadians: Math.PI / 4, elevationRadians: Math.PI / 4,
    };
    const frame = (phase: 'built' | 'planned'): RenderFrame => ({
      revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()),
      structures: [{ id: 'existing-desk', definitionId: 'desk-wooden', tileX: 4, tileY: 4, phase }],
      rooms, actors: [], roomConditions: [],
    });
    expect(projectObliqueWorldFrame(frame('built'), camera).raised.find(item => item.id === 'existing-desk')?.assetId)
      .toBe(catalog.assetId);
    expect(projectObliqueWorldFrame(frame('planned'), camera).raised.find(item => item.id === 'existing-desk')?.assetId)
      .toBe('furniture.office.desk.generic');
  });
});
