import { expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const MAX = '9007199254740991';
const NEXT = '9007199254740992';
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`exact-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function save(runtime: Runtime) {
  return createSaveEnvelope({ gameVersion: 'test', prisonId: 'exact-counter', revision: 1,
    createdAt: 0, updatedAt: 1, ...captureSessionSnapshot(runtime) });
}
function load(runtime: Runtime) {
  const before = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(save(runtime))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw Error(decoded.error.message);
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  expect(captureSessionSnapshot(restored)).toStrictEqual(before);
  return restored;
}
function bought() {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'actual-wall', definitionId: 'wall-brick',
    x: 3, y: 3, footprint: 'square' });
  runtime.kernel.step();
  expect(runtime.construction.getOrder('actual-wall')?.state).toBe('materials-pending');
  return runtime;
}
/** Actual existing order; modify only the legal approved V9 counter in checksum-valid encoded data. */
function importV9(runtime: Runtime, key: string, queued = false) {
  if (queued) runtime.kernel.submitCommand('held-real-cancel', runtime.kernel.expectedSequence,
    runtime.kernel.tick, packCommand({ type: 'CancelBuildOrder', orderId: key, expectedRevision: MAX }));
  const input = JSON.parse(JSON.stringify(save(runtime)));
  input.saveSchemaVersion = 9;
  input.payload.construction.orderRevisions = Object.fromEntries(
    Object.entries(input.payload.construction.orderRevisions as Record<string, string>).map(([id, token]) => [id, Number(token)]));
  input.payload.construction.orderRevisions[key] = Number.MAX_SAFE_INTEGER;
  for (const command of input.payload.kernel.commands) {
    if (command.payload?.data?.type === 'CancelBuildOrder') {
      command.payload.schemaVersion = 1;
      command.payload.data.expectedRevision = Number(command.payload.data.expectedRevision);
    }
  }
  input.checksum = computeSaveChecksum(input.payload);
  const untouched = JSON.stringify(input);
  const decoded = decodeSaveEnvelope(input);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw Error(decoded.error.message);
  expect(decoded.value.saveSchemaVersion).toBe(10);
  expect(JSON.stringify(input)).toBe(untouched);
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  expect(restored.construction.revisionOf(key)).toBe(MAX);
  return restored;
}

it('matching active MAX cancellation refunds exactly and Save/Load retains the exact next token', () => {
  const runtime = importV9(bought(), 'actual-wall');
  const funds = runtime.treasury.balanceMinorUnits;
  send(runtime, { type: 'CancelBuildOrder', orderId: 'actual-wall', expectedRevision: MAX });
  expect(runtime.construction.getOrder('actual-wall')?.state).toBe('cancelled');
  expect(runtime.construction.revisionOf('actual-wall')).toBe(NEXT);
  expect(runtime.treasury.balanceMinorUnits).toBe(funds + 80);
  load(runtime);
});

it('genuine completion at tick171 advances beyond MAX and remains whole-saveable', () => {
  const runtime = importV9(bought(), 'actual-wall');
  for (let tick = 0; tick < 1000 && runtime.construction.getOrder('actual-wall')?.state !== 'completed'; tick++) runtime.kernel.step();
  expect(runtime.construction.getOrder('actual-wall')?.state).toBe('completed');
  expect(runtime.kernel.tick).toBe(171);
  expect(runtime.construction.revisionOf('actual-wall')).toBe('9007199254740994');
  expect(runtime.treasury.balanceMinorUnits).toBe(24920);
  load(runtime);
});

it('queued historical MAX token migrates, survives another V10 Save/Load and dispatches once', () => {
  const runtime = load(importV9(bought(), 'actual-wall', true));
  expect(captureSessionSnapshot(runtime).kernel.commands).toHaveLength(1);
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  expect(runtime.construction.getOrder('actual-wall')?.state).toBe('cancelled');
  expect(runtime.construction.revisionOf('actual-wall')).toBe(NEXT);
  expect(runtime.treasury.balanceMinorUnits).toBe(25000);
  expect(runtime.kernel.dispatchDueCommands()).toBe(0);
  load(runtime);
});

it('a distinct old token beyond Number precision is refused without construction/treasury/world/history mutation', () => {
  const runtime = importV9(bought(), 'actual-wall');
  const before = captureSessionSnapshot(runtime);
  send(runtime, { type: 'CancelBuildOrder', orderId: 'actual-wall', expectedRevision: NEXT });
  const after = captureSessionSnapshot(runtime);
  expect(after.construction).toStrictEqual(before.construction);
  expect(after.world).toStrictEqual(before.world);
  expect(runtime.treasury.balanceMinorUnits).toBe(24920);
  expect(runtime.refusals.last?.reason).toBe('cancel-build-order.stale-cancellation');
  expect(after.simulation?.objects).toStrictEqual(before.simulation?.objects);
  load(runtime);
});

it('unused MAX key remains exact and legal through ordinary completion', () => {
  const runtime = importV9(bought(), 'unused-explicit-key');
  for (let tick = 0; tick < 1000 && runtime.construction.getOrder('actual-wall')?.state !== 'completed'; tick++) runtime.kernel.step();
  expect(runtime.construction.revisionOf('unused-explicit-key')).toBe(MAX);
  load(runtime);
});

it('untouched completed MAX key remains exact and legal', () => {
  let runtime = bought();
  for (let tick = 0; tick < 1000 && runtime.construction.getOrder('actual-wall')?.state !== 'completed'; tick++) runtime.kernel.step();
  runtime = importV9(runtime, 'actual-wall');
  for (let tick = 0; tick < 20; tick++) runtime.kernel.step();
  expect(runtime.construction.revisionOf('actual-wall')).toBe(MAX);
  load(runtime);
});
