import { expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { decodeSaveEnvelope, saveMigrationChain, createSaveEnvelope, type SaveEnvelopeV1, type SaveEnvelopeV4, type SaveEnvelopeV7 } from '../../src/persistence/save-schema';
import { migrateSaveEnvelopeV1ToV2, migrateSaveEnvelopeV2ToV3, migrateSaveEnvelopeV3ToV4, migrateSaveEnvelopeV4ToV5, migrateSaveEnvelopeV5ToV6, migrateSaveEnvelopeV6ToV7, migrateSaveEnvelopeV7ToV8 } from '../../src/persistence/save-migrations';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import type { JsonValue } from '../../src/shared/json';
import fresh from '../fixtures/persistence/save-v1-fresh-prison.json';
import progress from '../fixtures/persistence/save-v1-in-progress.json';
import yard from '../fixtures/persistence/save-v4-yard.json';

function historicalChain(first: SaveEnvelopeV1) {
  const v2 = migrateSaveEnvelopeV1ToV2(first);
  const v3 = migrateSaveEnvelopeV2ToV3(v2);
  const v4 = migrateSaveEnvelopeV3ToV4(v3);
  const v5 = migrateSaveEnvelopeV4ToV5(v4);
  const v6 = migrateSaveEnvelopeV5ToV6(v5);
  const v7 = migrateSaveEnvelopeV6ToV7(v6);
  return [first, v2, v3, v4, v5, v6, v7];
}
const historical = [fresh, progress].flatMap(fixture => historicalChain(fixture as unknown as SaveEnvelopeV1));
const yardV5 = migrateSaveEnvelopeV4ToV5(yard as unknown as SaveEnvelopeV4);
const yardV6 = migrateSaveEnvelopeV5ToV6(yardV5);
historical.push(yard as unknown as SaveEnvelopeV4, yardV5, yardV6, migrateSaveEnvelopeV6ToV7(yardV6));

it.each(historical.map((envelope, index) => ({ envelope, version: envelope.saveSchemaVersion, index })))
  ('V$version historical data case $index survives through V8 without guessing ownership', ({ envelope }) => {
    const input = JSON.parse(JSON.stringify(envelope));
    const before = JSON.stringify(input);
    const result = decodeSaveEnvelope(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.saveSchemaVersion).toBe(8);
    expect(result.value.prisonId).toBe(envelope.prisonId);
    expect(result.value.payload.kernel).toEqual(envelope.payload.kernel);
    expect(result.value.payload.world).toEqual(envelope.payload.world);
    expect(result.value.payload.construction).toEqual(envelope.payload.construction);
    expect(result.value.payload.simulation?.objects?.placedObjects.every(object => object.sourceOrderId === undefined) ?? true).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

it.each([yardV5, yardV6, migrateSaveEnvelopeV6ToV7(yardV6)])
  ('frozen V$saveSchemaVersion validator refuses the new field rather than silently accepting V8 data', envelope => {
    const input = JSON.parse(JSON.stringify(envelope));
    input.payload.simulation.objects = { placedObjects: [{ placedObjectId: 'object:5:5', objectId: 'object.bed', anchorTile: { x: 5, y: 5 }, orientation: 0, sourceOrderId: 'historical-owner' }] };
    input.checksum = computeSaveChecksum(input.payload);
    const ordinaryLegacy = structuredClone(input);
    delete ordinaryLegacy.payload.simulation.objects.placedObjects[0].sourceOrderId;
    ordinaryLegacy.checksum = computeSaveChecksum(ordinaryLegacy.payload);
    expect(saveMigrationChain.migrate(ordinaryLegacy, envelope.saveSchemaVersion).ok).toBe(true);
    const result = saveMigrationChain.migrate(input, envelope.saveSchemaVersion);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-shape', atVersion: envelope.saveSchemaVersion } });
  });

it('V7 to V8 preserves and independently clones live completed, undone and pending templates, objects and all systems', () => {
  const runtime = createNewSimulationRuntime(73);
  function send(command: SimulationCommand) {
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`v8-data-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  }
  function finish() {
    for (let tick = 0; tick < 30_000 && runtime.roomTemplates.snapshot().pending.length > 0; tick++) runtime.kernel.step();
    for (let tick = 0; tick < 30_000 && runtime.construction.allOrders().some(order => order.state !== 'completed' && order.state !== 'cancelled'); tick++) runtime.kernel.step();
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  }
  send({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 }, quarterTurns: 1 }); finish();
  send({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 10 }, mirrorX: true });
  send({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 20 }, quarterTurns: 3, mirrorX: true });
  send({ type: 'Undo' });
  const bundle = captureSessionSnapshot(runtime);
  const v7 = JSON.parse(JSON.stringify(createSaveEnvelope({ gameVersion: 'test', prisonId: 'v7-rich-data', revision: 7, createdAt: 2, updatedAt: 3, ...bundle })));
  v7.saveSchemaVersion = 7;
  for (const object of v7.payload.simulation.objects.placedObjects) delete object.sourceOrderId;
  v7.checksum = computeSaveChecksum(v7.payload);
  expect(v7.payload.simulation.roomTemplates.completed).toHaveLength(1);
  expect(v7.payload.simulation.roomTemplates.undone).toHaveLength(1);
  expect(v7.payload.simulation.roomTemplates.pending).toHaveLength(1);
  expect(v7.payload.simulation.objects.placedObjects).toHaveLength(2);
  const before = JSON.stringify(v7);
  const decoded = decodeSaveEnvelope(v7);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.error.message);
  expect(decoded.value.payload).toStrictEqual(v7.payload);
  const direct = migrateSaveEnvelopeV7ToV8(v7 as SaveEnvelopeV7);
  expect(direct.payload).toStrictEqual(v7.payload);
  expect(direct.payload).not.toBe(v7.payload);
  expect(direct.payload.simulation?.objects).not.toBe(v7.payload.simulation.objects);
  expect(direct.checksum).toBe(computeSaveChecksum(direct.payload as unknown as JsonValue));
  expect(JSON.stringify(v7)).toBe(before);
});

it.each(['', null, 7])('V8 refuses invalid sourceOrderId=%s while absent remains valid', sourceOrderId => {
  const runtime = createNewSimulationRuntime(73);
  const bundle = captureSessionSnapshot(runtime);
  const envelope = JSON.parse(JSON.stringify(createSaveEnvelope({ gameVersion: 'test', prisonId: 'v8-owner-shape', revision: 0, createdAt: 0, updatedAt: 0, ...bundle })));
  envelope.payload.simulation.objects.placedObjects.push({ placedObjectId: 'object:5:5', objectId: 'object.bed', anchorTile: { x: 5, y: 5 }, orientation: 0, sourceOrderId });
  envelope.checksum = computeSaveChecksum(envelope.payload);
  expect(decodeSaveEnvelope(envelope)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  delete envelope.payload.simulation.objects.placedObjects[0].sourceOrderId;
  envelope.checksum = computeSaveChecksum(envelope.payload);
  expect(decodeSaveEnvelope(envelope)).toMatchObject({ ok: true });
});
