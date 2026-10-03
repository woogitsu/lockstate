import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import type { PlacedObject } from '../../src/simulation/objects/placed-object';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`import-conflict-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function completed(): Runtime {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  for (let tick = 0; tick < 30_000 && (runtime.roomTemplates.snapshot().pending.length > 0 ||
    runtime.construction.allOrders().some(order => order.state !== 'completed')); tick++) runtime.kernel.step();
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
  expect(runtime.construction.allOrders().every(order => order.state === 'completed')).toBe(true);
  return runtime;
}
function importRows(runtime: Runtime, placedObjects: readonly PlacedObject[]): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  // Imported save-file rows, not live state injection: this is precisely the
  // conflicting-data surface of existing #1487. Current legal commands cannot
  // mint these duplicates. Checksum/strict V8 decoding are actually exercised.
  const simulation = { ...bundle.simulation!, objects: { placedObjects } };
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(createSaveEnvelope({
    gameVersion: 'test', prisonId: 'import-conflict', revision: 1, createdAt: 0, updatedAt: 1,
    ...bundle, simulation,
  }))));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Existing imported-object V8 shape must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

it.each(['object type', 'same object orientation'] as const)
  ('accepted conflicting imported $0 rows restore independently of array order', conflict => {
    const original = completed();
    const [bed, toilet] = original.placedObjects.getSnapshot();
    expect(bed!.objectId).toBe('object.bed');
    const alternative: PlacedObject = conflict === 'object type'
      ? { ...toilet!, placedObjectId: bed!.placedObjectId, anchorTile: bed!.anchorTile }
      : { ...bed!, orientation: 1 };
    const first = importRows(original, [bed!, alternative]);
    const reversed = importRows(original, [alternative, bed!]);
    expect(first.placedObjects.getSnapshot()).toHaveLength(1);
    expect(reversed.placedObjects.getSnapshot()).toHaveLength(1);
    const firstBefore = captureSessionSnapshot(first);
    const reversedBefore = captureSessionSnapshot(reversed);
    // A real far-tile removal must also behave identically after either import.
    for (const runtime of [first, reversed]) send(runtime, { type: 'RemoveObject', x: 11, y: 12 });
    if (process.env['LOCKSTATE_IMPORT_CAPTURE'] === '1') {
      writeFileSync(`.local-import-collision/${conflict.replaceAll(' ', '-')}.json`, JSON.stringify({
        firstBefore, reversedBefore, firstAfter: captureSessionSnapshot(first), reversedAfter: captureSessionSnapshot(reversed),
      }, null, 2));
    }
    expect(reversedBefore.simulation?.objects).toEqual(firstBefore.simulation?.objects);
    expect(reversed.placedObjects.getSnapshot()).toEqual(first.placedObjects.getSnapshot());
    expect(reversed.treasury.snapshot()).toEqual(first.treasury.snapshot());
  });

it('normal completed imported rows keep real ownership and far-tile removal in either order', () => {
  const original = completed();
  const objects = original.placedObjects.getSnapshot();
  const first = importRows(original, objects);
  const reversed = importRows(original, [...objects].reverse());
  expect(first.placedObjects.getSnapshot()).toEqual(objects);
  expect(reversed.placedObjects.getSnapshot()).toEqual(objects);
  for (const runtime of [first, reversed]) send(runtime, { type: 'RemoveObject', x: 11, y: 12 });
  expect(first.placedObjects.getSnapshot()).toHaveLength(1);
  expect(reversed.placedObjects.getSnapshot()).toEqual(first.placedObjects.getSnapshot());
  expect(reversed.treasury.snapshot()).toEqual(first.treasury.snapshot());
});

it.each([false, true])('nonconflicting actual rebuild keeps existing owner policy, unknown=$0', unknown => {
  const original = completed();
  send(original, { type: 'RemoveObject', x: 11, y: 12 });
  send(original, { type: 'PlaceObject', orderId: 'real-independent-bed', definitionId: 'bed-wooden', x: 11, y: 11 });
  for (let tick = 0; tick < 3000 && original.construction.getOrder('real-independent-bed')?.state !== 'completed'; tick++) original.kernel.step();
  expect(original.construction.getOrder('real-independent-bed')?.state).toBe('completed');
  const objects = original.placedObjects.getSnapshot().map(object => {
    if (!unknown || object.objectId !== 'object.bed') return object;
    const { sourceOrderId: _source, ...legacy } = object;
    return legacy;
  });
  for (const rows of [objects, [...objects].reverse()]) {
    const runtime = importRows(original, rows);
    const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
    const wall = runtime.construction.allOrders().find(order => order.definitionId === 'wall-brick')!;
    send(runtime, { type: 'CancelBuildOrder', orderId: wall.id, expectedRevision: runtime.construction.revisionOf(wall.id)! });
    if (unknown) {
      expect(runtime.refusals.last?.reason).toBe('construction.object-ownership-unknown');
      const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
      expect(after).toEqual(before);
      send(runtime, { type: 'RemoveObject', x: 11, y: 12 });
      expect(runtime.placedObjects.getSnapshot().some(object => object.objectId === 'object.bed')).toBe(false);
    } else {
      expect(runtime.placedObjects.getSnapshot()).toHaveLength(1);
      expect(runtime.placedObjects.getSnapshot()[0]).toMatchObject({ sourceOrderId: 'real-independent-bed' });
      expect(runtime.treasury.snapshot()).toEqual(before.simulation?.economy?.treasury);
    }
  }
});

it('equal legacy/exact-owner imported rows retain atomic unknown refusal in both permutations', () => {
  const original = completed();
  const [bed, toilet] = original.placedObjects.getSnapshot();
  const { sourceOrderId: _source, ...legacyBed } = bed!;
  for (const rows of [[bed!, legacyBed, toilet!], [legacyBed, bed!, toilet!]]) {
    const runtime = importRows(original, rows);
    expect(runtime.placedObjects.getSnapshot().find(object => object.objectId === 'object.bed')?.sourceOrderId).toBeUndefined();
    const { kernel: _beforeKernel, ...before } = captureSessionSnapshot(runtime);
    const wall = runtime.construction.allOrders().find(order => order.definitionId === 'wall-brick')!;
    send(runtime, { type: 'CancelBuildOrder', orderId: wall.id, expectedRevision: runtime.construction.revisionOf(wall.id)! });
    expect(runtime.refusals.last?.reason).toBe('construction.object-ownership-unknown');
    const { kernel: _afterKernel, ...after } = captureSessionSnapshot(runtime);
    expect(after).toEqual(before);
    send(runtime, { type: 'RemoveObject', x: 11, y: 12 });
    expect(runtime.placedObjects.getSnapshot().some(object => object.objectId === 'object.bed')).toBe(false);
  }
});

it('equal type and orientation imported owners retain deterministic old-template cancellation', () => {
  const original = completed();
  const oldBed = original.placedObjects.getSnapshot().find(object => object.objectId === 'object.bed')!;
  send(original, { type: 'RemoveObject', x: 11, y: 12 });
  expect(original.placedObjects.getSnapshot()).toHaveLength(1);
  send(original, { type: 'PlaceObject', orderId: 'independent-rebuilt-bed', definitionId: 'bed-wooden', x: 11, y: 11 });
  for (let tick = 0; tick < 3000 && original.construction.getOrder('independent-rebuilt-bed')?.state !== 'completed'; tick++) original.kernel.step();
  expect(original.construction.getOrder('independent-rebuilt-bed')?.state).toBe('completed');
  const rebuiltBed = original.placedObjects.getSnapshot().find(object => object.objectId === 'object.bed')!;
  expect(rebuiltBed).toMatchObject({ orientation: 0, sourceOrderId: 'independent-rebuilt-bed' });
  expect(oldBed.orientation).toBe(rebuiltBed.orientation);
  const toilet = original.placedObjects.getSnapshot().find(object => object.objectId === 'object.toilet')!;
  // The actual old and new orders are both completed, but only the new Bed is
  // physical. A conflicting import adds the historical row: it is damaged
  // data, and array order must not decide which exact owner the loader retains.
  const first = importRows(original, [oldBed, rebuiltBed, toilet]);
  const reversed = importRows(original, [rebuiltBed, oldBed, toilet]);
  const firstBefore = captureSessionSnapshot(first);
  const reversedBefore = captureSessionSnapshot(reversed);
  for (const runtime of [first, reversed]) {
    const wall = runtime.construction.allOrders().find(order => order.definitionId === 'wall-brick')!;
    send(runtime, { type: 'CancelBuildOrder', orderId: wall.id, expectedRevision: runtime.construction.revisionOf(wall.id)! });
  }
  if (process.env['LOCKSTATE_IMPORT_CAPTURE'] === '1') {
    writeFileSync('.local-import-collision/equal-v8-owner.json', JSON.stringify({ firstBefore, reversedBefore,
      firstAfter: captureSessionSnapshot(first), reversedAfter: captureSessionSnapshot(reversed) }, null, 2));
  }
  expect(reversedBefore.simulation?.objects).toEqual(firstBefore.simulation?.objects);
  expect(reversed.placedObjects.getSnapshot()).toEqual(first.placedObjects.getSnapshot());
  expect(reversed.treasury.snapshot()).toEqual(first.treasury.snapshot());
});
