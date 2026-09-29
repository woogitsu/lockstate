import { expect, it } from 'vitest';
import { instantiateRoomTemplate, type AuthoredRoomTemplateId } from '../../src/content/room-template-catalog';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

const templateId = 'delivery-bay-basic' as AuthoredRoomTemplateId;

it.each([false, true])('builds a Delivery Bay with loading dock marker and clear doorway after save/load (mirror=%s)', (mirrorX) => {
  const origin = { x: 5, y: 5 };
  const plan = instantiateRoomTemplate(templateId, origin, { mirrorX });
  expect(plan).toMatchObject({ width: 6, height: 6,
    zone: { roomId: 'room.delivery-bay', x: 6, y: 6, width: 4, height: 4 } });
  expect(plan.doorSquares).toHaveLength(1);
  expect(plan.objects.map((object) => object.buildableId)).toEqual(['loading-dock-door-wooden']);
  expect(projectRoomTemplateCost(templateId)).toEqual({ orderCount: 21, materials: [
    { itemId: 'item.brick', quantity: 38 },
    { itemId: 'item.wood-plank', quantity: 4 },
  ], catalogueCostMinorUnits: 1780 });
  const runtime = createNewSimulationRuntime(74);
  expect(runtime.roomTemplates.preflight(plan)).toEqual({ ok: true });
  runtime.kernel.submitCommand('delivery-bay', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId, origin, mirrorX,
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'test', prisonId: 'delivery-bay', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Delivery Bay save did not decode');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  for (let i = 0; i < 30_000; i += 1) {
    restored.kernel.step();
    if (restored.roomTemplates.snapshot().pending.length === 0 &&
        restored.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(restored.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
  expect(restored.placedObjects.getSnapshot()).toHaveLength(1);

  expect(projectRoomDetail(restored.prisoners, 'room.delivery-bay:6:6', {
    placedObjects: restored.placedObjects,
    perimeter: { edges: restored.world, doors: restored.navigation.doors, regions: restored.navigation.getGraph() },
  })).toMatchObject({ access: 'doorway', requirementSummary: { missingCapability: 0 } });
}, 120_000);
