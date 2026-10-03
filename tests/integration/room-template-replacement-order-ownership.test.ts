import { expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`pending-object-removal-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime: Runtime, predicate: () => boolean) {
  for (let tick = 0; tick < 30_000 && !predicate(); tick++) runtime.kernel.step();
  expect(predicate()).toBe(true);
}
function reload(runtime: Runtime, legacy = false, unknownOwnership = false): Runtime {
  const original = captureSessionSnapshot(runtime);
  const bundle = legacy ? { ...original, simulation: { ...original.simulation!, roomTemplates: { version: 1 as const, pending: [] } } } : original;
  const encoded = JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'occupied-template-cancel', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  })));
  if (unknownOwnership) {
    encoded.saveSchemaVersion = 7;
    for (const object of encoded.payload.simulation.objects.placedObjects) delete object.sourceOrderId;
    encoded.checksum = computeSaveChecksum(encoded.payload);
  }
  const decoded = decodeSaveEnvelope(encoded);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Occupied cancellation save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}
function finish(runtime: Runtime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed' || order.state === 'cancelled'));
}
function remove(runtime: Runtime, type: 'RemoveObject' | 'RemoveWall', location: { x: number; y: number }) {
  send(runtime, type === 'RemoveObject' ? { type, ...location } : { type, ...location, edge: 'north' });
}
function gameplay(runtime: Runtime) {
  const { kernel: _kernel, ...snapshot } = captureSessionSnapshot(runtime);
  return snapshot;
}
it.each(([0, 1] as const).flatMap(quarterTurns => [false, true].flatMap(legacy => ['bed-wooden', 'toilet-brick'].map(definitionId => ({ quarterTurns, legacy, definitionId })))))
  ('old rotated template cancellation preserves the later independent $definitionId purchase, legacy=$legacy turn=$quarterTurns', ({ quarterTurns, legacy, definitionId }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns });
    finish(runtime);
    const original = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden')!;
    expect(original.objectOrientation ?? 0).toBe(quarterTurns);
    send(runtime, { type: 'RemoveObject', x: original.location.x, y: original.location.y });
    expect(runtime.construction.getOrder(original.id)?.state).toBe('completed');
    send(runtime, { type: 'PlaceObject', orderId: 'independent-replacement', definitionId, x: original.location.x, y: original.location.y });
    expect(runtime.construction.getOrder('independent-replacement')?.state).toBe('approved');
    finish(runtime);
    runtime = reload(runtime, legacy);
    const replacement = runtime.placedObjects.objectAt(original.location)!;
    expect(replacement).toMatchObject({ objectId: definitionId === 'bed-wooden' ? 'object.bed' : 'object.toilet', orientation: 0 });
    const balance = runtime.treasury.balanceMinorUnits;
    send(runtime, { type: 'CancelBuildOrder', orderId: original.id, expectedRevision: runtime.construction.revisionOf(original.id) });
    expect(runtime.construction.getOrder('independent-replacement')?.state).toBe('completed');
    expect(runtime.treasury.balanceMinorUnits).toBe(balance);
    expect(runtime.construction.allOrders().filter(order => order.state === 'cancelled')).toHaveLength(20);
    expect(runtime.prisoners.roomInstances.getSnapshot()).toHaveLength(0);
    expect(runtime.placedObjects.objectAt(original.location)).toEqual(replacement);
    runtime = reload(runtime);
    expect(runtime.placedObjects.objectAt(original.location)).toEqual(replacement);
  });
it.each(([0, 1] as const).flatMap(quarterTurns => [false, true].map(legacy => ({ quarterTurns, legacy }))))
  ('Undo of the genuine newer bed still removes it, turn=$quarterTurns legacy=$legacy', ({ quarterTurns, legacy }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns });
    finish(runtime);
    const original = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden')!;
    send(runtime, { type: 'RemoveObject', x: original.location.x, y: original.location.y });
    send(runtime, { type: 'PlaceObject', orderId: 'newest-bed', definitionId: 'bed-wooden', x: original.location.x, y: original.location.y });
    finish(runtime);
    runtime = reload(runtime, legacy);
    expect(runtime.placedObjects.objectAt(original.location)?.objectId).toBe('object.bed');
    send(runtime, { type: 'Undo' });
    expect(runtime.construction.getOrder('newest-bed')?.state).toBe('cancelled');
    expect(runtime.construction.getOrder(original.id)?.state).toBe('completed');
    expect(runtime.placedObjects.objectAt(original.location)).toBeUndefined();
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(1);
    expect(runtime.prisoners.roomInstances.getSnapshot()).toHaveLength(1);
  });


it.each(([0, 1] as const).flatMap(quarterTurns => [false, true].flatMap(legacy =>
  ['CancelBuildOrder', 'Undo', 'RemoveWall'].map(entry => ({ quarterTurns, legacy, entry })))))
  ('unknown V7 object ownership atomically refuses $entry, legacy=$legacy turn=$quarterTurns', ({ quarterTurns, legacy, entry }) => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns });
    finish(runtime);
    const bed = runtime.construction.allOrders().find(order => order.definitionId === 'bed-wooden')!;
    const door = runtime.construction.allOrders().find(order => order.definitionId === 'door-wooden')!;
    runtime = reload(runtime, legacy, true);
    expect(runtime.placedObjects.getSnapshot().every(object => object.sourceOrderId === undefined)).toBe(true);
    const before = gameplay(runtime);
    const revisions = runtime.construction.allOrders().map(order => [order.id, runtime.construction.revisionOf(order.id)]);
    expect(runtime.construction.previewCancelRefundMinorUnits(bed.id)).toBe(0);
    expect(gameplay(runtime)).toEqual(before);
    if (entry === 'CancelBuildOrder') send(runtime, { type: entry, orderId: bed.id, expectedRevision: runtime.construction.revisionOf(bed.id) });
    else if (entry === 'RemoveWall') send(runtime, { type: entry, ...door.location, edge: door.edge ?? 'north' });
    else send(runtime, { type: 'Undo' });
    expect(runtime.refusals.last?.reason).toBe('construction.object-ownership-unknown');
    expect(gameplay(runtime)).toEqual(before);
    expect(runtime.construction.allOrders().map(order => [order.id, runtime.construction.revisionOf(order.id)])).toEqual(revisions);
    // The approved escape route is direct physical demolition, never ownership inference.
    for (const object of runtime.placedObjects.getSnapshot()) send(runtime, { type: 'RemoveObject', ...object.anchorTile });
    expect(runtime.placedObjects.size).toBe(0);
    send(runtime, { type: 'CancelBuildOrder', orderId: bed.id, expectedRevision: runtime.construction.revisionOf(bed.id) });
    expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
    expect(runtime.prisoners.roomInstances.getSnapshot()).toHaveLength(0);
    runtime = reload(runtime);
    expect(runtime.placedObjects.size).toBe(0);
  });

it('ordinary legacy single-order Undo retains its existing physical reversal outside a template', () => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 4, y: 4, width: 8, height: 8 });
  send(runtime, { type: 'PlaceObject', orderId: 'ordinary-legacy-bed', definitionId: 'bed-wooden', x: 5, y: 5 });
  finish(runtime);
  expect(runtime.construction.getOrder('ordinary-legacy-bed')?.state).toBe('completed');
  expect(runtime.placedObjects.size).toBe(1);
  runtime = reload(runtime, false, true);
  expect(runtime.placedObjects.objectAt({ x: tileCoordinate(5), y: tileCoordinate(5) })?.sourceOrderId).toBeUndefined();
  send(runtime, { type: 'Undo' });
  expect(runtime.construction.getOrder('ordinary-legacy-bed')?.state).toBe('cancelled');
  expect(runtime.placedObjects.size).toBe(0);
});

it('completed current owner survives encoded Load and genuine room-template Undo/Redo', () => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns: 3, mirrorX: true });
  finish(runtime);
  const original = runtime.placedObjects.getSnapshot();
  expect(original).toHaveLength(2);
  for (const object of original) {
    expect(object.sourceOrderId).toBeTruthy();
    expect(runtime.construction.getOrder(object.sourceOrderId!)?.state).toBe('completed');
  }
  runtime = reload(runtime);
  expect(runtime.placedObjects.getSnapshot()).toEqual(original);
  send(runtime, { type: 'Undo' });
  expect(runtime.placedObjects.size).toBe(0);
  runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(runtime.placedObjects.getSnapshot()).toEqual(original);
});


it.each(['missing-order', 'noncompleted-order', 'wrong-type', 'wrong-anchor', 'wrong-orientation'] as const)
  ('a saved invalid exact owner link atomically refuses template cancellation: %s', invalid => {
    let runtime = createNewSimulationRuntime(73);
    send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
    finish(runtime);
    const bundle = JSON.parse(JSON.stringify(captureSessionSnapshot(runtime)));
    const bed = bundle.construction.orders.find((order: { definitionId: string }) => order.definitionId === 'bed-wooden');
    const object = bundle.simulation.objects.placedObjects.find((entry: { objectId: string }) => entry.objectId === 'object.bed');
    if (invalid === 'missing-order') object.sourceOrderId = 'no-such-order';
    else if (invalid === 'wrong-type') object.sourceOrderId = bundle.construction.orders.find((order: { definitionId: string }) => order.definitionId === 'toilet-brick').id;
    else if (invalid === 'noncompleted-order') {
      const invalidOwner = { ...bed, id: 'cancelled-owner', state: 'cancelled' };
      bundle.construction.orders.push(invalidOwner);
      object.sourceOrderId = invalidOwner.id;
    }
    else if (invalid === 'wrong-anchor') object.anchorTile.x += 1;
    else object.orientation = 1;
    // Move only the claimed owner for the anchor case; the physical bed remains in the gesture.
    if (invalid === 'wrong-anchor') {
      object.anchorTile.x -= 1;
      const invalidOwner = { ...bed, id: 'displaced-owner', location: { ...bed.location, x: bed.location.x + 1 } };
      bundle.construction.orders.push(invalidOwner);
      object.sourceOrderId = invalidOwner.id;
    }
    const envelope = createSaveEnvelope({ gameVersion: 'test', prisonId: 'invalid-owner', revision: 1, createdAt: 0, updatedAt: 1, ...bundle });
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('owner-link fixture must validate');
    runtime = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
    const before = gameplay(runtime);
    const door = runtime.construction.allOrders().find(order => order.definitionId === 'door-wooden')!;
    send(runtime, { type: 'CancelBuildOrder', orderId: door.id, expectedRevision: runtime.construction.revisionOf(door.id) });
    expect(runtime.refusals.last?.reason).toBe('construction.object-ownership-unknown');
    expect(gameplay(runtime)).toEqual(before);
  });


it('loaded Redo whose physical completion is a no-op never steals an existing exact owner', () => {
  let runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 4, y: 4, width: 8, height: 8 });
  send(runtime, { type: 'PlaceObject', orderId: 'real-standing-owner', definitionId: 'bed-wooden', x: 5, y: 5 });
  finish(runtime);
  const physical = runtime.placedObjects.getSnapshot()[0]!;
  expect(physical.sourceOrderId).toBe('real-standing-owner');
  const bundle = JSON.parse(JSON.stringify(captureSessionSnapshot(runtime)));
  const existing = bundle.construction.orders.find((order: { id: string }) => order.id === 'real-standing-owner');
  // Explicit schema-valid loaded history counterexample, not an invented live command sequence:
  // a later cancelled order at the same anchor is eligible for Redo while another owner stands.
  bundle.construction.orders.push({ ...existing, id: 'later-no-op-redo', state: 'cancelled' });
  bundle.construction.redoStack = [['later-no-op-redo']];
  bundle.construction.currentTransaction = [];
  const envelope = createSaveEnvelope({ gameVersion: 'test', prisonId: 'no-op-redo-owner', revision: 1, createdAt: 0, updatedAt: 1, ...bundle });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('explicit loaded Redo must validate');
  runtime = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(runtime.construction.getOrder('later-no-op-redo')?.state).toBe('completed');
  expect(runtime.placedObjects.getSnapshot()).toEqual([physical]);
  runtime = reload(runtime);
  send(runtime, { type: 'Undo' });
  expect(runtime.construction.getOrder('later-no-op-redo')?.state).toBe('cancelled');
  expect(runtime.placedObjects.getSnapshot()).toEqual([physical]);
});
