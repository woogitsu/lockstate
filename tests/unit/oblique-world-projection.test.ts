import { describe, expect, it } from 'vitest';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import { WorldRenderView } from '../../src/rendering/world/world-view';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function frame(): RenderFrame {
  const world = new SparseWorld(8);
  const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(origin);
  world.setOwned(origin, true);
  world.setTerrain(tile(2, 2), 'grass');
  world.setTopEdge(tile(2, 2), 1);
  world.setLeftEdge(tile(3, 2), 2);
  world.load({ x: chunkCoordinate(40), y: chunkCoordinate(40) });
  return {
    revision: 1,
    world: WorldRenderView.fromSnapshot(world.snapshot()),
    structures: [
      { id: 'wall-already-on-edge', definitionId: 'wall-brick', tileX: 2, tileY: 2, phase: 'built' },
      { id: 'bed', definitionId: 'bed-wooden', tileX: 4, tileY: 3, phase: 'built' },
    ],
    actors: [{ id: 9, assetId: 'actor.prisoner', tileX: 1, tileY: 1, deltaX: 0, deltaY: 0 }],
    rooms: [],
    roomConditions: [],
  };
}

const pose: ObliqueCameraState = {
  target: { x: 2 * 64, y: 2 * 64 },
  viewport: { width: 1920, height: 1080 },
  zoom: 2,
  yawRadians: 0,
  elevationRadians: Math.PI / 4,
};

describe('oblique projection of an actual simulation snapshot', () => {
  it('lowers only the near perimeter wall of a furnished cell as yaw reverses', () => {
    const cell = new SparseWorld(8);
    const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
    cell.load(origin);
    cell.setOwned(origin, true);
    cell.setSquareStructure(tile(3, 2), 1);
    cell.setSquareStructure(tile(3, 4), 1);
    const furnished: RenderFrame = {
      revision: 1,
      world: WorldRenderView.fromSnapshot(cell.snapshot()),
      structures: [
        { id: 'bed', definitionId: 'bed-wooden', tileX: 2, tileY: 3, phase: 'built' },
        { id: 'toilet', definitionId: 'object.toilet', tileX: 4, tileY: 3, phase: 'built' },
      ],
      actors: [],
      rooms: [{ instanceId: 'cell:3:3', roomCatalogId: 'room.cell', anchorTileX: 3, anchorTileY: 3, width: 1, height: 1 }],
      roomConditions: [],
    };
    const solid = (yawRadians: number, id: string) => {
      const raised = projectObliqueWorldFrame(furnished, { ...pose, yawRadians }).raised;
      const found = raised.find((item) => item.kind === 'structure' && item.id === id);
      if (found?.kind !== 'structure') throw new Error(`Missing ${id}`);
      return found;
    };
    const near = solid(0, 'square-wall:3:4');
    const far = solid(0, 'square-wall:3:2');
    expect(near.assetId).toBe('wall.square.brick.low');
    expect(far.assetId).toBe('wall.square.brick.full');
    expect(Math.abs(near.top[0].y - near.footprint[0].y))
      .toBeLessThan(Math.abs(far.top[0].y - far.footprint[0].y));
    expect(solid(Math.PI, 'square-wall:3:4').assetId).toBe('wall.square.brick.full');
    expect(solid(Math.PI, 'square-wall:3:2').assetId).toBe('wall.square.brick.low');
    expect(solid(0, 'bed')).toHaveProperty('kind', 'structure');
    expect(solid(0, 'toilet')).toHaveProperty('kind', 'structure');
  });
  it('cuts a legacy near wall while keeping the adjacent door at full height', () => {
    const cell = new SparseWorld(8);
    const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
    cell.load(origin);
    cell.setOwned(origin, true);
    cell.setTopEdge(tile(3, 4), 1);
    cell.setTopEdge(tile(4, 4), 2);
    const interior: RenderFrame = {
      revision: 1,
      world: WorldRenderView.fromSnapshot(cell.snapshot()),
      structures: [], actors: [], roomConditions: [],
      rooms: [{ instanceId: 'cell:3:3', roomCatalogId: 'room.cell', anchorTileX: 3, anchorTileY: 3, width: 2, height: 1 }],
    };
    const projected = projectObliqueWorldFrame(interior, pose);
    const wall = projected.raised.find((item) => item.kind === 'north-edge' && item.id === 'north-edge:3:4');
    const door = projected.raised.find((item) => item.kind === 'north-edge' && item.id === 'north-edge:4:4');
    if (wall?.kind !== 'north-edge' || door?.kind !== 'north-edge') throw new Error('Missing wall or door');
    expect(wall.assetId).toBe('wall.interior.module.cutaway');
    expect(door.assetId).toBe('door.interior.open.full');
  });
  it('reads loaded ground, distinct wall and door edges, a whole bed, and the actor without duplicating a finished wall', () => {
    const projected = projectObliqueWorldFrame(frame(), pose);
    expect(projected.loadedTilesVisited).toBe(64);
    expect(projected.ground).toHaveLength(64);
    const grass = projected.ground.find((ground) => ground.tileX === 2 && ground.tileY === 2);
    expect(grass?.owned).toBe(true);
    expect(grass?.fill).toBe(0x47643a);
    expect(grass?.quad).toHaveLength(4);

    const solids = projected.raised.filter((item) => item.kind !== 'actor');
    expect(solids.map((item) => item.kind)).toEqual(['north-edge', 'west-edge', 'structure']);
    expect(solids.map((item) => item.id)).not.toContain('wall-already-on-edge');
    const wall = solids.find((item) => item.kind === 'north-edge');
    const door = solids.find((item) => item.kind === 'west-edge');
    expect(wall?.topFill).not.toBe(door?.topFill);
    expect(wall?.assetId).toBe('wall.interior.module.full');
    expect(door?.assetId).toBe('door.interior.open.west.full');
    const bed = solids.find((item) => item.id === 'bed');
    expect(bed?.footprint[2].y! - bed?.footprint[1].y!).toBeCloseTo(2 * 64 * Math.SQRT1_2 * pose.zoom, 5);
    expect(projected.raised.some((item) => item.kind === 'actor' && item.id === 9)).toBe(true);
  });

  it('sorts by view direction when the player turns the camera', () => {
    const initial = projectObliqueWorldFrame(frame(), pose);
    const turned = projectObliqueWorldFrame(frame(), { ...pose, yawRadians: -Math.PI / 2 });
    const actorDepth = (items: typeof initial.raised) => items.find((item) => item.kind === 'actor')!.viewDepth;
    const bedDepth = (items: typeof initial.raised) => items.find((item) => item.id === 'bed')!.viewDepth;
    expect(actorDepth(initial.raised)).toBeLessThan(bedDepth(initial.raised));
    expect(actorDepth(turned.raised)).toBeGreaterThan(bedDepth(turned.raised));
    expect(initial.raised.map((item) => item.id)).not.toEqual(turned.raised.map((item) => item.id));
  });
});
