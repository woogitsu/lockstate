import { expect, test } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { TopologyManager } from '../../src/simulation/rooms/topology';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';

test('TopologyManager detects enclosed rooms within a chunk', () => {
  const world = new SparseWorld(16);
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const chunk = world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const manager = new TopologyManager(world);

  // Initial state: fully open chunk, should be one big topology ID
  manager.update([chunk]);
  
  const tile1 = { x: tileCoordinate(0), y: tileCoordinate(0) };
  const tile2 = { x: tileCoordinate(15), y: tileCoordinate(15) };
  
  const id1 = manager.getTopologyId(tile1);
  const id2 = manager.getTopologyId(tile2);
  
  expect(id1).toBeGreaterThan(0);
  expect(id1).toBe(id2);

  // Build a wall splitting the chunk in half vertically at x=8
  // Wall is on the left edge of x=8 tiles
  for (let y = 0; y < 16; y++) {
    world.setLeftEdge({ x: tileCoordinate(8), y: tileCoordinate(y) }, 1);
  }
  
  // Update manager with fresh chunk state
  const freshChunk = world.getChunk({ x: chunkCoordinate(0), y: chunkCoordinate(0) })!;
  manager.update([freshChunk]);
  
  const newId1 = manager.getTopologyId(tile1); // Left side
  const newId2 = manager.getTopologyId(tile2); // Right side
  
  expect(newId1).not.toBe(newId2);
  expect(newId1).toBeGreaterThan(0);
  expect(newId2).toBeGreaterThan(0);
  
  // Make a door (remove edge at y=5)
  world.setLeftEdge({ x: tileCoordinate(8), y: tileCoordinate(5) }, 0);
  const freshChunk2 = world.getChunk({ x: chunkCoordinate(0), y: chunkCoordinate(0) })!;
  manager.update([freshChunk2]);
  
  const mergedId1 = manager.getTopologyId(tile1);
  const mergedId2 = manager.getTopologyId(tile2);
  
  expect(mergedId1).toBe(mergedId2);
});

test('TopologyManager detects rooms spanning chunk boundaries', () => {
  const world = new SparseWorld(16);
  
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  world.ensureMetadata({ x: chunkCoordinate(1), y: chunkCoordinate(0) });
  
  const chunkLeft = world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const chunkRight = world.load({ x: chunkCoordinate(1), y: chunkCoordinate(0) });
  
  const manager = new TopologyManager(world);

  // Build a wall completely separating them on the boundary
  // Left edge of chunkRight (x=16) is the boundary
  for (let y = 0; y < 16; y++) {
    world.setLeftEdge({ x: tileCoordinate(16), y: tileCoordinate(y) }, 1);
  }

  manager.update([
    world.getChunk({ x: chunkCoordinate(0), y: chunkCoordinate(0) })!,
    world.getChunk({ x: chunkCoordinate(1), y: chunkCoordinate(0) })!
  ]);
  
  const tileL = { x: tileCoordinate(15), y: tileCoordinate(5) };
  const tileR = { x: tileCoordinate(16), y: tileCoordinate(5) };
  
  const idL = manager.getTopologyId(tileL);
  const idR = manager.getTopologyId(tileR);
  
  expect(idL).not.toBe(idR);
  
  // Make a door on the boundary
  world.setLeftEdge({ x: tileCoordinate(16), y: tileCoordinate(8) }, 0);
  
  manager.update([
    world.getChunk({ x: chunkCoordinate(0), y: chunkCoordinate(0) })!,
    world.getChunk({ x: chunkCoordinate(1), y: chunkCoordinate(0) })!
  ]);
  
  const newIdL = manager.getTopologyId(tileL);
  const newIdR = manager.getTopologyId(tileR);
  
  expect(newIdL).toBe(newIdR);
});
