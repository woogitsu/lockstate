import { expect, it } from 'vitest';
import { instantiateRoomTemplate, type AuthoredRoomTemplateId } from '../../src/content/room-template-catalog';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

const templateId = 'common-room-basic' as AuthoredRoomTemplateId;

it.each([false, true])('builds a complete Common Room from a whole-square plan after save (mirror=%s)', (mirrorX) => {
  const origin = { x: 5, y: 5 };
  const plan = instantiateRoomTemplate(templateId, origin, { mirrorX });
  expect(plan).toMatchObject({ width: 7, height: 7,
    zone: { roomId: 'room.common-room', x: 6, y: 6, width: 5, height: 5 } });
  expect(plan.doorSquares).toHaveLength(1);
  expect(plan.objects.map((object) => object.buildableId)).toEqual(Array(4).fill('bench-wooden'));
  const quote = projectRoomTemplateCost(templateId);
  expect(quote).toEqual({ orderCount: 28, materials: [
    { itemId: 'item.brick', quantity: 46 },
    { itemId: 'item.wood-plank', quantity: 9 },
  ], catalogueCostMinorUnits: 2425 });
  expect(quote.orderCount).toBe(createRoomTemplateBuildPlan(templateId, origin, mirrorX, 0).orders.length);

  const runtime = createNewSimulationRuntime(73);
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
  runtime.kernel.submitCommand('common-room', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId, origin, mirrorX,
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'test', prisonId: 'common-room', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Common Room save did not decode');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  for (let i = 0; i < 30_000; i += 1) {
    restored.kernel.step();
    if (restored.roomTemplates.snapshot().pending.length === 0 &&
        restored.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(restored.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
  expect(restored.placedObjects.getSnapshot()).toHaveLength(4);
  expect(projectRoomDetail(restored.prisoners, 'room.common-room:6:6', {
    placedObjects: restored.placedObjects,
  })?.requirementSummary.missingCapability).toBe(0);
}, 120_000);
