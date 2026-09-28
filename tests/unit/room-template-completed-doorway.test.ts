import { expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

it.each([false, true])('refuses a later plan that seals a completed Cell doorway (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('first', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  for (let i = 0; i < 30_000; i += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.navigation.doors.getByEdge(tile(11, 16), 'top')).toBeDefined();
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
  expect(runtime.roomTemplates.preflight(instantiateRoomTemplate('cell-basic', { x: 10, y: 17 })))
    .toEqual({ ok: false, reason: 'structure-occupied', tile: tile(11, 17) });
  const existingOrders = runtime.construction.allOrders().length;
  runtime.kernel.submitCommand('second', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 17 },
  }));
  runtime.kernel.step();
  expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: tile(11, 17) });
  expect(runtime.construction.allOrders()).toHaveLength(existingOrders);
  expect(runtime.roomTemplates.preflight(instantiateRoomTemplate('cell-basic', { x: 14, y: 10 })))
    .toEqual({ ok: true });
}, 120_000);
