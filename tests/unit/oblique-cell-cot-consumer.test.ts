import { describe, expect, it } from 'vitest';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';

const camera: ObliqueCameraState = {
  target: { x: 4 * 64, y: 4 * 64 }, viewport: { width: 1920, height: 1080 },
  zoom: 2, yawRadians: Math.PI / 4, elevationRadians: Math.PI / 4,
};

const room = (roomCatalogId: string): RenderRoom => ({
  instanceId: `${roomCatalogId}:2:2`, roomCatalogId,
  anchorTileX: 2, anchorTileY: 2, width: 6, height: 7,
});

function frame(rooms: readonly RenderRoom[]): RenderFrame {
  const world = new SparseWorld(16);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);
  world.setOwned(chunk, true);
  return {
    revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()),
    structures: [{ id: 'built-bed', definitionId: 'bed-wooden', tileX: 3, tileY: 3, phase: 'built' }],
    rooms, actors: [], roomConditions: [],
  };
}

describe('authored full 1x2 Cell cot is the production visual for every built object.bed', () => {
  it.each([{ rooms: [] }, { rooms: [room('room.cell')] }, { rooms: [room('room.holding-cell')] }])('uses the full cot for rooms $rooms', ({ rooms }) => {
    const bed = projectObliqueWorldFrame(frame(rooms), camera).raised.find(item => item.id === 'built-bed');
    expect(bed?.assetId).toBe('furniture.cell.cot.single');
  });
});
