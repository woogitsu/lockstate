import { describe, expect, it } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate, tileKey } from '../../src/simulation/world/coordinates';
import { getTopBarrier, getLeftBarrier } from '../../src/simulation/world/barriers';
import { buildNavigationGraph, isNavigationGraphStale } from '../../src/simulation/navigation/region-graph';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { edgeStanding } from '../../src/simulation/navigation/traversal';
import { roomPerimeterEnclosure } from '../../src/simulation/rooms/enclosure';
import { WorldRenderView } from '../../src/rendering/world/world-view';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

describe('square walls are occupied tiles, independent of legacy edges', () => {
  it('blocks all four sides, excludes the wall tile from routing and invalidates cached geometry on removal', () => {
    const world = new SparseWorld(8);
    world.load(chunk);
    world.setSquareStructure(tile(3, 3), 1);
    const doors = new DoorRegistry();
    for (const neighbor of [tile(3, 2), tile(3, 4), tile(2, 3), tile(4, 3)]) {
      expect(edgeStanding(world, doors, tile(3, 3), neighbor).kind).toBe('wall');
      expect(edgeStanding(world, doors, neighbor, tile(3, 3)).kind).toBe('wall');
    }
    expect(getTopBarrier(world, tile(3, 4))).toBe(1);
    expect(getLeftBarrier(world, tile(4, 3))).toBe(1);
    const graph = buildNavigationGraph(world, doors, [world.getChunk(chunk)!]);
    expect(graph.tileToRegion.has(tileKey(tile(3, 3)))).toBe(false);
    world.setSquareStructure(tile(3, 3), 0);
    expect(isNavigationGraphStale(graph, doors, [world.getChunk(chunk)!])).toBe(true);
    expect(edgeStanding(world, doors, tile(3, 3), tile(3, 4)).kind).toBe('open');
  });

  it('gives the worker and decoded renderer the same enclosure across a chunk boundary', () => {
    const world = new SparseWorld(4);
    for (let y = 2; y <= 5; y += 1) for (let x = 2; x <= 5; x += 1) {
      if (x === 2 || x === 5 || y === 2 || y === 5) world.setSquareStructure(tile(x, y), 1);
    }
    const rectangle = { x: 3, y: 3, width: 2, height: 2 };
    expect(roomPerimeterEnclosure(world, rectangle).enclosure).toBe('sealed');
    expect(roomPerimeterEnclosure(WorldRenderView.fromSnapshot(world.snapshot()), rectangle).enclosure).toBe('sealed');
    world.setSquareStructure(tile(3, 2), 0);
    expect(roomPerimeterEnclosure(world, rectangle).enclosure).toBe('open');
    expect(roomPerimeterEnclosure(WorldRenderView.fromSnapshot(world.snapshot()), rectangle).enclosure).toBe('open');
  });
});
