import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { routeWaypoints } from '../../src/simulation/navigation/route';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const orientations = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));
type Orientation = typeof orientations[number];

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`completed-adjacent-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
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
  const bundle = captureSessionSnapshot(runtime);
  // Accepted older saves retain the real orders, geometry and history but
  // omit the optional completed/undone template ledger.
  const simulation = legacy ? { ...bundle.simulation!, roomTemplates: { version: 1 as const, pending: [] } } : bundle.simulation;
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'completed-template-adjacency', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(simulation === undefined ? {} : { simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Completed template adjacency save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function gameplay(runtime: Runtime) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return snapshot;
}

function point(orientation: Orientation, x: number, y: number) {
  // Independent authored 4x7 Basic Cell reference, mirror then clockwise turn.
  const mx = orientation.mirrorX ? 3 - x : x;
  return [tile(10 + mx, 10 + y), tile(16 - y, 10 + mx), tile(13 - mx, 16 - y), tile(10 + y, 13 - mx)][orientation.quarterTurns]!;
}

function geometry(orientation: Orientation) {
  const adjacent = [tile(10, 17), tile(3, 10), tile(10, 3), tile(17, 10)][orientation.quarterTurns]!;
  const clear = tile(adjacent.x + (orientation.quarterTurns % 2 === 0 ? 3 : 0),
    adjacent.y + (orientation.quarterTurns % 2 === 1 ? 3 : 0));
  return { approach: point(orientation, 1, 7), adjacent, clear };
}

function preflight(runtime: Runtime, orientation: Orientation, origin: { x: number; y: number }) {
  return PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, {
    target: { kind: 'room-template', templateId: 'cell-basic', origin, mirrorX: orientation.mirrorX, quarterTurns: orientation.quarterTurns },
  }).view;
}

function assertAccess(runtime: Runtime, orientation: Orientation) {
  for (const context of [{ role: 'prisoner', securityClearance: 0 }, { role: 'guard', securityClearance: 5 }]) {
    const id = `completed-adjacent-route-${context.role}-${runtime.kernel.tick}`;
    runtime.navigation.requestRoute(id, point(orientation, 1, 7), point(orientation, 2, 3), context, 0, runtime.kernel.tick);
    until(runtime, () => runtime.navigation.getResult(id) !== undefined);
    const result = runtime.navigation.getResult(id)!.result;
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error('Completed Cell must remain reachable');
    expect(routeWaypoints(result.route).at(-1)).toEqual(point(orientation, 2, 3));
    expect(result.route.segments.some(segment => segment.enteredViaDoorId !== undefined)).toBe(true);
    runtime.navigation.clearResult(id);
  }
}

function completed(orientation: Orientation, stage: string) {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, mirrorX: orientation.mirrorX, quarterTurns: orientation.quarterTurns });
  if (stage === 'partial save completed redo') {
    until(runtime, () => runtime.construction.allOrders().some(order => order.state === 'completed'));
    runtime = reload(runtime);
    send(runtime, { type: 'Undo' });
    runtime = reload(runtime);
    send(runtime, { type: 'Redo' });
  }
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  if (stage !== 'live completed') runtime = reload(runtime, stage === 'legacy completed save');
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
  if (stage === 'legacy completed save') expect(runtime.roomTemplates.snapshot().completed ?? []).toEqual([]);
  return runtime;
}

const cases = orientations.flatMap(orientation =>
  ['live completed', 'saved completed', 'legacy completed save', 'partial save completed redo'].map(stage => ({ ...orientation, stage })));

it.each(cases)('atomically refuses an adjacent shell at the completed entrance, $stage mirror=$mirrorX turn=$quarterTurns', testCase => {
  let runtime = completed(testCase, testCase.stage);
  assertAccess(runtime, testCase);
  const { approach, adjacent } = geometry(testCase);
  const before = gameplay(runtime);
  const verdict = preflight(runtime, testCase, adjacent);
  expect(gameplay(runtime)).toEqual(before);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: adjacent, mirrorX: testCase.mirrorX, quarterTurns: testCase.quarterTurns });
  // A late defensive wall refusal must not leave cancelled/failed orders or
  // consume the history entry of this single, refused template gesture.
  expect(runtime.construction.allOrders()).toHaveLength(before.construction.orders.length);
  expect(gameplay(runtime)).toEqual(before);
  expect(verdict).toEqual({ ok: false, reason: 'structure-occupied', tile: approach });
  expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: approach });
  assertAccess(runtime, testCase);
  runtime = reload(runtime, testCase.stage === 'legacy completed save');
  assertAccess(runtime, testCase);
});

it.each(orientations)('completes a legal adjacent neighbour and preserves both saved Cells, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = completed(orientation, 'legacy completed save');
  const { clear } = geometry(orientation);
  expect(preflight(runtime, orientation, clear)).toEqual({ ok: true });
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: clear, ...orientation });
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  finish(runtime);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(2);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(4);
  assertAccess(runtime, orientation);
  runtime = reload(runtime);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(2);
  assertAccess(runtime, orientation);
});

it.each(orientations)('releases the completed entrance on Undo and restores its atomic claim after saved Redo, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = completed(orientation, 'saved completed');
  const { approach, adjacent } = geometry(orientation);
  send(runtime, { type: 'Undo' });
  runtime = reload(runtime);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toEqual([]);
  const undone = gameplay(runtime);
  expect(preflight(runtime, orientation, adjacent)).toEqual({ ok: true });
  expect(gameplay(runtime)).toEqual(undone);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  runtime = reload(runtime);
  const restored = gameplay(runtime);
  const verdict = preflight(runtime, orientation, adjacent);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: adjacent, ...orientation });
  expect(gameplay(runtime)).toEqual(restored);
  expect(verdict).toEqual({ ok: false, reason: 'structure-occupied', tile: approach });
  assertAccess(runtime, orientation);
});

it('preserves ordinary player-built room semantics beside its standing door', () => {
  const runtime = createNewSimulationRuntime(73);
  // Build the same shell through ordinary commands, with no template producer.
  for (let y = 10; y <= 16; y++) for (let x = 10; x <= 13; x++) {
    if ((x !== 10 && x !== 13 && y !== 10 && y !== 16) || (x === 11 && y === 16)) continue;
    send(runtime, { type: 'PlaceBuildOrder', orderId: `ordinary-wall-${x}-${y}`, definitionId: 'wall-brick', x, y, footprint: 'square' });
  }
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'ordinary-door', definitionId: 'door-wooden', x: 11, y: 16, edge: 'north' });
  finish(runtime);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.cell', x: 11, y: 11, width: 2, height: 5 });
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(1);
  expect(preflight(runtime, { mirrorX: false, quarterTurns: 0 }, tile(10, 17))).toEqual({ ok: true });
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 17 } });
  finish(runtime);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(2);
});
