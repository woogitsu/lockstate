import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const orientations = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`adjacent-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'adjacent-entrance', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Adjacent template save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function until(runtime: Runtime, predicate: () => boolean) {
  for (let count = 0; count < 10_000 && !predicate(); count++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

function gameplay(runtime: Runtime) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return snapshot;
}

function geometry({ mirrorX, quarterTurns }: typeof orientations[number]) {
  const x = mirrorX ? 2 : 1;
  // Cardinal literals are independent of production rotation and placement.
  const approach = [tile(10 + x, 17), tile(9, 10 + x), tile(13 - x, 9), tile(17, 13 - x)][quarterTurns]!;
  const adjacent = [tile(10, 17), tile(3, 10), tile(10, 3), tile(17, 10)][quarterTurns]!;
  const clear = tile(adjacent.x + (quarterTurns % 2 === 0 ? 3 : 0), adjacent.y + (quarterTurns % 2 === 1 ? 3 : 0));
  return { approach, adjacent, clear };
}

function target(orientation: typeof orientations[number], origin: { x: number; y: number }) {
  return { kind: 'room-template' as const, templateId: 'cell-basic' as const, origin, ...orientation };
}

const cases = orientations.flatMap(orientation => ['live pending', 'saved pending', 'saved partial redone']
  .map(stage => ({ ...orientation, stage })));

it.each(cases)('refuses the complete adjacent plan before mutation, $stage mirror=$mirrorX turn=$quarterTurns', testCase => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
    mirrorX: testCase.mirrorX, quarterTurns: testCase.quarterTurns });
  if (testCase.stage === 'saved partial redone') {
    until(runtime, () => runtime.construction.allOrders().some(order => order.state === 'completed'));
    runtime = reload(runtime);
    send(runtime, { type: 'Undo' });
    runtime = reload(runtime);
    send(runtime, { type: 'Redo' });
  }
  if (testCase.stage !== 'live pending') runtime = reload(runtime);
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  const { approach, adjacent } = geometry(testCase);
  const before = gameplay(runtime);
  const money = runtime.treasury.snapshot();
  const request = target(testCase, adjacent);
  const verdict = PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, { target: request }).view;
  expect(gameplay(runtime)).toEqual(before);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: request.templateId, origin: adjacent,
    mirrorX: testCase.mirrorX, quarterTurns: testCase.quarterTurns });
  // Ordinary wall protection can stop the final wall, but must not conceal
  // partial cancelled/failed shell records from an incorrectly clear preflight.
  expect(runtime.construction.allOrders()).toHaveLength(before.construction.orders.length);
  expect(runtime.treasury.snapshot()).toEqual(money);
  expect(gameplay(runtime)).toEqual(before);
  expect(verdict).toEqual({ ok: false, reason: 'structure-occupied', tile: approach });
  expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: approach });
  if (testCase.stage === 'saved partial redone' && testCase.mirrorX && testCase.quarterTurns === 3) {
    runtime = reload(runtime);
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
      runtime.construction.allOrders().every(order => order.state === 'completed'));
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
    expect(PROJECTION_CATALOG['hud/room-detail'].project(runtime, runtime.kernel.tick,
      { target: { kind: 'id', id: 'room.cell:11:11' } }).view).toMatchObject({ access: 'doorway' });
  }
});

it.each(orientations)('accepts an adjacent plan whose walls leave the approach clear, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, ...orientation });
  runtime = reload(runtime);
  const { clear } = geometry(orientation);
  const request = target(orientation, clear);
  expect(PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, { target: request }).view).toEqual({ ok: true });
  send(runtime, { type: 'PlaceRoomTemplate', templateId: request.templateId, origin: clear, ...orientation });
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(2);
  expect(runtime.construction.allOrders().every(order => order.state !== 'failed' && order.state !== 'cancelled')).toBe(true);
});
