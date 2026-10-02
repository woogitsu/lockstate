import { expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { SimulationSnapshotFeed } from '../../src/rendering/feed/simulation-snapshot-feed';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { structureAppearance } from '../../src/rendering/world/appearance';
import { structuresFromConstruction } from '../../src/rendering/world/structures';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  runtime.kernel.submitCommand(`render-identity-${runtime.kernel.expectedSequence}`,
    runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function finish(runtime: Runtime) {
  for (let tick = 0; tick < 30_000 && runtime.construction.allOrders().some(order =>
    order.state !== 'completed' && order.state !== 'cancelled'); tick++) runtime.kernel.step();
  expect(runtime.construction.allOrders().every(order => order.state === 'completed' || order.state === 'cancelled')).toBe(true);
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
}
function load(runtime: Runtime, legacy = false) {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({ gameVersion: 'test', prisonId: 'render-identity', revision: 1,
    createdAt: 0, updatedAt: 1, ...bundle });
  expect(envelope.saveSchemaVersion).toBe(8);
  const encoded = JSON.parse(JSON.stringify(envelope)) as {
    saveSchemaVersion: number; checksum: string;
    payload: { simulation: { objects: { placedObjects: { sourceOrderId?: string }[] } } };
  };
  if (legacy) {
    encoded.saveSchemaVersion = 7;
    for (const object of encoded.payload.simulation.objects.placedObjects) delete object.sourceOrderId;
    encoded.checksum = computeSaveChecksum(encoded.payload);
  }
  const decoded = decodeSaveEnvelope(encoded);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('V8 render identity save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function rendered(runtime: Runtime) {
  const bundle = captureSessionSnapshot(runtime);
  let listener: ((message: WorkerToMainMessage) => void) | undefined;
  let request: MainToWorkerMessage | undefined;
  const feed = new SimulationSnapshotFeed({ addListener: handler => { listener = handler; },
    send: message => { request = message; } }, { generateMessageId: () => 'render-capture', onError: error => { throw error; } });
  listener!({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'ready', replyTo: 'initialize', kind: 'simulation/ready',
    payload: { sessionId: 'render-identity', tick: runtime.kernel.tick, clock: { mode: 'paused' } } });
  feed.readFrame(0);
  expect(request?.kind).toBe('simulation/request-snapshot');
  listener!({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'snapshot', replyTo: request!.messageId,
    kind: 'simulation/snapshot', payload: { tick: runtime.kernel.tick, reason: 'consistency-check', snapshot: {
      transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
      schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: bundle,
    } } } as unknown as WorkerToMainMessage);
  return feed.readFrame(0).structures;
}
const beds = (runtime: Runtime) => rendered(runtime).filter(shape => shape.definitionId === 'bed-wooden' || shape.definitionId === 'object.bed');
function completedCell(quarterTurns: 0 | 1, mirrorX: boolean) {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns, mirrorX });
  finish(runtime);
  return runtime;
}

it.each(([0, 1] as const).flatMap(quarterTurns => [false, true].map(reload => ({ quarterTurns, reload }))))
  ('real render feed shows one independently rebuilt Bed, original turn=$quarterTurns reload=$reload', ({ quarterTurns, reload }) => {
    let runtime = completedCell(quarterTurns, quarterTurns === 1);
    const old = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden')!;
    send(runtime, { type: 'RemoveObject', x: old.location.x, y: old.location.y });
    send(runtime, { type: 'PlaceObject', orderId: 'replacement-bed', definitionId: 'bed-wooden', x: old.location.x, y: old.location.y });
    finish(runtime);
    if (reload) runtime = load(runtime);
    expect(runtime.construction.getOrder(old.id)?.state).toBe('completed');
    expect(runtime.construction.getOrder('replacement-bed')?.state).toBe('completed');
    const standing = runtime.placedObjects.getSnapshot().filter(object => object.objectId === 'object.bed');
    expect(standing).toHaveLength(1);
    expect(standing[0]).toMatchObject({ sourceOrderId: 'replacement-bed', orientation: 0 });
    const shapes = beds(runtime);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ id: 'replacement-bed', tileX: old.location.x, tileY: old.location.y, phase: 'built' });
    expect(shapes[0]?.orientation ?? 0).toBe(0);
    expect(structureAppearance(shapes[0]!.definitionId, shapes[0]!.orientation).footprintTiles).toEqual({ width: 1, height: 2 });
  });

