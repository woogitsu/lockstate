import { expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

it.each([false, true])('can build a first Cell after furnished Delivery Bay and Storage Room (restore=%s)', (restore) => {
  let runtime = createNewSimulationRuntime(73);
  const place = (sequence: number, templateId: 'storage-room-basic' | 'delivery-bay-basic' | 'cell-basic', x: number) => {
    runtime.kernel.submitCommand(`plan-${sequence}`, sequence, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId, origin: { x, y: 5 },
    }));
    runtime.kernel.step();
  };
  place(0, 'storage-room-basic', 5);
  place(1, 'delivery-bay-basic', 12);
  for (let i = 0; i < 30_000; i += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.prisoners.entityStore.maxActiveIndex).toBe(-1);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.storage-room')[0]?.objectCapabilities).toContain('item-storage');
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.delivery-bay')[0]?.objectCapabilities).toContain('delivery-access');
  if (restore) {
    const bundle = captureSessionSnapshot(runtime);
    const envelope = createSaveEnvelope({
      gameVersion: 'test', prisonId: 'delivery-bootstrap', revision: 1,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
      kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    });
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('bootstrap save did not decode');
    runtime = restoreSimulationRuntime(decoded.value.payload as unknown as typeof bundle).runtime;
  }

  place(2, 'cell-basic', 20);
  for (let i = 0; i < 30_000; i += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 &&
        runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(runtime.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')).toHaveLength(1);
  expect(runtime.jobs.allSorted()).toHaveLength(0);
}, 120_000);
