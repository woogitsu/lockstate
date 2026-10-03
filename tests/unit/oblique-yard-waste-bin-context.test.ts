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

function frame(rooms: readonly RenderRoom[], phase: 'built' | 'planned' = 'built'): RenderFrame {
  const world = new SparseWorld(16);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);
  world.setOwned(chunk, true);
  return {
    revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()),
    structures: [{ id: 'existing-bin', definitionId: 'waste-bin-brick', tileX: 3, tileY: 3, phase }],
    rooms, actors: [], roomConditions: [],
  };
}

const room = (roomCatalogId: string, x: number, y: number, width: number, height: number): RenderRoom => ({
  instanceId: `${roomCatalogId}:${x}:${y}`, roomCatalogId, anchorTileX: x, anchorTileY: y, width, height,
});

describe('existing waste bin gets Yard art only inside an authoritative Yard rectangle', () => {
  it.each([
    { rooms: [room('room.yard', 2, 2, 4, 4)], phase: 'built' as const, expected: 'fixture.yard.steel-waste-bin' },
    { rooms: [room('room.yard', 4, 3, 1, 1)], phase: 'built' as const, expected: 'fixture.cell.waste_bin' },
    { rooms: [room('room.garbage-room', 2, 2, 4, 4)], phase: 'built' as const, expected: 'fixture.garbage-room.waste-bin' },
    { rooms: [], phase: 'built' as const, expected: 'fixture.cell.waste_bin' },
    { rooms: [room('room.yard', 2, 2, 4, 4)], phase: 'planned' as const, expected: 'fixture.cell.waste_bin' },
  ])('selects $expected for $phase waste bin with rooms $rooms', ({ rooms, phase, expected }) => {
    const bin = projectObliqueWorldFrame(frame(rooms, phase), camera).raised.find(item => item.id === 'existing-bin');
    expect(bin?.assetId).toBe(expected);
  });
});
