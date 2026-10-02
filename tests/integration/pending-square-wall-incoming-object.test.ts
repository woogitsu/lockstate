import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`pending-square-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function finish(runtime: Runtime) {
  const done = () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => ['completed', 'cancelled', 'failed'].includes(order.state));
  for (let tick = 0; tick < 30_000 && !done(); tick++) runtime.kernel.step();
  expect(done()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'pending-square', revision: 1, createdAt: 0, updatedAt: 1,
    ...captureSessionSnapshot(runtime),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Real pending square save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

it.each((['PlaceObject', 'PlaceBuildOrder'] as const).flatMap(type =>
  [false, true].flatMap(load => [false, true].map(conflict => ({ type, load, conflict })))))
  ('paid pending square vs later Bed: type=$type load=$load conflict=$conflict', ({ type, load, conflict }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
    finish(runtime);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'paid-square', definitionId: 'wall-brick', x: conflict ? 12 : 11, y: 13, footprint: 'square' });
    expect(runtime.construction.getOrder('paid-square')?.state).toBe('approved');
    if (load) runtime = reload(runtime);
    const far = { x: tileCoordinate(12), y: tileCoordinate(13) };
    expect(runtime.world.getSquareStructure(far)).toBe(0);
    expect(runtime.placedObjects.isTileOccupied(far)).toBe(false);
    const before = captureSessionSnapshot(runtime);
    send(runtime, { type, orderId: 'later-bed', definitionId: 'bed-wooden', x: 12, y: 12 });
    const after = captureSessionSnapshot(runtime);
    // Retained diagnosis only; no synthetic state or order insertion.
    if (process.env['LOCKSTATE_PENDING_SQUARE_CAPTURE'] === '1') {
      let completed: SessionSnapshotBundle | undefined;
      if (conflict) {
        for (let tick = 0; tick < 30_000; tick++) {
          if (['completed', 'failed', 'cancelled'].includes(runtime.construction.getOrder('later-bed')?.state ?? '') &&
              ['completed', 'failed', 'cancelled'].includes(runtime.construction.getOrder('paid-square')?.state ?? '')) break;
          runtime.kernel.step();
        }
        completed = captureSessionSnapshot(runtime);
      }
      writeFileSync(`.local-pending-square/${type}-${load}-${conflict}.json`, JSON.stringify({ before, after, completed, completedSquare: completed === undefined ? undefined : runtime.world.getSquareStructure(far), physicalObjects: runtime.placedObjects.getSnapshot() }, null, 2));
    }
    if (conflict) {
      if (type === 'PlaceObject') expect(runtime.construction.getOrder('later-bed')).toBeUndefined();
      else expect(runtime.construction.getOrder('later-bed')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
      const { kernel: _beforeKernel, ...beforeGameplay } = before;
      const { kernel: _afterKernel, ...afterGameplay } = after;
      expect({ ...afterGameplay, construction: { ...afterGameplay.construction,
        orders: afterGameplay.construction.orders.filter(order => order.id !== 'later-bed') } }).toEqual(beforeGameplay);
    } else {
      expect(runtime.construction.getOrder('later-bed')?.state).toBe('approved');
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot().some(object => object.sourceOrderId === 'later-bed')).toBe(true);
    }
  });
