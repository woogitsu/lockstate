import { describe, expect, it } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { selectObliqueWallJunctions } from '../../src/rendering/scene/oblique-wall-junctions';

const camera = {
  target: { x: 192, y: 128 }, viewport: { width: 1920, height: 1080 },
  zoom: 2, yawRadians: Math.PI / 4, elevationRadians: Math.PI / 4,
};

function projectedWalls() {
  const world = new SparseWorld(8);
  world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  world.setTopEdge({ x: tileCoordinate(2), y: tileCoordinate(2) }, 1);
  world.setLeftEdge({ x: tileCoordinate(3), y: tileCoordinate(1) }, 1);
  world.setLeftEdge({ x: tileCoordinate(3), y: tileCoordinate(2) }, 1);
  const snapshot = world.snapshot();
  const frame = { revision: 1, world: WorldRenderView.fromSnapshot(snapshot),
    structures: [], actors: [], rooms: [], roomConditions: [] };
  return { world, snapshot, frame, projection: projectObliqueWorldFrame(frame, camera) };
}

describe('real projected wall junction composition', () => {
  it('prioritizes one T over two corners without changing world edges or saved state', () => {
    const { world, snapshot, projection } = projectedWalls();
    const before = JSON.stringify(snapshot);
    const result = selectObliqueWallJunctions(projection.raised, () => true, () => false);
    expect(result.placements.map((entry) => entry.assetId)).toEqual(['wall.interior.junction.t.west.full']);
    expect([...result.consumedIds].sort()).toEqual([
      'north-edge:2:2', 'west-edge:3:1', 'west-edge:3:2',
    ]);
    expect(result.placements[0]?.groundAnchor).toEqual({ x: (3 + 0.11) * 64, y: (2 + 0.11) * 64 });
    expect(JSON.stringify(world.snapshot())).toBe(before);
    const restored = SparseWorld.fromSnapshot(JSON.parse(before));
    expect(JSON.stringify(restored.snapshot())).toBe(before);
  });

  it('falls back to a single corner and then straight walls while frames stream', () => {
    const { projection } = projectedWalls();
    const corner = selectObliqueWallJunctions(projection.raised,
      (id) => id === 'wall.interior.corner.inner.north-east.full', () => false);
    expect(corner.placements.map((entry) => entry.assetId)).toEqual(['wall.interior.corner.inner.north-east.full']);
    expect(corner.consumedIds.size).toBe(2);
    const bare = selectObliqueWallJunctions(projection.raised, () => false, () => false);
    expect(bare.placements).toEqual([]);
    expect(bare.consumedIds.size).toBe(0);
  });

  it('uses the low T variant when any incident wall cuts away', () => {
    const { projection } = projectedWalls();
    const result = selectObliqueWallJunctions(projection.raised, () => true,
      (item) => item.id === 'west-edge:3:2');
    expect(result.placements.map((entry) => entry.assetId)).toEqual(['wall.interior.junction.t.west.cutaway']);
  });
});
