import { expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, decodeSaveEnvelope, saveMigrationChain, type SaveEnvelopeV1, type SaveEnvelopeV4, type SaveEnvelopeV8 } from '../../src/persistence/save-schema';
import { migrateSaveEnvelopeV1ToV2, migrateSaveEnvelopeV2ToV3, migrateSaveEnvelopeV3ToV4, migrateSaveEnvelopeV4ToV5, migrateSaveEnvelopeV5ToV6, migrateSaveEnvelopeV6ToV7, migrateSaveEnvelopeV7ToV8, migrateSaveEnvelopeV8ToV9, migrateSaveEnvelopeV9ToV10 } from '../../src/persistence/save-migrations';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import type { JsonValue } from '../../src/shared/json';
import fresh from '../fixtures/persistence/save-v1-fresh-prison.json';
import progress from '../fixtures/persistence/save-v1-in-progress.json';
import yard from '../fixtures/persistence/save-v4-yard.json';

function historicalChain(first: SaveEnvelopeV1) {
  const v2 = migrateSaveEnvelopeV1ToV2(first), v3 = migrateSaveEnvelopeV2ToV3(v2);
  const v4 = migrateSaveEnvelopeV3ToV4(v3), v5 = migrateSaveEnvelopeV4ToV5(v4);
  const v6 = migrateSaveEnvelopeV5ToV6(v5), v7 = migrateSaveEnvelopeV6ToV7(v6);
  return [first, v2, v3, v4, v5, v6, v7, migrateSaveEnvelopeV7ToV8(v7)];
}
const historical = [fresh, progress].flatMap(value => {
  const chain = historicalChain(value as unknown as SaveEnvelopeV1);
  return chain.map(envelope => ({ envelope, expectedV8: chain[7] as SaveEnvelopeV8 }));
});
const yardV5 = migrateSaveEnvelopeV4ToV5(yard as unknown as SaveEnvelopeV4);
const yardV6 = migrateSaveEnvelopeV5ToV6(yardV5), yardV7 = migrateSaveEnvelopeV6ToV7(yardV6);
const yardV8 = migrateSaveEnvelopeV7ToV8(yardV7);
historical.push(...[yard as unknown as SaveEnvelopeV4, yardV5, yardV6, yardV7, yardV8].map(envelope => ({ envelope, expectedV8: yardV8 })));

it.each(historical.map((row, index) => ({ ...row, index })))('V$envelope.saveSchemaVersion historical data case $index retains all V8 data with only approved defaults', ({ envelope, expectedV8 }) => {
  const input = structuredClone(envelope), before = JSON.stringify(input);
  const expected = expectedV8.payload;
  const result = decodeSaveEnvelope(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.error.message);
  expect(result.value.saveSchemaVersion).toBe(10);
  expect(result.value.payload).toStrictEqual({ ...expected, construction: {
    ...expected.construction, newerActionThanTheStackTop: false, orderRevisions: {},
  } });
  expect(JSON.stringify(input)).toBe(before);
});

it.each(historical.slice(0, 8))('frozen V$envelope.saveSchemaVersion refuses both new construction fields', ({ envelope }) => {
  expect(saveMigrationChain.migrate(envelope, envelope.saveSchemaVersion).ok).toBe(true);
  for (const extension of [{ newerActionThanTheStackTop: false }, { orderRevisions: {} }]) {
    const input = structuredClone(envelope);
    Object.assign(input.payload.construction, extension);
    const result = saveMigrationChain.migrate(input, input.saveSchemaVersion);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-shape', atVersion: input.saveSchemaVersion } });
  }
});

function currentEnvelope() {
  const runtime = createNewSimulationRuntime(73), bundle = captureSessionSnapshot(runtime);
  const input = JSON.parse(JSON.stringify(createSaveEnvelope({ gameVersion: 'test', prisonId: 'history-v9', revision: 1, createdAt: 0, updatedAt: 1, ...bundle })));
  input.saveSchemaVersion = 9;
  input.payload.construction.orderRevisions = Object.fromEntries(Object.entries(input.payload.construction.orderRevisions as Record<string, string>).map(([id, value]) => [id, Number(value)]));
  input.checksum = computeSaveChecksum(input.payload);
  return input;
}

it('preserves prototype-like, terminal, absent-order and explicit zero entries through real JSON, validator and Map restoration without aliasing', () => {
  const runtime = createNewSimulationRuntime(73);
  const record = Object.fromEntries([['__proto__', '0'], ['constructor', '7'], ['terminal-order', '11'], ['missing-order', String(Number.MAX_SAFE_INTEGER)]]);
  runtime.construction.restore({ ...runtime.construction.snapshot(), orderRevisions: record, newerActionThanTheStackTop: true });
  const bundle = captureSessionSnapshot(runtime);
  const saved = createSaveEnvelope({ gameVersion: 'test', prisonId: 'history-keys', revision: 1, createdAt: 0, updatedAt: 1, ...bundle });
  expect(saved.payload.construction.orderRevisions).toStrictEqual(record);
  expect(saved.payload.construction.orderRevisions).not.toBe(bundle.construction.orderRevisions);
  const input = JSON.parse(JSON.stringify(saved));
  const decoded = decodeSaveEnvelope(input);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw Error(decoded.error.message);
  expect(decoded.value.payload.construction.orderRevisions).not.toBe(input.payload.construction.orderRevisions);
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  expect(restored.construction.snapshot()).toStrictEqual(runtime.construction.snapshot());
  for (const [id, revision] of Object.entries(record)) expect(restored.construction.revisionOf(id)).toBe(revision);
  record['constructor'] = '0';
  expect(restored.construction.revisionOf('constructor')).toBe('7');
  // Reusing the same instance for legacy input must clear old counters/marker.
  restored.construction.restore({ orders: [], undoStack: [], redoStack: [] });
  expect(restored.construction.snapshot()).toMatchObject({ newerActionThanTheStackTop: false, orderRevisions: {} });
});

