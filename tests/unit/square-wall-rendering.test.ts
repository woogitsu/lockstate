import { describe, expect, it } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { buildRowIndex } from '../../src/rendering/world/row-index';
import { isDrawnAsWorldEdge, type RenderStructure } from '../../src/rendering/world/structures';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { structuresFromConstruction } from '../../src/rendering/world/structures';

const at = { x: tileCoordinate(3), y: tileCoordinate(3) };
const pose = { target: { x: 3 * 64, y: 3 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 1, yawRadians: 0, elevationRadians: Math.PI / 4 };

function frame(world: SparseWorld, structures: readonly RenderStructure[] = []): RenderFrame {
  return { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()), structures, actors: [], rooms: [], roomConditions: [] };
}

describe('saved square geometry is painted in both renderers', () => {
  it('keeps authored fixture art beside a restored square wall without construction history', () => {
    const world = new SparseWorld(8);
    world.setSquareStructure(at, 1);
    const restored = SparseWorld.fromSnapshot(JSON.parse(JSON.stringify(world.snapshot())));
    const rendered = frame(restored, [{
      id: 'medical-bed', definitionId: 'medical-bed-wooden', tileX: 4, tileY: 3, phase: 'built',
    }]);
    const solids = projectObliqueWorldFrame(rendered, pose).raised.filter((item) => item.kind !== 'actor');
    expect(solids.map((solid) => solid.id).sort()).toEqual(['medical-bed', 'square-wall:3:3']);
    expect(solids.find((solid) => solid.id === 'medical-bed')?.assetId).toBe('furniture.medical-bed.variants');
    const wall = solids.find((solid) => solid.id === 'square-wall:3:3')!;
    expect(wall.footprint[1].x - wall.footprint[0].x).toBeCloseTo(64);
    expect(wall.footprint[2].y - wall.footprint[1].y).toBeCloseTo(64 * Math.SQRT1_2);
  });

  it('draws a full square after restoring the world without any construction-history fallback', () => {
    const world = new SparseWorld(8);
    world.setSquareStructure(at, 1);
    const restored = SparseWorld.fromSnapshot(JSON.parse(JSON.stringify(world.snapshot())));
    const rendered = frame(restored);
    expect(buildRowIndex(rendered.world, []).get(3)?.structures).toEqual([
      { id: 'square-wall:3:3', definitionId: 'wall-brick', tileX: 3, tileY: 3, phase: 'built', footprint: 'square' },
    ]);
    const solids = projectObliqueWorldFrame(rendered, pose).raised.filter((item) => item.kind !== 'actor');
    expect(solids).toHaveLength(1);
    expect(solids[0]?.footprint[1].x! - solids[0]?.footprint[0].x!).toBeCloseTo(64);
    expect(solids[0]?.footprint[2].y! - solids[0]?.footprint[1].y!).toBeCloseTo(64 * Math.SQRT1_2);
  });

  it('paints a square once and preserves its full footprint beside a legacy edge', () => {
    const world = new SparseWorld(8);
    world.setSquareStructure(at, 1);
    world.setTopEdge(at, 1);
    const completed = createBuildOrder('real-order', 'wall-brick', at, undefined, 0, 'square');
    completed.state = 'completed';
    const order = structuresFromConstruction({ ...new ConstructionSystem(world).snapshot(), orders: [completed] })[0]!;
    expect(order.footprint).toBe('square');
    const rendered = frame(world, [order]);
    expect(isDrawnAsWorldEdge(order)).toBe(false);
    expect(buildRowIndex(rendered.world, [order]).get(3)?.structures).toEqual([order]);
    const solids = projectObliqueWorldFrame(rendered, pose).raised.filter((item) => item.kind !== 'actor');
    expect(solids.filter((item) => item.id === 'real-order')).toHaveLength(1);
    expect(solids.filter((item) => item.kind === 'north-edge')).toHaveLength(1);
  });
});
