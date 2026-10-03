import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`generic-approach-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let ticks = 0; ticks < 30_000 && !predicate(); ticks++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'generic-approach', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Completed template must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
const poses = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => {
  // Independent 4x7 Cell reference: mirror its south doorway x=1, then rotate.
  const mx = mirrorX ? 2 : 1;
  const approach = [tile(10 + mx, 17), tile(9, 10 + mx), tile(13 - mx, 9), tile(17, 13 - mx)][quarterTurns]!;
  const odd = quarterTurns % 2 !== 0;
  return { quarterTurns, mirrorX, definitionId: odd ? 'bed-wooden' as const : 'desk-wooden' as const,
    x: approach.x - (odd ? 0 : 1), y: approach.y - (odd ? 1 : 0), approach };
}));
it.each(poses.flatMap(pose => [false, true].flatMap(saved => [false, true].map(legal => ({ ...pose, saved, legal })))))
('generic $definitionId cannot supersede a completed template approach, turn=$quarterTurns mirror=$mirrorX saved=$saved legal=$legal', testCase => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
    quarterTurns: testCase.quarterTurns, mirrorX: testCase.mirrorX });
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed'));
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  if (testCase.saved) runtime = reload(runtime);
  expect(runtime.roomTemplates.claimsRoomDoorApproachTile(testCase.approach)).toBe(true);
  const before = captureSessionSnapshot(runtime);
  const fundsBefore = runtime.treasury.snapshot();
  const x = testCase.x + (testCase.legal ? (testCase.quarterTurns === 3 ? 1 : -1) : 0);
  send(runtime, { type: 'PlaceBuildOrder', definitionId: testCase.definitionId, orderId: 'independent-object', x, y: testCase.y });
  const order = runtime.construction.getOrder('independent-object')!;
  if (testCase.legal) {
    expect(order.state).not.toBe('failed');
    until(runtime, () => order.state === 'completed');
    expect(runtime.placedObjects.objectAt(tile(x, testCase.y))?.sourceOrderId).toBe(order.id);
    expect(runtime.placedObjects.isTileOccupied(testCase.approach)).toBe(false);
    // A genuine independent gesture still owns its Undo/Redo after encoded Load.
    runtime = reload(runtime);
    send(runtime, { type: 'Undo' });
    expect(runtime.construction.getOrder(order.id)?.state).toBe('cancelled');
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
    expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
    runtime = reload(runtime);
    send(runtime, { type: 'Redo' });
    until(runtime, () => runtime.construction.getOrder(order.id)?.state === 'completed');
    expect(runtime.placedObjects.objectAt(tile(x, testCase.y))?.sourceOrderId).toBe(order.id);
    expect(runtime.placedObjects.isTileOccupied(testCase.approach)).toBe(false);
    return;
  }
  if (order.state !== 'failed') {
    until(runtime, () => order.state === 'completed');
    console.log(JSON.stringify({ stage: 'accepted-conflict', testCase, order, fundsBefore,
      fundsAfter: runtime.treasury.snapshot(), approachOccupied: runtime.placedObjects.isTileOccupied(testCase.approach) }));
  }
  expect(order).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
  expect(runtime.treasury.snapshot()).toEqual(fundsBefore);
  const { kernel: _beforeKernel, ...beforeState } = before;
  const { kernel: _afterKernel, ...afterState } = captureSessionSnapshot(runtime);
  expect({ ...afterState, construction: { ...afterState.construction, orders: afterState.construction.orders.filter(row => row.id !== order.id) } }).toEqual(beforeState);
});
