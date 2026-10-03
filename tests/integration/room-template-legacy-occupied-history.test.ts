import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { routeWaypoints } from '../../src/simulation/navigation/route';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
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

function reload(runtime: Runtime, legacy = false): Runtime {
  const original = captureSessionSnapshot(runtime); const bundle = legacy ? { ...original, simulation: { ...original.simulation!, roomTemplates: { version: 1 as const, pending: [] } } } : original;
  const envelope = createSaveEnvelope({
    gameVersion: 'test', prisonId: 'occupied-template-undo', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  // An old template-metadata fixture must really carry the frozen V8 format,
  // not a current V9 envelope that silently drops its accepted-action guard.
  const { newerActionThanTheStackTop: _marker, orderRevisions: _revisions, ...oldConstruction } = envelope.payload.construction;
  const oldPayload = { ...envelope.payload, construction: oldConstruction };
  const input = legacy ? { ...envelope, saveSchemaVersion: 8, payload: oldPayload,
    checksum: computeSaveChecksum(oldPayload as unknown as JsonValue) } : envelope;
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(input)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Occupied template save must decode');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  const { roomTemplates: _emptyOldCoordinator, ...oldSystems } = bundle.simulation!;
  expect(captureSessionSnapshot(restored)).toEqual(legacy ? {
    ...bundle, simulation: oldSystems,
    construction: { ...oldConstruction, newerActionThanTheStackTop: false, orderRevisions: {} },
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

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
function rowPoint(orientation: typeof orientations[number], x: number, y: number): TilePosition {
  // Independent authored 7x16 reference; mirror first, then clockwise turns.
  const mx = orientation.mirrorX ? 6 - x : x;
  return [tile(10 + mx, 10 + y), tile(25 - y, 10 + mx), tile(16 - mx, 25 - y), tile(10 + y, 16 - mx)][orientation.quarterTurns]!;
}
function route(runtime: Runtime, origin: TilePosition, destination: TilePosition, approach?: TilePosition) {
  for (const context of [{ role: 'prisoner', securityClearance: 0 }, { role: 'guard', securityClearance: 5 }]) {
    const id = `legacy-resident-${context.role}-${runtime.kernel.tick}`;
    runtime.navigation.requestRoute(id, origin, destination, context, 0, runtime.kernel.tick);
    until(runtime, () => runtime.navigation.getResult(id) !== undefined);
    const result = runtime.navigation.getResult(id)!.result;
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error('Saved furnished room must remain reachable');
    const points = routeWaypoints(result.route);
    expect(points.at(-1)).toEqual(destination);
    if (approach !== undefined) expect(points).toContainEqual(approach);
    expect(result.route.segments.some(segment => segment.enteredViaDoorId !== undefined)).toBe(true);
    runtime.navigation.clearResult(id);
  }
}
function rowRoute(runtime: Runtime, orientation: typeof orientations[number]) {
  route(runtime, rowPoint(orientation, 3, 7), rowPoint(orientation, 2, 12), rowPoint(orientation, 1, 8));
}

it.each(orientations)('keeps occupied legacy row access and readiness through atomic refusal, then releases and redoes the same saved geometry, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, ...orientation });
  finish(runtime);
  rowRoute(runtime, orientation);
  admit(runtime, 1, 1_000);
  runtime = reload(runtime);
  assertV9NewerAdmissionProtection(runtime);
  runtime = reload(runtime, true);
  expect(runtime.roomTemplates.snapshot().completed ?? []).toEqual([]);
  expect(runtime.roomTemplates.snapshot().undone ?? []).toEqual([]);
  assertRefusedWithoutMutation(runtime);
  expect(runtime.roomTemplates.snapshot().completed ?? []).toEqual([]);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(8);
  for (const room of runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')) expect(detail(runtime, room.instanceId))
    .toMatchObject({ requirementSummary: { missingCapability: 0 }, access: 'doorway' });
  rowRoute(runtime, orientation);
  until(runtime, () => runtime.prisoners.roomInstances.totalOccupancy === 0);
  send(runtime, { type: 'Undo' });
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toEqual([]);
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  expect(runtime.roomTemplates.snapshot().undone).toHaveLength(1);
  runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  runtime = reload(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(8);
  rowRoute(runtime, orientation);
  for (const room of runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')) expect(detail(runtime, room.instanceId))
    .toMatchObject({ requirementSummary: { missingCapability: 0 }, access: 'doorway' });
});

it.each([false, true])('preserves the current recorded occupied-row path, mirror=%s', mirrorX => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 }, mirrorX, quarterTurns: 1 });
  finish(runtime);
  admit(runtime, 1);
  runtime = reload(runtime);
  assertV9NewerAdmissionProtection(runtime);
  expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
});

it.each(orientations)('relocates a legacy newest-template resident only into the surviving older spare before removing the exact gesture, mirror=$mirrorX turn=$quarterTurns', orientation => {
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
  const resident = runtime.prisoners.roomInstances.occupantsOf(target)[0]!;
  expect(resident).toBeDefined();
  const funds = runtime.treasury.snapshot();
  send(runtime, { type: 'Undo' });
  expect(runtime.prisoners.roomInstances.getById(target)).toBeUndefined();
  expect(runtime.prisoners.roomInstances.occupantsOf(spare)).toEqual([resident]);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.treasury.snapshot()).toEqual(funds);
  runtime = reload(runtime);
  route(runtime, tile(21, 12), tile(22, 8));
  expect(detail(runtime, spare)).toMatchObject({ requirementSummary: { missingCapability: 0 }, access: 'doorway' });
});

const classes = ROOM_TEMPLATE_IDS.filter(id => id !== 'yard-basic').map((templateId, index) => ({
  templateId, mirrorX: index % 2 === 1, quarterTurns: ([0, 1, 2, 3] as const)[index % 4]!,
}));
it.each(classes)('recovers exact legacy $templateId zoning and fixtures from its real history through saved UndoRedo, mirror=$mirrorX turn=$quarterTurns', variant => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', origin: { x: 5, y: 5 }, ...variant });
  finish(runtime);
  const plan = runtime.roomTemplates.snapshot().completed![0]!;
  const originalObjects = runtime.placedObjects.getSnapshot();
  const originalPlanes = runtime.world.snapshot().chunks.map(({ geometryRevision: _g, contentRevision: _c, ...planes }) => planes);
  runtime = reload(runtime, true);
  expect(runtime.roomTemplates.snapshot().completed ?? []).toEqual([]);
  send(runtime, { type: 'Undo' });
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
  expect(runtime.roomTemplates.snapshot().undone).toHaveLength(1);
  runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  runtime = reload(runtime);
  expect(runtime.placedObjects.getSnapshot()).toEqual(originalObjects);
  expect(runtime.world.snapshot().chunks.map(({ geometryRevision: _g, contentRevision: _c, ...planes }) => planes)).toEqual(originalPlanes);
  expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
  // This is physical/order-derived recovery; no absent mirror flag or room
  // purpose is guessed independently of the complete order book and zoning.
  expect(runtime.roomTemplates.snapshot().completed![0]!.templateId).toBe(plan.templateId);
});
