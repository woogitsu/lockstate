import { expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { projectedRectPrism } from '../../src/rendering/camera/oblique-geometry';
import type { Point } from '../../src/rendering/camera/coordinates';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';

function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (list: readonly Point[]) => {
    const result: Point[] = [];
    for (const p of list) {
      while (result.length > 1 && cross(result[result.length - 2]!, result.at(-1)!, p) <= 0) result.pop();
      result.push(p);
    }
    result.pop();
    return result;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function overlaps(a: readonly Point[], b: readonly Point[]): boolean {
  // Independent separating-axis check of the complete projected prism hulls.
  // A shared screen bounding rectangle alone does not establish occlusion.
  return [a, b].every(polygon => polygon.every((p, index) => {
    const q = polygon[(index + 1) % polygon.length]!;
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const axis = { x: -(q.y - p.y) / length, y: (q.x - p.x) / length };
    const range = (points: readonly Point[]) => points.map(point => point.x * axis.x + point.y * axis.y);
    const x = range(a), y = range(b);
    return Math.min(...x) < Math.max(...y) - 0.01 && Math.min(...y) < Math.max(...x) - 0.01;
  }));
}

it('keeps a cutaway wall when its whole projected volume does not overlap any interior fixture', () => {
  const plan = instantiateRoomTemplate('cell-basic', { x: 4, y: 4 });
  const world = new SparseWorld(32);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk); world.setOwned(chunk, true);
  const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
  for (const p of plan.wallSquares) world.setSquareStructure(tile(p.x, p.y), 1);
  for (const zone of plan.zones) for (let y = zone.y; y < zone.y + zone.height; y += 1)
    for (let x = zone.x; x < zone.x + zone.width; x += 1) world.setZoning(tile(x, y), 1);
  const frame: RenderFrame = {
    revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()), actors: [], rooms: [], roomConditions: [],
    structures: plan.objects.map((object, index) => ({ id: `fixture-${index}`, definitionId: object.buildableId,
      tileX: object.x, tileY: object.y, phase: 'built' })),
  };
  const falseHides: unknown[] = [];
  for (const elevation of [20, 25, 45, 65, 80]) for (let yaw = 0; yaw < 360; yaw += 15) {
    const camera: ObliqueCameraState = {
      target: { x: (plan.origin.x + plan.width / 2) * 64, y: (plan.origin.y + plan.height / 2) * 64 },
      viewport: { width: 1920, height: 1080 }, zoom: 2,
      yawRadians: yaw * Math.PI / 180, elevationRadians: elevation * Math.PI / 180,
    };
    const projection = projectObliqueWorldFrame(frame, camera);
    const present = new Set(projection.raised.map(item => item.id));
    const fixtures = projection.raised.filter(item => item.kind === 'structure' && item.id.startsWith('fixture-'));
    for (const wall of plan.wallSquares) {
      if (present.has(`square-wall:${wall.x}:${wall.y}`)) continue;
      const prism = projectedRectPrism(wall.x * 64, wall.y * 64, 64, 64, 0.34 * 64, camera);
      const wallHull = hull([...prism.footprint, ...prism.top]);
      if (!fixtures.some(fixture => fixture.kind === 'structure' && overlaps(wallHull, hull([...fixture.footprint, ...fixture.top]))))
        falseHides.push({ yaw, elevation, wall });
    }
  }
  console.log('CUTAWAY_GEOMETRY_FALSE_HIDES', JSON.stringify(falseHides.slice(0, 12)), 'total', falseHides.length);
  expect(falseHides.length, 'a hidden wall needs an actual projected-volume intersection').toBe(0);
});
