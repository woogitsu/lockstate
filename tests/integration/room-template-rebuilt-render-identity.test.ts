import { expect, it } from 'vitest';
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
function load(runtime: Runtime) {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({ gameVersion: 'test', prisonId: 'render-identity', revision: 1,
    createdAt: 0, updatedAt: 1, ...bundle });
  expect(envelope.saveSchemaVersion).toBe(8);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
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
