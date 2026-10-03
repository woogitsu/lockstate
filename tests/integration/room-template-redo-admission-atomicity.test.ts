import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const origin = { x: 10, y: 10 };
const scenarios = [
  { templateId: 'cell-basic', mirrorX: false, quarterTurns: 0 },
  { templateId: 'cell-basic', mirrorX: true, quarterTurns: 1 },
  { templateId: 'canteen-basic', mirrorX: true, quarterTurns: 3 },
  { templateId: 'yard-basic', mirrorX: true, quarterTurns: 2 },
] as const;

function send(runtime: Runtime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`redo-admission-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function finish(runtime: Runtime): void {
  const done = () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => ['completed', 'cancelled', 'failed'].includes(order.state));
  for (let tick = 0; tick < 30_000 && !done(); tick++) runtime.kernel.step();
  expect(done()).toBe(true);
}

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'redo-template-admission', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual template history save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function gameplay(runtime: Runtime) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return snapshot;
}

it.each(scenarios.flatMap(scenario => [false, true].map(load => ({ ...scenario, load }))))(
  '$templateId mirror=$mirrorX q=$quarterTurns refuses blocked Redo atomically and recovers after real unzoning, load=$load',
  ({ templateId, mirrorX, quarterTurns, load }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId, origin, mirrorX, quarterTurns });
    finish(runtime);
    expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
    send(runtime, { type: 'Undo' });
    expect(runtime.roomTemplates.snapshot().undone).toHaveLength(1);
    expect(runtime.placedObjects.getSnapshot()).toEqual([]);

    // A real accepted zone writes no construction transaction: Redo remains
    // available, unlike a later PlaceObject or PlaceBuildOrder that clears it.
    send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', ...origin, width: 8, height: 8 });
    expect(runtime.prisoners.roomInstances.getById('room.yard:10:10')).toBeDefined();
    if (load) runtime = reload(runtime);
    const before = gameplay(runtime);
    const funds = runtime.treasury.balanceMinorUnits;
    const eventsBefore = runtime.events.since(0).length;
    const view = PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, {
      target: { kind: 'room-template', templateId, origin, mirrorX, quarterTurns },
    }).view;
    expect(view).toEqual({ ok: false, reason: 'structure-occupied', tile: origin });
    expect(gameplay(runtime)).toEqual(before);

    send(runtime, { type: 'Redo' });
    expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: origin });
    expect(gameplay(runtime)).toEqual(before);
    expect(runtime.events.since(0).slice(eventsBefore).map(event => event.type)).toEqual([]);
    for (let tick = 0; tick < 100; tick++) runtime.kernel.step();
    expect(runtime.treasury.balanceMinorUnits).toBe(funds);
    expect(runtime.placedObjects.getSnapshot()).toEqual([]);
    expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
    expect(runtime.roomTemplates.snapshot().undone).toHaveLength(1);

    // Refusal preserves the actual Redo obligation. A player can remove the
    // independent blocking zone, Load, and retry without a new purchase gesture.
    send(runtime, { type: 'UnzoneRoom', ...origin, width: 8, height: 8 });
    expect(runtime.prisoners.roomInstances.getById('room.yard:10:10')).toBeUndefined();
    runtime = reload(runtime);
    send(runtime, { type: 'Redo' });
    finish(runtime);
    expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
    expect(runtime.roomTemplates.snapshot().undone ?? []).toEqual([]);
    expect(runtime.roomTemplates.snapshot().completed![0]).toMatchObject({ templateId, origin, mirrorX, quarterTurns });
    expect(runtime.refusals.last?.reason).not.toBe('build.unbuildable');
  },
);

it.each([false, true])('preserves genuine legal mirrored rotated template Redo, load=%s', load => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin, mirrorX: true, quarterTurns: 1 });
  finish(runtime);
  send(runtime, { type: 'Undo' });
  if (load) runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.placedObjects.getSnapshot().every(object => object.orientation === 1)).toBe(true);
  expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
});

it('preserves ordinary Redo when an unrelated Yard exists', () => {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'ordinary-wall', definitionId: 'wall-brick', x: 28, y: 28, footprint: 'square' });
  finish(runtime);
  send(runtime, { type: 'Undo' });
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', ...origin, width: 8, height: 8 });
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(runtime.construction.getOrder('ordinary-wall')?.state).toBe('completed');
});

it('inspects only the actual top Redo gesture, leaving a blocked older template for its own press', () => {
  const runtime = createNewSimulationRuntime(73);
  for (const at of [{ x: 5, y: 5 }, { x: 20, y: 20 }]) {
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: at, quarterTurns: 1, mirrorX: true });
    finish(runtime);
  }
  send(runtime, { type: 'Undo' });
  send(runtime, { type: 'Undo' });
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 20, y: 20, width: 8, height: 8 });
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
  expect(runtime.roomTemplates.snapshot().completed![0]?.origin).toEqual({ x: 5, y: 5 });
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  const before = gameplay(runtime);
  send(runtime, { type: 'Redo' });
  expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: { x: 20, y: 20 } });
  expect(gameplay(runtime)).toEqual(before);
});
