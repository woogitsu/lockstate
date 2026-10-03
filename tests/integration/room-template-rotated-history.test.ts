import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate, type RoomTemplatePlan } from '../../src/content/room-template-catalog';
import type { QuarterTurns } from '../../src/content/room-template-rotation';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { projectRoomTemplatePreflight } from '../../src/simulation/presentation/room-template-preflight';
import { packCommand, unpackCommand } from '../../src/simulation/protocol/commands';
import { mainToWorkerMessageSchema, SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import type { RoomDetailViewModel } from '../../src/simulation/presentation/room-projection';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function envelope(runtime: Runtime, bundle = captureSessionSnapshot(runtime)) {
  return createSaveEnvelope({
    gameVersion: 'test', prisonId: 'rotated-room-history', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
}

function reload(runtime: Runtime) {
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope(runtime))) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Rotated room save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function finish(runtime: Runtime) {
  for (let tick = 0; tick < 30_000; tick += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) return;
  }
  throw new Error('Rotated room construction did not complete');
}

// Independent scalar reference over the unrotated authored input. Expectations
// never call the production rotation or build-expansion adapter being tested.
function transformedRectangle(base: RoomTemplatePlan, turns: QuarterTurns,
  rect: { x: number; y: number; width: number; height: number }) {
  const { x, y, width, height } = rect;
  switch (turns) {
    case 0: return { x: 5 + x, y: 5 + y, width, height };
    case 1: return { x: 5 + base.height - y - height, y: 5 + x, width: height, height: width };
    case 2: return { x: 5 + base.width - x - width, y: 5 + base.height - y - height, width, height };
    case 3: return { x: 5 + y, y: 5 + base.width - x - width, width: height, height: width };
  }
}

function expectedObjects(base: RoomTemplatePlan, turns: QuarterTurns) {
  return base.objects.map((object) => {
    const objectId = getBuildableDefinition(object.buildableId).placesObjectId!;
    const definition = defaultObjectRegistry.getById(objectId)!;
    const rect = transformedRectangle(base, turns, { ...object, ...definition.footprint });
    return { objectId, anchorTile: { x: rect.x, y: rect.y }, orientation: turns };
  }).sort((a, b) => a.anchorTile.y - b.anchorTile.y || a.anchorTile.x - b.anchorTile.x);
}

function assertCompleted(runtime: Runtime, base: RoomTemplatePlan, turns: QuarterTurns) {
  expect(runtime.placedObjects.getSnapshot().map(({ objectId, anchorTile, orientation }) => ({ objectId, anchorTile, orientation })))
    .toEqual(expectedObjects(base, turns));
  for (const square of base.wallSquares) {
    const at = transformedRectangle(base, turns, { ...square, width: 1, height: 1 });
    expect(runtime.world.getSquareStructure(tile(at.x, at.y))).toBe(1);
  }
  expect(runtime.navigation.doors.all()).toHaveLength(base.doorSquares.length);
  for (const door of base.doorSquares) {
    const at = transformedRectangle(base, turns, { ...(door.orderTile ?? door), width: 1, height: 1 });
    const stored = tile(at.x + (turns === 1 ? 1 : 0), at.y + (turns === 2 ? 1 : 0));
    expect(turns % 2 === 0 ? runtime.world.getTopEdge(stored) : runtime.world.getLeftEdge(stored)).not.toBe(0);
  }
  for (const zone of base.zones) {
    const expected = transformedRectangle(base, turns, zone);
    const id = `${zone.roomId}:${expected.x}:${expected.y}`;
    expect(runtime.prisoners.roomInstances.getById(id)).toBeDefined();
    const detail = PROJECTION_CATALOG['hud/room-detail'].project(runtime, runtime.kernel.tick, { target: { kind: 'id', id } })
      .view as unknown as RoomDetailViewModel | undefined;
    expect(detail?.requirementSummary.missingCapability).toBe(0);
    expect(detail?.access).toBe(zone.roomId === 'room.yard' ? 'gap' : 'doorway');
  }
}

const cases = ROOM_TEMPLATE_IDS.flatMap((templateId) => [false, true].flatMap((mirrorX) =>
  ([0, 1, 2, 3] as const).map((quarterTurns) => ({ templateId, mirrorX, quarterTurns }))));

it.each(cases)('$templateId mirrored=$mirrorX turn=$quarterTurns keeps queued, pending, completed and undone geometry across encoded saves', ({ templateId, mirrorX, quarterTurns }) => {
  let runtime = createNewSimulationRuntime(73);
  const base = instantiateRoomTemplate(templateId, { x: 0, y: 0 }, { mirrorX });
  runtime.kernel.submitCommand('rotated-plan', 0, runtime.kernel.tick + 1, packCommand({
    type: 'PlaceRoomTemplate', templateId, origin: { x: 5, y: 5 }, mirrorX, quarterTurns,
  }));
  runtime = reload(runtime);
  expect(unpackCommand(captureSessionSnapshot(runtime).kernel.commands[0]!.payload as Parameters<typeof unpackCommand>[0]))
    .toMatchObject({ quarterTurns, mirrorX });
  runtime.kernel.step();
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending[0]?.quarterTurns).toBe(quarterTurns);
  runtime = reload(runtime);
  expect(runtime.roomTemplates.snapshot().pending[0]?.quarterTurns).toBe(quarterTurns);
  for (let tick = 0; tick < 30_000 && runtime.roomTemplates.snapshot().pending.length > 0; tick += 1) runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
  if (base.objects.length > 0) {
    const orders = runtime.construction.allOrders().filter((order) => order.id.includes('-2-object-'));
    expect(orders).toHaveLength(base.objects.length);
    expect(orders.some((order) => order.state !== 'completed')).toBe(true);
    expect(orders.every((order) => (order.objectOrientation ?? 0) === quarterTurns)).toBe(true);
    runtime = reload(runtime);
    expect(runtime.construction.allOrders().filter((order) => order.id.includes('-2-object-'))
      .every((order) => (order.objectOrientation ?? 0) === quarterTurns)).toBe(true);
  }
  finish(runtime);
  assertCompleted(runtime, base, quarterTurns);
  runtime = reload(runtime);
  assertCompleted(runtime, base, quarterTurns);
  expect(runtime.roomTemplates.snapshot().completed?.[0]?.quarterTurns).toBe(quarterTurns);

  runtime.kernel.submitCommand('undo', 1, runtime.kernel.tick, packCommand({ type: 'Undo' }));
  runtime.kernel.step();
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  expect(runtime.roomTemplates.snapshot().completed ?? []).toEqual([]);
  runtime = reload(runtime);
  expect(runtime.roomTemplates.snapshot().undone?.[0]?.quarterTurns).toBe(quarterTurns);
  runtime.kernel.submitCommand('redo', 2, runtime.kernel.tick, packCommand({ type: 'Redo' }));
  finish(runtime);
  assertCompleted(runtime, base, quarterTurns);
}, 120_000);

