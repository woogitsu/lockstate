import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

it.each([false, true])('keeps both squares of a pending ordinary door clear (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('door', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'ordinary-door', definitionId: 'door-wooden',
    x: 11, y: 15, edge: 'north',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('ordinary-door')?.state).not.toBe('failed');
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  for (const [index, y] of [15, 14].entries()) {
    const orderId = `wall-across-door-${y}`;
    runtime.kernel.submitCommand(orderId, index + 1, runtime.kernel.tick, packCommand({
      type: 'PlaceBuildOrder', orderId, definitionId: 'wall-brick', x: 11, y, footprint: 'square',
    }));
    runtime.kernel.step();
    expect(runtime.construction.getOrder(orderId), `wall at y=${y}`)
      .toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  }
  runtime.kernel.submitCommand('unrelated-wall', 3, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'unrelated-wall', definitionId: 'wall-brick',
    x: 12, y: 15, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('unrelated-wall')?.state).not.toBe('failed');
});

it('keeps an unzoned completed ordinary door clear after Save/Load', () => {
  let runtime = createNewSimulationRuntime(74);
  runtime.kernel.submitCommand('door', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'ordinary-door', definitionId: 'door-wooden',
    x: 11, y: 15, edge: 'west',
  }));
  for (let i = 0; i < 30_000; i += 1) {
    runtime.kernel.step();
    if (runtime.construction.getOrder('ordinary-door')?.state === 'completed') break;
  }
  expect(runtime.construction.getOrder('ordinary-door')?.state).toBe('completed');
  expect(runtime.navigation.doors.getByEdge({ x: tileCoordinate(11), y: tileCoordinate(15) }, 'left')).toBeDefined();
  runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  for (const [index, x] of [11, 10].entries()) {
    const orderId = `wall-at-door-${x}`;
    runtime.kernel.submitCommand(orderId, index + 1, runtime.kernel.tick, packCommand({
      type: 'PlaceBuildOrder', orderId, definitionId: 'wall-brick',
      x, y: 15, footprint: 'square',
    }));
    runtime.kernel.step();
    expect(runtime.construction.getOrder(orderId))
      .toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  }
  runtime.construction.cancelOrder('ordinary-door');
  expect(runtime.navigation.doors.getByEdge({ x: tileCoordinate(11), y: tileCoordinate(15) }, 'left')).toBeUndefined();
  runtime.kernel.submitCommand('wall-after-door-removal', 3, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'wall-after-door-removal', definitionId: 'wall-brick',
    x: 11, y: 15, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('wall-after-door-removal')?.state).not.toBe('failed');
});
