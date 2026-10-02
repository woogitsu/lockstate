import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const cases = ROOM_TEMPLATE_IDS.flatMap(templateId => [false, true].flatMap(mirrorX =>
  ([0, 1, 2, 3] as const).map(quarterTurns => ({ templateId, mirrorX, quarterTurns }))));

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`entrance-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'legacy-entrance', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Legacy entrance save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function finishWall(runtime: Runtime) {
  for (let count = 0; count < 10_000 && runtime.construction.getOrder('barrier')?.state !== 'completed'; count++) {
    runtime.kernel.step();
  }
  expect(runtime.construction.getOrder('barrier')?.state).toBe('completed');
}

function gameplay(runtime: Runtime) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return snapshot;
}

// Transform the authored point independently of production rotation. A legacy
// edge is stored at the southern/eastern of the two tiles it separates.
function barrierFor(testCase: typeof cases[number]) {
  const base = instantiateRoomTemplate(testCase.templateId, { x: 0, y: 0 }, { mirrorX: testCase.mirrorX });
  const point = base.doorSquares[0] ?? { x: 1, y: 1 }; // Yard has no doorway: ordinary interior collision.
  const { x, y } = point;
  const door = [tile(5 + x, 5 + y), tile(5 + base.height - 1 - y, 5 + x),
    tile(5 + base.width - 1 - x, 5 + base.height - 1 - y), tile(5 + y, 5 + base.width - 1 - x)][testCase.quarterTurns]!;
  const edge = testCase.quarterTurns % 2 === 0 ? 'north' as const : 'west' as const;
  const anchor = tile(door.x + (testCase.quarterTurns === 3 ? 1 : 0), door.y + (testCase.quarterTurns === 0 ? 1 : 0));
  return { door, edge, anchor, outside: testCase.templateId !== 'yard-basic' && testCase.templateId !== 'cell-row-four' };
}

it.each(cases)('$templateId mirror=$mirrorX turn=$quarterTurns atomically rejects a restored legacy entrance barrier after Undo/Redo', testCase => {
  const target = { kind: 'room-template' as const, ...testCase, origin: { x: 5, y: 5 } };
  const { door, edge, anchor, outside } = barrierFor(testCase);
  for (const completed of [false, true]) {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'barrier', definitionId: 'wall-brick', ...anchor, edge });
    expect(runtime.construction.getOrder('barrier')?.footprint).toBeUndefined();
    if (completed) finishWall(runtime);
    runtime = reload(runtime);
    send(runtime, { type: 'Undo' });
    expect(runtime.construction.getOrder('barrier')?.state).toBe('cancelled');
    expect(PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, { target }).view).toEqual({ ok: true });
    runtime = reload(runtime);
    send(runtime, { type: 'Redo' });
    if (completed) finishWall(runtime);
    runtime = reload(runtime);
    const before = gameplay(runtime);
    const money = runtime.treasury.snapshot();
    const verdict = PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, { target }).view;
    expect(gameplay(runtime)).toEqual(before);
    send(runtime, { type: 'PlaceRoomTemplate', ...testCase, origin: target.origin });
    // Assert actual command atomicity first: a false clear preview must not be
    // hidden by stopping before dispatch. No ticks advance during the press.
    expect(runtime.construction.allOrders()).toHaveLength(before.construction.orders.length);
    expect(runtime.construction.snapshot()).toEqual(before.construction);
    expect(runtime.treasury.snapshot()).toEqual(money);
    expect(gameplay(runtime)).toEqual(before);
    expect(verdict).toMatchObject({ ok: false, reason: 'structure-occupied' });
    if (outside) expect(verdict).toEqual({ ok: false, reason: 'structure-occupied', tile: door });
  }
}, 30_000);

it.each([false, true].flatMap(mirrorX => ([0, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns }))))
  ('keeps an adjacent exterior edge legal, mirror=$mirrorX turn=$quarterTurns', testCase => {
    let runtime = createNewSimulationRuntime(73);
    const fullCase = { templateId: 'cell-basic' as const, ...testCase };
    const { anchor, edge } = barrierFor(fullCase);
    const adjacent = tile(anchor.x + (edge === 'north' ? 1 : 0), anchor.y + (edge === 'west' ? 1 : 0));
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'barrier', definitionId: 'wall-brick', ...adjacent, edge });
    finishWall(runtime);
    runtime = reload(runtime);
    const target = { kind: 'room-template' as const, ...fullCase, origin: { x: 5, y: 5 } };
    expect(PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, { target }).view).toEqual({ ok: true });
    send(runtime, { type: 'PlaceRoomTemplate', ...fullCase, origin: target.origin });
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  });

it.each([false, true].flatMap(mirrorX => ([0, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns }))))
  ('allows a passable exterior door rather than treating every edge as a wall, mirror=$mirrorX turn=$quarterTurns', testCase => {
    let runtime = createNewSimulationRuntime(73);
    const fullCase = { templateId: 'cell-basic' as const, ...testCase };
    const { anchor, edge } = barrierFor(fullCase);
    send(runtime, { type: 'PlaceBuildOrder', orderId: 'barrier', definitionId: 'door-wooden', ...anchor, edge });
    finishWall(runtime);
    runtime = reload(runtime);
    const target = { kind: 'room-template' as const, ...fullCase, origin: { x: 5, y: 5 } };
    expect(PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, { target }).view).toEqual({ ok: true });
    send(runtime, { type: 'PlaceRoomTemplate', ...fullCase, origin: target.origin });
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  });
