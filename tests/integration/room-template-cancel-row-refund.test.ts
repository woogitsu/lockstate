import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import type { BuildQueueViewModel } from '../../src/simulation/presentation/construction-projection';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`template-row-refund-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'template-cancel-row-refund', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Cancellation row save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function rows(runtime: Runtime) {
  return (PROJECTION_CATALOG['hud/build-queue'].project(runtime, runtime.kernel.tick, {}).view as unknown as BuildQueueViewModel).orders.rows;
}
function compareRowWithActualCommand(runtime: Runtime, state: string) {
  const beforeProjection = captureSessionSnapshot(runtime);
  const row = rows(runtime).find(candidate => candidate.state === state)!;
  expect(row).toBeDefined();
  // A quote must not mutate even the saved material/order/history state.
  expect(captureSessionSnapshot(runtime)).toEqual(beforeProjection);
  const beforeFunds = runtime.treasury.balanceMinorUnits;
  send(runtime, { type: 'CancelBuildOrder', orderId: row.orderId, expectedRevision: row.revision });
  const actualRefund = runtime.treasury.balanceMinorUnits - beforeFunds;
  console.log(JSON.stringify({ state, rowRefund: row.cancelRefundMinorUnits, actualRefund, cancelled: runtime.construction.allOrders().filter(order => order.state === 'cancelled').length }));
  expect(actualRefund).toBe(row.cancelRefundMinorUnits);
}
it.each([false, true])('the paid shell queue row pays its displayed refund for actual whole-plan cancellation, saved=%s', saved => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  runtime.kernel.step();
  expect(runtime.treasury.balanceMinorUnits).toBe(23_575);
  expect(runtime.construction.allOrders()).toHaveLength(18);
  if (saved) runtime = reload(runtime);
  compareRowWithActualCommand(runtime, 'materials-pending');
});
it.each(['in-progress', 'assigned'])('the saved partial row fixture shows the actual coupled refund when its selected row is %s', state => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 5, y: 5 }, mirrorX: true, quarterTurns: 1 });
  until(runtime, () => runtime.construction.allOrders().some(order => order.id.includes('-2-object-') && order.state === 'in-progress'));
  expect(runtime.construction.allOrders().filter(order => order.state === 'completed')).toHaveLength(58);
  expect(runtime.construction.allOrders().filter(order => order.state === 'assigned')).toHaveLength(7);
  runtime = reload(runtime);
  compareRowWithActualCommand(runtime, state);
});
it('ordinary shared wall gestures retain single-order cancellation and its displayed refund', () => {
  const runtime = createNewSimulationRuntime(73);
  for (const [id, x] of [['ordinary-a', 2], ['ordinary-b', 3]] as const)
    send(runtime, { type: 'PlaceBuildOrder', orderId: id, definitionId: 'wall-brick', x, y: 2, footprint: 'square', transactionId: 'ordinary-shared-gesture' });
  until(runtime, () => runtime.construction.allOrders().every(order => order.state === 'assigned'));
  compareRowWithActualCommand(runtime, 'assigned');
  expect(runtime.construction.getOrder('ordinary-b')?.state).toBe('assigned');
});
