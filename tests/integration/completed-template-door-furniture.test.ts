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
  runtime.kernel.submitCommand(`door-furniture-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function finish(runtime: Runtime) {
  for (let tick = 0; tick < 30_000 && (runtime.roomTemplates.snapshot().pending.length > 0 ||
    runtime.construction.allOrders().some(order => !['completed', 'failed', 'cancelled'].includes(order.state))); tick++) runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
  expect(runtime.construction.allOrders().every(order => ['completed', 'failed', 'cancelled'].includes(order.state))).toBe(true);
}
function load(runtime: Runtime) {
  const envelope = createSaveEnvelope({ gameVersion: 'test', prisonId: 'door-furniture', revision: 1,
    createdAt: 0, updatedAt: 1, ...captureSessionSnapshot(runtime) });
  expect(envelope.saveSchemaVersion).toBe(9);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed template must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
const poses = [
  { quarterTurns: 1, mirrorX: false, door: tile(10, 11), legalTile: tile(8, 11) },
  { quarterTurns: 3, mirrorX: true, door: tile(16, 11), legalTile: tile(18, 11) },
] as const;

it.each(poses.flatMap(pose => [false, true].flatMap(saved => [false, true].map(legal => ({ ...pose, saved, legal })))))
  ('completed template door vs independent furniture: q=$quarterTurns mirror=$mirrorX saved=$saved legal=$legal', testCase => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
      quarterTurns: testCase.quarterTurns, mirrorX: testCase.mirrorX });
    finish(runtime);
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
    expect(runtime.construction.allOrders().every(order => order.state === 'completed')).toBe(true);
    if (testCase.saved) runtime = load(runtime);
    // Independent scalar reference: 4x7 Cell, south door at local(1,6),
    // mirror first then clockwise q1 or q3. Neither tile is a square wall.
    expect(runtime.world.getSquareStructure(testCase.door)).toBe(0);
    const owners = runtime.placedObjects.getSnapshot();
    const before = captureSessionSnapshot(runtime);
    const funds = runtime.treasury.snapshot();
    const target = testCase.legal ? testCase.legalTile : testCase.door;
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'later-toilet', definitionId: 'toilet-brick', ...target });
    const order = runtime.construction.getOrder('later-toilet')!;
    if (testCase.legal) {
      expect(order.state).not.toBe('failed');
      finish(runtime);
      expect(order.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 1 }]);
      expect(runtime.treasury.balanceMinorUnits).toBe(funds.balanceMinorUnits - 40);
      expect(runtime.placedObjects.objectAt(target)?.sourceOrderId).toBe(order.id);
      runtime = load(runtime);
      send(runtime, { type: 'Undo' });
      expect(runtime.placedObjects.getSnapshot()).toEqual(owners);
      send(runtime, { type: 'Redo' });
      finish(runtime);
      expect(runtime.placedObjects.objectAt(target)?.sourceOrderId).toBe(order.id);
      expect(runtime.placedObjects.isTileOccupied(testCase.door)).toBe(false);
      return;
    }
    if (order.state !== 'failed') {
      finish(runtime);
      console.log(JSON.stringify({ testCase, order, fundsBefore: funds, fundsAfter: runtime.treasury.snapshot(),
        doorOccupied: runtime.placedObjects.isTileOccupied(testCase.door), objects: runtime.placedObjects.getSnapshot() }));
    }
    expect(order).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
    expect(runtime.treasury.snapshot()).toEqual(funds);
    const { kernel: _beforeKernel, ...beforeState } = before;
    const { kernel: _afterKernel, ...afterState } = captureSessionSnapshot(runtime);
    expect({ ...afterState, construction: { ...afterState.construction,
      orders: afterState.construction.orders.filter(row => row.id !== order.id) } }).toEqual({
        ...beforeState, construction: { ...beforeState.construction,
          orderRevisions: { ...beforeState.construction.orderRevisions, 'later-toilet': 1 },
        },
      });
  });

it.each([false, true])('ordinary separately built doorway retains its existing furniture policy, saved=%s', saved => {
  let runtime = createNewSimulationRuntime(73);
  // Genuine enclosed 2x3 Cell, no template gesture or template order IDs.
  // The south perimeter tile(20,23) is open and carries a north-facing door.
  const walls = [tile(20, 19), tile(21, 19), tile(21, 23),
    ...[20, 21, 22].flatMap(y => [tile(19, y), tile(22, y)])];
  walls.forEach((at, index) => send(runtime, { type: 'PlaceBuildOrder', orderId: `ordinary-wall-${index}`,
    definitionId: 'wall-brick', footprint: 'square', ...at }));
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'ordinary-door', definitionId: 'door-wooden',
    x: 20, y: 23, edge: 'north' });
  finish(runtime);
  expect(runtime.construction.allOrders().every(order => order.state === 'completed')).toBe(true);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.cell', x: 20, y: 20, width: 2, height: 3 });
  expect(runtime.prisoners.roomInstances.getById('room.cell:20:20')).toBeDefined();
  if (saved) runtime = load(runtime);
  expect(runtime.world.getTopEdge(tile(20, 23))).not.toBe(0);
  expect(runtime.world.getSquareStructure(tile(20, 23))).toBe(0);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'ordinary-toilet', definitionId: 'toilet-brick', x: 20, y: 23 });
  expect(runtime.construction.getOrder('ordinary-toilet')?.state).not.toBe('failed');
  finish(runtime);
  expect(runtime.placedObjects.objectAt(tile(20, 23))?.sourceOrderId).toBe('ordinary-toilet');
  expect(runtime.roomTemplates.snapshot().completed ?? []).toEqual([]);
});
