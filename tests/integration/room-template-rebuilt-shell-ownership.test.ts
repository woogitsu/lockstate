import { expect, it } from 'vitest';
import { resolveBuildEdge } from '../../src/simulation/construction/build-order';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;

function send(runtime: Runtime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`rebuilt-shell-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function finish(runtime: Runtime): void {
  const done = () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed' || order.state === 'cancelled');
  for (let tick = 0; tick < 30_000 && !done(); tick++) runtime.kernel.step();
  expect(done()).toBe(true);
}

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'rebuilt-template-shell', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Rebuilt shell save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

const cases = (['wall', 'door'] as const).flatMap(kind => [false, true].flatMap(mirrorX =>
  ([0, 1] as const).map(quarterTurns => ({ kind, mirrorX, quarterTurns }))));

/** Manual shell removal already reverses the entire template, unlike standing RemoveObject (#1975). */
it.each(cases)(
  'rebuilt $kind preserves its independent purchase after saved old-template Cancel: mirror=$mirrorX q=$quarterTurns',
  ({ kind, mirrorX, quarterTurns }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, mirrorX, quarterTurns });
    finish(runtime);
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);

    const old = runtime.construction.allOrders().find(order =>
      kind === 'door' ? order.definitionId === 'door-wooden' : order.footprint === 'square')!;
    expect(old).toMatchObject({ state: 'completed' });
    const oldId = old.id;
    const location = { ...old.location };
    const edge = resolveBuildEdge(old);
    const beforeRemovalFunds = runtime.treasury.balanceMinorUnits;

    send(runtime, { type: 'RemoveWall', ...location, edge });
    expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
    expect(runtime.placedObjects.getSnapshot()).toEqual([]);
    expect(runtime.navigation.doors.all()).toEqual([]);
    expect(runtime.prisoners.roomInstances.getSnapshot()).toEqual([]);
    expect(runtime.treasury.balanceMinorUnits).toBe(beforeRemovalFunds);

    const definitionId = kind === 'door' ? 'door-wooden' : 'wall-brick';
    send(runtime, {
      type: 'PlaceBuildOrder', orderId: 'independent-shell', definitionId, ...location,
      ...(kind === 'door' ? { edge } : { footprint: 'square' as const }),
    });
    finish(runtime);
    const expectedSpend = kind === 'door' ? 65 : 80;
    expect(runtime.treasury.balanceMinorUnits).toBe(beforeRemovalFunds - expectedSpend);

    runtime = reload(runtime);
    const newOrder = structuredClone(runtime.construction.getOrder('independent-shell'))!;
    expect(newOrder).toMatchObject({ state: 'completed' });
    expect(newOrder.materialsAllocated).not.toEqual([]);
    const beforeOldCancel = captureSessionSnapshot(runtime);
    const newestControl = reload(runtime);

    send(runtime, { type: 'CancelBuildOrder', orderId: oldId, expectedRevision: runtime.construction.revisionOf(oldId)! });
    const afterOldCancel = captureSessionSnapshot(runtime);
    const { kernel: _beforeKernel, ...beforeGameplay } = beforeOldCancel;
    const { kernel: _afterKernel, ...afterGameplay } = afterOldCancel;
    expect(afterGameplay).toEqual(beforeGameplay);
    expect(runtime.construction.getOrder('independent-shell')).toEqual(newOrder);
    expect(runtime.treasury.balanceMinorUnits).toBe(beforeRemovalFunds - expectedSpend);
    if (kind === 'wall') {
      expect(runtime.world.getSquareStructure(location)).toBe(1);
    } else {
      expect(runtime.navigation.doors.all()).toHaveLength(1);
      expect(edge === 'north' ? runtime.world.getTopEdge(location) : runtime.world.getLeftEdge(location)).toBe(2);
    }

    // This genuine saved continuation forks BEFORE old Cancel. Its latest
    // action is the independent purchase, so Undo must reverse that purchase.
    send(newestControl, { type: 'Undo' });
    expect(newestControl.construction.getOrder('independent-shell')?.state).toBe('cancelled');
    expect(newestControl.treasury.balanceMinorUnits).toBe(beforeRemovalFunds - expectedSpend);
    if (kind === 'wall') expect(newestControl.world.getSquareStructure(location)).toBe(0);
    else expect(newestControl.navigation.doors.all()).toEqual([]);

    send(newestControl, { type: 'Undo' });
    expect(newestControl.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
    expect(newestControl.placedObjects.getSnapshot()).toEqual([]);
    expect(newestControl.treasury.balanceMinorUnits).toBe(beforeRemovalFunds - expectedSpend);
  },
);