it.each([null, [], { '': 0 }, { order: -1 }, { order: 0.5 }, { order: Number.MAX_SAFE_INTEGER + 1 }, { order: NaN }, { order: Infinity }, { order: '1' }, { order: null }])('V9 refuses invalid revision record %j', orderRevisions => {
  const input = structuredClone(currentEnvelope());
  Object.assign(input.payload.construction, { orderRevisions });
  expect(decodeSaveEnvelope(input)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
});
it.each([0, 'false', null])('V9 refuses nonboolean marker %s', newerActionThanTheStackTop => {
  const input = structuredClone(currentEnvelope());
  Object.assign(input.payload.construction, { newerActionThanTheStackTop });
  expect(decodeSaveEnvelope(input)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
});

it('V8→V9 clones an actual rich template payload without filtering owners/history/commands or fabricating counters', () => {
  const runtime = createNewSimulationRuntime(73);
  function send(command: SimulationCommand) {
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`history-rich-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  }
  send({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns: 1 });
  for (let tick = 0; tick < 30_000 && (runtime.roomTemplates.snapshot().pending.length > 0 || runtime.construction.allOrders().some(order => order.state !== 'completed')); tick++) runtime.kernel.step();
  send({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 10 }, mirrorX: true });
  send({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 20 }, quarterTurns: 3, mirrorX: true });
  send({ type: 'Undo' });
  runtime.kernel.step();
  const pending = runtime.construction.allOrders().find(order => order.state !== 'completed' && order.state !== 'cancelled')!;
  expect(BigInt(runtime.construction.revisionOf(pending.id))).toBeGreaterThan(0n);
  runtime.kernel.submitCommand('saved-token', runtime.kernel.expectedSequence, runtime.kernel.tick,
    packCommand({ type: 'CancelBuildOrder', orderId: pending.id, expectedRevision: runtime.construction.revisionOf(pending.id) }));
  const input = JSON.parse(JSON.stringify(createSaveEnvelope({ gameVersion: 'test', prisonId: 'rich-v8', revision: 1, createdAt: 0, updatedAt: 1, ...captureSessionSnapshot(runtime) })));
  input.saveSchemaVersion = 8;
  for (const command of input.payload.kernel.commands) if (command.payload.data?.type === 'CancelBuildOrder') {
    command.payload.schemaVersion = 1;
    command.payload.data.expectedRevision = Number(command.payload.data.expectedRevision);
  }
  delete input.payload.construction.newerActionThanTheStackTop;
  delete input.payload.construction.orderRevisions;
  input.checksum = computeSaveChecksum(input.payload);
  expect(input.payload.simulation.roomTemplates.completed).toHaveLength(1);
  expect(input.payload.simulation.roomTemplates.undone).toHaveLength(1);
  expect(input.payload.simulation.roomTemplates.pending).toHaveLength(1);
  expect(input.payload.simulation.objects.placedObjects.every((object: { sourceOrderId?: string }) => typeof object.sourceOrderId === 'string')).toBe(true);
  expect(saveMigrationChain.migrate(input, 8).ok).toBe(true);
  const before = JSON.stringify(input), direct = migrateSaveEnvelopeV8ToV9(input as SaveEnvelopeV8);
  expect(direct.payload).toStrictEqual({ ...input.payload, construction: { ...input.payload.construction,
    newerActionThanTheStackTop: false, orderRevisions: {} } });
  expect(direct.payload).not.toBe(input.payload);
  expect(direct.payload.simulation?.objects).not.toBe(input.payload.simulation.objects);
  expect(direct.checksum).toBe(computeSaveChecksum(direct.payload as unknown as JsonValue));
  const result = decodeSaveEnvelope(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.error.message);
  expect(result.value.payload).toStrictEqual(migrateSaveEnvelopeV9ToV10(direct).payload);
  expect(JSON.stringify(input)).toBe(before);
  const loaded = restoreSimulationRuntime(result.value.payload as unknown as SessionSnapshotBundle).runtime;
  expect(loaded.construction.revisionOf(pending.id)).toBe('0');
  expect(loaded.kernel.dispatchDueCommands()).toBe(1);
  expect(loaded.refusals.last?.reason).toBe('cancel-build-order.stale-cancellation');
  expect(loaded.roomTemplates.snapshot().pending).toHaveLength(1);
});
