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
  runtime.kernel.submitCommand(`late-wall-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'later-wall-approach', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Pending entrance save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function until(runtime: Runtime, predicate: () => boolean) {
  for (let count = 0; count < 10_000 && !predicate(); count++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}

function geometry({ mirrorX, quarterTurns }: typeof orientations[number]) {
  // Literal cardinal expectations, independent of the production adapter.
  const x = mirrorX ? 2 : 1;
  const door = [tile(10 + x, 16), tile(10, 10 + x), tile(13 - x, 10), tile(16, 13 - x)][quarterTurns]!;
  const approach = [tile(10 + x, 17), tile(9, 10 + x), tile(13 - x, 9), tile(17, 13 - x)][quarterTurns]!;
  const edge = quarterTurns % 2 === 0 ? 'north' as const : 'west' as const;
  const edgeTile = tile(Math.max(door.x, approach.x), Math.max(door.y, approach.y));
  return { door, approach, edge, edgeTile };
}

const cases = orientations.flatMap(orientation => ['live pending', 'saved pending', 'saved partial redone']
  .map(stage => ({ ...orientation, stage })));

it.each(cases)('preserves $stage Cell against later walls, mirror=$mirrorX turn=$quarterTurns', testCase => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
    mirrorX: testCase.mirrorX, quarterTurns: testCase.quarterTurns });
  if (testCase.stage === 'saved partial redone') {
    until(runtime, () => runtime.construction.allOrders().some(order => order.state === 'completed'));
    runtime = reload(runtime);
    send(runtime, { type: 'Undo' });
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
    runtime = reload(runtime);
    send(runtime, { type: 'Redo' });
  }
  if (testCase.stage !== 'live pending') runtime = reload(runtime);
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  const { approach, edge, edgeTile } = geometry(testCase);
  for (const square of [false, true]) {
    const before = captureSessionSnapshot(runtime);
    const money = runtime.treasury.snapshot();
    const { orders: originalOrders, ...history } = before.construction;
    const queueBefore = PROJECTION_CATALOG['hud/build-queue'].project(runtime, runtime.kernel.tick, {}).view;
    const orderId = square ? 'later-square' : 'later-edge';
    send(runtime, { type: 'PlaceBuildOrder', definitionId: 'wall-brick', orderId,
      ...(square ? { ...approach, footprint: 'square' as const } : { ...edgeTile, edge }) });
    expect(runtime.construction.getOrder(orderId)).toMatchObject({ state: 'failed', failReason: 'unbuildable' });
    // Ordinary build refusals retain a failed diagnostic order, unlike object
    // placement. It must receive no funding and enter no reversible history.
    const { orders: _orders, ...afterHistory } = runtime.construction.snapshot();
    expect(afterHistory).toEqual(history);
    for (const order of originalOrders) expect(runtime.construction.getOrder(order.id)).toEqual(order);
    expect(runtime.treasury.snapshot()).toEqual(money);
    const after = captureSessionSnapshot(runtime);
    expect(after.world).toEqual(before.world);
    expect(after.simulation).toEqual(before.simulation);
    expect(after.entities).toEqual(before.entities);
    expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable' });
    expect(PROJECTION_CATALOG['hud/build-queue'].project(runtime, runtime.kernel.tick, {}).view).toEqual(queueBefore);
  }
  // The originally paid plan must still complete and furnish after a rejected
  // wall. One representative history flow proves that deferred obligation.
  if (testCase.stage === 'saved partial redone' && testCase.mirrorX && testCase.quarterTurns === 3) {
    runtime = reload(runtime);
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
      runtime.construction.allOrders().every(order => ['completed', 'failed', 'cancelled'].includes(order.state)));
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
    expect(runtime.world.getSquareStructure(approach)).toBe(0);
    expect(runtime.roomTemplates.snapshot().completed).toHaveLength(1);
  }
});

it.each(orientations)('allows neighbouring walls and releases approach protection after Undo, mirror=$mirrorX turn=$quarterTurns', orientation => {
  for (const undo of [false, true]) {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, ...orientation });
    if (undo) send(runtime, { type: 'Undo' });
    runtime = reload(runtime);
    const { approach, edge } = geometry(orientation);
    const location = undo ? approach : tile(approach.x + (edge === 'north' ? 1 : 0), approach.y + (edge === 'west' ? 1 : 0));
    send(runtime, { type: 'PlaceBuildOrder', definitionId: 'wall-brick', orderId: 'legal-wall', ...location, footprint: 'square' });
    expect(runtime.construction.getOrder('legal-wall')?.state).not.toBe('failed');
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(undo ? 0 : 1);
  }
});
