import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import type { JsonValue } from '../../src/shared/json';
import { MAX_BUFFERED_SIMULATION_EVENTS } from '../../src/simulation/events/event-log';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import type { RoomDetailViewModel } from '../../src/simulation/presentation/room-projection';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const orientations = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`occupied-template-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function until(runtime: Runtime, predicate: () => boolean) {
  for (let count = 0; count < 30_000 && !predicate(); count++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

function finish(runtime: Runtime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed'));
}

function reload(runtime: Runtime, historicalV8 = false): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'test', prisonId: 'occupied-template-undo', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const { newerActionThanTheStackTop: _marker, orderRevisions: _revisions, ...oldConstruction } = envelope.payload.construction;
  const oldPayload = { ...envelope.payload, construction: oldConstruction };
  const input = historicalV8 ? { ...envelope, saveSchemaVersion: 8, payload: oldPayload,
    checksum: computeSaveChecksum(oldPayload as unknown as JsonValue) } : envelope;
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(input)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Occupied template save must decode');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  expect(captureSessionSnapshot(restored)).toEqual(historicalV8 ? {
    ...bundle, construction: { ...oldConstruction, newerActionThanTheStackTop: false, orderRevisions: {} },
  } : bundle);
  return restored;
}

function detail(runtime: Runtime, id: string) {
  return PROJECTION_CATALOG['hud/room-detail'].project(runtime, runtime.kernel.tick, { target: { kind: 'id', id } })
    .view as unknown as RoomDetailViewModel | undefined;
}

function admit(runtime: Runtime, count: number, sentenceLengthTicks = 1_000_000) {
  for (let index = 0; index < count; index++) send(runtime, {
    type: 'AdmitPrisoner', sentenceLengthTicks, priorIncidents: 0, x: 16, y: 16,
  });
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === count);
}

function assertRefusedWithoutMutation(runtime: Runtime) {
  const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
  const funds = runtime.treasury.snapshot();
  send(runtime, { type: 'Undo' });
  const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
  // The command sequence advances; every persisted gameplay field must stay
  // identical, including world planes, live actor state, history and orders.
  expect(after).toEqual(before);
  expect(runtime.treasury.snapshot()).toEqual(funds);
  expect(runtime.refusals.last).toMatchObject({ reason: 'unzone.room-occupied' });
}

function assertV9NewerAdmissionProtection(runtime: Runtime) {
  const before = captureSessionSnapshot(runtime);
  expect(before.construction.newerActionThanTheStackTop).toBe(true);
  const beforeEvents = before.simulation!.alerts!;
  send(runtime, { type: 'Undo' });
  const after = captureSessionSnapshot(runtime);
  expect(after.kernel).toEqual({ ...before.kernel, expectedSequence: before.kernel.expectedSequence + 1 });
  const { alerts: afterEvents, ...afterSystems } = after.simulation!;
  const { alerts: _beforeEvents, ...beforeSystems } = before.simulation!;
  expect({ ...after, kernel: before.kernel, simulation: afterSystems }).toEqual({ ...before, simulation: beforeSystems });
  const event = { sequence: beforeEvents.sequence + 1, tick: runtime.kernel.tick, type: 'construction.undo-refused-newer-action' };
  expect(afterEvents).toEqual({ ...beforeEvents, sequence: event.sequence,
    records: [...beforeEvents.records, event].slice(-MAX_BUFFERED_SIMULATION_EVENTS) });
  expect(runtime.refusals.count).toBe(0);
}

it.each(orientations)('keeps an occupied completed Cell intact through V9 later-action protection and historical V8 occupied Undo/release retry, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, ...orientation });
  finish(runtime);
  admit(runtime, 1, 400);
  runtime = reload(runtime);
  assertV9NewerAdmissionProtection(runtime);
  runtime = reload(runtime, true);
  const id = 'room.cell:11:11';
  expect(runtime.prisoners.roomInstances.occupancyOf(id)).toBe(1);
  expect(detail(runtime, id)).toMatchObject({ requirementSummary: { missingCapability: 0 }, access: 'doorway' });
  assertRefusedWithoutMutation(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(detail(runtime, id)).toMatchObject({ requirementSummary: { missingCapability: 0 }, access: 'doorway' });
  runtime = reload(runtime);
  assertRefusedWithoutMutation(runtime);
  // The actual sentence system releases this admitted resident; no entity,
  // occupancy record, room geometry or furniture is injected or removed.
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 0);
  send(runtime, { type: 'Undo' });
  expect(runtime.prisoners.roomInstances.getById(id)).toBeUndefined();
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
  expect(runtime.refusals.last?.reason).not.toBe('unzone.room-occupied');
  runtime = reload(runtime);
  expect(runtime.roomTemplates.snapshot().undone).toHaveLength(1);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(detail(reload(runtime), id)).toMatchObject({ requirementSummary: { missingCapability: 0 }, access: 'doorway' });
});

it.each([false, true])('does not relocate a saved row resident into another Cell of the same removed gesture, mirror=%s', mirrorX => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, mirrorX, quarterTurns: 1 });
  until(runtime, () => runtime.construction.allOrders().some(order => order.state === 'completed'));
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  runtime = reload(runtime);
  finish(runtime);
  admit(runtime, 1);
  runtime = reload(runtime);
  const rooms = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell');
  expect(rooms).toHaveLength(4);
  expect(runtime.prisoners.roomInstances.totalResidentCapacity).toBe(4);
  // Three other row rooms are empty, but all four belong to the same Undo.
  // They must be excluded together from the existing relocation search.
  assertV9NewerAdmissionProtection(runtime);
  runtime = reload(runtime, true);
  assertRefusedWithoutMutation(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(8);
  for (const room of rooms) expect(detail(runtime, room.instanceId))
    .toMatchObject({ requirementSummary: { missingCapability: 0 }, access: 'doorway' });
});

it.each(orientations)('preserves V9 later-action protection and historical V8 relocation into a real older spare Cell, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 5 } });
  finish(runtime);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, ...orientation });
  finish(runtime);
  admit(runtime, 1);
  runtime = reload(runtime);
  assertV9NewerAdmissionProtection(runtime);
  runtime = reload(runtime, true);
  const target = 'room.cell:11:11';
  const spare = 'room.cell:21:6';
  expect(runtime.prisoners.roomInstances.occupancyOf(target)).toBe(1);
  expect(runtime.prisoners.roomInstances.occupancyOf(spare)).toBe(0);
  const resident = runtime.prisoners.roomInstances.occupantsOf(target)[0]!;
  const funds = runtime.treasury.snapshot();
  send(runtime, { type: 'Undo' });
  expect(runtime.prisoners.roomInstances.getById(target)).toBeUndefined();
  expect(runtime.prisoners.roomInstances.occupantsOf(spare)).toEqual([resident]);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.construction.allOrders().filter(order => order.state === 'completed')).toHaveLength(20);
  expect(runtime.treasury.snapshot()).toEqual(funds);
  runtime = reload(runtime);
  expect(runtime.prisoners.roomInstances.occupantsOf(spare)).toEqual([resident]);
  expect(detail(runtime, spare)).toMatchObject({ requirementSummary: { missingCapability: 0 }, access: 'doorway' });
  // The next history entry is now the occupied spare with no vacancy. The
  // successful first reversal must not license a partial second reversal.
  assertRefusedWithoutMutation(runtime);
});
