import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { routeWaypoints } from '../../src/simulation/navigation/route';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const orientations = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`completed-row-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function reload(runtime: Runtime, legacy = false): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  // Completed gesture metadata is optional in accepted older V7 saves. The
  // standing door and zoning must remain sufficient to protect its entrance.
  const simulation = legacy ? { ...bundle.simulation!, roomTemplates: { version: 1 as const, pending: [] } } : bundle.simulation;
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'completed-row-access', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(simulation === undefined ? {} : { simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Completed row save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function until(runtime: Runtime, predicate: () => boolean) {
  for (let count = 0; count < 30_000 && !predicate(); count++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

function point(orientation: typeof orientations[number], x: number, y: number): TilePosition {
  // Independent literal reference for the authored 7x16 row, mirrored before
  // clockwise rotation. No production template/rotation adapter is reused.
  const mx = orientation.mirrorX ? 6 - x : x;
  return [tile(10 + mx, 10 + y), tile(25 - y, 10 + mx), tile(16 - mx, 25 - y), tile(10 + y, 16 - mx)][orientation.quarterTurns]!;
}

function edgeBetween(a: TilePosition, b: TilePosition) {
  return { ...tile(Math.max(a.x, b.x), Math.max(a.y, b.y)), edge: a.x === b.x ? 'north' as const : 'west' as const };
}

function completed(orientation: typeof orientations[number], stage: string): Runtime {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 10, y: 10 },
    mirrorX: orientation.mirrorX, quarterTurns: orientation.quarterTurns });
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  if (stage === 'saved partial continuation') {
    until(runtime, () => runtime.construction.allOrders().some(order => order.state === 'completed'));
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
    runtime = reload(runtime);
  }
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed'));
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(8);
  expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
  if (stage !== 'live completed') runtime = reload(runtime, stage === 'legacy completed save');
  return runtime;
}

function assertAccess(runtime: Runtime, orientation: typeof orientations[number], phase: string) {
  const origin = point(orientation, 3, 7);
  const approach = point(orientation, 1, 8);
  const destination = point(orientation, 2, 12);
  for (const context of [{ role: 'prisoner', securityClearance: 0 }, { role: 'guard', securityClearance: 5 }]) {
    const id = `${phase}-${context.role}-${runtime.kernel.tick}`;
    runtime.navigation.requestRoute(id, origin, destination, context, 0, runtime.kernel.tick);
    until(runtime, () => runtime.navigation.getResult(id) !== undefined);
    const result = runtime.navigation.getResult(id)!.result;
    expect(result, `${phase}: ${context.role} must reach the furnished lower cell: ${JSON.stringify(result)}`).toMatchObject({ ok: true });
    if (!result.ok) throw new Error('Lower cell route was lost');
    const waypoints = routeWaypoints(result.route);
    expect(waypoints).toContainEqual(approach);
    expect(waypoints.at(-1)).toEqual(destination);
    expect(result.route.segments.some(segment => segment.enteredViaDoorId !== undefined)).toBe(true);
    runtime.navigation.clearResult(id);
  }
}

const squareCases = orientations.flatMap(orientation =>
  ['live completed', 'saved completed', 'saved partial continuation', 'legacy completed save'].map(stage => ({ ...orientation, stage })));
const blockers = [
  ...squareCases.map(testCase => ({ ...testCase, square: true })),
  ...orientations.map(orientation => ({ ...orientation, stage: 'saved completed', square: false })),
];

it.each(blockers)('keeps actual lower-cell access after $stage, square=$square mirror=$mirrorX turn=$quarterTurns', testCase => {
  let runtime = completed(testCase, testCase.stage);
  assertAccess(runtime, testCase, 'before wall');
  const before = captureSessionSnapshot(runtime);
  const { orders: originalOrders, ...history } = before.construction;
  const funds = runtime.treasury.snapshot();
  const location = testCase.square ? { ...point(testCase, 1, 8), footprint: 'square' as const }
    : edgeBetween(point(testCase, 1, 8), point(testCase, 1, 9));
  send(runtime, { type: 'PlaceBuildOrder', definitionId: 'wall-brick', orderId: 'doorway-barrier', ...location });
  const wall = runtime.construction.getOrder('doorway-barrier')!;
  if (wall.state !== 'failed') {
    // On the broken production path the command succeeds. Finish that actual
    // order and expose its gameplay consequence, rather than merely asserting
    // a preflight flag or an implementation-specific claim lookup.
    until(runtime, () => wall.state === 'completed');
    assertAccess(runtime, testCase, 'after accepted wall');
  }
  expect(wall).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  const { orders: _orders, ...afterHistory } = runtime.construction.snapshot();
  expect(afterHistory).toEqual({ ...history,
    orderRevisions: { ...history.orderRevisions, 'doorway-barrier': 1 },
  });
  for (const order of originalOrders) expect(runtime.construction.getOrder(order.id)).toEqual(order);
  expect(runtime.treasury.snapshot()).toEqual(funds);
  const after = captureSessionSnapshot(runtime);
  expect(after.world).toEqual(before.world);
  expect(after.simulation).toEqual(before.simulation);
  expect(after.entities).toEqual(before.entities);
  assertAccess(runtime, testCase, 'after refused wall');
  runtime = reload(runtime, testCase.stage === 'legacy completed save');
  assertAccess(runtime, testCase, 'saved refusal');
});

it.each(orientations)('allows adjacent square and perpendicular edge beside a completed entrance, mirror=$mirrorX turn=$quarterTurns', orientation => {
  const runtime = completed(orientation, 'saved partial continuation');
  assertAccess(runtime, orientation, 'before neighbours');
  send(runtime, { type: 'PlaceBuildOrder', definitionId: 'wall-brick', orderId: 'adjacent-square',
    ...point(orientation, 2, 8), footprint: 'square' });
  send(runtime, { type: 'PlaceBuildOrder', definitionId: 'wall-brick', orderId: 'perpendicular-edge',
    ...edgeBetween(point(orientation, 0, 8), point(orientation, 1, 8)) });
  until(runtime, () => ['adjacent-square', 'perpendicular-edge'].every(id => runtime.construction.getOrder(id)?.state === 'completed'));
  assertAccess(runtime, orientation, 'after neighbours');
  assertAccess(reload(runtime), orientation, 'saved neighbours');
});
