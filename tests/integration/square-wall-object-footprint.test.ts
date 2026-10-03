import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const orientations = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`wall-object-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function until(runtime: Runtime, predicate: () => boolean) {
  for (let count = 0; count < 30_000 && !predicate(); count++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'square-wall-object-footprint', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Object footprint save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function finish(runtime: Runtime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed'));
}

function desk(stage: string) {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 10, y: 10, width: 8, height: 8 });
  send(runtime, { type: 'PlaceObject', orderId: 'desk', definitionId: 'desk-wooden', x: 11, y: 11 });
  expect(runtime.construction.getOrder('desk')?.state).toBe('approved');
  if (stage.includes('partial')) until(runtime, () => runtime.construction.getOrder('desk')?.state === 'in-progress');
  if (stage.includes('completed')) finish(runtime);
  if (stage.includes('undone')) {
    runtime = reload(runtime);
    send(runtime, { type: 'Undo' });
    runtime = reload(runtime);
    send(runtime, { type: 'Redo' });
    if (stage.includes('completed')) finish(runtime);
  }
  if (stage !== 'live pending') runtime = reload(runtime);
  return runtime;
}

function refuseWall(runtime: Runtime, location: { x: number; y: number }) {
  const before = captureSessionSnapshot(runtime);
  const { orders: originalOrders, ...history } = before.construction;
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'overlapping-wall', definitionId: 'wall-brick', ...location, footprint: 'square' });
  const wall = runtime.construction.getOrder('overlapping-wall')!;
  if (wall.state !== 'failed') {
    // Expose the real production consequence: the wall completes inside the
    // object's footprint rather than checking only an admission flag.
    until(runtime, () => wall.state === 'completed');
    expect(runtime.world.getSquareStructure(tile(location.x, location.y))).toBe(0);
  }
  expect(wall).toMatchObject({ state: 'failed', failReason: 'unbuildable', materialsAllocated: [] });
  const { orders: _orders, ...afterHistory } = runtime.construction.snapshot();
  expect(afterHistory).toEqual(history);
  for (const order of originalOrders) expect(runtime.construction.getOrder(order.id)).toEqual(order);
  const after = captureSessionSnapshot(runtime);
  expect(after.world).toEqual(before.world);
  expect(after.simulation).toEqual(before.simulation);
  expect(after.entities).toEqual(before.entities);
  expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: location });
}

const stages = ['live pending', 'saved pending', 'saved partial', 'saved completed', 'saved partial undone redone', 'saved completed undone redone'];
it.each(stages)('refuses the second tile of an ordinary desk before allocation: %s', stage => {
  const runtime = desk(stage);
  expect(runtime.world.getSquareStructure(tile(12, 11))).toBe(0);
  refuseWall(runtime, tile(12, 11));
  const saved = reload(runtime);
  expect(saved.world.getSquareStructure(tile(12, 11))).toBe(0);
  expect(saved.construction.getOrder('overlapping-wall')?.state).toBe('failed');
});

function point(orientation: typeof orientations[number], x: number, y: number) {
  // Independent literal 6x6 Reception footprint; mirror then clockwise turn.
  const mx = orientation.mirrorX ? 5 - x : x;
  return [tile(10 + mx, 10 + y), tile(15 - y, 10 + mx), tile(15 - mx, 15 - y), tile(10 + y, 15 - mx)][orientation.quarterTurns]!;
}

it.each(orientations.flatMap(orientation => [false, true].map(completed => ({ ...orientation, completed }))))
  ('refuses an actual template desk far tile, completed=$completed mirror=$mirrorX turn=$quarterTurns', testCase => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'reception-basic', origin: { x: 10, y: 10 },
      mirrorX: testCase.mirrorX, quarterTurns: testCase.quarterTurns });
    // The coordinator releases its pending rectangle after it submits the
    // fixtures. Only the object claim must protect this interior tile now.
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0);
    const cells = [point(testCase, 1, 1), point(testCase, 2, 1)].sort((a, b) => a.y - b.y || a.x - b.x);
    const deskOrder = runtime.construction.allOrders().find(order => order.definitionId === 'desk-wooden')!;
    expect(deskOrder.location).toEqual(cells[0]);
    expect(deskOrder.objectOrientation ?? 0).toBe(testCase.quarterTurns);
    if (testCase.completed) finish(runtime);
    else expect(deskOrder.state).not.toBe('completed');
    runtime = reload(runtime);
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
    refuseWall(runtime, cells[1]!);
  });

it.each(['live pending', 'saved completed'])('allows an adjacent square and existing legacy edge beside a desk: %s', stage => {
  let runtime = desk(stage);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'clear-square', definitionId: 'wall-brick', x: 13, y: 11, footprint: 'square' });
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'legacy-edge', definitionId: 'wall-brick', x: 12, y: 11, edge: 'north' });
  finish(runtime);
  runtime = reload(runtime);
  expect(runtime.placedObjects.isTileOccupied(tile(12, 11))).toBe(true);
  expect(runtime.world.getSquareStructure(tile(13, 11))).not.toBe(0);
  expect(runtime.world.getSquareStructure(tile(12, 11))).toBe(0);
  expect(runtime.world.getTopEdge(tile(12, 11))).not.toBe(0);
});

it.each(['live pending', 'saved completed'])('releases the real footprint through RemoveObject before a square wall: %s', stage => {
  let runtime = desk(stage);
  send(runtime, { type: 'RemoveObject', x: 12, y: 11 });
  expect(runtime.placedObjects.isTileOccupied(tile(12, 11))).toBe(false);
  expect(runtime.construction.getOrder('desk')?.state).toBe(stage === 'live pending' ? 'cancelled' : 'completed');
  runtime = reload(runtime);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'released-square', definitionId: 'wall-brick', x: 12, y: 11, footprint: 'square' });
  until(runtime, () => runtime.construction.getOrder('released-square')?.state === 'completed');
  expect(runtime.world.getSquareStructure(tile(12, 11))).not.toBe(0);
});
