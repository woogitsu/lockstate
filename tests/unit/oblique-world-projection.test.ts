import { describe, expect, it } from 'vitest';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { artForGround, artForNorthEdge, artForStructure } from '../../src/rendering/camera/oblique-art-mapping';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';

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
  it('selects authored shower floor and wall fixture from the real room and build catalogues', () => {
    const shower = defaultRoomContentRegistry.getById('room.shower-room');
    expect(shower).toBeDefined();
    expect(artForGround(shower!.numericId)).toBe('floor.shower.ceramic');
    expect(artForGround(0, 0)).toBe('floor.terrain.dirt');
    expect(artForGround(0, 1)).toBe('floor.terrain.grass');
    expect(artForStructure('shower-head-brick')).toBe('fixture.shower.head');
    expect(artForStructure('object.sink')).toBe('fixture.cell.sink');
    expect(artForStructure('wall-brick')).toBe('wall.square.brick.low');
    expect(artForNorthEdge(2, shower!.numericId)).toBe('door.shower.privacy.open.full');
  });
  it('reads loaded ground, distinct wall and door edges, a whole bed, and the actor without duplicating a finished wall', () => {
    const projected = projectObliqueWorldFrame(frame(), pose);
    expect(projected.loadedTilesVisited).toBe(64);
    expect(projected.ground).toHaveLength(64);
    const grass = projected.ground.find((ground) => ground.tileX === 2 && ground.tileY === 2);
    expect(grass?.owned).toBe(true);
    expect(grass?.fill).toBe(0x47643a);
    expect(grass?.quad).toHaveLength(4);
    expect(grass?.artAssetId).toBe('floor.terrain.grass');
    expect(grass?.artOverlayAssetIds).toEqual([
      'floor.terrain.dirt-grass.edge.north',
      'floor.terrain.dirt-grass.edge.east',
      'floor.terrain.dirt-grass.edge.south',
      'floor.terrain.dirt-grass.edge.west',
    ]);

    const solids = projected.raised.filter((item) => item.kind !== 'actor');
    expect(solids.map((item) => item.kind)).toEqual(['north-edge', 'west-edge', 'structure']);
    expect(solids.map((item) => item.id)).not.toContain('wall-already-on-edge');
    const wall = solids.find((item) => item.kind === 'north-edge');
    const door = solids.find((item) => item.kind === 'west-edge');
    expect(wall?.topFill).not.toBe(door?.topFill);
    expect(wall?.artAssetId).toBe('wall.interior.module.full');
    expect(door?.artAssetId).toBe('door.interior.open.west.full');
    const bed = solids.find((item) => item.id === 'bed');
    expect(bed?.artAssetId).toBe('furniture.cell.bed.single.variants');
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
