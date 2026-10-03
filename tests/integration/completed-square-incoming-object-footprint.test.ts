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
  runtime.kernel.submitCommand(`completed-square-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function finish(runtime: Runtime) {
  const done = () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => ['completed', 'cancelled', 'failed'].includes(order.state));
  for (let tick = 0; tick < 30_000 && !done(); tick++) runtime.kernel.step();
  expect(done()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'completed-square', revision: 1, createdAt: 0, updatedAt: 1, ...bundle,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed square V8 save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
const poses = [
  { quarterTurns: 0, mirrorX: false, conflict: { x: 12, y: 15 }, legal: { x: 12, y: 12 } },
  { quarterTurns: 1, mirrorX: true, conflict: { x: 13, y: 12 }, legal: { x: 11, y: 11 } },
] as const;
it.each(poses.flatMap(pose => (['PlaceObject', 'PlaceBuildOrder'] as const).flatMap(type =>
  [false, true].flatMap(load => [false, true].map(conflict => ({ ...pose, type, load, conflicts: conflict }))))))
  ('completed square admits no far-only Bed: q=$quarterTurns type=$type load=$load conflict=$conflicts', ({ quarterTurns, mirrorX, conflict, legal, type, load, conflicts }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns, mirrorX });
    finish(runtime);
    if (load) runtime = reload(runtime);
    const anchor = conflicts ? conflict : legal;
    expect(runtime.world.getSquareStructure(tile(anchor.x, anchor.y))).toBe(0);
    expect(runtime.world.getSquareStructure(tile(anchor.x, anchor.y + 1))).toBe(conflicts ? 1 : 0);
    expect(runtime.placedObjects.isTileOccupied(tile(anchor.x, anchor.y))).toBe(false);
    expect(runtime.placedObjects.isTileOccupied(tile(anchor.x, anchor.y + 1))).toBe(false);
    const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
    const revisions = runtime.construction.allOrders().map(order => [order.id, runtime.construction.revisionOf(order.id)]);

    send(runtime, { type, orderId: 'later-bed', definitionId: 'bed-wooden', ...anchor });

    if (conflicts) {
      if (type === 'PlaceObject') expect(runtime.construction.getOrder('later-bed')).toBeUndefined();
      else expect(runtime.construction.getOrder('later-bed')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
      const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
      expect({
        ...after,
        construction: { ...after.construction, orders: after.construction.orders.filter(order => order.id !== 'later-bed') },
      }).toEqual({ ...before, construction: { ...before.construction,
        // V9 retains the single planned -> failed transition of an ordinary
        // submitted order; PlaceObject's earlier refusal submits no order.
        orderRevisions: { ...before.construction.orderRevisions, ...(type === 'PlaceBuildOrder' ? { 'later-bed': 1 } : {}) },
      } });
      expect(runtime.construction.allOrders().filter(order => order.id !== 'later-bed').map(order => [order.id, runtime.construction.revisionOf(order.id)])).toEqual(revisions);
      // Load the refused state and ensure the unchanged paid room can continue.
      runtime = reload(runtime);
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
      expect(runtime.world.getSquareStructure(tile(anchor.x, anchor.y + 1))).toBe(1);
    } else {
      expect(runtime.construction.getOrder('later-bed')?.state).toBe('approved');
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(3);
      expect(runtime.placedObjects.getSnapshot().some(object => object.sourceOrderId === 'later-bed')).toBe(true);
    }
  });

it.each((['PlaceObject', 'PlaceBuildOrder'] as const).flatMap(type => [false, true].map(load => ({ type, load }))))
  ('legacy edge beside the real Bed anchor stays legal: type=$type load=$load', ({ type, load }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
    finish(runtime);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'legacy-edge', definitionId: 'wall-brick', x: 12, y: 12, edge: 'north' });
    finish(runtime);
    if (load) runtime = reload(runtime);
    expect(runtime.world.getSquareStructure(tile(12, 12))).toBe(0);
    send(runtime, { type, orderId: 'legacy-bed', definitionId: 'bed-wooden', x: 12, y: 12 });
    expect(runtime.construction.getOrder('legacy-bed')?.state).toBe('approved');
    finish(runtime);
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(3);
  });
