import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { routeWaypoints } from '../../src/simulation/navigation/route';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const poses = [false, true].flatMap(mirrorX => ([1, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`door-square-run-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let ticks = 0; ticks < 30_000 && !predicate(); ticks++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function finish(runtime: Runtime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => ['completed', 'cancelled', 'failed'].includes(order.state)));
}
function reload(runtime: Runtime, legacy = false): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const simulation = legacy ? {
    ...bundle.simulation!, roomTemplates: { version: 1 as const, pending: [] },
  } : bundle.simulation;
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    ...bundle, ...(simulation === undefined ? {} : { simulation }), gameVersion: 'test', prisonId: 'door-square-run',
    revision: 1, createdAt: 0, updatedAt: 1,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Genuine construction must survive encoded Load');
  expect(decoded.value.saveSchemaVersion).toBe(10);
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function prepare(pose: typeof poses[number], pending: boolean, saved: boolean) {
  let runtime = createNewSimulationRuntime(73);
  for (const [templateId, x, y] of [
    ['storage-room-basic', 2, 2], ['delivery-bay-basic', 20, 2],
  ] as const) send(runtime, { type: 'PlaceRoomTemplate', templateId, origin: { x, y } });
  finish(runtime);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, mirrorX: pose.mirrorX, quarterTurns: pose.quarterTurns });
  if (pending) {
    // Actual ticks fund the original shell first; its earlier unpaid bill must
    // not be attributed to the subsequent dragged run.
    for (let tick = 0; tick < 20; tick++) runtime.kernel.step();
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  } else finish(runtime);
  return saved ? reload(runtime) : runtime;
}
function positions(pose: typeof poses[number]) {
  // Authored Cell is 4x7 with south door x=1 (mirrored x=2), then clockwise
  // quarter turns. Expected positions do not call the production adapter.
  const mx = pose.mirrorX ? 2 : 1;
  const door = tile(pose.quarterTurns === 1 ? 10 : 16, 10 + (pose.quarterTurns === 1 ? mx : 3 - mx));
  return { door, approach: tile(door.x + (pose.quarterTurns === 1 ? -1 : 1), door.y),
    outer: tile(door.x + (pose.quarterTurns === 1 ? -2 : 2), door.y) };
}
function access(runtime: Runtime, door: ReturnType<typeof tile>, phase: string) {
  const room = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')[0]!;
  const id = `${phase}-${runtime.kernel.tick}`;
  runtime.navigation.requestRoute(id, tile(16, 16), room.anchorTile,
    { role: 'prisoner', securityClearance: 0 }, 0, runtime.kernel.tick);
  until(runtime, () => runtime.navigation.getResult(id) !== undefined);
  const result = runtime.navigation.getResult(id)!.result;
  expect(result, `${phase}: room anchor remains clear; entry must remain traversable`).toMatchObject({ ok: true });
  if (!result.ok) throw new Error('Completed template entry was sealed');
  expect(routeWaypoints(result.route)).toContainEqual(door);
  expect(result.route.segments.some(segment => segment.enteredViaDoorId !== undefined)).toBe(true);
  runtime.navigation.clearResult(id);
}

const cases = poses.flatMap(pose => [false, true].map(saved => ({ ...pose, saved, pending: false, adjacent: false })));
const controls = [
  { ...poses[0]!, saved: false, pending: true, adjacent: false },
  { ...poses[3]!, saved: true, pending: true, adjacent: false },
  { ...poses[1]!, saved: false, pending: false, adjacent: true },
  { ...poses[2]!, saved: true, pending: false, adjacent: true },
];
it.each([...cases, ...controls])(
  'square gesture protects the authored door: turn=$quarterTurns mirror=$mirrorX saved=$saved pending=$pending adjacent=$adjacent',
  testCase => {
    let runtime = prepare(testCase, testCase.pending, testCase.saved);
    const { door, approach, outer } = positions(testCase);
    if (!testCase.pending) access(runtime, door, 'before gesture');
    const before = captureSessionSnapshot(runtime);
    const funds = runtime.treasury.snapshot().balanceMinorUnits;
    const owners = runtime.placedObjects.getSnapshot();
    const y = door.y + (testCase.adjacent ? 1 : 0);
    const firstX = Math.min(door.x, outer.x);
    const ids = [firstX, firstX + 1, firstX + 2].map(x => `run-${x}`);
    for (const x of [firstX, firstX + 1, firstX + 2]) send(runtime, {
      type: 'PlaceBuildOrder', orderId: `run-${x}`, definitionId: 'wall-brick',
      x, y, footprint: 'square', transactionId: 'one-public-square-gesture',
    });
    const orders = ids.map(id => runtime.construction.getOrder(id)!);
    const expectedAccepted = testCase.adjacent ? ids.filter(id => id !== `run-${door.x}`) : [`run-${outer.x}`];
    const charged = funds - runtime.treasury.snapshot().balanceMinorUnits;
    const accepted = orders.filter(order => order.state !== 'failed').map(order => order.id);
    finish(runtime);
    console.log(JSON.stringify({ testCase, door, approach, outer, quotedMaximum: 240,
      accepted, charged, orders: orders.map(order => ({ id: order.id, state: order.state,
        failReason: order.failReason, materialsAllocated: order.materialsAllocated })),
      history: runtime.construction.snapshot().currentTransaction,
      doorSquare: runtime.world.getSquareStructure(door) }));
    // Each accepted square consumes exactly two catalogue bricks at 40.
    expect(accepted).toEqual(expectedAccepted);
    expect(charged).toBe(expectedAccepted.length * 80);
    expect(runtime.construction.snapshot().currentTransaction).toEqual(expectedAccepted);
    for (const order of orders) {
      if (expectedAccepted.includes(order.id)) expect(order.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);
      else expect(order).toMatchObject({ state: 'failed',
        failReason: testCase.adjacent ? 'duplicate-order' : 'unbuildable', materialsAllocated: [] });
    }
    for (const order of before.construction.orders) {
      if (!testCase.pending) expect(runtime.construction.getOrder(order.id)).toEqual(order);
    }
    if (!testCase.pending) expect(runtime.placedObjects.getSnapshot()).toEqual(owners);
    const completedOwners = runtime.placedObjects.getSnapshot();
    expect(runtime.world.getSquareStructure(door)).toBe(0);
    expect(runtime.world.getSquareStructure(approach)).toBe(0);
    access(runtime, door, 'after gesture');
    // Undo/Redo acts on accepted run segments only, retaining the template and
    // its exact physical sourceOrderIds through a real encoded V8 boundary.
    const afterSpend = runtime.treasury.snapshot().balanceMinorUnits;
    send(runtime, { type: 'Undo' });
    expect(runtime.treasury.snapshot().balanceMinorUnits).toBe(afterSpend);
    expect(runtime.placedObjects.getSnapshot()).toEqual(completedOwners);
    for (const id of expectedAccepted) expect(runtime.construction.getOrder(id)?.state).toBe('cancelled');
    expect(runtime.world.getSquareStructure(door)).toBe(0);
    runtime = reload(runtime);
    send(runtime, { type: 'Redo' });
    finish(runtime);
    expect(runtime.placedObjects.getSnapshot()).toEqual(completedOwners);
    for (const id of expectedAccepted) expect(runtime.construction.getOrder(id)?.state).toBe('completed');
    expect(runtime.world.getSquareStructure(door)).toBe(0);
    access(runtime, door, 'saved redo');
  },
);

it('protects the actual completed template door without optional completed gesture metadata', () => {
  const pose = { quarterTurns: 3 as const, mirrorX: true };
  const runtime = reload(prepare(pose, false, false), true);
  const { door } = positions(pose);
  access(runtime, door, 'legacy before');
  const before = captureSessionSnapshot(runtime);
  const funds = runtime.treasury.snapshot();
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'legacy-door-square', definitionId: 'wall-brick',
    x: door.x, y: door.y, footprint: 'square' });
  expect(runtime.construction.getOrder('legacy-door-square')).toMatchObject({
    state: 'failed', failReason: 'unbuildable', materialsAllocated: [],
  });
  expect(runtime.treasury.snapshot()).toEqual(funds);
  const { orders: _beforeOrders, ...beforeHistory } = before.construction;
  const { orders: _afterOrders, ...afterHistory } = runtime.construction.snapshot();
  expect(afterHistory).toEqual({ ...beforeHistory,
    orderRevisions: { ...beforeHistory.orderRevisions, 'legacy-door-square': '1' },
  });
  expect(captureSessionSnapshot(runtime).world).toEqual(before.world);
  access(runtime, door, 'legacy after refusal');
});

it('retains the existing standalone legacy-door and square-wall combination policy', () => {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'ordinary-door', definitionId: 'door-wooden',
    x: 10, y: 10, edge: 'west', transactionId: 'ordinary-door-gesture' });
  finish(runtime);
  expect(runtime.navigation.doors.all()).toHaveLength(1);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'ordinary-square', definitionId: 'wall-brick',
    x: 10, y: 10, footprint: 'square', transactionId: 'ordinary-wall-gesture' });
  expect(runtime.construction.getOrder('ordinary-square')?.state).not.toBe('failed');
  finish(runtime);
  expect(runtime.world.getSquareStructure(tile(10, 10))).toBe(1);
  expect(runtime.navigation.doors.all()).toHaveLength(1);
  send(runtime, { type: 'Undo' });
  expect(runtime.world.getSquareStructure(tile(10, 10))).toBe(0);
  expect(runtime.navigation.doors.all()).toHaveLength(1);
});