it.each([0, 1] as const)('real render feed stops drawing a directly removed template Bed, turn=%s', quarterTurns => {
  let runtime = completedCell(quarterTurns, quarterTurns === 1);
  const bed = runtime.placedObjects.getSnapshot().find(object => object.objectId === 'object.bed')!;
  // Genuine far footprint tile, including the rotated 2x1 square.
  send(runtime, { type: 'RemoveObject', x: bed.anchorTile.x + (quarterTurns === 1 ? 1 : 0),
    y: bed.anchorTile.y + (quarterTurns === 0 ? 1 : 0) });
  runtime = load(runtime);
  expect(runtime.placedObjects.getSnapshot().some(object => object.objectId === 'object.bed')).toBe(false);
  expect(runtime.construction.getOrder(bed.sourceOrderId!)?.state).toBe('completed');
  expect(beds(runtime)).toEqual([]);
});

it('keeps the genuine completed rotated Bed and pending replacement visible', () => {
  const runtime = completedCell(1, true);
  const old = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden')!;
  expect(beds(runtime)).toEqual([expect.objectContaining({ id: old.id, orientation: 1, phase: 'built' })]);
  send(runtime, { type: 'RemoveObject', x: old.location.x, y: old.location.y });
  send(runtime, { type: 'PlaceObject', orderId: 'pending-bed', definitionId: 'bed-wooden', x: old.location.x, y: old.location.y });
  expect(runtime.construction.getOrder('pending-bed')?.state).toBe('approved');
  const planned = beds(runtime).filter(shape => shape.phase === 'planned');
  expect(planned).toEqual([expect.objectContaining({ id: 'pending-bed', tileX: old.location.x, tileY: old.location.y })]);
});

it('preserves order-only legacy geometry when no physical object snapshot was supplied', () => {
  const runtime = completedCell(1, false);
  const snapshot = captureSessionSnapshot(runtime);
  expect(structuresFromConstruction(snapshot.construction).filter(shape => shape.definitionId === 'bed-wooden'))
    .toEqual([expect.objectContaining({ orientation: 1, phase: 'built' })]);
});

it('treats a supplied empty registry as authoritative for completed furniture', () => {
  const snapshot = captureSessionSnapshot(completedCell(1, false));
  // Presence is authoritative even when the supplied registry has no rows.
  expect(structuresFromConstruction(snapshot.construction, []).filter(shape =>
    shape.definitionId === 'bed-wooden' || shape.definitionId === 'toilet-brick')).toEqual([]);
});

it('preserves actual walls, doors and a pending fixture ghost with an authoritative registry', () => {
  const runtime = completedCell(1, false);
  const bed = runtime.placedObjects.getSnapshot().find(object => object.objectId === 'object.bed')!;
  send(runtime, { type: 'RemoveObject', x: bed.anchorTile.x, y: bed.anchorTile.y });
  send(runtime, { type: 'PlaceObject', orderId: 'pending-control', definitionId: 'bed-wooden', x: bed.anchorTile.x, y: bed.anchorTile.y });
  expect(beds(runtime).filter(shape => shape.phase === 'planned')).toEqual([
    expect.objectContaining({ id: 'pending-control', tileX: bed.anchorTile.x, tileY: bed.anchorTile.y, phase: 'planned' }),
  ]);
  const snapshot = captureSessionSnapshot(runtime);
  const ordinaryGeometry = structuresFromConstruction(snapshot.construction).filter(shape =>
    shape.definitionId.startsWith('wall-') || shape.definitionId.startsWith('door-'));
  expect(ordinaryGeometry.length).toBeGreaterThan(0);
  // A physical-object registry does not suppress walls or doors.
  expect(structuresFromConstruction(snapshot.construction, []).filter(shape =>
    shape.definitionId.startsWith('wall-') || shape.definitionId.startsWith('door-')))
    .toEqual(ordinaryGeometry);
});

