import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';

function completedCell() {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  for (let i = 0; i < 30_000; i += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.prisoners.roomInstances.getById('room.cell:11:11')).toBeDefined();
  return runtime;
}

it.each([false, true])('refuses furniture placed after an ordinary pending square wall (restore=%s)', (restore) => {
  let runtime = completedCell();
  runtime.kernel.submitCommand('wall', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'wall-before-toilet', definitionId: 'wall-brick',
    x: 20, y: 20, footprint: 'square',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('wall-before-toilet')?.state).not.toBe('failed');
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  runtime.kernel.submitCommand('toilet', 2, runtime.kernel.tick, packCommand({
    type: 'PlaceObject', orderId: 'toilet-after-wall', definitionId: 'toilet-brick', x: 20, y: 20,
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('toilet-after-wall')).toBeUndefined();
  expect(runtime.refusals.last).toMatchObject({ reason: 'place-object.tile-occupied' });
  runtime.kernel.submitCommand('cancel-wall', 3, runtime.kernel.tick, packCommand({
    type: 'CancelBuildOrder', orderId: 'wall-before-toilet',
    expectedRevision: runtime.construction.revisionOf('wall-before-toilet'),
  }));
  runtime.kernel.step();
  runtime.kernel.submitCommand('retry-toilet', 4, runtime.kernel.tick, packCommand({
    type: 'PlaceObject', orderId: 'toilet-after-cancel', definitionId: 'toilet-brick', x: 20, y: 20,
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('toilet-after-cancel')?.state).not.toBe('failed');
});

it('checks every furniture square but keeps an edge wall compatible', () => {
  const runtime = completedCell();
  runtime.kernel.submitCommand('wall', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'wall-at-desk-end', definitionId: 'wall-brick',
    x: 21, y: 20, footprint: 'square',
  }));
  runtime.kernel.step();
  runtime.kernel.submitCommand('desk', 2, runtime.kernel.tick, packCommand({
    type: 'PlaceObject', orderId: 'desk-across-wall', definitionId: 'desk-wooden', x: 20, y: 20,
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('desk-across-wall')).toBeUndefined();
  runtime.kernel.submitCommand('edge-wall', 3, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'ordinary-edge-wall', definitionId: 'wall-brick',
    x: 20, y: 19, edge: 'west',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('ordinary-edge-wall')?.state).not.toBe('failed');
  runtime.kernel.submitCommand('toilet', 4, runtime.kernel.tick, packCommand({
    type: 'PlaceObject', orderId: 'toilet-with-edge-wall', definitionId: 'toilet-brick', x: 20, y: 19,
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('toilet-with-edge-wall')?.state).not.toBe('failed');
});

it('groups completed template furniture with its shell transaction', () => {
  const runtime = completedCell();
  const furniture = runtime.construction.allOrders().find((order) => order.definitionId === 'bed-wooden');
  expect(furniture).toBeDefined();
  const snapshot = runtime.construction.snapshot();
  const latest = snapshot.currentTransaction ?? snapshot.undoStack.at(-1) ?? [];
  expect(latest).toContain(furniture!.id);
});
