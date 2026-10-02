import { expect, it } from 'vitest';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import type { RoomTemplateCostView } from '../../src/simulation/presentation/room-template-cost';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`loaded-square-collision-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'loaded-square-collision', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Loaded collision save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function finish(runtime: Runtime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed' || order.state === 'cancelled'));
}
function gameplay(runtime: Runtime) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return snapshot;
}
// Independent authored first-table 3x2 reference inside the 8x8 Canteen.
const poses = [
  { mirrorX: false, quarterTurns: 0 as const, anchor: [1, 1], target: [3, 2], corner: [3, 2] },
  { mirrorX: false, quarterTurns: 1 as const, anchor: [5, 1], target: [2, 3], corner: [5, 3] },
  { mirrorX: false, quarterTurns: 2 as const, anchor: [4, 5], target: [1, 2], corner: [4, 5] },
  { mirrorX: false, quarterTurns: 3 as const, anchor: [1, 4], target: [2, 1], corner: [2, 4] },
  { mirrorX: true, quarterTurns: 0 as const, anchor: [4, 1], target: [1, 2], corner: [4, 2] },
  { mirrorX: true, quarterTurns: 1 as const, anchor: [5, 4], target: [2, 1], corner: [5, 4] },
  { mirrorX: true, quarterTurns: 2 as const, anchor: [1, 5], target: [3, 2], corner: [3, 5] },
  { mirrorX: true, quarterTurns: 3 as const, anchor: [1, 1], target: [2, 3], corner: [2, 3] },
];
it.each(poses.flatMap(pose => ['pending', 'completed'].map(stage => ({ ...pose, stage }))))
  ('saved $stage Canteen square occupancy agrees with quote and actual command, mirror=$mirrorX turn=$quarterTurns', pose => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'canteen-basic', origin: { x: 5, y: 5 }, mirrorX: pose.mirrorX, quarterTurns: pose.quarterTurns });
    until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().some(order => order.id.includes('-2-object-000')));
    const table = runtime.construction.allOrders().find(order => order.id.includes('-2-object-000'))!;
    expect(table).toMatchObject({ definitionId: 'dining-table-wooden', location: { x: 5 + pose.anchor[0]!, y: 5 + pose.anchor[1]! } });
    if (pose.stage === 'completed') {
      finish(runtime);
      for (const object of runtime.placedObjects.getSnapshot()) {
        if (object.anchorTile.x !== table.location.x || object.anchorTile.y !== table.location.y)
          send(runtime, { type: 'RemoveObject', x: object.anchorTile.x, y: object.anchorTile.y });
      }
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(1);
    } else expect(runtime.placedObjects.getSnapshot()).toHaveLength(0);
    send(runtime, { type: 'UnzoneRoom', x: 6, y: 6, width: 6, height: 6 });
    expect(runtime.prisoners.roomInstances.getSnapshot()).toHaveLength(0);
    runtime = reload(runtime);
    const target = { kind: 'room-template' as const, templateId: 'utility-room-basic' as const,
      origin: { x: 5 + pose.target[0]!, y: 5 + pose.target[1]! }, mirrorX: pose.mirrorX, quarterTurns: pose.quarterTurns };
    for (let y = target.origin.y; y < target.origin.y + 4; y++) for (let x = target.origin.x; x < target.origin.x + 4; x++) {
      const tile = { x: tileCoordinate(x), y: tileCoordinate(y) };
      expect(runtime.world.getZoning(tile)).toBe(0);
      expect(runtime.world.getSquareStructure(tile)).toBe(0);
      expect(runtime.world.getTopEdge(tile)).toBe(0);
      expect(runtime.world.getLeftEdge(tile)).toBe(0);
    }
    const quote = PROJECTION_CATALOG['world/room-template-cost'].project(runtime, runtime.kernel.tick, { target }).view as unknown as RoomTemplateCostView;
    const before = gameplay(runtime);
    const verdict = PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, { target }).view;
    expect(verdict).toMatchObject({ ok: false, reason: 'object-occupied' });
    if (pose.stage === 'completed') expect(verdict).toEqual({ ok: false, reason: 'object-occupied',
      tile: { x: 5 + pose.corner[0]!, y: 5 + pose.corner[1]! } });
    expect(gameplay(runtime)).toEqual(before);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: target.templateId, origin: target.origin, mirrorX: target.mirrorX, quarterTurns: target.quarterTurns });
    expect(gameplay(runtime)).toEqual(before);
    expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: (verdict as { tile: unknown }).tile });
    if (pose.stage === 'completed') send(runtime, { type: 'RemoveObject', x: table.location.x, y: table.location.y });
    else send(runtime, { type: 'CancelBuildOrder', orderId: table.id, expectedRevision: runtime.construction.revisionOf(table.id) });
    runtime = reload(runtime);
    expect(PROJECTION_CATALOG['world/room-template-preflight'].project(runtime, runtime.kernel.tick, { target }).view).toEqual({ ok: true });
    const previousOrders = new Set(runtime.construction.allOrders().map(order => order.id));
    send(runtime, { type: 'PlaceRoomTemplate', templateId: target.templateId, origin: target.origin, mirrorX: target.mirrorX, quarterTurns: target.quarterTurns });
    finish(runtime);
    const incoming = runtime.construction.allOrders().filter(order => !previousOrders.has(order.id));
    expect(incoming).toHaveLength(quote.orderCount);
    const quantities = new Map<string, number>();
    for (const order of incoming) for (const material of order.materialsAllocated)
      quantities.set(material.itemId, (quantities.get(material.itemId) ?? 0) + material.quantity);
    expect([...quantities].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([itemId, quantity]) => ({ itemId, quantity }))).toEqual(quote.materials);
  });
