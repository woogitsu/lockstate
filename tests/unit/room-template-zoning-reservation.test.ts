import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';

it.each([false, true])('refuses a later overlapping Yard while a paid Cell template is pending, including after restore (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  const openingBalance = runtime.treasury.balanceMinorUnits;
  runtime.kernel.submitCommand('cell-plan', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  const orderIds = runtime.construction.allOrders().map((order) => order.id);
  expect(orderIds.length).toBeGreaterThan(0);
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  for (let i = 0; i < 100 && runtime.treasury.balanceMinorUnits === openingBalance; i += 1) runtime.kernel.step();
  expect(runtime.treasury.balanceMinorUnits).toBeLessThan(openingBalance);
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  if (restore) runtime = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;

  runtime.kernel.submitCommand('late-yard', 1, runtime.kernel.tick, packCommand({
    type: 'ZoneRoom', roomId: 'room.yard', x: 9, y: 9, width: 8, height: 8,
  }));
  runtime.kernel.step();
  expect(runtime.refusals.last).toMatchObject({ reason: 'zone.overlaps-pending-template', tile: { x: 9, y: 9 } });
  expect(runtime.prisoners.roomInstances.getById('room.yard:9:9')).toBeUndefined();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  expect(runtime.construction.allOrders().map((order) => order.id)).toEqual(orderIds);
  expect(runtime.treasury.balanceMinorUnits).toBeLessThan(openingBalance);
  for (let i = 0; i < 30_000 && runtime.roomTemplates.snapshot().pending.length > 0; i += 1) runtime.kernel.step();
  expect(runtime.prisoners.roomInstances.getById('room.cell:11:11')).toBeDefined();
  expect(runtime.construction.allOrders().some((order) => order.state === 'cancelled')).toBe(false);
}, 120_000);

it('leaves a separate Yard designation available while a Cell plan is pending', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('cell-plan', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  const result = runtime.roomZoning.zone({ roomCatalogId: 'room.yard', x: 20, y: 20, width: 8, height: 8 }, runtime.kernel.tick);
  expect(result.kind).toBe('zoned');
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
});
