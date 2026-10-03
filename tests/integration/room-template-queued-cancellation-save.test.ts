import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { CANCEL_BUILD_ORDER_LEAD_TICKS } from '../../src/ui/simulation-commands';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`queued-cancel-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'queued-cancel', revision: 1, createdAt: 0, updatedAt: 1, ...bundle,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw Error('Actual queued command V9 must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function pending(mirrorX: boolean) {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns: 1, mirrorX });
  runtime.kernel.step();
  const order = runtime.construction.allOrders()[0]!;
  expect(order.state).toBe('materials-pending');
  expect(runtime.construction.revisionOf(order.id)).toBeGreaterThan(0);
  return { runtime, orderId: order.id };
}

it.each([false, true])('the same genuine queued cancellation must retain its unchanged-state outcome through V9, mirror=%s', mirrorX => {
  const pair = pending(mirrorX);
  const executeAtTick = pair.runtime.kernel.tick + CANCEL_BUILD_ORDER_LEAD_TICKS;
  const expectedRevision = pair.runtime.construction.revisionOf(pair.orderId);
  const sequence = pair.runtime.kernel.expectedSequence;
  pair.runtime.kernel.submitCommand('actual-public-cancel-lead', sequence, executeAtTick, packCommand({
    type: 'CancelBuildOrder', orderId: pair.orderId, expectedRevision,
  }));
  const savedCommands = captureSessionSnapshot(pair.runtime).kernel.commands;
  const loaded = reload(pair.runtime);
  const restoredRevision = loaded.construction.revisionOf(pair.orderId);
  expect(captureSessionSnapshot(loaded)).toEqual(captureSessionSnapshot(pair.runtime));
  expect(captureSessionSnapshot(loaded).kernel.commands).toEqual(captureSessionSnapshot(pair.runtime).kernel.commands);
  expect(loaded.construction.getOrder(pair.orderId)).toEqual(pair.runtime.construction.getOrder(pair.orderId));
  const funds = loaded.treasury.balanceMinorUnits;
  for (let tick = pair.runtime.kernel.tick; tick <= executeAtTick; tick++) { pair.runtime.kernel.step(); loaded.kernel.step(); }
  expect(pair.runtime.construction.getOrder(pair.orderId)?.state).toBe('cancelled');
  expect(pair.runtime.roomTemplates.snapshot().pending).toEqual([]);
  expect(pair.runtime.treasury.balanceMinorUnits).toBeGreaterThanOrEqual(funds);
  console.info('ACTUAL_QUEUED_CANCEL', JSON.stringify({ mirrorX, expectedRevision, restoredRevision, executeAtTick,
    fundsAtSave: funds, liveFunds: pair.runtime.treasury.balanceMinorUnits, loadedFunds: loaded.treasury.balanceMinorUnits,
    liveOrder: pair.runtime.construction.getOrder(pair.orderId)?.state, loadedOrder: loaded.construction.getOrder(pair.orderId)?.state,
    livePending: pair.runtime.roomTemplates.snapshot().pending.length, loadedPending: loaded.roomTemplates.snapshot().pending.length,
    loadedRefusal: loaded.refusals.last?.reason, savedCommandCount: savedCommands.length,
  }));
  expect(loaded.construction.getOrder(pair.orderId)?.state).toBe('cancelled');
  expect(loaded.roomTemplates.snapshot().pending).toEqual([]);
  expect(loaded.treasury.balanceMinorUnits).toBe(pair.runtime.treasury.balanceMinorUnits);
});

it.each([false, true].flatMap(mirrorX => [false, true].map(load => ({ mirrorX, load }))))('a genuinely stale token still refuses without cancelling, mirror=$mirrorX load=$load', ({ mirrorX, load }) => {
  const original = pending(mirrorX);
  const pair = { ...original, runtime: load ? reload(original.runtime) : original.runtime };
  const before = captureSessionSnapshot(pair.runtime), funds = pair.runtime.treasury.balanceMinorUnits;
  send(pair.runtime, { type: 'CancelBuildOrder', orderId: pair.orderId, expectedRevision: 0 });
  expect(pair.runtime.refusals.last?.reason).toBe('cancel-build-order.stale-cancellation');
  expect(captureSessionSnapshot(pair.runtime).construction).toEqual(before.construction);
  expect(captureSessionSnapshot(pair.runtime).simulation?.roomTemplates).toEqual(before.simulation?.roomTemplates);
  expect(pair.runtime.treasury.balanceMinorUnits).toBe(funds);
});

it.each([false, true])('a real fresh post-Load row token still cancels the same rotated pending template, mirror=%s', mirrorX => {
  const pair = pending(mirrorX), loaded = reload(pair.runtime);
  send(loaded, { type: 'CancelBuildOrder', orderId: pair.orderId, expectedRevision: loaded.construction.revisionOf(pair.orderId) });
  expect(loaded.construction.getOrder(pair.orderId)?.state).toBe('cancelled');
  expect(loaded.roomTemplates.snapshot().pending).toEqual([]);
});
