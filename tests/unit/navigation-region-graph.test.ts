import { describe, expect, it } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { buildNavigationGraph, isNavigationGraphStale } from '../../src/simulation/navigation/region-graph';

const CHUNK_SIZE = 8;
const ORIGIN = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

function loadedChunkList(world: SparseWorld, ...positions: (typeof ORIGIN)[]) {
  return positions.map((position) => world.getChunk(position)!);
}

describe('buildNavigationGraph', () => {
  it('puts every tile in one region when there are no walls', () => {
    const world = new SparseWorld(CHUNK_SIZE);
    world.load(ORIGIN);
    const doors = new DoorRegistry();

    const graph = buildNavigationGraph(world, doors, loadedChunkList(world, ORIGIN));

    const regionIds = new Set(graph.tileToRegion.values());
    expect(regionIds.size).toBe(1);
    expect(graph.tileToRegion.size).toBe(CHUNK_SIZE * CHUNK_SIZE);
    expect(graph.portals).toEqual([]);
  });

  it('splits a solid wall (no door) into two regions with zero portals', () => {
    const world = new SparseWorld(CHUNK_SIZE);
    world.load(ORIGIN);
    for (let y = 0; y < CHUNK_SIZE; y += 1) {
      world.setLeftEdge({ x: tileCoordinate(4), y: tileCoordinate(y) }, 1);
    }
    const doors = new DoorRegistry();

    const graph = buildNavigationGraph(world, doors, loadedChunkList(world, ORIGIN));

    const regionIds = new Set(graph.tileToRegion.values());
    expect(regionIds.size).toBe(2);
    expect(graph.portals).toEqual([]);

    const leftRegion = graph.tileToRegion.get('0,0');
    const rightRegion = graph.tileToRegion.get('4,0');
    expect(leftRegion).not.toBe(rightRegion);
  });

  it('records exactly one portal for a door in an otherwise solid wall', () => {
    const world = new SparseWorld(CHUNK_SIZE);
    world.load(ORIGIN);
    for (let y = 0; y < CHUNK_SIZE; y += 1) {
      world.setLeftEdge({ x: tileCoordinate(4), y: tileCoordinate(y) }, 1);
    }
    const doors = new DoorRegistry();
    doors.register({
      id: 'door-1',
      position: { x: tileCoordinate(4), y: tileCoordinate(2) },
      side: 'left',
      state: 'closed',
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });

    const graph = buildNavigationGraph(world, doors, loadedChunkList(world, ORIGIN));

    const regionIds = new Set(graph.tileToRegion.values());
    expect(regionIds.size).toBe(2);
    expect(graph.portals).toHaveLength(1);

    const portal = graph.portals[0]!;
    expect(portal.doorId).toBe('door-1');
    expect(portal.tileA).toEqual({ x: 3, y: 2 });
    expect(portal.tileB).toEqual({ x: 4, y: 2 });
    expect(portal.regionA).not.toBe(portal.regionB);

    expect(graph.regionPortals.get(portal.regionA)).toContainEqual(portal);
    expect(graph.regionPortals.get(portal.regionB)).toContainEqual(portal);
  });

  it('treats a door as a region boundary even where the world edge value is 0 (no wall painted)', () => {
    // The door registry is authoritative for gating even if the world's own
    // edge value happens to be 0, so navigation must not assume a nonzero wall
    // value.
    //
    // Since #331 a completed `door-wooden` order writes `DOOR_EDGE_NUMERIC_ID`
    // beside its registry row, and `remainingEdgeValue` keeps that value while
    // any completed door order still claims the edge -- so the build path never
    // produces this shape. That is exactly why it needs a case of its own:
    // with a nonzero edge value the wall check *below* the door check in
    // `buildNavigationGraph` separates the two sides anyway, so deleting the
    // door check leaves every built-door test green. This case is the one that
    // goes red for it. The other half of the same rule -- that the crossing is
    // then passable -- is pinned through the real construction path by
    // `construction-doors.test.ts`, which goes red when `boundedLocalSearch`
    // stops consulting the registry.
    //
    // The rest of the column is walled off so the only route between the
    // two sides is through the door's own (unwalled) gap.
    const world = new SparseWorld(CHUNK_SIZE);
    world.load(ORIGIN);
    for (let y = 0; y < CHUNK_SIZE; y += 1) {
      if (y === 2) continue; // leave the door's own edge at wall-value 0
      world.setLeftEdge({ x: tileCoordinate(4), y: tileCoordinate(y) }, 1);
    }
    const doors = new DoorRegistry();
    doors.register({
      id: 'door-1',
      position: { x: tileCoordinate(4), y: tileCoordinate(2) },
      side: 'left',
      state: 'open',
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });

    const graph = buildNavigationGraph(world, doors, loadedChunkList(world, ORIGIN));

    expect(graph.tileToRegion.get('3,2')).not.toBe(graph.tileToRegion.get('4,2'));
    expect(graph.portals).toHaveLength(1);
  });

  it('records two distinct portals for two doors between the same pair of regions', () => {
    const world = new SparseWorld(CHUNK_SIZE);
    world.load(ORIGIN);
    for (let y = 0; y < CHUNK_SIZE; y += 1) {
      world.setLeftEdge({ x: tileCoordinate(4), y: tileCoordinate(y) }, 1);
    }
    const doors = new DoorRegistry();
    doors.register({
      id: 'door-north',
      position: { x: tileCoordinate(4), y: tileCoordinate(1) },
      side: 'left',
      state: 'open',
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });
    doors.register({
      id: 'door-south',
      position: { x: tileCoordinate(4), y: tileCoordinate(6) },
      side: 'left',
      state: 'locked',
      requiredSecurityClearance: 5,
      costMultiplier: 1,
    });

    const graph = buildNavigationGraph(world, doors, loadedChunkList(world, ORIGIN));

    expect(graph.portals).toHaveLength(2);
    expect(new Set(graph.tileToRegion.values()).size).toBe(2);
    const doorIds = graph.portals.map((p) => p.doorId).sort();
    expect(doorIds).toEqual(['door-north', 'door-south']);
  });
});

