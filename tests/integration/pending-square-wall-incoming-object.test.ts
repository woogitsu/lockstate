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
        orders: afterGameplay.construction.orders.filter(order => order.id !== 'later-bed') } }).toEqual({
          ...beforeGameplay, construction: { ...beforeGameplay.construction,
            orderRevisions: { ...beforeGameplay.construction.orderRevisions, ...(type === 'PlaceBuildOrder' ? { 'later-bed': '1' } : {}) },
          },
        });
    } else {
      expect(runtime.construction.getOrder('later-bed')?.state).toBe('approved');
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot().some(object => object.sourceOrderId === 'later-bed')).toBe(true);
    }
  });

it.each((['PlaceObject', 'PlaceBuildOrder'] as const).flatMap(type =>
  [false, true].flatMap(load => [false, true].map(conflict => ({ type, load, conflict })))))
  ('horizontal Desk far tile respects the paid square: type=$type load=$load conflict=$conflict', ({ type, load, conflict }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
    finish(runtime);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'desk-square', definitionId: 'wall-brick', x: 12, y: conflict ? 13 : 12, footprint: 'square' });
    expect(runtime.construction.getOrder('desk-square')?.state).toBe('approved');
    if (load) runtime = reload(runtime);
    const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
    send(runtime, { type, orderId: 'later-desk', definitionId: 'desk-wooden', x: 11, y: 13 });
    if (conflict) {
      if (type === 'PlaceObject') expect(runtime.construction.getOrder('later-desk')).toBeUndefined();
      else expect(runtime.construction.getOrder('later-desk')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
      const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
      expect({ ...after, construction: { ...after.construction,
        orders: after.construction.orders.filter(order => order.id !== 'later-desk') } }).toEqual({
          ...before, construction: { ...before.construction,
            orderRevisions: { ...before.construction.orderRevisions, ...(type === 'PlaceBuildOrder' ? { 'later-desk': '1' } : {}) },
          },
        });
    } else {
      expect(runtime.construction.getOrder('later-desk')?.state).toBe('approved');
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot().some(object => object.sourceOrderId === 'later-desk')).toBe(true);
    }
  });

it.each((['PlaceObject', 'PlaceBuildOrder'] as const).flatMap(type =>
  [false, true].flatMap(load => ['cancelled square', 'legacy edge'].map(stage => ({ type, load, stage })))))
  ('released square and pending legacy edge keep furniture legal: type=$type load=$load stage=$stage', ({ type, load, stage }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
    finish(runtime);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'releasable-wall', definitionId: 'wall-brick', x: 12, y: 13,
      ...(stage === 'legacy edge' ? { edge: 'north' as const } : { footprint: 'square' as const }) });
    expect(runtime.construction.getOrder('releasable-wall')?.state).toBe('approved');
    if (stage === 'cancelled square') {
      send(runtime, { type: 'CancelBuildOrder', orderId: 'releasable-wall', expectedRevision: runtime.construction.revisionOf('releasable-wall')! });
      expect(runtime.construction.getOrder('releasable-wall')?.state).toBe('cancelled');
    }
    if (load) runtime = reload(runtime);
    send(runtime, { type, orderId: 'released-bed', definitionId: 'bed-wooden', x: 12, y: 12 });
    expect(runtime.construction.getOrder('released-bed')?.state).toBe('approved');
    finish(runtime);
    expect(runtime.placedObjects.getSnapshot().some(object => object.sourceOrderId === 'released-bed')).toBe(true);
    expect(runtime.world.getSquareStructure({ x: tileCoordinate(12), y: tileCoordinate(13) })).toBe(0);
  });

it.each((['PlaceObject', 'PlaceBuildOrder'] as const).flatMap(type => [false, true].map(conflict => ({ type, conflict }))))
  ('partly built square still owns its tile after encoded Load: type=$type conflict=$conflict', ({ type, conflict }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
    finish(runtime);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'partial-square', definitionId: 'wall-brick', x: conflict ? 12 : 11, y: 13, footprint: 'square' });
    for (let tick = 0; tick < 300 && (runtime.construction.getOrder('partial-square')?.progress ?? 0) === 0; tick++) runtime.kernel.step();
    expect(runtime.construction.getOrder('partial-square')).toMatchObject({ state: 'in-progress' });
    expect(runtime.construction.getOrder('partial-square')!.progress).toBeGreaterThan(0);
    expect(runtime.world.getSquareStructure({ x: tileCoordinate(12), y: tileCoordinate(13) })).toBe(0);
    runtime = reload(runtime);
    const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
    send(runtime, { type, orderId: 'partial-later-bed', definitionId: 'bed-wooden', x: 12, y: 12 });
    if (conflict) {
      if (type === 'PlaceObject') expect(runtime.construction.getOrder('partial-later-bed')).toBeUndefined();
      else expect(runtime.construction.getOrder('partial-later-bed')).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
      const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
      expect({ ...after, construction: { ...after.construction,
        orders: after.construction.orders.filter(order => order.id !== 'partial-later-bed') } }).toEqual({
          ...before, construction: { ...before.construction,
            orderRevisions: { ...before.construction.orderRevisions, ...(type === 'PlaceBuildOrder' ? { 'partial-later-bed': '1' } : {}) },
          },
        });
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
    } else {
      expect(runtime.construction.getOrder('partial-later-bed')?.state).toBe('approved');
      finish(runtime);
      expect(runtime.placedObjects.getSnapshot().some(object => object.sourceOrderId === 'partial-later-bed')).toBe(true);
    }
  });
