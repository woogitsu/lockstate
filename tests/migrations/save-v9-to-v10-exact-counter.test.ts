import { expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, decodeSaveEnvelope, saveMigrationChain, type SaveEnvelopeV9 } from '../../src/persistence/save-schema';
import { migrateSaveEnvelopeV9ToV10 } from '../../src/persistence/save-migrations';
import { PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { packCommand, unpackCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import type { JsonValue } from '../../src/shared/json';

it('V9 preserves a real complete/pending/undone template, owners, marker, unusual ledger keys and exact queued envelope fields', () => {
  const runtime = createNewSimulationRuntime(73);
  function send(command: SimulationCommand) {
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`exact-rich-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  }
  send({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns: 1 });
  for (let tick = 0; tick < 30000 && (runtime.roomTemplates.snapshot().pending.length > 0 ||
    runtime.construction.allOrders().some(order => order.state !== 'completed')); tick++) runtime.kernel.step();
  send({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 10 }, mirrorX: true });
  send({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 20 }, quarterTurns: 3, mirrorX: true });
  send({ type: 'Undo' });
  send({ type: 'PurchaseMaterials', orderId: 'actual-rich-purchase', itemId: PROCURABLE_MATERIALS[0]!.itemId, quantity: 1 });
  expect(runtime.construction.snapshot().newerActionThanTheStackTop).toBe(true);
  runtime.kernel.step();
  const pending = runtime.construction.allOrders().find(order => order.state !== 'completed' && order.state !== 'cancelled')!;
  runtime.kernel.submitCommand('genuine-held-cancel', runtime.kernel.expectedSequence, runtime.kernel.tick + 10,
    packCommand({ type: 'CancelBuildOrder', orderId: pending.id, expectedRevision: runtime.construction.revisionOf(pending.id) }));
  runtime.kernel.submitCommand('genuine-held-ordinary', runtime.kernel.expectedSequence, runtime.kernel.tick + 11, packCommand({ type: 'Undo' }));
  const input = JSON.parse(JSON.stringify(createSaveEnvelope({ gameVersion: 'test', prisonId: 'rich-exact', revision: 7,
    createdAt: 0, updatedAt: 1, ...captureSessionSnapshot(runtime) })));
  input.saveSchemaVersion = 9;
  input.payload.construction.orderRevisions = Object.fromEntries(Object.entries(input.payload.construction.orderRevisions as Record<string, string>)
    .map(([id, token]) => [id, Number(token)]));
  Object.defineProperty(input.payload.construction.orderRevisions, '__proto__', { value: Number.MAX_SAFE_INTEGER, enumerable: true });
  input.payload.construction.orderRevisions.constructor = 0;
  for (const command of input.payload.kernel.commands) if (command.payload.data?.type === 'CancelBuildOrder') {
    command.payload.schemaVersion = 1;
    command.payload.data.expectedRevision = Number(command.payload.data.expectedRevision);
  }
  input.checksum = computeSaveChecksum(input.payload);
  const old = structuredClone(input), oldBytes = JSON.stringify(input);
  expect(input.payload.simulation.roomTemplates.completed).toHaveLength(1);
  expect(input.payload.simulation.roomTemplates.undone).toHaveLength(1);
  expect(input.payload.simulation.roomTemplates.pending).toHaveLength(1);
  expect(input.payload.simulation.objects.placedObjects.every((object: { sourceOrderId?: string }) => typeof object.sourceOrderId === 'string')).toBe(true);
  expect(saveMigrationChain.migrate(input, 9).ok).toBe(true);
  const direct = migrateSaveEnvelopeV9ToV10(input as SaveEnvelopeV9);
  expect(JSON.stringify(input)).toBe(oldBytes);
  expect(direct.payload).not.toBe(input.payload);
  expect(direct.payload.construction.orderRevisions).toStrictEqual(Object.fromEntries(Object.entries(old.payload.construction.orderRevisions)
    .map(([id, token]) => [id, String(token)])));
  expect(direct.payload.construction.newerActionThanTheStackTop).toBe(true);
  const expected = structuredClone(old.payload);
  expected.construction.orderRevisions = direct.payload.construction.orderRevisions;
  for (const command of expected.kernel.commands) if (command.payload.data?.type === 'CancelBuildOrder') {
    command.payload.schemaVersion = 2;
    command.payload.data.expectedRevision = String(command.payload.data.expectedRevision);
  }
  expect(direct.payload).toStrictEqual(expected);
  expect(direct.checksum).toBe(computeSaveChecksum(direct.payload as unknown as JsonValue));
  const decoded = decodeSaveEnvelope(JSON.parse(oldBytes));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw Error(decoded.error.message);
  expect(decoded.value.payload).toStrictEqual(direct.payload);
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  expect(captureSessionSnapshot(restored)).toStrictEqual(direct.payload);
  const queue = restored.kernel.snapshot().commands;
  expect(queue).toHaveLength(2);
  for (const command of queue) expect(unpackCommand(command.payload as ReturnType<typeof packCommand>)).not.toBeNull();
});

it.each(['0', '9007199254740992', '01', '-1'])('frozen V9 rejects a text ledger value %s instead of silently reinterpreting it', token => {
  const runtime = createNewSimulationRuntime(73);
  const input = JSON.parse(JSON.stringify(createSaveEnvelope({ gameVersion: 'test', prisonId: 'old-token', revision: 1,
    createdAt: 0, updatedAt: 0, ...captureSessionSnapshot(runtime) })));
  input.saveSchemaVersion = 9;
  input.payload.construction.orderRevisions = { explicit: token };
  input.checksum = computeSaveChecksum(input.payload);
  expect(decodeSaveEnvelope(input)).toMatchObject({ ok: false, error: { code: 'invalid-shape', atVersion: 9 } });
});
