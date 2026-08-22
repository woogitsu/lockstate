import { expect, test } from 'vitest';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { createConstructionCommandHandler } from '../../src/simulation/construction/handler';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { tileCoordinate, chunkCoordinate } from '../../src/simulation/world/coordinates';

test('ConstructionSystem handles undo and redo of transactions', () => {
  const world = new SparseWorld(32);
  const chunkPos = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.ensureMetadata(chunkPos);
  world.load(chunkPos);
  
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel();
  kernel.registerSystem(construction);
  kernel.setCommandHandler(createConstructionCommandHandler(construction));

  // Place first order with transactionId 'tx1'
  kernel.submitCommand('cmd-1', 0, 0, packCommand({
    type: 'PlaceBuildOrder',
    orderId: 'order-1',
    definitionId: 'wall-brick',
    x: tileCoordinate(0),
    y: tileCoordinate(0),
    transactionId: 'tx1'
  }));

  // Place second order with transactionId 'tx1'
  kernel.submitCommand('cmd-2', 1, 0, packCommand({
    type: 'PlaceBuildOrder',
    orderId: 'order-2',
    definitionId: 'wall-brick',
    x: tileCoordinate(1),
    y: tileCoordinate(0),
    transactionId: 'tx1'
  }));

  kernel.step(); // Execute commands

  expect(construction.getOrder('order-1')?.state).toBe('materials-pending');
  expect(construction.getOrder('order-2')?.state).toBe('materials-pending');

  // Submit undo command
  kernel.submitCommand('cmd-undo', 2, 1, packCommand({
    type: 'Undo'
  }));

  kernel.step(); // tick 1

  // Both should be cancelled because they were in the same transaction
  expect(construction.getOrder('order-1')?.state).toBe('cancelled');
  expect(construction.getOrder('order-2')?.state).toBe('cancelled');

  // Submit redo command
  kernel.submitCommand('cmd-redo', 3, 2, packCommand({
    type: 'Redo'
  }));

  kernel.step(); // tick 2

  // Both should be restored to approved
  expect(construction.getOrder('order-1')?.state).toBe('approved');
  expect(construction.getOrder('order-2')?.state).toBe('approved');
});
