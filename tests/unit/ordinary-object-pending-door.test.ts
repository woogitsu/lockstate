import { expect, it } from 'vitest';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

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

it.each([false, true])('keeps both sides of a pending ordinary door free of later furniture (restore=%s)', (restore) => {
  let runtime = completedCell();
  const door = createBuildOrder('pending-door', 'door-wooden',
    { x: tileCoordinate(12), y: tileCoordinate(13) }, 'north', 1);
  runtime.construction.submitOrder(door);
  expect(door.state).toBe('approved');
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  for (const [index, y] of [12, 13].entries()) {
    const outcome = runtime.objectPlacement.place({
      orderId: `toilet-at-door-${index}`, definitionId: 'toilet-brick', x: 12, y,
    }, runtime.kernel.tick, index + 2);
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'tile-occupied', tile: { x: 12, y } });
    expect(runtime.construction.getOrder(`toilet-at-door-${index}`)).toBeUndefined();
  }
  expect(runtime.construction.getOrder('pending-door')?.state).toBe('approved');
  expect(runtime.objectPlacement.place({
    orderId: 'toilet-clear', definitionId: 'toilet-brick', x: 11, y: 13,
  }, runtime.kernel.tick, 4)).toMatchObject({ kind: 'ordered' });
  runtime.construction.cancelOrder('pending-door');
  expect(runtime.objectPlacement.place({
    orderId: 'toilet-after-door-cancel', definitionId: 'toilet-brick', x: 12, y: 12,
  }, runtime.kernel.tick, 5)).toMatchObject({ kind: 'ordered' });
});