describe('isNavigationGraphStale', () => {
  it('is stale after a geometry change (a wall added)', () => {
    const world = new SparseWorld(CHUNK_SIZE);
    world.load(ORIGIN);
    const doors = new DoorRegistry();
    const graph = buildNavigationGraph(world, doors, loadedChunkList(world, ORIGIN));

    expect(isNavigationGraphStale(graph, doors, loadedChunkList(world, ORIGIN))).toBe(false);

    world.setLeftEdge({ x: tileCoordinate(4), y: tileCoordinate(0) }, 1);
    expect(isNavigationGraphStale(graph, doors, loadedChunkList(world, ORIGIN))).toBe(true);
  });

  it('is stale after a door is added, but NOT after only its lock state changes', () => {
    const world = new SparseWorld(CHUNK_SIZE);
    world.load(ORIGIN);
    const doors = new DoorRegistry();
    doors.register({
      id: 'door-1',
      position: { x: tileCoordinate(4), y: tileCoordinate(2) },
      side: 'left',
      state: 'closed',
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });
    const graph = buildNavigationGraph(world, doors, loadedChunkList(world, ORIGIN));

    doors.setState('door-1', 'locked');
    expect(isNavigationGraphStale(graph, doors, loadedChunkList(world, ORIGIN))).toBe(false);

    doors.register({
      id: 'door-2',
      position: { x: tileCoordinate(4), y: tileCoordinate(3) },
      side: 'left',
      state: 'open',
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });
    expect(isNavigationGraphStale(graph, doors, loadedChunkList(world, ORIGIN))).toBe(true);
  });
});