it.each([-1, 4, 0.5, '1', null])('rejects invalid quarterTurns=%s in the strict command boundary', (quarterTurns) => {
  expect(() => packCommand({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 }, quarterTurns } as never)).toThrow();
});

it.each(['pending', 'undone', 'completed'] as const)('validates optional saved %s quarter turns without widening their domain', (section) => {
  const runtime = createNewSimulationRuntime(73);
  const bundle = captureSessionSnapshot(runtime);
  for (const quarterTurns of [-1, 4, 0.5, '1', null]) {
    const simulation = { ...bundle.simulation, roomTemplates: {
      version: 1, pending: [], [section]: [{ templateId: 'cell-basic', origin: { x: 5, y: 5 }, mirrorX: false, sequence: 0, quarterTurns }],
    } };
    expect(() => envelope(runtime, { ...bundle, simulation } as never)).toThrow();
  }
});

it('rejects invalid saved fixture orientation and restores omitted legacy orientation as zero', () => {
  const runtime = createNewSimulationRuntime(73);
  const bundle = captureSessionSnapshot(runtime);
  const order = createBuildOrder('probe-bed', 'bed-wooden', tile(5, 5));
  for (const objectOrientation of [-1, 4, 0.5, '1', null]) {
    expect(() => envelope(runtime, { ...bundle, construction: { ...bundle.construction,
      orders: [{ ...order, objectOrientation }],
    } } as never)).toThrow();
  }
  runtime.kernel.submitCommand('legacy-plan', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 },
  }));
  runtime.kernel.step();
  const saved = captureSessionSnapshot(runtime);
  expect(saved.simulation?.roomTemplates?.pending[0]?.quarterTurns).toBeUndefined();
  let restored = reload(runtime);
  finish(restored);
  assertCompleted(restored, instantiateRoomTemplate('cell-basic', { x: 0, y: 0 }), 0);
  expect(restored.construction.allOrders().every((candidate) => candidate.objectOrientation === undefined)).toBe(true);
  // Old section version 1 had only pending; history arrays are additive.
  const legacy = captureSessionSnapshot(restored);
  const roomTemplates = { version: 1 as const, pending: [] };
  restored = restoreSimulationRuntime({ ...legacy, simulation: { ...legacy.simulation!, roomTemplates } }).runtime;
  expect(restored.roomTemplates.snapshot().undone ?? []).toEqual([]);
  expect(restored.roomTemplates.snapshot().completed ?? []).toEqual([]);
});

