import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

it.each([false, true])('redo of an undone pending Cell plan restores the whole room obligation (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('room', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 },
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  runtime.kernel.submitCommand('undo', 1, runtime.kernel.tick, packCommand({ type: 'Undo' }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  const bundle = captureSessionSnapshot(runtime);
  expect(bundle.simulation?.roomTemplates?.undone).toHaveLength(1);
  if (restore) {
    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0', prisonId: 'room-redo-proof', revision: 1,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
      kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    });
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('room-plan redo save did not decode');
    runtime = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  }
  runtime.kernel.submitCommand('redo', 2, runtime.kernel.tick, packCommand({ type: 'Redo' }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  for (let i = 0; i < 30_000; i += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.prisoners.roomInstances.getById('room.cell:11:11')).toBeDefined();
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(2);
}, 120_000);
