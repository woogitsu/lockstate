import { test, expect } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { createConstructionCommandHandler } from '../../src/simulation/construction/handler';
import { packCommand } from '../../src/simulation/protocol/commands';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';

test('ConstructionSystem processes build order through lifecycle deterministically', () => {
  const world = new SparseWorld(32);
  
  // Create chunk metadata and load it so the chunk is recognized and modifiable
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel();
  kernel.registerSystem(construction);
  kernel.setCommandHandler(createConstructionCommandHandler(construction));
  
  // Submit build order via command
  kernel.submitCommand('cmd-1', 0, 0, packCommand({
    type: 'PlaceBuildOrder',
    orderId: 'order-1',
    definitionId: 'wall-brick',
    x: 0,
    y: 0,
  }));
  
  // Tick 0: Command handled, system runs (since phase 0 of 10)
  kernel.step();
  
  const order = construction.getOrder('order-1');
  expect(order).toBeDefined();
  
  // First update auto-approves and bumps to materials-pending
  expect(order?.state).toBe('materials-pending');
  
  // Tick 1-9: Construction system doesn't run
  for (let i = 0; i < 9; i++) {
    kernel.step();
  }
  expect(order?.state).toBe('materials-pending');
  
  // Tick 10: Construction runs, progresses to 'assigned'
  kernel.step();
  expect(order?.state).toBe('assigned');
  expect(order?.materialsAllocated.length).toBeGreaterThan(0);
  
  // Tick 20: Construction runs, progresses to 'in-progress'
  for (let i = 0; i < 10; i++) kernel.step();
  expect(order?.state).toBe('in-progress');
  
  // Brick wall takes 50 work. Each update adds 10 work. Needs 5 updates.
  for (let i = 0; i < 50; i++) {
    kernel.step(); // Steps 11 through 60 (updates at 20, 30, 40, 50, 60)
  }
  
  expect(order?.state).toBe('completed');
  expect(order?.progress).toBe(50);
});

test('ConstructionSystem snapshot restores orders correctly', () => {
  const world = new SparseWorld(32);
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const construction = new ConstructionSystem(world);
  
  const order = createBuildOrder('order-snap', 'wall-brick', { x: tileCoordinate(0), y: tileCoordinate(0) });
  
  construction.submitOrder(order);
  
  // Override state after submitOrder (which sets it to 'approved') for snapshot test
  order.state = 'in-progress';
  order.progress = 20;
  order.materialsAllocated.push({ itemId: 'item.brick', quantity: 2 });
  
  const snapshot = construction.snapshot();
  
  const restoredConstruction = new ConstructionSystem(new SparseWorld(32));
  restoredConstruction.restore(snapshot);
  
  const restoredOrder = restoredConstruction.getOrder('order-snap');
  expect(restoredOrder).toBeDefined();
  expect(restoredOrder?.state).toBe('in-progress');
  expect(restoredOrder?.progress).toBe(20);
  expect(restoredOrder?.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);
});

test('CancelBuildOrder command stops construction', () => {
  const world = new SparseWorld(32);
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel();
  kernel.registerSystem(construction);
  kernel.setCommandHandler(createConstructionCommandHandler(construction));
  
  kernel.submitCommand('cmd-start', 0, 0, packCommand({
    type: 'PlaceBuildOrder',
    orderId: 'order-cancel',
    definitionId: 'door-wooden',
    x: tileCoordinate(0),
    y: tileCoordinate(0),
  }));
  
  kernel.step(); // state: materials-pending
  
  kernel.submitCommand('cmd-cancel', 1, 1, packCommand({
    type: 'CancelBuildOrder',
    orderId: 'order-cancel',
  }));
  
  kernel.step(); // tick 1
  
  const order = construction.getOrder('order-cancel');
  expect(order?.state).toBe('cancelled');
});

test('restore copies the snapshot it is given, so a restored session cannot write back into a stored save', () => {
  // A snapshot is not scratch space: the same object is what
  // `createSaveEnvelope` checksums and what a pending cloud sync still holds
  // after the restore. A restored order that shared its `materialsAllocated`
  // array with the snapshot would let the live session edit a save that has
  // already been checksummed, so the payload written to storage would no
  // longer match the hash taken over it.
  const world = new SparseWorld(32);
  world.ensureMetadata({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  const construction = new ConstructionSystem(world);

  const order = createBuildOrder('order-alias', 'wall-brick', { x: tileCoordinate(0), y: tileCoordinate(0) });
  construction.submitOrder(order);
  order.materialsAllocated.push({ itemId: 'item.brick', quantity: 2 });

  const snapshot = construction.snapshot();

  const restored = new ConstructionSystem(new SparseWorld(32));
  restored.restore(snapshot);

  const restoredOrder = restored.getOrder('order-alias');
  expect(restoredOrder?.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);

  // The live session now consumes more material against that order.
  restoredOrder?.materialsAllocated.push({ itemId: 'item.steel', quantity: 1 });

  expect(snapshot.orders[0]?.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);
});
