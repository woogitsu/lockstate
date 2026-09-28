import { expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

function saveAndLoad(runtime: ReturnType<typeof createNewSimulationRuntime>) {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'kitchen-proof', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('kitchen save did not decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, 73).runtime;
}

it('quotes the exact kitchen orders and refuses an occupied tile without partial work', () => {
  const runtime = createNewSimulationRuntime(73);
  const origin = { x: 5, y: 5 };
  const plan = instantiateRoomTemplate('kitchen-basic', origin);
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
  expect(projectRoomTemplateCost('kitchen-basic').orderCount).toBe(
    createRoomTemplateBuildPlan('kitchen-basic', origin, false, 0).orders.length,
  );
  runtime.kernel.submitCommand('kitchen-0', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'kitchen-basic', origin,
  }));
  runtime.kernel.step();
  const orderCount = runtime.construction.allOrders().length;
  runtime.kernel.submitCommand('kitchen-duplicate', 1, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'kitchen-basic', origin,
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.preflight(plan)).toMatchObject({ ok: false, reason: 'structure-occupied' });
  expect(runtime.construction.allOrders()).toHaveLength(orderCount);
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
});

it('restores a pending kitchen and finishes a mechanically valid furnished room', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('kitchen-save', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'kitchen-basic', origin: { x: 5, y: 5 },
  }));
  runtime.kernel.step();
  const restored = saveAndLoad(runtime);
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(1);
  for (let tick = 0; tick < 30000; tick += 1) {
    restored.kernel.step();
    if (restored.roomTemplates.snapshot().pending.length === 0 &&
        restored.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(restored.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
  expect(restored.prisoners.roomInstances.getById('room.kitchen:6:6')).toBeDefined();
  expect(restored.placedObjects.getSnapshot()).toHaveLength(3);
  expect(projectRoomDetail(restored.prisoners, 'room.kitchen:6:6', {
    placedObjects: restored.placedObjects,
  })?.requirementSummary).toEqual({
    total: 5, objectRequirements: 3, satisfiedByCapability: 3,
    missingCapability: 0, notEvaluated: 2,
  });
});