it.each([0, 1] as const)('draws an ambiguous ownerless V7 replacement only once, original turn=%s', quarterTurns => {
  let runtime = completedCell(quarterTurns, quarterTurns === 1);
  const old = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden')!;
  send(runtime, { type: 'RemoveObject', x: old.location.x, y: old.location.y });
  send(runtime, { type: 'PlaceObject', orderId: 'legacy-replacement-bed', definitionId: 'bed-wooden', x: old.location.x, y: old.location.y });
  finish(runtime);
  runtime = load(runtime, true);
  const physical = runtime.placedObjects.getSnapshot().filter(object => object.objectId === 'object.bed');
  expect(physical).toHaveLength(1);
  expect(physical[0]?.sourceOrderId).toBeUndefined();
  expect(runtime.construction.getOrder(old.id)?.state).toBe('completed');
  expect(runtime.construction.getOrder('legacy-replacement-bed')?.state).toBe('completed');
  const before = captureSessionSnapshot(runtime);
  const shapes = beds(runtime);
  expect(shapes).toEqual([expect.objectContaining({ id: physical[0]!.placedObjectId,
    definitionId: 'object.bed', phase: 'built', tileX: old.location.x, tileY: old.location.y })]);
  expect(structureAppearance(shapes[0]!.definitionId, shapes[0]!.orientation).footprintTiles).toEqual({ width: 1, height: 2 });
  // Drawing legacy state cannot assign ownership or alter saved gameplay.
  expect(captureSessionSnapshot(runtime)).toEqual(before);
});

it('retains a single ownerless legacy completed fixture display identity and physical facing', () => {
  const runtime = load(completedCell(1, true), true);
  const old = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden')!;
  const physical = runtime.placedObjects.getSnapshot().find(object => object.objectId === 'object.bed')!;
  expect(physical.sourceOrderId).toBeUndefined();
  expect(beds(runtime)).toEqual([expect.objectContaining({ id: old.id, orientation: 1, phase: 'built' })]);
});

it.each(['missing-order', 'wrong-type', 'wrong-anchor'] as const)
  ('does not attach a physical Bed to an unrelated recorded owner: %s', invalid => {
    const runtime = completedCell(1, true);
    const snapshot = captureSessionSnapshot(runtime);
    const physical = runtime.placedObjects.getSnapshot().find(object => object.objectId === 'object.bed')!;
    const owner = runtime.construction.allOrders().find(order => order.id === physical.sourceOrderId)!;
    const sourceOrderId = invalid === 'missing-order' ? 'no-such-order' : invalid === 'wrong-type'
      ? runtime.construction.allOrders().find(order => order.definitionId === 'toilet-brick')!.id : owner.id;
    const construction = invalid === 'wrong-anchor' ? { ...snapshot.construction, orders: snapshot.construction.orders.map(order =>
      order.id === owner.id ? { ...order, location: { ...order.location, x: (order.location.x + 1) as typeof order.location.x } } : order) }
      : snapshot.construction;
    const before = structuredClone({ construction, physical });
    const shapes = structuresFromConstruction(construction, [{ ...physical, sourceOrderId }]);
    expect(shapes.filter(shape => shape.definitionId === 'object.bed' || shape.definitionId === 'bed-wooden'))
      .toEqual([expect.objectContaining({ id: physical.placedObjectId, definitionId: physical.objectId,
        tileX: physical.anchorTile.x, tileY: physical.anchorTile.y, orientation: 1, phase: 'built' })]);
    expect({ construction, physical }).toEqual(before);
  });
