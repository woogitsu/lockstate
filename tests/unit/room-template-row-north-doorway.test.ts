import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

it.each([false, true])('keeps the north-facing cell-row doorway open after completion (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('row', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 },
  }));
  for (let i = 0; i < 30_000; i += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.navigation.doors.getByEdge(tile(11, 20), 'top')).toBeDefined();
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  runtime.kernel.submitCommand('wall', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'north-approach-wall', definitionId: 'wall-brick',
    x: 11, y: 18, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('north-approach-wall')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  expect(runtime.world.getSquareStructure(tile(11, 18))).toBe(0);
  runtime.kernel.submitCommand('nearby', 2, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'nearby-corridor-wall', definitionId: 'wall-brick',
    x: 12, y: 18, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('nearby-corridor-wall')?.state).toBe('approved');
  expect(runtime.objectPlacement.place({
    definitionId: 'desk-wooden', orderId: 'north-approach-desk', x: 11, y: 18,
  }, runtime.kernel.tick)).toMatchObject({ kind: 'refused', reason: 'tile-occupied', tile: tile(11, 18) });
}, 120_000);
