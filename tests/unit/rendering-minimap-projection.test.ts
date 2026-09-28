import { describe, expect, it } from 'vitest';
import { projectMinimap } from '../../src/rendering/world/minimap-projection';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

const at = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

describe('minimap projection', () => {
  it('shows real walls, rooms, water and loaded gaps without scanning the sparse extent', () => {
    const world = new SparseWorld(8);
    world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    world.load({ x: chunkCoordinate(4), y: chunkCoordinate(0) });
    world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
    world.setZoning(at(1, 1), 1);
    world.setTopEdge(at(2, 1), 1);
    world.setTerrain(at(3, 1), 'water');
    const map = projectMinimap(WorldRenderView.fromSnapshot(world.snapshot()));
    expect(map).toBeDefined();
    if (map === undefined) return;
    expect(map.width).toBe(40);
    expect(map.height).toBe(8);
    const pixel = (x: number, y: number) => map.pixels[y * map.width + x];
    expect(pixel(1, 1)).toBe(3);
    expect(pixel(2, 1)).toBe(5);
    expect(pixel(3, 1)).toBe(4);
    expect(pixel(20, 1)).toBe(0);
    expect(pixel(33, 1)).toBe(1);
  });

  it('caps a distant sparse extent at 256 pixels per axis', () => {
    const world = new SparseWorld(8);
    world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    world.load({ x: chunkCoordinate(40), y: chunkCoordinate(40) });
    const map = projectMinimap(WorldRenderView.fromSnapshot(world.snapshot()));
    expect(map?.width).toBe(256);
    expect(map?.height).toBe(256);
    expect(map?.pixels.length).toBe(256 * 256);
  });
});
