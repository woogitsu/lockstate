import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';

function completedCell() {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  for (let tick = 0; tick < 30_000; tick += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.prisoners.roomInstances.getById('room.cell:11:11')).toBeDefined();
  return runtime;
}

it.each([false, true])('refuses an ordinary door leading into standing furniture (restore=%s)', (restore) => {
  let runtime = completedCell();
  // The finished template's toilet stands at (12,14). A west-edge door on
  // that square appears passable, yet its inside square is occupied.
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  runtime.kernel.submitCommand('blocked-door', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'blocked-door', definitionId: 'door-wooden',
    x: 12, y: 14, edge: 'west',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('blocked-door')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
});

it('refuses an ordinary door leading into pending furniture, while a clear edge remains legal', () => {
  const runtime = completedCell();
  expect(runtime.objectPlacement.place({
    orderId: 'pending-toilet', definitionId: 'toilet-brick', x: 11, y: 15,
  }, runtime.kernel.tick, 1)).toMatchObject({ kind: 'ordered' });
  runtime.kernel.submitCommand('blocked-door', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'blocked-door', definitionId: 'door-wooden',
    x: 11, y: 15, edge: 'north',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('blocked-door')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  runtime.kernel.submitCommand('clear-door', 2, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'clear-door', definitionId: 'door-wooden',
    x: 12, y: 13, edge: 'north',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('clear-door')?.state).not.toBe('failed');
});

it('checks the far side of a north-edge door against a pending furniture footprint', () => {
  const runtime = completedCell();
  expect(runtime.objectPlacement.place({
    orderId: 'pending-toilet-across', definitionId: 'toilet-brick', x: 12, y: 12,
  }, runtime.kernel.tick, 1)).toMatchObject({ kind: 'ordered' });
  runtime.kernel.submitCommand('blocked-across', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceBuildOrder', orderId: 'blocked-across', definitionId: 'door-wooden',
    x: 12, y: 13, edge: 'north',
  }));
  runtime.kernel.step();
  expect(runtime.construction.getOrder('blocked-across')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
});
