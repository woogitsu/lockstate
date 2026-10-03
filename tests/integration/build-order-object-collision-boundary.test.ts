import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`object-build-collision-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'object-build-collision', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Object collision save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function finish(runtime: Runtime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed' || order.state === 'cancelled' || order.state === 'failed'));
}
it.each(([0, 1, 2, 3] as const).flatMap(quarterTurns => ['pending', 'completed'].flatMap(stage => (['PlaceObject', 'PlaceBuildOrder'] as const).map(type => ({ quarterTurns, stage, type })))))
  ('saved $stage rotated furniture refuses a second-tile-only $type collision, turn=$quarterTurns', ({ quarterTurns, stage, type }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns });
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().some(order => order.definitionId === 'bed-wooden'));
    const bed = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden')!;
    expect(bed.objectOrientation ?? 0).toBe(quarterTurns);
    if (stage === 'completed') finish(runtime);
    else expect(bed.state).not.toBe('completed');
    runtime = reload(runtime);
    const target = quarterTurns % 2 === 0 ? { x: bed.location.x, y: bed.location.y + 1 } : { x: bed.location.x + 1, y: bed.location.y };
    expect(runtime.placedObjects.isTileOccupied({ x: tileCoordinate(target.x), y: tileCoordinate(target.y) })).toBe(stage === 'completed');
    const objects = runtime.placedObjects.getSnapshot();
    const balance = runtime.treasury.balanceMinorUnits;
    const before = runtime.construction.snapshot();
    const revision = runtime.construction.revisionOf(bed.id);
    send(runtime, { type, orderId: 'later-desk', definitionId: 'desk-wooden', ...target });
    expect(runtime.construction.getOrder('later-desk')?.state).not.toBe('approved');
    expect(runtime.placedObjects.getSnapshot()).toEqual(objects);
    expect(runtime.treasury.balanceMinorUnits).toBe(balance);
    expect(runtime.construction.revisionOf(bed.id)).toBe(revision);
    expect(runtime.construction.snapshot().undoStack).toEqual(before.undoStack);
    expect(runtime.construction.snapshot().redoStack).toEqual(before.redoStack);
    expect(runtime.construction.snapshot().currentTransaction).toEqual(before.currentTransaction);
  });
it('the ordinary build-order route can complete a genuinely free desk beside saved completed furniture', () => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  finish(runtime);
  runtime = reload(runtime);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'free-desk', definitionId: 'desk-wooden', x: 11, y: 13 });
  expect(runtime.construction.getOrder('free-desk')?.state).toBe('approved');
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(3);
  expect(runtime.placedObjects.objectAt({ x: tileCoordinate(11), y: tileCoordinate(13) })?.objectId).toBe('object.desk');
});
it.each(['pending', 'completed'].flatMap(stage => (['PlaceObject', 'PlaceBuildOrder'] as const).map(type => ({ stage, type }))))
  ('free incoming anchor cannot hide a saved $stage far-square $type collision', ({ stage, type }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 2, y: 2 } });
    finish(runtime);
    send(runtime, { type: 'PlaceObject', orderId: 'source-bed', definitionId: 'bed-wooden', x: 9, y: 9 });
    expect(runtime.construction.getOrder('source-bed')?.state).toBe('approved');
    if (stage === 'completed') finish(runtime);
    runtime = reload(runtime);
    const first = { x: tileCoordinate(8), y: tileCoordinate(10) };
    const second = { x: tileCoordinate(9), y: tileCoordinate(10) };
    expect(runtime.placedObjects.isTileOccupied(first)).toBe(false);
    for (const tile of [first, second]) {
      expect(runtime.world.getZoning(tile)).toBe(0);
      expect(runtime.world.getSquareStructure(tile)).toBe(0);
      expect(runtime.world.getTopEdge(tile)).toBe(0);
      expect(runtime.world.getLeftEdge(tile)).toBe(0);
    }
    const balance = runtime.treasury.balanceMinorUnits;
    send(runtime, { type, orderId: 'far-desk', definitionId: 'desk-wooden', x: 8, y: 10 });
    expect(runtime.construction.getOrder('far-desk')?.state).not.toBe('approved');
    expect(runtime.treasury.balanceMinorUnits).toBe(balance);
  });
it('free low-level object build outside room keeps its existing route after the saved Yard source', () => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 2, y: 2 } });
  finish(runtime);
  runtime = reload(runtime);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'free-low-level-desk', definitionId: 'desk-wooden', x: 12, y: 12 });
  finish(runtime);
  expect(runtime.construction.getOrder('free-low-level-desk')?.state).toBe('completed');
  expect(runtime.placedObjects.objectAt({ x: tileCoordinate(12), y: tileCoordinate(12) })?.objectId).toBe('object.desk');
});

it.each(['pending', 'completed'] as const)('saved %s ordinary object releases its footprint for a later generic build after removal', stage => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 2, y: 2 } });
  finish(runtime);
  send(runtime, { type: 'PlaceObject', orderId: 'ordinary-bed', definitionId: 'bed-wooden', x: 9, y: 9 });
  if (stage === 'completed') finish(runtime);
  runtime = reload(runtime);
  const beforeBalance = runtime.treasury.balanceMinorUnits;
  if (stage === 'pending') {
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'duplicate-bed', definitionId: 'bed-wooden', x: 9, y: 9 });
    expect(runtime.construction.getOrder('duplicate-bed')).toMatchObject({ state: 'failed', failReason: 'duplicate-order' });
    expect(runtime.treasury.balanceMinorUnits).toBe(beforeBalance);
  }
  send(runtime, { type: 'RemoveObject', x: 9, y: 10 });
  runtime = reload(runtime);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'released-desk', definitionId: 'desk-wooden', x: 8, y: 10 });
  expect(runtime.construction.getOrder('released-desk')?.state).toBe('approved');
  finish(runtime);
  expect(runtime.placedObjects.objectAt({ x: tileCoordinate(8), y: tileCoordinate(10) })?.objectId).toBe('object.desk');
});
