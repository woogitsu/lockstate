import { describe, expect, it } from 'vitest';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { buildNavigationGraph, isNavigationGraphStale } from '../../src/simulation/navigation/region-graph';
import { edgeStanding } from '../../src/simulation/navigation/traversal';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

describe('navigation through whole-square walls', () => {
  it('blocks all four approaches and isolates the occupied tile in the region graph', () => {
    const world = new SparseWorld(8);
    world.load(chunk);
    const doors = new DoorRegistry();
    const before = buildNavigationGraph(world, doors, [world.getChunk(chunk)!]);

    world.setSquareStructure(tile(4, 4), 1);
    expect(isNavigationGraphStale(before, doors, [world.getChunk(chunk)!])).toBe(true);

    const wall = tile(4, 4);
    for (const neighbor of [tile(3, 4), tile(5, 4), tile(4, 3), tile(4, 5)]) {
      expect(edgeStanding(world, doors, neighbor, wall).kind).toBe('wall');
      expect(edgeStanding(world, doors, wall, neighbor).kind).toBe('wall');
    }
    const after = buildNavigationGraph(world, doors, [world.getChunk(chunk)!]);
    expect(after.tileToRegion.get('4,4')).not.toBe(after.tileToRegion.get('3,4'));
    expect(after.portals).toEqual([]);
  });

  it('does not turn a square wall into a doorway through an old edge registration', () => {
    const world = new SparseWorld(8);
    world.load(chunk);
    world.setSquareStructure(tile(4, 4), 1);
    const doors = new DoorRegistry();
    doors.register({
      id: 'older-door', position: tile(4, 4), side: 'left', state: 'open',
      requiredSecurityClearance: 0, costMultiplier: 1,
    });

    expect(edgeStanding(world, doors, tile(3, 4), tile(4, 4)).kind).toBe('wall');
    const graph = buildNavigationGraph(world, doors, [world.getChunk(chunk)!]);
    expect(graph.portals).toEqual([]);
  });
});
