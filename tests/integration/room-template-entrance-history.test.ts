import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const cases = [
  { stage: 'partial', quarterTurns: 0 as const, approach: tile(12, 17), door: tile(12, 16), yard: tile(10, 17) },
  { stage: 'completed', quarterTurns: 1 as const, approach: tile(9, 12), door: tile(10, 12), yard: tile(2, 10) },
];

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.snapshot().expectedSequence;
  runtime.kernel.submitCommand(`entrance-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'entrance-history', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Entrance history save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 10_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

function setup(testCase: typeof cases[number]) {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', ...testCase.yard, width: 8, height: 8 });
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, mirrorX: true, quarterTurns: testCase.quarterTurns });
  until(runtime, () => testCase.stage === 'partial'
    ? runtime.roomTemplates.snapshot().pending.length === 1 && runtime.construction.allOrders().some(order => order.state === 'completed')
    : runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed'));
  runtime = reload(runtime);
  send(runtime, { type: 'Undo' });
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
  expect(runtime.roomTemplates.snapshot().completed ?? []).toEqual([]);
  expect(runtime.roomTemplates.snapshot().undone).toHaveLength(1);
  expect(runtime.roomTemplates.claimsPendingDoorApproachTile(testCase.approach)).toBe(false);
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
  return reload(runtime);
}

it.each(cases)('releases and restores entrance claims through actual $stage Undo/Redo and encoded saves', testCase => {
  let runtime = setup(testCase);
  expect(runtime.roomTemplates.claimsPendingDoorApproachTile(testCase.approach)).toBe(false);
  send(runtime, { type: 'Redo' });
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  expect(runtime.roomTemplates.claimsPendingDoorApproachTile(testCase.approach)).toBe(true);
  runtime = reload(runtime);
  expect(runtime.roomTemplates.claimsPendingDoorApproachTile(testCase.approach)).toBe(true);
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed'));
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
});

it.each(cases)('keeps Redo invalidated after new accepted furniture occupies the released $stage entrance', testCase => {
  let runtime = setup(testCase);
  send(runtime, { type: 'PlaceObject', definitionId: 'chair-wooden', orderId: 'later-chair', ...testCase.approach });
  expect(runtime.construction.getOrder('later-chair')).toBeDefined();
  runtime = reload(runtime);
  expect(runtime.construction.snapshot().redoStack).toEqual([]);
  const before = captureSessionSnapshot(runtime);
  send(runtime, { type: 'Redo' });
  const after = captureSessionSnapshot(runtime);
  expect(after.construction).toEqual(before.construction);
  expect(after.simulation).toEqual(before.simulation);
  expect(after.world).toEqual(before.world);
});

it.each(cases.flatMap(testCase => [false, true].map(completedObject => ({ ...testCase, completedObject }))))
  ('refuses a new template atomically after $stage Undo and later furniture, completed=$completedObject', testCase => {
    let runtime = setup(testCase);
    send(runtime, { type: 'PlaceObject', definitionId: 'chair-wooden', orderId: 'later-chair', ...testCase.approach });
    if (testCase.completedObject) until(runtime, () => runtime.construction.getOrder('later-chair')?.state === 'completed');
    runtime = reload(runtime);
    const before = captureSessionSnapshot(runtime);
    const money = runtime.treasury.snapshot();
    const target = { kind: 'room-template' as const, templateId: 'cell-basic' as const,
      origin: { x: 10, y: 10 }, mirrorX: true, quarterTurns: testCase.quarterTurns };
    const preflight = PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, { target }).view;
    expect(captureSessionSnapshot(runtime)).toEqual(before);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: target.templateId, origin: target.origin, mirrorX: true, quarterTurns: target.quarterTurns });
    const after = captureSessionSnapshot(runtime);
    expect(after.construction.orders).toHaveLength(before.construction.orders.length);
    expect(after.construction).toEqual(before.construction);
    expect(after.simulation).toEqual(before.simulation);
    expect(after.world).toEqual(before.world);
    expect(after.entities).toEqual(before.entities);
    expect(runtime.treasury.snapshot()).toEqual(money);
    expect(preflight).toEqual({ ok: false, reason: 'object-occupied', tile: testCase.door });
  });
