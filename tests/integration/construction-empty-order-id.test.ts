import { expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import type { VersionedPayload } from '../../src/simulation/protocol/types';
import type { JsonValue } from '../../src/shared/json';

const commands = [
  { type: 'PlaceBuildOrder', orderId: '', definitionId: 'wall-brick', x: 3, y: 3, footprint: 'square' },
  { type: 'PlaceObject', orderId: '', definitionId: 'bench-wooden', x: 7, y: 7 },
] as const satisfies readonly SimulationCommand[];

function raw(command: SimulationCommand): VersionedPayload {
  // Literal historical/live structured-clone input, not the corrected packer.
  return { schemaId: 'lockstate.simulation.command', schemaVersion: 1,
    transport: 'structured-clone', data: command as unknown as JsonValue };
}
function submit(runtime: SimulationRuntime, payload: VersionedPayload) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`input-${sequence}`, sequence, runtime.kernel.tick, payload);
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function save(runtime: SimulationRuntime) {
  return createSaveEnvelope({ gameVersion: 'test', prisonId: 'empty-order-id', revision: 1,
    createdAt: 0, updatedAt: 1, ...captureSessionSnapshot(runtime) });
}
function ready(command: SimulationCommand) {
  const runtime = createNewSimulationRuntime(73);
  if (command.type === 'PlaceObject') {
    submit(runtime, packCommand({ type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 4, y: 4 } }));
    runtime.kernel.step();
  }
  return runtime;
}

for (const command of commands) {
  it(`${command.type} refuses an empty live ID before funds, world, order, history or ledger mutation`, () => {
    const runtime = ready(command), before = captureSessionSnapshot(runtime);
    submit(runtime, raw(command));
    const after = captureSessionSnapshot(runtime);
    expect(after.construction).toStrictEqual(before.construction);
    expect(after.world).toStrictEqual(before.world);
    expect(after.simulation).toStrictEqual(before.simulation);
    expect(after.entities).toStrictEqual(before.entities);
    expect(after.identity).toStrictEqual(before.identity);
    expect(() => save(runtime)).not.toThrow();
  });
  it(`${command.type} keeps a nonempty free-form ID, real purchase and ordinary save legal`, () => {
    const runtime = ready(command), funds = runtime.treasury.balanceMinorUnits;
    // Save contract is min(1), not the stricter procurement identifier grammar.
    const orderId = ' ordinary order ';
    submit(runtime, packCommand({ ...command, orderId }));
    expect(runtime.construction.getOrder(orderId)?.state).toBe('approved');
    expect(runtime.treasury.balanceMinorUnits).toBe(funds - (command.type === 'PlaceObject' ? 130 : 80));
    expect(save(runtime).payload.construction.orderRevisions?.[orderId]).toBe('1');
  });
  it(`${command.type} rejects an empty current producer ID`, () => {
    expect(() => packCommand(command)).toThrow();
  });
}

for (let version = 1; version <= 10; version++) {
  it(`V${version} preserves both opaque empty-ID queued inputs through Load, then refuses before authoritative mutation`, () => {
    const runtime = createNewSimulationRuntime(73);
    for (const [index, command] of commands.entries()) {
      runtime.kernel.submitCommand(`historical-${index}`, index, runtime.kernel.tick, raw(command));
    }
    const current = save(runtime);
    const { newerActionThanTheStackTop: marker, orderRevisions: revisions, ...legacyConstruction } = current.payload.construction;
    // Optional subsystem sections are absent in this deliberately minimal old
    // envelope. World and queue are captured from a real runtime, not fabricated.
    const payload = { kernel: current.payload.kernel, world: current.payload.world,
      construction: version < 9 ? legacyConstruction : version === 9
        ? { ...legacyConstruction, newerActionThanTheStackTop: marker, orderRevisions: {} }
        : { ...legacyConstruction, newerActionThanTheStackTop: marker, orderRevisions: revisions } };
    const input = { ...current, saveSchemaVersion: version, payload,
      checksum: computeSaveChecksum(payload as unknown as JsonValue) };
    const bytes = JSON.stringify(input), decoded = decodeSaveEnvelope(JSON.parse(bytes));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.error.message);
    expect(JSON.stringify(input)).toBe(bytes);
    expect(decoded.value.payload.kernel.commands).toStrictEqual(current.payload.kernel.commands);
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
    const before = captureSessionSnapshot(restored);
    expect(restored.kernel.dispatchDueCommands()).toBe(2);
    const after = captureSessionSnapshot(restored);
    expect(after.construction).toStrictEqual(before.construction);
    expect(after.world).toStrictEqual(before.world);
    expect(after.simulation).toStrictEqual(before.simulation);
    expect(after.entities).toStrictEqual(before.entities);
    expect(after.identity).toStrictEqual(before.identity);
    expect(after.kernel.commands).toHaveLength(0);
    expect(() => save(restored)).not.toThrow();
  });
}

it('an empty cancellation lookup remains the existing idempotent no-op', () => {
  const runtime = createNewSimulationRuntime(73), before = captureSessionSnapshot(runtime);
  submit(runtime, packCommand({ type: 'CancelBuildOrder', orderId: '', expectedRevision: '0' }));
  const after = captureSessionSnapshot(runtime);
  expect(after.construction).toStrictEqual(before.construction);
  expect(after.simulation).toStrictEqual(before.simulation);
  expect(() => save(runtime)).not.toThrow();
});