it('reserves the rotated second fixture tile in both worker preflight and object placement', () => {
  const runtime = createNewSimulationRuntime(73);
  // Desk is authored 2x1; turn 1 reserves (9,9) and (9,10), never (10,9).
  runtime.construction.submitOrder(createBuildOrder('rotated-desk', 'desk-wooden', tile(9, 9), undefined, 0, undefined, 1));
  expect(runtime.construction.getOrder('rotated-desk')?.state).not.toBe('failed');
  expect(projectRoomTemplatePreflight(runtime.roomTemplates, 'cell-basic', { x: 9, y: 10 }))
    .toMatchObject({ ok: false, reason: 'object-occupied', tile: tile(9, 10) });
  expect(runtime.objectPlacement.place({ orderId: 'overlap', definitionId: 'toilet-brick', x: 9, y: 10 }, 0))
    .toMatchObject({ kind: 'refused', reason: 'tile-occupied', tile: tile(9, 10) });
  expect(runtime.objectPlacement.place({ orderId: 'outside', definitionId: 'toilet-brick', x: 10, y: 9 }, 0))
    .toMatchObject({ kind: 'refused', reason: 'outside-room' });
});

it.each([1, 3] as const)('uses turn %s extents for pending interior reservations and worker preflight', (quarterTurns) => {
  const runtime = createNewSimulationRuntime(73);
  expect(runtime.roomTemplates.place({ templateId: 'cell-basic', origin: { x: 5, y: 5 }, mirrorX: false, quarterTurns, sequence: 0 }).ok).toBe(true);
  // Rotated Cell is 7x4. (10,7) is inside the rotated interior, beyond the old width 4.
  expect(projectRoomTemplatePreflight(runtime.roomTemplates, 'cell-basic', { x: 10, y: 7 }))
    .toMatchObject({ ok: false, reason: 'structure-occupied', tile: tile(10, 7) });
  expect(projectRoomTemplatePreflight(runtime.roomTemplates, 'cell-basic', { x: 5, y: 10 })).toEqual({ ok: true });
  // Odd turns need 7 columns, not 4, at the owned chunk boundary.
  expect(projectRoomTemplatePreflight(createNewSimulationRuntime(73).roomTemplates, 'cell-basic', { x: 27, y: 10 }, false, quarterTurns))
    .toMatchObject({ ok: false, reason: 'unowned-land' });
  expect(PROJECTION_CATALOG['world/room-template-preflight'].project(createNewSimulationRuntime(73), 0, {
    target: { kind: 'room-template', templateId: 'cell-basic', origin: { x: 27, y: 10 }, quarterTurns },
  }).view).toMatchObject({ ok: false, reason: 'unowned-land' });
});

it.each([-1, 4, 0.5, '1', null])('rejects invalid quarterTurns=%s in the strict worker preflight target', (quarterTurns) => {
  const request = { kind: 'simulation/request-projection', protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'preflight',
    payload: { projectionId: 'world/room-template-preflight', target: { kind: 'room-template', templateId: 'cell-basic', origin: { x: 5, y: 5 }, quarterTurns: 1 } },
  };
  expect(mainToWorkerMessageSchema.safeParse(request).success).toBe(true);
  expect(mainToWorkerMessageSchema.safeParse({ ...request, payload: { ...request.payload,
    target: { ...request.payload.target, quarterTurns },
  } }).success).toBe(false);
});

it.each([1, 3] as const)('undoes an actual partially built turn %s shell, then saves and redoes it', (quarterTurns) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('partial-plan', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 }, mirrorX: true, quarterTurns,
  }));
  for (let tick = 0; tick < 10_000; tick += 1) {
    runtime.kernel.step();
    if (runtime.construction.allOrders().some((order) => order.state === 'completed')) break;
  }
  expect(runtime.construction.allOrders().some((order) => order.state === 'completed')).toBe(true);
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  runtime.kernel.submitCommand('partial-undo', 1, runtime.kernel.tick, packCommand({ type: 'Undo' }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
  const base = instantiateRoomTemplate('cell-basic', { x: 0, y: 0 }, { mirrorX: true });
  for (const square of base.wallSquares) {
    const at = transformedRectangle(base, quarterTurns, { ...square, width: 1, height: 1 });
    expect(runtime.world.getSquareStructure(tile(at.x, at.y))).toBe(0);
  }
  runtime = reload(runtime);
  expect(runtime.roomTemplates.snapshot().undone?.[0]?.quarterTurns).toBe(quarterTurns);
  runtime.kernel.submitCommand('partial-redo', 2, runtime.kernel.tick, packCommand({ type: 'Redo' }));
  finish(runtime);
  assertCompleted(runtime, base, quarterTurns);
});
