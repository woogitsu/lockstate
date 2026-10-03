import { expect, it } from 'vitest';
import { InProcessSessionHost } from '../../src/persistence/session/runtime-host';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand } from '../../src/simulation/protocol/commands';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { SnapshotRefusedError } from '../../src/simulation/runtime/restore-refusal';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import type { JsonValue } from '../../src/shared/json';

function boughtBundle() {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('validation-purchase', 0, 0, packCommand({ type: 'PlaceBuildOrder',
    orderId: 'validation-wall', definitionId: 'wall-brick', x: 10, y: 10, footprint: 'square' }));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  runtime.kernel.step();
  expect(runtime.construction.revisionOf('validation-wall')).toBeGreaterThan(0);
  return { runtime, bundle: captureSessionSnapshot(runtime) };
}

const invalid = [
  { name: 'negative', record: { order: -1 } },
  { name: 'fractional', record: { order: 0.5 } },
  { name: 'unsafe', record: { order: Number.MAX_SAFE_INTEGER + 1 } },
  { name: 'NaN', record: { order: NaN } },
  { name: 'Infinity', record: { order: Infinity } },
  { name: 'string', record: { order: '1' } },
  { name: 'null value', record: { order: null } },
  { name: 'empty ID', record: { '': 0 } },
  { name: 'inherited object', record: Object.create({ inherited: 1 }) as unknown },
  { name: 'Date', record: new Date(0) },
];
it.each(invalid)('direct runtime restore refuses $name ledger before any construction mutation', ({ record }) => {
  const { runtime, bundle } = boughtBundle();
  const damaged = { ...bundle, construction: { ...bundle.construction, orderRevisions: record } } as unknown as SessionSnapshotBundle;
  expect(() => runtime.construction.restore(damaged.construction)).toThrowError(SnapshotRefusedError);
  expect(captureSessionSnapshot(runtime)).toStrictEqual(bundle);
  expect(() => restoreSimulationRuntime(damaged)).toThrowError(SnapshotRefusedError);
});

it.each([Object.prototype, null])('plain/null prototype with own unusual IDs is accepted consistently by codec and direct runtime', prototype => {
  const { bundle } = boughtBundle();
  const record = Object.assign(Object.create(prototype) as Record<string, number>, { 'validation-wall': 2, terminal: 0 });
  Object.defineProperty(record, '__proto__', { value: Number.MAX_SAFE_INTEGER, enumerable: true });
  const raw = { ...bundle, construction: { ...bundle.construction, newerActionThanTheStackTop: true, orderRevisions: record } };
  const saved = createSaveEnvelope({ gameVersion: 'test', prisonId: 'direct-ledger', revision: 1, createdAt: 0, updatedAt: 0, ...raw });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(saved)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw Error(decoded.error.message);
  const direct = restoreSimulationRuntime(raw).runtime;
  const stored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  expect(direct.construction.snapshot()).toStrictEqual(stored.construction.snapshot());
  expect(direct.construction.revisionOf('__proto__')).toBe(Number.MAX_SAFE_INTEGER);
  expect(direct.construction.revisionOf('terminal')).toBe(0);
});

it('in-process host retains its live session when a raw malformed ledger is refused', async () => {
  const host = new InProcessSessionHost();
  await host.startNew(73);
  const existing = host.getRuntime()!, before = captureSessionSnapshot(existing);
  const damaged = { ...before, construction: { ...before.construction, orderRevisions: { order: -1 } } };
  await expect(host.startFromSnapshot(damaged)).rejects.toMatchObject({ reason: 'damaged-payload' });
  expect(host.getRuntime()).toBe(existing);
  expect(captureSessionSnapshot(existing)).toStrictEqual(before);
});

it.each([false, true])('actual worker initialize raw snapshot validates the ledger without a save-envelope parser, damaged=%s', damaged => {
  const { bundle } = boughtBundle(), messages: WorkerToMainMessage[] = [];
  const machine = new SimulationWorkerStateMachine({ postMessage: message => { messages.push(message); } }, 'v9-test', () => 0);
  machine.handleMessage({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'handshake', kind: 'protocol/handshake',
    payload: { clientBuildId: 'v9-client', supportedProtocolVersions: [SIMULATION_PROTOCOL_VERSION], capabilities: [] } });
  const raw = damaged ? { ...bundle, construction: { ...bundle.construction, orderRevisions: { order: -1 } } } : bundle;
  machine.handleMessage({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'initialize', kind: 'simulation/initialize',
    payload: { sessionId: 'v9-session', source: { kind: 'snapshot', snapshot: { transport: 'structured-clone',
      schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: raw as unknown as JsonValue } } } });
  if (damaged) {
    expect(messages.find(message => message.kind === 'protocol/error')).toMatchObject({ kind: 'protocol/error',
      payload: { code: 'snapshot-incompatible', details: { snapshotRestore: 'damaged-payload' } } });
    expect(messages.some(message => message.kind === 'simulation/ready')).toBe(false);
    expect(machine.state).toBe('uninitialized');
  } else {
    expect(messages.some(message => message.kind === 'simulation/ready')).toBe(true);
    expect(machine.state).toBe('paused');
  }
});
