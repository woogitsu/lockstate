import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
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

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'occupied-template-undo', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Occupied template save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
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

it.each(orientations)('keeps an occupied completed Cell intact through refused Undo, save and release retry, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, ...orientation });
  finish(runtime);
  admit(runtime, 1, 400);
  runtime = reload(runtime);
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
  assertRefusedWithoutMutation(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(8);
  for (const room of rooms) expect(detail(runtime, room.instanceId))
    .toMatchObject({ requirementSummary: { missingCapability: 0 }, access: 'doorway' });
});

it.each(orientations)('relocates to a real older spare Cell before removing the occupied newest template, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 5 } });
  finish(runtime);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, ...orientation });
  finish(runtime);
  admit(runtime, 1);
  runtime = reload(runtime);
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
