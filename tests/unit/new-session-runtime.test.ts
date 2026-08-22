import { expect, test } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  chunkCoordinate,
  tileCoordinate,
} from '../../src/simulation/world/coordinates';

test('new-session runtime owns an initial loaded chunk and applies build commands', () => {
  const runtime = createNewSimulationRuntime();
  const initialChunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

  expect(runtime.world.getChunk(initialChunk)?.lifecycle).toBe('loaded');
  expect(runtime.world.isOwned(initialChunk)).toBe(true);

  runtime.kernel.submitCommand(
    'build-1',
    0,
    0,
    packCommand({
      type: 'PlaceBuildOrder',
      orderId: 'wall-1',
      definitionId: 'wall-brick',
      x: 1,
      y: 1,
    }),
  );
  runtime.kernel.step();

  expect(runtime.construction.getOrder('wall-1')?.state).toBe('materials-pending');
  expect(runtime.world.getLeftEdge({
    x: tileCoordinate(1),
    y: tileCoordinate(1),
  })).toBe(0);
});
