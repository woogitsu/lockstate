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

function frame(rooms: readonly RenderRoom[], phase: 'built' | 'planned' = 'built', tileX = 3, tileY = 3): RenderFrame {
  const world = new SparseWorld(16);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);
  world.setOwned(chunk, true);
  return {
    revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()),
    structures: [{ id: 'existing-rack', definitionId: 'storage-rack-wooden', tileX, tileY, phase }],
    rooms, actors: [], roomConditions: [],
  };
}

const room = (roomCatalogId: string, x: number, y: number, width: number, height: number): RenderRoom => ({
  instanceId: `${roomCatalogId}:${x}:${y}`, roomCatalogId, anchorTileX: x, anchorTileY: y, width, height,
});

describe('existing rack gets Storage Room art only inside an authoritative Storage Room rectangle', () => {
  it.each([
    { rooms: [room('room.storage-room', 2, 2, 4, 4)], phase: 'built' as const, x: 3, y: 3, expected: 'furniture.storage-room.timber-rack' },
    { rooms: [room('room.storage-room', 2, 2, 1, 1)], phase: 'built' as const, x: 3, y: 3, expected: 'furniture.storage.rack.wooden' },
    { rooms: [room('room.common-room', 2, 2, 4, 4)], phase: 'built' as const, x: 3, y: 3, expected: 'furniture.storage.rack.wooden' },
    { rooms: [], phase: 'built' as const, x: 3, y: 3, expected: 'furniture.storage.rack.wooden' },
    { rooms: [room('room.storage-room', 2, 2, 4, 4)], phase: 'planned' as const, x: 3, y: 3, expected: 'furniture.storage.rack.wooden' },
  ])('selects $expected for $phase rack', ({ rooms, phase, x, y, expected }) => {
    const rack = projectObliqueWorldFrame(frame(rooms, phase, x, y), camera).raised.find(item => item.id === 'existing-rack');
    expect(rack?.assetId).toBe(expected);
  });
});
