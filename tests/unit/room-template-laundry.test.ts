import { expect, it } from 'vitest';
import { instantiateRoomTemplate, type AuthoredRoomTemplateId } from '../../src/content/room-template-catalog';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

const templateId = 'laundry-basic' as AuthoredRoomTemplateId;

it.each([false, true])('places a complete working Laundry on full squares (mirrorX=%s)', (mirrorX) => {
  const origin = { x: 5, y: 5 };
  const plan = instantiateRoomTemplate(templateId, origin, { mirrorX });
  expect(plan).toMatchObject({ width: 6, height: 6, zone: { roomId: 'room.laundry', x: 6, y: 6, width: 4, height: 4 } });
  expect(plan.doorSquares).toHaveLength(1);
  expect(plan.objects.map((object) => object.buildableId)).toEqual(['washing-machine-brick', 'washing-machine-brick']);
  expect(projectRoomTemplateCost(templateId).orderCount).toBe(createRoomTemplateBuildPlan(templateId, origin, mirrorX, 0).orders.length);

  const runtime = createNewSimulationRuntime(73);
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
  runtime.kernel.submitCommand('laundry-0', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId, origin, mirrorX,
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'laundry-proof', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('laundry save did not decode');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, 73).runtime;
  for (let tick = 0; tick < 30_000; tick += 1) {
    restored.kernel.step();
    if (restored.roomTemplates.snapshot().pending.length === 0 &&
        restored.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(restored.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
  expect(restored.prisoners.roomInstances.getById('room.laundry:6:6')).toBeDefined();
  expect(restored.placedObjects.getSnapshot()).toHaveLength(2);
  expect(projectRoomDetail(restored.prisoners, 'room.laundry:6:6', {
    placedObjects: restored.placedObjects,
  })?.requirementSummary.missingCapability).toBe(0);
  const afterCompletion = restoreSimulationRuntime(captureSessionSnapshot(restored)).runtime;
  expect(projectRoomDetail(afterCompletion.prisoners, 'room.laundry:6:6', {
    placedObjects: afterCompletion.placedObjects,
  })?.requirementSummary.missingCapability).toBe(0);
}, 120_000);
